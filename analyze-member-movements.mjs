import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const dbPath = join(__dirname, 'data', 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    const movements = db.movements || [];
    
    console.log('🔍 Analizando todos los movimientos del socio m2 (Ana María Gómez Silva)...\n');
    
    // Buscar todos los movimientos del socio m2
    const memberMovements = movements.filter(mov => mov.memberId === 'm2');
    
    console.log(`📊 Total de movimientos encontrados: ${memberMovements.length}\n`);
    
    memberMovements.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    
    memberMovements.forEach(mov => {
        const fecha = new Date(mov.fecha).toLocaleDateString('es-ES', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const tipo = mov.tipo === 'DEBIT' || mov.tipo === 'DEUDA' ? '💸' : 
                     mov.tipo === 'PAGO' || mov.tipo === 'PAYMENT' ? '💰' : '❓';
        const signo = (mov.tipo === 'DEBIT' || mov.tipo === 'DEUDA') ? '+' : '-';
        
        console.log(`${tipo} ${mov.id} - ${fecha}`);
        console.log(`   Tipo: ${mov.tipo} | Concepto: ${mov.concepto || 'Sin concepto'}`);
        console.log(`   Monto: ${signo}Gs. ${Math.abs(mov.monto).toLocaleString()}`);
        
        if (mov.allocations && mov.allocations.length > 0) {
            console.log(`   🔗 Asignaciones:`);
            mov.allocations.forEach(alloc => {
                console.log(`      → ${alloc.debitId}: Gs. ${alloc.amount?.toLocaleString()}`);
            });
        }
        console.log('');
    });
    
    // Buscar específicamente el débito MOV-000059
    const targetDebit = memberMovements.find(mov => mov.id === 'MOV-000059');
    if (targetDebit) {
        console.log('🎯 Débito objetivo (MOV-000059):');
        console.log(`   ${targetDebit.concepto} - Gs. ${Math.abs(targetDebit.monto).toLocaleString()}`);
        
        // Buscar pagos que podrían cubrir este débito
        const possiblePayments = memberMovements.filter(mov => 
            (mov.tipo === 'PAGO' || mov.tipo === 'PAYMENT') &&
            Math.abs(mov.monto) >= Math.abs(targetDebit.monto) * 0.9 // Dentro del 90% del monto
        );
        
        console.log(`\n💡 Pagos que podrían cubrir este débito:`);
        possiblePayments.forEach(pago => {
            const fecha = new Date(pago.fecha).toLocaleDateString('es-ES');
            console.log(`   💰 ${pago.id} - ${fecha} - ${pago.concepto} - Gs. ${Math.abs(pago.monto).toLocaleString()}`);
        });
        
        if (possiblePayments.length === 0) {
            console.log('   ❌ No se encontraron pagos que cubran este monto');
        }
    }
    
} catch (error) {
    console.error('❌ Error:', error.message);
}