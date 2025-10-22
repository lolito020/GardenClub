// Script temporal para debug de reservas
// Ejecutar en la consola del navegador

// Verificar si hay reservas recientes en la base de datos
fetch('/api/reservas?includeHistory=false')
  .then(res => res.json())
  .then(data => {
    console.log('📋 Reservas activas actuales:', data);
    return data;
  })
  .catch(error => console.error('❌ Error obteniendo reservas:', error));

// Probar creación manual de reserva
const testReserva = {
  resourceId: "s4-espacio-0",
  memberId: "m1",
  start: new Date("2025-09-26T23:00:00.000Z").toISOString(),
  end: new Date("2025-09-27T03:00:00.000Z").toISOString(),
  nombreContacto: "Test Usuario",
  contacto: "0981-123456",
  medioContacto: "whatsapp",
  invitados: 0,
  adelanto: 0,
  montoTotal: 100000,
  status: "ACTIVO",
  notas: "Reserva de prueba",
  createdBy: "test"
};

console.log('🧪 Probando creación de reserva manual:', testReserva);

fetch('/api/reservas', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(testReserva)
})
.then(res => {
  console.log('📡 Respuesta:', res.status, res.statusText);
  return res.json();
})
.then(data => {
  console.log('✅ Resultado:', data);
})
.catch(error => {
  console.error('❌ Error:', error);
});