import { NextRequest, NextResponse } from 'next/server';
import { getDb, type Reservation } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const updates = await request.json();

    // Obtener base de datos
    const db = await getDb();
    
    // Validar que la reservación existe
    const reservations = db.data.reservations;
    const reservationIndex = reservations.findIndex((r: Reservation) => r.id === id);
    
    if (reservationIndex === -1) {
      return NextResponse.json(
        { error: 'Reservación no encontrada' },
        { status: 404 }
      );
    }

    // Validar campos de actualización APA
    const allowedFields = ['apaEstado', 'apaComprobante', 'apaObservaciones', 'apaFechaEntrega', 'apaFechaRevision'];
    const validUpdates: any = {};

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        validUpdates[key] = value;
      }
    }

    // Agregar timestamp de revisión si es aprobación o rechazo
    if (validUpdates.apaEstado === 'APROBADO' || validUpdates.apaEstado === 'RECHAZADO') {
      validUpdates.apaFechaRevision = new Date().toISOString();
    }

    // Actualizar la reservación
    const updatedReservation = {
      ...reservations[reservationIndex],
      ...validUpdates,
      updatedAt: new Date().toISOString()
    };

    reservations[reservationIndex] = updatedReservation;
    await db.write();

    // Log de la acción para auditoría
    console.log(`APA Status Update - Reservation: ${id}, New Status: ${validUpdates.apaEstado}, Timestamp: ${new Date().toISOString()}`);

    return NextResponse.json({
      success: true,
      reservation: updatedReservation,
      message: `Estado APA actualizado a: ${validUpdates.apaEstado}`
    });

  } catch (error) {
    console.error('Error updating APA status:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor al actualizar estado APA' },
      { status: 500 }
    );
  }
}