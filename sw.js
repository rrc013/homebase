// Homebase service worker: makes the app installable and opens fast.
// Network-first for app files (so updates show up right away), cache as fallback.
const CACHE = 'homebase-v8';
const SHELL = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/core.js', 'js/db.js', 'js/config.js', 'js/calendar.js', 'js/hub.js', 'js/weather.js', 'js/photos.js', 'js/kids.js', 'js/buddy.js', 'js/pets.js', 'js/fun.js', 'js/quickadd.js', 'js/notify.js',
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

// ---- phone notifications
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Homebase', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Homebase', {
    body: d.body || '', icon: d.icon || 'icons/icon-192.png', badge: 'icons/icon-192.png',
    tag: d.tag, renotify: !!d.tag, data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open) { open.navigate(url).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(url);
  }));
});
