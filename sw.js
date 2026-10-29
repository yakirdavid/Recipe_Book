// Offline support: serve from cache, refresh in the background.
// Bump VERSION when changing app files so old caches are cleared.
const VERSION = "v31";
const CACHE = `recipes-${VERSION}`;
const SHELL = [
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "data/recipes.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (bypassing the HTTP cache) so updates show up right away;
// fall back to the cached copy when offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(sameOrigin ? new Request(e.request.url, { cache: "reload", credentials: "same-origin" }) : e.request);
      if (res && (res.ok || res.type === "opaque")) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      if (cached) return cached;
      throw err;
    }
  })());
});
