import { NextRequest, NextResponse } from 'next/server';
import { getDb, getMemberStatus } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  const db = await getDb();
  const member = db.data.members.find(m => m.id === params.id);
  
  if (!member) {
    return NextResponse.json({ ok: false, msg: 'Socio no encontrado' }, { status: 404 });
  }
  
  // Calcular estado real basado en movimientos
  const memberMovements = db.data.movements.filter(m => m.memberId === member.id);
  const realStatus = getMemberStatus(member, memberMovements);
  
  return NextResponse.json({
    ...member,
    estado: realStatus
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    const memberIndex = db.data.members.findIndex(m => m.id === params.id);
    
    if (memberIndex === -1) {
      return NextResponse.json({ ok: false, msg: 'Socio no encontrado' }, { status: 404 });
    }
    
    const updates = await req.json();
    db.data.members[memberIndex] = { ...db.data.members[memberIndex], ...updates };
    await db.write();
    
    return NextResponse.json(db.data.members[memberIndex]);
  } catch (error) {
    console.error('Error updating member:', error);
    return NextResponse.json({ ok: false, msg: 'Error al actualizar socio' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';
    
    const db = await getDb();
    const memberIndex = db.data.members.findIndex(m => m.id === params.id);
    
    if (memberIndex === -1) {
      return NextResponse.json({ ok: false, msg: 'Socio no encontrado' }, { status: 404 });
    }
    
    // Verificar si el socio tiene deudas pendientes (movimientos no pagados)
    const memberMovements = db.data.movements.filter(m => m.memberId === params.id);
    const pendingMovements = memberMovements.filter(m => 
      m.status === 'PENDIENTE' || (m.tipo === 'DEBIT' && (!m.status || m.status === 'PARCIAL'))
    );
    
    if (pendingMovements.length > 0 && !force) {
      const totalDebt = pendingMovements.reduce((sum, mov) => sum + mov.monto, 0);
      return NextResponse.json({ 
        ok: false, 
        msg: `No se puede eliminar el socio porque tiene ${pendingMovements.length} deuda(s) pendiente(s) por un total de Gs. ${totalDebt.toLocaleString()}`,
        hasPendingDebts: true,
        pendingCount: pendingMovements.length,
        totalDebt: totalDebt
      }, { status: 400 });
    }
    
    // Si force=true, eliminar también todos los movimientos y pagos asociados
    if (force) {
      // Eliminar movimientos asociados
      db.data.movements = db.data.movements.filter(m => m.memberId !== params.id);
      
      // Eliminar pagos asociados
      db.data.payments = db.data.payments.filter(p => p.memberId !== params.id);
      
      // Eliminar suscripciones asociadas
      db.data.memberSubscriptions = db.data.memberSubscriptions.filter(s => s.memberId !== params.id);
      
      // Eliminar reservas asociadas
      db.data.reservations = db.data.reservations.filter(r => r.memberId !== params.id);
      
      // Eliminar refinanciaciones asociadas
      db.data.refinancings = db.data.refinancings.filter(ref => ref.memberId !== params.id);
      
      // Eliminar familiares asociados
      db.data.families = db.data.families.filter(f => f.socioTitularId !== params.id);
      
      // Eliminar attachments asociados
      db.data.attachments = db.data.attachments.filter(att => att.memberId !== params.id);
    }
    
    db.data.members.splice(memberIndex, 1);
    await db.write();
    
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting member:', error);
    return NextResponse.json({ ok: false, msg: 'Error al eliminar socio' }, { status: 500 });
  }
}