// Generates the PWA app icons (no dependencies — pure Node PNG encoder).
// Run with: node scripts/gen-icons.mjs
// Design: full-bleed brand green field with mowed "turf stripes" + a white disc
// holding a green "M". Full-bleed + centered content = safe for maskable icons.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public");

const GREEN_600 = [22, 163, 74];
const GREEN_500 = [34, 197, 94];
const WHITE = [255, 255, 255];

// 5x5 block-font "M".
const M = ["10001", "11011", "10101", "10001", "10001"];

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34; // white disc radius
  const stripe = Math.max(2, Math.round(size / 16));
  const glyph = size * 0.34;
  const gx0 = cx - glyph / 2;
  const gy0 = cy - glyph / 2;
  const cell = glyph / 5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Background: alternating green "turf stripes".
      let c = Math.floor(y / stripe) % 2 === 0 ? GREEN_600 : GREEN_500;

      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r * r) c = WHITE; // white disc

      // Green "M" inside the disc.
      if (x >= gx0 && x < gx0 + glyph && y >= gy0 && y < gy0 + glyph) {
        const col = Math.floor((x - gx0) / cell);
        const row = Math.floor((y - gy0) / cell);
        if (M[row] && M[row][col] === "1") c = GREEN_600;
      }

      const i = (y * size + x) * 4;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = 255;
    }
  }
  return encodePNG(size, size, rgba);
}

// --- minimal PNG (truecolor + alpha) encoder -------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  return Buffer.concat([u32(data.length), body, u32(crc32(body))]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.concat([u32(w), u32(h), Buffer.from([8, 6, 0, 0, 0])]);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    raw[p++] = 0; // filter: none
    rgba.copy(raw, p, y * w * 4, (y + 1) * w * 4);
    p += w * 4;
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), drawIcon(size));
}
writeFileSync(join(OUT, "apple-touch-icon.png"), drawIcon(180));
console.log("Wrote icon-192.png, icon-512.png, apple-touch-icon.png to public/");
