// Endpoint: POST /api/refinancing/validate
// Valida los parámetros del plan de refinanciación


import { RefinancingValidationResult } from '../../../lib/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      principal,
      downPaymentPercent = 0,
      installments,
      startDueDate
    } = body;

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!principal || principal <= 0) errors.push('El monto a refinanciar debe ser mayor a 0');
    if (!installments || installments < 1 || installments > 12) errors.push('La cantidad de cuotas debe ser entre 1 y 12');
    if (downPaymentPercent < 0 || downPaymentPercent > 80) errors.push('El anticipo debe ser entre 0% y 80%');
    if (!startDueDate) errors.push('Debe indicar la fecha de la primera cuota');

    // Validar que la fecha de la primera cuota no sea anterior a hoy
    if (startDueDate) {
      const today = new Date();
      const firstDue = new Date(startDueDate);
      if (firstDue < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
        errors.push('La fecha de la primera cuota no puede ser anterior a hoy');
      }
    }

    const valid = errors.length === 0;
    const result: RefinancingValidationResult = {
      valid,
      errors,
      warnings
    };
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), { status: 500 });
  }
}
