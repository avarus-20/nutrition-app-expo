#!/usr/bin/env node
/**
 * Post-processes `expo export --platform web` output into an installable PWA:
 * stamps the service worker with a content hash and its precache list, and
 * fails the build if the manifest, icons or shell references are missing.
 * Usage: node scripts/build-pwa.mjs [dist]
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { IMMUTABLE_PREFIXES, NO_CACHE_PATHS, SECURITY_HEADERS } from './web-headers.mjs';

const root = process.argv[2] ?? 'dist';

function fail(message) {
  console.error(`build-pwa: ${message}`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const toUrl = (path) => `/${relative(root, path).split(sep).join('/')}`;

if (!existsSync(join(root, 'index.html'))) fail(`${root}/index.html not found — run expo export first`);
const swPath = join(root, 'sw.js');
if (!existsSync(swPath)) fail('sw.js missing from the export (public/sw.js)');

const html = readFileSync(join(root, 'index.html'), 'utf8');
for (const needle of ['rel="manifest"', 'apple-touch-icon', '/_expo/static/js/web/']) {
  if (!html.includes(needle)) fail(`index.html does not reference ${needle}`);
}

const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
for (const key of ['name', 'short_name', 'start_url', 'display', 'icons']) {
  if (!manifest[key]) fail(`manifest.webmanifest: "${key}" is required`);
}
const sizes = new Set(manifest.icons.map((i) => `${i.sizes}:${i.purpose ?? 'any'}`));
for (const required of ['192x192:any', '512x512:any', '512x512:maskable']) {
  if (!sizes.has(required)) fail(`manifest.webmanifest: icon ${required} is required`);
}
for (const icon of manifest.icons) {
  if (!existsSync(join(root, icon.src))) fail(`manifest icon ${icon.src} not found`);
}

/**
 * The shell needed to start offline. Other assets (icon fonts and images of
 * screens not visited yet) are cached at runtime on first use.
 */
const files = walk(root).filter((path) => {
  const url = toUrl(path);
  if (url === '/sw.js' || url.endsWith('.map') || url === '/metadata.json') return false;
  if (url === '/_headers' || url === '/_redirects') return false;
  if (url.startsWith('/_expo/static/')) return true;
  if (url.endsWith('.wasm')) return true;
  if (/\/Ionicons\.[0-9a-f]+\.ttf$/.test(url)) return true;
  return !url.startsWith('/assets/');
});
const precache = files.map(toUrl).sort();
if (!precache.some((u) => u.endsWith('.wasm'))) fail('SQLite wasm not found in the export');
if (!precache.includes('/index.html')) fail('index.html not precached');

const hash = createHash('sha256');
for (const url of precache) hash.update(url).update(readFileSync(join(root, url)));
const build = hash.digest('hex').slice(0, 16);

const sw = readFileSync(swPath, 'utf8');
if (!sw.includes('__BUILD_HASH__') || !sw.includes('__PRECACHE_MANIFEST__')) fail('sw.js placeholders not found');
writeFileSync(swPath, sw.replace('__BUILD_HASH__', build).replace('__PRECACHE_MANIFEST__', JSON.stringify(precache)));

// Netlify / Cloudflare Pages: headers and SPA fallback.
const headerBlock = (path, extra = {}) =>
  [path, ...Object.entries({ ...SECURITY_HEADERS, ...extra }).map(([k, v]) => `  ${k}: ${v}`)].join('\n');
writeFileSync(
  join(root, '_headers'),
  [
    headerBlock('/*'),
    ...NO_CACHE_PATHS.map((p) => `${p}\n  Cache-Control: no-cache`),
    ...IMMUTABLE_PREFIXES.map((p) => `${p}*\n  Cache-Control: public, max-age=31536000, immutable`),
  ].join('\n\n') + '\n',
);
writeFileSync(join(root, '_redirects'), '/*  /index.html  200\n');

// Vercel reads vercel.json from the repository; keep it identical to the shared headers.
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const vercelHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? []).map((h) => [h.key, h.value]),
);
for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
  if (vercelHeaders[k] !== v) fail(`vercel.json header ${k} differs from scripts/web-headers.mjs`);
}

const bytes = precache.reduce((n, u) => n + statSync(join(root, u)).size, 0);
console.log(`build-pwa: ${precache.length} files precached (${(bytes / 1024 / 1024).toFixed(1)} MB), build ${build}`);
