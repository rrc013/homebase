// Homebase service worker: makes the app installable and opens fast.
// Network-first for app files (so updates show up right away), cache as fallback.
const CACHE = 'homebase-v4';
const SHELL = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/core.js', 'js/db.js', 'js/config.js', 'js/calendar.js', 'js/hub.js', 'js/weather.js', 'js/photos.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // never cache Supabase data
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
