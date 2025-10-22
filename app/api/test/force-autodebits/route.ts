import { NextRequest, NextResponse } from 'next/server';
import { getDb, toISODate, nextMovementId, yyyymm } from '@/lib/db';
import type { MemberSubscription, Movement, Service } from '@/lib/db';

// Endpoint especial para testing que fuerza la generación de autodébitos
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    
    db.data.memberSubscriptions = db.data.memberSubscriptions ?? [];
    db.data.movements = db.data.movements ?? [];
    db.data.services = db.data.services ?? [];

    const body = await req.json().catch(() => ({}));
    const memberId = body.memberId;

    if (!memberId) {
      return NextResponse.json({ ok: false, error: 'memberId requerido' }, { status: 400 });
    }

    const todayISO = toISODate(new Date());
    const today = new Date(todayISO);
    
    const servicesById = new Map<string, Service>();
    for (const s of db.data.services as Service[]) servicesById.set(s.id, s);

    const memberSubs = (db.data.memberSubscriptions as MemberSubscription[])
      .filter(sub => sub.memberId === memberId && sub.status === 'ACTIVE' && sub.autoDebit);

    if (memberSubs.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: 'No hay suscripciones activas con autodébito para este socio' 
      }, { status: 400 });
    }

    const created: Movement[] = [];

    for (const sub of memberSubs) {
      // Usar fecha actual para generar movimiento del período actual
      const chargeDate = today;
      const periodTag = yyyymm(chargeDate);
      const svc = servicesById.get(sub.serviceId);
      const nombre = svc?.nombre || `Servicio ${sub.serviceId}`;
      const price = typeof sub.price === 'number' ? sub.price : (svc?.precio ?? 0);

      const refId = `${sub.serviceId}:${periodTag}`;
      
      // Eliminar movimiento existente si existe (para testing)
      const existingIndex = (db.data.movements as Movement[]).findIndex(
        m => m.memberId === sub.memberId && m.origen === 'SUSCRIPCION' && m.refId === refId
      );
      
      if (existingIndex >= 0) {
        console.log(`🗑️ Eliminando movimiento existente: ${refId}`);
        db.data.movements.splice(existingIndex, 1);
      }

      // Crear nuevo movimiento
      const mov: Movement = {
        id: await nextMovementId(),
        memberId: sub.memberId,
        fecha: todayISO,
        concepto: `Cuota ${sub.periodicity?.toLowerCase() || 'mensual'} de ${nombre} (AU-TEST)`,
        tipo: 'DEBIT',
        monto: Number(price) || 0,
        origen: 'SUSCRIPCION',
        refId,
        observaciones: `Cargo automático de prueba - ${periodTag.slice(0,4)}-${periodTag.slice(4,6)}`,
        status: 'PENDIENTE',
        vencimiento: todayISO,
      };
      
      db.data.movements.push(mov);
      created.push(mov);
      console.log(`✅ Movimiento de prueba creado: ${mov.id} para ${refId}`);
    }

    await db.write();
    
    return NextResponse.json({ 
      ok: true, 
      createdCount: created.length, 
      created: created.map(m => ({
        id: m.id,
        concepto: m.concepto,
        monto: m.monto,
        refId: m.refId
      }))
    });

  } catch (error) {
    console.error('Error en force-autodebits:', error);
    return NextResponse.json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Error desconocido' 
    }, { status: 500 });
  }
}