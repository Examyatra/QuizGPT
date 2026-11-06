/* Vishal Medical Store — Service Worker (OFFLINE-1.25)
 * - App बिना इंटरनेट के भी खुले (सारी ज़रूरी files cache में)
 * - index.html: पहले नेट से नया लो, न मिले तो cache से (ताकि update आती रहे)
 * - सिर्फ अपनी site की GET files cache होती हैं; सर्वर बैकअप (val.run) को कभी नहीं छूता
 */
const VER = 'vms-cache-1.25';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    // एक file fail हो तो भी बाकी cache हों
    await Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // बैकअप सर्वर / fonts / CDN को छूना नहीं

  // पेज खोलना: network-first, फेल हो तो cache
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const net = fetch(req, { cache: 'no-cache' });
      try {
        // नेट धीमा हो तो 4 सेकंड बाद cache वाला पेज (ऐप अटके नहीं)
        const res = await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
        if (res && res.ok) {
          const c = await caches.open(VER);
          c.put('./index.html', res.clone()).catch(() => {});
        }
        return res;
      } catch (err) {
        const c = await caches.open(VER);
        const hit = (await c.match('./index.html')) || (await c.match('./'));
        if (hit) { net.then(r => { if (r && r.ok) c.put('./index.html', r.clone()).catch(() => {}); }).catch(() => {}); return hit; }
        try { return await net; } catch (e2) {}
        return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // बाकी files (icons, manifest): cache-first, पीछे से refresh
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
