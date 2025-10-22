// Script para depurar las diferencias entre las dos páginas
import fs from 'fs';
import path from 'path';

// Función para normalizar tipos de movimiento (igual que en las páginas)
function normalizeTipoMovimiento(t) {
  const u = String(t || '').toUpperCase();
  if (u === 'DEBIT' || u === 'DEBE') return 'DEBIT';
  if (u === 'CREDIT' || u === 'HABER') return 'CREDIT';
  return 'DEBIT';
}

// Función para redondear (igual que en página principal)
function xround(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

// Leer datos de la base de datos
const dbPath = path.join(process.cwd(), 'data', 'db.json');
const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Obtener movimientos del socio 1
const movimientos = dbData.movements.filter(m => m.memberId === 'm1');

console.log('\n=== DEPURACIÓN DETALLADA DE CÁLCULOS ===');
console.log(`Total movimientos para m1: ${movimientos.length}`);

// Simular el procesamiento de la página principal
console.log('\n--- SIMULACIÓN PÁGINA PRINCIPAL ---');
const movsPrincipal = movimientos.map((mv, idx) => ({
  id: String(mv.id || `m1-${idx}`),
  memberId: String(mv.memberId || 'm1'),
  fecha: mv.fecha || mv.date || new Date().toISOString(),
  concepto: String(mv.concepto || mv.description || ''),
  tipo: normalizeTipoMovimiento(mv.tipo || mv.type || ''),
  monto: Number(mv.monto || mv.amount || 0),
  origen: mv.origen || mv.source || undefined,
  refId: mv.refId || mv.referenceId || undefined,
  vencimiento: mv.vencimiento || mv.dueDate || undefined,
  paidAmount: Number(mv.paidAmount || 0),
}));

const debitsPrincipal = movsPrincipal.filter(x => normalizeTipoMovimiento(x.tipo) === 'DEBIT');
const deudaPrincipal = debitsPrincipal.reduce((acc, d) => acc + Math.max(0, xround(d.monto) - xround(d.paidAmount || 0)), 0);

console.log(`Débitos encontrados: ${debitsPrincipal.length}`);
console.log(`Deuda calculada (método principal): ${deudaPrincipal}`);

console.log('\nDétalle de débitos (método principal):');
debitsPrincipal.forEach(d => {
  const pendiente = Math.max(0, xround(d.monto) - xround(d.paidAmount || 0));
  console.log(`  ${d.id}: ${d.concepto} | Monto: ${xround(d.monto)} | Pagado: ${xround(d.paidAmount || 0)} | Pendiente: ${pendiente}`);
});

// Simular el procesamiento de la página de detalles
console.log('\n--- SIMULACIÓN PÁGINA DETALLES ---');
const movsDetalles = movimientos.map((m, idx) => ({
  id: String(m.id || `m1-${m.fecha || m.date || Date.now()}-${idx}`),
  memberId: String(m.memberId || 'm1'),
  fecha: m.fecha || m.date || m.createdAt || new Date().toISOString(),
  concepto: m.concepto || m.description || '',
  tipo: normalizeTipoMovimiento(m.tipo || m.type || ''),
  monto: Number(m.monto || m.amount || 0),
  origen: m.origen || m.source || undefined,
  refId: m.refId || m.referenceId || undefined,
  observaciones: m.observaciones || m.notes || '',
  paidAmount: Number(m.paidAmount || 0),
  status: m.status,
  vencimiento: m.vencimiento || m.dueDate || undefined,
}));

const debitsDetalles = movsDetalles.filter(x => normalizeTipoMovimiento(x.tipo) === 'DEBIT');
const deudaDetalles = debitsDetalles.reduce((acc, d) => acc + Math.max(0, d.monto - (d.paidAmount || 0)), 0);

console.log(`Débitos encontrados: ${debitsDetalles.length}`);
console.log(`Deuda calculada (método detalles): ${deudaDetalles}`);

console.log('\nDétalle de débitos (método detalles):');
debitsDetalles.forEach(d => {
  const pendiente = Math.max(0, d.monto - (d.paidAmount || 0));
  console.log(`  ${d.id}: ${d.concepto} | Monto: ${d.monto} | Pagado: ${d.paidAmount || 0} | Pendiente: ${pendiente}`);
});

// Comparar
console.log('\n=== COMPARACIÓN ===');
console.log(`Página Principal: ${deudaPrincipal}`);
console.log(`Página Detalles: ${deudaDetalles}`);
console.log(`Diferencia: ${deudaPrincipal - deudaDetalles}`);

// Verificar si hay diferencias en los datos procesados
console.log('\n=== ANÁLISIS DE DIFERENCIAS ===');
if (movsPrincipal.length !== movsDetalles.length) {
  console.log(`¡DIFERENCIA EN CANTIDAD! Principal: ${movsPrincipal.length}, Detalles: ${movsDetalles.length}`);
}

// Comparar débito por débito
console.log('\nComparación débito por débito:');
const maxDebits = Math.max(debitsPrincipal.length, debitsDetalles.length);
for (let i = 0; i < maxDebits; i++) {
  const dP = debitsPrincipal[i];
  const dD = debitsDetalles[i];
  
  if (!dP) {
    console.log(`  ${i}: FALTA EN PRINCIPAL - ${dD.id}: ${dD.concepto}`);
  } else if (!dD) {
    console.log(`  ${i}: FALTA EN DETALLES - ${dP.id}: ${dP.concepto}`);
  } else if (dP.id !== dD.id || dP.monto !== dD.monto || dP.paidAmount !== dD.paidAmount) {
    console.log(`  ${i}: DIFERENCIA`);
    console.log(`    Principal: ${dP.id} | ${dP.monto} | ${dP.paidAmount}`);
    console.log(`    Detalles:  ${dD.id} | ${dD.monto} | ${dD.paidAmount}`);
  } else {
    console.log(`  ${i}: IGUAL - ${dP.id}`);
  }
}