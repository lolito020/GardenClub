import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { ci, codigo, qr } = await req.json();
  const db = await getDb();
  let m = null;
  if (ci) m = db.data.members.find(x => x.ci === ci);
  if (!m && codigo) m = db.data.members.find(x => x.codigo === codigo);
  if (!m && qr)  m = db.data.members.find(x => x.codigo === qr); // demo: QR = código socio
  if (!m) return NextResponse.json({ ok:false, msg:'No encontrado' }, { status:404 });
  return NextResponse.json({
    ok:true,
    member: {
      id: m.id, codigo: m.codigo, nombre: `${m.nombres} ${m.apellidos}`,
      estado: m.estado, foto: m.foto || null
    }
  });
}