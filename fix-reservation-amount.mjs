import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const dbPath = join(__dirname, 'data', 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    // Buscar la reserva de Ana María Gómez Silva
    const reserva = db.reservations.find(r => 
        r.nombreContacto === 'Ana María Gómez Silva' && 
        r.status === 'ACTIVO'
    );
    
    if (reserva) {
        console.log('📋 Reserva encontrada:');
        console.log(`  🆔 ID: ${reserva.id}`);
        console.log(`  👤 Cliente: ${reserva.nombreContacto}`);
        console.log(`  💰 Monto actual: Gs. ${reserva.montoTotal?.toLocaleString()}`);
        
        // Corregir el monto a 100.000 como debe ser
        const montoAnterior = reserva.montoTotal;
        reserva.montoTotal = 100000;
        reserva.updatedAt = new Date().toISOString();
        
        // Agregar una nota explicativa
        if (!reserva.notas) {
            reserva.notas = '';
        }
        reserva.notas = 'Monto corregido: valor manual desde página de socios (Gs. 100.000)';
        
        // Guardar los cambios
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        
        console.log('\n✅ Reserva corregida:');
        console.log(`  💰 Monto anterior: Gs. ${montoAnterior?.toLocaleString()}`);
        console.log(`  💵 Monto corregido: Gs. ${reserva.montoTotal.toLocaleString()}`);
        console.log(`  📝 Nota agregada: ${reserva.notas}`);
        console.log('\n🎯 Ahora en la página de reservas debería mostrar:');
        console.log(`  💰 Total: Gs. ${reserva.montoTotal.toLocaleString()}`);
        console.log(`  💳 Pagos: Gs. 0`);
        console.log(`  ⚡ Saldo Pendiente: Gs. ${reserva.montoTotal.toLocaleString()}`);
        
    } else {
        console.log('❌ No se encontró la reserva de Ana María Gómez Silva activa');
    }
    
} catch (error) {
    console.error('❌ Error corrigiendo la reserva:', error.message);
}