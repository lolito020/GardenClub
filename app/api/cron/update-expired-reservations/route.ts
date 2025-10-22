import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/cron/update-expired-reservations
// Cron job para actualizar automáticamente reservas expiradas
export async function GET(req: NextRequest) {
  try {
    // Verificar que sea una llamada interna de cron (opcional: agregar autenticación por token)
    const authHeader = req.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const now = new Date();
    
    // Buscar reservas activas que ya terminaron
    const expiredReservations = db.data.reservations.filter(reservation => {
      if (reservation.status !== 'ACTIVO') return false;
      const endTime = new Date(reservation.end);
      return endTime <= now;
    });

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
      console.log(`🕒 CRON: Actualizadas ${updatedCount} reservas a estado CULMINADO`);
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      updatedCount,
      message: updatedCount > 0 
        ? `CRON: Se actualizaron ${updatedCount} reservas a estado CULMINADO`
        : 'CRON: No hay reservas expiradas para actualizar'
    });

  } catch (error) {
    console.error('Error en cron de actualización de reservas:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor', timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}