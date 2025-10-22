import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const dbPath = join(__dirname, 'data', 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    const reservas = db.reservations || [];
    
    const ids = reservas.map(r => r.id);
    const uniqueIds = new Set(ids);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    
    console.log('📊 Total reservas:', reservas.length);
    console.log('🔍 IDs únicos:', uniqueIds.size);
    console.log('❌ Duplicados:', duplicates.length > 0 ? duplicates : 'Ninguno');
    console.log('\n📋 Lista de reservas:');
    
    reservas.forEach(r => {
        const date = new Date(r.start).toLocaleDateString('es-ES');
        const status = r.status === 'CONFIRMADO' ? '✅' : 
                      r.status === 'CANCELADO' ? '❌' : 
                      r.status === 'PENDIENTE' ? '⏳' : '❓';
        console.log(`  ${r.id} - ${r.nombreContacto || 'Sin nombre'} - ${status} ${r.status} - ${date}`);
    });
    
    if (duplicates.length === 0) {
        console.log('\n✅ ¡Perfecto! No hay IDs duplicados en las reservas.');
        console.log('🔧 El problema de cancelación debería estar resuelto.');
    } else {
        console.log('\n⚠️  Aún hay duplicados que deben resolverse.');
    }
    
} catch (error) {
    console.error('❌ Error verificando reservas:', error.message);
}