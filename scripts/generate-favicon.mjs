/**
 * GÉNÉRATION DU FAVICON DE LA PLATEFORME (`public/favicon.ico`).
 *
 * CONTEXTE : `src/app/favicon.ico` était le favicon stock de « Create Next App »
 * (logo Vercel), jamais remplacé depuis l'initialisation du dépôt. Comme la
 * convention `favicon` de l'App Router crée une route `/favicon.ico` qui
 * PRIME sur `public/`, le navigateur affichait le logo Vercel malgré un logo
 * EduFlow valide. Le fichier a donc été supprimé : l'ICO est désormais produit
 * ici à partir de la source de vérité unique `public/logo.png`.
 *
 * CONTENU DE L'ICO — un conteneur multi-tailles, comme l'exige la pratique
 * « six files that fit most needs » des favicons :
 *   - 16, 32, 48, 64 px  → entrées BMP/DIB (BGRA + masque AND), format le plus
 *     universellement décodé, y compris par les navigateurs historiques ;
 *   - 128, 256 px       → entrées PNG, plus compactes à ces dimensions.
 *
 * Aucun asset n'est écrit ailleurs que dans `public/` : ce sont des fichiers
 * statiques servis tels quels, jamais traités par Turbopack au build (le
 * turbo-pack échoue sur les PNG mal encodés, cf. `generate-default-logo.mjs`).
 *
 * Exécution : node scripts/generate-favicon.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Source de vérité : le logo EduFlow (voir `generate-default-logo.mjs`). */
const SOURCE = path.join(ROOT, "public", "logo.png");

/** Tailles embarquées dans le conteneur ICO. */
const SIZES = [16, 32, 48, 64, 128, 256];

/** Au-delà de cette taille, le PNG est plus compact que le BMP/DIB. */
const PNG_THRESHOLD = 64;

/**
 * Encode un buffer RGBA (lignes de haut en bas) en entrée BMP/DIB d'ICO.
 *
 * Structure : BITMAPINFOHEADER (40 o) + bitmap XOR + masque AND.
 * L'ICO stocke `biHeight` à DEUX fois la hauteur réelle (XOR + AND), et le
 * bitmap est écrit de bas en haut (coordonnées DIB), contrairement à RGBA.
 */
function encodeDib(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight (XOR + AND)
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount (BGRA)
  header.writeUInt32LE(0, 16); // biCompression = BI_RGB

  // Bitmap XOR : lignes de bas en haut, canaux BGRA.
  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * size * 4;
    const dstRow = y * size * 4;
    for (let x = 0; x < size; x++) {
      const s = srcRow + x * 4;
      const d = dstRow + x * 4;
      xor[d] = rgba[s + 2]; // B
      xor[d + 1] = rgba[s + 1]; // G
      xor[d + 2] = rgba[s]; // R
      xor[d + 3] = rgba[s + 3]; // A
    }
  }

  // Masque AND : 1 bit/pixel, un bit à 1 = pixel transparent.
  // Chaque ligne est complétée à un multiple de 4 octets.
  const stride = Math.ceil(size / 32) * 4;
  const and = Buffer.alloc(stride * size, 0);
  for (let y = 0; y < size; y++) {
    const srcRow = (size - 1 - y) * size * 4;
    const maskRow = y * stride;
    for (let x = 0; x < size; x++) {
      if (rgba[srcRow + x * 4 + 3] === 0) {
        and[maskRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  return Buffer.concat([header, xor, and]);
}

/** Assemble un conteneur ICO (ICONDIR + répertoire + charges utiles). */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = 1 (icon)
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach((image, index) => {
    const base = index * 16;
    // 256 est encodé sur 0 dans le répertoire ICO.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, base);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, base + 1);
    directory.writeUInt8(0, base + 2); // colorCount
    directory.writeUInt8(0, base + 3); // reserved
    directory.writeUInt16LE(1, base + 4); // planes
    directory.writeUInt16LE(32, base + 6); // bitCount
    directory.writeUInt32LE(image.data.length, base + 8); // bytesInRes
    directory.writeUInt32LE(offset, base + 12); // imageOffset
    offset += image.data.length;
  });

  return Buffer.concat([
    header,
    directory,
    ...images.map((image) => image.data),
  ]);
}

if (!fs.existsSync(SOURCE)) {
  throw new Error(
    `Logo source introuvable : ${path.relative(ROOT, SOURCE)}. ` +
      "Générez-le d'abord via `node scripts/generate-default-logo.mjs`.",
  );
}

const images = [];

for (const size of SIZES) {
  const pipeline = sharp(SOURCE).resize(size, size, {
    fit: "cover",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  const data =
    size > PNG_THRESHOLD
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : encodeDib(
          (
            await pipeline.ensureAlpha().raw().toBuffer()
          ),
          size,
        );

  images.push({ size, data });
}

const ico = buildIco(images);
const destination = path.join(ROOT, "public", "favicon.ico");
fs.writeFileSync(destination, ico);

console.log(
  `✓ ${path.relative(ROOT, destination)} — ${ico.length} octets, ` +
    `tailles ${images.map((i) => `${i.size}px`).join("/")}`,
);