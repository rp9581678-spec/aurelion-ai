// AURELION AI - Self-Unregistering Cleanup Service Worker
// Ensures stale cached bundles from previous builds never block app startup.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then((clients) => {
        clients.forEach((client) => {
          if (client && 'navigate' in client) {
            client.navigate(client.url).catch(() => {});
          }
        });
      })
      .catch(() => {})
  );
});
