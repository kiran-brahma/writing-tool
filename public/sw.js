/**
 * Obelus's offline shell.
 *
 * The app opens with the Writer's existing Documents while offline: the shell
 * (HTML) and the build's hashed JS/CSS are precached at install, and every
 * successful online navigation re-syncs the cache to the current deploy. The
 * Documents themselves live in IndexedDB and need no cache.
 *
 * Two properties matter:
 *
 *  - A new worker takes over immediately (`skipWaiting` + `clients.claim`), and
 *    superseded assets are pruned, so a `wrangler rollback` actually restores
 *    the old shell instead of stranding the new one, and the cache cannot grow
 *    without bound across releases. Bump `CACHE_NAME` when the cache's
 *    semantics change, not on every deploy.
 *  - Only same-origin shell assets are handled. Provider calls and any other
 *    same-origin request are never intercepted, cached or replayed.
 */

const CACHE_NAME = "obelus-shell-v1";
const ASSET_PREFIX = "/assets/";
const SHELL_STATIC_URLS = ["/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(installShell());
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

  // Only the shell's static assets are cached. Everything else same-origin —
  // including a Custom Connection pointed at this origin — passes through, so
  // an authenticated or `Vary`-ing response can never be stored or replayed.
  if (!isShellAsset(url.pathname)) return;
  event.respondWith(cacheFirst(request));
});

/**
 * Precache the current shell and everything it points at. Parsing the built
 * `index.html` is what lets a static worker know the content-hashed asset
 * names: without it, the very first offline open after install would find the
 * HTML in the cache but none of its JS or CSS.
 */
async function installShell() {
  const cache = await caches.open(CACHE_NAME);
  const response = await fetch("/index.html", { cache: "reload" });
  if (!response.ok) {
    throw new Error(`Could not precache the shell (HTTP ${response.status}).`);
  }
  const html = await response.clone().text();
  await cache.put("/index.html", response.clone());
  await cache.put("/", response.clone());
  await cache.addAll([...SHELL_STATIC_URLS, ...assetUrlsFrom(html)]);
  await self.skipWaiting();
}

async function networkFirstShell(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put("/index.html", response.clone());
      await syncShellAssets(cache, await response.clone().text());
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

/** Hashed assets that today's shell does not reference are from an old deploy. */
async function syncShellAssets(cache, html) {
  const wanted = new Set(assetUrlsFrom(html));
  const requests = await cache.keys();
  await Promise.all(
    requests
      .filter((request) => {
        const pathname = new URL(request.url).pathname;
        return pathname.startsWith(ASSET_PREFIX) && !wanted.has(pathname);
      })
      .map((request) => cache.delete(request)),
  );
}

function isShellAsset(pathname) {
  return (
    pathname.startsWith(ASSET_PREFIX) ||
    SHELL_STATIC_URLS.includes(pathname)
  );
}

/**
 * The `/assets/…` URLs Vite emits into the built `index.html` (the module
 * script and the stylesheet), deduplicated. `DOMParser` is not available in a
 * service worker, so this is a deliberate, narrow parse of markup this repo's
 * own build produces.
 */
function assetUrlsFrom(html) {
  const urls = [];
  const pattern = /(?:src|href)="(\/assets\/[^"]+)"/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    if (!urls.includes(match[1])) urls.push(match[1]);
  }
  return urls;
}
