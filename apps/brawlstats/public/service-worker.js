const CACHE_NAME = "brawlstats-shell-v2";
const ROOT_GAME_HOST = self.location.hostname === "bs.statsconnect.app";
const ASSET_BASE = ROOT_GAME_HOST ? "/bs/" : "./";
const SHELL_URL = new URL("./", self.registration.scope).href;
const APP_SHELL = [
  SHELL_URL,
  new URL("./manifest.webmanifest", self.registration.scope).href,
  ...[
    "favicon.ico",
    "favicon-32x32.png",
    "apple-touch-icon.png",
    "android-chrome-192x192.png",
    "android-chrome-512x512.png",
    "assets/img/bs-stats.png",
  ].map((path) => new URL(`${ASSET_BASE}${path}`, self.registration.scope).href),
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("brawlstats-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || (event.request.mode === "navigate" ? caches.match(SHELL_URL) : undefined))),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(new URL("./maps", self.registration.scope).href));
});
