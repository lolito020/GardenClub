import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function ensureDbArrays(db: any) {
  db.data.members ||= [];
  db.data.payments ||= [];
  db.data.movements ||= [];
}

// POST /api/maintenance/reconcile-payment-movements
// Body opcional: { memberId?: string }
export async function POST(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const db = await getDb();
    ensureDbArrays(db);

    const body = await req.json().catch(() => ({}));
    const memberIdFilter = body?.memberId ? String(body.memberId) : null;

    const payments: any[] = db.data.payments.filter(
      (p: any) => (memberIdFilter ? p.memberId === memberIdFilter : true)
    );

    let created = 0;
    let skipped = 0;

    // Índice de movimientos existentes por (origen=PAGO, refId)
    const existingByRef = new Set(
      db.data.movements
        .filter((m: any) => m.origen === 'PAGO' && m.refId)
        .map((m: any) => `${m.memberId}:${m.refId}`)
    );

    for (const p of payments) {
      const key = `${p.memberId}:${p.id}`;
      if (existingByRef.has(key)) {
        skipped++;
        continue;
      }
      const concepto =
        (p.concepto && String(p.concepto).trim()) ||
        `Pago${p.formaPago ? ' ' + p.formaPago : ''}${p.numeroRecibo ? ` • Recibo ${p.numeroRecibo}` : ''}`;

      db.data.movements.push({
        id: nanoid(),
        memberId: p.memberId,
        fecha: new Date(p.fecha || new Date()).toISOString(),
        concepto,
        tipo: 'CREDIT',
        monto: Number(p.monto) || 0,
        origen: 'PAGO',
        refId: String(p.id),
      });
      existingByRef.add(key);
      created++;
    }

    await db.write();

    return NextResponse.json({
      ok: true,
      processed: payments.length,
      created,
      skipped,
      scope: memberIdFilter ? { memberId: memberIdFilter } : 'all',
    });
  } catch (e: any) {
    console.error('reconcile-payment-movements error', e);
    return NextResponse.json(
      { ok: false, msg: e?.message || 'Error en conciliación' },
      { status: 500 }
    );
  }
}
