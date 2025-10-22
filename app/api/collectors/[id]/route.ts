import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  const db = await getDb();
  const collector = db.data.collectors.find(c => c.id === params.id);
  
  if (!collector) {
    return NextResponse.json({ ok: false, msg: 'Cobrador no encontrado' }, { status: 404 });
  }
  
  return NextResponse.json(collector);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    const collectorIndex = db.data.collectors.findIndex(c => c.id === params.id);
    
    if (collectorIndex === -1) {
      return NextResponse.json({ ok: false, msg: 'Cobrador no encontrado' }, { status: 404 });
    }
    
    const updates = await req.json();
    db.data.collectors[collectorIndex] = { ...db.data.collectors[collectorIndex], ...updates };
    await db.write();
    
    return NextResponse.json(db.data.collectors[collectorIndex]);
  } catch (error) {
    console.error('Error updating collector:', error);
    return NextResponse.json({ ok: false, msg: 'Error al actualizar cobrador' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    const collectorIndex = db.data.collectors.findIndex(c => c.id === params.id);
    
    if (collectorIndex === -1) {
      return NextResponse.json({ ok: false, msg: 'Cobrador no encontrado' }, { status: 404 });
    }
    
    // Verificar si el cobrador tiene pagos asociados
    const hasPayments = db.data.payments.some(payment => payment.cobradorId === params.id);
    if (hasPayments) {
      return NextResponse.json({ 
        ok: false, 
        msg: 'No se puede eliminar el cobrador porque tiene pagos asociados' 
      }, { status: 400 });
    }
    
    db.data.collectors.splice(collectorIndex, 1);
    await db.write();
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting collector:', error);
    return NextResponse.json({ ok: false, msg: 'Error al eliminar cobrador' }, { status: 500 });
  }
}