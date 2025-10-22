// Endpoint: POST /api/refinancing/draft
// Crea un borrador de refinanciación


import { getDb, nextRefinancingId } from '../../../lib/db';
import { Refinancing, OriginalDebitSnapshot, RefinancingAuditEntry, RefinancingInstallment } from '../../../lib/types';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      memberId,
      originalDebitIds,
      principal,
      downPaymentPercent,
      downPaymentAmount,
      installments,
      installmentAmount,
      startDueDate,
      observations,
      approvalRequired = false,
      createdBy = 'system',
    } = body;

    // Validaciones mínimas
    if (!memberId || !Array.isArray(originalDebitIds) || originalDebitIds.length === 0) {
      return new Response(JSON.stringify({ error: 'memberId y originalDebitIds requeridos' }), { status: 400 });
    }
    if (!principal || principal <= 0) {
      return new Response(JSON.stringify({ error: 'principal inválido' }), { status: 400 });
    }
    if (!installments || installments < 1 || installments > 12) {
      return new Response(JSON.stringify({ error: 'Cantidad de cuotas inválida' }), { status: 400 });
    }
    if (!startDueDate) {
      return new Response(JSON.stringify({ error: 'Fecha de primera cuota requerida' }), { status: 400 });
    }

    const db = await getDb();
    // Buscar débitos originales
    const debits = db.data.movements.filter(m => originalDebitIds.includes(m.id) && m.memberId === memberId && m.tipo === 'DEBIT');
    if (debits.length !== originalDebitIds.length) {
      return new Response(JSON.stringify({ error: 'Algunos débitos originales no existen o no corresponden al socio' }), { status: 400 });
    }
    // Snapshot de débitos originales
    const originalDebitsSnapshot: OriginalDebitSnapshot[] = debits.map(d => ({
      id: d.id,
      monto: d.monto,
      paidAmount: d.paidAmount || 0,
      vencimiento: d.vencimiento,
      concepto: d.concepto,
      fecha: d.fecha,
    }));

  // Cronograma vacío (se calculará en el paso de cálculo)
  const schedule: RefinancingInstallment[] = [];

    // Audit trail inicial
    const now = new Date().toISOString();
    const auditTrail: RefinancingAuditEntry[] = [
      {
        timestamp: now,
        action: 'CREATED',
        userId: createdBy,
        details: 'Borrador de refinanciación creado',
      },
    ];

    // Crear ID único
    const id = await nextRefinancingId();

    const refinancing: Refinancing = {
      id,
      memberId,
      originalDebitIds,
      originalDebitsSnapshot,
      principal,
      downPaymentPercent,
      downPaymentAmount,
      installments,
      installmentAmount,
      startDueDate,
      schedule,
      status: 'DRAFT',
      approvalRequired,
      sentToBoard: false,
      auditTrail,
      observations,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    db.data.refinancings.push(refinancing);
    await db.write();

    return new Response(JSON.stringify(refinancing), { status: 201 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno' }), { status: 500 });
  }
}
