/**
 * PASO 3A (CASO SIN REEMBOLSO, pago contado): Crear débito de penalización al contado
 * Ingreso para el club, representa el monto que se retiene al socio
 * Tipo: DEBIT, Origen: AJUSTE, Status: CANCELADO
 */
export async function createPenaltyDebitContado(
  memberId: string,
  reservationId: string,
  penaltyAmount: number
): Promise<string> {
  const db = await getDb();
  const movementId = await nextMovementId();

  const penaltyDebit: Movement = {
    id: movementId,
    memberId,
    fecha: new Date().toISOString(),
    concepto: `Penalización por cancelación de Reserva #${reservationId}`,
    tipo: 'DEBIT',
    monto: Math.abs(penaltyAmount),
    origen: 'AJUSTE',
    refId: reservationId,
    observaciones: `Débito de penalización: club retiene ${penaltyAmount} Gs. por cancelación con reembolso parcial (pago contado).`,
    status: 'CANCELADO',
    paidAmount: Math.abs(penaltyAmount)
  };

  db.data.movements.push(penaltyDebit);
  await db.write();

  return movementId;
}
/**
 * PASO 3C (CASO REEMBOLSO PARCIAL): Crear débito de reembolso al socio
 * Egreso para el club, representa el pago al socio por cancelación parcial
 * Tipo: DEBIT, Origen: REEMBOLSO, Status: CANCELADO
 */
export async function createPartialRefundDebit(
  memberId: string,
  reservationId: string,
  refundAmount: number
): Promise<string> {
  const db = await getDb();
  const movementId = await nextMovementId();

  const refundDebit: Movement = {
    id: movementId,
    memberId,
    fecha: new Date().toISOString(),
    concepto: `Reembolso parcial al socio - Reserva #${reservationId}`,
    tipo: 'DEBIT',
    monto: Math.abs(refundAmount),
    origen: 'REEMBOLSO',
    refId: reservationId,
    observaciones: `Egreso por reembolso parcial de ${refundAmount} Gs. al socio por cancelación de reserva.`,
    status: 'CANCELADO', // Ya aplicado
    paidAmount: Math.abs(refundAmount)
  };

  db.data.movements.push(refundDebit);
  await db.write();

  return movementId;
}
/**
 * Helpers para gestión de cancelaciones y reembolsos de reservas
 * Sistema manual: 3 tipos de reembolso (NINGUNO, TOTAL, PARCIAL)
 */

import type { Movement } from '@/lib/db';
import { getDb, nextMovementId } from '@/lib/db';

/**
 * PASO 1: Eliminar créditos originales (pagos) asociados a una reserva
 * Busca movimientos CREDIT con allocations que apunten a los débitos de la reserva y los elimina
 */
export async function deleteCreditsByReservation(reservationId: string, debitIds: string[]): Promise<number> {
  const db = await getDb();
  let deletedCount = 0;

  // Filtrar créditos que tengan allocations apuntando a los débitos de esta reserva
  const creditsToDelete = db.data.movements.filter((m: Movement) => {
    if (m.tipo !== 'CREDIT') return false;
    if (!m.allocations || m.allocations.length === 0) return false;
    
    // Verificar si alguna allocation apunta a los débitos de la reserva
    return m.allocations.some(alloc => debitIds.includes(alloc.debitId || ''));
  });

  // Eliminar cada crédito encontrado
  for (const credit of creditsToDelete) {
    const index = db.data.movements.findIndex(m => m.id === credit.id);
    if (index !== -1) {
      db.data.movements.splice(index, 1);
      deletedCount++;
    }
  }

  await db.write();
  return deletedCount;
}

/**
 * PASO 2: Crear nota de crédito de cancelación por el monto total de la reserva
 * Siempre se emite por el monto total, independiente del tipo de reembolso
 * Tipo: CREDIT, Origen: AJUSTE (compensación contable)
 * IMPORTANTE: Esta nota de crédito se vincula a los débitos originales vía allocations
 */
export async function createCancellationCreditNote(
  memberId: string,
  reservationId: string,
  totalAmount: number,
  debitIds: string[] // ⭐ Nuevo parámetro para vincular con débitos originales
): Promise<string> {
  const db = await getDb();
  const movementId = await nextMovementId();

  // Crear allocations para vincular con los débitos originales
  // Distribuir el monto total entre los débitos proporcionalmente
  const amountPerDebit = debitIds.length > 0 ? Math.abs(totalAmount) / debitIds.length : 0;
  const allocations = debitIds.map(debitId => ({
    debitId,
    amount: amountPerDebit
  }));

  const creditNote: Movement = {
    id: movementId,
    memberId,
    fecha: new Date().toISOString(),
    concepto: `Nota de Crédito por cancelación de Reserva #${reservationId}`,
    tipo: 'CREDIT',
    monto: Math.abs(totalAmount),
    origen: 'AJUSTE',
    refId: reservationId,
    observaciones: `Nota de crédito emitida para anulación contable de reserva.`,
    status: 'CANCELADO', // Ya procesado, es compensación contable
    paidAmount: Math.abs(totalAmount),
    allocations: allocations.length > 0 ? allocations : undefined
  };

  db.data.movements.push(creditNote);
  await db.write();

  return movementId;
}

/**
 * PASO 3A (CASO SIN REEMBOLSO): Crear débito de penalización + crédito de compensación
 * Débito penalización: DEBIT origen AJUSTE (ingreso para el club)
 * Crédito compensación: CREDIT origen AJUSTE (compensa el débito para balance neutro en cuenta del socio)
 * Resultado: Club retiene el dinero, cuenta del socio queda en cero
 */
export async function createPenaltyDebitAndCompensation(
  memberId: string,
  reservationId: string,
  penaltyAmount: number,
  createCompensation: boolean = true
): Promise<{ debitId: string; creditId?: string }> {
  const db = await getDb();

  // Crear débito de penalización (ingreso para el club)
  // Status CANCELADO porque el club ya retuvo el dinero efectivamente
  const debitId = await nextMovementId();
  const penaltyDebit: Movement = {
    id: debitId,
    memberId,
    fecha: new Date().toISOString(),
    concepto: `Penalización por cancelación de Reserva #${reservationId}`,
    tipo: 'DEBIT',
    monto: Math.abs(penaltyAmount),
    origen: 'AJUSTE',
    refId: reservationId,
    observaciones: `Débito de penalización: club retiene ${penaltyAmount} Gs. por cancelación sin reembolso.`,
    status: 'CANCELADO', // Ya cobrado - club retuvo el dinero
    paidAmount: Math.abs(penaltyAmount)
  };

  db.data.movements.push(penaltyDebit);
  await db.write();

  let creditId: string | undefined = undefined;
  if (createCompensation) {
    // Crear crédito de compensación (para balancear cuenta del socio)
    creditId = await nextMovementId();
    const compensationCredit: Movement = {
      id: creditId,
      memberId,
      fecha: new Date().toISOString(),
      concepto: `Compensación de penalización - Reserva #${reservationId}`,
      tipo: 'CREDIT',
      monto: Math.abs(penaltyAmount),
      origen: 'AJUSTE',
      refId: reservationId,
      observaciones: `Crédito de compensación para balancear penalización (no disponible para socio).`,
      status: 'CANCELADO', // Ya aplicado
      paidAmount: Math.abs(penaltyAmount),
      allocations: [{
        debitId: debitId,
        amount: Math.abs(penaltyAmount)
      }]
    };

    db.data.movements.push(compensationCredit);
    await db.write();
  }

  return { debitId, creditId };
}

/**
 * PASO 3B (CASO REEMBOLSO PARCIAL): Crear nota de crédito disponible
 * Crédito disponible para que el socio use en futuros servicios
 * Tipo: CREDIT, Origen: NOTA_CREDITO, Status: PENDIENTE
 */
export async function createRefundCreditNote(
  memberId: string,
  reservationId: string,
  refundAmount: number
): Promise<string> {
  const db = await getDb();
  const movementId = await nextMovementId();

  const refundCredit: Movement = {
    id: movementId,
    memberId,
    fecha: new Date().toISOString(),
    concepto: `Crédito por reembolso parcial - Reserva #${reservationId}`,
    tipo: 'CREDIT',
    monto: Math.abs(refundAmount),
    origen: 'NOTA_CREDITO',
    refId: reservationId,
    observaciones: `Crédito disponible de ${refundAmount} Gs. por cancelación con reembolso parcial.`,
    status: 'PENDIENTE', // Disponible para uso futuro
    paidAmount: 0
  };

  db.data.movements.push(refundCredit);
  await db.write();

  return movementId;
}

/**
 * UTILIDAD: Marcar débitos originales de reserva como anulados
 * Los débitos originales se marcan ANULADO y se actualiza su paidAmount
 * para reflejar que fueron "pagados" por la nota de crédito de cancelación
 */
export async function markDebitsAsCancelled(reservationId: string, debitIds: string[]): Promise<void> {
  const db = await getDb();

  for (const debitId of debitIds) {
    const debit = db.data.movements.find(m => m.id === debitId);
    if (debit && debit.tipo === 'DEBIT') {
      debit.status = 'ANULADO';
      debit.paidAmount = debit.monto; // ⭐ Marcar como "pagado" por la nota de crédito
      debit.cancelledDueToReservationId = reservationId;
      debit.observaciones = (debit.observaciones || '') + ` | Anulado por cancelación de Reserva #${reservationId} el ${new Date().toISOString().split('T')[0]}`;
    }
  }

  await db.write();
}

/**
 * UTILIDAD: Calcular saldo de crédito disponible de un socio
 * Suma notas de crédito PENDIENTES (disponibles para uso)
 */
export async function getMemberCreditBalance(memberId: string): Promise<number> {
  const db = await getDb();
  
  const creditNotes = db.data.movements.filter(
    (m: Movement) => 
      m.memberId === memberId && 
      m.tipo === 'CREDIT' && 
      m.origen === 'NOTA_CREDITO' && 
      m.status === 'PENDIENTE'
  );

  return creditNotes.reduce((sum, note) => sum + (note.monto || 0), 0);
}
