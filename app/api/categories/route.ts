import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Category {
  id: string;
  nombre: string;
}

// GET /api/categories
export async function GET(req: NextRequest) {
  const user = await requireAuth(req, ['admin', 'caja', 'consulta']);
  if (!user) return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDb();
    db.data.categories ||= [];
    return NextResponse.json(db.data.categories);
  } catch (e) {
    console.error('Error al obtener categorías', e);
    return NextResponse.json({ ok: false, msg: 'Error al obtener categorías' }, { status: 500 });
  }
}

// POST /api/categories
// Body esperado: { nombre: string }
export async function POST(req: NextRequest) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const nombre = (body?.nombre || '').trim();

    if (!nombre) {
      return NextResponse.json({ ok: false, msg: 'El nombre es obligatorio' }, { status: 400 });
    }

    const db = await getDb();
    db.data.categories ||= [];

    // evitar duplicados
    if (db.data.categories.some((c: Category) => c.nombre.toLowerCase() === nombre.toLowerCase())) {
      return NextResponse.json({ ok: false, msg: 'La categoría ya existe' }, { status: 400 });
    }

    const nuevaCategoria: Category = { id: nanoid(), nombre };
    db.data.categories.push(nuevaCategoria);
    await db.write();

    return NextResponse.json({ ok: true, categoria: nuevaCategoria }, { status: 201 });
  } catch (e: any) {
    console.error('Error al crear categoría', e);
    return NextResponse.json({ ok: false, msg: e?.message || 'Error al crear categoría' }, { status: 500 });
  }
}
