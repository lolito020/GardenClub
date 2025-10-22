// app/api/members/[id]/movements/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type MovementType = 'DEBIT' | 'CREDIT';
type MovementSource = 'SERVICIO' | 'CUOTA' | 'PAGO' | 'AJUSTE';

interface Movement {
  id: string;
  memberId: string;
  fecha: string;        // ISO
  concepto: string;
  tipo: MovementType;   // 'DEBIT' = Debe, 'CREDIT' = Haber
  monto: number;        // positivo
  origen?: MovementSource;
  refId?: string;
  observaciones?: string;
  vencimiento?: string; // ISO opcional
  paidAmount?: number;  // acumulado aplicado
  status?: 'PENDIENTE' | 'PARCIAL' | 'CANCELADO' | 'REFINANCIADO';
}

// ------------- Helpers -------------
function normalizeDB(db: any) {
  db.data.movements ||= [];
}

function endOfDayISO(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

// Acepta 'YYYY-MM-DD' o ISO y devuelve ISO coherente
function normalizeToISO(d: string | Date) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return new Date(`${d}T00:00:00.000Z`).toISOString();
  }
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

function normalizeTipo(t: any): MovementType | null {
  const u = String(t || '').trim().toUpperCase();
  if (u === 'DEBIT' || u === 'DEBE') return 'DEBIT';
  if (u === 'CREDIT' || u === 'HABER') return 'CREDIT';
  return null;
}

function safeInt(v: string | null, fallback: number, max?: number) {
  const n = Number(v);
  const ok = Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  return typeof max === 'number' ? Math.min(ok, max) : ok;
}

function recalcDebitStatus(m: Movement) {
  if (m.tipo !== 'DEBIT') return;
  const paid = Number(m.paidAmount || 0);
  const total = Number(m.monto || 0);
  m.status = paid <= 0 ? 'PENDIENTE' : paid >= total ? 'CANCELADO' : 'PARCIAL';
}

// ------------- GET -------------
// /api/members/:id/movements?from=YYYY-MM-DD&to=YYYY-MM-DD&type|tipo=DEBIT|CREDIT|DEBE|HABER|ALL&q|search=...&status=PENDIENTE|PARCIAL|CANCELADO&page=1&pageSize=10
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const db = await getDb();
    normalizeDB(db);

    const url = new URL(req.url);
    const memberId = params.id;

    const from = url.searchParams.get('from'); // YYYY-MM-DD
    const to = url.searchParams.get('to');     // YYYY-MM-DD

    const typeRaw = (url.searchParams.get('type') || url.searchParams.get('tipo') || 'ALL').toUpperCase();
    const q = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim().toLowerCase();
    const statusRaw = (url.searchParams.get('status') || 'ALL').toUpperCase();

    const page = Math.max(1, safeInt(url.searchParams.get('page'), 1));
    const pageSize = safeInt(url.searchParams.get('pageSize'), 10, 100); // cap 100

    // 1) Movimientos del socio
    let rows: Movement[] = (db.data.movements as Movement[]).filter(
      (m) => m.memberId === memberId
    );
    // Excluir por defecto solo débitos refinanciados (salvo que se pida status explícito)
    if (statusRaw !== 'REFINANCIADO') {
      rows = rows.filter(m => !(m.tipo === 'DEBIT' && m.status === 'REFINANCIADO'));
    }

    // Normalizar tipos legados ('DEBE'/'HABER' -> 'DEBIT'/'CREDIT')
    rows = rows.map((m) => {
      const t = normalizeTipo(m.tipo);
      return { ...m, tipo: (t || 'DEBIT') };
    });

    // 2) Filtros por fecha / tipo / texto
    if (from) {
      const fromDate = new Date(from);
      rows = rows.filter((m) => new Date(m.fecha) >= fromDate);
    }
    if (to) {
      const toDate = endOfDayISO(new Date(to));
      rows = rows.filter((m) => new Date(m.fecha) <= toDate);
    }

    if (typeRaw !== 'ALL') {
      const typeNorm = normalizeTipo(typeRaw);
      if (typeNorm) {
        rows = rows.filter((m) => m.tipo === typeNorm);
      }
    }

    if (q) {
      rows = rows.filter((m) => {
        const c = (m.concepto || '').toLowerCase();
        const o = (m.observaciones || '').toLowerCase();
        return c.includes(q) || o.includes(q);
      });
    }

    // 3) Estado calculado para DEBIT (si tienen paidAmount)
    rows = rows.map((m) => {
      if (m.tipo === 'DEBIT') recalcDebitStatus(m);
      return m;
    });

    // 4) Filtro por status (sólo para DEBIT)
    if (statusRaw === 'PENDIENTE' || statusRaw === 'PARCIAL' || statusRaw === 'CANCELADO' || statusRaw === 'REFINANCIADO') {
      rows = rows.filter((m) => m.tipo === 'DEBIT' && m.status === statusRaw);
    }

    // 5) Orden por fecha asc
    rows.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

    // Totales (sobre el set filtrado)
    const total = rows.length;
    const totalDebe = rows.filter((r) => r.tipo === 'DEBIT').reduce((acc, r) => acc + (r.monto || 0), 0);
    const totalHaber = rows.filter((r) => r.tipo === 'CREDIT').reduce((acc, r) => acc + (r.monto || 0), 0);
    const saldo = totalDebe - totalHaber;

    // Paginación
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    const items = rows.slice(start, start + pageSize);

    return NextResponse.json({
      items,
      page: currentPage,
      pageSize,
      total,
      totalPages,
      totals: { debe: totalDebe, haber: totalHaber, saldo },
    });
  } catch (e: any) {
    console.error('GET /movements error', e);
    return NextResponse.json(
      { msg: e?.message || 'Error al obtener movimientos' },
      { status: 500 }
    );
  }
}

// ------------- POST -------------
// Body: { fecha?, concepto, tipo: 'DEBIT'|'DEBE'|'CREDIT'|'HABER', monto, origen?, refId?, observaciones?, vencimiento? }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const db = await getDb();
    normalizeDB(db);

    const memberId = params.id;
    const body = await req.json();

    const concepto = String(body.concepto || '').trim();
    const tipoFinal = normalizeTipo(body.tipo);
    const montoNum = Number(body.monto);
    const fechaISO = normalizeToISO(body.fecha || new Date());
    const origen = body.origen as MovementSource | undefined;
    const refId = body.refId ? String(body.refId) : undefined;
    const observaciones = body.observaciones ? String(body.observaciones) : undefined;

    const vencimientoISO = body.vencimiento
      ? (typeof body.vencimiento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.vencimiento)
          ? `${body.vencimiento}T00:00:00.000Z`
          : normalizeToISO(body.vencimiento))
      : undefined;

    if (!concepto || !tipoFinal || !Number.isFinite(montoNum) || montoNum <= 0) {
      return NextResponse.json(
        { msg: 'Datos inválidos. Requeridos: concepto, tipo (DEBIT/DEBE/CREDIT/HABER), monto > 0.' },
        { status: 400 }
      );
    }

    const item: Movement = {
      id: nanoid(),
      memberId,
      concepto,
      tipo: tipoFinal,     // normalizado
      monto: montoNum,
      fecha: fechaISO,
      ...(origen ? { origen } : {}),
      ...(refId ? { refId } : {}),
      ...(observaciones ? { observaciones } : {}),
      ...(vencimientoISO ? { vencimiento: vencimientoISO } : {}),
    };

    // Si es DEBIT, preparar campos para imputación posterior
    if (item.tipo === 'DEBIT') {
      item.paidAmount = Number(item.paidAmount || 0);
      recalcDebitStatus(item);
    }

    db.data.movements.push(item);
    await db.write();

    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    console.error('POST /movements error', e);
    return NextResponse.json(
      { msg: e?.message || 'Error al crear movimiento' },
      { status: 500 }
    );
  }
}
