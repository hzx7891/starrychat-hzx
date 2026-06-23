self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('starrychat-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/favicon.svg',
        '/manifest.json'
      ]).catch(err => {
        console.warn('SW 缓存失败，但不影响聊天', err);
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
