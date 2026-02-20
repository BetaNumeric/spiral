// service-worker.js

const CACHE_NAME = 'spiral-v3';
const toURL = (p) => new URL(p, self.location).toString();
const ASSETS = [
  './',
  './index.html',
  './a2hs.js',
  './js/config-utils.js',
  './js/core.js',
  './js/core-methods.js',
  './js/ui-handlers.js',
  './js/ui-event-panel.js',
  './js/input-mouse.js',
  './js/render-spiral.js',
  './js/render-circle.js',
  './js/state-storage-sync.js',
  './js/pickers-calendars.js',
  './js/touch-time-orientation.js',
  './js/bootstrap.js',
  './manifest.json',
  './icons/icon_32.png',
  './icons/icon_192.png',
  './icons/icon_512.png',
  './sounds/click.mp3',
  './sounds/click.wav',
  './sounds/click0.mp3',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map(toURL)))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith(
    caches.match(req).then((cached) => 
      cached || fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => {
          // Only cache GET and same-origin
          if (req.method === 'GET' && new URL(req.url).origin === self.location.origin) {
            cache.put(req, copy).catch(() => {});
          }
        });
        return resp;
      }).catch(() => cached)
    )
  );
});
