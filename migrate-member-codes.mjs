#!/usr/bin/env node

import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrateMemberCodes() {
  console.log('🔄 Migrating member codes from SOC-XXXXX to numeric format...\n');
  
  try {
    const dbPath = join(__dirname, 'data', 'db.json');
    const dbContent = await readFile(dbPath, 'utf-8');
    const db = JSON.parse(dbContent);
    
    console.log(`📊 Current state:`);
    console.log(`   Total members: ${db.members.length}`);
    console.log(`   Current sequence: ${db.sequences.member}`);
    
    // Mostrar códigos actuales
    console.log(`\n📋 Current member codes:`);
    db.members.forEach((member, index) => {
      console.log(`   ${index + 1}. ${member.codigo} - ${member.nombres} ${member.apellidos}`);
    });
    
    // Filtrar solo socios (no no-socios) para migrar
    const sociosToMigrate = db.members.filter(m => 
      m.codigo.startsWith('SOC-') && m.subcategoria !== 'NO SOCIO'
    );
    
    console.log(`\n🔄 Migrating ${sociosToMigrate.length} socio codes:`);
    
    let nextNumber = 1;
    
    // Migrar códigos de socios
    sociosToMigrate.forEach(member => {
      const oldCode = member.codigo;
      const newCode = String(nextNumber);
      
      // Actualizar el código del miembro
      const memberIndex = db.members.findIndex(m => m.id === member.id);
      db.members[memberIndex].codigo = newCode;
      
      console.log(`   ✅ ${oldCode} → ${newCode} (${member.nombres} ${member.apellidos})`);
      nextNumber++;
    });
    
    // Actualizar la secuencia para que el próximo socio obtenga el número correcto
    db.sequences.member = nextNumber - 1;
    
    console.log(`\n📊 After migration:`);
    console.log(`   Updated sequence to: ${db.sequences.member}`);
    console.log(`   Next socio will get code: ${nextNumber}`);
    
    // Guardar cambios
    await writeFile(dbPath, JSON.stringify(db, null, 2));
    
    console.log(`\n✅ Migration completed successfully!`);
    
    // Mostrar estado final
    console.log(`\n📋 Final member codes:`);
    db.members.forEach((member, index) => {
      const prefix = member.subcategoria === 'NO SOCIO' ? '🔸' : '🔹';
      console.log(`   ${prefix} ${member.codigo} - ${member.nombres} ${member.apellidos} (${member.subcategoria})`);
    });
    
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }
}

migrateMemberCodes();