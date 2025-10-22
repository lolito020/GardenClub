import fs from 'fs';

console.log('🔍 Simulando llamada del frontend...');

// Simular lo que hace fetchReservas
try {
  const dbData = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));
  
  // Filtrar reservas como lo hace el API
  const reservations = dbData.reservations || [];
  const activeReservations = reservations.filter(r => 
    r.status === 'ACTIVO' || r.status === 'RESERVADO' || r.status === 'CONFIRMADO' || r.status === 'PENDIENTE'
  );
  
  console.log(`📋 Total reservas activas: ${activeReservations.length}`);
  
  // Buscar RES-000002 específicamente
  const targetReservation = activeReservations.find(r => r.id === 'RES-000002');
  
  if (!targetReservation) {
    console.log('❌ No se encontró la reserva RES-000002 en reservas activas');
    console.log('🔍 Verificando si existe en todas las reservas...');
    const allReservations = dbData.reservations.find(r => r.id === 'RES-000002');
    if (allReservations) {
      console.log('✅ La reserva existe pero su status es:', allReservations.status);
    }
  } else {
    console.log('✅ Reserva RES-000002 encontrada:');
    console.log({
      id: targetReservation.id,
      memberId: targetReservation.memberId,
      debitMovementId: targetReservation.debitMovementId,
      status: targetReservation.status,
      montoTotal: targetReservation.montoTotal
    });
    
    // Simular getRelatedPayments
    if (targetReservation.debitMovementId && targetReservation.memberId) {
      console.log('🔗 Tendría que buscar pagos relacionados...');
      
      // Buscar movimientos del socio
      const movements = dbData.movements?.filter(m => m.memberId === targetReservation.memberId) || [];
      console.log(`📊 Movimientos del socio ${targetReservation.memberId}: ${movements.length}`);
      
      // Buscar pagos relacionados
      const relatedPayments = movements.filter(mov => 
        mov.type === 'CREDIT' && 
        mov.allocation && mov.allocation.debitId === targetReservation.debitMovementId
      );
      
      console.log(`💰 Pagos relacionados: ${relatedPayments.length}`);
      relatedPayments.forEach(payment => {
        console.log(`  - ${payment.id}: ${payment.amount} (debitId: ${payment.allocation.debitId})`);
      });
      
      const totalPagado = relatedPayments.reduce((sum, pago) => sum + Math.abs(pago.amount || 0), 0);
      console.log(`✅ Total pagado calculado: ${totalPagado}`);
    }
  }
  
} catch (error) {
  console.error('❌ Error:', error);
}