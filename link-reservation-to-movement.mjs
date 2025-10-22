import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const dbPath = join(__dirname, 'data', 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    console.log('🔍 Buscando reserva y movimiento relacionado...\n');
    
    // Buscar la reserva de Ana María Gómez Silva
    const reserva = db.reservations?.find(r => 
        r.nombreContacto === 'Ana María Gómez Silva' && 
        r.status === 'ACTIVO'
    );
    
    if (!reserva) {
        console.log('❌ No se encontró la reserva de Ana María Gómez Silva');
        process.exit(1);
    }
    
    console.log('📋 Reserva encontrada:');
    console.log(`  🆔 ID: ${reserva.id}`);
    console.log(`  👤 Cliente: ${reserva.nombreContacto}`);
    console.log(`  🏢 Recurso: ${reserva.resourceId}`);
    console.log(`  💰 Monto: Gs. ${reserva.montoTotal?.toLocaleString()}`);
    console.log(`  🔗 Movimiento vinculado: ${reserva.debitMovementId || 'NINGUNO'}`);
    
    // Buscar el movimiento de débito relacionado
    const movements = db.movements || [];
    
    // Buscar débito de tenis para Ana María en fechas cercanas
    const debitMovement = movements.find(mov => 
        mov.memberId === reserva.memberId && 
        (mov.tipo === 'DEUDA' || mov.tipo === 'DEBIT') &&
        (mov.concepto?.toLowerCase().includes('tenis') || mov.concepto?.toLowerCase().includes('mensual')) &&
        Math.abs(mov.monto) >= 90000 && // Monto cercano a 100.000
        new Date(mov.fecha) >= new Date('2025-09-25') && // Fecha cercana
        new Date(mov.fecha) <= new Date('2025-09-27')
    );
    
    if (!debitMovement) {
        console.log('\n❌ No se encontró movimiento de débito relacionado');
        console.log('📊 Movimientos del socio:');
        const memberMovements = movements.filter(m => m.memberId === reserva.memberId);
        memberMovements.forEach(mov => {
            const fecha = new Date(mov.fecha).toLocaleDateString('es-ES');
            const tipo = mov.tipo === 'DEUDA' ? '💸' : '💰';
            console.log(`  ${tipo} ${fecha} - ${mov.concepto} - ${mov.tipo} - Gs. ${Math.abs(mov.monto).toLocaleString()}`);
        });
        process.exit(1);
    }
    
    console.log('\n✅ Movimiento de débito encontrado:');
    console.log(`  🆔 ID: ${debitMovement.id}`);
    console.log(`  📅 Fecha: ${new Date(debitMovement.fecha).toLocaleDateString('es-ES')}`);
    console.log(`  💸 Concepto: ${debitMovement.concepto}`);
    console.log(`  💰 Monto: Gs. ${Math.abs(debitMovement.monto).toLocaleString()}`);
    
    // Buscar el pago relacionado que referencia este débito
    const paymentMovement = movements.find(mov => 
        mov.tipo === 'PAGO' &&
        mov.allocations?.some(alloc => alloc.debitId === debitMovement.id)
    );
    
    if (paymentMovement) {
        console.log('\n💰 Pago relacionado encontrado:');
        console.log(`  🆔 ID: ${paymentMovement.id}`);
        console.log(`  📅 Fecha: ${new Date(paymentMovement.fecha).toLocaleDateString('es-ES')}`);
        console.log(`  💵 Concepto: ${paymentMovement.concepto}`);
        console.log(`  💰 Monto: Gs. ${Math.abs(paymentMovement.monto).toLocaleString()}`);
    } else {
        console.log('\n⚠️ No se encontró pago relacionado');
    }
    
    // Vincular la reserva con el movimiento de débito
    if (!reserva.debitMovementId) {
        reserva.debitMovementId = debitMovement.id;
        reserva.updatedAt = new Date().toISOString();
        
        // Guardar los cambios
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
        
        console.log('\n🔗 Vinculación completada:');
        console.log(`  Reserva ${reserva.id} ↔ Movimiento ${debitMovement.id}`);
        console.log('\n🎯 Resultado esperado en la página de reservas:');
        console.log(`  💰 Total: Gs. ${reserva.montoTotal?.toLocaleString()}`);
        if (paymentMovement) {
            console.log(`  💳 Pagos: Gs. ${Math.abs(paymentMovement.monto).toLocaleString()} (1 pago 🔗)`);
            console.log(`  ⚡ Saldo Pendiente: PAGADO`);
        } else {
            console.log(`  💳 Pagos: Gs. 0 (0 pagos)`);
            console.log(`  ⚡ Saldo Pendiente: Gs. ${reserva.montoTotal?.toLocaleString()}`);
        }
        
    } else {
        console.log('\n✅ La reserva ya está vinculada al movimiento');
    }
    
} catch (error) {
    console.error('❌ Error:', error.message);
}