import { NextRequest, NextResponse } from 'next/server';
import { getDb, nextCollectorCode } from '@/lib/db';
import { nanoid } from 'nanoid';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  const db = await getDb();
  return NextResponse.json(db.data.collectors);
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    const body = await req.json();
    
    // Verificar que el CI no exista
    const existingCollector = db.data.collectors.find(c => c.ci === body.ci);
    if (existingCollector) {
      return NextResponse.json({ ok: false, msg: 'Ya existe un cobrador con esa cédula' }, { status: 400 });
    }
    
    const id = nanoid();
    const codigo = await nextCollectorCode();
    const collector = {
      id,
      codigo,
      activo: true,
      fechaIngreso: new Date().toISOString().split('T')[0],
      ...body
    };
    
    db.data.collectors.push(collector);
    await db.write();
    
    return NextResponse.json(collector, { status: 201 });
  } catch (error) {
    console.error('Error creating collector:', error);
    return NextResponse.json({ ok: false, msg: 'Error al crear cobrador' }, { status: 500 });
  }
}