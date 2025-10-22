import { NextRequest, NextResponse } from 'next/server';
import { getDb, nextPaymentId } from '@/lib/db';
import { nanoid } from 'nanoid';
import { requireAuth } from '@/lib/auth';
import { getLocalDateString } from '@/lib/timezone-config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function ensureDbArrays(db: any) {
  db.data.members ||= [];
  db.data.collectors ||= [];
  db.data.payments ||= [];
  db.data.movements ||= [];
}

type MovementStatus = 'PENDIENTE' | 'PARCIAL' | 'CANCELADO';

function recalcDebitStatus(debit: any) {
  const paid = Number(debit.paidAmount || 0);
  const total = Number(debit.monto || 0);
  let status: MovementStatus = 'PENDIENTE';
  if (paid <= 0) status = 'PENDIENTE';
  else if (paid + 0.0001 >= total) status = 'CANCELADO';
  else status = 'PARCIAL';
  debit.status = status;
}

// Normaliza tipos legados
function normTipo(t: any) {
  const u = String(t || '').toUpperCase();
  if (u === 'DEBE') return 'DEBIT';
  if (u === 'HABER') return 'CREDIT';
  return u;
}

// GET (igual que el tuyo, enriqueciendo con nombres)
export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId');

    const db = await getDb();
    ensureDbArrays(db);

    let payments = db.data.payments;
    if (memberId) payments = payments.filter((p: any) => p.memberId === memberId);

    const enriched = payments.map((payment: any) => {
      const member = db.data.members.find((m: any) => m.id === payment.memberId);
      const collector = payment.cobradorId
        ? db.data.collectors.find((c: any) => c.id === payment.cobradorId)
        : null;
      return {
        ...payment,
        memberName: member ? `${member.nombres} ${member.apellidos}` : 'Socio no encontrado',
        memberCode: member?.codigo || 'N/A',
        cobradorName: collector ? `${collector.nombres} ${collector.apellidos}` : null,
      };
    });

    enriched.sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
    return NextResponse.json(enriched);
  } catch (error) {
    console.error('Error loading payments:', error);
    return NextResponse.json({ ok: false, msg: 'Error al cargar pagos' }, { status: 500 });
  }
}

// POST con allocations
export async function POST(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const db = await getDb();
    ensureDbArrays(db);
    const body = await req.json();

    const member = db.data.members.find((m: any) => String(m.id) === String(body.memberId));
    if (!member) {
      return NextResponse.json({ ok: false, msg: 'Socio no encontrado' }, { status: 400 });
    }
    if (body.cobradorId) {
      const collector = db.data.collectors.find((c: any) => String(c.id) === String(body.cobradorId));
      if (!collector) {
        return NextResponse.json({ ok: false, msg: 'Cobrador no encontrado' }, { status: 400 });
      }
    }

    const paymentId = await nextPaymentId();
    // Procesar fecha para guardar como 'YYYY-MM-DDT12:00:00.000Z'
    let fechaRaw = body.fecha || getLocalDateString();
    let fechaISO = fechaRaw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
      // Si es solo fecha, convertir a ISO con mediodía
      fechaISO = `${fechaRaw}T12:00:00.000Z`;
    }

    // === CALCULAR COMISIÓN AUTOMÁTICAMENTE ===
    let comisionCobrador = 0;
    if (body.cobradorId) {
      const cobrador = db.data.collectors.find(c => c.id === String(body.cobradorId));
      if (cobrador) {
        if (cobrador.tipoCobrador === 'PROFESOR') {
          // Profesores: 50% fijo del monto
          comisionCobrador = Number(body.monto) * 0.5;
        } else if (cobrador.tipoCobrador === 'EXTERNO') {
          // Externos: buscar comisión del servicio o usar comisión por defecto del cobrador
          const servicio = db.data.services.find(s => 
            body.concepto && body.concepto.toLowerCase().includes(s.nombre.toLowerCase())
          );
          
          let porcentaje = 0;
          if (servicio && servicio.comisionCobrador) {
            // Prioridad 1: Comisión específica del servicio
            porcentaje = servicio.comisionCobrador;
          } else if (cobrador.comisionPorDefecto) {
            // Prioridad 2: Comisión por defecto del cobrador
            porcentaje = cobrador.comisionPorDefecto;
          }
          
          comisionCobrador = (Number(body.monto) * porcentaje) / 100;
        }
        // Si es CLUB, comisionCobrador = 0 (sin comisión)
      }
    }

    const payment = {
      id: paymentId,
      memberId: String(body.memberId),
      fecha: fechaISO,
      monto: Number(body.monto) || 0,
      concepto: body.concepto || '',
      formaPago: body.formaPago || 'efectivo',
      cobradorId: body.cobradorId ? String(body.cobradorId) : '',
      comisionCobrador: Math.round(comisionCobrador * 100) / 100, // Redondear a 2 decimales
      comisionPagada: false, // Inicialmente no está pagada
      observaciones: body.observaciones || '',
      numeroRecibo: body.numeroRecibo || '',
      allocations: Array.isArray(body.allocations) ? body.allocations : [],
    };

    if (!(payment.monto > 0) || !payment.concepto) {
      return NextResponse.json({ ok: false, msg: 'Monto y Concepto son obligatorios' }, { status: 400 });
    }

    // 1) Guardar pago
    db.data.payments.push(payment);

    // 2) Crear movimiento HABER vinculado al pago
    const concepto =
      (payment.concepto && String(payment.concepto).trim()) ||
      `Pago${payment.formaPago ? ' ' + payment.formaPago : ''}${payment.numeroRecibo ? ` • Recibo ${payment.numeroRecibo}` : ''}`;

    const creditMovement = {
      id: nanoid(),
      memberId: payment.memberId,
      fecha: payment.fecha, // Mantener fecha como string sin conversión UTC
      concepto,
      tipo: 'CREDIT' as const,
      monto: payment.monto,
      origen: 'PAGO' as const,
      refId: String(payment.id),
      allocations: [] as Array<{ debitId: string; amount: number }>,
    };
    db.data.movements.push(creditMovement);

    // 3) Aplicar allocations (opcional)
    let allocatedSum = 0;
    if (Array.isArray(payment.allocations) && payment.allocations.length > 0) {
      for (const a of payment.allocations) {
        const debit = db.data.movements.find((m: any) => String(m.id) === String(a.debitId));
        if (!debit) {
          return NextResponse.json({ ok: false, msg: `Débito ${a.debitId} no existe` }, { status: 400 });
        }

        // === VALIDACIONES MEJORADAS ===
        if (String(debit.memberId) !== String(payment.memberId)) {
          return NextResponse.json({ ok: false, msg: 'Débito inválido para este socio' }, { status: 400 });
        }
        const tipo = normTipo(debit.tipo);
        if (tipo !== 'DEBIT') {
          return NextResponse.json({ ok: false, msg: 'Solo se puede asignar a débitos' }, { status: 400 });
        }

        const amt = Number(a.amount) || 0;
        if (!(amt > 0)) continue;

        const already = Number(debit.paidAmount || 0);
        const pending = Math.max(0, Number(debit.monto || 0) - already);
        const apply = Math.min(amt, pending);
        if (apply <= 0) continue;

        // Update debit
        debit.paidAmount = Math.round((already + apply) * 100) / 100;
        debit.allocations ||= [];
        debit.allocations.push({
          paymentId: payment.id,
          creditMovementId: creditMovement.id,
          amount: apply,
        });
        recalcDebitStatus(debit);

        // Track en el movimiento de haber del pago
        creditMovement.allocations.push({ debitId: String(debit.id), amount: apply });
        allocatedSum += apply;
      }
      // Guardar allocations normalizadas en el pago
      payment.allocations = [...creditMovement.allocations];
    }

    // === Sincronizar schedule de refinanciaciones activas del socio ===
    const refinancings = (db.data.refinancings || []).filter((r: any) => r.memberId === payment.memberId && r.status === 'ACTIVA');
    for (const refinancing of refinancings) {
      let changed = false;
      for (const installment of refinancing.schedule) {
        // Buscar el movimiento DEBIT correspondiente a la cuota
        let debit = null;
        if (installment.debitMovementId) {
          debit = db.data.movements.find((m: any) => m.id === installment.debitMovementId);
        }
        // Si no hay debitMovementId, intentar inferirlo por refinancingId y número de cuota
        if (!debit) {
          debit = db.data.movements.find((m: any) => m.refinancingId === refinancing.id && m.installmentNumber === installment.number && m.tipo === 'DEBIT');
          if (debit && !installment.debitMovementId) {
            installment.debitMovementId = debit.id;
            changed = true;
          }
        }
        if (!debit) continue;
        // Actualizar paidAmount y status según el movimiento DEBIT real
        const paid = Number(debit.paidAmount || 0);
        const total = Number(debit.monto || 0);
        let newStatus: typeof installment.status = 'PENDIENTE';
        if (paid <= 0) newStatus = 'PENDIENTE';
        else if (paid + 0.0001 >= total) newStatus = 'PAGADA';
        else newStatus = 'PARCIAL';
        if (installment.paidAmount !== paid || installment.status !== newStatus) {
          installment.paidAmount = paid;
          installment.status = newStatus as typeof installment.status;
          changed = true;
        }
      }
      if (changed) {
        refinancing.updatedAt = new Date().toISOString();
      }
    }

    // === Actualizar fechas de suscripciones activas cuando se registra un pago ===
    db.data.memberSubscriptions = db.data.memberSubscriptions || [];
    db.data.services = db.data.services || [];
    
    // Obtener los débitos pagados para identificar servicios
    const debitIds = payment.allocations?.map((a: any) => a.debitId) || [];
    const paidDebits = db.data.movements.filter((m: any) => debitIds.includes(m.id));
    
    // Para cada débito pagado, buscar si corresponde a una suscripción activa
    for (const debit of paidDebits) {
      // Intentar identificar el servicio del débito
      let serviceId = null;
      
      // Opción 1: El débito tiene serviceId directo
      if ((debit as any).serviceId) {
        serviceId = (debit as any).serviceId;
      } 
      // Opción 2: Buscar por concepto en los servicios
      else if (debit.concepto) {
        const service = db.data.services.find((s: any) => 
          debit.concepto.toLowerCase().includes(s.nombre.toLowerCase())
        );
        if (service) {
          serviceId = service.id;
        }
      }
      
      if (!serviceId) continue;
      
      // Buscar suscripción activa del socio para este servicio
      const activeSubscriptions = db.data.memberSubscriptions.filter((sub: any) => 
        sub.memberId === payment.memberId &&
        sub.serviceId === serviceId &&
        sub.status === 'ACTIVE'
      );
      
      // Actualizar la fecha de próximo cobro
      for (const subscription of activeSubscriptions) {
        const currentNextCharge = subscription.nextChargeDate ? new Date(subscription.nextChargeDate) : new Date();
        const paymentDate = new Date(payment.fecha);
        
        // Calcular nueva fecha basada en la periodicidad
        let newNextChargeDate: Date;
        
        const periodicity = (subscription as any).periodicity;
        if (periodicity === 'MONTHLY' || periodicity === 'MENSUAL') {
          // Si el pago es después de la fecha actual de próximo cobro, usar fecha de pago + 1 mes
          // Si es antes, mantener el patrón y sumar desde la fecha actual
          if (paymentDate >= currentNextCharge) {
            newNextChargeDate = new Date(paymentDate);
            newNextChargeDate.setMonth(newNextChargeDate.getMonth() + 1);
          } else {
            newNextChargeDate = new Date(currentNextCharge);
            newNextChargeDate.setMonth(newNextChargeDate.getMonth() + 1);
          }
        } else if (periodicity === 'ANNUAL' || periodicity === 'ANUAL') {
          if (paymentDate >= currentNextCharge) {
            newNextChargeDate = new Date(paymentDate);
            newNextChargeDate.setFullYear(newNextChargeDate.getFullYear() + 1);
          } else {
            newNextChargeDate = new Date(currentNextCharge);
            newNextChargeDate.setFullYear(newNextChargeDate.getFullYear() + 1);
          }
        } else if (periodicity === 'DAILY' || periodicity === 'DIARIO') {
          const days = (subscription as any).cadenceDays || 1;
          if (paymentDate >= currentNextCharge) {
            newNextChargeDate = new Date(paymentDate);
            newNextChargeDate.setDate(newNextChargeDate.getDate() + days);
          } else {
            newNextChargeDate = new Date(currentNextCharge);
            newNextChargeDate.setDate(newNextChargeDate.getDate() + days);
          }
        } else {
          continue; // No actualizar si la periodicidad no está definida
        }
        
        // Actualizar la suscripción
        subscription.nextChargeDate = newNextChargeDate.toISOString().slice(0, 10);
        (subscription as any).updatedAt = new Date().toISOString();
        
        console.log(`✅ Suscripción actualizada: ${serviceId} - Próximo cobro: ${subscription.nextChargeDate}`);
      }
    }

    await db.write();
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    console.error('Error creating payment:', error);
    return NextResponse.json({ ok: false, msg: 'Error al crear pago' }, { status: 500 });
  }
}
