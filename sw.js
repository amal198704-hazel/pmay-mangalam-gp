/* ============================================================
   Mangala GP PMAY — Service Worker
   ============================================================ */

const CACHE_NAME   = 'mangala-pmay-shell-v1';
const RUNTIME_NAME = 'mangala-pmay-runtime-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/webfonts/fa-brands-400.woff2',
  // Online generated icon — cache it on install so it works offline after first load
  'https://ui-avatars.com/api/?name=MGP&background=1a4fcf&color=fff&size=192&bold=true&format=png',
  'https://ui-avatars.com/api/?name=MGP&background=1a4fcf&color=fff&size=512&bold=true&format=png'
];

// ---------- INSTALL ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] Skipped:', url, err))
        )
      ))
      .then(() => self.skipWaiting())
  );
});

// ---------- ACTIVATE ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== RUNTIME_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- FETCH ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 1) Google Apps Script API — always network
  if (url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com') {
    event.respondWith(
      fetch(req).catch(() => new Response(
        JSON.stringify({ status: 'offline', message: 'You are offline. Please reconnect.' }),
        { headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // 2) Google Maps embeds — network only
  if (url.hostname.includes('google.com') && url.pathname.includes('/maps')) {
    event.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }

  // 3) Navigation — cache first, fallback to index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          return res;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // 4) Everything else — cache first, then network with runtime caching
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(RUNTIME_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.destination === 'image') {
          return caches.match('./icon-192.png');
        }
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
