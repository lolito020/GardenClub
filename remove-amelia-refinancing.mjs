import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const dbPath = path.join(__dirname, 'data', 'db.json');

// Adapter para LowDB
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, { members: [], movements: [], refinancings: [] });

async function removeAmeliaRefinancing() {
  await db.read();
  
  console.log('🔍 Buscando refinanciaciones de Amelia González...');
  
  // 1. Encontrar a Amelia González
  const amelia = db.data.members?.find(m => 
    m.nombres?.toLowerCase().includes('amelia') && 
    m.apellidos?.toLowerCase().includes('gonzalez')
  ) || db.data.members?.find(m => 
    m.nombre?.toLowerCase().includes('amelia') && 
    m.apellido?.toLowerCase().includes('gonzalez')
  );
  
  if (!amelia) {
    console.log('❌ No se encontró a Amelia González en la base de datos');
    return;
  }
  
  console.log(`✅ Encontrada: ${amelia.nombres || amelia.nombre} ${amelia.apellidos || amelia.apellido} (ID: ${amelia.id})`);
  
  // 2. Buscar refinanciaciones de Amelia
  const refinancings = db.data.refinancings?.filter(r => r.memberId === amelia.id) || [];
  
  if (refinancings.length === 0) {
    console.log('❌ No se encontraron refinanciaciones para Amelia González');
    return;
  }
  
  console.log(`📋 Encontradas ${refinancings.length} refinanciación(es):`);
  refinancings.forEach((ref, i) => {
    console.log(`  ${i + 1}. ID: ${ref.id}, Estado: ${ref.status}, Cuotas: ${ref.installments}, Monto: ${ref.principal}`);
  });
  
  // 3. Para cada refinanciación, revertir los cambios
  for (const refinancing of refinancings) {
    console.log(`\n🔄 Revirtiendo refinanciación ${refinancing.id}...`);
    
    // 3a. Restaurar los débitos originales (quitar CANCELADO, eliminar refinancingId)
    if (refinancing.originalDebitIds) {
      for (const originalDebitId of refinancing.originalDebitIds) {
        const movement = db.data.movements.find(m => m.id === originalDebitId);
        if (movement) {
          console.log(`  ↻ Restaurando débito original: ${movement.concepto} (${movement.monto})`);
          movement.status = 'PENDIENTE'; // Restaurar estado
          delete movement.refinancingId; // Quitar vínculo
        }
      }
    }
    
    // 3b. Eliminar las cuotas generadas por la refinanciación
    const refinancingMovements = db.data.movements.filter(m => m.refinancingId === refinancing.id);
    console.log(`  🗑️ Eliminando ${refinancingMovements.length} cuotas/anticipos generados...`);
    
    // Mantener solo los movimientos que NO pertenecen a esta refinanciación
    db.data.movements = db.data.movements.filter(m => m.refinancingId !== refinancing.id);
    
    // 3c. Eliminar el registro de refinanciación
    console.log(`  🗑️ Eliminando registro de refinanciación...`);
  }
  
  // Eliminar todas las refinanciaciones de Amelia
  const originalRefinancingCount = db.data.refinancings.length;
  db.data.refinancings = db.data.refinancings.filter(r => r.memberId !== amelia.id);
  const removedCount = originalRefinancingCount - db.data.refinancings.length;
  
  console.log(`✅ Eliminadas ${removedCount} refinanciación(es) de la base de datos`);
  
  // 4. Guardar cambios
  await db.write();
  console.log('\n💾 Cambios guardados en la base de datos');
  console.log('✅ Proceso completado. Amelia González ya no tiene refinanciaciones activas.');
  
  // 5. Resumen final
  console.log('\n📊 RESUMEN:');
  console.log(`- Refinanciaciones eliminadas: ${removedCount}`);
  console.log(`- Débitos originales restaurados: ${refinancings.reduce((acc, r) => acc + (r.originalDebitIds?.length || 0), 0)}`);
  console.log(`- Cuotas/anticipos eliminados: ${refinancings.reduce((acc, r) => {
    const relatedMovements = db.data.movements?.filter(m => m.refinancingId === r.id) || [];
    return acc + relatedMovements.length;
  }, 0)}`);
}

// Ejecutar script
removeAmeliaRefinancing().catch(console.error);