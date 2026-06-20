const CACHE_NAME = 'academic-dashboard-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  './css/style.css',
  './css/dashboard.css',
  './css/responsive.css',
  './js/app.js',
  './js/ui.js',
  './js/auth.js',
  './js/profile.js',
  './js/attendance.js',
  './js/result-tracker.js',
  './js/calendar.js',
  './js/charts.js',
  './js/supabase-client.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Never cache config.js (it carries env-derived values) or Supabase calls.
  if (url.includes('config.js') || url.includes('supabase.co')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
      return resp;
    }))
  );
});
