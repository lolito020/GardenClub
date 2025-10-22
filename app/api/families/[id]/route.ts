import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  const db = await getDb();
  const family = db.data.families.find(f => f.id === params.id);
  
  if (!family) {
    return NextResponse.json({ ok: false, msg: 'Familiar no encontrado' }, { status: 404 });
  }
  
  return NextResponse.json(family);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    const familyIndex = db.data.families.findIndex(f => f.id === params.id);
    
    if (familyIndex === -1) {
      return NextResponse.json({ ok: false, msg: 'Familiar no encontrado' }, { status: 404 });
    }
    
    const updates = await req.json();
    db.data.families[familyIndex] = { ...db.data.families[familyIndex], ...updates };
    await db.write();
    
    return NextResponse.json(db.data.families[familyIndex]);
  } catch (error) {
    console.error('Error updating family member:', error);
    return NextResponse.json({ ok: false, msg: 'Error al actualizar familiar' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    const familyIndex = db.data.families.findIndex(f => f.id === params.id);
    
    if (familyIndex === -1) {
      return NextResponse.json({ ok: false, msg: 'Familiar no encontrado' }, { status: 404 });
    }
    
    db.data.families.splice(familyIndex, 1);
    await db.write();
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting family member:', error);
    return NextResponse.json({ ok: false, msg: 'Error al eliminar familiar' }, { status: 500 });
  }
}