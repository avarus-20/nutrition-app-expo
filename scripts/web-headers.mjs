/**
 * HTTP headers the web build must be served with. Single source for
 * `scripts/serve-web.mjs`, the generated `dist/_headers` (Netlify, Cloudflare
 * Pages) and `vercel.json` (checked by build-pwa.mjs).
 *
 * - COOP/COEP: cross-origin isolation, required by expo-sqlite (SharedArrayBuffer + OPFS).
 * - CSP: same-origin code only; `wasm-unsafe-eval` for the SQLite wasm; Supabase
 *   endpoints for auth/data/storage/functions. A custom Supabase domain must be
 *   added to `connect-src`.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
};

/** Paths whose content changes without a new file name. */
export const NO_CACHE_PATHS = ['/', '/index.html', '/sw.js', '/manifest.webmanifest'];
export const IMMUTABLE_PREFIXES = ['/_expo/static/', '/assets/'];
