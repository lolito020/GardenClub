// Script para agregar precios diferenciados (socio/no socio) a los servicios existentes
// Ejecutar con: node scripts/add-differential-pricing.mjs

import fs from 'fs';
import path from 'path';

// Configuración de precios diferenciados para servicios específicos
const preciosDiferenciados = {
  "BASQUET": {
    precioSocio: 120000,
    precioNoSocio: 150000 // 25% más caro para no socios
  },
  "HIDROGYM": {
    precioSocio: 120000,
    precioNoSocio: 150000
  },
  "NATACION COMPETITIVA": {
    precioSocio: 100000,
    precioNoSocio: 130000
  },
  "NATACION": {
    precioSocio: 120000,
    precioNoSocio: 150000
  },
  "VOLLEY": {
    precioSocio: 120000,
    precioNoSocio: 150000
  },
  "SALON CASCADA": {
    precioSocio: 1000000,
    precioNoSocio: 1200000 // 20% más caro para no socios
  },
  "QUINCHO CENTRAL": {
    precioSocio: 800000,
    precioNoSocio: 1000000
  },
  "QUINCHO CHICO": {
    precioSocio: 800000,
    precioNoSocio: 1000000
  },
  "INGRESOS DEPORTIVOS NO SOCIOS": {
    precioSocio: null, // No disponible para socios
    precioNoSocio: 100000
  },
  "INGRESOS POR FESTIVALES": {
    precioSocio: 80000,
    precioNoSocio: 100000
  }
};

// Función para leer la base de datos actual
function leerDB() {
  try {
    const dbPath = path.join(process.cwd(), 'data', 'db.json');
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('❌ Error al leer db.json:', error.message);
    return null;
  }
  
  return {
    members: [],
    services: [],
    categories: [],
    collectors: [],
    movements: [],
    payments: [],
    families: [],
    users: []
  };
}

// Función para guardar la base de datos
function guardarDB(db) {
  const dbPath = path.join(process.cwd(), 'data', 'db.json');
  
  // Crear directorio data si no existe
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
  console.log('✅ Base de datos guardada exitosamente');
}

// Función principal para agregar precios diferenciados
function agregarPreciosDiferenciados() {
  console.log('🔄 Iniciando actualización de precios diferenciados...');
  
  const db = leerDB();
  if (!db) {
    console.log('❌ No se pudo leer la base de datos');
    return;
  }
  
  if (!db.services || !Array.isArray(db.services)) {
    console.log('❌ No se encontraron servicios en la base de datos');
    return;
  }
  
  let serviciosActualizados = 0;
  
  db.services.forEach(servicio => {
    const precios = preciosDiferenciados[servicio.nombre];
    
    if (precios) {
      // Agregar precios diferenciados
      servicio.precioSocio = precios.precioSocio;
      servicio.precioNoSocio = precios.precioNoSocio;
      
      console.log(`💰 Precios diferenciados agregados para: ${servicio.nombre}`);
      console.log(`   • Socios: ${precios.precioSocio ? `Gs. ${precios.precioSocio.toLocaleString()}` : 'No disponible'}`);
      console.log(`   • No Socios: ${precios.precioNoSocio ? `Gs. ${precios.precioNoSocio.toLocaleString()}` : 'No disponible'}`);
      
      serviciosActualizados++;
    } else {
      // Para servicios sin precios diferenciados, usar el precio base para ambos
      servicio.precioSocio = servicio.precio;
      servicio.precioNoSocio = servicio.precio;
      
      console.log(`📝 Precio unificado para: ${servicio.nombre} - Gs. ${servicio.precio.toLocaleString()}`);
    }
  });
  
  // Guardar cambios
  guardarDB(db);
  
  console.log('\n📊 Resumen:');
  console.log(`   • Servicios con precios diferenciados: ${serviciosActualizados}`);
  console.log(`   • Servicios con precio unificado: ${db.services.length - serviciosActualizados}`);
  console.log(`   • Total de servicios procesados: ${db.services.length}`);
  console.log('\n🎉 ¡Actualización de precios completada!');
}

// Ejecutar el script
agregarPreciosDiferenciados();