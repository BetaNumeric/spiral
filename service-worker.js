// service-worker.js

importScripts('./js/app-version.js');

const CACHE_NAME = (typeof APP_CACHE_NAME === 'string' && APP_CACHE_NAME)
  ? APP_CACHE_NAME
  : 'spiral-v';
const toURL = (p) => new URL(p, self.location).toString();
const ASSETS = [
  './',
  './index.html',
  './study-analysis.html',
  './a2hs.js',
  './js/app-version.js',
  './js/config-utils.js',
  './js/time-model.js',
  './js/event-model.js',
  './js/event-projection.js',
  './js/location-search.js',
  './js/icalendar.js',
  './js/suncalc.min.js',
  './js/settings-config.js',
  './js/event-storage.js',
  './js/core.js',
  './js/core-methods.js',
  './js/event-time.js',
  './js/event-transfer.js',
  './js/ui-handlers.js',
  './js/ui-event-panel.js',
  './js/input-mouse.js',
  './js/render-spiral.js',
  './js/render-circle.js',
  './js/state-storage-sync.js',
  './js/event-storage-ui.js',
  './js/pickers-calendars.js',
  './js/touch-time-orientation.js',
  './js/study-session.js',
  './js/study-analysis-page.js',
  './tools/study-analysis-core.mjs',
  './js/bootstrap.js',
  './manifest.json',
  './icons/icon_32.gif',
  './icons/icon_192.png',
  './icons/icon_512.png',
  './icons/add_to_calendar.png',
  './icons/add_to_calendar_white.png',
  './icons/added_to_calendar.png',
  './icons/added_to_calendar_white.png',
  './icons/enter.png',
  './icons/enter_white.png',
  './icons/location.png',
  './icons/location_white.png',
  './icons/mute.png',
  './icons/mute_white.png',
  './icons/search.png',
  './icons/search_white.png',
  './icons/settings.png',
  './icons/share.png',
  './icons/share_white.png',
  './icons/speaker.png',
  './icons/speaker_white.png',
  './icons/update_calendar.png',
  './icons/update_calendar_white.png',
  './icons/wait.png',
  './icons/wait_white.png',
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
      keys.filter((k) => k.startsWith(APP_CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))
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
