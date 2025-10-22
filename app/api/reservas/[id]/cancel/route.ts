import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import {
  deleteCreditsByReservation,
  createCancellationCreditNote,
  createPenaltyDebitAndCompensation,
  createRefundCreditNote,
  createPartialRefundDebit,
  markDebitsAsCancelled,
  createPenaltyDebitContado,
} from '@/lib/refund-helpers';

/**
 * PATCH /api/reservas/[id]/cancel
 * Cancela una reserva con control manual de reembolso (3 tipos: NINGUNO, TOTAL, PARCIAL)
 * 
 * FLUJO CONTABLE:
 * 1. Eliminar créditos originales (pagos)
 * 2. Crear nota de crédito de cancelación (siempre monto total)
 * 3A. NINGUNO: Crear débito penalización + crédito compensación (club retiene todo)
 * 3B. TOTAL: No crear movimientos adicionales (cuenta queda en cero, club no retiene nada)
 * 3C. PARCIAL: Crear débito penalización + compensación + nota crédito disponible
 * 4. Marcar débitos originales como ANULADO
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth(req, ['admin', 'caja', 'cobranzas']);
  const reservationId = params.id;
  
  const body = await req.json().catch(() => ({}));
  const {
    refundType, // 'NINGUNO' | 'TOTAL' | 'PARCIAL'
    refundAmount, // Solo para tipo PARCIAL (monto a devolver al socio)
    penaltyAmount, // Solo para tipo PARCIAL (monto que retiene el club)
    cancelReason, // Texto descriptivo del motivo
  } = body;

  // Validaciones de request body
  if (!refundType || !['NINGUNO', 'TOTAL', 'PARCIAL'].includes(refundType)) {
    return NextResponse.json(
      { msg: 'Debe especificar tipo de reembolso: NINGUNO, TOTAL o PARCIAL' },
      { status: 400 }
    );
  }

  if (refundType === 'PARCIAL') {
    if (refundAmount === undefined || penaltyAmount === undefined) {
      return NextResponse.json(
        { msg: 'Para reembolso PARCIAL debe especificar refundAmount y penaltyAmount' },
        { status: 400 }
      );
    }
    if (refundAmount < 0 || penaltyAmount < 0) {
      return NextResponse.json(
        { msg: 'Los montos deben ser mayores o iguales a cero' },
        { status: 400 }
      );
    }
  }

  const db = await getDb();
  const reservation = db.data.reservations.find(r => r.id === reservationId);

  if (!reservation) {
    return NextResponse.json({ msg: 'Reserva no encontrada' }, { status: 404 });
  }

  if (reservation.status === 'CANCELADO') {
    return NextResponse.json({ msg: 'La reserva ya está cancelada' }, { status: 400 });
  }

  if (!reservation.memberId) {
    return NextResponse.json({ msg: 'La reserva no tiene un socio asociado' }, { status: 400 });
  }

  try {
    const totalAmount = reservation.montoTotal;
    const memberId = reservation.memberId;
    const movementIds: string[] = [];

    // Obtener IDs de débitos originales
    const debitIds: string[] = [];
    if (reservation.debitMovementIds && reservation.debitMovementIds.length > 0) {
      debitIds.push(...reservation.debitMovementIds);
    } else if (reservation.debitMovementId) {
      debitIds.push(reservation.debitMovementId);
    }

    // IMPORTANTE: Calcular cuánto se pagó realmente (suma de allocations en los créditos)
    let totalPagado = 0;
    const creditMovements = db.data.movements.filter(m => 
      m.tipo === 'CREDIT' && 
      m.allocations && 
      m.allocations.some(alloc => debitIds.includes(alloc.debitId || ''))
    );
    
    for (const credit of creditMovements) {
      if (credit.allocations) {
        const allocatedToReservation = credit.allocations
          .filter(alloc => debitIds.includes(alloc.debitId || ''))
          .reduce((sum, alloc) => sum + Math.abs(alloc.amount || 0), 0);
        totalPagado += allocatedToReservation;
      }
    }

    console.log(`💰 Cancelación Reserva ${reservationId}: Total reserva=${totalAmount}, Total pagado=${totalPagado}`);
    console.log(`🔍 DEBUG: refundType=${refundType}, penaltyAmount=${penaltyAmount}, refundAmount=${refundAmount}`);

    // PASO 1: Eliminar créditos originales (pagos)
    const deletedCount = await deleteCreditsByReservation(reservationId, debitIds);

    // PASO 2: Crear nota de crédito de cancelación (siempre monto total)
    // Esta nota se vincula a los débitos originales para anularlos contablemente
    const cancellationCreditId = await createCancellationCreditNote(
      memberId,
      reservationId,
      totalAmount,
      debitIds // ⭐ Pasar debitIds para vincular
    );
    movementIds.push(cancellationCreditId);

    // PASO 3: Aplicar lógica según tipo de reembolso
    let finalRefundAmount = 0;
    let finalPenaltyAmount = 0;

    if (refundType === 'NINGUNO') {
      console.log(`🔍 DEBUG: Entrando en caso NINGUNO`);

      // CASO 4.1: Sin reembolso - Club retiene todo LO QUE SE PAGÓ
      // Solo crear débito penalización si hubo pagos
      // IMPORTANTE: NO se crea compensación en NINGÚN caso (ni pago contado ni crédito)
      // porque el club ya retiene el dinero y la NC ya balancea la cuenta
      if (totalPagado > 0) {
        console.log(`✅ NINGUNO: creando penalización por ${totalPagado} sin compensación`);
        const debitId = await createPenaltyDebitAndCompensation(
          memberId,
          reservationId,
          totalPagado,
          false // NO crear compensación
        );
        movementIds.push(debitId.debitId);
        finalPenaltyAmount = totalPagado;
      } else {
        // Si no hubo pagos, no crear movimientos adicionales
        console.log(`ℹ️ Sin reembolso pero sin pagos previos. Solo se emite nota de crédito de cancelación.`);
      }
      finalRefundAmount = 0;

    } else if (refundType === 'TOTAL') {
      // CASO 4.2: Reembolso total - Club devuelve TODO LO QUE SE PAGÓ
      // SIEMPRE crear DÉBITO de reembolso (egreso del club al socio)
      // No importa si el pago fue a crédito o al contado
      if (totalPagado > 0) {
        console.log(`✅ TOTAL: creando débito de reembolso por ${totalPagado}`);
        const refundDebitId = await createPartialRefundDebit(
          memberId,
          reservationId,
          totalPagado
        );
        movementIds.push(refundDebitId);
        finalRefundAmount = totalPagado;
      } else {
        // Si no hubo pagos, no hay nada que reembolsar
        console.log(`ℹ️ Reembolso total pero sin pagos previos. Solo se emite nota de crédito de cancelación.`);
        finalRefundAmount = 0;
      }
      finalPenaltyAmount = 0;

    } else if (refundType === 'PARCIAL') {
      // CASO 4.3: Reembolso parcial - Club retiene porción DE LO PAGADO
      // Validar que suma sea igual a LO PAGADO (no al total de la reserva)
      const sum = (refundAmount || 0) + (penaltyAmount || 0);
      
      if (totalPagado === 0) {
        return NextResponse.json(
          { msg: 'No se puede hacer reembolso parcial porque no hay pagos registrados' },
          { status: 400 }
        );
      }
      
      if (Math.abs(sum - totalPagado) > 1) { // Tolerancia de 1 Gs por redondeo
        return NextResponse.json(
          { msg: `La suma de refundAmount (${refundAmount}) + penaltyAmount (${penaltyAmount}) debe ser igual al total pagado (${totalPagado})` },
          { status: 400 }
        );
      }


      // Solo crear penalización (sin compensación) si el pago fue al contado
      if (penaltyAmount! > 0) {
        const isPagoContado = Math.abs(totalPagado - totalAmount) < 1;
        console.log(`🔍 DEBUG PARCIAL: totalPagado=${totalPagado}, totalAmount=${totalAmount}, isPagoContado=${isPagoContado}`);
        
        if (isPagoContado) {
          // Pago al contado: penalización con concepto correcto
          console.log(`✅ Pago contado: creando penalización con createPenaltyDebitContado`);
          const penaltyDebitId = await createPenaltyDebitContado(
            memberId,
            reservationId,
            penaltyAmount!
          );
          movementIds.push(penaltyDebitId);
        } else {
          // Pago con crédito: penalización SIN compensación (escenario 4)
          console.log(`✅ Pago a crédito: creando penalización SIN compensación`);
          const { debitId } = await createPenaltyDebitAndCompensation(
            memberId,
            reservationId,
            penaltyAmount!,
            false // NO crear compensación
          );
          movementIds.push(debitId);
        }
      }


      // Crear DÉBITO de reembolso (egreso al socio)
      // SIEMPRE es un débito, independientemente de si el pago fue a crédito o al contado
      if (refundAmount! > 0) {
        console.log(`✅ PARCIAL: creando débito de reembolso por ${refundAmount}`);
        const refundDebitId = await createPartialRefundDebit(
          memberId,
          reservationId,
          refundAmount!
        );
        movementIds.push(refundDebitId);
      }

      finalRefundAmount = refundAmount!;
      finalPenaltyAmount = penaltyAmount!;
    }

    // PASO 4: Marcar débitos originales como ANULADO
    if (debitIds.length > 0) {
      await markDebitsAsCancelled(reservationId, debitIds);
    }

    // PASO 5: Actualizar reserva
    const now = new Date().toISOString();
    reservation.status = 'CANCELADO';
    reservation.cancelledAt = now;
    reservation.cancelledBy = user?.email || 'system';
    reservation.cancelReason = cancelReason || 'Cancelación solicitada';
    reservation.refundType = refundType;
    reservation.refundAmount = finalRefundAmount;
    reservation.penaltyAmount = finalPenaltyAmount;
    reservation.updatedAt = now;

    if (!reservation.refundMovementIds) {
      reservation.refundMovementIds = [];
    }
    reservation.refundMovementIds.push(...movementIds);

    await db.write();

    // PASO 6: Preparar respuesta
    return NextResponse.json({
      msg: 'Reserva cancelada exitosamente',
      reservation,
      cancellationDetails: {
        refundType,
        totalAmount,
        totalPagado, // ⭐ Agregar para transparencia
        refundAmount: finalRefundAmount,
        penaltyAmount: finalPenaltyAmount,
        deletedPayments: deletedCount,
        movementsCreated: movementIds.length,
        movementIds
      }
    });

  } catch (error) {
    console.error('Error cancelando reserva:', error);
    return NextResponse.json(
      { msg: `Error al cancelar reserva: ${error instanceof Error ? error.message : 'Error desconocido'}` },
      { status: 500 }
    );
  }
}
