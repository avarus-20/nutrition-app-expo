/* Service worker: offline app shell for the web build.
 *
 * `scripts/build-pwa.mjs` replaces the two placeholders after `expo export`:
 * the build hash (new hash = new cache = update prompt in the app) and the
 * list of files precached on install. Only same-origin GET requests are
 * handled; Supabase (auth, REST, storage, functions) always goes to the network.
 */
const BUILD = '__BUILD_HASH__';
const PRECACHE = __PRECACHE_MANIFEST__;
const SHELL_CACHE = `nutrition-shell-${BUILD}`;
const RUNTIME_CACHE = `nutrition-runtime-${BUILD}`;
const NAVIGATION_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('nutrition-') && k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isImmutable(url) {
  return url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/');
}

async function fromNetworkWithTimeout(request) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Navigations: fresh HTML when online, the cached shell when offline or slow. */
async function handleNavigation(request) {
  try {
    const response = await fromNetworkWithTimeout(request);
    if (response.ok) return response;
    throw new Error(`HTTP ${response.status}`);
  } catch {
    const cached = await caches.match('/index.html', { cacheName: SHELL_CACHE });
    return cached || Response.error();
  }
}

/** Hashed build assets never change: cache first. */
async function handleImmutable(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/** Everything else (manifest, icons): serve cached, refresh in the background. */
async function handleStatic(request, event) {
  const cached = await caches.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') event.respondWith(handleNavigation(request));
  else if (isImmutable(url)) event.respondWith(handleImmutable(request));
  else event.respondWith(handleStatic(request, event));
});
