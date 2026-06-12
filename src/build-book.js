// Construye el PDF interior listo para KDP a partir de mandalas generados.
// Formato: 8.5" x 11" (612 x 792 pt), imagen por el frente, reverso en blanco
// (estándar en libros de colorear para evitar traspaso de tinta).

const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { Resvg } = require('@resvg/resvg-js');
const { generateMandala } = require('./mandala');

const PAGE_W = 612;  // 8.5in * 72
const PAGE_H = 792;  // 11in * 72
const MARGIN = 54;   // 0.75in (margen seguro KDP)

async function buildBook({ title, pages, seedBase, outDir }) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'svg'), { recursive: true });

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontLight = await pdf.embedFont(StandardFonts.Helvetica);

  // Página de título
  const titlePage = pdf.addPage([PAGE_W, PAGE_H]);
  const titleSize = 32;
  const tw = font.widthOfTextAtSize(title, titleSize);
  titlePage.drawText(title, {
    x: (PAGE_W - tw) / 2, y: PAGE_H / 2 + 20, size: titleSize, font, color: rgb(0, 0, 0),
  });
  const sub = `${pages} diseños únicos para colorear`;
  const sw = fontLight.widthOfTextAtSize(sub, 14);
  titlePage.drawText(sub, {
    x: (PAGE_W - sw) / 2, y: PAGE_H / 2 - 14, size: 14, font: fontLight, color: rgb(0.3, 0.3, 0.3),
  });
  pdf.addPage([PAGE_W, PAGE_H]); // reverso en blanco

  for (let i = 0; i < pages; i++) {
    const seed = seedBase + i;
    const svg = generateMandala({ seed });
    fs.writeFileSync(path.join(outDir, 'svg', `mandala-${String(i + 1).padStart(3, '0')}.svg`), svg);

    // Rasterizar a 300 DPI sobre el área útil de la página
    const targetPx = Math.round(((PAGE_W - MARGIN * 2) / 72) * 300);
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: targetPx } }).render().asPng();

    const img = await pdf.embedPng(png);
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const size = PAGE_W - MARGIN * 2;
    page.drawImage(img, {
      x: MARGIN,
      y: (PAGE_H - size) / 2,
      width: size,
      height: size,
    });
    // Número de página discreto
    const label = String(i + 1);
    const lw = fontLight.widthOfTextAtSize(label, 10);
    page.drawText(label, { x: (PAGE_W - lw) / 2, y: 30, size: 10, font: fontLight, color: rgb(0.4, 0.4, 0.4) });

    pdf.addPage([PAGE_W, PAGE_H]); // reverso en blanco
  }

  const bytes = await pdf.save();
  const outPath = path.join(outDir, 'interior.pdf');
  fs.writeFileSync(outPath, bytes);
  return outPath;
}

// CLI: node src/build-book.js "Título" <páginas> <seed>
if (require.main === module) {
  const title = process.argv[2] || 'Mandalas para Colorear';
  const pages = parseInt(process.argv[3] || '10', 10);
  const seedBase = parseInt(process.argv[4] || '1000', 10);
  buildBook({ title, pages, seedBase, outDir: path.join(__dirname, '..', 'output') })
    .then((p) => console.log(`✓ Libro generado: ${p}`))
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { buildBook };
