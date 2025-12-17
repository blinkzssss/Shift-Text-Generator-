// service-worker.js
const VERSION = "v9"; // <-- bump this on every update
const CACHE_NAME = `shift-text-${VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./service-worker.js",
  // "./icon-512.png" // keep commented if you’re not using an icon yet
];

// Install: cache core files
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

// Activate: delete old caches + notify clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
      )
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window", includeUncontrolled: true }))
      .then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "UPDATED", version: VERSION }));
      })
  );
});

// Fetch: prefer network, fallback to cache (so updates pull fast)
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

