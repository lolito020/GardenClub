import fs from 'fs';

console.log('🧹 Limpiando base de datos y configurando espacios por servicio...');

try {
  // Leer la base de datos actual
  const dbPath = 'data/db.json';
  const dbContent = fs.readFileSync(dbPath, 'utf8');
  const db = JSON.parse(dbContent);

  console.log('\n📊 Estado actual:');
  console.log(`   • Servicios: ${db.services?.length || 0}`);
  console.log(`   • Resources (espacios): ${db.resources?.length || 0}`);
  console.log(`   • Reservations: ${db.reservations?.length || 0}`);

  // 1. LIMPIAR RESOURCES (venues) ACTUALES
  console.log('\n🗑️  Eliminando espacios genéricos actuales...');
  const reservationsWithResources = (db.reservations || []).map(r => r.resourceId).filter(Boolean);
  console.log(`   • Reservas que usan recursos: ${[...new Set(reservationsWithResources)].length} únicos`);
  
  // Eliminar todos los resources actuales
  db.resources = [];
  console.log('   ✅ Resources genéricos eliminados');

  // 2. CONFIGURAR ESPACIOS DISPONIBLES POR SERVICIO
  console.log('\n🔧 Configurando espacios disponibles por servicio...');
  
  // Configuraciones específicas por servicio
  const serviciosConEspacios = {
    's4': { // Tenis
      nombre: 'Tenis',
      espaciosDisponibles: [
        { 
          id: 'tenis-cancha-1', 
          nombre: 'Cancha de Tenis 1', 
          descripcion: 'Cancha principal de tenis',
          precioBaseHora: 50000,
          capacidad: 4 
        },
        { 
          id: 'tenis-cancha-2', 
          nombre: 'Cancha de Tenis 2', 
          descripcion: 'Cancha secundaria de tenis',
          precioBaseHora: 45000,
          capacidad: 4 
        }
      ]
    },
    's3': { // Natación
      nombre: 'Natación',
      espaciosDisponibles: [
        { 
          id: 'natacion-piscina-olimpica', 
          nombre: 'Piscina Olímpica', 
          descripcion: 'Piscina de 50 metros',
          precioBaseHora: 80000,
          capacidad: 20 
        },
        { 
          id: 'natacion-piscina-recreativa', 
          nombre: 'Piscina Recreativa', 
          descripcion: 'Piscina para actividades recreativas',
          precioBaseHora: 60000,
          capacidad: 15 
        }
      ]
    },
    's5': { // Alquiler Salón Social
      nombre: 'Alquiler Salón Social',
      espaciosDisponibles: [
        { 
          id: 'salon-principal', 
          nombre: 'Salón Principal', 
          descripcion: 'Salón de eventos para celebraciones',
          precioBaseHora: 120000,
          capacidad: 100 
        },
        { 
          id: 'salon-cascada', 
          nombre: 'Salón Cascada', 
          descripcion: 'Salón exclusivo con vista al jardín',
          precioBaseHora: 150000,
          capacidad: 80 
        }
      ]
    },
    'srv-1758646234537-uebnwdlwc': { // BASQUET
      nombre: 'BASQUET',
      espaciosDisponibles: [
        { 
          id: 'basquet-cancha-1', 
          nombre: 'Cancha de Básquet', 
          descripcion: 'Cancha cubierta para básquetbol',
          precioBaseHora: 40000,
          capacidad: 20 
        }
      ]
    }
  };

  // Actualizar servicios con espacios disponibles
  if (db.services) {
    db.services.forEach(servicio => {
      if (serviciosConEspacios[servicio.id]) {
        servicio.espaciosDisponibles = serviciosConEspacios[servicio.id].espaciosDisponibles;
        console.log(`   ✅ ${servicio.nombre}: ${servicio.espaciosDisponibles.length} espacios configurados`);
      } else {
        // Servicios sin espacios específicos (ej: cuotas, adhesión, etc.)
        if (servicio.permiteAgendamiento) {
          console.log(`   ℹ️  ${servicio.nombre}: Sin espacios específicos (usará nombre del servicio)`);
        }
      }
    });
  }

  // 3. ACTUALIZAR RESERVATIONS EXISTENTES
  console.log('\n🔄 Actualizando reservas existentes...');
  if (db.reservations) {
    const mappingViejosANuevos = {
      'venue-001': 'tenis-cancha-1',
      'venue-002': 'tenis-cancha-2', 
      'venue-003': 'natacion-piscina-olimpica',
      'venue-004': 'natacion-piscina-recreativa',
      'venue-005': 'salon-principal',
      'venue-006': 'salon-cascada',
      'venue-007': 'quincho-bbq', // Este no tiene servicio específico
      'venue-008': 'basquet-cancha-1'
    };

    db.reservations.forEach(reservation => {
      if (reservation.resourceId && mappingViejosANuevos[reservation.resourceId]) {
        const oldId = reservation.resourceId;
        reservation.resourceId = mappingViejosANuevos[oldId];
        console.log(`   🔄 Reserva ${reservation.id}: ${oldId} → ${reservation.resourceId}`);
      }
    });
  }

  // 4. CREAR NUEVO RESOURCES ARRAY CON ESPACIOS DE SERVICIOS
  console.log('\n🏗️  Creando nuevos resources basados en servicios...');
  db.resources = [];
  
  Object.values(serviciosConEspacios).forEach(config => {
    config.espaciosDisponibles.forEach(espacio => {
      db.resources.push({
        id: espacio.id,
        nombre: espacio.nombre,
        descripcion: espacio.descripcion,
        activo: true,
        precioBaseHora: espacio.precioBaseHora,
        garantia: 100000, // Valor por defecto
        capacidad: espacio.capacidad
      });
    });
  });

  console.log(`   ✅ ${db.resources.length} recursos creados desde servicios`);

  // Guardar la base de datos actualizada
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

  console.log('\n🎉 LIMPIEZA Y CONFIGURACIÓN COMPLETADA:');
  console.log('   ✅ Venues genéricos eliminados');
  console.log('   ✅ Espacios disponibles configurados por servicio');
  console.log('   ✅ Reservas existentes actualizadas');
  console.log('   ✅ Nuevos resources creados desde servicios');
  
  console.log('\n📋 ESTADO FINAL:');
  console.log(`   • Servicios con espacios: ${Object.keys(serviciosConEspacios).length}`);
  console.log(`   • Resources totales: ${db.resources.length}`);
  console.log(`   • Reservas actualizadas: ${db.reservations?.length || 0}`);

} catch (error) {
  console.error('❌ Error:', error);
}