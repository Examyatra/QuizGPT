/* PDF एनोटेटर — Service Worker (offline-first). कोड बदलने पर VERSION बढ़ाइए */
const APP_VERSION = "1.1.0";            // index.html के APP_VERSION के साथ ही बदलें
const VERSION = "pa-app-" + APP_VERSION;  // ऐप-शेल कैश (हर वर्शन पर नया)
const LIBS = "pa-libs-1";                 // pdf.js आदि (वर्शन-पिन्ड) — हर अपडेट पर दोबारा डाउनलोड नहीं
const SHELL = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png", "icon-maskable-512.png"];
/* ध्यान: यह SW IndexedDB / यूज़र डेटा को कभी नहीं छूता — सिर्फ़ ऐप-फ़ाइलें कैश करता है */
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
    await self.skipWaiting();                // नया वर्शन तुरंत सक्रिय
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
  if (req.method !== "GET") return;               // सर्वर सिंक (POST) को कभी नहीं छूते
  const u = new URL(req.url);
  if (req.mode === "navigate") {                  // पेज: नेटवर्क पहले (4 सेकंड), फिर कैश
    e.respondWith(timeout(fetch(req), 4000).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put("index.html", c)); return r; })
      .catch(() => caches.match("index.html").then(r => r || caches.match("./"))));
    return;
  }
  if (u.hostname === "cdnjs.cloudflare.com") {    // लाइब्रेरी: कैश पहले
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { const c = n.clone(); if (n.ok) caches.open(LIBS).then(x => x.put(req, c)); return n; })));
    return;
  }
  if (u.origin === location.origin) {             // अपनी फ़ाइलें: कैश दिखाओ, पीछे अपडेट
    e.respondWith(caches.match(req, {ignoreSearch: true}).then(r => {
      const net = fetch(req).then(n => { const c = n.clone(); if (n.ok) caches.open(VERSION).then(x => x.put(req, c)); return n; }).catch(() => r);
      return r || net;
    }));
  }
});
