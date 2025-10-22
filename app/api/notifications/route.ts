import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications
 * Obtiene notificaciones para el usuario actual
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json(
        { ok: false, msg: 'No autorizado' },
        { status: 401 }
      );
    }

    const db = await getDb();
    
    // Obtener notificaciones del usuario (esto requeriría un sistema de notificaciones más completo)
    // Por ahora, crearemos notificaciones basadas en cambios de estado de APA
    
    const notifications: Array<{
      id: string;
      type: 'apa_status_change' | 'apa_uploaded' | 'apa_required';
      title: string;
      message: string;
      date: string;
      read: boolean;
      reservationId?: string;
      priority: 'low' | 'medium' | 'high';
    }> = [];

    // Si es admin, mostrar notificaciones de APAs que requieren revisión
    if (user.rol === 'admin') {
      const reservations = db.data.reservations || [];
      const pendingReview = reservations.filter(r => 
        r.requiereApa && r.apaEstado === 'ENTREGADO'
      );

      pendingReview.forEach(reservation => {
        notifications.push({
          id: `apa-review-${reservation.id}`,
          type: 'apa_uploaded',
          title: '📋 APA pendiente de revisión',
          message: `La reserva de ${reservation.nombreContacto} tiene un APA que requiere revisión`,
          date: reservation.apaFechaEntrega || reservation.updatedAt || reservation.createdAt || new Date().toISOString(),
          read: false,
          reservationId: reservation.id,
          priority: 'high'
        });
      });

      const pendingUpload = reservations.filter(r => 
        r.requiereApa && r.apaEstado === 'PENDIENTE'
      ).length;

      if (pendingUpload > 0) {
        notifications.push({
          id: `apa-pending-${Date.now()}`,
          type: 'apa_required',
          title: `📝 ${pendingUpload} APA${pendingUpload > 1 ? 's' : ''} pendiente${pendingUpload > 1 ? 's' : ''}`,
          message: `Hay ${pendingUpload} reserva${pendingUpload > 1 ? 's' : ''} esperando que ${pendingUpload > 1 ? 'suban sus' : 'suba su'} autorización de padres`,
          date: new Date().toISOString(),
          read: false,
          priority: 'medium'
        });
      }
    }

    // Ordenar por prioridad y fecha
    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    notifications.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return NextResponse.json({
      ok: true,
      notifications,
      unreadCount: notifications.filter(n => !n.read).length
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { ok: false, msg: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notifications/mark-read
 * Marca notificaciones como leídas
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json(
        { ok: false, msg: 'No autorizado' },
        { status: 401 }
      );
    }

    const { notificationIds } = await req.json();
    
    if (!Array.isArray(notificationIds)) {
      return NextResponse.json(
        { ok: false, msg: 'IDs de notificaciones inválidos' },
        { status: 400 }
      );
    }

    // En una implementación completa, aquí actualizarías el estado de las notificaciones en la DB
    // Por ahora, simplemente respondemos con éxito
    
    return NextResponse.json({
      ok: true,
      message: 'Notificaciones marcadas como leídas'
    });

  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { ok: false, msg: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}