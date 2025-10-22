import fs from 'fs';

console.log('🔍 Diagnosticando el problema de espacios...');

try {
  const dbContent = fs.readFileSync('data/db.json', 'utf8');
  const db = JSON.parse(dbContent);

  console.log('\n📊 ANÁLISIS DEL SERVICIO TENIS:');
  
  // Buscar el servicio de Tenis
  const servicioTenis = db.services?.find(s => s.nombre === 'Tenis' || s.id === 's4');
  
  if (servicioTenis) {
    console.log(`✅ Servicio encontrado: ${servicioTenis.nombre} (ID: ${servicioTenis.id})`);
    
    // Verificar estructura antigua (espacios)
    if (servicioTenis.espacios) {
      console.log(`📍 Propiedad 'espacios' (antigua): ${servicioTenis.espacios.length} elementos`);
      servicioTenis.espacios.forEach((espacio, index) => {
        console.log(`   ${index + 1}. "${espacio}"`);
      });
    } else {
      console.log('❌ No tiene propiedad "espacios"');
    }
    
    // Verificar estructura nueva (espaciosDisponibles)
    if (servicioTenis.espaciosDisponibles) {
      console.log(`📍 Propiedad 'espaciosDisponibles' (nueva): ${servicioTenis.espaciosDisponibles.length} elementos`);
      servicioTenis.espaciosDisponibles.forEach((espacio, index) => {
        console.log(`   ${index + 1}. "${espacio.nombre}" (ID: ${espacio.id})`);
      });
    } else {
      console.log('❌ No tiene propiedad "espaciosDisponibles"');
    }
  } else {
    console.log('❌ Servicio Tenis no encontrado');
  }

  console.log('\n🔧 COMPORTAMIENTO ESPERADO DESPUÉS DEL FIX:');
  if (servicioTenis) {
    if (servicioTenis.espaciosDisponibles && servicioTenis.espaciosDisponibles.length > 0) {
      console.log('   → Usará espaciosDisponibles (estructura nueva)');
      servicioTenis.espaciosDisponibles.forEach(e => {
        console.log(`     - ${e.nombre}`);
      });
    } else if (servicioTenis.espacios && servicioTenis.espacios.length > 0) {
      console.log('   → Usará espacios (estructura antigua) convertidos:');
      servicioTenis.espacios.forEach((nombre, i) => {
        console.log(`     - ${nombre} (ID: ${servicioTenis.id}-espacio-${i})`);
      });
    } else {
      console.log('   → Usará espacio virtual: "Tenis"');
    }
  }

  console.log('\n📋 RECURSOS DISPONIBLES:');
  if (db.resources && db.resources.length > 0) {
    console.log(`   ${db.resources.length} resources en la base de datos:`);
    db.resources.forEach(r => {
      console.log(`   - ${r.nombre} (ID: ${r.id})`);
    });
  } else {
    console.log('   ❌ No hay resources en la base de datos');
  }

  console.log('\n🧪 PRUEBA AHORA:');
  console.log('   1. Ve a cobranzas → contado');
  console.log('   2. Selecciona "Tenis"');
  console.log('   3. Configura reserva');
  console.log('   4. En "Espacio" deberías ver: "Cancha tenis del fondo"');

} catch (error) {
  console.error('❌ Error:', error);
}