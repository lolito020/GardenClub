import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const dbPath = join(__dirname, 'data', 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    console.log('🎯 Verificación Final - Sistema de Pagos Vinculados\n');
    
    // Obtener la reserva
    const reserva = db.reservations?.find(r => 
        r.nombreContacto === 'Ana María Gómez Silva' && 
        r.status === 'ACTIVO'
    );
    
    if (!reserva) {
        console.log('❌ No se encontró la reserva');
        process.exit(1);
    }
    
    console.log('📋 RESERVA:');
    console.log(`  🆔 ID: ${reserva.id}`);
    console.log(`  👤 Cliente: ${reserva.nombreContacto}`);
    console.log(`  💰 Monto Total: Gs. ${reserva.montoTotal?.toLocaleString()}`);
    console.log(`  🔗 Débito Vinculado: ${reserva.debitMovementId || 'NINGUNO'}`);
    
    if (!reserva.debitMovementId) {
        console.log('\n❌ La reserva no está vinculada a ningún movimiento de débito');
        process.exit(1);
    }
    
    // Obtener movimientos del socio
    const movements = db.movements?.filter(m => m.memberId === reserva.memberId) || [];
    
    console.log(`\n💰 MOVIMIENTOS DEL SOCIO (${reserva.memberId}):`);
    movements.forEach(mov => {
        const fecha = new Date(mov.fecha).toLocaleDateString('es-ES');
        const tipo = mov.tipo === 'DEBIT' ? '💸 DÉBITO' : 
                     mov.tipo === 'CREDIT' ? '💰 CRÉDITO' : `❓ ${mov.tipo}`;
        console.log(`  ${tipo} | ${mov.id} | ${fecha} | ${mov.concepto} | Gs. ${Math.abs(mov.monto).toLocaleString()}`);
    });
    
    // Buscar pagos relacionados (simulando la lógica del frontend)
    const relatedPayments = movements.filter(mov => 
        (mov.tipo === 'PAGO' || mov.tipo === 'PAYMENT' || mov.tipo === 'CREDIT') && 
        mov.allocations?.some(alloc => alloc.debitId === reserva.debitMovementId)
    );
    
    console.log('\n🔗 PAGOS VINCULADOS A LA RESERVA:');
    if (relatedPayments.length === 0) {
        console.log('  ❌ No se encontraron pagos vinculados');
    } else {
        relatedPayments.forEach(pago => {
            const fecha = new Date(pago.fecha).toLocaleDateString('es-ES');
            console.log(`  ✅ ${pago.id} | ${fecha} | ${pago.concepto} | Gs. ${Math.abs(pago.monto).toLocaleString()}`);
            
            pago.allocations?.forEach(alloc => {
                if (alloc.debitId === reserva.debitMovementId) {
                    console.log(`    🎯 Asignado a débito ${alloc.debitId}: Gs. ${alloc.amount?.toLocaleString()}`);
                }
            });
        });
    }
    
    // Calcular totales
    const totalPagado = relatedPayments.reduce((sum, pago) => sum + Math.abs(pago.monto || 0), 0);
    const adelanto = reserva.adelanto || 0;
    const totalPagosCompleto = totalPagado + adelanto;
    const saldoPendiente = (reserva.montoTotal || 0) - totalPagosCompleto;
    const isPagado = saldoPendiente <= 0;
    
    console.log('\n📊 RESUMEN FINANCIERO:');
    console.log(`  💰 Monto Total: Gs. ${reserva.montoTotal?.toLocaleString()}`);
    console.log(`  💳 Pagos Vinculados: Gs. ${totalPagado.toLocaleString()}`);
    console.log(`  🏦 Adelantos: Gs. ${adelanto.toLocaleString()}`);
    console.log(`  ✅ Total Pagado: Gs. ${totalPagosCompleto.toLocaleString()}`);
    console.log(`  ⚡ Saldo Pendiente: ${isPagado ? '✅ PAGADO' : `❌ Gs. ${saldoPendiente.toLocaleString()}`}`);
    
    console.log('\n🎯 RESULTADO EN LA INTERFAZ:');
    console.log(`  Columna "Pagos": Gs. ${totalPagosCompleto.toLocaleString()} (${relatedPayments.length} pago${relatedPayments.length !== 1 ? 's' : ''} 🔗)`);
    console.log(`  Columna "Saldo Pendiente": ${isPagado ? '✅ PAGADO' : `❌ Gs. ${saldoPendiente.toLocaleString()}`}`);
    
    if (isPagado && relatedPayments.length > 0) {
        console.log('\n🎉 ¡PERFECTO! La reserva está correctamente vinculada y pagada');
    } else if (relatedPayments.length > 0) {
        console.log('\n⚠️ La reserva está vinculada pero tiene saldo pendiente');
    } else {
        console.log('\n❌ La reserva no está vinculada a pagos');
    }
    
} catch (error) {
    console.error('❌ Error:', error.message);
}