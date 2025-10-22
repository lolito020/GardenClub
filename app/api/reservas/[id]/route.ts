import { NextRequest, NextResponse } from 'next/server';
import { getDb, Reservation, hasReservationConflict } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const r = (db.data.reservations as Reservation[]).find(x => x.id === params.id);
  if (!r) return NextResponse.json({ msg: 'No existe' }, { status: 404 });
  return NextResponse.json(r);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAuth();
  const body = await req.json();
  const db = await getDb();
  const list = db.data.reservations as Reservation[];
  const ix = list.findIndex(x => x.id === params.id);
  if (ix === -1) return NextResponse.json({ msg: 'No existe' }, { status: 404 });

  const cur = list[ix];
  const resourceId = String(body.resourceId ?? cur.resourceId);
  const start = body.start ? new Date(body.start) : new Date(cur.start);
  const end = body.end ? new Date(body.end) : new Date(cur.end);

  // Solo verificar conflictos si se cambian fecha/hora/salón y no está siendo cancelada
  if ((resourceId !== cur.resourceId || start.toISOString() !== cur.start || end.toISOString() !== cur.end) 
      && body.status !== 'CANCELADO') {
    const conflict = hasReservationConflict(db, resourceId, start.toISOString(), end.toISOString(), cur.id);
    if (conflict) return NextResponse.json({ msg: 'Conflicto de disponibilidad' }, { status: 409 });
  }

  // Actualizar campos incluyendo notas y estado
  list[ix] = { 
    ...cur, 
    ...body, 
    resourceId,
    start: start.toISOString(), 
    end: end.toISOString(),
    updatedAt: new Date().toISOString(),
    // Preservar notas si no se especifica
    notas: body.notas !== undefined ? body.notas : cur.notas
  };
  await db.write();
  return NextResponse.json(list[ix]);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAuth();
  const { searchParams } = new URL(req.url);
  const permanent = searchParams.get('permanent') === 'true';
  
  const db = await getDb();
  const list = db.data.reservations as Reservation[];
  const ix = list.findIndex(x => x.id === params.id);
  if (ix === -1) return NextResponse.json({ msg: 'No existe' }, { status: 404 });

  if (permanent) {
    // Eliminación permanente del historial
    list.splice(ix, 1);
  } else {
    // Cancelar reserva (cambiar estado)
    list[ix] = {
      ...list[ix],
      status: 'CANCELADO',
      updatedAt: new Date().toISOString(),
      cancelReason: list[ix].cancelReason || 'Cancelado manualmente'
    };
  }
  
  await db.write();
  return NextResponse.json({ ok: true, deleted: permanent });
}
