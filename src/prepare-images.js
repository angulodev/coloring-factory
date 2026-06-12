// Limpia imágenes subidas manualmente (ej: generadas en la app de Gemini)
// y las deja listas para impresión: negro puro sobre blanco, 300 DPI.
//
// Uso: node src/prepare-images.js [inputDir] [outDir]

const fs = require('fs');
const path = require('path');
const { toCleanLineArt } = require('./ai-generate');

async function main() {
  const inputDir = process.argv[2] || path.join(__dirname, '..', 'input-images');
  const outDir = process.argv[3] || path.join(__dirname, '..', 'output', 'clean-png');

  if (!fs.existsSync(inputDir)) {
    console.error(`No existe la carpeta ${inputDir}. Crea input-images/ y sube ahí tus PNG/JPG.`);
    process.exit(1);
  }

  const files = fs.readdirSync(inputDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort();
  if (files.length === 0) { console.error('No hay imágenes en ' + inputDir); process.exit(1); }

  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < files.length; i++) {
    const raw = fs.readFileSync(path.join(inputDir, files[i]));
    const clean = await toCleanLineArt(raw);
    fs.writeFileSync(path.join(outDir, `page-${String(i + 1).padStart(3, '0')}.png`), clean);
    console.log(`✓ ${files[i]}`);
  }
  console.log(`✓ ${files.length} imágenes limpias en ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
