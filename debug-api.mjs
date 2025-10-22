#!/usr/bin/env node

import fs from 'fs';

// Leer directamente del archivo db.json
const db = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));

// Obtener movimientos de m1
const movements = db.movements.filter(m => m.memberId === 'm1');
console.log('\n=== MOVIMIENTOS EN DB.JSON ===');
console.log(`Total movimientos: ${movements.length}`);

// Mostrar todos los movimientos ordenados por fecha
movements.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

movements.forEach((mov, index) => {
  console.log(`${index + 1}. ${mov.fecha} | ${mov.tipo} | ${mov.monto} | ${mov.concepto}`);
});

// Totales
const totalDebe = movements.filter(m => m.tipo === 'DEBIT' || m.tipo === 'DEBE')
  .reduce((acc, m) => acc + (m.monto || 0), 0);
const totalHaber = movements.filter(m => m.tipo === 'CREDIT' || m.tipo === 'HABER')
  .reduce((acc, m) => acc + (m.monto || 0), 0);

console.log('\n=== TOTALES ===');
console.log(`Total DEBE: ${totalDebe}`);
console.log(`Total HABER: ${totalHaber}`);
console.log(`Saldo: ${totalDebe - totalHaber}`);