// sw.js — Service Worker with aggressive cache busting
// Place this file in your ROOT directory (same folder as index.html)
// This REPLACES your existing sw.js if you have one

const CACHE_VERSION = 'hoops-v' + Date.now(); // unique every deploy
const STATIC_CACHE  = CACHE_VERSION;

// Files to cache for offline use
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
];

// ── Install: cache fresh copies ──
self.addEventListener('install', event => {
  // Skip waiting forces the new SW to activate immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

// ── Activate: delete ALL old caches immediately ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== STATIC_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // take control of all open tabs immediately
  );
});

// ── Fetch: Network-first strategy for JS/CSS, cache fallback ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go network-first for your app files (never serve stale JS/CSS)
  if (
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/'
  ) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then(response => {
          // Clone and store fresh copy
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Network failed — fall back to cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // For everything else (fonts, images, API calls) — network only
  event.respondWith(fetch(event.request));
});