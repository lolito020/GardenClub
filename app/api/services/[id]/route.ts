import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  const db = await getDb();
  const service = db.data.services.find(s => s.id === params.id);
  
  if (!service) {
    return NextResponse.json({ ok: false, msg: 'Servicio no encontrado' }, { status: 404 });
  }
  
  return NextResponse.json(service);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    const serviceIndex = db.data.services.findIndex(s => s.id === params.id);
    
    if (serviceIndex === -1) {
      return NextResponse.json({ ok: false, msg: 'Servicio no encontrado' }, { status: 404 });
    }
    
    const updates = await req.json();
    db.data.services[serviceIndex] = { ...db.data.services[serviceIndex], ...updates };
    await db.write();
    
    return NextResponse.json(db.data.services[serviceIndex]);
  } catch (error) {
    console.error('Error updating service:', error);
    return NextResponse.json({ ok: false, msg: 'Error al actualizar servicio' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    const serviceIndex = db.data.services.findIndex(s => s.id === params.id);
    
    if (serviceIndex === -1) {
      return NextResponse.json({ ok: false, msg: 'Servicio no encontrado' }, { status: 404 });
    }
    
    // Verificar si el servicio está siendo usado por algún socio
    const isUsed = db.data.members.some(member => member.servicios.includes(params.id));
    if (isUsed) {
      return NextResponse.json({ 
        ok: false, 
        msg: 'No se puede eliminar el servicio porque está siendo usado por socios' 
      }, { status: 400 });
    }
    
    db.data.services.splice(serviceIndex, 1);
    await db.write();
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting service:', error);
    return NextResponse.json({ ok: false, msg: 'Error al eliminar servicio' }, { status: 500 });
  }
}