import { NextRequest, NextResponse } from 'next/server';

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const { principal, downPaymentPercent, installments, startDueDate } = await request.json();
    
    if (!principal || !installments || !startDueDate) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos' }, 
        { status: 400 }
      );
    }

    const downPaymentAmount = Math.round(principal * (downPaymentPercent / 100));
    const remainingAmount = principal - downPaymentAmount;
    const installmentAmount = Math.round(remainingAmount / installments);
    
    // Generar cronograma de cuotas
    const schedule = [];
    let currentDue = new Date(startDueDate);
    
    for (let i = 1; i <= installments; i++) {
      // Ajustar el monto de la última cuota para que coincida exactamente
      const amount = i === installments 
        ? remainingAmount - (installmentAmount * (installments - 1))
        : installmentAmount;
        
      schedule.push({
        number: i,
        amount: amount,
        dueDate: currentDue.toISOString().split('T')[0],
        status: 'PENDING'
      });
      
      // Siguiente cuota mensual
      currentDue = addMonths(currentDue, 1);
    }

    const calculation = {
      principal,
      downPaymentPercent,
      downPaymentAmount,
      totalInInstallments: remainingAmount,
      installmentAmount,
      installments,
      schedule,
      totalFinanced: principal,
      startDueDate
    };

    return NextResponse.json(calculation);
    
  } catch (error) {
    console.error('Error in refinancing calculation:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' }, 
      { status: 500 }
    );
  }
}