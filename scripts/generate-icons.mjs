#!/usr/bin/env node
/**
 * Renders the app mark (plate + leaf) into every icon the platforms need.
 * Output is committed; re-run after changing the design: `npm run icons`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';

const GREEN = [46, 125, 50];
const WHITE = [255, 255, 255];
const SAMPLES = 4;

/** Shapes in unit coordinates (0..1, centered at 0.5), `scale` shrinks the mark for safe zones. */
function markCoverage(x, y, scale) {
  const u = (x - 0.5) / scale;
  const v = (y - 0.5) / scale;
  const r = Math.hypot(u, v);
  const ring = r <= 0.36 && r >= 0.29;
  // Leaf: lens = intersection of two circles, pointing up-right.
  const s = Math.SQRT1_2;
  const along = (u - v) * s;
  const across = (u + v) * s;
  const R = 0.21;
  const d = 0.125;
  const leaf = Math.hypot(across - d, along) <= R && Math.hypot(across + d, along) <= R;
  const rib = Math.abs(across) <= 0.012 && Math.abs(along) <= 0.13;
  if (leaf && !rib) return 'leaf';
  return ring ? 'ring' : null;
}

function render(size, { background, scale, rounded = 0, color = GREEN }) {
  const png = new PNG({ width: size, height: size });
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          const inTile = rounded === 0 || insideRoundedSquare(x, y, rounded);
          if (background && inTile) bg++;
          if (markCoverage(x, y, scale)) fg++;
        }
      }
      const total = SAMPLES * SAMPLES;
      const fgA = fg / total;
      const bgA = background ? bg / total : 0;
      const markColor = background ? WHITE : color;
      const alpha = background ? Math.max(bgA, fgA) : fgA;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) {
        const base = background ? GREEN[c] : markColor[c];
        png.data[i + c] = Math.round(base * (1 - fgA) + markColor[c] * fgA);
      }
      png.data[i + 3] = Math.round(alpha * 255);
    }
  }
  return PNG.sync.write(png);
}

function insideRoundedSquare(x, y, radius) {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - radius), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - radius), 0);
  return Math.hypot(dx, dy) <= radius;
}

const OUTPUTS = [
  // Native (app.config.ts)
  ['assets/icon.png', 1024, { background: true, scale: 1 }],
  // Android composes the foreground over `adaptiveIcon.backgroundColor` (green)
  ['assets/adaptive-icon.png', 1024, { background: false, scale: 0.62, color: WHITE }],
  ['assets/splash.png', 1024, { background: false, scale: 1 }],
  ['assets/favicon.png', 48, { background: true, scale: 1.15, rounded: 0.2 }],
  // PWA (public/manifest.webmanifest); maskable keeps the mark inside the 80 % safe zone
  ['public/icons/icon-192.png', 192, { background: true, scale: 1.1, rounded: 0.22 }],
  ['public/icons/icon-512.png', 512, { background: true, scale: 1.1, rounded: 0.22 }],
  ['public/icons/maskable-512.png', 512, { background: true, scale: 0.8 }],
  ['public/icons/apple-touch-icon.png', 180, { background: true, scale: 1 }],
];

for (const [path, size, options] of OUTPUTS) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, render(size, options));
  console.log(`${path} (${size}px)`);
}
