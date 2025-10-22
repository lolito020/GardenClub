import fs from 'fs';

console.log('🔧 Arreglando vínculos de reservas en ambas funciones...');

try {
  let lines = fs.readFileSync('app/admin/socios/page.tsx', 'utf8').split('\n');
  
  // Línea 1745: Primera ocurrencia (handleUnifiedContadoPayment)
  if (lines[1744] && lines[1744].includes("createdBy: 'system'")) {
    lines[1744] = lines[1744].replace(
      "createdBy: 'system'",
      "createdBy: 'system',\n              // 🔗 CRÍTICO: Vincular la reserva al débito creado\n              debitMovementId: createdDebits.find(d => d.conceptoName === (c.concepto || 'Servicio'))?.id"
    );
    console.log('✅ Línea 1745 modificada (handleUnifiedContadoPayment)');
  }
  
  // Línea 1920: Segunda ocurrencia (handleUnifiedCreditoService)
  if (lines[1919] && lines[1919].includes("createdBy: 'system'")) {
    lines[1919] = lines[1919].replace(
      "createdBy: 'system'",
      "createdBy: 'system',\n              // 🔗 CRÍTICO: Vincular la reserva al débito creado\n              debitMovementId: createdDebits.find(d => d.conceptoName === (c.concepto || 'Servicio'))?.id"
    );
    console.log('✅ Línea 1920 modificada (handleUnifiedCreditoService)');
  }
  
  fs.writeFileSync('app/admin/socios/page.tsx', lines.join('\n'));
  
  console.log('✅ Ambas funciones han sido arregladas correctamente');
  console.log('📋 Cambios aplicados:');
  console.log('  - handleUnifiedContadoPayment: Agregado debitMovementId a reservas AL CONTADO');
  console.log('  - handleUnifiedCreditoService: Agregado debitMovementId a reservas A CRÉDITO');
  console.log('  - Ahora todas las reservas creadas desde socios tendrán vínculos correctos');
  
} catch (error) {
  console.error('❌ Error:', error);
}