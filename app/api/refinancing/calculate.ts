// Endpoint: POST /api/refinancing/calculate
// Calcula la proyección de cuotas y totales


import { RefinancingCalculation } from '../../../lib/types';

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      principal,
      downPaymentPercent = 0,
      installments,
      startDueDate
    } = body;

    // Validaciones mínimas
    if (!principal || principal <= 0) {
      return new Response(JSON.stringify({ error: 'principal inválido' }), { status: 400 });
    }
    if (!installments || installments < 1 || installments > 12) {
      return new Response(JSON.stringify({ error: 'Cantidad de cuotas inválida' }), { status: 400 });
    }
    if (!startDueDate) {
      return new Response(JSON.stringify({ error: 'Fecha de primera cuota requerida' }), { status: 400 });
    }

    // Cálculo de anticipo
    const downPaymentAmount = Math.round(principal * (downPaymentPercent / 100));
    const remainingAfterDownPayment = principal - downPaymentAmount;

    // Cálculo de cuotas (redondeo y ajuste de centavos)
    let baseInstallment = Math.floor(remainingAfterDownPayment / installments);
    let totalInInstallments = baseInstallment * installments;
    let adjustmentCents = remainingAfterDownPayment - totalInInstallments;

    // Distribuir el ajuste en las primeras cuotas
    const schedule = [];
    let dueDate = new Date(startDueDate);
    for (let i = 1; i <= installments; i++) {
      let amount = baseInstallment;
      if (i <= adjustmentCents) amount += 1; // Ajustar centavos
      schedule.push({
        number: i,
        dueDate: toISODate(dueDate),
        amount
      });
      // Siguiente cuota: sumar 1 mes (30 días)
      dueDate = addMonths(dueDate, 1);
    }
    totalInInstallments = schedule.reduce((sum, q) => sum + q.amount, 0);

    const result: RefinancingCalculation = {
      principal,
      downPaymentPercent,
      downPaymentAmount,
      installments,
      installmentAmount: baseInstallment,
      remainingAfterDownPayment,
      totalInInstallments,
      adjustmentCents,
      schedule
    };
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), { status: 500 });
  }
}
