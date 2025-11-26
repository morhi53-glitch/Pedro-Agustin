const VERSION = 'v1.0.1';
const PRECACHE = `precache-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sw.js'
  // Si añades offline.html más adelante, ponlo aquí:
  // './offline.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (![PRECACHE, RUNTIME].includes(key)) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Precargados: cache-first
// Resto: network-first con fallback a cache (y a index.html si es navegación)
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignorar cosas raras (chrome-extension, etc.)
  if (url.protocol.startsWith('chrome') || url.origin === 'null') return;

  const isPrecached = PRECACHE_URLS.some(u =>
    url.href.endsWith(u.replace('./', '')) ||
    url.pathname.endsWith(u.replace('./', ''))
  );

  if (isPrecached) {
    event.respondWith(
      caches.open(PRECACHE).then(cache =>
        cache.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(res => {
            cache.put(req, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // Network-first para el resto
  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(RUNTIME).then(cache => cache.put(req, copy));
        return res;
      })
      .catch(() =>
        caches.match(req).then(cached => {
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
            // O, si tienes offline.html:
            // return caches.match('./offline.html');
          }
        })
      )
  );
});
