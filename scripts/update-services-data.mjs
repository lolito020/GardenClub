// Script para actualizar los servicios con los nuevos campos SOCIOS y NO SOCIOS
// Ejecutar con: node scripts/update-services-data.mjs

import fs from 'fs';
import path from 'path';

// Datos de servicios actualizados según la tabla proporcionada
const serviciosData = [
  {
    nombre: "ADHESION",
    socios: true,
    noSocios: false,
    categoria: "OTROS",
    tipo: "UNICO",
    precio: 50000
  },
  {
    nombre: "BASQUET",
    socios: true,
    noSocios: true,
    categoria: "DEPORTES",
    tipo: "MENSUAL",
    precio: 120000
  },
  {
    nombre: "SALON CASCADA",
    socios: true,
    noSocios: true,
    categoria: "ALQUILER",
    tipo: "UNICO",
    precio: 1000000
  },
  {
    nombre: "CUOTA DE INGRESO",
    socios: true,
    noSocios: false,
    categoria: "OTROS",
    tipo: "UNICO",
    precio: 15000000
  },
  {
    nombre: "CUOTA DE SOCIAL",
    socios: true,
    noSocios: false,
    categoria: "OTROS",
    tipo: "MENSUAL",
    precio: 150000
  },
  {
    nombre: "FOTO CARNET",
    socios: true,
    noSocios: false,
    categoria: "OTROS",
    tipo: "UNICO",
    precio: 25000
  },
  {
    nombre: "HIDROGYM",
    socios: true,
    noSocios: true,
    categoria: "DEPORTES",
    tipo: "MENSUAL",
    precio: 120000
  },
  {
    nombre: "INGRESOS DEPORTIVOS NO SOCIOS",
    socios: false,
    noSocios: true,
    categoria: "OTROS",
    tipo: "UNICO",
    precio: 100000
  },
  {
    nombre: "INGRESOS POR FESTIVALES",
    socios: true,
    noSocios: true,
    categoria: "OTROS",
    tipo: "UNICO",
    precio: 100000
  },
  {
    nombre: "NATACION COMPETITIVA",
    socios: true,
    noSocios: true,
    categoria: "DEPORTES",
    tipo: "MENSUAL",
    precio: 100000
  },
  {
    nombre: "NATACION",
    socios: true,
    noSocios: true,
    categoria: "DEPORTES",
    tipo: "MENSUAL",
    precio: 120000
  },
  {
    nombre: "QUINCHO CENTRAL",
    socios: true,
    noSocios: true,
    categoria: "ALQUILER",
    tipo: "UNICO",
    precio: 800000
  },
  {
    nombre: "QUINCHO CHICO",
    socios: true,
    noSocios: true,
    categoria: "ALQUILER",
    tipo: "UNICO",
    precio: 800000
  },
  {
    nombre: "VOLLEY",
    socios: true,
    noSocios: true,
    categoria: "DEPORTES",
    tipo: "MENSUAL",
    precio: 120000
  }
];

// Función para leer la base de datos actual
function leerDB() {
  try {
    const dbPath = path.join(process.cwd(), 'data', 'db.json');
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.log('No se pudo leer db.json, creando estructura nueva...');
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

// Función para crear categorías si no existen
function crearCategorias(db) {
  const categoriasNecesarias = ['OTROS', 'DEPORTES', 'ALQUILER'];
  
  if (!db.categories) {
    db.categories = [];
  }
  
  categoriasNecesarias.forEach(nombreCategoria => {
    const existe = db.categories.find(cat => cat.nombre === nombreCategoria);
    if (!existe) {
      const nuevaCategoria = {
        id: `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        nombre: nombreCategoria,
        activo: true
      };
      db.categories.push(nuevaCategoria);
      console.log(`📁 Categoría creada: ${nombreCategoria}`);
    }
  });
}

// Función principal para actualizar servicios
function actualizarServicios() {
  console.log('🔄 Iniciando actualización de servicios...');
  
  const db = leerDB();
  
  // Crear categorías necesarias
  crearCategorias(db);
  
  if (!db.services) {
    db.services = [];
  }
  
  let serviciosCreados = 0;
  let serviciosActualizados = 0;
  
  serviciosData.forEach(servicioData => {
    // Buscar si el servicio ya existe
    let servicioExistente = db.services.find(s => 
      s.nombre.toLowerCase() === servicioData.nombre.toLowerCase()
    );
    
    if (servicioExistente) {
      // Actualizar servicio existente
      servicioExistente.socios = servicioData.socios;
      servicioExistente.noSocios = servicioData.noSocios;
      servicioExistente.categoria = servicioData.categoria;
      servicioExistente.tipo = servicioData.tipo;
      servicioExistente.precio = servicioData.precio;
      servicioExistente.activo = true;
      
      console.log(`🔄 Servicio actualizado: ${servicioData.nombre}`);
      serviciosActualizados++;
    } else {
      // Crear nuevo servicio
      const nuevoServicio = {
        id: `srv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        nombre: servicioData.nombre,
        descripcion: `Servicio ${servicioData.nombre}`,
        precio: servicioData.precio,
        tipo: servicioData.tipo,
        obligatorio: false,
        aplicaA: [],
        comisionCobrador: null,
        activo: true,
        categoria: servicioData.categoria,
        socios: servicioData.socios,
        noSocios: servicioData.noSocios
      };
      
      db.services.push(nuevoServicio);
      console.log(`✅ Servicio creado: ${servicioData.nombre}`);
      serviciosCreados++;
    }
  });
  
  // Guardar cambios
  guardarDB(db);
  
  console.log('\n📊 Resumen:');
  console.log(`   • Servicios creados: ${serviciosCreados}`);
  console.log(`   • Servicios actualizados: ${serviciosActualizados}`);
  console.log(`   • Total de servicios en DB: ${db.services.length}`);
  console.log('\n🎉 ¡Actualización completada!');
}

// Ejecutar el script
actualizarServicios();