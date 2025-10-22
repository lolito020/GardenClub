import fs from 'fs/promises';
import bcrypt from 'bcryptjs';

async function resetPorteriaPassword() {
  try {
    console.log('🔧 Cargando base de datos...');
    const dbPath = './data/db.json';
    const data = JSON.parse(await fs.readFile(dbPath, 'utf-8'));
    
    // Buscar el usuario de portería
    const porteriaUser = data.users.find(u => u.email === 'porteria@gardenclub.py');
    
    if (!porteriaUser) {
      console.log('❌ Usuario de portería no encontrado');
      return;
    }
    
    // Nueva contraseña simple
    const newPassword = '123456';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    console.log('🔑 Actualizando contraseña del usuario de portería...');
    porteriaUser.passwordHash = hashedPassword;
    
    // También vamos a asegurar que el usuario admin tenga la misma contraseña
    const adminUser = data.users.find(u => u.email === 'admin@gardenclub.py');
    if (adminUser) {
      console.log('🔑 Actualizando contraseña del usuario admin...');
      adminUser.passwordHash = hashedPassword;
    }
    
    // Guardar cambios
    await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
    
    console.log('✅ Contraseñas actualizadas exitosamente!');
    console.log('📧 Usuario: porteria@gardenclub.py');
    console.log('🔐 Contraseña: 123456');
    console.log('');
    console.log('📧 Usuario: admin@gardenclub.py');
    console.log('🔐 Contraseña: 123456');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

resetPorteriaPassword();