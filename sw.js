// ========================================
// CENTINELA - SERVICE WORKER v1.0
// ========================================

const CACHE_NAME = 'centinela-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/styles.css',
    '/manifest.json',
    '/icons/icon-72.png',
    '/icons/icon-96.png',
    '/icons/icon-128.png',
    '/icons/icon-144.png',
    '/icons/icon-152.png',
    '/icons/icon-192.png',
    '/icons/icon-384.png',
    '/icons/icon-512.png'
];

// Instalación
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('📦 Cache creado');
                return cache.addAll(ASSETS);
            })
            .then(() => {
                console.log('✅ Archivos cacheados');
                return self.skipWaiting();
            })
    );
});

// Activación
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('🗑️ Cache eliminado:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('✅ Service Worker activado');
                return self.clients.claim();
            })
    );
});

// Interceptar peticiones
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then((response) => {
                        if (event.request.method !== 'GET') {
                            return response;
                        }

                        const responseClone = response.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseClone);
                            });

                        return response;
                    })
                    .catch(() => {
                        return new Response('Sin conexión', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// Push notifications
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : '¡Alerta de seguridad!',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        actions: [
            {
                action: 'view',
                title: 'Ver vehículo'
            },
            {
                action: 'dismiss',
                title: 'Ignorar'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('🚗 Centinela', options)
    );
});

// Click en notificaciones
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'view') {
        const urlToOpen = new URL('/', self.location.origin).href;
        event.waitUntil(
            clients.matchAll({ type: 'window' })
                .then((windowClients) => {
                    for (const client of windowClients) {
                        if (client.url === urlToOpen && 'focus' in client) {
                            return client.focus();
                        }
                    }
                    if (clients.openWindow) {
                        return clients.openWindow('/');
                    }
                })
        );
    }
});
