import fs from 'fs';

console.log('🔍 Diagnóstico del sistema de integración de pagos...');

try {
  // Leer el archivo de base de datos
  const dbContent = fs.readFileSync('data/db.json', 'utf8');
  const db = JSON.parse(dbContent);
  
  console.log('\n📊 ANÁLISIS DEL SISTEMA:');
  
  // Verificar reservas con debitMovementId
  const reservasConDebitId = db.reservations?.filter(r => r.debitMovementId) || [];
  console.log(`✅ Reservas vinculadas a débitos: ${reservasConDebitId.length}`);
  
  // Verificar movimientos con allocations
  const movementsConAllocations = db.movements?.filter(m => m.allocations && m.allocations.length > 0) || [];
  console.log(`✅ Movimientos con asignaciones: ${movementsConAllocations.length}`);
  
  // Verificar pagos con allocations
  const pagosConAllocations = db.payments?.filter(p => p.allocations && p.allocations.length > 0) || [];
  console.log(`✅ Pagos con asignaciones: ${pagosConAllocations.length}`);
  
  console.log('\n🔗 VERIFICACIÓN DE VÍNCULOS:');
  
  // Para cada reserva vinculada, verificar si hay pagos relacionados
  let reservasConPagosCorrectos = 0;
  reservasConDebitId.forEach(reserva => {
    const debitoId = reserva.debitMovementId;
    const pagoRelacionado = db.payments?.find(p => 
      p.allocations?.some(a => a.debitId === debitoId)
    );
    
    if (pagoRelacionado) {
      reservasConPagosCorrectos++;
      console.log(`  ✅ Reserva ${reserva.id.substring(0,8)}... → Débito ${debitoId} → Pago ${pagoRelacionado.id}`);
    } else {
      console.log(`  ⚠️  Reserva ${reserva.id.substring(0,8)}... → Débito ${debitoId} (sin pago)`);
    }
  });
  
  console.log(`\n📈 RESULTADOS:`);
  console.log(`   • Total reservas vinculadas: ${reservasConDebitId.length}`);
  console.log(`   • Reservas con pagos correctos: ${reservasConPagosCorrectos}`);
  console.log(`   • Sistema de integración: ${reservasConPagosCorrectos > 0 ? '✅ FUNCIONANDO' : '⚠️ NECESITA DATOS'}`);
  
  // Verificar código en página de socios
  const sociosContent = fs.readFileSync('app/admin/socios/page.tsx', 'utf8');
  const tieneDebitMovementId = sociosContent.includes('debitMovementId:');
  console.log(`   • Código actualizado en socios: ${tieneDebitMovementId ? '✅ SÍ' : '❌ NO'}`);
  
  // Verificar código en página de reservas
  const reservasContent = fs.readFileSync('app/admin/reservas/page.tsx', 'utf8');
  const tieneGetRelatedPayments = reservasContent.includes('getRelatedPayments');
  console.log(`   • Función getRelatedPayments: ${tieneGetRelatedPayments ? '✅ SÍ' : '❌ NO'}`);
  
  console.log('\n🎯 PRÓXIMOS PASOS:');
  console.log('   1. Crear una reserva AL CONTADO desde página de socios');
  console.log('   2. Verificar que aparece correctamente pagada en página de reservas');
  console.log('   3. Sistema completo de integración funcionando ✨');
  
} catch (error) {
  console.error('❌ Error en diagnóstico:', error);
}