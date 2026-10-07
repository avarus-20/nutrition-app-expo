import { logger } from '@/utils/logger';

/**
 * Registers `/sw.js` (production builds only) and exposes "a new version is
 * waiting" as a tiny external store. The new worker is activated only when
 * the user accepts, so a running session never switches assets mid-use.
 */
let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

function setWaiting(worker: ServiceWorker | null) {
  waiting = worker;
  for (const l of [...listeners]) l();
}

function supported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    process.env.NODE_ENV === 'production'
  );
}

export function registerServiceWorker(): void {
  if (!supported()) return;
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const track = (worker: ServiceWorker | null) => {
        if (!worker) return;
        const check = () => {
          // Without a controller this is the first install, not an update.
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
        };
        worker.addEventListener('statechange', check);
        check();
      };
      track(registration.waiting);
      registration.addEventListener('updatefound', () => track(registration.installing));
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading || !waiting) return;
        reloading = true;
        window.location.reload();
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => undefined);
      });
    } catch (error) {
      logger.warn('pwa', 'service worker registration failed', error);
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}

export function subscribeToUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isUpdateReady(): boolean {
  return waiting !== null;
}

export function applyUpdate(): void {
  waiting?.postMessage({ type: 'SKIP_WAITING' });
}
