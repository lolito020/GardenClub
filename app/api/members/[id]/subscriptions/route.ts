import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDb, nextSubscriptionId, toISODate } from '@/lib/db';
import type { MemberSubscription, Service } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(_req, ['admin', 'caja', 'consulta']);
  if (authResult instanceof NextResponse) return authResult;

  const db = await getDb();
  const list: MemberSubscription[] = db.data.memberSubscriptions ?? [];
  return NextResponse.json(list.filter(s => s.memberId === params.id));
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await requireAuth(req, ['admin', 'caja']);
  if (authResult instanceof NextResponse) return authResult;

  const body = await req.json();
  if (!body?.serviceId) {
    return NextResponse.json({ msg: 'serviceId es requerido' }, { status: 400 });
  }

  const db = await getDb();
  db.data.memberSubscriptions = db.data.memberSubscriptions ?? [];
  db.data.services = db.data.services ?? [];

  // Defaults:
  // - periodicidad: si el servicio existe, usar su tipo (MENSUAL/ANUAL/UNICO/DIARIO) -> mapear a MENSUAL/ANUAL/DIARIO; si no, MENSUAL
  // - cadenceDays: si viene explícito usarlo; si no, 1 para DIARIO, 30 para MENSUAL y 365 para ANUAL
  const svc: Service | undefined = db.data.services.find(s => s.id === String(body.serviceId));
  const periodicity: 'MENSUAL' | 'ANUAL' | 'DIARIO' =
    body.periodicity === 'ANUAL' || body.periodicity === 'MENSUAL' || body.periodicity === 'DIARIO'
      ? body.periodicity
      : (svc?.tipo === 'ANUAL' ? 'ANUAL' : svc?.tipo === 'DIARIO' ? 'DIARIO' : 'MENSUAL');

  const cadenceDays: number =
    typeof body.cadenceDays === 'number'
      ? body.cadenceDays
      : (periodicity === 'DIARIO' ? 1 : periodicity === 'ANUAL' ? 365 : 30);

  const now = toISODate(new Date());

  const sub: MemberSubscription = {
    id: await nextSubscriptionId(),
    memberId: params.id,
    serviceId: String(body.serviceId),
    price: typeof body.price === 'number' ? body.price : undefined,
    periodicity,
    cadenceDays,
    autoDebit: body.autoDebit !== false,
    status: body.status === 'PAUSED' || body.status === 'CANCELLED' ? body.status : 'ACTIVE',
    startDate: body.startDate ? toISODate(body.startDate) : now,
    nextChargeDate: body.nextChargeDate ? toISODate(body.nextChargeDate) : now,
    notes: typeof body.notes === 'string' ? body.notes : '',
  };

  db.data.memberSubscriptions.push(sub);
  await db.write();
  return NextResponse.json(sub, { status: 201 });
}