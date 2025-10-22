import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDb();
    
    const memberId = params.id;
    const familyMembers = db.data.families.filter(
      (f: any) => f.socioTitularId === memberId || f.memberId === memberId || f.socio === memberId
    );

    return NextResponse.json(familyMembers);
  } catch (error) {
    console.error('Error getting family members:', error);
    return NextResponse.json({ ok: false, msg: 'Error al obtener familiares' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDb();

    const { nombres, apellidos, ci, parentesco, nacimiento, telefono, email } = await req.json();

    if (!nombres || !apellidos || !ci) {
      return NextResponse.json({ ok: false, msg: 'Nombres, apellidos y CI son obligatorios' }, { status: 400 });
    }

    const newFamilyMember = {
      id: nanoid(),
      grupoFamiliarId: `FAM-${nanoid().slice(0, 4)}`,
      socioTitularId: params.id,
      nombres,
      apellidos,
      ci,
      parentesco: parentesco || 'Otro',
      nacimiento: nacimiento || '',
      telefono: telefono || '',
      email: email || '',
      activo: true,
      fechaCreacion: new Date().toISOString(),
    };

    db.data.families.push(newFamilyMember);
    await db.write();

    return NextResponse.json(newFamilyMember, { status: 201 });
  } catch (error) {
    console.error('Error creating family member:', error);
    return NextResponse.json({ ok: false, msg: 'Error al crear familiar' }, { status: 500 });
  }
}