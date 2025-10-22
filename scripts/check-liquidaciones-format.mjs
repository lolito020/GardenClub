import fs from 'fs/promises';
import path from 'path';

async function checkLiquidacionesFormat() {
  try {
    const dbPath = path.join(process.cwd(), 'data', 'db.json');
    const dbContent = await fs.readFile(dbPath, 'utf-8');
    const db = JSON.parse(dbContent);

    console.log('=== VERIFICACIÓN DE FORMATO LIQUIDACIONES ===');
    
    const liquidaciones = db.commissionPayments || [];
    console.log(`\n📊 Total liquidaciones en BD: ${liquidaciones.length}`);
    
    if (liquidaciones.length === 0) {
      console.log('❌ No hay liquidaciones para verificar');
      return;
    }
    
    console.log('\n🔍 Formato de las últimas 3 liquidaciones:');
    liquidaciones.slice(-3).forEach((liq, index) => {
      console.log(`\n  Liquidación ${index + 1}:`);
      console.log(`    ID: ${liq.id}`);
      console.log(`    Fecha: ${liq.fecha}`);
      console.log(`    Monto: ${liq.monto} (${typeof liq.monto})`);
      console.log(`    PaymentIds: [${liq.paymentIds?.join(', ') || 'N/A'}] (${liq.paymentIds?.length || 0} pagos)`);
      console.log(`    Forma pago: ${liq.formaPago}`);
      console.log(`    Número recibo: ${liq.numeroRecibo || 'Sin recibo'}`);
      console.log(`    Observaciones: ${liq.observaciones || 'Sin observaciones'}`);
      console.log(`    Concepto: ${liq.concepto || 'Sin concepto'}`);
      
      // Verificar si el monto es válido
      if (typeof liq.monto !== 'number' || isNaN(liq.monto)) {
        console.log(`    ❌ PROBLEMA: Monto inválido (${liq.monto})`);
      } else {
        console.log(`    ✅ Monto válido: $${liq.monto.toLocaleString()}`);
      }
      
      // Verificar paymentIds
      if (!liq.paymentIds || !Array.isArray(liq.paymentIds)) {
        console.log(`    ❌ PROBLEMA: paymentIds inválido`);
      } else {
        console.log(`    ✅ paymentIds válido: ${liq.paymentIds.length} pagos`);
      }
    });
    
    // Buscar María González y sus liquidaciones
    const maria = db.collectors.find(c => 
      c.nombres.toLowerCase().includes('maría') || c.nombres.toLowerCase().includes('maria')
    );
    
    if (maria) {
      const liquidacionesMaria = liquidaciones.filter(l => l.cobradorId === maria.id);
      console.log(`\n👤 Liquidaciones de María González: ${liquidacionesMaria.length}`);
      
      if (liquidacionesMaria.length > 0) {
        console.log('\n  📋 Detalles de liquidaciones de María:');
        liquidacionesMaria.forEach((liq, index) => {
          console.log(`    ${index + 1}. ${liq.id} - $${liq.monto} (${liq.paymentIds?.length || 0} pagos) - ${liq.fecha}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkLiquidacionesFormat();