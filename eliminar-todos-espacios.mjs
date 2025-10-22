import fs from 'fs';

console.log('🗑️ Eliminando todos los espacios existentes...');

try {
  // Leer la base de datos actual
  const dbPath = 'data/db.json';
  const dbContent = fs.readFileSync(dbPath, 'utf8');
  const db = JSON.parse(dbContent);

  console.log('\n📊 Estado antes de la limpieza:');
  console.log(`   • Servicios: ${db.services?.length || 0}`);
  console.log(`   • Resources: ${db.resources?.length || 0}`);
  console.log(`   • Reservations: ${db.reservations?.length || 0}`);

  // Contar servicios con espacios disponibles antes
  const serviciosConEspaciosAntes = db.services?.filter(s => s.espaciosDisponibles && s.espaciosDisponibles.length > 0)?.length || 0;
  console.log(`   • Servicios con espaciosDisponibles: ${serviciosConEspaciosAntes}`);

  // 1. ELIMINAR TODOS LOS RESOURCES
  console.log('\n🗑️ Eliminando todos los resources...');
  db.resources = [];
  console.log('   ✅ Resources eliminados');

  // 2. ELIMINAR ESPACIOS DISPONIBLES DE TODOS LOS SERVICIOS
  console.log('\n🧹 Limpiando espaciosDisponibles de servicios...');
  let serviciosLimpiados = 0;
  if (db.services) {
    db.services.forEach(servicio => {
      if (servicio.espaciosDisponibles) {
        delete servicio.espaciosDisponibles;
        serviciosLimpiados++;
      }
    });
  }
  console.log(`   ✅ ${serviciosLimpiados} servicios limpiados`);

  // 3. LIMPIAR RESERVAS CON RECURSOS INEXISTENTES (opcional)
  console.log('\n🔧 Verificando reservas...');
  let reservasProblematicas = 0;
  if (db.reservations) {
    db.reservations.forEach(reservation => {
      if (reservation.resourceId) {
        reservasProblematicas++;
        console.log(`   ⚠️ Reserva ${reservation.id} usa resourceId: ${reservation.resourceId}`);
      }
    });
  }
  
  if (reservasProblematicas > 0) {
    console.log(`   📝 ${reservasProblematicas} reservas tienen resourceId que no tendrán resources correspondientes`);
    console.log('   💡 Las reservas mantienen sus resourceId por si quieres recuperar los espacios');
  } else {
    console.log('   ✅ No hay reservas con resourceId problemáticos');
  }

  // Guardar la base de datos limpia
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  console.log('\n🎉 LIMPIEZA COMPLETADA:');
  console.log('   ✅ Todos los resources eliminados');
  console.log('   ✅ Todas las propiedades espaciosDisponibles removidas');
  console.log('   ✅ Base de datos lista para pruebas manuales');

  console.log('\n📊 Estado final:');
  console.log(`   • Servicios: ${db.services?.length || 0}`);
  console.log(`   • Resources: ${db.resources?.length || 0}`);
  console.log(`   • Reservations: ${db.reservations?.length || 0}`);

  console.log('\n🧪 LISTO PARA PRUEBAS MANUALES:');
  console.log('   1. Ir a "Editar Servicios - Espacios Disponibles"');
  console.log('   2. Crear espacios manualmente para servicios');
  console.log('   3. Probar "Configurar Reserva" desde página de socios');
  console.log('   4. Verificar que solo aparecen espacios del servicio seleccionado');

} catch (error) {
  console.error('❌ Error:', error);
}