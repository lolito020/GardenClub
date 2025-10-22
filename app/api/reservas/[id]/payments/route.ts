import { NextRequest, NextResponse } from 'next/server';
import { getDb, Reservation, ReservationPayment, nextReservationPaymentId, FormaPago } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = await getDb();
  const items = (db.data.reservationPayments as ReservationPayment[]).filter(p => p.reservationId === params.id)
    .sort((a,b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  return NextResponse.json(items);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAuth();
  const body = await req.json();
  const db = await getDb();

  const r = (db.data.reservations as Reservation[]).find(x => x.id === params.id);
  if (!r) return NextResponse.json({ msg: 'Reserva no existe' }, { status: 404 });

  const pago: ReservationPayment = {
    id: await nextReservationPaymentId(),
    reservationId: r.id,
    fecha: new Date(body.fecha || Date.now()).toISOString(),
    monto: Number(body.monto),
    metodo: body.metodo as FormaPago || 'efectivo',
    numeroRecibo: body.numeroRecibo || undefined,
    observaciones: body.observaciones || undefined,
  };
  db.data.reservationPayments.push(pago);

  // actualizar pagado y status
  const totalPagado = (db.data.reservationPayments as ReservationPayment[])
    .filter(p => p.reservationId === r.id)
    .reduce((acc, p) => acc + (p.monto || 0), 0);

  r.pagado = totalPagado;
  if ((r.depositoRequerido ?? 0) > 0 && totalPagado >= (r.depositoRequerido ?? 0) && (r.status === 'PENDING' || r.status === 'HOLD')) {
    r.status = 'CONFIRMED';
  }

  await db.write();
  return NextResponse.json({ ok: true, pago, pagado: r.pagado, status: r.status });
}
