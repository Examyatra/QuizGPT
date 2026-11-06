// Vishal Medical Store: opens with NO internet. Opens instantly from the saved copy;
// if internet is there it quietly fetches the newest copy for next time.
const C = 'vms-v31';
const LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Mrs+Saint+Delafield&display=swap'
];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then((c) => Promise.all([
    ...['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'].map((u) => c.add(u).catch(() => {})),
    // cross-origin files: fetched as "no-cors" and stored (cache.add() refuses these)
    ...LIBS.map((u) => fetch(u, { mode: 'no-cors' }).then((r) => c.put(u, r)).catch(() => {}))
  ])));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('vms-') && k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || !r.url.startsWith('http')) return;
  const net = fetch(r).then((res) => {
    if (res && (res.status === 200 || res.type === 'opaque')) { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)).catch(() => {}); }
    return res;
  }).catch(() => null);
  e.waitUntil(net);
  e.respondWith(
    caches.match(r, { ignoreSearch: true }).then((m) => m || net.then((res) => res || (r.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
