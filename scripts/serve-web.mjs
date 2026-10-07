#!/usr/bin/env node
/**
 * Serves the production web build (`dist/`) locally with the headers the app
 * needs: cross-origin isolation for expo-sqlite (SharedArrayBuffer) and an
 * SPA fallback to index.html. Usage: npm run web:serve [-- --port 8080]
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv.includes('--dir') ? process.argv[process.argv.indexOf('--dir') + 1] : 'dist');
const port = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 8080);

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
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', file.endsWith('index.html') || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600');
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`Serving ${root} on http://localhost:${port}`);
});
