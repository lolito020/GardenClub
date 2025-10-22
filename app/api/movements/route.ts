import { NextRequest, NextResponse } from 'next/server';
import { getDb, nextMovementId } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getCurrentLocalDate } from '@/lib/timezone-config';

export const dynamic = 'force-dynamic';

// ---------------- Helpers ----------------
function normalizeTipoMovimiento(t: any): 'DEBIT' | 'CREDIT' | null {
  const u = String(t || '').trim().toUpperCase();
  if (u === 'DEBIT' || u === 'DEBE') return 'DEBIT';
  if (u === 'CREDIT' || u === 'HABER') return 'CREDIT';
  return null;
}

// Acepta 'YYYY-MM-DD' o ISO y devuelve la fecha sin modificar el día
// Importante: no convierte a UTC para evitar desfases de días
function normalizeToISO(d: string | Date) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    // Mantener la fecha tal cual, sin conversión UTC
    return `${d}T12:00:00.000Z`; // Usar mediodía para evitar problemas de zona horaria
  }
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? getCurrentLocalDate().toISOString() : dt.toISOString();
}

// ---------------- GET ----------------
// GET /api/movements?memberId=...
export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId');

    const db = await getDb();
    db.data.movements ||= [];

    let list = memberId
      ? db.data.movements.filter((m: any) => m.memberId === memberId)
      : db.data.movements;

    // Aplicar filtros adicionales
    const tipo = searchParams.get('type');
    if (tipo) {
      const tipoNormalizado = normalizeTipoMovimiento(tipo);
      if (tipoNormalizado) {
        list = list.filter((m: any) => m.tipo === tipoNormalizado);
      }
    }

    return NextResponse.json(list);
  } catch (e: any) {
    console.error('Error al obtener movimientos:', e);
    return NextResponse.json({ ok: false, msg: 'Error al obtener movimientos' }, { status: 500 });
  }
}

// ---------------- POST ----------------
// Body: { memberId, fecha?, concepto, tipo: 'DEBIT'|'DEBE'|'CREDIT'|'HABER', monto, origen?, refId?, tipoServicio?, serviceId?, observaciones?, vencimiento? }
export async function POST(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  try {
    const body = await req.json();
    const {
      memberId,
      fecha,
      concepto,
      tipo,
      monto,
      origen,
      refId,
      tipoServicio,
      serviceId,
      observaciones,
      vencimiento,
    } = body || {};

    // Validaciones básicas
    if (!memberId || !concepto || tipo == null || monto == null) {
      return NextResponse.json(
        { ok: false, msg: 'Campos obligatorios: memberId, concepto, tipo, monto' },
        { status: 400 }
      );
    }

    const tipoFinal = normalizeTipoMovimiento(tipo);
    if (!tipoFinal) {
      return NextResponse.json(
        { ok: false, msg: 'Tipo inválido (usa DEBIT/DEBE o CREDIT/HABER)' },
        { status: 400 }
      );
    }

    const montoNum = Number(monto);
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      return NextResponse.json({ ok: false, msg: 'Monto debe ser > 0' }, { status: 400 });
    }

    const db = await getDb();
    db.data.movements ||= [];

    const movement: any = {
      id: await nextMovementId(),
      memberId: String(memberId),
      fecha: normalizeToISO(fecha || getCurrentLocalDate()),
      concepto: String(concepto).trim(),
      tipo: tipoFinal, // <-- normalizado a 'DEBIT' | 'CREDIT'
      monto: montoNum,
      ...(origen ? { origen: String(origen).toUpperCase() } : {}),
      ...(refId ? { refId: String(refId) } : {}),
      ...(tipoServicio ? { tipoServicio: String(tipoServicio).toUpperCase() } : {}),
      ...(serviceId ? { serviceId: String(serviceId) } : {}),
      ...(observaciones ? { observaciones: String(observaciones) } : {}),
      ...(vencimiento
        ? {
            vencimiento:
              typeof vencimiento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(vencimiento)
                ? `${vencimiento}T12:00:00.000Z` // Usar mediodía para evitar problemas de zona horaria
                : normalizeToISO(vencimiento),
          }
        : {}),
      createdAt: getCurrentLocalDate().toISOString(),
    };

    // Si es DEBIT, preparar campos para imputaciones de pago
    if (movement.tipo === 'DEBIT') {
      movement.paidAmount = Number(movement.paidAmount || 0);
      movement.status = 'PENDIENTE';
    }

    db.data.movements.push(movement);
    await db.write();

    return NextResponse.json(movement, { status: 201 });
  } catch (error) {
    console.error('Error creating movement:', error);
    return NextResponse.json({ ok: false, msg: 'Error al crear movimiento' }, { status: 500 });
  }
}
