const fs = require('fs');

// Leer la base de datos
const db = JSON.parse(fs.readFileSync('C:/Garden/data/db.json', 'utf8'));
const now = new Date();

console.log('Fecha actual:', now.toISOString());
console.log('Buscando reservas activas que ya terminaron...\n');

// Buscar reservas activas que ya terminaron (replicar la lógica del endpoint)
const expiredReservations = db.reservations.filter(reservation => {
  if (reservation.status !== 'ACTIVO') return false;
  const endTime = new Date(reservation.end);
  const expired = endTime <= now;
  
  console.log(`Reserva ${reservation.id}:`);
  console.log(`  Estado: ${reservation.status}`);
  console.log(`  Fin: ${reservation.end}`);
  console.log(`  End Date: ${endTime.toISOString()}`);
  console.log(`  Expirada: ${expired}`);
  console.log('---');
  
  return expired;
});

console.log(`\nReservas expiradas encontradas: ${expiredReservations.length}`);

if (expiredReservations.length > 0) {
  expiredReservations.forEach(r => {
    console.log(`- ${r.id}: ${r.nombreContacto} (${r.end})`);
  });
} else {
  console.log('No se encontraron reservas ACTIVO con fecha expirada.');
}