import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST /api/porteria/reservas-apa
 * Endpoint seguro para obtener reservas APA de un miembro específico
 * Solo permite acceso si el usuario es admin o está accediendo a sus propias reservas
 */
export async function POST(req: NextRequest) {
  try {
    // Verificar autenticación básica (cualquier usuario logueado)
    const user = await requireAuth(req);
    if (!user) {
      return NextResponse.json(
        { ok: false, msg: 'No autorizado. Debe iniciar sesión.' },
        { status: 401 }
      );
    }

    const { memberId } = await req.json();
    
    if (!memberId) {
      return NextResponse.json(
        { ok: false, msg: 'ID de miembro requerido' },
        { status: 400 }
      );
    }

    const db = await getDb();
    
    // Verificar permisos: Admin puede ver todas las reservas, 
    // usuarios normales solo sus propias reservas
    const isAdmin = user.rol === 'admin';
    
    if (!isAdmin) {
      // Para usuarios no-admin, verificar que solo accedan a sus propias reservas
      // Buscar el miembro por su ID para validar que coincida con el usuario actual
      const member = db.data.members?.find(m => m.id === memberId);
      
      if (!member) {
        return NextResponse.json(
          { ok: false, msg: 'Miembro no encontrado' },
          { status: 404 }
        );
      }
      
      // Verificar que el usuario está accediendo a sus propias reservas
      // Esto podría requerir una relación entre user.email y member.email
      // o user.id y member.userId, dependiendo de tu modelo de datos
      
      // Por ahora, solo permitimos acceso a admins para mayor seguridad
      // En una implementación completa, necesitarías establecer la relación usuario-miembro
      return NextResponse.json(
        { ok: false, msg: 'Solo los administradores pueden acceder a esta función desde portería. Los miembros deben usar la aplicación principal.' },
        { status: 403 }
      );
    }

    // Obtener reservas del miembro que requieren APA
    const allReservations = db.data.reservations || [];
    
    // Filtrar reservas por memberId y que requieran APA
    const memberApaReservations = allReservations.filter(reservation => 
      reservation.memberId === memberId && 
      reservation.requiereApa &&
      // Solo reservas activas, no históricas
      (reservation.status === 'ACTIVO' || 
       reservation.status === 'RESERVADO' || 
       reservation.status === 'CONFIRMADO' || 
       reservation.status === 'PENDIENTE')
    );

    // Ordenar por fecha de inicio (más recientes primero)
    const sortedReservations = memberApaReservations.sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
    );

    return NextResponse.json({
      ok: true,
      reservations: sortedReservations,
      member: { id: memberId },
      accessed_by: user.email,
      access_level: user.rol
    });

  } catch (error) {
    console.error('Error in porteria/reservas-apa:', error);
    return NextResponse.json(
      { ok: false, msg: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}