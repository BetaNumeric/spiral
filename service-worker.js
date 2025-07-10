// service-worker.js

self.addEventListener('install', e => {
  e.waitUntil(
    caches
      .open('v1')
      .then(cache =>
        cache.addAll([
          '/',
          '/index.html',
          '/manifest.json',
          '/icons/icon_192.png',
          '/icons/icon_512.png',
        ])
      )
  );
});  // ← closes addEventListener

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
