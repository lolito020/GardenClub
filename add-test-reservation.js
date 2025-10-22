const fs = require('fs');

// Leer la base de datos
const db = JSON.parse(fs.readFileSync('C:/Garden/data/db.json', 'utf8'));

// Agregar una reserva de prueba con fecha pasada (26 de septiembre, 23:00)
const testReservation = {
  id: "RES-TEST-001",
  resourceId: "tenis-cancha-1",
  memberId: "M001",
  start: "2025-09-26T21:00:00.000Z", // 26 sep 21:00
  end: "2025-09-26T23:00:00.000Z",   // 26 sep 23:00 (ya terminó)
  invitados: 0,
  nombreContacto: "Usuario Prueba",
  contacto: "123-456-7890",
  medioContacto: "telefono",
  adelanto: 0,
  montoTotal: 50000,
  status: "ACTIVO", // Esta debería cambiar automáticamente a CULMINADO
  notas: "Reserva de prueba para testing automático",
  createdBy: "system",
  createdAt: "2025-09-26T20:00:00.000Z",
  updatedAt: "2025-09-26T20:00:00.000Z",
  pagos: []
};

// Agregar la reserva de prueba
db.reservations.push(testReservation);

// Guardar la base de datos
fs.writeFileSync('C:/Garden/data/db.json', JSON.stringify(db, null, 2));

console.log('✅ Reserva de prueba agregada:');
console.log(`ID: ${testReservation.id}`);
console.log(`Estado: ${testReservation.status}`);
console.log(`Fecha fin: ${testReservation.end}`);
console.log(`Cliente: ${testReservation.nombreContacto}`);
console.log('');
console.log('Esta reserva debería cambiar automáticamente a CULMINADO cuando se cargue la página de reservas.');