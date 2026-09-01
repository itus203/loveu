// DIU Nexus SW disabled — fixes net::ERR_FAILED
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).then(()=>self.registration.unregister()).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch', () => {}); // pass-through, no intercept
