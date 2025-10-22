import { NextRequest, NextResponse } from 'next/server';
import { getDb, nextMemberCode, getMemberStatus } from '@/lib/db';
import { nanoid } from 'nanoid';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin','caja','consulta']);
  if (!user) return NextResponse.json({ok:false},{status:401});
  
  const db = await getDb();
  // Soporta query string ?ci= para búsqueda por cédula (usado por la UI)
  const url = new URL(req.url);
  const ciQuery = url.searchParams.get('ci');

  // Si se solicitó búsqueda por CI, devolver solo coincidencias exactas (sin calcular movimientos)
  if (ciQuery) {
    const matches = (db.data.members || []).filter((m: any) => String(m.ci || '').trim() === String(ciQuery).trim());
    return NextResponse.json(matches);
  }

  // Calcular estado real basado en movimientos cuando se piden todos los miembros
  const membersWithStatus = (db.data.members || []).map(member => {
    const memberMovements = (db.data.movements || []).filter((m: any) => m.memberId === member.id);
    const realStatus = getMemberStatus(member, memberMovements);
    return {
      ...member,
      estado: realStatus
    };
  });

  return NextResponse.json(membersWithStatus);
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req, ['admin','caja']);
  if (!user) return NextResponse.json({ok:false},{status:401});
  
  const db = await getDb();
  const body = await req.json();
  const id = nanoid();
  
  // Usar el código enviado en el body, o generar uno automático
  const codigo = body.codigo || await nextMemberCode();
  
  const member = { id, codigo, estado:'AL_DIA', servicios:[], ...body };
  db.data.members.push(member);
  await db.write();
  return NextResponse.json({ ok: true, member }, { status: 201 });
}