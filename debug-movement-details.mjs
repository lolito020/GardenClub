import fs from 'fs';

console.log('🔍 Investigación detallada de movimientos...');

try {
  const dbData = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));
  
  // Buscar movimientos del socio m2
  const movements = dbData.movements?.filter(m => m.memberId === 'm2') || [];
  
  console.log(`📊 Movimientos del socio m2: ${movements.length}`);
  movements.forEach(mov => {
    console.log(`\n📋 MOV ${mov.id}:`);
    console.log(`  type: ${mov.type}`);
    console.log(`  description: ${mov.description}`);
    console.log(`  amount: ${mov.amount}`);
    console.log(`  allocation:`, JSON.stringify(mov.allocation, null, 2));
  });
  
  // Verificar específicamente el filtro
  console.log('\n🔍 Aplicando filtro:');
  movements.forEach(mov => {
    const isCreditType = mov.type === 'CREDIT';
    const hasAllocation = mov.allocation && mov.allocation.debitId;
    const matchesDebitId = mov.allocation && mov.allocation.debitId === 'MOV-000059';
    
    console.log(`\n📋 MOV ${mov.id}:`);
    console.log(`  ✓ type === 'CREDIT': ${isCreditType}`);
    console.log(`  ✓ has allocation: ${!!hasAllocation}`);
    console.log(`  ✓ debitId === 'MOV-000059': ${matchesDebitId}`);
    console.log(`  → MATCHES FILTER: ${isCreditType && hasAllocation && matchesDebitId}`);
  });
  
} catch (error) {
  console.error('❌ Error:', error);
}