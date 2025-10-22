import fs from 'fs/promises';
import path from 'path';

async function debugMariaPagos() {
  try {
    const dbPath = path.join(process.cwd(), 'data', 'db.json');
    const dbContent = await fs.readFile(dbPath, 'utf-8');
    const db = JSON.parse(dbContent);

    console.log('=== DEBUG PAGOS DE MARÍA ===');
    
    // Buscar María González
    const maria = db.collectors.find(c => 
      c.nombres.toLowerCase().includes('maría') || c.nombres.toLowerCase().includes('maria')
    );
    
    if (!maria) {
      console.log('❌ María González no encontrada');
      return;
    }
    
    console.log(`✅ Cobrador: ${maria.nombres} ${maria.apellidos} (ID: ${maria.id})`);
    console.log(`   Comisión por defecto: ${maria.comisionPorDefecto}%`);
    
    // Buscar TODOS los pagos asignados a María
    const todosLosPagos = db.payments.filter(p => p.cobradorId === maria.id);
    console.log(`\n📊 Total de pagos asignados a María: ${todosLosPagos.length}`);
    
    if (todosLosPagos.length === 0) {
      console.log('❌ No hay pagos asignados a María González');
      return;
    }
    
    // Analizar cada pago
    console.log('\n🔍 Análisis de pagos:');
    let conComision = 0;
    let sinComision = 0;
    let yaLiquidados = 0;
    let pendientes = 0;
    
    todosLosPagos.forEach((pago, index) => {
      const tieneComision = pago.comisionCobrador && pago.comisionCobrador > 0;
      const yaLiquidado = pago.comisionPagada;
      
      if (index < 5) { // Mostrar detalles de los primeros 5
        console.log(`\n  Pago ${index + 1}: ${pago.id}`);
        console.log(`    Fecha: ${pago.fecha}`);
        console.log(`    Monto: $${pago.monto}`);
        console.log(`    Comisión cobrador: $${pago.comisionCobrador || 'NO CALCULADA'}`);
        console.log(`    Ya liquidada: ${yaLiquidado ? 'SÍ' : 'NO'}`);
        console.log(`    Commission Payment ID: ${pago.commissionPaymentId || 'N/A'}`);
      }
      
      if (tieneComision) {
        conComision++;
        if (yaLiquidado) {
          yaLiquidados++;
        } else {
          pendientes++;
        }
      } else {
        sinComision++;
      }
    });
    
    console.log(`\n📈 Resumen:`);
    console.log(`   - Con comisión calculada: ${conComision}`);
    console.log(`   - Sin comisión calculada: ${sinComision}`);
    console.log(`   - Ya liquidados: ${yaLiquidados}`);
    console.log(`   - Pendientes de liquidar: ${pendientes}`);
    
    // Si no hay comisiones calculadas, veamos por qué
    if (sinComision > 0) {
      console.log('\n🔍 Investigando por qué no hay comisiones calculadas...');
      
      // Tomar un pago sin comisión y ver si podemos calcularla
      const pagoSinComision = todosLosPagos.find(p => !p.comisionCobrador || p.comisionCobrador <= 0);
      
      if (pagoSinComision) {
        console.log(`\n   Ejemplo - Pago ${pagoSinComision.id}:`);
        console.log(`     Monto: $${pagoSinComision.monto}`);
        console.log(`     Movimientos asignados: ${pagoSinComision.movements?.length || 0}`);
        
        if (pagoSinComision.movements && pagoSinComision.movements.length > 0) {
          console.log('     Detalles de movimientos:');
          pagoSinComision.movements.forEach((mov, idx) => {
            const movement = db.movements.find(m => m.id === mov.movementId);
            if (movement) {
              const service = db.services.find(s => s.id === movement.servicioId);
              console.log(`       Mov ${idx + 1}: ${movement.concepto} - $${mov.amount}`);
              if (service) {
                console.log(`         Servicio: ${service.nombre}`);
                console.log(`         Comisión cobrador: ${service.comisionCobrador || 'NO DEFINIDA'}%`);
              } else {
                console.log(`         Servicio no encontrado: ${movement.servicioId}`);
              }
            }
          });
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error en el debug:', error);
  }
}

debugMariaPagos();