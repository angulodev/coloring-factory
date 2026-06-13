// Generador de portada envolvente para KDP (contraportada + lomo + portada).
// Calcula dimensiones según cantidad de páginas, renderiza a 300 DPI y exporta PDF.
//
// Uso: node src/cover.js "Título" "Subtítulo" "Autor" <páginasInterior> <paleta> [seed] [descripción]
// Paletas: sunset | ocean | tropical | berry | noir

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { Resvg } = require('@resvg/resvg-js');

// --- Constantes KDP (pulgadas) ---
const TRIM_W = 8.5, TRIM_H = 11, BLEED = 0.125;
const PAGE_THICKNESS = 0.002252; // papel blanco B/N
const DPI = 300;
const SPINE_TEXT_MIN_PAGES = 80;

const PALETTES = {
  sunset:   { bg1: '#FF7A59', bg2: '#FFC94D', deep: '#B23A2E', text: '#FFFFFF', petals: ['#FFD166', '#FFF1DE', '#4ECDC4', '#FF9F7E'] },
  ocean:    { bg1: '#1B7FA8', bg2: '#6FD6D9', deep: '#0C516E', text: '#FFFFFF', petals: ['#BFEFF2', '#FFE08A', '#7FD8C9', '#E8FBFF'] },
  tropical: { bg1: '#2EA86B', bg2: '#A8E063', deep: '#176B43', text: '#FFFFFF', petals: ['#FFE08A', '#FF8FA3', '#D2F5C4', '#7FE0B0'] },
  berry:    { bg1: '#8E44AD', bg2: '#E07BE0', deep: '#5B2C6F', text: '#FFFFFF', petals: ['#FFD3F0', '#FFC94D', '#C9A7F5', '#F5E6FF'] },
  noir:     { bg1: '#23232F', bg2: '#3B3B52', deep: '#15151D', text: '#EFE3C8', petals: ['#D9A441', '#EFE3C8', '#8E6FB8', '#5B8E8E'] },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Mandala decorativo coloreado (relleno con la paleta, trazo blanco)
function coloredMandala(cx, cy, R, palette, seed, strokeColor = '#FFFFFF') {
  const rng = mulberry32(seed);
  const segs = [12, 14, 16][Math.floor(rng() * 3)];
  const rings = 5;
  const parts = [];
  const petal = (rIn, rOut, wDeg, angle, fill) => {
    const rad = (d) => ((d - 90) * Math.PI) / 180;
    const p = (r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
    const [x1, y1] = p(rIn, angle); const [tx, ty] = p(rOut, angle);
    const [c1x, c1y] = p((rIn + rOut) / 2, angle - wDeg);
    const [c2x, c2y] = p((rIn + rOut) / 2, angle + wDeg);
    return `<path d="M ${x1} ${y1} Q ${c1x} ${c1y} ${tx} ${ty} Q ${c2x} ${c2y} ${x1} ${y1} Z" fill="${fill}"/>`;
  };
  // Anillos densos y superpuestos, de afuera hacia adentro
  for (let ring = rings - 1; ring >= 0; ring--) {
    const rIn = R * (0.08 + ring * 0.16);
    const rOut = Math.min(rIn + R * 0.30, R * 0.92);
    const segAngle = 360 / segs;
    const offset = ring % 2 === 0 ? 0 : segAngle / 2;
    const fill = palette.petals[ring % palette.petals.length];
    for (let s = 0; s < segs; s++) parts.push(petal(rIn, rOut, segAngle * 0.50, s * segAngle + offset, fill));
  }
  // Aro exterior: puntos decorativos + círculo de cierre
  const dotAngle = 360 / (segs * 2);
  for (let s = 0; s < segs * 2; s++) {
    const a = ((s * dotAngle - 90) * Math.PI) / 180;
    parts.push(`<circle cx="${cx + R * 0.97 * Math.cos(a)}" cy="${cy + R * 0.97 * Math.sin(a)}" r="${R * 0.035}" fill="${palette.petals[(s + 1) % palette.petals.length]}"/>`);
  }
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.90}" fill="none" stroke-width="${Math.max(2, R * 0.008)}"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.13}" fill="${palette.petals[1]}"/>`);
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${R * 0.06}" fill="${palette.petals[0]}"/>`);
  return `<g stroke="${strokeColor}" stroke-width="${Math.max(3, R * 0.012)}">${parts.join('')}</g>`;
}

// Word-wrap simple por estimación de ancho (Archivo Black ~0.62em por carácter)
function wrapText(text, maxWidthPx, fontSize, charW = 0.62) {
  const maxChars = Math.max(4, Math.floor(maxWidthPx / (fontSize * charW)));
  const words = text.split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= maxChars) cur = (cur + ' ' + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function fitTitle(text, maxWidthPx, startSize) {
  let size = startSize;
  let lines = wrapText(text, maxWidthPx, size);
  while ((lines.length > 3 || lines.some((l) => l.length * size * 0.62 > maxWidthPx)) && size > 60) {
    size -= 10; lines = wrapText(text, maxWidthPx, size);
  }
  return { size, lines };
}

async function buildCover(opts) {
  const { title, subtitle, author, interiorPages, palette: palName, seed, description, outDir } = opts;
  const pal = PALETTES[palName] || PALETTES.sunset;

  const spineIn = interiorPages * PAGE_THICKNESS;
  const fullW = BLEED + TRIM_W + spineIn + TRIM_W + BLEED;
  const fullH = BLEED + TRIM_H + BLEED;
  const W = Math.round(fullW * DPI), H = Math.round(fullH * DPI);
  const spinePx = Math.round(spineIn * DPI);
  const bleedPx = Math.round(BLEED * DPI);
  const backX = 0, backW = bleedPx + Math.round(TRIM_W * DPI);
  const spineX = backW;
  const frontX = spineX + spinePx, frontW = W - frontX;
  const frontCX = frontX + frontW / 2;

  const svgParts = [];
  // Fondo: gradiente radial cálido desde la portada
  svgParts.push(`<defs>
    <radialGradient id="bg" cx="${(frontCX / W).toFixed(3)}" cy="0.35" r="1.1">
      <stop offset="0%" stop-color="${pal.bg2}"/><stop offset="100%" stop-color="${pal.bg1}"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>`);

  // Mandalas decorativos de fondo (grandes, sutiles, recortados por los bordes)
  svgParts.push(`<g opacity="0.13">${coloredMandala(backX + backW * 0.18, H * 0.92, H * 0.45, pal, seed + 7)}</g>`);
  svgParts.push(`<g opacity="0.13">${coloredMandala(W * 0.97, H * 0.10, H * 0.35, pal, seed + 13)}</g>`);

  // ---------- PORTADA (derecha) ----------
  const mandR = frontW * 0.30;
  const mandCY = H * 0.32;
  svgParts.push(`<circle cx="${frontCX}" cy="${mandCY}" r="${mandR * 1.12}" fill="${pal.deep}" opacity="0.25"/>`);
  svgParts.push(coloredMandala(frontCX, mandCY, mandR, pal, seed));

  // Título auto-ajustado
  const { size: tSize, lines: tLines } = fitTitle(title.toUpperCase(), frontW * 0.82, 150);
  const titleY = H * 0.63;
  tLines.forEach((line, i) => {
    const y = titleY + i * tSize * 1.12;
    svgParts.push(`<text x="${frontCX}" y="${y}" font-family="Archivo Black" font-size="${tSize}" fill="${pal.deep}" text-anchor="middle" opacity="0.35" transform="translate(6,8)">${esc(line)}</text>`);
    svgParts.push(`<text x="${frontCX}" y="${y}" font-family="Archivo Black" font-size="${tSize}" fill="${pal.text}" text-anchor="middle">${esc(line)}</text>`);
  });
  const afterTitleY = titleY + tLines.length * tSize * 1.12 + 30;
  if (subtitle) {
    svgParts.push(`<text x="${frontCX}" y="${afterTitleY}" font-family="Poppins SemiBold" font-size="64" fill="${pal.text}" text-anchor="middle" opacity="0.95">${esc(subtitle)}</text>`);
  }
  // Autor al pie de la portada (sobre el sangrado inferior)
  svgParts.push(`<text x="${frontCX}" y="${H - bleedPx - 110}" font-family="Poppins SemiBold" font-size="56" fill="${pal.text}" text-anchor="middle" opacity="0.9">${esc(author)}</text>`);

  // ---------- LOMO ----------
  svgParts.push(`<rect x="${spineX}" y="0" width="${spinePx}" height="${H}" fill="${pal.deep}"/>`);
  if (interiorPages >= SPINE_TEXT_MIN_PAGES && spinePx > 40) {
    const spineFont = Math.min(48, spinePx * 0.55);
    svgParts.push(`<text x="${spineX + spinePx / 2}" y="${H / 2}" font-family="Archivo Black" font-size="${spineFont}" fill="${pal.text}" text-anchor="middle" transform="rotate(90 ${spineX + spinePx / 2} ${H / 2})">${esc(title.toUpperCase())} · ${esc(author)}</text>`);
  }

  // ---------- CONTRAPORTADA (izquierda) ----------
  const panelX = bleedPx + Math.round(TRIM_W * DPI * 0.08);
  const panelW = Math.round(TRIM_W * DPI * 0.84);
  const descLines = wrapText(description, panelW - 160, 52, 0.52);
  const panelH = descLines.length * 52 * 1.5 + 220;
  const panelY = H * 0.16;
  svgParts.push(`<rect x="${panelX}" y="${panelY}" width="${panelW}" height="${panelH}" rx="36" fill="#FFFFFF" opacity="0.93"/>`);
  svgParts.push(coloredMandala(panelX + panelW / 2, panelY + 30, 90, pal, seed + 3, pal.deep));
  descLines.forEach((line, i) => {
    svgParts.push(`<text x="${panelX + panelW / 2}" y="${panelY + 200 + i * 52 * 1.5}" font-family="Poppins" font-size="52" fill="#33312E" text-anchor="middle">${esc(line)}</text>`);
  });

  // Zona del código de barras KDP: blanco puro, abajo a la derecha de la contraportada
  const bcW = 2.2 * DPI, bcH = 1.4 * DPI;
  const bcX = backW - Math.round(0.35 * DPI) - bcW;
  const bcY = H - bleedPx - Math.round(0.3 * DPI) - bcH;
  svgParts.push(`<rect x="${bcX}" y="${bcY}" width="${bcW}" height="${bcH}" fill="#FFFFFF"/>`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svgParts.join('\n')}</svg>`;

  fs.mkdirSync(outDir, { recursive: true });
  const fontDir = path.join(__dirname, '..', 'assets', 'fonts');
  const png = new Resvg(svg, {
    font: {
      fontFiles: fs.readdirSync(fontDir).map((f) => path.join(fontDir, f)),
      loadSystemFonts: false,
      defaultFontFamily: 'Poppins',
    },
  }).render().asPng();
  fs.writeFileSync(path.join(outDir, 'cover-preview.png'), png);

  // PDF en puntos (72/in)
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(png);
  const page = pdf.addPage([fullW * 72, fullH * 72]);
  page.drawImage(img, { x: 0, y: 0, width: fullW * 72, height: fullH * 72 });
  const outPath = path.join(outDir, 'cover.pdf');
  fs.writeFileSync(outPath, await pdf.save());

  console.log(`✓ Portada: ${outPath}`);
  console.log(`  Páginas interiores: ${interiorPages} → lomo: ${spineIn.toFixed(3)}" ${interiorPages < SPINE_TEXT_MIN_PAGES ? '(sin texto en lomo: KDP lo exige solo desde ' + SPINE_TEXT_MIN_PAGES + ' págs)' : '(con texto en lomo)'}`);
  console.log(`  Dimensiones: ${fullW.toFixed(3)}" x ${fullH.toFixed(2)}" (${W}x${H}px @300DPI)`);
  return outPath;
}

if (require.main === module) {
  const [title, subtitle, author, pages, palette, seed, description] = process.argv.slice(2);
  buildCover({
    title: title || 'Mandalas Mágicos',
    subtitle: subtitle || '',
    author: author || '',
    interiorPages: parseInt(pages || '102', 10),
    palette: palette || 'sunset',
    seed: parseInt(seed || '42', 10),
    description: description || 'Relájate y deja volar tu creatividad con diseños únicos llenos de detalle, listos para llenar de color.',
    outDir: path.join(__dirname, '..', 'output'),
  }).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { buildCover, PALETTES };
