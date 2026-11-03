// Service worker: makes the app load instantly and work with no connection.
// Bump VERSION whenever app files change so devices pick up the update.

const VERSION = "v2.0.0";
const CACHE = `finance-tracker-${VERSION}`;
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/styles.css",
  "icons/icon.svg",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "js/main.js",
  "js/util.js",
  "js/money.js",
  "js/db.js",
  "js/store.js",
  "js/sync.js",
  "js/recurring.js",
  "js/analytics.js",
  "js/charts.js",
  "js/defaults.js",
  "js/ui/dom.js",
  "js/ui/view.js",
  "js/ui/entry.js",
  "js/ui/home.js",
  "js/ui/activity.js",
  "js/ui/insights.js",
  "js/ui/settings.js",
  "js/ui/syncui.js",
  "js/ui/lock.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

// Cache first for speed and offline use; the network refreshes the cache in
// the background so the next launch has the newest files.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
