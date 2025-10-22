#!/usr/bin/env node
/**
 * Script de migración: Corregir allocations en notas de crédito de cancelación existentes
 * 
 * Este script actualiza las notas de crédito de AJUSTE que tienen allocations con amount = 0
 * para que tengan el amount correcto (distribuyendo el monto total entre los débitos)
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Inicializar base de datos
const dbPath = join(__dirname, 'data', 'db.json');
const adapter = new JSONFile(dbPath);
const db = new Low(adapter, { members: [], payments: [], movements: [], reservations: [], sequences: {} });

await db.read();

console.log('🔧 MIGRACIÓN: Corregir allocations en notas de crédito de cancelación\n');

// 1. Buscar notas de crédito de AJUSTE con allocations = 0
const problemCredits = db.data.movements.filter(m =>
  m.tipo === 'CREDIT' &&
  m.origen === 'AJUSTE' &&
  Array.isArray(m.allocations) &&
  m.allocations.length > 0 &&
  m.allocations.some(a => a.amount === 0)
);

console.log(`📝 Notas de crédito con allocations = 0: ${problemCredits.length}\n`);

if (problemCredits.length === 0) {
  console.log('✅ No hay notas de crédito que necesiten corrección\n');
  process.exit(0);
}

// 2. Corregir cada una
let corrected = 0;

for (const credit of problemCredits) {
  console.log(`━`.repeat(80));
  console.log(`📋 Corrigiendo: ${credit.id}`);
  console.log(`   Concepto: ${credit.concepto}`);
  console.log(`   Monto total: ${credit.monto.toLocaleString('es-PY')} Gs.`);
  console.log(`   Allocations actuales:`, credit.allocations);
  
  // Calcular amount correcto (dividir monto total entre número de allocations)
  const amountPerDebit = credit.monto / credit.allocations.length;
  
  // Actualizar allocations
  const newAllocations = credit.allocations.map(alloc => ({
    ...alloc,
    amount: amountPerDebit
  }));
  
  credit.allocations = newAllocations;
  
  console.log(`   ✅ Allocations corregidas:`, newAllocations);
  console.log(`   Amount por débito: ${amountPerDebit.toLocaleString('es-PY')} Gs.`);
  
  corrected++;
}

// 3. Guardar cambios
console.log(`\n${'━'.repeat(80)}`);
console.log('💾 Guardando cambios en base de datos...');
await db.write();
console.log('✅ Cambios guardados exitosamente\n');

// 4. Verificación
console.log(`${'━'.repeat(80)}`);
console.log('🔍 VERIFICACIÓN:');
console.log(`${'━'.repeat(80)}`);

for (const credit of problemCredits) {
  const totalAssigned = credit.allocations.reduce((sum, a) => sum + a.amount, 0);
  const matches = Math.abs(totalAssigned - credit.monto) < 1;
  
  console.log(`${matches ? '✅' : '❌'} ${credit.id}: ${totalAssigned.toLocaleString('es-PY')} Gs. asignados de ${credit.monto.toLocaleString('es-PY')} Gs.`);
}

console.log(`\n${'━'.repeat(80)}`);
console.log('📊 RESUMEN:');
console.log(`${'━'.repeat(80)}`);
console.log(`Notas de crédito corregidas: ${corrected}`);
console.log(`\n✨ Migración completada exitosamente\n`);
console.log(`ℹ️  Ahora las notas de crédito de cancelación aparecerán en el modal "Pagos Relacionados"\n`);
