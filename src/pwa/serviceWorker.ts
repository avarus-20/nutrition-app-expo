/** Native builds have no service worker; see `serviceWorker.web.ts`. */
export function registerServiceWorker(): void {}

export function subscribeToUpdate(_listener: () => void): () => void {
  return () => undefined;
}

export function isUpdateReady(): boolean {
  return false;
}

export function applyUpdate(): void {}
