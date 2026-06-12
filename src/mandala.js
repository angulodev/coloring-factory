// Generador procedural de mandalas SVG para libros de colorear
// Determinístico por seed: el mismo seed siempre produce el mismo mandala.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const C = 500; // centro del viewBox 1000x1000

function polar(r, angleDeg) {
  const a = (angleDeg - 90) * (Math.PI / 180);
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function fmt(n) { return Number(n.toFixed(2)); }

// --- Motivos: cada uno dibuja UNA pieza apuntando "hacia arriba" a radio r ---

function petal(rInner, rOuter, widthDeg) {
  const [x1, y1] = polar(rInner, 0);
  const [tx, ty] = polar(rOuter, 0);
  const [cx1, cy1] = polar((rInner + rOuter) / 2, -widthDeg);
  const [cx2, cy2] = polar((rInner + rOuter) / 2, widthDeg);
  return `M ${fmt(x1)} ${fmt(y1)} Q ${fmt(cx1)} ${fmt(cy1)} ${fmt(tx)} ${fmt(ty)} Q ${fmt(cx2)} ${fmt(cy2)} ${fmt(x1)} ${fmt(y1)} Z`;
}

function teardrop(rInner, rOuter, widthDeg) {
  const [x1, y1] = polar(rInner, 0);
  const [tx, ty] = polar(rOuter, 0);
  const rMid = rInner + (rOuter - rInner) * 0.75;
  const [cx1, cy1] = polar(rMid, -widthDeg);
  const [cx2, cy2] = polar(rMid, widthDeg);
  return `M ${fmt(x1)} ${fmt(y1)} C ${fmt(cx1)} ${fmt(cy1)} ${fmt(cx1)} ${fmt(cy1)} ${fmt(tx)} ${fmt(ty)} C ${fmt(cx2)} ${fmt(cy2)} ${fmt(cx2)} ${fmt(cy2)} ${fmt(x1)} ${fmt(y1)} Z`;
}

function diamond(rInner, rOuter, widthDeg) {
  const [x1, y1] = polar(rInner, 0);
  const [tx, ty] = polar(rOuter, 0);
  const rMid = (rInner + rOuter) / 2;
  const [lx, ly] = polar(rMid, -widthDeg);
  const [rx, ry] = polar(rMid, widthDeg);
  return `M ${fmt(x1)} ${fmt(y1)} L ${fmt(lx)} ${fmt(ly)} L ${fmt(tx)} ${fmt(ty)} L ${fmt(rx)} ${fmt(ry)} Z`;
}

function arcScallop(r, widthDeg) {
  const [x1, y1] = polar(r, -widthDeg);
  const [x2, y2] = polar(r, widthDeg);
  const [cx, cy] = polar(r * 1.18, 0);
  return `M ${fmt(x1)} ${fmt(y1)} Q ${fmt(cx)} ${fmt(cy)} ${fmt(x2)} ${fmt(y2)}`;
}

const MOTIFS = ['petal', 'teardrop', 'diamond', 'circle', 'scallop', 'dot'];

/**
 * Genera un mandala SVG.
 * @param {object} opts
 * @param {number} opts.seed       - semilla (reproducible)
 * @param {number} [opts.segments] - simetría radial (8-16). Si no, aleatorio.
 * @param {number} [opts.rings]    - cantidad de anillos (4-7). Si no, aleatorio.
 * @param {number} [opts.stroke]   - grosor de línea (default 3)
 * @returns {string} SVG completo
 */
function generateMandala(opts = {}) {
  const seed = opts.seed ?? Math.floor(Math.random() * 1e9);
  const rng = mulberry32(seed);
  const segments = opts.segments ?? [8, 10, 12, 16][Math.floor(rng() * 4)];
  const rings = opts.rings ?? 4 + Math.floor(rng() * 4); // 4-7
  const stroke = opts.stroke ?? 3;

  const parts = [];
  const maxR = 470;
  const startR = 50;
  const ringWidth = (maxR - startR) / rings;

  // Centro: círculos concéntricos
  const centerCircles = 1 + Math.floor(rng() * 3);
  for (let i = 1; i <= centerCircles; i++) {
    parts.push(`<circle cx="${C}" cy="${C}" r="${fmt((startR / centerCircles) * i)}"/>`);
  }

  for (let ring = 0; ring < rings; ring++) {
    const rInner = startR + ring * ringWidth;
    const rOuter = rInner + ringWidth * (0.85 + rng() * 0.3);
    const motif = MOTIFS[Math.floor(rng() * MOTIFS.length)];
    const segAngle = 360 / segments;
    const offset = rng() < 0.5 ? 0 : segAngle / 2; // anillos alternados
    const widthDeg = segAngle * (0.3 + rng() * 0.18);
    const group = [];

    for (let s = 0; s < segments; s++) {
      const angle = s * segAngle + offset;
      const rot = `transform="rotate(${fmt(angle)} ${C} ${C})"`;
      switch (motif) {
        case 'petal':
          group.push(`<path d="${petal(rInner, Math.min(rOuter, maxR), widthDeg)}" ${rot}/>`);
          break;
        case 'teardrop':
          group.push(`<path d="${teardrop(rInner, Math.min(rOuter, maxR), widthDeg)}" ${rot}/>`);
          break;
        case 'diamond':
          group.push(`<path d="${diamond(rInner, Math.min(rOuter, maxR), widthDeg)}" ${rot}/>`);
          break;
        case 'circle': {
          const rMid = (rInner + Math.min(rOuter, maxR)) / 2;
          const [cx, cy] = polar(rMid, angle);
          const cr = Math.min(ringWidth * 0.38, rMid * Math.sin((widthDeg * Math.PI) / 180));
          group.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(cr)}"/>`);
          break;
        }
        case 'scallop':
          group.push(`<path d="${arcScallop(rInner, segAngle / 2)}" ${rot}/>`);
          break;
        case 'dot': {
          const [cx, cy] = polar(rInner + ringWidth * 0.4, angle);
          group.push(`<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(ringWidth * 0.14)}"/>`);
          break;
        }
      }
    }
    parts.push(group.join('\n'));

    // Anillo separador ocasional
    if (rng() < 0.45) {
      parts.push(`<circle cx="${C}" cy="${C}" r="${fmt(rInner)}"/>`);
    }
  }

  // Círculo exterior de cierre
  parts.push(`<circle cx="${C}" cy="${C}" r="${maxR}"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">
<rect width="1000" height="1000" fill="white"/>
<g fill="none" stroke="black" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
${parts.join('\n')}
</g>
</svg>`;
}

module.exports = { generateMandala };
