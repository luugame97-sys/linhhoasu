// Linh Hoa Su - PWA Service Worker
const CACHE_NAME = 'lhs-pwa-v1';

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Pass-through strategy: allow network requests to flow cleanly without disrupting game websockets or dynamic APIs
    if (event.request.method !== 'GET') {
        return;
    }
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
