/* Vishal Medical Store — Service Worker (OFFLINE-1.38)
 * - नया version = नया cache (VER), पुराने सारे cache activate पर delete
 * - install में skipWaiting(), activate में clients.claim(): नया SW तुरंत चालू
 * - index.html, sw.js, manifest.json: network-first (नेट हो तो नई file, न हो तो cache)
 * - icons: cache-first, पीछे से refresh
 * - सिर्फ अपनी site की GET files छूता है; सर्वर बैकअप (val.run / val.town) हमेशा सीधे नेटवर्क से
 */
const VER = 'vms-cache-1.38';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];
const NET_FIRST = ['/index.html', '/sw.js', '/manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    // एक file fail हो तो भी बाकी cache हों
    await Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// cache में एक ही key (?v= / ?_= से भीड़ नहीं)
const keyFor = (url, isNav) => {
  let p = url.pathname;
  if (isNav || p.endsWith('/')) p = p.replace(/[^/]*$/, '') + 'index.html';
  return new Request(url.origin + p);
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // बैकअप सर्वर / fonts / CDN को छूना नहीं
  if (/(^|\.)val\.(run|town)$/.test(url.hostname)) return;    // Val Town: हमेशा सीधे नेटवर्क

  const isNav = req.mode === 'navigate';
  const isNF = isNav || NET_FIRST.some(s => url.pathname.endsWith(s)) || url.pathname.endsWith('/');

  if (isNF) {
    e.respondWith((async () => {
      const key = keyFor(url, isNav);
      const net = fetch(req, { cache: 'no-cache' });
      try {
        // नेट बहुत धीमा हो तो 4 सेकंड बाद cache वाली file (ऐप अटके नहीं)
        const res = await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
        if (res && res.ok) {
          const c = await caches.open(VER);
          c.put(key, res.clone()).catch(() => {});
        }
        return res;
      } catch (err) {
        const c = await caches.open(VER);
        const hit = await c.match(key);
        if (hit) {
          net.then(r => { if (r && r.ok) c.put(key, r.clone()).catch(() => {}); }).catch(() => {});
          return hit;
        }
        try { return await net; } catch (e2) {}
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // बाकी files (icons): cache-first, पीछे से refresh
  e.respondWith((async () => {
    const c = await caches.open(VER);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res && res.ok) c.put(req, res.clone()).catch(() => {});
      return res;
    }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504 });
  })());
});
