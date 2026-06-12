# Coloring Factory 🎨

Generador automático de libros para colorear listos para Amazon KDP.

## Cómo funciona

- `src/mandala.js` — generador procedural de mandalas en SVG. Determinístico por seed: el mismo seed siempre produce el mismo diseño.
- `src/build-book.js` — rasteriza los SVG a 300 DPI y arma el PDF interior en formato KDP (8.5x11", márgenes de 0.75", reverso en blanco).

## Uso local

```bash
npm install
node src/build-book.js "Mandalas Mágicos Vol. 1" 50 1000
# → output/interior.pdf + output/svg/*.svg
```

Parámetros: `título` `cantidad_de_páginas` `seed_base`.

⚠️ Usa un seed base distinto por volumen para no repetir diseños (ej: Vol.1 = 1000, Vol.2 = 2000).

## Generación en la nube

Ejecuta el workflow **"Generar libro"** desde la pestaña Actions (`workflow_dispatch`), define título/páginas/seed, y descarga el PDF desde los artifacts del run.

## Roadmap

- [ ] Más motivos (estrellas, ondas, pétalos dobles)
- [ ] Mandalas de animales (siluetas + relleno de patrones)
- [ ] Generador de portada con cálculo de lomo KDP
- [ ] UI web (Cloudflare Worker + React) que dispara el workflow
