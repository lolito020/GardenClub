import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data', 'db.json');
const db = JSON.parse(readFileSync(dbPath, 'utf-8'));

console.log('\n=== Limpieza de refinanciaciones huérfanas ===\n');

// Obtener IDs de miembros válidos
const validMemberIds = new Set(db.members.map(m => m.id));
console.log(`Miembros válidos encontrados: ${validMemberIds.size}`);

// Limpiar refinanciaciones huérfanas
const originalRefinancings = db.refinancings.length;
db.refinancings = db.refinancings.filter(ref => {
  if (!validMemberIds.has(ref.memberId)) {
    console.log(`❌ Eliminando refinanciación huérfana: ${ref.id} (memberId: ${ref.memberId}, status: ${ref.status})`);
    return false;
  }
  return true;
});

console.log(`\nRefinanciaciones: ${originalRefinancings} -> ${db.refinancings.length}`);
console.log(`Total eliminado: ${originalRefinancings - db.refinancings.length}`);

// Guardar cambios
writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('\n✅ Base de datos limpiada y guardada correctamente\n');
