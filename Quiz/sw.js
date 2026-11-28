/* Quiz GPT service worker
 * VERSION must always equal APP_VERSION in index.html (run: python3 check_version.py).
 * Changing this file (the VERSION line) is what makes browsers install an update.
 */
const VERSION = '1.5.0';

const SHELL_CACHE = 'quizgpt-shell-v' + VERSION;   // app files: replaced on every version
const LIB_CACHE = 'quizgpt-libs-v1';               // CDN libraries + fonts: kept across versions

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

// Only these cross-origin hosts are cached (static, versioned libraries and fonts).
// Everything else (AI sites, Val Town gateway, OCR.space, radio streams, share links) goes straight to the network.
const LIB_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // index.html is required; icons are best-effort
    await cache.addAll([new Request('./index.html', { cache: 'reload' }), new Request('./', { cache: 'reload' })]);
    await Promise.all(SHELL_FILES.slice(2).map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    // No skipWaiting here: the page asks the student before switching (see SKIP_WAITING below).
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('quizgpt-shell-v') && k !== SHELL_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  const d = event.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;   // audio/video streams, posts: not ours
  let url; try { url = new URL(req.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1) page navigations: network first (so updates arrive), cached app shell when offline / slow
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const net = await Promise.race([
          fetch(req),
          new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))
        ]);
        if (net && net.ok) { cache.put('./index.html', net.clone()).catch(() => {}); return net; }
        throw new Error('bad');
      } catch (e) {
        return (await cache.match('./index.html', { ignoreSearch: true })) || (await cache.match('./', { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // 2) same-origin static files: cached copy first, refreshed in the background
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      const refresh = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()).catch(() => {}); return r; }).catch(() => null);
      return hit || (await refresh) || Response.error();
    })());
    return;
  }

  // 3) known CDN libraries and fonts: cache first, saved after the first online load
  if (LIB_HOSTS.indexOf(url.hostname) !== -1) {
    event.respondWith((async () => {
      const cache = await caches.open(LIB_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const net = await fetch(req);
        if (net && (net.ok || net.type === 'opaque')) cache.put(req, net.clone()).catch(() => {});
        return net;
      } catch (e) { return Response.error(); }
    })());
  }
  // everything else: not intercepted
});
