import fs from 'fs/promises';
import path from 'path';

async function testLiquidationFix() {
  try {
    const dbPath = path.join(process.cwd(), 'data', 'db.json');
    const dbContent = await fs.readFile(dbPath, 'utf-8');
    const db = JSON.parse(dbContent);

    console.log('=== TEST DE LIQUIDACIÓN (POST-FIX) ===');
    
    // Buscar María González
    const maria = db.collectors.find(c => 
      c.nombres.toLowerCase().includes('maría') || c.nombres.toLowerCase().includes('maria')
    );
    
    console.log(`✅ Cobrador: ${maria.nombres} ${maria.apellidos} (ID: ${maria.id})`);
    console.log(`   Comisión por defecto: ${maria.comisionPorDefecto}%`);
    
    // Buscar sus pagos
    const pagosMaria = db.payments.filter(p => p.cobradorId === maria.id && !p.comisionPagada);
    console.log(`\n📊 Pagos no liquidados de María: ${pagosMaria.length}`);
    
    if (pagosMaria.length === 0) {
      console.log('❌ No hay pagos para liquidar');
      return;
    }
    
    // Simular el cálculo de comisión para cada pago
    console.log('\n🧮 Simulando cálculo de comisiones:');
    
    const pagosConComision = pagosMaria.map(pago => {
      let comisionCalculada = pago.comisionCobrador || 0;
      
      console.log(`\n  Pago ${pago.id}:`);
      console.log(`    Monto: $${pago.monto}`);
      console.log(`    Comisión existente: $${pago.comisionCobrador || 'NO CALCULADA'}`);
      
      if (comisionCalculada <= 0) {
        // Calcular basado en allocations
        if (pago.allocations && pago.allocations.length > 0) {
          console.log(`    Allocations: ${pago.allocations.length}`);
          comisionCalculada = pago.allocations.reduce((total, allocation) => {
            if (allocation.debitId) {
              const movimiento = db.movements.find(m => m.id === allocation.debitId);
              if (movimiento && movimiento.refId) {
                const servicio = db.services.find(s => s.id === movimiento.refId);
                if (servicio) {
                  const comisionRate = servicio.comisionCobrador !== undefined 
                    ? servicio.comisionCobrador 
                    : maria.comisionPorDefecto || 0;
                  const comisionPorcion = allocation.amount * comisionRate / 100;
                  console.log(`      - Allocation $${allocation.amount} → Servicio: ${servicio.nombre} (${comisionRate}%) = $${comisionPorcion}`);
                  return total + comisionPorcion;
                }
              }
            }
            return total;
          }, 0);
        }
        
        // Si aún no hay comisión, usar por defecto
        if (comisionCalculada <= 0) {
          const comisionRate = maria.comisionPorDefecto || 0;
          comisionCalculada = pago.monto * comisionRate / 100;
          console.log(`    Usando comisión por defecto: ${comisionRate}% de $${pago.monto} = $${comisionCalculada}`);
        }
      }
      
      console.log(`    ✅ Comisión final: $${comisionCalculada}`);
      
      return {
        ...pago,
        comisionCobrador: comisionCalculada
      };
    });
    
    // Calcular totales
    const montoTotal = pagosConComision.reduce((sum, p) => sum + (p.comisionCobrador || 0), 0);
    console.log(`\n💰 Total a liquidar: $${montoTotal}`);
    console.log(`💼 Cantidad de pagos: ${pagosConComision.length}`);
    
    // Validar que todos tengan comisión > 0
    const sinComision = pagosConComision.filter(p => !p.comisionCobrador || p.comisionCobrador <= 0);
    
    if (sinComision.length > 0) {
      console.log(`\n❌ ${sinComision.length} pagos aún sin comisión calculable:`);
      sinComision.forEach(p => console.log(`  - ${p.id}: $${p.monto}`));
    } else {
      console.log('\n🎉 Todos los pagos tienen comisión calculable');
      console.log('✅ La liquidación debería funcionar ahora');
    }
    
  } catch (error) {
    console.error('❌ Error en el test:', error);
  }
}

testLiquidationFix();