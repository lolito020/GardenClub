import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { Refinancing } from '@/lib/types';

// GET /api/refinancings/[id] - Get a refinancing by id
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const refinancing = db.data.refinancings.find(r => r.id === params.id);
  if (!refinancing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(refinancing);
}

// PUT /api/refinancings/[id] - Update a refinancing
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const idx = db.data.refinancings.findIndex(r => r.id === params.id);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const data = await req.json();
  db.data.refinancings[idx] = { ...db.data.refinancings[idx], ...data };
  await db.write();
  return NextResponse.json(db.data.refinancings[idx]);
}

// DELETE /api/refinancings/[id] - Delete a refinancing
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const idx = db.data.refinancings.findIndex(r => r.id === params.id);
  if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const deleted = db.data.refinancings.splice(idx, 1)[0];
  await db.write();
  return NextResponse.json(deleted);
}
