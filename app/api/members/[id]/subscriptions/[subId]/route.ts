import { NextRequest, NextResponse } from 'next/server';
import { getDb, toISODate } from '@/lib/db';
import type { MemberSubscription } from '@/lib/db';

function findSub(dbData: any, memberId: string, subId: string) {
  const list: MemberSubscription[] = dbData.memberSubscriptions ?? [];
  const idx = list.findIndex(x => x.id === subId && x.memberId === memberId);
  return { idx, item: idx >= 0 ? list[idx] as MemberSubscription : undefined };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; subId: string } }
) {
  const db = await getDb();
  const { item } = findSub(db.data, params.id, params.subId);
  return item
    ? NextResponse.json(item)
    : NextResponse.json({ msg: 'No encontrado' }, { status: 404 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; subId: string } }
) {
  const patch = await req.json();
  const db = await getDb();
  db.data.memberSubscriptions = db.data.memberSubscriptions ?? [];

  const { idx, item } = findSub(db.data, params.id, params.subId);
  if (idx < 0 || !item) {
    return NextResponse.json({ msg: 'No encontrado' }, { status: 404 });
  }

  const periodicity =
    patch.periodicity === 'ANUAL' || patch.periodicity === 'MENSUAL'
      ? patch.periodicity
      : item.periodicity;

  const updated: MemberSubscription = {
    ...item,
    serviceId: patch.serviceId ?? item.serviceId,
    price: typeof patch.price === 'number' ? patch.price : item.price,
    periodicity,
    cadenceDays:
      typeof patch.cadenceDays === 'number' ? patch.cadenceDays : item.cadenceDays,
    autoDebit:
      typeof patch.autoDebit === 'boolean' ? patch.autoDebit : item.autoDebit,
    status:
      patch.status === 'ACTIVE' || patch.status === 'PAUSED' || patch.status === 'CANCELLED'
        ? patch.status
        : item.status,
    startDate: patch.startDate ? toISODate(patch.startDate) : item.startDate,
    // Si nextChargeDate ya está en formato YYYY-MM-DD, usarlo directamente sin conversión
    nextChargeDate: patch.nextChargeDate 
      ? (patch.nextChargeDate.length === 10 && patch.nextChargeDate.match(/^\d{4}-\d{2}-\d{2}$/)
          ? patch.nextChargeDate 
          : toISODate(patch.nextChargeDate))
      : item.nextChargeDate,
    notes: typeof patch.notes === 'string' ? patch.notes : item.notes,
  };

  db.data.memberSubscriptions[idx] = updated;
  await db.write();
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; subId: string } }
) {
  const db = await getDb();
  const list: MemberSubscription[] = db.data.memberSubscriptions ?? [];
  const newList = list.filter(x => !(x.id === params.subId && x.memberId === params.id));
  if (newList.length === list.length) {
    return NextResponse.json({ msg: 'No encontrado' }, { status: 404 });
  }
  db.data.memberSubscriptions = newList;
  await db.write();
  return NextResponse.json({ ok: true });
}