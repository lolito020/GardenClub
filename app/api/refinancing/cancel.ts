// Endpoint: POST /api/refinancing/cancel
// Cancela/anula la refinanciación con rollback completo de pagos


import { getDb } from '../../../lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { refinancingId, cancelledBy = 'system', preserveInterestFees = false } = body;
    if (!refinancingId) {
      return new Response(JSON.stringify({ error: 'refinancingId requerido' }), { status: 400 });
    }
    const db = await getDb();
    const refinancing = db.data.refinancings.find(r => r.id === refinancingId);
    if (!refinancing) {
      return new Response(JSON.stringify({ error: 'Refinanciación no encontrada' }), { status: 404 });
    }
    if (refinancing.status !== 'ACTIVA') {
      return new Response(JSON.stringify({ error: 'Solo se puede anular una refinanciación ACTIVA' }), { status: 400 });
    }

    const now = new Date().toISOString();
    const auditDetails: string[] = [];

    // PASO 1: Recopilar todos los créditos (pagos) aplicados a las cuotas de la refinanciación
    const creditPool: Array<{
      id: string;
      amount: number;
      paidAt: string;
      originalMovementId: string;
      allocatedAmount: number;
    }> = [];

    // Buscar todos los movimientos CREDIT que tienen allocations a cuotas de esta refinanciación
    const refinancingDebitIds = refinancing.schedule
      .map(cuota => cuota.debitMovementId)
      .filter(id => id);

    for (const movement of db.data.movements) {
      if (movement.tipo === 'CREDIT' && movement.allocations) {
        for (const allocation of movement.allocations) {
          if (allocation.debitId && refinancingDebitIds.includes(allocation.debitId)) {
            creditPool.push({
              id: `${movement.id}-${allocation.debitId}`,
              amount: allocation.amount,
              paidAt: movement.fecha || now,
              originalMovementId: movement.id,
              allocatedAmount: allocation.amount
            });
            auditDetails.push(`Crédito desasignado: ${allocation.amount} de ${movement.concepto} (${movement.fecha})`);
          }
        }
      }
    }

    // PASO 2: Desasignar todos los créditos de las cuotas de refinanciación
    for (const movement of db.data.movements) {
      if (movement.tipo === 'CREDIT' && movement.allocations) {
        movement.allocations = movement.allocations.filter(alloc => 
          !alloc.debitId || !refinancingDebitIds.includes(alloc.debitId)
        );
      }
    }

    // PASO 3: Eliminar/anular débitos de cuotas generados
    for (const cuota of refinancing.schedule) {
      if (cuota.debitMovementId) {
        const idx = db.data.movements.findIndex(m => m.id === cuota.debitMovementId);
        if (idx !== -1) {
          db.data.movements.splice(idx, 1);
          auditDetails.push(`Cuota eliminada: #${cuota.number} - ${cuota.amount}`);
        }
      }
    }

    // PASO 4: Restaurar débitos originales usando snapshot y ordenar por antigüedad
    const restoredDebits: Array<{
      movement: any;
      originalAmount: number;
      currentBalance: number;
      dueDate: string;
    }> = [];

    for (const snap of refinancing.originalDebitsSnapshot) {
      const debit = db.data.movements.find(m => m.id === snap.id);
      if (debit) {
        debit.monto = snap.monto;
        debit.paidAmount = snap.paidAmount;
        debit.vencimiento = snap.vencimiento;
        debit.concepto = snap.concepto;
        debit.status = 'PENDIENTE';
        debit.observaciones = (debit.observaciones || '').replace(/\[Reemplazado por refinanciación [^\]]+\]/g, '').trim();
        
        const currentBalance = snap.monto - snap.paidAmount;
        restoredDebits.push({
          movement: debit,
          originalAmount: snap.monto,
          currentBalance,
          dueDate: snap.vencimiento || debit.fecha || now
        });
        auditDetails.push(`Débito restaurado: ${snap.concepto} - ${snap.monto} (saldo: ${currentBalance})`);
      }
    }

    // Ordenar débitos por antigüedad (fecha de vencimiento ascendente)
    restoredDebits.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    // PASO 5: Ordenar créditos por antigüedad (fecha de pago ascendente)
    creditPool.sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());

    // PASO 6: Reasignar créditos a débitos originales por orden de antigüedad
    let totalReassigned = 0;
    let totalExcess = 0;

    for (const credit of creditPool) {
      let remainingCredit = credit.amount;
      
      // Buscar el crédito original para actualizar sus allocations
      const originalCredit = db.data.movements.find(m => m.id === credit.originalMovementId);
      if (!originalCredit) continue;

      // Aplicar el crédito a los débitos más antiguos con saldo pendiente
      for (const restoredDebit of restoredDebits) {
        if (remainingCredit <= 0) break;
        if (restoredDebit.currentBalance <= 0) continue;

        const amountToApply = Math.min(remainingCredit, restoredDebit.currentBalance);
        
        // Actualizar el débito
        restoredDebit.movement.paidAmount += amountToApply;
        restoredDebit.currentBalance -= amountToApply;
        
        if (restoredDebit.currentBalance <= 0) {
          restoredDebit.movement.status = 'CANCELADO';
        }

        // Agregar allocation al crédito original
        if (!originalCredit.allocations) originalCredit.allocations = [];
        originalCredit.allocations.push({
          debitId: restoredDebit.movement.id,
          amount: amountToApply,
          paymentId: credit.paidAt // Preservar fecha original del pago
        });

        remainingCredit -= amountToApply;
        totalReassigned += amountToApply;
        
        auditDetails.push(`Reasignado: ${amountToApply} a ${restoredDebit.movement.concepto} (fecha original: ${credit.paidAt})`);
      }

      // No es necesario actualizar availableAmount ya que no existe en el tipo Movement

      // Si queda excedente, se mantiene como saldo a favor
      if (remainingCredit > 0) {
        totalExcess += remainingCredit;
        auditDetails.push(`Excedente mantenido como saldo a favor: ${remainingCredit}`);
      }
    }

    // PASO 7: Actualizar estado de la refinanciación
    refinancing.status = 'ANULADA';
    refinancing.cancelledAt = now;
    refinancing.updatedAt = now;
    refinancing.auditTrail.push({
      timestamp: now,
      action: 'CANCELLED_WITH_ROLLBACK',
      userId: cancelledBy,
      details: `Refinanciación anulada con rollback completo. ${auditDetails.join('; ')}. Total reasignado: ${totalReassigned}. Excedente: ${totalExcess}`
    });

    await db.write();

    return new Response(JSON.stringify({
      success: true,
      refinancing,
      rollbackSummary: {
        totalCreditsProcessed: creditPool.length,
        totalReassigned,
        totalExcess,
        debitsRestored: restoredDebits.length,
        auditDetails
      }
    }), { status: 200 });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), { status: 500 });
  }
}
