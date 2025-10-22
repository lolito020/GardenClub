import { NextRequest, NextResponse } from 'next/server';
import { getDb, Resource as Venue, nextResourceId as nextVenueId } from '@/lib/db';
import { requireAuth } from '@/lib/auth'; // 👈 corregido

// GET /api/venues
export async function GET() {
  await requireAuth(); // cualquier usuario autenticado
  const db = await getDb();
  const items = db.data.resources || [];
  // Si querés filtrar por activo, descomentá:
  // const items = (db.data.resources || []).filter(v => v.activo !== false);
  return NextResponse.json(items);
}

// POST /api/venues
// body: { nombre, descripcion?, precioBaseHora, garantia?, capacidad?, activo? }
export async function POST(req: NextRequest) {
  await requireAuth(undefined, ['admin']); // solo admin crea/edita
  const body = await req.json().catch(() => ({} as any));
  const {
    nombre,
    descripcion = '',
    precioBaseHora,
    garantia = 0,
    capacidad = 0,
    activo = true,
  } = body || {};

  if (!nombre || typeof precioBaseHora !== 'number') {
    return NextResponse.json(
      { msg: 'Faltan campos: nombre y precioBaseHora (number) son obligatorios.' },
      { status: 400 }
    );
  }

  const db = await getDb();
  const venue: Venue = {
    id: await nextVenueId(),
    nombre: String(nombre),
    descripcion: String(descripcion || ''),
    activo: Boolean(activo),
    precioBaseHora: Number(precioBaseHora),
    garantia: Number(garantia) || 0,
    capacidad: Number(capacidad) || 0,
  };

  db.data.resources.push(venue);
  await db.write();

  return NextResponse.json(venue, { status: 201 });
}
