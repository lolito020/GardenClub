const fs = require('fs');
const path = require('path');

async function removeAmeliaRefinancing() {
  const dbPath = path.join(__dirname, 'data', 'db.json');
  
  console.log('🔍 Leyendo base de datos...');
  const rawData = fs.readFileSync(dbPath, 'utf8');
  const db = JSON.parse(rawData);
  
  console.log('🔍 Buscando refinanciaciones de Amelia González...');
  
  // ID de Amelia
  const ameliaId = "yzpuKIpCt4X4nhQ3mn5gI";
  
  // Buscar refinanciaciones de Amelia
  const refinancings = db.refinancings?.filter(r => r.memberId === ameliaId) || [];
  
  if (refinancings.length === 0) {
    console.log('❌ No se encontraron refinanciaciones para Amelia González');
    return;
  }
  
  console.log(`📋 Encontradas ${refinancings.length} refinanciación(es):`);
  refinancings.forEach((ref, i) => {
    console.log(`  ${i + 1}. ID: ${ref.id}, Estado: ${ref.status}, Cuotas: ${ref.installments}, Monto: ${ref.principal}`);
  });
  
  // Para cada refinanciación, revertir los cambios
  for (const refinancing of refinancings) {
    console.log(`\n🔄 Revirtiendo refinanciación ${refinancing.id}...`);
    
    // Restaurar los débitos originales
    if (refinancing.originalDebitIds) {
      for (const originalDebitId of refinancing.originalDebitIds) {
        const movement = db.movements.find(m => m.id === originalDebitId);
        if (movement) {
          console.log(`  ↻ Restaurando débito original: ${movement.concepto} (${movement.monto})`);
          movement.status = 'PENDIENTE'; // Restaurar estado
          delete movement.refinancingId; // Quitar vínculo
        }
      }
    }
    
    // Eliminar las cuotas generadas por la refinanciación
    const refinancingMovements = db.movements.filter(m => m.refinancingId === refinancing.id);
    console.log(`  🗑️ Eliminando ${refinancingMovements.length} cuotas/anticipos generados...`);
    
    // Mantener solo los movimientos que NO pertenecen a esta refinanciación
    db.movements = db.movements.filter(m => m.refinancingId !== refinancing.id);
  }
  
  // Eliminar todas las refinanciaciones de Amelia
  const originalRefinancingCount = db.refinancings.length;
  db.refinancings = db.refinancings.filter(r => r.memberId !== ameliaId);
  const removedCount = originalRefinancingCount - db.refinancings.length;
  
  console.log(`✅ Eliminadas ${removedCount} refinanciación(es) de la base de datos`);
  
  // Guardar cambios
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log('\n💾 Cambios guardados en la base de datos');
  console.log('✅ Proceso completado. Amelia González ya no tiene refinanciaciones activas.');
  
  // Resumen final
  console.log('\n📊 RESUMEN:');
  console.log(`- Refinanciaciones eliminadas: ${removedCount}`);
  console.log(`- Débitos originales restaurados: ${refinancings.reduce((acc, r) => acc + (r.originalDebitIds?.length || 0), 0)}`);
}

// Ejecutar script
removeAmeliaRefinancing().catch(console.error);