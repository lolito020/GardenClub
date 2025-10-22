import { JSONFilePreset } from 'lowdb/node';
import fs from 'fs';
import path from 'path';

const dbFile = path.join(process.cwd(), 'data', 'db.json');

async function cleanOrphanedAllocations() {
  if (!fs.existsSync(dbFile)) {
    console.log('❌ db.json no encontrado');
    return;
  }

  console.log('🔍 Cargando base de datos...');
  const db = await JSONFilePreset(dbFile, {});
  
  // Obtener todos los IDs de movimientos existentes
  const existingMovementIds = new Set(
    (db.data.movements || []).map(m => m.id)
  );
  
  console.log(`📊 Movimientos existentes: ${existingMovementIds.size}`);
  
  let orphanedCount = 0;
  let cleanedMovements = 0;
  let cleanedPayments = 0;
  
  // Limpiar allocations en movimientos
  if (db.data.movements) {
    for (const movement of db.data.movements) {
      if (Array.isArray(movement.allocations)) {
        const originalLength = movement.allocations.length;
        movement.allocations = movement.allocations.filter(a => {
          const isValid = !a.debitId || existingMovementIds.has(a.debitId);
          if (!isValid) orphanedCount++;
          return isValid;
        });
        
        if (movement.allocations.length !== originalLength) {
          cleanedMovements++;
        }
      }
    }
  }
  
  // Limpiar allocations en pagos
  if (db.data.payments) {
    for (const payment of db.data.payments) {
      if (Array.isArray(payment.allocations)) {
        const originalLength = payment.allocations.length;
        payment.allocations = payment.allocations.filter(a => {
          const isValid = !a.debitId || existingMovementIds.has(a.debitId);
          if (!isValid) orphanedCount++;
          return isValid;
        });
        
        if (payment.allocations.length !== originalLength) {
          cleanedPayments++;
        }
      }
    }
  }
  
  if (orphanedCount > 0) {
    console.log(`🧹 Limpiando ${orphanedCount} allocations huérfanas...`);
    console.log(`📝 Movimientos afectados: ${cleanedMovements}`);
    console.log(`💳 Pagos afectados: ${cleanedPayments}`);
    
    await db.write();
    console.log('✅ Base de datos actualizada');
  } else {
    console.log('✅ No se encontraron allocations huérfanas');
  }
}

cleanOrphanedAllocations().catch(console.error);