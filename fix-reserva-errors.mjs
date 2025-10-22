import { readFileSync, writeFileSync } from 'fs';

const filePath = 'C:\\Garden\\app\\admin\\socios\\page.tsx';
const lines = readFileSync(filePath, 'utf-8').split('\n');

// Función para reemplazar la línea específica
function replaceErrorHandling(lineIndex) {
  if (lines[lineIndex] && lines[lineIndex].includes('console.warn(`No se pudo crear la reserva para ${c.concepto}:`, await reservaRes.text());')) {
    // Reemplazar la línea problemática
    lines[lineIndex] = '              const errorResponse = await reservaRes.text();';
    
    // Insertar las nuevas líneas después
    const newLines = [
      '              let errorMsg = errorResponse;',
      '              try {',
      '                const errorJson = JSON.parse(errorResponse);',
      '                errorMsg = errorJson.msg || errorResponse;',
      '              } catch (e) {',
      '                // Si no es JSON válido, usar el texto tal como está',
      '              }',
      '              console.warn(`No se pudo crear la reserva para ${c.concepto}:`, errorMsg);',
      '              alert(`❌ No se pudo crear la reserva para ${c.concepto}:\\n\\n${errorMsg}`);',
      '              return; // Detener el proceso'
    ];
    
    lines.splice(lineIndex + 1, 0, ...newLines);
    return true;
  }
  return false;
}

console.log('Buscando líneas para modificar...');

// Buscar y reemplazar todas las ocurrencias
let replacements = 0;
for (let i = 0; i < lines.length; i++) {
  if (replaceErrorHandling(i)) {
    console.log(`Reemplazado en línea ${i + 1}`);
    replacements++;
    i += 10; // Saltar las líneas que acabamos de insertar
  }
}

if (replacements > 0) {
  writeFileSync(filePath, lines.join('\n'), 'utf-8');
  console.log(`Archivo modificado exitosamente. ${replacements} reemplazos realizados.`);
} else {
  console.log('No se encontraron líneas para modificar.');
}