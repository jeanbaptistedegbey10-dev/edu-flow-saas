/**
 * Génère le logo EduFlow (PNG 512x512, RGBA) :
 *   - carré arrondi à dégradé indigo -> violet (fond) ;
 *   - toque de diplôme blanche (losange + coiffe + gland).
 *
 * Anti-aliasing par suréchantillonnage 4x, encodage PNG maison
 * (zlib deflate + filtre 0), sans dépendance externe.
 *
 * Usage : node .tmp-assets/generate-logo.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 512;
const SS = 4; // facteur de suréchantillonnage
const W = SIZE * SS;

/** Carré arrondi centré, chemin « SDF » signé : <= 0 => intérieur. */
function sdRoundedRect(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Test d'appartenance à un polygone (algorithme du lancer de rayon). */
function insidePolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i];
    const yi = pts[i + 1];
    const xj = pts[j];
    const yj = pts[j + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Losange de la toque (plateau).
const BOARD = [256, 116, 408, 194, 256, 272, 104, 194];
// Coiffe (trapèze sous le plateau).
const CAP = [152, 224, 360, 224, 348, 338, 164, 338];
// Gland : tige verticale + boule.
const TASSEL_STEM = { x0: 399, x1: 413, y0: 190, y1: 302 };
const TASSEL_KNOB = { x: 406, y: 318, r: 17 };

/** Masque du glyphe blanc (1 = blanc). */
function isGlyph(x, y) {
  if (insidePolygon(x, y, BOARD)) return true;
  if (insidePolygon(x, y, CAP)) return true;
  if (x >= TASSEL_STEM.x0 && x <= TASSEL_STEM.x1 && y >= TASSEL_STEM.y0 && y <= TASSEL_STEM.y1) {
    return true;
  }
  return Math.hypot(x - TASSEL_KNOB.x, y - TASSEL_KNOB.y) <= TASSEL_KNOB.r;
}

// --- Rendu 4x puis réduction (boîte moyenne) ---------------------------------
const acc = new Float32Array(SIZE * SIZE * 4);

for (let sy = 0; sy < W; sy++) {
  // Coordonnées du pixel 4x ramenées à l'espace 512 (centre du sous-pixel).
  const y = (sy + 0.5) / SS;
  const rowBase = (sy / SS | 0) * SIZE * 4;

  for (let sx = 0; sx < W; sx++) {
    const x = (sx + 0.5) / SS;

    // Fond : dégradé diagonal indigo (#4F46E5) -> violet (#7C3AED).
    const t = Math.min(1, Math.max(0, (x / SIZE + y / SIZE) / 2));
    const br = Math.round(79 + (124 - 79) * t);
    const bg = Math.round(70 + (58 - 70) * t);
    const bb = Math.round(229 + (237 - 229) * t);

    // Masque du carré arrondi (couverture douce sur 1 px).
    const d = sdRoundedRect(x, y, 256, 256, 240, 240, 112);
    const cover = Math.min(1, Math.max(0, 0.5 - d));

    const glyph = isGlyph(x, y) ? 1 : 0;

    const col = glyph ? 255 : 0;
    const idx = rowBase + (sx / SS | 0) * 4;
    acc[idx] += (br * (1 - glyph) + col * glyph) * cover;
    acc[idx + 1] += (bg * (1 - glyph) + col * glyph) * cover;
    acc[idx + 2] += (bb * (1 - glyph) + col * glyph) * cover;
    acc[idx + 3] += 255 * cover;
  }
}

const samples = SS * SS;
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
let p = 0;
for (let i = 0; i < SIZE * SIZE; i++) {
  raw[p++] = 0; // filtre "None"
  raw[p++] = Math.round(acc[i * 4] / samples);
  raw[p++] = Math.round(acc[i * 4 + 1] / samples);
  raw[p++] = Math.round(acc[i * 4 + 2] / samples);
  raw[p++] = Math.round(acc[i * 4 + 3] / samples);
}

// --- Assemblage des chunks PNG ----------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // profondeur 8 bits
ihdr[9] = 6; // RGBA
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = process.argv[2] ?? "logo.png";
writeFileSync(out, png);
console.log(`[logo] ${out} — ${SIZE}x${SIZE}, ${png.length} octets`);
