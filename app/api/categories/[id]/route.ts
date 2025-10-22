import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// PUT /api/categories/:id
// Body esperado: { nombre: string }
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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

    const index = db.data.categories.findIndex((c: any) => c.id === params.id);
    if (index === -1) {
      return NextResponse.json({ ok: false, msg: 'Categoría no encontrada' }, { status: 404 });
    }

    db.data.categories[index].nombre = nombre;
    await db.write();

    return NextResponse.json({ ok: true, categoria: db.data.categories[index] });
  } catch (e: any) {
    console.error('Error al editar categoría', e);
    return NextResponse.json({ ok: false, msg: e?.message || 'Error al editar categoría' }, { status: 500 });
  }
}

// DELETE /api/categories/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin']);
  if (!user) return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDb();
    db.data.categories ||= [];

    const index = db.data.categories.findIndex((c: any) => c.id === params.id);
    if (index === -1) {
      return NextResponse.json({ ok: false, msg: 'Categoría no encontrada' }, { status: 404 });
    }

    const eliminada = db.data.categories.splice(index, 1)[0];
    await db.write();

    return NextResponse.json({ ok: true, categoria: eliminada });
  } catch (e: any) {
    console.error('Error al eliminar categoría', e);
    return NextResponse.json({ ok: false, msg: e?.message || 'Error al eliminar categoría' }, { status: 500 });
  }
}
