/* Vpdf — Service Worker (offline-first). Bump the version whenever the code changes */
const APP_VERSION = "1.3.6";            // change together with APP_VERSION in index.html
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
    await Promise.allSettled(SHELL.map(u => c.add(new Request(u, {cache: "reload"}))));
    const l = await caches.open(LIBS);
    await Promise.allSettled(CDN.map(async u => { if (!(await l.match(u))) await l.add(u); }));
    await self.skipWaiting();                // activate the new version immediately
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("pa-") && k !== VERSION && k !== LIBS) await caches.delete(k);
    await self.clients.claim();
    for (const c of await self.clients.matchAll({includeUncontrolled: true})) c.postMessage({type: "sw-version", v: APP_VERSION});
  })());
});
self.addEventListener("message", e => { if (e.data && e.data.type === "get-version" && e.source) e.source.postMessage({type: "sw-version", v: APP_VERSION}); });
const timeout = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return; // Never intercept Telegram/server-sync POST requests.
  const u = new URL(req.url);

  if (req.mode === "navigate") {
    // Always ask GitHub Pages for the newest HTML first; use the cached shell offline.
    e.respondWith(fetch(req, {cache: "no-store"}).then(r => {
      if (r.ok) {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put("index.html", copy));
      }
      return r;
    }).catch(() => caches.match("index.html").then(r => r || caches.match("./"))));
    return;
  }

  if (u.hostname === "cdnjs.cloudflare.com") {
    // Keep pinned libraries cache-first for reliable offline operation.
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => {
      if (n.ok) {
        const copy = n.clone();
        caches.open(LIBS).then(c => c.put(req, copy));
      }
      return n;
    })));
    return;
  }

  if (u.origin === location.origin) {
    // Online-first: GitHub Pages latest asset immediately; cached copy only when offline.
    e.respondWith(fetch(req, {cache: "no-store"}).then(n => {
      if (n.ok) {
        const copy = n.clone();
        caches.open(VERSION).then(c => c.put(req, copy));
      }
      return n;
    }).catch(() => caches.match(req, {ignoreSearch: true})));
  }
});
