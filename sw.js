const CACHE_NAME = 'centinela-v8';

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
// INSTALL
// ================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ================================
// ACTIVATE
// ================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// ================================
// FETCH
// ================================
self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') return;

  // HTML / navegación:
  // Internet primero, caché como respaldo
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
            .then((cached) => {
              return cached || caches.match('./index.html');
            });
        })
    );

    return;
  }

  // CSS / JS / Manifest / imágenes
  // Internet primero, caché como respaldo
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
        return caches.match(request);
      })
  );
});
