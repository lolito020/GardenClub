import fs from 'fs';

console.log('🧪 Verificando funcionalidad de espacios por servicio...');

try {
  // Leer la base de datos actual
  const dbContent = fs.readFileSync('data/db.json', 'utf8');
  const db = JSON.parse(dbContent);

  console.log('\n📋 VERIFICACIÓN DEL ESTADO:');
  
  // 1. Verificar servicios con espacios disponibles
  const serviciosConEspacios = db.services?.filter(s => s.espaciosDisponibles && s.espaciosDisponibles.length > 0) || [];
  const serviciosSinEspacios = db.services?.filter(s => s.permiteAgendamiento && (!s.espaciosDisponibles || s.espaciosDisponibles.length === 0)) || [];
  
  console.log(`\n✅ SERVICIOS CON ESPACIOS CONFIGURADOS (${serviciosConEspacios.length}):`);
  serviciosConEspacios.forEach(servicio => {
    console.log(`   📍 ${servicio.nombre}:`);
    servicio.espaciosDisponibles.forEach(espacio => {
      console.log(`     - ${espacio.nombre} (ID: ${espacio.id})`);
    });
  });

  console.log(`\n⚪ SERVICIOS SIN ESPACIOS ESPECÍFICOS (${serviciosSinEspacios.length}):`);
  serviciosSinEspacios.forEach(servicio => {
    console.log(`   📍 ${servicio.nombre} → Usará: "Espacio: ${servicio.nombre}"`);
  });

  // 2. Verificar que resources coincidan con espacios de servicios
  console.log(`\n🏗️  RESOURCES CREADOS (${db.resources?.length || 0}):`);
  db.resources?.forEach(resource => {
    console.log(`   🏢 ${resource.nombre} (ID: ${resource.id})`);
  });

  // 3. Verificar reservas existentes
  console.log(`\n📅 RESERVAS EXISTENTES (${db.reservations?.length || 0}):`);
  db.reservations?.forEach(reservation => {
    const resource = db.resources?.find(r => r.id === reservation.resourceId);
    console.log(`   🎫 ${reservation.id}: ${resource?.nombre || 'Recurso no encontrado'} (${reservation.resourceId})`);
  });

  // 4. Casos de prueba simulados
  console.log('\n🎯 CASOS DE PRUEBA SIMULADOS:');
  
  // Caso 1: Servicio con espacios (Tenis)
  const servicioTenis = db.services?.find(s => s.nombre === 'Tenis');
  if (servicioTenis) {
    console.log(`\n   🎾 TENIS (${servicioTenis.id}):`);
    if (servicioTenis.espaciosDisponibles && servicioTenis.espaciosDisponibles.length > 0) {
      console.log(`     ✅ Espacios configurados: ${servicioTenis.espaciosDisponibles.length}`);
      servicioTenis.espaciosDisponibles.forEach(espacio => {
        console.log(`       - ${espacio.nombre}`);
      });
    } else {
      console.log(`     ➡️  Sin espacios → Mostrará: "Espacio: Tenis"`);
    }
  }

  // Caso 2: Servicio sin espacios que permite agendamiento
  const servicioSinEspacios = serviciosSinEspacios[0];
  if (servicioSinEspacios) {
    console.log(`\n   📝 ${servicioSinEspacios.nombre.toUpperCase()} (${servicioSinEspacios.id}):`);
    console.log(`     ➡️  Sin espacios configurados → Mostrará: "Espacio: ${servicioSinEspacios.nombre}"`);
  }

  // 5. Validaciones
  console.log('\n🔍 VALIDACIONES:');
  
  const totalEspaciosEnServicios = serviciosConEspacios.reduce((total, s) => total + s.espaciosDisponibles.length, 0);
  const totalResources = db.resources?.length || 0;
  
  console.log(`   • Espacios en servicios: ${totalEspaciosEnServicios}`);
  console.log(`   • Resources creados: ${totalResources}`);
  console.log(`   • Coincidencia: ${totalEspaciosEnServicios === totalResources ? '✅' : '❌'}`);

  // 6. Instrucciones de prueba
  console.log('\n📝 PRÓXIMOS PASOS PARA PROBAR:');
  console.log('   1. Ir a página de socios');
  console.log('   2. Seleccionar "Contado" o "Crédito"');
  console.log('   3. Agregar concepto "Tenis" y marcar "Suscripción"');
  console.log('   4. Hacer clic en "Configurar Reserva"');
  console.log('   5. Verificar que solo aparecen las canchas de tenis');
  console.log('   6. Probar con otros servicios para ver espacios específicos');

} catch (error) {
  console.error('❌ Error:', error);
}