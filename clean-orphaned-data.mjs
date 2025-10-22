import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function cleanOrphanedData() {
  const dbPath = join(__dirname, 'data', 'db.json');
  
  console.log('📂 Leyendo base de datos...');
  const dbContent = await readFile(dbPath, 'utf-8');
  const db = JSON.parse(dbContent);
  
  // Obtener IDs de miembros válidos
  const validMemberIds = new Set(db.members.map(m => m.id));
  console.log(`✅ Miembros válidos encontrados: ${validMemberIds.size}`);
  
  // Contador de registros eliminados
  let stats = {
    payments: 0,
    movements: 0,
    reservations: 0,
    memberSubscriptions: 0,
    families: 0
  };
  
  // Limpiar pagos huérfanos
  const originalPaymentsCount = db.payments.length;
  db.payments = db.payments.filter(payment => {
    if (validMemberIds.has(payment.memberId)) {
      return true;
    }
    stats.payments++;
    return false;
  });
  console.log(`💰 Pagos: ${originalPaymentsCount} -> ${db.payments.length} (eliminados: ${stats.payments})`);
  
  // Limpiar movimientos huérfanos
  const originalMovementsCount = db.movements.length;
  db.movements = db.movements.filter(movement => {
    if (validMemberIds.has(movement.memberId)) {
      return true;
    }
    stats.movements++;
    return false;
  });
  console.log(`📊 Movimientos: ${originalMovementsCount} -> ${db.movements.length} (eliminados: ${stats.movements})`);
  
  // Limpiar reservas huérfanas
  if (db.reservations) {
    const originalReservationsCount = db.reservations.length;
    db.reservations = db.reservations.filter(reservation => {
      if (validMemberIds.has(reservation.memberId)) {
        return true;
      }
      stats.reservations++;
      return false;
    });
    console.log(`📅 Reservas: ${originalReservationsCount} -> ${db.reservations.length} (eliminados: ${stats.reservations})`);
  }
  
  // Limpiar suscripciones huérfanas
  if (db.memberSubscriptions) {
    const originalSubscriptionsCount = db.memberSubscriptions.length;
    db.memberSubscriptions = db.memberSubscriptions.filter(subscription => {
      if (validMemberIds.has(subscription.memberId)) {
        return true;
      }
      stats.memberSubscriptions++;
      return false;
    });
    console.log(`🔄 Suscripciones: ${originalSubscriptionsCount} -> ${db.memberSubscriptions.length} (eliminados: ${stats.memberSubscriptions})`);
  }
  
  // Limpiar familiares huérfanos
  if (db.families) {
    const originalFamiliesCount = db.families.length;
    db.families = db.families.filter(family => {
      if (validMemberIds.has(family.socioTitularId)) {
        return true;
      }
      stats.families++;
      return false;
    });
    console.log(`👨‍👩‍👧‍👦 Familiares: ${originalFamiliesCount} -> ${db.families.length} (eliminados: ${stats.families})`);
  }
  
  // Crear backup antes de guardar
  const backupPath = join(__dirname, 'data', `db.backup-before-cleanup-${Date.now()}.json`);
  await writeFile(backupPath, dbContent, 'utf-8');
  console.log(`\n💾 Backup creado: ${backupPath}`);
  
  // Guardar base de datos limpia
  await writeFile(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  console.log('✅ Base de datos limpiada y guardada correctamente');
  
  // Resumen
  const totalRemoved = Object.values(stats).reduce((sum, count) => sum + count, 0);
  console.log('\n📊 RESUMEN:');
  console.log(`   Total de registros eliminados: ${totalRemoved}`);
  console.log(`   - Pagos: ${stats.payments}`);
  console.log(`   - Movimientos: ${stats.movements}`);
  console.log(`   - Reservas: ${stats.reservations}`);
  console.log(`   - Suscripciones: ${stats.memberSubscriptions}`);
  console.log(`   - Familiares: ${stats.families}`);
  
  if (totalRemoved === 0) {
    console.log('\n✨ No se encontraron datos huérfanos. La base de datos está limpia.');
  } else {
    console.log('\n✨ Limpieza completada exitosamente.');
  }
}

// Ejecutar
cleanOrphanedData().catch(error => {
  console.error('❌ Error durante la limpieza:', error);
  process.exit(1);
});
