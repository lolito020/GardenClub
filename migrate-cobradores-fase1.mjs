/**
 * Script de migración - Fase 1: Cobradores
 * Actualiza los cobradores y pagos existentes con los nuevos campos
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  console.log('🚀 Iniciando migración - Fase 1: Cobradores\n');

  const dbPath = path.join(__dirname, 'data', 'db.json');
  
  try {
    // Leer DB
    const dbContent = await readFile(dbPath, 'utf-8');
    const db = JSON.parse(dbContent);

    let cambios = 0;

    // 1. Migrar Collectors - Agregar tipoCobrador y comisionPorDefecto
    console.log('📋 Actualizando Collectors...');
    if (Array.isArray(db.collectors)) {
      db.collectors.forEach((collector, index) => {
        if (!collector.tipoCobrador) {
          // Por defecto, si no tiene el campo, asumimos que es EXTERNO
          // Puedes ajustar esta lógica según tus necesidades
          collector.tipoCobrador = 'EXTERNO';
          collector.comisionPorDefecto = 12.5; // 12.5% por defecto
          cambios++;
          console.log(`  ✓ Cobrador ${collector.codigo} - ${collector.nombres} ${collector.apellidos}: tipo=EXTERNO, comision=12.5%`);
        }
      });
    }

    // 2. Migrar Payments - Agregar comisionPagada (false por defecto para pagos existentes)
    console.log('\n💰 Actualizando Payments...');
    if (Array.isArray(db.payments)) {
      db.payments.forEach((payment) => {
        // Solo actualizar si tiene comisión y no tiene el campo comisionPagada
        if (payment.comisionCobrador && payment.comisionCobrador > 0 && payment.comisionPagada === undefined) {
          payment.comisionPagada = false; // Marcar como pendiente
          cambios++;
        }
      });
      console.log(`  ✓ Marcados ${db.payments.filter(p => p.comisionPagada === false).length} pagos con comisiones pendientes`);
    }

    // 3. Migrar CommissionPayments - Agregar paymentIds vacío si no existe
    console.log('\n🧾 Actualizando CommissionPayments...');
    if (Array.isArray(db.commissionPayments)) {
      db.commissionPayments.forEach((cp) => {
        if (!cp.paymentIds) {
          cp.paymentIds = []; // Array vacío por defecto
          cambios++;
        }
      });
      console.log(`  ✓ ${db.commissionPayments.length} registros de comisiones actualizados`);
    }

    // Guardar DB actualizada
    if (cambios > 0) {
      await writeFile(dbPath, JSON.stringify(db, null, 2), 'utf-8');
      console.log(`\n✅ Migración completada exitosamente!`);
      console.log(`📊 Total de cambios: ${cambios}`);
    } else {
      console.log('\n✅ No se requirieron cambios. La base de datos ya está actualizada.');
    }

    // Resumen
    console.log('\n📈 Resumen de Cobradores:');
    if (Array.isArray(db.collectors)) {
      const porTipo = db.collectors.reduce((acc, c) => {
        acc[c.tipoCobrador] = (acc[c.tipoCobrador] || 0) + 1;
        return acc;
      }, {});
      Object.entries(porTipo).forEach(([tipo, count]) => {
        console.log(`  - ${tipo}: ${count} cobrador(es)`);
      });
    }

    console.log('\n💵 Resumen de Comisiones:');
    if (Array.isArray(db.payments)) {
      const conComision = db.payments.filter(p => p.comisionCobrador && p.comisionCobrador > 0);
      const pendientes = conComision.filter(p => p.comisionPagada === false);
      const pagadas = conComision.filter(p => p.comisionPagada === true);
      const totalPendiente = pendientes.reduce((sum, p) => sum + (p.comisionCobrador || 0), 0);
      const totalPagado = pagadas.reduce((sum, p) => sum + (p.comisionCobrador || 0), 0);

      console.log(`  - Pagos con comisión: ${conComision.length}`);
      console.log(`  - Comisiones pendientes: ${pendientes.length} (Gs. ${totalPendiente.toLocaleString('es-PY')})`);
      console.log(`  - Comisiones pagadas: ${pagadas.length} (Gs. ${totalPagado.toLocaleString('es-PY')})`);
    }

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    process.exit(1);
  }
}

migrate();
