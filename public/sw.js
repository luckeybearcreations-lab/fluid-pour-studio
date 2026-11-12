// Offline support: the app shell and its assets are cached as they load, and
// served from the cache when there is no connection.
const CACHE = 'lucky-bear-fluid-studio-v4';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/lucky-bear-mark.webp'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never cache other sites, or the Pro checks: those must always be live.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => caches.match(request, { ignoreSearch: request.mode === 'navigate' }).then(cached => cached || (request.mode === 'navigate' ? caches.match('/') : Response.error()))));
});
