/* Vpdf — Service Worker (offline-first). Bump the version whenever the code changes */
const APP_VERSION = "1.4.52";            // change together with APP_VERSION in index.html
const VERSION = "pa-app-" + APP_VERSION;  // app-shell cache (new for every version)
const LIBS = "pa-libs-1";                 // pdf.js etc. (version-pinned) — not re-downloaded on every update
const SHELL = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];
/* Note: this SW never touches IndexedDB / user data — it only caches app files */
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
];
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    const res = await Promise.allSettled(SHELL.map(u => c.add(new Request(u, {cache: "reload"}))));
    if (res[1].status !== "fulfilled") throw new Error("index.html could not be cached — keeping the previous version");  // never activate a shell without the app page
    const l = await caches.open(LIBS);
    await Promise.allSettled(CDN.map(async u => { if (!(await l.match(u))) await l.add(u); }));
    await self.skipWaiting();                // activate the new version immediately
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("pa-") && k !== VERSION && k !== LIBS) await caches.delete(k);
    await caches.delete("transformers-cache");   // old voice model (80-250 MB) from v1.4.41 — no longer used, free the space
    try { const l = await caches.open(LIBS); for (const r of await l.keys()) if (new URL(r.url).hostname === "cdn.jsdelivr.net") await l.delete(r); } catch (x) {}   // old voice library
    await self.clients.claim();
    for (const c of await self.clients.matchAll({includeUncontrolled: true})) c.postMessage({type: "sw-version", v: APP_VERSION});
  })());
});
self.addEventListener("message", e => {
  if (e.data && e.data.type === "get-version" && e.source) e.source.postMessage({type: "sw-version", v: APP_VERSION});
  if (e.data && e.data.type === "warm") e.waitUntil(warm().catch(() => {}));
});
const timeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
/* Fills in anything missing from the caches (a library or file that failed to download the first time). Runs again whenever the page reports it is online. */
async function warm() {
  const c = await caches.open(VERSION), l = await caches.open(LIBS);
  await Promise.allSettled([
    ...SHELL.map(async u => { if (!(await c.match(u))) await timeout(c.add(new Request(u, {cache: "reload"})), 20000); }),
    ...CDN.map(async u => { if (!(await l.match(u))) await timeout(l.add(u), 30000); })
  ]);
}
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;               // never touch Telegram / server sync (POST) requests
  const u = new URL(req.url);
  if (req.mode === "navigate") {                  // pages: open instantly from the cache (works offline), refresh the cache in the background
    e.respondWith((async () => {
      const cached = (await caches.match("index.html")) || (await caches.match("./"));
      const net = timeout(fetch(req), 20000).then(r => {
        if (r.ok) { const c = r.clone(); caches.open(VERSION).then(x => x.put("index.html", c)); }          // cache successful pages only
        return r;
      });
      if (cached) { e.waitUntil(net.catch(() => {})); return cached; }                                      // no waiting for the network at all
      return net.catch(() => Response.error());                                                              // first ever visit: network is the only source
    })());
    return;
  }
  if (u.hostname === "cdnjs.cloudflare.com") {    // libraries: cache first; if missing, a slow network may not block the page forever
    e.respondWith(caches.match(req).then(r => r || timeout(fetch(req), 15000).then(n => { const c = n.clone(); if (n.ok) caches.open(LIBS).then(x => x.put(req, c)); return n; }).catch(() => Response.error())));
    return;
  }
  if (u.origin === location.origin) {             // own files: serve from cache, update in the background
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(r => {
      const net = fetch(req).then(n => { const c = n.clone(); if (n.ok) caches.open(VERSION).then(x => x.put(req, c)); return n; }).catch(() => r);
      return r || net;
    }));
  }
});
