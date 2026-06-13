// Genera páginas para colorear usando la API de Gemini (imagen) y las
// post-procesa a línea negra pura sobre blanco, lista para impresión.
//
// Uso: GEMINI_API_KEY=... node src/ai-generate.js "<tema>" <cantidad> [outDir]
// Ej:  node src/ai-generate.js "mandala de lobo" 10 output/ai-png

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-image';
const API = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const PROMPT_TEMPLATE = (theme) => `Intricate coloring book page: ${theme}.
STYLE REQUIREMENTS:
- Pure black line art on a plain white background
- NO shading, NO gray tones, NO color, NO gradients
- NO text, NO words, NO letters, NO signature, NO watermark
- Clean, closed outlines with medium-bold line weight (thin lines disappear in print)
- Highly detailed, ornate, mandala-level intricacy
- Centered composition with comfortable white margin around the edges
- Vertical portrait format (3:4), like a book page`;

async function generateOne(theme, apiKey, attempt = 1, authMode = 'goog') {
  const headers = { 'Content-Type': 'application/json' };
  if (authMode === 'goog') headers['x-goog-api-key'] = apiKey;
  else headers['Authorization'] = `Bearer ${apiKey}`;

  const res = await fetch(API, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT_TEMPLATE(theme) }] }],
      generationConfig: { responseModalities: ['IMAGE'] },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // Auth keys nuevas (AQ.*) pueden requerir Bearer: probar el otro modo
    if ((res.status === 401 || res.status === 403) && authMode === 'goog') {
      console.log(`  Auth ${res.status} con x-goog-api-key, probando Authorization Bearer...`);
      return generateOne(theme, apiKey, attempt, 'bearer');
    }
    if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
      const wait = attempt * 15000;
      console.log(`  Rate limit/error ${res.status}, reintentando en ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
      return generateOne(theme, apiKey, attempt + 1, authMode);
    }
    throw new Error(`Gemini API ${res.status} (auth=${authMode}): ${body.slice(0, 400)}`);
  }

  const data = await res.json();
  const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
  if (!part) throw new Error('La respuesta no contiene imagen: ' + JSON.stringify(data).slice(0, 300));
  return Buffer.from(part.inlineData.data, 'base64');
}

// Prompt para el proveedor gratis: escenas completas, estilo simple con anatomía correcta
const PROMPT_TEMPLATE_SIMPLE = (theme) => `Ornamental coloring page design: ${theme}.
A decorative symmetrical mandala pattern that fills the whole page edge to edge, made of geometric shapes, flowers, leaves and swirls.
Black outlines on white background, medium-thick clean lines, no shading, no gray, no color, no filled black areas, all outlines closed for easy coloring. No text, no letters, no watermark.`;

// --- Proveedor alternativo: Cloudflare Workers AI (FLUX Schnell, free tier diario) ---
async function generateOneCF(theme, accountId, token, attempt = 1) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ prompt: PROMPT_TEMPLATE_SIMPLE(theme), steps: 8 }),
  });
  if (!res.ok) {
    const body = await res.text();
    // Falso positivo del filtro NSFW de FLUX (code 3030): reintentar con prompt geométrico neutro
    if (res.status === 400 && body.includes('3030') && attempt <= 3) {
      console.log(`  Filtro NSFW (falso positivo), reintentando con prompt neutro [${attempt}/3]...`);
      const neutralPrompt = `Symmetrical decorative mandala coloring page with geometric shapes, petals and swirls. Black line art on white background, clean closed outlines, no shading, no color.`;
      const retry = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt: neutralPrompt, steps: 8 }),
      });
      if (retry.ok) {
        const d = await retry.json();
        if (d.result && d.result.image) return Buffer.from(d.result.image, 'base64');
      }
      await new Promise((r) => setTimeout(r, 3000));
      return generateOneCF(theme, accountId, token, attempt + 1);
    }
    if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
      const wait = attempt * 15000;
      console.log(`  Rate limit/error ${res.status}, reintentando en ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
      return generateOneCF(theme, accountId, token, attempt + 1);
    }
    throw new Error(`Cloudflare AI ${res.status}: ${body.slice(0, 400)}`);
  }
  const data = await res.json();
  if (!data.result?.image) throw new Error('Respuesta sin imagen: ' + JSON.stringify(data).slice(0, 300));
  return Buffer.from(data.result.image, 'base64');
}

// Post-procesa: escala de grises → threshold → negro puro sobre blanco puro.
// Elimina grises/sombras que la IA pueda meter y garantiza impresión limpia.
async function toCleanLineArt(buffer, targetPx = 2100) {
  return sharp(buffer)
    .resize({ width: targetPx, height: Math.round(targetPx * 1.33), fit: 'inside', background: 'white' })
    .flatten({ background: 'white' })
    .grayscale()
    .threshold(190) // >190 → blanco, <=190 → negro. Ajustable.
    .png()
    .toBuffer();
}

async function main() {
  const theme = process.argv[2];
  const count = parseInt(process.argv[3] || '5', 10);
  const outDir = process.argv[4] || path.join(__dirname, '..', 'output', 'ai-png');
  const provider = process.env.AI_PROVIDER || 'gemini';
  const apiKey = process.env.GEMINI_API_KEY;
  const cfAccount = process.env.CF_ACCOUNT_ID;
  const cfToken = process.env.CF_API_TOKEN;

  if (!theme) { console.error('Falta el tema. Uso: node src/ai-generate.js "<tema>" <cantidad>'); process.exit(1); }
  if (provider === 'gemini' && !apiKey) { console.error('Falta GEMINI_API_KEY en el entorno.'); process.exit(1); }
  if (provider === 'cloudflare' && (!cfAccount || !cfToken)) { console.error('Faltan CF_ACCOUNT_ID y/o CF_API_TOKEN.'); process.exit(1); }

  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < count; i++) {
    process.stdout.write(`Generando ${i + 1}/${count} ("${theme}")... `);
    const raw = provider === 'cloudflare'
      ? await generateOneCF(theme, cfAccount, cfToken)
      : await generateOne(theme, apiKey);
    const clean = await toCleanLineArt(raw);
    const file = path.join(outDir, `page-${String(i + 1).padStart(3, '0')}.png`);
    fs.writeFileSync(file, clean);
    console.log('✓');
    // Pausa corta para no golpear rate limits del free tier
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.log(`✓ ${count} páginas en ${outDir}`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { generateOne, generateOneCF, toCleanLineArt };
