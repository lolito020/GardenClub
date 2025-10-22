import { NextRequest, NextResponse } from 'next/server';
import {
  getDb,
  toISODate,
  addDays,
  yyyymm,
  nextMovementId,
} from '@/lib/db';
import type { MemberSubscription, Movement, Service } from '@/lib/db';

export async function POST(_req: NextRequest) {
  const db = await getDb();

  db.data.memberSubscriptions = db.data.memberSubscriptions ?? [];
  db.data.movements = db.data.movements ?? [];
  db.data.services = db.data.services ?? [];

  const todayISO = toISODate(new Date());
  const today = new Date(todayISO);

  const servicesById = new Map<string, Service>();
  for (const s of db.data.services as Service[]) servicesById.set(s.id, s);

  // ⚠️ SISTEMA DE AUTO-DÉBITOS DESACTIVADO POR SOLICITUD DEL CLUB ⚠️
  // El club prefiere gestionar los cobros de suscripciones manualmente
  // Este endpoint solo retorna información sobre suscripciones que necesitarían cobro
  
  const pendingCharges: Array<{
    memberId: string;
    serviceId: string;
    serviceName: string;
    nextChargeDate: string;
    amount: number;
    periodicity: string;
  }> = [];

  for (const sub of db.data.memberSubscriptions as MemberSubscription[]) {
    if (sub.status !== 'ACTIVE') continue;
    
    const cadence = Number(sub.cadenceDays || 30);
    if (cadence <= 0) continue;

    let chargeDate = new Date(sub.nextChargeDate || sub.startDate || todayISO);

    // Solo identificar suscripciones que están listas para cobro
    if (chargeDate <= today) {
      const svc = servicesById.get(sub.serviceId);
      const nombre = svc?.nombre || `Servicio ${sub.serviceId}`;
      const price = typeof sub.price === 'number' ? sub.price : (svc?.precio ?? 0);

      pendingCharges.push({
        memberId: sub.memberId,
        serviceId: sub.serviceId,
        serviceName: nombre,
        nextChargeDate: sub.nextChargeDate || '',
        amount: Number(price) || 0,
        periodicity: sub.periodicity || 'MONTHLY',
      });
    }
  }

  // NO se crean débitos automáticamente
  // await db.write(); // No es necesario escribir cambios

  return NextResponse.json({ 
    ok: true, 
    autoDebitsDisabled: true,
    message: 'Sistema de auto-débitos desactivado. Gestión manual requerida.',
    pendingCharges,
    pendingCount: pendingCharges.length 
  });
}

export const GET = POST;