/**
 * Génère un asset `.ico` minimal valide (32×32 BGRA) pour le packaging
 * electron-builder sous Windows, sans dépendance externe.
 *
 * Un ICO n'étant pas du texte, ce script ne fait pas partie du typage `tsc`
 * (extension `.mjs`, hors du `tsconfig` `include`). Il est invoqué par
 * `scripts/build-desktop.mjs` avant l'appel à `electron-builder`.
 *
 * EduFlow couleur : fond #0f172a (bleu nuit) — les pixels sont donc tous
 * identiques. L'icône est un placeholder fonctionnel : à remplacer par un
 * vrai logo (`resources/eduflow-icon.ico`).
 */
import fs from "node:fs";
import path from "node:path";

function createIco(bufferPath, size = 32) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = ICO
  header.writeUInt16LE(1, 4); // count = 1 image

  const pixelCount = size * size;
  const pixelBytes = pixelCount * 4; // BGRA
  const bmpHeaderSize = 40; // BITMAPINFOHEADER
  const imageDataSize = bmpHeaderSize + pixelBytes;

  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(size & 0xff, 0); // width
  dirEntry.writeUInt8(size & 0xff, 1); // height
  dirEntry.writeUInt8(0, 2); // colors
  dirEntry.writeUInt8(0, 3); // reserved
  dirEntry.writeUInt16LE(1, 4); // planes
  dirEntry.writeUInt16LE(32, 6); // bit count
  dirEntry.writeUInt32LE(imageDataSize, 8); // bytes in image data
  const offset = 22; // header(6) + dirEntry(16)
  dirEntry.writeUInt32LE(offset, 12);

  // BITMAPINFOHEADER
  const bmp = Buffer.alloc(bmpHeaderSize + pixelBytes);
  bmp.writeUInt32LE(bmpHeaderSize, 0); // header size
  bmp.writeInt32LE(size, 4); // width
  bmp.writeInt32LE(size * 2, 8); // height (bicolor: XOR + AND masks)
  bmp.writeUInt16LE(1, 12); // planes
  bmp.writeUInt16LE(32, 14); // bpp

  // Pixels BGRA — couleur bleu-nuit #0f172a → BGR=(0x2a,0x17,0x0f), alpha=255.
  const bgra = Buffer.from([0x2a, 0x17, 0x0f, 0xff]);
  for (let i = 0; i < pixelBytes; i += 4) {
    bgra.copy(bmp, bmpHeaderSize + i);
  }

  // Masque AND (transparent) = tout opaque (0x00000000).
  const andMask = Buffer.alloc(pixelCount, 0);
  const final = Buffer.concat([header, dirEntry, bmp, andMask]);

  fs.mkdirSync(path.dirname(bufferPath), { recursive: true });
  fs.writeFileSync(bufferPath, final);
  return final.length;
}

const target = process.argv[2] || path.join(process.cwd(), "desktop", "resources", "eduflow-icon.ico");
const size = Number(process.argv[3]) || 32;
const bytes = createIco(target, size);
console.log(`[desktop:assets] Icône générée : ${target} (${bytes} octets, ${size}×${size})`);
