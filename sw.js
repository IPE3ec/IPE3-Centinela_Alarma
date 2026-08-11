const CACHE_NAME = 'centinela-v3';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ================================
// INSTALACIÓN
// ================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ================================
// ACTIVACIÓN
// ================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ================================
// PETICIONES
// ================================
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Solo manejamos GET
  if (request.method !== 'GET') return;

  // ----------------------------
  // HTML: NETWORK FIRST
  // ----------------------------
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copy));
          }

          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then((cached) => cached || caches.match('./index.html'));
        })
    );

    return;
  }

  // ----------------------------
  // JS / CSS / IMÁGENES:
  // CACHE FIRST
  // ----------------------------
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request)
          .then((response) => {
            if (!response.ok) {
              return response;
            }

            const copy = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copy));

            return response;
          });
      })
  );
});
