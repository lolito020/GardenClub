import { readFileSync, writeFileSync } from 'fs';

const filePath = 'C:\\Garden\\app\\admin\\socios\\page.tsx';
let content = readFileSync(filePath, 'utf-8');

// Reemplazar el primer bloque de manejo de errores (línea ~1808)
const pattern1 = /console\.warn\(`⚠️ No se pudo crear la reserva para \${c\.concepto}:`, errorMsg\);\s*\/\/ Nota: La validación principal se hace al guardar datos de reserva\s*\/\/ Si llegamos aquí, puede ser un conflicto que surgió después\s*\/\/ Continuamos con el pago pero registramos el issue/g;

const replacement1 = `console.error(\`❌ No se pudo crear la reserva para \${c.concepto}:\`, errorMsg);
              alert(\`⚠️ Error procesando reserva\\n\\nNo se pudo crear la reserva para "\${c.concepto}".\\n\\n\${errorMsg}\\n\\nEl pago no se procesará. Por favor verifique la disponibilidad del horario.\`);
              return; // Detener el proceso para evitar pago sin reserva`;

content = content.replace(pattern1, replacement1);

// También agregar return al catch de error
const pattern2 = /console\.error\(`Error creando reserva para \${c\.concepto}:`, error\);(?!\s*alert)/g;

const replacement2 = `console.error(\`Error creando reserva para \${c.concepto}:\`, error);
            alert(\`⚠️ Error inesperado\\n\\nError creando reserva para "\${c.concepto}": \${error}\\n\\nEl pago no se procesará.\`);
            return;`;

content = content.replace(pattern2, replacement2);

writeFileSync(filePath, content, 'utf-8');
console.log('Archivo modificado exitosamente. Se restauró la validación durante el pago.');