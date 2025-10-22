import fs from 'fs';

console.log('🔍 Simulación completa del flujo frontend...');

try {
  const dbData = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));
  
  // 1. Obtener reservas como lo hace fetchReservas
  const reservations = dbData.reservations || [];
  const activeReservations = reservations.filter(r => 
    r.status === 'ACTIVO' || r.status === 'RESERVADO' || r.status === 'CONFIRMADO' || r.status === 'PENDIENTE'
  );
  
  console.log(`📋 Reservas activas encontradas: ${activeReservations.length}`);
  
  // 2. Buscar RES-000002
  const targetReservation = activeReservations.find(r => r.id === 'RES-000002');
  
  if (!targetReservation) {
    console.log('❌ No se encontró RES-000002');
    process.exit(1);
  }
  
  console.log('✅ Reserva RES-000002:', {
    id: targetReservation.id,
    memberId: targetReservation.memberId,
    debitMovementId: targetReservation.debitMovementId,
    montoTotal: targetReservation.montoTotal,
    adelanto: targetReservation.adelanto
  });
  
  // 3. Simular getRelatedPayments
  if (targetReservation.debitMovementId && targetReservation.memberId) {
    console.log('\n🔗 Simulando getRelatedPayments...');
    
    // Buscar movimientos del socio (simulando API call)
    const movements = dbData.movements?.filter(m => m.memberId === targetReservation.memberId) || [];
    console.log(`📊 Movimientos del socio: ${movements.length}`);
    
    movements.forEach(mov => {
      console.log(`  - ${mov.id}: ${mov.tipo} | ${mov.monto} | allocations:`, mov.allocations);
    });
    
    // Aplicar filtro exacto de getRelatedPayments
    const relatedPayments = movements.filter((mov) => 
      mov.tipo === 'CREDIT' && 
      mov.allocations?.some((alloc) => alloc.debitId === targetReservation.debitMovementId)
    );
    
    console.log(`💰 Pagos relacionados encontrados: ${relatedPayments.length}`);
    relatedPayments.forEach(pago => {
      console.log(`  - PAGO ${pago.id}: ${pago.monto}`);
    });
    
    const totalPagado = relatedPayments.reduce((sum, pago) => sum + Math.abs(pago.monto || 0), 0);
    const adelantoPago = targetReservation.adelanto || 0;
    
    const result = {
      totalPagado: totalPagado + adelantoPago,
      pagosCount: relatedPayments.length + (adelantoPago > 0 ? 1 : 0)
    };
    
    console.log('\n✅ RESULTADO getRelatedPayments:', result);
    
    // 4. Simular renderizado
    const totalPagosDirectos = (targetReservation.pagos || []).reduce((sum, pago) => sum + (pago.monto || 0), 0);
    const totalPagadoFinal = result.totalPagado + totalPagosDirectos;
    const saldoPendiente = (targetReservation.montoTotal || 0) - totalPagadoFinal;
    
    console.log('\n📺 DATOS PARA RENDERIZADO:');
    console.log(`  💰 Total Pagado: Gs. ${totalPagadoFinal.toLocaleString()}`);
    console.log(`  ⚡ Saldo Pendiente: ${saldoPendiente <= 0 ? 'PAGADO' : 'Gs. ' + saldoPendiente.toLocaleString()}`);
  }
  
} catch (error) {
  console.error('❌ Error:', error);
}