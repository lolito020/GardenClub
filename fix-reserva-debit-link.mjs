import fs from 'fs';

console.log('🔧 Arreglando vínculos de reservas a débitos...');

try {
  let content = fs.readFileSync('app/admin/socios/page.tsx', 'utf8');
  
  // Buscar y reemplazar la primera instancia (línea ~1745)
  const oldCode1 = `              createdBy: 'system'
            };`;
  
  const newCode1 = `              createdBy: 'system',
              // 🔗 CRÍTICO: Vincular la reserva al débito creado
              debitMovementId: createdDebits.find(d => d.conceptoName === (c.concepto || 'Servicio'))?.id
            };`;
  
  // Reemplazar todas las instancias
  const updatedContent = content.replace(new RegExp(oldCode1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newCode1);
  
  fs.writeFileSync('app/admin/socios/page.tsx', updatedContent);
  
  console.log('✅ Vínculos de reservas arreglados correctamente');
  console.log('📋 Cambios aplicados:');
  console.log('  - Agregado debitMovementId a reservas creadas desde página de socios');
  console.log('  - Ahora las reservas AL CONTADO tendrán vínculos correctos a sus débitos');
  
} catch (error) {
  console.error('❌ Error:', error);
}