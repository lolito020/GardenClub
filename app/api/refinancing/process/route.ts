import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function generateId(): string {
  return `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export async function POST(request: NextRequest) {
  try {
    const { 
      memberId, 
      debitIds, 
      principal, 
      installments, 
      downPaymentPercent, 
      downPaymentAmount,
      startDueDate, 
      observations 
    } = await request.json();

    if (!memberId || !debitIds || !debitIds.length || !principal) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos' }, 
        { status: 400 }
      );
    }

    const db = await getDb();
    const refinancingId = generateId();
    const now = new Date().toISOString();
    
    // Calcular cronograma
    const remainingAmount = principal - downPaymentAmount;
    const installmentAmount = Math.round(remainingAmount / installments);
    
    const schedule = [];
    let currentDue = new Date(startDueDate);
    
    for (let i = 1; i <= installments; i++) {
      const amount = i === installments 
        ? remainingAmount - (installmentAmount * (installments - 1))
        : installmentAmount;
        
      schedule.push({
        number: i,
        amount: amount,
        dueDate: currentDue.toISOString().split('T')[0],
        status: 'PENDIENTE' as any
      });
      
      currentDue = addMonths(currentDue, 1);
    }

    // Crear snapshot de débitos originales
    const originalDebitsSnapshot = [];
    for (const debitId of debitIds) {
      const movement = db.data.movements.find((m: any) => m.id === debitId);
      if (movement) {
        originalDebitsSnapshot.push({
          id: movement.id,
          monto: movement.monto,
          paidAmount: movement.paidAmount || 0,
          vencimiento: movement.vencimiento,
          concepto: movement.concepto,
          fecha: movement.fecha
        });
      }
    }

    // 1. Crear el registro de refinanciación
    const refinancing = {
      id: refinancingId,
      memberId,
      originalDebitIds: debitIds,
      originalDebitsSnapshot,
      principal,
      downPaymentPercent,
      downPaymentAmount,
      installments,
      installmentAmount,
      startDueDate,
      schedule,
      status: 'ACTIVA' as any, // Directamente ejecutada
      approvalRequired: false,
      sentToBoard: false,
      observations: observations || '',
      auditTrail: [{
        timestamp: now,
        action: 'CREATED',
        userId: 'system',
        details: `Refinanciación creada con ${installments} cuotas`
      }],
      executedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: 'system'
    };

    // 2. Marcar los débitos originales como refinanciados (reemplazados pero no borrados)
    for (const debitId of debitIds) {
      const movement = db.data.movements.find((m: any) => m.id === debitId);
      if (movement) {
        (movement as any).refinancingId = refinancingId;
        movement.status = 'REFINANCIADO' as any; // Estado específico para refinanciación
        (movement as any).updatedAt = now;
      }
    }

    // 3. Crear nuevos débitos por las cuotas del plan
    for (const installment of schedule) {
      const newMovementId = `mov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newMovement = {
        id: newMovementId,
        memberId,
        fecha: now.split('T')[0],
        concepto: `Refinanciación - Cuota ${installment.number}/${installments}`,
        tipo: 'DEBIT' as any,
        monto: installment.amount,
        vencimiento: installment.dueDate,
        paidAmount: 0,
        status: 'PENDIENTE' as any, // Establecer estado explícitamente
        observaciones: `Refinanciación ${refinancingId} - Cuota ${installment.number}`,
        ...(installment.number && { refinancingId, installmentNumber: installment.number }),
        ...(now && { createdAt: now })
      };
      
      db.data.movements.push(newMovement);
    }

    // 4. Si hay anticipo, crear un crédito
    if (downPaymentAmount > 0) {
      const downPaymentMovementId = `mov_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const downPaymentMovement = {
        id: downPaymentMovementId,
        memberId,
        fecha: now.split('T')[0],
        concepto: `Refinanciación - Anticipo (${downPaymentPercent}%)`,
        tipo: 'CREDIT' as any,
        monto: downPaymentAmount,
        observaciones: `Anticipo de refinanciación ${refinancingId}`,
        ...(refinancingId && { refinancingId }),
        ...(now && { createdAt: now })
      };
      
      db.data.movements.push(downPaymentMovement);
    }

    // 5. Guardar la refinanciación
    if (!db.data.refinancings) {
      db.data.refinancings = [];
    }
    db.data.refinancings.push(refinancing);

    // 6. Persistir cambios
    await db.write();

    return NextResponse.json({
      success: true,
      refinancingId,
      message: 'Refinanciación creada exitosamente',
      details: {
        principal,
        installments,
        downPaymentAmount,
        remainingAmount,
        schedule
      }
    });
    
  } catch (error) {
    console.error('Error processing refinancing:', error);
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido'
      }, 
      { status: 500 }
    );
  }
}