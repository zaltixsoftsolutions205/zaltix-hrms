#!/usr/bin/env node
/**
 * generate-icons.js
 * Creates PNG PWA icons using pure Node.js (no extra dependencies).
 * Icon design: violet (#4C1D95) background, golden (#D97706) rounded badge.
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

/* ─── CRC32 ─────────────────────────────────────────────────────────────── */
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) {
    crc ^= b;
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ─── PNG writer ─────────────────────────────────────────────────────────── */
function writePNG(width, height, pixelFn) {
  const bytesPerRow = 1 + width * 3; // filter + RGB
  const raw = Buffer.alloc(height * bytesPerRow);
  for (let y = 0; y < height; y++) {
    raw[y * bytesPerRow] = 0; // None filter
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y, width, height);
      const off = y * bytesPerRow + 1 + x * 3;
      raw[off] = r; raw[off + 1] = g; raw[off + 2] = b;
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });

  function chunk(type, data) {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ─── Zaltix icon pixel function ─────────────────────────────────────────── */
// Violet background + rounded golden badge + "ZS" area highlight
function zaltixPixel(x, y, w, h) {
  const BG     = [76, 29, 149];   // #4C1D95
  const GOLD   = [217, 119, 6];   // #D97706
  const LGOLD  = [245, 158, 11];  // golden-500 lighter

  const cx = w / 2, cy = h / 2;

  // ── overall icon rounded-corner clipping (radius = 22% of size) ──────────
  const iconR = w * 0.22;
  const dx0 = Math.max(0, Math.abs(x - cx) - (w / 2 - iconR));
  const dy0 = Math.max(0, Math.abs(y - cy) - (h / 2 - iconR));
  // transparent outside rounded rect → we fill with bg for PNG
  // (We skip transparent handling – just treat it as BG)

  // ── golden rounded badge (56% of icon, centred) ──────────────────────────
  const bHalf = w * 0.28;
  const bR    = w * 0.08;
  const bdx   = Math.abs(x - cx);
  const bdy   = Math.abs(y - cy);
  if (bdx <= bHalf && bdy <= bHalf) {
    const cdx = Math.max(0, bdx - (bHalf - bR));
    const cdy = Math.max(0, bdy - (bHalf - bR));
    if (cdx * cdx + cdy * cdy <= bR * bR) {
      // clipped corner → bg
    } else {
      // Inside badge: render two-tone for "ZS" feel
      // Top half = lighter gold (Z), bottom half = deeper gold (S)
      return y < cy ? LGOLD : GOLD;
    }
  }

  // ── subtle radial glow towards centre ────────────────────────────────────
  const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  const maxD = Math.sqrt(cx * cx + cy * cy);
  const t = Math.max(0, 1 - dist / (maxD * 0.85)) * 0.18;
  return [
    Math.min(255, Math.round(BG[0] + (255 - BG[0]) * t)),
    Math.min(255, Math.round(BG[1] + (255 - BG[1]) * t)),
    Math.min(255, Math.round(BG[2] + (255 - BG[2]) * t)),
  ];
}

/* ─── Generate and save ──────────────────────────────────────────────────── */
const publicDir = path.join(__dirname, '..', 'public');
fs.mkdirSync(publicDir, { recursive: true });

const sizes = [
  { name: 'pwa-192x192.png',     size: 192 },
  { name: 'pwa-512x512.png',     size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

for (const { name, size } of sizes) {
  const buf = writePNG(size, size, zaltixPixel);
  fs.writeFileSync(path.join(publicDir, name), buf);
  console.log(`✓  ${name}  (${size}×${size})`);
}

console.log('\nAll Zaltix PWA icons generated successfully.');
