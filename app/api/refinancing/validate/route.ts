import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { principal, downPaymentPercent, installments, startDueDate } = await request.json();

    const errors: string[] = [];
    
    // Validaciones básicas
    if (!principal || principal <= 0) {
      errors.push('El monto principal debe ser mayor a 0.');
    }
    
    if (downPaymentPercent < 0 || downPaymentPercent > 80) {
      errors.push('El anticipo debe estar entre 0% y 80%.');
    }
    
    if (!installments || installments < 1 || installments > 12) {
      errors.push('Las cuotas deben estar entre 1 y 12.');
    }
    
    if (!startDueDate) {
      errors.push('Debe especificar la fecha de la primera cuota.');
    } else {
      const dueDate = new Date(startDueDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (dueDate <= today) {
        errors.push('La fecha de la primera cuota debe ser posterior a hoy.');
      }
    }
    
    // Validaciones de negocio
    const downPaymentAmount = Math.round(principal * (downPaymentPercent / 100));
    const remainingAmount = principal - downPaymentAmount;
    
    if (installments > 1 && remainingAmount <= 0) {
      errors.push('Con ese anticipo no queda monto para financiar en cuotas.');
    }
    
    const installmentAmount = Math.round(remainingAmount / installments);
    if (installmentAmount < 10000) {
      errors.push('El monto de cada cuota debe ser al menos Gs. 10,000.');
    }

    return NextResponse.json({
      valid: errors.length === 0,
      errors,
      warnings: []
    });
    
  } catch (error) {
    console.error('Error in refinancing validation:', error);
    return NextResponse.json(
      { 
        valid: false, 
        errors: ['Error interno del servidor'],
        warnings: []
      }, 
      { status: 500 }
    );
  }
}