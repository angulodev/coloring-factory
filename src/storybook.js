// Modo storybook: toma un PDF de interior ya armado (ej: hecho en Gemini),
// valida dimensiones para KDP, cuenta páginas y genera la portada envolvente.
//
// Uso: node src/storybook.js "<ruta-pdf>" "Título" "Subtítulo" "Autor" <paleta> [seed] [descripción]

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { buildCover } = require('./cover');

const TRIM_W = 8.5, TRIM_H = 11, TOL = 0.5; // tolerancia en pts (~0.007")

async function processStorybook(opts) {
  const { pdfPath, title, subtitle, author, palette, seed, description, outDir } = opts;

  if (!fs.existsSync(pdfPath)) throw new Error(`No se encontró el PDF: ${pdfPath}`);
  const bytes = fs.readFileSync(pdfPath);
  const pdf = await PDFDocument.load(bytes);
  const pageCount = pdf.getPageCount();

  // Revisar dimensiones de la primera página (en puntos; 72pt = 1in)
  const p0 = pdf.getPage(0);
  const { width, height } = p0.getSize();
  const wIn = width / 72, hIn = height / 72;

  const warnings = [];
  const okSize = Math.abs(width - TRIM_W * 72) < TOL && Math.abs(height - TRIM_H * 72) < TOL;
  if (!okSize) {
    warnings.push(`El PDF mide ${wIn.toFixed(2)}"x${hIn.toFixed(2)}", pero KDP usa 8.5"x11". Revisa el tamaño antes de publicar.`);
  }
  if (pageCount < 24) {
    warnings.push(`El PDF tiene ${pageCount} páginas. KDP exige un mínimo de 24 páginas para libros físicos.`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  // Copiar el interior tal cual al output
  fs.writeFileSync(path.join(outDir, 'interior.pdf'), bytes);

  // Generar portada con el lomo calculado según las páginas reales del PDF
  await buildCover({
    title, subtitle, author,
    interiorPages: pageCount,
    palette, seed,
    description,
    outDir,
  });

  console.log(`✓ Storybook procesado: ${pageCount} páginas (${wIn.toFixed(2)}"x${hIn.toFixed(2)}")`);
  if (warnings.length) {
    console.log('\n⚠ Advertencias:');
    warnings.forEach((w) => console.log('  - ' + w));
  }
  // Dejar las advertencias en un archivo para que la UI/artifact las muestre
  fs.writeFileSync(path.join(outDir, 'notas.txt'),
    warnings.length ? warnings.join('\n') : 'Sin advertencias: el PDF cumple el tamaño y mínimo de páginas de KDP.');

  return { pageCount, warnings };
}

if (require.main === module) {
  const [pdfPath, title, subtitle, author, palette, seed, description] = process.argv.slice(2);
  processStorybook({
    pdfPath: pdfPath || 'input-book/interior.pdf',
    title: title || 'Mi Libro',
    subtitle: subtitle || '',
    author: author || '',
    palette: palette || 'sunset',
    seed: parseInt(seed || '42', 10),
    description: description || 'Una historia para disfrutar y compartir.',
    outDir: path.join(__dirname, '..', 'output'),
  }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { processStorybook };
