#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function addDiarioServices() {
  console.log('📅 Adding DIARIO service types...\n');
  
  try {
    const dbPath = join(__dirname, 'data', 'db.json');
    const dbContent = await readFile(dbPath, 'utf-8');
    const db = JSON.parse(dbContent);
    
    // Servicios diarios para agregar
    const diarioServices = [
      {
        id: `s_diario_${nanoid(8)}`,
        nombre: 'INGRESO DIARIO PILETA',
        descripcion: 'Acceso diario a la pileta para no-socios',
        precio: 15000, // Precio base
        precioSocio: 10000, // Descuento para socios
        precioNoSocio: 15000, // Precio completo para no-socios
        tipo: 'DIARIO',
        obligatorio: false,
        activo: true,
        categoria: 'Deportes',
        socios: true,
        noSocios: true,
        comisionCobrador: 5
      },
      {
        id: `s_diario_${nanoid(8)}`,
        nombre: 'INGRESO DIARIO GIMNASIO',
        descripcion: 'Acceso diario al gimnasio',
        precio: 20000,
        precioSocio: 15000,
        precioNoSocio: 20000,
        tipo: 'DIARIO',
        obligatorio: false,
        activo: true,
        categoria: 'Deportes',
        socios: true,
        noSocios: true,
        comisionCobrador: 5
      },
      {
        id: `s_diario_${nanoid(8)}`,
        nombre: 'ESTACIONAMIENTO DIARIO',
        descripcion: 'Estacionamiento por día',
        precio: 8000,
        precioSocio: 5000,
        precioNoSocio: 8000,
        tipo: 'DIARIO',
        obligatorio: false,
        activo: true,
        categoria: 'Servicios',
        socios: true,
        noSocios: true,
        comisionCobrador: 0
      },
      {
        id: `s_diario_${nanoid(8)}`,
        nombre: 'ALQUILER CANCHA TENIS DIA',
        descripcion: 'Alquiler de cancha de tenis por día',
        precio: 50000,
        precioSocio: 40000,
        precioNoSocio: 50000,
        tipo: 'DIARIO',
        obligatorio: false,
        activo: true,
        categoria: 'Alquileres',
        socios: true,
        noSocios: true,
        comisionCobrador: 8
      }
    ];
    
    console.log(`📊 Before adding DIARIO services:`);
    console.log(`   Total services: ${db.services.length}`);
    
    const diarioCount = db.services.filter(s => s.tipo === 'DIARIO').length;
    console.log(`   DIARIO services: ${diarioCount}`);
    
    // Agregar los nuevos servicios
    diarioServices.forEach(service => {
      db.services.push(service);
      console.log(`   ✅ Added: ${service.nombre} ($${service.precioSocio}/$${service.precioNoSocio})`);
    });
    
    console.log(`\n📊 After adding DIARIO services:`);
    console.log(`   Total services: ${db.services.length}`);
    console.log(`   DIARIO services: ${db.services.filter(s => s.tipo === 'DIARIO').length}`);
    
    // Guardar cambios
    await writeFile(dbPath, JSON.stringify(db, null, 2));
    
    console.log(`\n✅ DIARIO services added successfully!`);
    
    // Mostrar resumen de servicios por tipo
    const servicesByType = {};
    db.services.forEach(s => {
      servicesByType[s.tipo] = (servicesByType[s.tipo] || 0) + 1;
    });
    
    console.log(`\n📋 Services by type:`);
    Object.entries(servicesByType).forEach(([tipo, count]) => {
      console.log(`   ${tipo}: ${count} services`);
    });
    
  } catch (error) {
    console.error('❌ Error adding DIARIO services:', error);
    process.exit(1);
  }
}

addDiarioServices();