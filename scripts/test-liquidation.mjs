import fs from 'fs/promises';
import path from 'path';

async function testLiquidation() {
  try {
    // Leer la base de datos
    const dbPath = path.join(process.cwd(), 'data', 'db.json');
    const dbContent = await fs.readFile(dbPath, 'utf-8');
    const db = JSON.parse(dbContent);

    console.log('=== TEST DE LIQUIDACIÓN ===');
    
    // Buscar María González
    const maria = db.collectors.find(c => 
      c.nombres.toLowerCase().includes('maría') || c.nombres.toLowerCase().includes('maria')
    );
    
    if (!maria) {
      console.log('❌ María González no encontrada');
      return;
    }
    
    console.log(`✅ Cobrador encontrado: ${maria.nombres} ${maria.apellidos} (ID: ${maria.id})`);
    
    // Buscar pagos pendientes de liquidación para María
    const pagosPendientes = db.payments.filter(p => 
      p.cobradorId === maria.id && 
      !p.comisionPagada && 
      (p.comisionCobrador && p.comisionCobrador > 0)
    );
    
    console.log(`\n📊 Pagos pendientes de liquidación: ${pagosPendientes.length}`);
    
    if (pagosPendientes.length === 0) {
      console.log('❌ No hay pagos pendientes de liquidación para María');
      return;
    }
    
    // Mostrar algunos pagos
    console.log('\n💰 Primeros 3 pagos pendientes:');
    pagosPendientes.slice(0, 3).forEach(p => {
      console.log(`  - Pago ${p.id}: $${p.comisionCobrador} (${p.fecha})`);
    });
    
    // Simular datos de liquidación
    const testData = {
      cobradorId: maria.id,
      paymentIds: pagosPendientes.slice(0, 2).map(p => p.id), // Tomar solo 2 pagos para la prueba
      formaPago: 'efectivo',
      numeroRecibo: 'TEST-001',
      observaciones: 'Prueba de liquidación'
    };
    
    console.log('\n🔧 Datos de prueba para liquidación:');
    console.log(JSON.stringify(testData, null, 2));
    
    // Validar datos como lo haría el endpoint
    console.log('\n✅ Validaciones:');
    
    // 1. Datos completos
    if (!testData.cobradorId || !Array.isArray(testData.paymentIds) || testData.paymentIds.length === 0 || !testData.formaPago) {
      console.log('❌ Datos incompletos');
      return;
    }
    console.log('✅ Datos completos');
    
    // 2. Cobrador existe
    const cobradorExiste = db.collectors.find(c => c.id === testData.cobradorId);
    if (!cobradorExiste) {
      console.log('❌ Cobrador no encontrado');
      return;
    }
    console.log('✅ Cobrador existe');
    
    // 3. Verificar cada pago
    const pagosParaLiquidar = [];
    for (const paymentId of testData.paymentIds) {
      const pago = db.payments.find(p => p.id === paymentId);
      if (!pago) {
        console.log(`❌ Pago ${paymentId} no encontrado`);
        return;
      }
      if (pago.cobradorId !== testData.cobradorId) {
        console.log(`❌ Pago ${paymentId} no pertenece al cobrador`);
        return;
      }
      if (pago.comisionPagada) {
        console.log(`❌ Pago ${paymentId} ya fue liquidado`);
        return;
      }
      if (!pago.comisionCobrador || pago.comisionCobrador <= 0) {
        console.log(`❌ Pago ${paymentId} no tiene comisión registrada`);
        return;
      }
      pagosParaLiquidar.push(pago);
    }
    console.log('✅ Todos los pagos son válidos para liquidación');
    
    // Calcular monto total
    const montoTotal = pagosParaLiquidar.reduce((sum, p) => sum + (p.comisionCobrador || 0), 0);
    console.log(`✅ Monto total a liquidar: $${montoTotal}`);
    
    // Determinar periodo
    const fechaLiquidacion = new Date().toISOString().split('T')[0];
    const periodo = fechaLiquidacion.slice(0, 7);
    console.log(`✅ Fecha: ${fechaLiquidacion}, Periodo: ${periodo}`);
    
    // Generar ID
    const nextSeq = (db.sequences?.commission || 0) + 1;
    const commissionId = `CP-${String(nextSeq).padStart(6, '0')}`;
    console.log(`✅ ID de liquidación: ${commissionId}`);
    
    console.log('\n🎉 La liquidación debería funcionar correctamente con estos datos');
    
  } catch (error) {
    console.error('❌ Error en el test:', error);
  }
}

testLiquidation();