import fs from 'fs';
import path from 'path';

// Función para normalizar tipos de movimiento
function normalizeTipoMovimiento(t) {
  const u = String(t || '').toUpperCase();
  if (u === 'DEBIT' || u === 'DEBE') return 'DEBIT';
  if (u === 'CREDIT' || u === 'HABER') return 'CREDIT';
  return 'DEBIT';
}

// Función para redondear
function xround(num) {
  return Math.round((Number(num) || 0) * 100) / 100;
}

// Leer datos de la base de datos
const dbPath = path.join(process.cwd(), 'data', 'db.json');
const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Buscar socio 1
const socio1 = dbData.members.find(m => m.id === 'm1');
console.log('\n=== VERIFICACIÓN DE CÁLCULO DE DEUDA - SOCIO 1 ===');
console.log(`Socio: ${socio1.nombres} ${socio1.apellidos} (${socio1.codigo})`);

// Obtener movimientos del socio 1
const movimientos = dbData.movements.filter(m => m.memberId === 'm1');
console.log(`\nTotal movimientos encontrados: ${movimientos.length}`);

// Separar por tipo
const debitos = movimientos.filter(m => normalizeTipoMovimiento(m.tipo) === 'DEBIT');
const creditos = movimientos.filter(m => normalizeTipoMovimiento(m.tipo) === 'CREDIT');

console.log(`\nDébitos: ${debitos.length}`);
console.log(`Créditos: ${creditos.length}`);

// Calcular deuda usando el método correcto
console.log('\n=== DÉBITOS DETALLADOS ===');
let deudaTotal = 0;
debitos.forEach(d => {
  const monto = xround(d.monto);
  const pagado = xround(d.paidAmount || 0);
  const pendiente = Math.max(0, monto - pagado);
  deudaTotal += pendiente;
  
  console.log(`${d.id}: ${d.concepto}`);
  console.log(`  Fecha: ${d.fecha}`);
  console.log(`  Monto: ${monto.toLocaleString()}`);
  console.log(`  Pagado: ${pagado.toLocaleString()}`);
  console.log(`  Pendiente: ${pendiente.toLocaleString()}`);
  console.log(`  Estado: ${d.status || 'N/A'}`);
  console.log('');
});

console.log('=== RESUMEN ===');
console.log(`Deuda total calculada: ${deudaTotal.toLocaleString()} Gs`);

// Verificar cálculo saldo global (método anterior)
const totalDebe = debitos.reduce((acc, d) => acc + xround(d.monto), 0);
const totalHaber = creditos.reduce((acc, c) => acc + xround(c.monto), 0);
const saldoGlobal = totalDebe - totalHaber;

console.log(`\nMétodo anterior (saldo global):`);
console.log(`Total debe: ${totalDebe.toLocaleString()}`);
console.log(`Total haber: ${totalHaber.toLocaleString()}`);
console.log(`Saldo global: ${saldoGlobal.toLocaleString()}`);
console.log(`Deuda según método anterior: ${Math.max(0, saldoGlobal).toLocaleString()}`);

console.log(`\n=== COMPARACIÓN ===`);
console.log(`Método correcto (pendientes): ${deudaTotal.toLocaleString()}`);
console.log(`Método anterior (saldo): ${Math.max(0, saldoGlobal).toLocaleString()}`);
console.log(`Diferencia: ${(deudaTotal - Math.max(0, saldoGlobal)).toLocaleString()}`);