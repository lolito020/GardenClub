const fs = require('fs');

// Leer y analizar la base de datos
const db = JSON.parse(fs.readFileSync('C:/Garden/data/db.json', 'utf8'));
const reservas = db.reservations || [];

console.log('Estados de reservas:');
console.log('===================');

reservas.forEach(r => {
  const endDate = new Date(r.end);
  const now = new Date();
  const expired = endDate <= now;
  
  console.log(`ID: ${r.id}`);
  console.log(`Status: ${r.status}`);
  console.log(`End: ${r.end}`);
  console.log(`Expirada: ${expired ? 'SÍ' : 'NO'}`);
  console.log(`Cliente: ${r.nombreContacto || 'Sin nombre'}`);
  console.log('---');
});

console.log(`\nTotal de reservas: ${reservas.length}`);
console.log(`Reservas ACTIVO: ${reservas.filter(r => r.status === 'ACTIVO').length}`);
console.log(`Reservas CULMINADO: ${reservas.filter(r => r.status === 'CULMINADO').length}`);
console.log(`Reservas CANCELADO: ${reservas.filter(r => r.status === 'CANCELADO').length}`);