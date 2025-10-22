import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function ensureDb(db: any) {
  db.data.members ||= [];
  db.data.payments ||= [];
  db.data.movements ||= [];
}

type MovementStatus = 'PENDIENTE' | 'PARCIAL' | 'CANCELADO';
function recalcDebitStatus(debit: any) {
  const paid = Number(debit.paidAmount || 0);
  const total = Number(debit.monto || 0);
  let status: MovementStatus = 'PENDIENTE';
  if (paid <= 0) status = 'PENDIENTE';
  else if (paid >= total) status = 'CANCELADO';
  else status = 'PARCIAL';
  debit.status = status;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = await getDb();
  ensureDb(db);

  const item = db.data.payments.find((p: any) => String(p.id) === String(params.id));
  if (!item) return NextResponse.json({ ok: false, msg: 'Pago no encontrado' }, { status: 404 });

  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = await getDb();
  ensureDb(db);

  const idx = db.data.payments.findIndex((p: any) => String(p.id) === String(params.id));
  if (idx < 0) return NextResponse.json({ ok: false, msg: 'Pago no encontrado' }, { status: 404 });

  const current = db.data.payments[idx];
  const body = await req.json().catch(() => ({}));

  const patch: any = {};
  if (body.monto != null) {
    const n = Number(body.monto);
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ ok: false, msg: 'Monto inválido' }, { status: 400 });
    }
    patch.monto = n;
  }
  if (typeof body.concepto === 'string') patch.concepto = body.concepto.trim();
  if (typeof body.formaPago === 'string') patch.formaPago = body.formaPago.trim();
  if (typeof body.numeroRecibo === 'string') patch.numeroRecibo = body.numeroRecibo.trim();
  if (typeof body.observaciones === 'string') patch.observaciones = body.observaciones.trim();
  if (body.cobradorId != null) patch.cobradorId = body.cobradorId;

  if (body.fecha) {
    // Validate date format YYYY-MM-DD and use directly to avoid timezone conversion
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
      return NextResponse.json({ ok: false, msg: 'Fecha inválida' }, { status: 400 });
    }
    // Guardar la fecha con hora fija para evitar problemas de zona horaria
    patch.fecha = `${body.fecha}T12:00:00.000Z`;
  }

  // 1) Actualizar pago base
  const updated = { ...current, ...patch };
  db.data.payments[idx] = updated;

  // 2) Sincronizar movimiento CREDIT vinculado a este pago
  const mvIdx = db.data.movements.findIndex(
    (m: any) => m.origen === 'PAGO' && String(m.refId) === String(updated.id)
  );
  if (mvIdx >= 0) {
    const mv = db.data.movements[mvIdx];
    db.data.movements[mvIdx] = {
      ...mv,
      fecha: updated.fecha || mv.fecha,
      concepto:
        (updated.concepto && String(updated.concepto).trim()) ||
        `Pago${updated.formaPago ? ' ' + updated.formaPago : ''}${
          updated.numeroRecibo ? ` • Recibo ${updated.numeroRecibo}` : ''
        }`,
      monto: Number(updated.monto != null ? updated.monto : mv.monto) || 0,
    };
  }

  // 3) Re-asignación (opcional)
  const hasAllocationsField = Array.isArray(body.allocations);
  if (hasAllocationsField) {
    // a) Revertir asignaciones anteriores de este pago
    const credit = db.data.movements.find(
      (m: any) => m.origen === 'PAGO' && String(m.refId) === String(updated.id)
    );
    const prevAllocs = credit?.allocations || updated.allocations || [];
    for (const a of prevAllocs) {
      const debit = db.data.movements.find((m: any) => m.id === a.debitId);
      if (!debit) continue;
      debit.paidAmount = Math.max(0, Number(debit.paidAmount || 0) - Number(a.amount || 0));
      if (Array.isArray(debit.allocations)) {
        debit.allocations = debit.allocations.filter((x: any) => !(String(x.paymentId) === String(updated.id)));
      }
      recalcDebitStatus(debit);
    }
    if (credit) credit.allocations = [];

    // b) Aplicar nuevas
    const newAllocs: Array<{ debitId: string; amount: number }> = body.allocations || [];
    for (const a of newAllocs) {
      const debit = db.data.movements.find((m: any) => m.id === a.debitId);
      if (!debit) {
        return NextResponse.json({ ok: false, msg: `Débito ${a.debitId} no existe` }, { status: 400 });
      }
      if (debit.memberId !== updated.memberId || debit.tipo !== 'DEBIT') {
        return NextResponse.json({ ok: false, msg: `Débito inválido para este socio` }, { status: 400 });
      }
      const amt = Number(a.amount) || 0;
      if (!(amt > 0)) continue;

      const already = Number(debit.paidAmount || 0);
      const pending = Math.max(0, Number(debit.monto || 0) - already);
      const apply = Math.min(amt, pending);
      if (apply <= 0) continue;

      debit.paidAmount = already + apply;
      debit.allocations ||= [];
      debit.allocations.push({
        paymentId: updated.id,
        creditMovementId: credit?.id || '',
        amount: apply,
      });
      recalcDebitStatus(debit);

      if (credit) {
        credit.allocations ||= [];
        credit.allocations.push({ debitId: debit.id, amount: apply });
      }
    }
    updated.allocations = (credit?.allocations || []).map((x: any) => ({ ...x }));

    // Si cambió el monto del pago, ya quedó sincronizado en el movimiento arriba (mvIdx)
  }

  await db.write();
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = await getDb();
  ensureDb(db);

  const idx = db.data.payments.findIndex((p: any) => String(p.id) === String(params.id));
  if (idx < 0) return NextResponse.json({ ok: false, msg: 'Pago no encontrado' }, { status: 404 });

  const payment = db.data.payments[idx];

  // Revertir asignaciones
  const credit = db.data.movements.find(
    (m: any) => m.origen === 'PAGO' && String(m.refId) === String(payment.id)
  );
  const prevAllocs = credit?.allocations || payment.allocations || [];

  for (const a of prevAllocs) {
    const debit = db.data.movements.find((m: any) => m.id === a.debitId);
    if (!debit) continue;
    debit.paidAmount = Math.max(0, Number(debit.paidAmount || 0) - Number(a.amount || 0));
    if (Array.isArray(debit.allocations)) {
      debit.allocations = debit.allocations.filter((x: any) => !(String(x.paymentId) === String(payment.id)));
    }
    recalcDebitStatus(debit);
  }

  // 1) Borrar pago
  db.data.payments.splice(idx, 1);

  // 2) Borrar movimiento HABER del pago
  db.data.movements = db.data.movements.filter(
    (m: any) => !(m.origen === 'PAGO' && String(m.refId) === String(payment.id))
  );

  await db.write();
  return NextResponse.json({ ok: true });
}
