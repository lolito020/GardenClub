import fs from 'fs';

console.log('🔍 Simulando API /api/members/m2/movements...');

try {
  const dbData = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));
  
  // Simular exactamente lo que hace el endpoint API
  const movements = dbData.movements?.filter(m => m.memberId === 'm2') || [];
  
  console.log(`📊 Movimientos encontrados para m2: ${movements.length}`);
  
  // Mostrar la respuesta exacta que devuelve la API
  const apiResponse = movements.map(mov => ({
    id: mov.id,
    memberId: mov.memberId,
    fecha: mov.fecha,
    concepto: mov.concepto,
    tipo: mov.tipo,
    monto: mov.monto,
    origen: mov.origen,
    refId: mov.refId,
    allocations: mov.allocations
  }));
  
  console.log('\n📡 RESPUESTA API (JSON):');
  console.log(JSON.stringify(apiResponse, null, 2));
  
  // Verificar el filtro específico
  console.log('\n🔍 APLICANDO FILTRO getRelatedPayments:');
  const targetDebitId = 'MOV-000059';
  
  const relatedPayments = apiResponse.filter((mov) => 
    mov.tipo === 'CREDIT' && 
    mov.allocations?.some((alloc) => alloc.debitId === targetDebitId)
  );
  
  console.log(`💰 Pagos relacionados a ${targetDebitId}: ${relatedPayments.length}`);
  relatedPayments.forEach(pago => {
    console.log(`  ✅ ${pago.id}: ${pago.monto} (${pago.concepto})`);
  });
  
  const totalPagado = relatedPayments.reduce((sum, pago) => sum + Math.abs(pago.monto || 0), 0);
  console.log(`\n💵 TOTAL CALCULADO: ${totalPagado}`);
  
} catch (error) {
  console.error('❌ Error:', error);
}