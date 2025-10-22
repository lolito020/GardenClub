// Script para actualizar referencias de fecha en los archivos del proyecto
// Este script debe ejecutarse manualmente cuando sea necesario

const fs = require('fs');
const path = require('path');

const replacements = [
  {
    // Reemplazar new Date().toISOString().split('T')[0]
    from: /new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/g,
    to: 'getLocalDateString()',
    needsImport: true
  },
  {
    // Reemplazar new Date().toISOString()
    from: /new Date\(\)\.toISOString\(\)/g,
    to: 'getCurrentLocalDate().toISOString()',
    needsImport: true
  },
  {
    // Reemplazar new Date().toLocaleDateString('es-PY')
    from: /new Date\(\)\.toLocaleDateString\('es-PY'\)/g,
    to: 'formatLocalDate(getCurrentLocalDate(), false)',
    needsImport: true
  },
  {
    // Reemplazar new Date(something).toLocaleDateString('es-PY')
    from: /new Date\(([^)]+)\)\.toLocaleDateString\('es-PY'\)/g,
    to: 'formatLocalDate($1, false)',
    needsImport: true
  },
];

const importStatement = "import { getCurrentLocalDate, getLocalDateString, formatLocalDate } from '@/lib/timezone-config';\n";

function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let needsImport = false;

    // Aplicar todos los reemplazos
    for (const { from, to, needsImport: requiresImport } of replacements) {
      if (from.test(content)) {
        content = content.replace(from, to);
        modified = true;
        if (requiresImport) needsImport = true;
      }
    }

    // Si se modificó y necesita el import, agregarlo
    if (modified && needsImport) {
      // Verificar si ya tiene el import
      if (!content.includes('from \'@/lib/timezone-config\'')) {
        // Encontrar el último import y agregar después
        const lastImportIndex = content.lastIndexOf('import');
        if (lastImportIndex !== -1) {
          const nextLineIndex = content.indexOf('\n', lastImportIndex);
          content = content.slice(0, nextLineIndex + 1) + importStatement + content.slice(nextLineIndex + 1);
        } else {
          // Si no hay imports, agregar al principio
          content = importStatement + content;
        }
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Actualizado: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error al procesar ${filePath}:`, error.message);
    return false;
  }
}

function scanDirectory(dir, extensions = ['.ts', '.tsx']) {
  const files = fs.readdirSync(dir);
  let updatedCount = 0;

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recursively scan subdirectories
      if (!file.includes('node_modules') && !file.includes('.next')) {
        updatedCount += scanDirectory(filePath, extensions);
      }
    } else if (extensions.some(ext => file.endsWith(ext))) {
      if (updateFile(filePath)) {
        updatedCount++;
      }
    }
  }

  return updatedCount;
}

// Directorios a escanear
const directories = [
  path.join(__dirname, 'app', 'api'),
  path.join(__dirname, 'components'),
];

console.log('🔄 Iniciando actualización de referencias de fecha...\n');

let totalUpdated = 0;
for (const dir of directories) {
  console.log(`📁 Escaneando: ${dir}`);
  const count = scanDirectory(dir);
  totalUpdated += count;
  console.log(`   ${count} archivos actualizados\n`);
}

console.log(`\n✨ Finalizado! Total de archivos actualizados: ${totalUpdated}`);
console.log('\n⚠️  Recuerda ejecutar npm run build para verificar errores de compilación.');
