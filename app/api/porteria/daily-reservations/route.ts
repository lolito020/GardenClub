import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { getCurrentLocalDate } from '@/lib/timezone-config';

export const dynamic = 'force-dynamic';

/**
 * GET /api/porteria/daily-reservations
 * Endpoint para obtener todas las reservas del día actual y próximas
 * Solo información básica, sin datos de pagos
 */
export async function GET(req: NextRequest) {
  try {
    // Verificar que sea usuario con rol de portería o admin
    const user = await requireAuth(req, ['admin', 'porteria']);
    if (!user) {
      return NextResponse.json(
        { ok: false, msg: 'No autorizado. Acceso solo para portería.' },
        { status: 401 }
      );
    }

    const db = await getDb();
    
    // Obtener fecha actual en formato YYYY-MM-DD usando timezone local
    const today = getCurrentLocalDate();
    const todayStr = today.toISOString().split('T')[0];
    
    // Obtener fecha de mañana para filtrar próximas
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Obtener todas las reservas
    const allReservations = db.data.reservations || [];
    
    // Filtrar reservas de hoy y mañana
    const todayReservations = allReservations.filter(reservation => {
      const reservationDate = reservation.start.split('T')[0];
      return reservationDate === todayStr && reservation.status !== 'CANCELADO';
    });

    const tomorrowReservations = allReservations.filter(reservation => {
      const reservationDate = reservation.start.split('T')[0];
      return reservationDate === tomorrowStr && reservation.status !== 'CANCELADO';
    });

    // Función para procesar reservas y agregar información del socio
    const processReservations = (reservations: any[]) => {
      return reservations.map(reservation => {
        // Obtener información del recurso/espacio
        const resource = db.data.resources?.find(r => r.id === reservation.resourceId);
        
        // Obtener información del socio si existe
        let memberInfo = null;
        if (reservation.memberId) {
          const member = db.data.members.find(m => m.id === reservation.memberId);
          if (member) {
            memberInfo = {
              codigo: member.codigo,
              nombres: member.nombres,
              apellidos: member.apellidos,
              categoria: member.categoria
            };
          }
        }

        return {
          id: reservation.id,
          fecha: reservation.start.split('T')[0],
          horaInicio: new Date(reservation.start).toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'}),
          horaFin: new Date(reservation.end).toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'}),
          espacio: resource?.nombre || reservation.resourceId,
          nombreContacto: reservation.nombreContacto,
          contacto: reservation.contacto,
          status: reservation.status,
          invitados: reservation.invitados || 0,
          esParaTercero: reservation.esParaTercero || false,
          terceroNombre: reservation.terceroNombre,
          acontecimiento: reservation.acontecimiento,
          socio: memberInfo,
          notas: reservation.notas
        };
      }).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)); // Ordenar por hora
    };

    const processedTodayReservations = processReservations(todayReservations);
    const processedTomorrowReservations = processReservations(tomorrowReservations);

    // Estadísticas rápidas
    const stats = {
      today: {
        total: processedTodayReservations.length,
        porEspacio: processedTodayReservations.reduce((acc, r) => {
          acc[r.espacio] = (acc[r.espacio] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        porHora: processedTodayReservations.reduce((acc, r) => {
          const hora = r.horaInicio.split(':')[0] + ':00';
          acc[hora] = (acc[hora] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      },
      tomorrow: {
        total: processedTomorrowReservations.length
      }
    };

    return NextResponse.json({
      ok: true,
      date: todayStr,
      today: processedTodayReservations,
      tomorrow: processedTomorrowReservations,
      stats,
      consultedBy: user.email,
      timestamp: getCurrentLocalDate().toISOString()
    });

  } catch (error) {
    console.error('Error in porteria/daily-reservations:', error);
    return NextResponse.json(
      { ok: false, msg: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
