// Endpoint: POST /api/refinancing/execute
// Ejecuta/Confirma la refinanciación


import { getDb, nextMovementId } from '../../../lib/db';
import { Refinancing, RefinancingInstallment } from '../../../lib/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { refinancingId, executedBy = 'system' } = body;
    if (!refinancingId) {
      return new Response(JSON.stringify({ error: 'refinancingId requerido' }), { status: 400 });
    }
    const db = await getDb();
    const refinancing = db.data.refinancings.find(r => r.id === refinancingId);
    if (!refinancing) {
      return new Response(JSON.stringify({ error: 'Refinanciación no encontrada' }), { status: 404 });
    }
    if (refinancing.status !== 'DRAFT' && refinancing.status !== 'APROBADA') {
      return new Response(JSON.stringify({ error: 'Solo se puede ejecutar una refinanciación en estado DRAFT o APROBADA' }), { status: 400 });
    }

    // Marcar débitos originales como reemplazados (status = 'CANCELADO', observación)
    for (const debitId of refinancing.originalDebitIds) {
      const debit = db.data.movements.find(m => m.id === debitId);
      if (debit) {
        debit.status = 'CANCELADO';
        debit.observaciones = (debit.observaciones || '') + ' [Reemplazado por refinanciación ' + refinancing.id + ']';
      }
    }

    // Crear movimientos DEBIT para cada cuota
    const now = new Date().toISOString();
    const schedule: RefinancingInstallment[] = [];
    let dueDate = new Date(refinancing.startDueDate);
    for (let i = 1; i <= refinancing.installments; i++) {
      const movementId = await nextMovementId();
      const amount = refinancing.installmentAmount + (i <= (refinancing.schedule?.length || 0) ? (refinancing.schedule[i-1]?.amount - refinancing.installmentAmount) : 0);
      db.data.movements.push({
        id: movementId,
        memberId: refinancing.memberId,
        fecha: now,
        concepto: `Cuota #${i} - Refinanciación ${refinancing.id}`,
        tipo: 'DEBIT',
        monto: amount,
        origen: 'CUOTA',
        refId: refinancing.id,
        observaciones: 'Generado por refinanciación',
        paidAmount: 0,
        status: 'PENDIENTE',
        vencimiento: dueDate.toISOString().slice(0, 10),
      });
      schedule.push({
        number: i,
        dueDate: dueDate.toISOString().slice(0, 10),
        amount,
        status: 'PENDIENTE',
        paidAmount: 0,
        debitMovementId: movementId,
      });
      // Siguiente cuota: sumar 1 mes
      dueDate.setMonth(dueDate.getMonth() + 1);
    }

    // Si hay anticipo, crear movimiento CREDIT y asignar a cuotas
    if (refinancing.downPaymentAmount > 0) {
      const creditId = await nextMovementId();
      db.data.movements.push({
        id: creditId,
        memberId: refinancing.memberId,
        fecha: now,
        concepto: `Anticipo refinanciación ${refinancing.id}`,
        tipo: 'CREDIT',
        monto: refinancing.downPaymentAmount,
        origen: 'CUOTA',
        refId: refinancing.id,
        observaciones: 'Anticipo de plan de refinanciación',
        paidAmount: refinancing.downPaymentAmount,
        status: 'CANCELADO',
      });
      // Asignar el anticipo a las cuotas (pagos parciales)
      let remaining = refinancing.downPaymentAmount;
      for (const cuota of schedule) {
        if (remaining <= 0) break;
        const apply = Math.min(remaining, cuota.amount);
        cuota.paidAmount = apply;
        cuota.status = apply >= cuota.amount ? 'PAGADA' : 'PARCIAL';
        remaining -= apply;
      }
    }

    // Actualizar refinanciación
    refinancing.schedule = schedule;
    refinancing.status = 'ACTIVA';
    refinancing.executedAt = now;
    refinancing.updatedAt = now;
    refinancing.auditTrail.push({
      timestamp: now,
      action: 'EXECUTED',
      userId: executedBy,
      details: 'Refinanciación ejecutada y cuotas generadas',
    });

    await db.write();
    return new Response(JSON.stringify(refinancing), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), { status: 500 });
  }
}
