import { NextRequest, NextResponse } from 'next/server';
import { getDb, nextFamilyId } from '@/lib/db';
import { nanoid } from 'nanoid';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    
    // Enriquecer familiares con información del socio titular
    const enrichedFamilies = db.data.families.map(family => {
      const socioTitular = db.data.members.find(m => m.id === family.socioTitularId);
      
      return {
        ...family,
        socioTitularName: socioTitular ? `${socioTitular.nombres} ${socioTitular.apellidos}` : 'Socio no encontrado',
        socioTitularCode: socioTitular?.codigo || 'N/A'
      };
    });
    
    return NextResponse.json(enrichedFamilies);
  } catch (error) {
    console.error('Error loading families:', error);
    return NextResponse.json({ ok: false, msg: 'Error al cargar familiares' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  
  try {
    const db = await getDb();
    const body = await req.json();
    
    // Validar que el socio titular existe
    const socioTitular = db.data.members.find(m => m.id === body.socioTitularId);
    if (!socioTitular) {
      return NextResponse.json({ ok: false, msg: 'Socio titular no encontrado' }, { status: 400 });
    }
    
    // Verificar que el CI no exista si se proporciona
    if (body.ci) {
      const existingFamily = db.data.families.find(f => f.ci === body.ci);
      if (existingFamily) {
        return NextResponse.json({ ok: false, msg: 'Ya existe un familiar con esa cédula' }, { status: 400 });
      }
    }
    
    const familyId = await nextFamilyId();
    const family = {
      id: nanoid(),
      grupoFamiliarId: familyId,
      activo: true,
      ...body
    };
    
    db.data.families.push(family);
    await db.write();
    
    return NextResponse.json(family, { status: 201 });
  } catch (error) {
    console.error('Error creating family member:', error);
    return NextResponse.json({ ok: false, msg: 'Error al crear familiar' }, { status: 500 });
  }
}