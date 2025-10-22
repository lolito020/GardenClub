#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// import { nanoid } from 'nanoid';

// Función simple para generar IDs
function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function addHoraExtraService() {
  try {
    console.log('🕐 Adding HORA EXTRA service...\n');
    
    const dbPath = join(__dirname, '..', 'data', 'db.json');
    const dbContent = await readFile(dbPath, 'utf-8');
    const db = JSON.parse(dbContent);
    
    // Verificar si ya existe un servicio "Hora Extra"
    const existingService = db.services.find(s => 
      s.nombre.toUpperCase().includes('HORA EXTRA') || 
      s.nombre.toUpperCase().includes('HORAS EXTRAS')
    );
    
    if (existingService) {
      console.log(`✅ Service already exists: ${existingService.nombre} (ID: ${existingService.id})`);
      console.log(`   Type: ${existingService.tipo}`);
      console.log(`   Price Socio: $${existingService.precioSocio}`);
      console.log(`   Price No-socio: $${existingService.precioNoSocio}`);
      return existingService;
    }
    
    // Crear nuevo servicio "Hora Extra"
    const horaExtraService = {
      id: `s_hora_extra_${generateId()}`,
      nombre: 'HORA EXTRA',
      descripcion: 'Hora extra para eventos y servicios',
      precio: 50000, // Precio base
      precioSocio: 50000,
      precioNoSocio: 60000, // Precio ligeramente mayor para no socios
      tipo: 'UNICO', // Tipo único ya que cada hora extra es un cobro individual
      obligatorio: false,
      activo: true,
      categoria: 'Servicios',
      socios: true,
      noSocios: true,
      comisionCobrador: 0,
      // Campos específicos para hora extra
      esHoraExtra: true, // Flag para identificar este servicio como hora extra
      permiteAgendamiento: false // No necesita agendamiento ya que se crea automáticamente
    };
    
    console.log(`📋 Creating new service:`);
    console.log(`   Name: ${horaExtraService.nombre}`);
    console.log(`   Type: ${horaExtraService.tipo}`);
    console.log(`   Price Socio: $${horaExtraService.precioSocio}`);
    console.log(`   Price No-socio: $${horaExtraService.precioNoSocio}`);
    
    // Agregar el servicio a la base de datos
    db.services.push(horaExtraService);
    
    console.log(`\n📊 Total services after addition: ${db.services.length}`);
    
    // Guardar cambios
    await writeFile(dbPath, JSON.stringify(db, null, 2));
    
    console.log(`\n✅ HORA EXTRA service added successfully!`);
    console.log(`   Service ID: ${horaExtraService.id}`);
    
    return horaExtraService;
    
  } catch (error) {
    console.error('❌ Error adding HORA EXTRA service:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  addHoraExtraService();
}

export { addHoraExtraService };