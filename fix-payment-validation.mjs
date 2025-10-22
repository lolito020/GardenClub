import { readFileSync, writeFileSync } from 'fs';

const filePath = 'C:\\Garden\\app\\admin\\socios\\page.tsx';
let content = readFileSync(filePath, 'utf-8');

// Buscar y reemplazar las líneas de alert y return en el manejo de errores de reserva
const oldPattern = /console\.warn\(`No se pudo crear la reserva para \${c\.concepto}:`, errorMsg\);\s*alert\(`❌ No se pudo crear la reserva para \${c\.concepto}:\\n\\n\${errorMsg}`\);\s*return; \/\/ Detener el proceso/g;

const newReplacement = `console.warn(\`⚠️ No se pudo crear la reserva para \${c.concepto}:\`, errorMsg);
              // Nota: La validación principal se hace al guardar datos de reserva
              // Si llegamos aquí, puede ser un conflicto que surgió después
              // Continuamos con el pago pero registramos el issue`;

const newContent = content.replace(oldPattern, newReplacement);

if (newContent !== content) {
  writeFileSync(filePath, newContent, 'utf-8');
  console.log('Archivo modificado exitosamente. Se removió el alert durante el proceso de pago.');
} else {
  console.log('No se encontraron patrones para modificar.');
}

console.log('Verificando cambios...');
const lines = newContent.split('\n');
let found = 0;
lines.forEach((line, index) => {
  if (line.includes('⚠️ No se pudo crear la reserva')) {
    console.log(`Línea ${index + 1}: ${line.trim()}`);
    found++;
  }
});
console.log(`Se encontraron ${found} modificaciones.`);