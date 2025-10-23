// scripts/postbuild.cjs
const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const item of fs.readdirSync(src)) {
    const s = path.join(src, item);
    const d = path.join(dest, item);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const standaloneNext = path.join(standalone, '.next');

ensureDir(standaloneNext);

// Copiar .next/static (assets de Next)
copyDir(path.join(root, '.next', 'static'), path.join(standaloneNext, 'static'));

// Copiar public/ (si existe)
copyDir(path.join(root, 'public'), path.join(standalone, 'public'));

console.log('postbuild: assets copiados a .next/standalone');
