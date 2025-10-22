import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
    const dbPath = join(__dirname, 'data', 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    
    console.log('🔍 Diagnóstico del Sistema de Pagos Vinculados\n');
    
    // Obtener la reserva
    const reserva = db.reservations?.find(r => 
        r.nombreContacto === 'Ana María Gómez Silva' && 
        r.status === 'ACTIVO'
    );
    
    if (!reserva) {
        console.log('❌ No se encontró la reserva activa de Ana María');
        process.exit(1);
    }
    
    console.log('📋 RESERVA ENCONTRADA:');
    console.log(`  🆔 ID: ${reserva.id}`);
    console.log(`  👤 Cliente: ${reserva.nombreContacto}`);
    console.log(`  💰 Monto Total: Gs. ${reserva.montoTotal?.toLocaleString()}`);
    console.log(`  🔗 Débito Vinculado: ${reserva.debitMovementId || 'NINGUNO'}`);
    console.log(`  🏦 Adelanto: Gs. ${(reserva.adelanto || 0).toLocaleString()}`);
    console.log(`  💳 Pagos Directos: ${(reserva.pagos || []).length}`);
    
    if (!reserva.debitMovementId) {
        console.log('\n❌ PROBLEMA: La reserva no tiene débito vinculado');
        process.exit(1);
    }
    
    if (!reserva.memberId) {
        console.log('\n❌ PROBLEMA: La reserva no tiene memberId');
        process.exit(1);
    }
    
    console.log('\n💰 SIMULANDO CONSULTA API /api/members/${memberId}/movements:');
    
    // Simular la consulta que hace el frontend
    const movements = db.movements?.filter(m => m.memberId === reserva.memberId) || [];
    
    console.log(`  📊 Total movimientos del socio ${reserva.memberId}: ${movements.length}`);
    
    movements.forEach(mov => {
        const fecha = new Date(mov.fecha).toLocaleDateString('es-ES');
        const tipo = mov.tipo;
        console.log(`    ${mov.id} | ${fecha} | ${tipo} | ${mov.concepto} | Gs. ${Math.abs(mov.monto).toLocaleString()}`);
        
        if (mov.allocations) {
            mov.allocations.forEach(alloc => {
                console.log(`      🔗 Asignación: ${alloc.debitId} → Gs. ${alloc.amount?.toLocaleString()}`);
            });
        }
    });
    
    console.log('\n🔍 BUSCANDO PAGOS RELACIONADOS AL DÉBITO:', reserva.debitMovementId);
    
    // Simular exactamente la lógica del frontend
    const relatedPayments = movements.filter(mov => 
        (mov.tipo === 'PAGO' || mov.tipo === 'PAYMENT' || mov.tipo === 'CREDIT') && 
        mov.allocations?.some(alloc => alloc.debitId === reserva.debitMovementId)
    );
    
    console.log(`  📋 Pagos encontrados: ${relatedPayments.length}`);
    
    relatedPayments.forEach(pago => {
        const fecha = new Date(pago.fecha).toLocaleDateString('es-ES');
        console.log(`    ✅ ${pago.id} | ${fecha} | ${pago.concepto} | Gs. ${Math.abs(pago.monto).toLocaleString()}`);
    });
    
    // Calcular totales
    const totalPagado = relatedPayments.reduce((sum, pago) => sum + Math.abs(pago.monto || 0), 0);
    const adelanto = reserva.adelanto || 0;
    const pagosDirectos = (reserva.pagos || []).reduce((sum, pago) => sum + (pago.monto || 0), 0);
    const totalCompleto = totalPagado + adelanto + pagosDirectos;
    const saldoPendiente = (reserva.montoTotal || 0) - totalCompleto;
    
    console.log('\n📊 CÁLCULOS FINALES:');
    console.log(`  💰 Monto Total: Gs. ${reserva.montoTotal?.toLocaleString()}`);
    console.log(`  💳 Pagos Relacionados: Gs. ${totalPagado.toLocaleString()}`);
    console.log(`  🏦 Adelantos: Gs. ${adelanto.toLocaleString()}`);
    console.log(`  💵 Pagos Directos: Gs. ${pagosDirectos.toLocaleString()}`);
    console.log(`  ✅ Total Pagado: Gs. ${totalCompleto.toLocaleString()}`);
    console.log(`  ⚡ Saldo Pendiente: Gs. ${saldoPendiente.toLocaleString()}`);
    
    console.log('\n🎯 LO QUE DEBERÍA MOSTRAR EN LA INTERFAZ:');
    console.log(`  💳 Columna "Pagos": Gs. ${totalCompleto.toLocaleString()}`);
    console.log(`  ⚡ Columna "Saldo Pendiente": ${saldoPendiente <= 0 ? '✅ PAGADO' : `❌ Gs. ${saldoPendiente.toLocaleString()}`}`);
    
    if (totalPagado === 0) {
        console.log('\n🚨 PROBLEMA IDENTIFICADO:');
        console.log('   No se están encontrando pagos relacionados');
        console.log('   Posibles causas:');
        console.log('   1. El tipo de movimiento no coincide con el filtro');
        console.log('   2. Las asignaciones no están correctas');
        console.log('   3. La API no está devolviendo los datos completos');
    }
    
} catch (error) {
    console.error('❌ Error:', error.message);
}