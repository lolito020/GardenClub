import { NextRequest, NextResponse } from 'next/server';
import { getDb, Resource as Venue } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAuth();
  const body = await req.json();
  const db = await getDb();
  const ix = (db.data.resources as Venue[]).findIndex(v => v.id === params.id);
  if (ix === -1) return NextResponse.json({ msg: 'No existe' }, { status: 404 });
  const cur = db.data.resources[ix];
  db.data.resources[ix] = { ...cur, ...body };
  await db.write();
  return NextResponse.json(db.data.resources[ix]);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireAuth();
  const db = await getDb();
  db.data.resources = (db.data.resources as Venue[]).filter(v => v.id !== params.id);
  await db.write();
  return NextResponse.json({ ok: true });
}
