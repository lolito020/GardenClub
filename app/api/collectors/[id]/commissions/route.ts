import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/collectors/[id]/commissions
 * Obtiene el resumen de comisiones de un cobrador
 * - Total de comisiones generadas
 * - Comisiones pendientes de liquidación
 * - Comisiones pagadas
 * - Detalle de pagos pendientes
 * - Historial de liquidaciones
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const cobradorId = params.id;

    // Verificar que el cobrador existe
    const cobrador = db.data.collectors.find(c => c.id === cobradorId);
    if (!cobrador) {
      return NextResponse.json(
        { error: 'Cobrador no encontrado' },
        { status: 404 }
      );
    }

    // Obtener todos los pagos del cobrador (y calcular comisión si no está almacenada)
    const pagosDelCobrador = db.data.payments.filter(p => p.cobradorId === cobradorId);

    const pagosConComision = pagosDelCobrador.map(p => {
      // Si el pago ya tiene la comisión calculada en el registro, la usamos
      if (typeof p.comisionCobrador === 'number' && p.comisionCobrador > 0) {
        return { ...p, computedComision: p.comisionCobrador, comisionPagada: !!p.comisionPagada };
      }

      // Intentar derivar el servicio asociado buscando el movimiento de crédito que referencia este pago
      const creditMov = db.data.movements.find(m => m.refId === p.id && m.tipo === 'CREDIT');
      let serviceId: string | null = null;

      if (creditMov && Array.isArray(creditMov.allocations) && creditMov.allocations.length > 0) {
        const alloc = creditMov.allocations[0];
        const debitId = alloc.debitId || (alloc as any).debitMovementId || null;
        if (debitId) {
          const debitMov = db.data.movements.find(m => m.id === debitId);
          if (debitMov) serviceId = debitMov.refId || null;
        }
      }

      // Determinar porcentaje según reglas de negocio
      let porcentaje = 0;
      if (cobrador.tipoCobrador === 'PROFESOR') {
        porcentaje = 50;
      } else if (cobrador.tipoCobrador === 'CLUB') {
        porcentaje = 0;
      } else {
        // EXTERNO: preferir comision del servicio, sino la del cobrador
        const servicio = db.data.services.find((s: any) => s.id === serviceId);
        if (servicio && typeof servicio.comisionCobrador === 'number') {
          porcentaje = servicio.comisionCobrador;
        } else {
          porcentaje = cobrador.comisionPorDefecto || 0;
        }
      }

      const com = Math.round((p.monto * porcentaje) / 100);
      return { ...p, computedComision: com, comisionPagada: !!p.comisionPagada };
    }).filter((x: any) => x.computedComision && x.computedComision > 0);

    // Separar pagos pendientes y pagados (usando computedComision y comisionPagada)
    const pagosPendientes = pagosConComision.filter((p: any) => !p.comisionPagada);
    const pagosPagados = pagosConComision.filter((p: any) => p.comisionPagada);

    // Calcular totales (usar computedComision)
    const totalComisiones = pagosConComision.reduce((sum: number, p: any) => sum + (p.computedComision || 0), 0);
    const totalPendiente = pagosPendientes.reduce((sum: number, p: any) => sum + (p.computedComision || 0), 0);
    const totalPagado = pagosPagados.reduce((sum: number, p: any) => sum + (p.computedComision || 0), 0);

    // Enriquecer pagos pendientes con información del socio
    const pagosPendientesDetalle = pagosPendientes.map((pago: any) => {
      const member = db.data.members.find((m: any) => m.id === pago.memberId);
      return {
        id: pago.id,
        fecha: pago.fecha,
        monto: pago.monto,
        comisionCobrador: pago.computedComision || 0,
        concepto: pago.concepto,
        numeroRecibo: pago.numeroRecibo || '',
        formaPago: pago.formaPago,
        socio: member ? {
          id: member.id,
          codigo: member.codigo,
          nombres: member.nombres,
          apellidos: member.apellidos,
        } : null,
      };
    });

    // Enriquecer pagos pagados con información del socio
    const pagosPagadosDetalle = pagosPagados.map((pago: any) => {
      const member = db.data.members.find((m: any) => m.id === pago.memberId);
      return {
        id: pago.id,
        fecha: pago.fecha,
        monto: pago.monto,
        comisionCobrador: pago.computedComision || 0,
        concepto: pago.concepto,
        numeroRecibo: pago.numeroRecibo || '',
        formaPago: pago.formaPago,
        socio: member ? {
          id: member.id,
          codigo: member.codigo,
          nombres: member.nombres,
          apellidos: member.apellidos,
        } : null,
      };
    });

    // Obtener historial de liquidaciones del cobrador
    const liquidaciones = db.data.commissionPayments
      .filter(cp => cp.cobradorId === cobradorId)
      .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      .map(liq => ({
        id: liq.id,
        fecha: liq.fecha,
        monto: liq.monto,
        concepto: liq.concepto,
        formaPago: liq.formaPago,
        periodo: liq.periodo,
        numeroRecibo: liq.numeroRecibo || '',
        observaciones: liq.observaciones || '',
        cantidadPagos: liq.paymentIds?.length || 0,
      }));

    // Calcular estadísticas por mes (últimos 6 meses)
    const ahora = new Date();
    const estadisticasMensuales = [];
    
    for (let i = 5; i >= 0; i--) {
      const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const mesAnio = fecha.toISOString().slice(0, 7); // YYYY-MM
      
      const pagosDelMes = pagosConComision.filter((p: any) => p.fecha && p.fecha.startsWith(mesAnio));
      const comisionDelMes = pagosDelMes.reduce((sum: number, p: any) => sum + (p.computedComision || 0), 0);
      const liquidadoDelMes = liquidaciones
        .filter(l => l.periodo === mesAnio)
        .reduce((sum, l) => sum + l.monto, 0);

      estadisticasMensuales.push({
        periodo: mesAnio,
        mes: fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
        comisionGenerada: comisionDelMes,
        comisionLiquidada: liquidadoDelMes,
        cantidadPagos: pagosDelMes.length,
      });
    }

    const resumen = {
      cobrador: {
        id: cobrador.id,
        codigo: cobrador.codigo,
        nombres: cobrador.nombres,
        apellidos: cobrador.apellidos,
        tipoCobrador: cobrador.tipoCobrador,
        comisionPorDefecto: cobrador.comisionPorDefecto,
        formaPago: cobrador.formaPago,
        cuentaBanco: cobrador.cuentaBanco,
      },
      totales: {
        // nombres largos (existentes)
        comisionesGeneradas: totalComisiones,
        comisionesPendientes: totalPendiente,
        comisionesPagadas: totalPagado,
        // claves cortas para compatibilidad con frontend
        generados: totalComisiones,
        pendientes: totalPendiente,
        pagados: totalPagado,
        cantidadPagosPendientes: pagosPendientes.length,
        cantidadPagosPagados: pagosPagados.length,
        cantidadLiquidaciones: liquidaciones.length,
      },
      pagosPendientes: pagosPendientesDetalle,
      pagosPagados: pagosPagadosDetalle,
      liquidaciones: liquidaciones.slice(0, 10), // Últimas 10 liquidaciones
      estadisticasMensuales,
    };

    return NextResponse.json(resumen);
  } catch (error) {
    console.error('Error al obtener comisiones:', error);
    return NextResponse.json(
      { error: 'Error al obtener comisiones' },
      { status: 500 }
    );
  }
}
