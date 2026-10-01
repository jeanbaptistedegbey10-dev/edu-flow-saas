/**
 * RÉGÉNÉRATION DE L'ASSET `public/logo.png` (et de sa copie `src/app/icon.png`).
 *
 * CONTEXTE : le fichier précédent était CORROMPU. Sa structure PNG (signature,
 * IHDR, IDAT, IEND) et tous les CRC32 étaient valides, et le flux zlib de l'IDAT
 * se décompressait sans erreur — mais les octets de « filtre » de 377 des 512
 * lignes de balayage ne valaient pas 0..4. Turbopack refusait donc de le
 * décoder : `Format error decoding Png: Unknown filter method 232`.
 *
 * Les pixels d'origine étant irrécupérables, le logo est redessiné
 * vectoriellement (SVG) puis rasterisé par `sharp`, qui produit un PNG
 * canonique (filtres 0..4 valides). Le visuel — dégradé violet → fuchsia,
 * symbole « E » de flow — reprend l'identité EduFlow (barre du back-office).
 *
 * Exécution : node scripts/generate-default-logo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Dimensions du logo (carré — favicon + en-tête de documents). */
const SIZE = 512;

/** SVG du logo EduFlow : dégradé violet→fuchsia + « E » stylisé. */
const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#d946ef"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <g fill="none" stroke="#ffffff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round">
    <path d="M336 178 H200 a44 44 0 0 0 0 88 h60 a44 44 0 0 1 0 88 H176"/>
  </g>
  <circle cx="368" cy="256" r="26" fill="#ffffff"/>
</svg>`;

/**
 * Encode un buffer RGBA en PNG canonique via `sharp`.
 * `sharp` applique ses propres filtres de ligne (toujours dans 0..4) : c'est
 * précisément l'invariant que Turbopack exige et qui manquait au fichier
 * d'origine.
 */
async function writeLogo(destination) {
  const png = await sharp(Buffer.from(SVG), { density: 384 })
    .resize(SIZE, SIZE)
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();

  fs.writeFileSync(destination, png);
  return png.length;
}

const targets = [
  path.join(ROOT, "public", "logo.png"),
  path.join(ROOT, "src", "app", "icon.png"),
];

for (const target of targets) {
  const size = await writeLogo(target);
  console.log(`✓ ${path.relative(ROOT, target)} — ${size} octets`);
}
