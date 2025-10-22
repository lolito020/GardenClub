import { NextRequest, NextResponse } from 'next/server';
import {
  getDb,
  Reservation,
  ReservationStatus,
  computeQuote,
  hasReservationConflict,
  nextReservationId,
} from '@/lib/db';
import { requireAuth } from '@/lib/auth'; // 👈 CORREGIDO

// GET /api/reservas?dateFrom=&dateTo=&status=&resourceId=&memberId=&q=&includeHistory=true
export async function GET(req: NextRequest) {
  await requireAuth(req); // cualquier usuario autenticado
  const { searchParams } = new URL(req.url);

  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const status = (searchParams.get('status') || '') as ReservationStatus | '';
  const resourceId = searchParams.get('resourceId') || '';
  const memberId = searchParams.get('memberId') || '';
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  const searchType = searchParams.get('searchType') || 'contacto';
  const includeHistory = searchParams.get('includeHistory') === 'true';

  const db = await getDb();
  let items = db.data.reservations || [];

  // Por defecto, mostrar solo reservas activas (a menos que se pida el historial)
  if (!includeHistory) {
    items = items.filter(r => r.status === 'ACTIVO' || r.status === 'RESERVADO' || r.status === 'CONFIRMADO' || r.status === 'PENDIENTE');
  } else {
    // En historial, mostrar solo culminadas y canceladas
    items = items.filter(r => r.status === 'CULMINADO' || r.status === 'CANCELADO');
  }

  if (dateFrom) items = items.filter(r => new Date(r.start) >= new Date(dateFrom));
  if (dateTo)   items = items.filter(r => new Date(r.start) <= new Date(dateTo));
  if (status)   items = items.filter(r => r.status === status);
  if (resourceId) items = items.filter(r => r.resourceId === resourceId);
  if (memberId)   items = items.filter(r => r.memberId === memberId);
  if (q) {
    if (searchType === 'evento') {
      // Buscar en campos relacionados con el evento
      items = items.filter(r =>
        (r.acontecimiento?.toLowerCase() || '').includes(q) ||
        (r.quinceaneraFocusNombre?.toLowerCase() || '').includes(q) ||
        (r.noviosNombres?.toLowerCase() || '').includes(q) ||
        (r.cumpleaneroNombre?.toLowerCase() || '').includes(q) ||
        (r.otrosDescripcion?.toLowerCase() || '').includes(q) ||
        (r.otrosNombrePersona?.toLowerCase() || '').includes(q) ||
        (r.observacionesGenerales?.toLowerCase() || '').includes(q)
      );
    } else {
      // Buscar en campos relacionados con el contacto (comportamiento por defecto)
      items = items.filter(r =>
        (r.nombreContacto?.toLowerCase() || '').includes(q) ||
        (r.contacto?.toLowerCase() || '').includes(q) ||
        (r.medioContacto?.toLowerCase() || '').includes(q) ||
        (r.notas?.toLowerCase() || '').includes(q) ||
        (r.terceroNombre?.toLowerCase() || '').includes(q) ||
        (r.terceroTelefono?.toLowerCase() || '').includes(q)
      );
    }
  }

  items = items.sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return NextResponse.json(items);
}

// POST /api/reservas  (crear)
// Body: { resourceId, start, end, memberId?, nombreContacto, contacto, medioContacto, invitados?, adelanto?, notas?, montoTotal? }
// Si se proporciona montoTotal, se usa ese valor. Si no, se calcula automáticamente.
export async function POST(req: NextRequest) {
  const user = await requireAuth(req, ['admin','caja','cobranzas']);
  const body = await req.json().catch(() => ({} as any));

  const {
    resourceId,
    start,
    end,
    memberId,
    nombreContacto,
    contacto,
    medioContacto,
    invitados = 0,
    adelanto = 0,
    notas = '',
    montoTotal,
  debitMovementId,
  debitMovementIds,
    
    // 🎉 Datos del evento/acontecimiento
    acontecimiento,
    quinceaneraFocusNombre,
    noviosNombres,
    cumpleaneroNombre,
    otrosDescripcion,
    otrosNombrePersona,

    // 👤 Reserva para tercero
    esParaTercero,
    terceroNombre,
    terceroCedula,
    terceroTelefono,
    terceroRuc,

    // 📝 Información adicional
    cantidadPersonas,
    observacionesGenerales,

    // 🕐 Hora extra
    horaExtra,
    cantidadHorasExtra,
    montoHorasExtra,

    // 📋 Requisitos APA
    requiereApa,
    apaComprobante,
    apaEstado,
    apaFechaEntrega,
    apaValidadoPor,
    apaObservaciones
  } = body || {};

  // Log para debug
  console.log('📊 Datos de reserva recibidos:', {
    resourceId,
    start,
    end,
    nombreContacto,
    contacto,
    medioContacto,
    montoTotal,
    memberId
  });
  
  // Validaciones más flexibles: contacto puede estar vacío si hay nombreContacto
  if (!resourceId || !start || !end || !nombreContacto) {
    console.error('❌ Faltan campos obligatorios:', { resourceId, start, end, nombreContacto });
    return NextResponse.json({ 
      msg: `Faltan campos obligatorios. resourceId: ${!!resourceId}, start: ${!!start}, end: ${!!end}, nombreContacto: ${!!nombreContacto}` 
    }, { status: 400 });
  }
  
  // Si no hay contacto, usar un valor por defecto
  const finalContacto = contacto || 'Sin especificar';
  const finalMedioContacto = medioContacto || 'presencial';

  const db = await getDb();

  // Validaciones básicas
  const startDate = new Date(start);
  const endDate   = new Date(end);
  if (!(startDate instanceof Date) || isNaN(startDate.getTime()) ||
      !(endDate   instanceof Date) || isNaN(endDate.getTime()) ||
      endDate <= startDate) {
    return NextResponse.json({ 
      msg: `Rango de fechas inválido. Inicio: ${start}, Fin: ${end}. Verifique que las fechas sean válidas y que la hora de fin sea posterior a la de inicio.` 
    }, { status: 400 });
  }

  // Conflictos
  const conflict = hasReservationConflict(db, resourceId, start, end);
  if (conflict) {
    return NextResponse.json({ 
      msg: `Ya existe una reserva en conflicto para el horario ${startDate.toLocaleString('es-ES')} - ${endDate.toLocaleString('es-ES')}. Verifique la disponibilidad del espacio.` 
    }, { status: 409 });
  }

  // Monto: usar el proporcionado o calcularlo automáticamente
  let finalMontoTotal: number;
  // 1) Si llegaron IDs de movimientos de débito relacionados, usar la suma de esos débitos
  if (Array.isArray((body as any).debitMovementIds) && (body as any).debitMovementIds.length) {
    const ids: string[] = (body as any).debitMovementIds;
    const movements = db.data.movements || [];
    const matched = ids.map(id => movements.find(m => m.id === id)).filter(m => !!m) as any[];
    const expectedTotal = matched.reduce((s, m) => s + (Number(m.monto) || 0), 0);

    if (expectedTotal > 0) {
      if (montoTotal !== undefined && Number(montoTotal) !== expectedTotal) {
        console.warn('⚠️ Inconsistencia detectada: montoTotal enviado difiere de la suma de débitos relacionados. Se usará la suma de los débitos.', { provided: montoTotal, expectedTotal });
      }
      finalMontoTotal = expectedTotal;
    } else {
      // Si no se encontró ninguno de los movimientos, caer al siguiente bloque
      // (calcular o usar montoTotal si viene)
      if (montoTotal !== undefined && montoTotal !== null && !isNaN(Number(montoTotal))) {
        finalMontoTotal = Number(montoTotal);
      } else {
        const quote = computeQuote(db, resourceId, start, end, invitados);
        finalMontoTotal = quote.monto + (montoHorasExtra ? Number(montoHorasExtra) : 0);
      }
    }
  }
  // 2) Si no hay debitMovementIds, respetar montoTotal si viene, pero validar horas extra
  else if (montoTotal !== undefined && montoTotal !== null && !isNaN(Number(montoTotal))) {
    // Si viene montoHorasExtra por separado, verificar consistencia
    if (montoHorasExtra !== undefined && montoHorasExtra !== null && !isNaN(Number(montoHorasExtra))) {
      const provided = Number(montoTotal);
      const horas = Number(montoHorasExtra);
      // Si el monto proporcionado es menor que solo las horas, asumimos que no las incluyó
      if (provided < horas) {
        console.warn('⚠️ montoTotal parece no incluir montoHorasExtra. Se ajustará sumando montoHorasExtra.', { provided, montoHorasExtra: horas });
        finalMontoTotal = provided + horas;
      } else {
        // Mantener lo enviado
        finalMontoTotal = provided;
      }
    } else {
      finalMontoTotal = Number(montoTotal);
    }
  }
  // 3) Si no vino montoTotal, calcular: quote + montoHorasExtra si existe
  else {
    const quote = computeQuote(db, resourceId, start, end, invitados);
    finalMontoTotal = quote.monto + (montoHorasExtra ? Number(montoHorasExtra) : 0);
  }

  const reservationId = await nextReservationId();
  const reservation: Reservation = {
    id: reservationId,
    resourceId,
    memberId: memberId || undefined,
    start,
    end,
    invitados,
    nombreContacto,
    contacto: finalContacto,
    medioContacto: finalMedioContacto,
    adelanto,
    montoTotal: finalMontoTotal,
    status: 'ACTIVO', // Todas las reservas nuevas empiezan como ACTIVO
    notas,
  // Guardar array de IDs relacionados (servicio + horas extra) si está disponible
  debitMovementIds: Array.isArray(debitMovementIds) && debitMovementIds.length ? debitMovementIds : undefined,
  // Compatibilidad: mantener single debitMovementId apuntando al primero si se envía
  debitMovementId: (debitMovementId || (Array.isArray(debitMovementIds) && debitMovementIds.length ? debitMovementIds[0] : undefined)) || undefined, // 🔗 Vincular con movimiento de débito

    // 🎉 Datos del evento/acontecimiento
    acontecimiento: acontecimiento || undefined,
    quinceaneraFocusNombre: quinceaneraFocusNombre || undefined,
    noviosNombres: noviosNombres || undefined,
    cumpleaneroNombre: cumpleaneroNombre || undefined,
    otrosDescripcion: otrosDescripcion || undefined,
    otrosNombrePersona: otrosNombrePersona || undefined,

    // 👤 Reserva para tercero
    esParaTercero: esParaTercero || undefined,
    terceroNombre: terceroNombre || undefined,
    terceroCedula: terceroCedula || undefined,
    terceroTelefono: terceroTelefono || undefined,
    terceroRuc: terceroRuc || undefined,

    // 📝 Información adicional
    cantidadPersonas: cantidadPersonas ? Number(cantidadPersonas) : undefined,
    observacionesGenerales: observacionesGenerales || undefined,

    // 🕐 Hora extra
    horaExtra: horaExtra || undefined,
    cantidadHorasExtra: cantidadHorasExtra ? Number(cantidadHorasExtra) : undefined,
    montoHorasExtra: montoHorasExtra ? Number(montoHorasExtra) : undefined,

    // 📋 Requisitos APA
    requiereApa: requiereApa || undefined,
    apaComprobante: apaComprobante || undefined,
    apaEstado: (apaEstado as 'PENDIENTE' | 'ENTREGADO' | 'VALIDADO') || (requiereApa ? 'PENDIENTE' : undefined),
    apaFechaEntrega: apaFechaEntrega || undefined,
    apaValidadoPor: apaValidadoPor || undefined,
    apaObservaciones: apaObservaciones || undefined,

    createdBy: user?.email || 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    pagos: adelanto > 0
      ? [{ 
          id: `RP-${Date.now()}`, 
          reservationId,
          fecha: new Date().toISOString(), 
          monto: Number(adelanto) || 0, 
          metodo: 'efectivo' as const
        }]
      : []
  };

  db.data.reservations.push(reservation);
  await db.write();

  return NextResponse.json(reservation, { status: 201 });
}
