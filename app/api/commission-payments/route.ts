import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/commission-payments
 * Lista todas las liquidaciones de comisiones con filtros opcionales
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const { searchParams } = new URL(req.url);
    
    const cobradorId = searchParams.get('cobradorId');
    const periodo = searchParams.get('periodo'); // YYYY-MM
    const fechaDesde = searchParams.get('fechaDesde');
    const fechaHasta = searchParams.get('fechaHasta');

    let liquidaciones = [...db.data.commissionPayments];

    // Aplicar filtros
    if (cobradorId) {
      liquidaciones = liquidaciones.filter(l => l.cobradorId === cobradorId);
    }

    if (periodo) {
      liquidaciones = liquidaciones.filter(l => l.periodo === periodo);
    }

    if (fechaDesde) {
      liquidaciones = liquidaciones.filter(l => l.fecha >= fechaDesde);
    }

    if (fechaHasta) {
      liquidaciones = liquidaciones.filter(l => l.fecha <= fechaHasta);
    }

    // Enriquecer con información del cobrador
    const liquidacionesEnriquecidas = liquidaciones
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .map(liq => {
        const cobrador = db.data.collectors.find(c => c.id === liq.cobradorId);
        return {
          ...liq,
          cobradorNombre: cobrador 
            ? `${cobrador.nombres} ${cobrador.apellidos}` 
            : 'Cobrador desconocido',
          cobradorCodigo: cobrador?.codigo || '',
          cantidadPagos: liq.paymentIds?.length || 0,
        };
      });

    return NextResponse.json(liquidacionesEnriquecidas);
  } catch (error) {
    console.error('Error al obtener liquidaciones:', error);
    return NextResponse.json(
      { error: 'Error al obtener liquidaciones' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/commission-payments
 * Crea una nueva liquidación de comisiones
 * Body: {
 *   cobradorId: string,
 *   paymentIds: string[],
 *   formaPago: FormaPago,
 *   fecha: string (opcional, por defecto hoy),
 *   numeroRecibo?: string,
 *   observaciones?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const body = await req.json();

    const {
      cobradorId,
      paymentIds,
      formaPago,
      fecha,
      numeroRecibo,
      observaciones,
    } = body;

    // Validaciones básicas
    if (!cobradorId || !Array.isArray(paymentIds) || paymentIds.length === 0 || !formaPago) {
      return NextResponse.json(
        { error: 'Datos incompletos. Se requiere: cobradorId, paymentIds (array no vacío), formaPago' },
        { status: 400 }
      );
    }

    // Verificar que el cobrador existe
    const cobrador = db.data.collectors.find(c => c.id === cobradorId);
    if (!cobrador) {
      return NextResponse.json(
        { error: 'Cobrador no encontrado' },
        { status: 404 }
      );
    }

    // Verificar que todos los pagos existen y pertenecen al cobrador
    const pagos = paymentIds.map(id => {
      const pago = db.data.payments.find(p => p.id === id);
      if (!pago) {
        throw new Error(`Pago ${id} no encontrado`);
      }
      if (pago.cobradorId !== cobradorId) {
        throw new Error(`Pago ${id} no pertenece al cobrador ${cobradorId}`);
      }
      if (pago.comisionPagada) {
        throw new Error(`Pago ${id} ya fue liquidado anteriormente`);
      }

      // Calcular comisión si no está previamente calculada
      let comisionCalculada = pago.comisionCobrador || 0;
      
      if (comisionCalculada <= 0) {
        // Calcular comisión basada en allocations/movimientos y servicios
        if (pago.allocations && pago.allocations.length > 0) {
          comisionCalculada = pago.allocations.reduce((total: number, allocation: any) => {
            if (allocation.debitId) {
              const movimiento = db.data.movements.find(m => m.id === allocation.debitId);
              if (movimiento && movimiento.refId) {
                const servicio = db.data.services.find(s => s.id === movimiento.refId);
                if (servicio) {
                  const comisionRate = servicio.comisionCobrador !== undefined 
                    ? servicio.comisionCobrador 
                    : cobrador.comisionPorDefecto || 0;
                  return total + (allocation.amount * comisionRate / 100);
                }
              }
            }
            return total;
          }, 0);
        }
        
        // Si aún no hay comisión calculada, usar la comisión por defecto del cobrador
        if (comisionCalculada <= 0) {
          const comisionRate = cobrador.comisionPorDefecto || 0;
          comisionCalculada = pago.monto * comisionRate / 100;
        }
      }

      if (comisionCalculada <= 0) {
        throw new Error(`Pago ${id} no tiene comisión calculable (monto: $${pago.monto})`);
      }
      
      // Retornar pago con comisión calculada
      return {
        ...pago,
        comisionCobrador: comisionCalculada
      };
    });

    // Calcular monto total de la liquidación
    const montoTotal = pagos.reduce((sum, p) => sum + (p.comisionCobrador || 0), 0);

    // Determinar el periodo (mes/año del primer pago o fecha de liquidación)
    const fechaLiquidacion = fecha || new Date().toISOString().split('T')[0];
    const periodo = fechaLiquidacion.slice(0, 7); // YYYY-MM

    // Crear el registro de liquidación
    db.data.sequences.commission = (db.data.sequences.commission || 0) + 1;
    const commissionId = `CP-${String(db.data.sequences.commission).padStart(6, '0')}`;

    const liquidacion = {
      id: commissionId,
      cobradorId,
      fecha: fechaLiquidacion,
      monto: montoTotal,
      concepto: `Liquidación de comisiones - ${periodo} (${paymentIds.length} pago${paymentIds.length > 1 ? 's' : ''})`,
      formaPago,
      periodo,
      paymentIds,
      numeroRecibo: numeroRecibo || '',
      observaciones: observaciones || '',
    };

    // Actualizar los pagos marcándolos como liquidados y guardando la comisión calculada
    paymentIds.forEach((paymentId, index) => {
      const pagoIndex = db.data.payments.findIndex(p => p.id === paymentId);
      if (pagoIndex !== -1) {
        db.data.payments[pagoIndex].comisionPagada = true;
        db.data.payments[pagoIndex].commissionPaymentId = commissionId;
        // Guardar la comisión calculada en el pago para futuras referencias
        db.data.payments[pagoIndex].comisionCobrador = pagos[index].comisionCobrador;
      }
    });

    // Guardar la liquidación
    db.data.commissionPayments.push(liquidacion);

    // Guardar cambios
    await db.write();

    // Enriquecer respuesta con información del cobrador
    const response = {
      ...liquidacion,
      cobradorNombre: `${cobrador.nombres} ${cobrador.apellidos}`,
      cobradorCodigo: cobrador.codigo,
      cantidadPagos: paymentIds.length,
    };

    return NextResponse.json({
      success: true,
      message: 'Liquidación creada exitosamente',
      liquidacion: response,
    });
  } catch (error: any) {
    console.error('Error al crear liquidación:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear liquidación' },
      { status: 500 }
    );
  }
}
