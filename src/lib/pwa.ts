// PWA service worker registration.

// PROD-only: the SW caches JS cache-first, so registering it in `astro dev`
// would keep serving a stale bundle even after editing + hard-refreshing.
export function registerServiceWorker() {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}
