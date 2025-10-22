import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  const db = await getDb();
  return NextResponse.json(db.data.services);
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    const body = await req.json();
    
    const service = {
      id: nanoid(),
      ...body,
      activo: body.activo !== undefined ? body.activo : true
    };
    
    db.data.services.push(service);
    await db.write();
    
    return NextResponse.json(service, { status: 201 });
  } catch (error) {
    console.error('Error creating service:', error);
    return NextResponse.json({ ok: false, msg: 'Error al crear servicio' }, { status: 500 });
  }
}