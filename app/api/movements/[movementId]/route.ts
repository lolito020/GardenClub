import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type MovementType = 'DEBIT' | 'CREDIT';
type MovementSource = 'SERVICIO' | 'CUOTA' | 'PAGO' | 'AJUSTE';

function ensureDb(db: any) {
  db.data.movements ||= [];
}

function isValidType(t: any): t is MovementType {
  return t === 'DEBIT' || t === 'CREDIT';
}

// GET /api/movements/:movementId
export async function GET(req: NextRequest, { params }: { params: { movementId: string } }) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = await getDb();
  ensureDb(db);

  const item = db.data.movements.find(
    (m: any) => String(m.id) === String(params.movementId)
  );

  if (!item) {
    return NextResponse.json({ ok: false, msg: 'Movimiento no encontrado' }, { status: 404 });
  }

  return NextResponse.json(item);
}

// PATCH /api/movements/:movementId
export async function PATCH(req: NextRequest, { params }: { params: { movementId: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = await getDb();
  ensureDb(db);

  const idx = db.data.movements.findIndex(
    (m: any) => String(m.id) === String(params.movementId)
  );
  if (idx < 0) {
    return NextResponse.json({ ok: false, msg: 'Movimiento no encontrado' }, { status: 404 });
  }

  const current = db.data.movements[idx];

  // No permitir editar movimientos que provienen de pagos
  if (current.origen === 'PAGO') {
    return NextResponse.json({ ok: false, msg: 'No se puede editar un movimiento de origen PAGO' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const patch: any = {};

  if (body.fecha) {
    // Validar formato YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha)) {
      return NextResponse.json({ ok: false, msg: 'Fecha inválida' }, { status: 400 });
    }
    patch.fecha = body.fecha;
  }
  if (typeof body.concepto === 'string') patch.concepto = body.concepto.trim();
  if (typeof body.tipo === 'string') {
    const t = String(body.tipo).toUpperCase();
    if (!isValidType(t)) return NextResponse.json({ ok: false, msg: 'Tipo inválido' }, { status: 400 });
    patch.tipo = t;
  }
  if (body.monto != null) {
    const n = Number(body.monto);
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ ok: false, msg: 'Monto inválido' }, { status: 400 });
    patch.monto = n;
  }
  if (typeof body.observaciones === 'string') patch.observaciones = body.observaciones.trim();
  if (body.vencimiento) {
    const d = new Date(body.vencimiento + 'T00:00:00');
    if (isNaN(d.getTime())) return NextResponse.json({ ok: false, msg: 'Vencimiento inválido' }, { status: 400 });
    patch.vencimiento = d.toISOString().slice(0, 10);
  }

  db.data.movements[idx] = { ...current, ...patch };
  await db.write();

  return NextResponse.json(db.data.movements[idx]);
}

// DELETE /api/movements/:movementId
export async function DELETE(req: NextRequest, { params }: { params: { movementId: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = await getDb();
  ensureDb(db);

  const idx = db.data.movements.findIndex(
    (m: any) => String(m.id) === String(params.movementId)
  );
  if (idx < 0) {
    return NextResponse.json({ ok: false, msg: 'Movimiento no encontrado' }, { status: 404 });
  }

  const current = db.data.movements[idx];

  // No permitir eliminar movimientos que provienen de pagos
  if (current.origen === 'PAGO') {
    return NextResponse.json({ ok: false, msg: 'No se puede eliminar un movimiento de origen PAGO' }, { status: 400 });
  }

  // Si es DEBIT, buscar CREDIT relacionados (allocations) y pagos
  if (current.tipo === 'DEBIT') {
    // Buscar todos los CREDIT con allocations hacia este DEBIT
    const relatedCredits = db.data.movements.filter((m: any) =>
      m.tipo === 'CREDIT' && Array.isArray(m.allocations) && m.allocations.some((a: any) => a.debitId === current.id)
    );

    // Buscar todos los pagos con allocations hacia este DEBIT
    const relatedPayments = db.data.payments ? db.data.payments.filter((p: any) =>
      Array.isArray(p.allocations) && p.allocations.some((a: any) => a.debitId === current.id)
    ) : [];

    // Si hay pagos relacionados y no se solicita borrado en cascada, advertir
    const cascade = req.nextUrl.searchParams.get('cascade') === 'true';
    const totalRelated = relatedCredits.length + relatedPayments.length;
    
    if (totalRelated > 0 && !cascade) {
      // Combinar créditos y pagos para la respuesta
      const allRelated = [
        ...relatedCredits.map((c: any) => ({
          id: c.id,
          fecha: c.fecha,
          concepto: c.concepto,
          monto: c.monto,
          tipo: 'CREDIT'
        })),
        ...relatedPayments.map((p: any) => ({
          id: p.id,
          fecha: p.fecha,
          concepto: p.concepto,
          monto: p.monto,
          tipo: 'PAYMENT'
        }))
      ];
      
      // Agrupar por fecha + concepto + monto para mostrar pagos únicos
      const uniquePayments = new Map();
      for (const item of allRelated) {
        const key = `${item.fecha}-${item.concepto}-${item.monto}`;
        if (!uniquePayments.has(key)) {
          uniquePayments.set(key, item);
        }
      }
      
      // Devolver advertencia y lista de pagos únicos para mostrar al usuario
      return NextResponse.json({
        ok: false,
        msg: 'Este débito tiene pagos (HABER) asociados. ¿Desea eliminar también los pagos relacionados?',
        relatedCredits: Array.from(uniquePayments.values())
      }, { status: 409 });
    }

    // Si hay pagos relacionados y se solicita borrado en cascada, eliminar los CREDIT y PAYMENT relacionados
    if (totalRelated > 0 && cascade) {
      // Recopilar IDs de créditos a eliminar para evitar problemas con índices cambiantes
      const creditsToDelete: string[] = [];
      const paymentsToDelete: string[] = [];
      
      // Procesar créditos (movimientos)
      for (const credit of relatedCredits) {
        // Eliminar solo la allocation hacia este DEBIT
        if (Array.isArray(credit.allocations)) {
          credit.allocations = credit.allocations.filter((a: any) => a.debitId !== current.id);
        }
        // Si el CREDIT queda sin allocations, marcarlo para eliminación
        if (!credit.allocations || credit.allocations.length === 0) {
          creditsToDelete.push(credit.id);
        }
      }
      
      // Procesar pagos
      for (const payment of relatedPayments) {
        // Eliminar solo la allocation hacia este DEBIT
        if (Array.isArray(payment.allocations)) {
          payment.allocations = payment.allocations.filter((a: any) => a.debitId !== current.id);
        }
        // Si el pago queda sin allocations, marcarlo para eliminación
        if (!payment.allocations || payment.allocations.length === 0) {
          paymentsToDelete.push(payment.id);
        }
      }
      
      // Eliminar los créditos que quedaron sin allocations
      for (const creditId of creditsToDelete) {
        const cidx = db.data.movements.findIndex((m: any) => m.id === creditId);
        if (cidx >= 0) db.data.movements.splice(cidx, 1);
      }
      
      // Eliminar los pagos que quedaron sin allocations
      for (const paymentId of paymentsToDelete) {
        const pidx = db.data.payments ? db.data.payments.findIndex((p: any) => p.id === paymentId) : -1;
        if (pidx >= 0 && db.data.payments) db.data.payments.splice(pidx, 1);
      }
    }
  }

  // Volver a buscar el índice del movimiento original por si cambió debido a eliminaciones anteriores
  const finalIdx = db.data.movements.findIndex(
    (m: any) => String(m.id) === String(params.movementId)
  );
  if (finalIdx >= 0) {
    db.data.movements.splice(finalIdx, 1);
  }
  
  // Limpiar cualquier allocation huérfana que pueda referenciar este movimiento eliminado
  for (const movement of db.data.movements) {
    if (Array.isArray(movement.allocations)) {
      movement.allocations = movement.allocations.filter((a: any) => 
        a.debitId !== params.movementId && a.creditMovementId !== params.movementId
      );
    }
  }
  
  // También limpiar allocations huérfanas en pagos
  if (db.data.payments) {
    for (const payment of db.data.payments) {
      if (Array.isArray(payment.allocations)) {
        payment.allocations = payment.allocations.filter((a: any) => 
          a.debitId !== params.movementId && a.creditMovementId !== params.movementId
        );
      }
    }
  }
  
  await db.write();

  return NextResponse.json({ ok: true });
}
