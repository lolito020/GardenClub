import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { nanoid } from 'nanoid';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST: agregar servicio al socio y crear movimiento DEBIT
// Body: { serviceId: string, fecha?: 'YYYY-MM-DD', concepto?: string, monto?: number }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = await getDb();
  db.data.members ||= [];
  db.data.services ||= [];
  db.data.movements ||= [];

  const memberId = params.id;
  const body = await req.json();

  const member = db.data.members.find((m: any) => m.id === memberId);
  if (!member) return NextResponse.json({ ok: false, msg: 'Socio no encontrado' }, { status: 404 });

  const service = db.data.services.find((s: any) => s.id === body.serviceId);
  if (!service) return NextResponse.json({ ok: false, msg: 'Servicio no encontrado' }, { status: 404 });

  // Asociar servicio si no está
  member.servicios ||= [];
  if (!member.servicios.includes(service.id)) {
    member.servicios.push(service.id);
  }

  const fechaISO = new Date((body.fecha || new Date().toISOString().split('T')[0])).toISOString();
  const monto = Number(body.monto ?? service.precio) || 0;
  const concepto = (body.concepto && String(body.concepto).trim()) || `Servicio: ${service.nombre}`;

  // Crear movimiento DEBIT (Debe)
  db.data.movements.push({
    id: nanoid(),
    memberId,
    fecha: fechaISO,
    concepto,
    tipo: 'DEBIT',
    monto,
    origen: 'SERVICIO',
    refId: String(service.id),
  });

  await db.write();

  return NextResponse.json({ ok: true, member });
}

// DELETE: quitar servicio del socio y (opcional) crear AJUSTE (CREDIT) para revertir deuda
// Query: ?serviceId=...&reverse=1
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireAuth(req, ['admin', 'caja']);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const db = await getDb();
  db.data.members ||= [];
  db.data.services ||= [];
  db.data.movements ||= [];

  const url = new URL(req.url);
  const memberId = params.id;
  const serviceId = url.searchParams.get('serviceId');
  const reverse = url.searchParams.get('reverse') === '1';

  if (!serviceId) {
    return NextResponse.json({ ok: false, msg: 'serviceId requerido' }, { status: 400 });
  }

  const member = db.data.members.find((m: any) => m.id === memberId);
  if (!member) return NextResponse.json({ ok: false, msg: 'Socio no encontrado' }, { status: 404 });
  const service = db.data.services.find((s: any) => s.id === serviceId);
  if (!service) return NextResponse.json({ ok: false, msg: 'Servicio no encontrado' }, { status: 404 });

  member.servicios ||= [];
  member.servicios = member.servicios.filter((id: string) => id !== serviceId);

  if (reverse) {
    // Crea un AJUSTE (HABER) por el precio del servicio
    db.data.movements.push({
      id: nanoid(),
      memberId,
      fecha: new Date().toISOString(),
      concepto: `Ajuste: baja de servicio ${service.nombre}`,
      tipo: 'CREDIT',
      monto: Number(service.precio) || 0,
      origen: 'AJUSTE',
      refId: `svc-${serviceId}`,
    });
  }

  await db.write();

  return NextResponse.json({ ok: true, member });
}
