/**
 * Obelus's offline shell.
 *
 * It caches the app shell and the hashed build assets so the app opens with the
 * Writer's existing Documents while offline; the Documents themselves live in
 * IndexedDB and are available whether or not there is a network.
 *
 * Two properties matter:
 *
 *  - The cache name is keyed to the release, and a new worker takes over
 *    immediately (`skipWaiting` + `clients.claim`), so a `wrangler rollback`
 *    actually restores the old shell instead of stranding the new one.
 *  - Only same-origin GET requests are handled. Provider calls are never
 *    intercepted, cached or replayed.
 */

const CACHE_NAME = "obelus-shell-v1";
const SHELL_URLS = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    // Network-first so a fresh deploy is picked up, falling back to the cached
    // shell so the app still opens offline.
    event.respondWith(networkFirstShell(request));
    return;
  }

  // Hashed build assets never change under the same name, so cache-first is
  // safe and makes the second load instant and fully offline.
  event.respondWith(cacheFirst(request));
});

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put("/index.html", response.clone());
    }
    return response;
  } catch (error) {
    // Offline or the network failed: serve the shell cached at install. The
    // Library lives in IndexedDB, so an existing Document opens from here.
    const cached = await cache.match("/index.html");
    if (cached !== undefined) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached !== undefined) return cached;

  const response = await fetch(request);
  // Only same-origin, non-opaque responses are stored, so a provider reply can
  // never enter the cache even if the origin check above were to change.
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
  }
  return response;
}
