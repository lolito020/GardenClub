import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'data', 'db.json');

console.log('🔍 Leyendo base de datos...');
const data = JSON.parse(readFileSync(dbPath, 'utf8'));

console.log(`📊 Total de reservas: ${data.reservations.length}`);

// Encontrar duplicados
const seenIds = new Set();
const duplicates = [];
const unique = [];

data.reservations.forEach((reservation, index) => {
  if (seenIds.has(reservation.id)) {
    console.log(`⚠️  Duplicado encontrado: ${reservation.id} (índice ${index})`);
    duplicates.push({ ...reservation, originalIndex: index });
  } else {
    seenIds.add(reservation.id);
    unique.push(reservation);
  }
});

console.log(`🔍 Reservas únicas: ${unique.length}`);
console.log(`⚠️  Reservas duplicadas: ${duplicates.length}`);

if (duplicates.length > 0) {
  console.log('\n🛠️  Reasignando IDs a reservas duplicadas...');
  
  duplicates.forEach((dup, index) => {
    // Generar nuevo ID basado en timestamp y índice
    const newId = `RES-${Date.now()}-${index + 1}`;
    console.log(`   ${dup.id} → ${newId}`);
    
    // Agregar con nuevo ID
    unique.push({
      ...dup,
      id: newId,
      updatedAt: new Date().toISOString()
    });
  });
  
  // Actualizar base de datos
  data.reservations = unique;
  
  console.log('\n💾 Guardando cambios...');
  writeFileSync(dbPath, JSON.stringify(data, null, 2));
  
  console.log('✅ Base de datos actualizada exitosamente');
  console.log(`📊 Total de reservas después de la corrección: ${data.reservations.length}`);
} else {
  console.log('✅ No se encontraron duplicados');
}