import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// POST /api/reservas/update-expired
// Actualiza automáticamente las reservas que han pasado su fecha de fin
export async function POST(req: NextRequest) {
  await requireAuth(req); // cualquier usuario autenticado

  try {
    const db = await getDb();
    const now = new Date();
    
    console.log('🕒 UPDATE-EXPIRED: Iniciando actualización automática');
    console.log('🕒 Fecha actual:', now.toISOString());
    console.log('🕒 Total reservas:', db.data.reservations.length);
    
    // Buscar reservas activas que ya terminaron
    const expiredReservations = db.data.reservations.filter(reservation => {
      if (reservation.status !== 'ACTIVO') return false;
      const endTime = new Date(reservation.end);
      const expired = endTime <= now;
      
      if (reservation.status === 'ACTIVO') {
        console.log(`🕒 Reserva ${reservation.id}: End=${reservation.end}, Expired=${expired}`);
      }
      
      return expired;
    });
    
    console.log('🕒 Reservas expiradas encontradas:', expiredReservations.length);

    let updatedCount = 0;

    // Actualizar cada reserva expirada
    for (const reservation of expiredReservations) {
      const index = db.data.reservations.findIndex(r => r.id === reservation.id);
      if (index !== -1) {
        db.data.reservations[index] = {
          ...reservation,
          status: 'CULMINADO',
          updatedAt: now.toISOString()
        };
        updatedCount++;
      }
    }

    // Guardar cambios si hay actualizaciones
    if (updatedCount > 0) {
      await db.write();
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      message: updatedCount > 0 
        ? `Se actualizaron ${updatedCount} reservas a estado CULMINADO`
        : 'No hay reservas expiradas para actualizar'
    });

  } catch (error) {
    console.error('Error actualizando reservas expiradas:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}