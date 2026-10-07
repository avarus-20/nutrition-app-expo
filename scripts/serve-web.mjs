#!/usr/bin/env node
/**
 * Serves the production web build (`dist/`) locally with the same headers as
 * the hosting configs (scripts/web-headers.mjs) and an SPA fallback to
 * index.html. Usage: npm run web:serve [-- --port 8080] [-- --dir dist]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

import { IMMUTABLE_PREFIXES, NO_CACHE_PATHS, SECURITY_HEADERS } from './web-headers.mjs';

const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
const root = resolve(arg('--dir', 'dist'));
const port = Number(arg('--port', 8080));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let file = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    const asHtml = `${file}.html`;
    file = existsSync(asHtml) ? asHtml : join(root, 'index.html');
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  const path = `/${file.slice(root.length + 1)}`;
  res.setHeader(
    'Cache-Control',
    NO_CACHE_PATHS.includes(path)
      ? 'no-cache'
      : IMMUTABLE_PREFIXES.some((p) => path.startsWith(p))
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
  );
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});
