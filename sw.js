/* =========================================================================
   CENTINELA v5.0 — Service Worker
   Caché offline-first para PWA
   ========================================================================= */

const CACHE_NAME = 'centinela-v5.0.1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap'
];

// ✅ INSTALACIÓN: Cachea recursos estáticos
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Instalando v5.0.1...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('📦 Service Worker: Cacheando recursos');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('✅ Service Worker: Instalado correctamente');
        return self.skipWaiting(); // Activa inmediatamente
      })
      .catch((err) => {
        console.error('❌ Error cacheando recursos:', err);
      })
  );
});

// ✅ ACTIVACIÓN: Limpia cachés antiguos
self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker: Activando...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Service Worker: Eliminando caché antiguo', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activado correctamente');
        return self.clients.claim(); // Toma control de todas las páginas
      })
  );
});

// ✅ FETCH: Estrategia Cache First con Network Fallback
self.addEventListener('fetch', (event) => {
  // Ignora solicitudes que no sean GET
  if (event.request.method !== 'GET') return;
  
  // Ignora solicitudes a extensiones de navegador
  if (event.request.url.includes('chrome-extension://')) return;
  if (event.request.url.includes('moz-extension://')) return;
  
  // Ignora solicitudes a dominios externos no cacheables
  const url = new URL(event.request.url);
  if (url.hostname !== self.location.hostname && 
      !url.hostname.includes('unpkg.com') && 
      !url.hostname.includes('googleapis.com') &&
      !url.hostname.includes('gstatic.com') &&
      !url.hostname.includes('openstreetmap.org')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Servir desde caché y actualizar en background
          console.log('📦 Service Worker: Sirviendo desde caché', event.request.url);
          
          // Update cache in background
          event.waitUntil(
            fetch(event.request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                  });
                }
                return networkResponse;
              })
              .catch(() => {
                // Network failed, but we already have cache
              })
          );
          
          return cachedResponse;
        }

        // No está en caché, intentar red
        return fetch(event.request)
          .then((response) => {
            // Si la red responde, cachear para próxima vez
            if (response && response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseClone);
                });
            }
            return response;
          })
          .catch(() => {
            // Si es navegación, mostrar página offline
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
            
            // Para otros recursos, devolver respuesta vacía
            return new Response('', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
      })
  );
});

// ✅ MENSAJES: Permite skip waiting desde la app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// ✅ NOTIFICACIONES PUSH (preparado para futuro)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Centinela';
  const options = {
    body: data.body || 'Notificación de tu vehículo',
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    vibrate: [200, 100, 200],
    data: data,
    actions: [
      {
        action: 'open',
        title: 'Abrir app'
      },
      {
        action: 'dismiss',
        title: 'Descartar'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

console.log('✅ Service Worker v5.0.1 cargado');
