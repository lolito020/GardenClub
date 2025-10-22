import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data', 'db.json');
const db = JSON.parse(readFileSync(dbPath, 'utf-8'));

console.log('\n=== Limpieza de attachments huérfanos ===\n');

// Obtener IDs de miembros válidos
const validMemberIds = new Set(db.members.map(m => m.id));
console.log(`Miembros válidos encontrados: ${validMemberIds.size}`);

// Limpiar attachments huérfanos
const originalAttachments = db.attachments.length;
db.attachments = db.attachments.filter(att => {
  if (!validMemberIds.has(att.memberId)) {
    console.log(`❌ Eliminando attachment huérfano: ${att.id} (memberId: ${att.memberId}, archivo: ${att.nombre})`);
    return false;
  }
  return true;
});

console.log(`\nAttachments: ${originalAttachments} -> ${db.attachments.length}`);
console.log(`Total eliminado: ${originalAttachments - db.attachments.length}`);

// Guardar cambios
writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log('\n✅ Base de datos limpiada y guardada correctamente\n');