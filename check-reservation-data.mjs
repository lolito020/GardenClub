import fs from 'fs';

console.log('🔍 Verificando datos de reserva...');

try {
  const dbData = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));
  
  const reservation = dbData.reservas.find(r => r.id === 'RES-000002');
  
  console.log('📋 RESERVA RES-000002:');
  console.log(JSON.stringify(reservation, null, 2));
  
  if (reservation && reservation.memberId) {
    const member = dbData.members.find(m => m.id === reservation.memberId);
    console.log('\n👤 SOCIO ASOCIADO:');
    console.log(`ID: ${member?.id}, Nombre: ${member?.name}`);
  }
  
} catch (error) {
  console.error('Error:', error);
}