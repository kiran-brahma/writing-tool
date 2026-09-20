/**
 * Registers the offline shell. The worker and the manifest live in `public/`
 * and are copied verbatim into the build, because the shell must be served from
 * the site root to control navigations.
 *
 * Registration is production-only: a service worker under the Vite dev server
 * caches module responses and fights hot reload, and there is no offline
 * property to preserve in development. The deploy is where the shell is
 * verified. A failed registration costs offline opening and nothing else — the
 * app is fully usable online — and there is no telemetry to report it to.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("Obelus could not register its offline shell:", error);
    });
  });
}
