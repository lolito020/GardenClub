import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const dbPath = join(__dirname, 'data', 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    const movements = db.movements || [];
    
    console.log('🔍 Buscando pago que canceló el débito MOV-000059...\n');
    
    // Buscar el débito
    const debitMovement = movements.find(mov => mov.id === 'MOV-000059');
    if (!debitMovement) {
        console.log('❌ No se encontró el débito MOV-000059');
        process.exit(1);
    }
    
    console.log('📊 Débito encontrado:');
    console.log(`  🆔 ID: ${debitMovement.id}`);
    console.log(`  👤 Socio: ${debitMovement.memberId}`);
    console.log(`  💸 Concepto: ${debitMovement.concepto}`);
    console.log(`  💰 Monto: Gs. ${Math.abs(debitMovement.monto).toLocaleString()}`);
    console.log(`  📅 Fecha: ${new Date(debitMovement.fecha).toLocaleDateString('es-ES')}`);
    
    // Buscar pagos del mismo socio en fechas cercanas
    const memberPayments = movements.filter(mov => 
        mov.memberId === debitMovement.memberId && 
        (mov.tipo === 'PAGO' || mov.tipo === 'PAYMENT') &&
        new Date(mov.fecha) >= new Date('2025-09-25') && 
        new Date(mov.fecha) <= new Date('2025-09-27')
    );
    
    console.log(`\n💰 Pagos del socio ${debitMovement.memberId}:`);
    memberPayments.forEach(pago => {
        const fecha = new Date(pago.fecha).toLocaleDateString('es-ES');
        console.log(`  🆔 ${pago.id} - ${fecha} - ${pago.concepto} - Gs. ${Math.abs(pago.monto).toLocaleString()}`);
        
        if (pago.allocations && pago.allocations.length > 0) {
            console.log(`    🔗 Asignaciones:`);
            pago.allocations.forEach(alloc => {
                console.log(`      - Débito: ${alloc.debitId} - Monto: Gs. ${alloc.amount?.toLocaleString()}`);
            });
        } else {
            console.log(`    ❌ Sin asignaciones`);
        }
    });
    
    // Buscar pago que podría estar relacionado con tenis
    const relatedPayment = memberPayments.find(pago => 
        pago.concepto?.toLowerCase().includes('tenis') || 
        pago.concepto?.toLowerCase().includes('contado') ||
        (pago.allocations && pago.allocations.some(alloc => alloc.debitId === 'MOV-000059'))
    );
    
    if (relatedPayment) {
        console.log(`\n✅ Pago relacionado encontrado: ${relatedPayment.id}`);
        
        // Verificar si ya está asignado al débito correcto
        const hasCorrectAllocation = relatedPayment.allocations?.some(alloc => alloc.debitId === 'MOV-000059');
        
        if (!hasCorrectAllocation) {
            console.log(`\n🔧 Creando asignación al débito MOV-000059...`);
            
            if (!relatedPayment.allocations) {
                relatedPayment.allocations = [];
            }
            
            // Agregar asignación al débito correcto
            relatedPayment.allocations.push({
                debitId: 'MOV-000059',
                amount: Math.abs(debitMovement.monto)
            });
            
            // Guardar cambios
            fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
            
            console.log(`✅ Asignación creada exitosamente`);
            console.log(`\n🎯 Ahora la reserva debería mostrar:`);
            console.log(`  💰 Total: Gs. 100.000`);
            console.log(`  💳 Pagos: Gs. 100.000 (1 pago 🔗)`);
            console.log(`  ⚡ Saldo Pendiente: PAGADO`);
            
        } else {
            console.log(`✅ El pago ya está correctamente asignado`);
        }
        
    } else {
        console.log(`\n❌ No se encontró pago relacionado específico`);
        console.log(`Verifica manualmente cuál de los pagos anteriores debe asignarse al débito MOV-000059`);
    }
    
} catch (error) {
    console.error('❌ Error:', error.message);
}