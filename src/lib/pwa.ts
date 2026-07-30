// PWA service worker registration.

// PROD-only: the SW caches JS cache-first, so registering it in `astro dev`
// makes the browser keep serving an old cached bundle even after editing
// source files and hard-refreshing — very confusing during development.
export function registerServiceWorker() {
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}
