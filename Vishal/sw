/* Study Timer service worker.
   VER must equal APP_VER in index.html (they are released together).
   Strategy:
   - The app page (index.html, "/", sw.js) is NETWORK-FIRST: when online you always get the newest build, never a stale copy.
     The cached copy is used only when offline or when the network is very slow (4 s).
   - Icons / manifest are cache-first with a background refresh.
   - Requests that ask for no-store / reload (the in-app version check) are never answered from cache. */
const VER='2026.11.01.1',V='study-timer-'+VER,FILES=['./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const key=u=>{const x=new URL(u);x.search='';x.hash='';return x.href};
const INDEX=()=>new URL('./index.html',self.registration.scope).href;
const isDoc=r=>{if(r.mode==='navigate')return true;const p=new URL(r.url).pathname;return p.endsWith('/')||p.endsWith('/index.html')||p.endsWith('/sw.js')};
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>Promise.all(FILES.map(f=>c.add(new Request(f,{cache:'reload'})).catch(()=>{})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
const fresh=(r,ms)=>new Promise((ok,no)=>{const t=setTimeout(()=>no(new Error('slow')),ms);fetch(r).then(x=>{clearTimeout(t);ok(x)},x=>{clearTimeout(t);no(x)})});
self.addEventListener('fetch',e=>{
 const r=e.request;
 if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 if(r.cache==='no-store'||r.cache==='reload')return;
 const k=key(r.url);
 if(isDoc(r)){
  e.respondWith((async()=>{
   const c=await caches.open(V);
   try{
    const res=await fresh(r,4000);
    if(res&&res.ok&&!res.redirected){const cp=res.clone();e.waitUntil(c.put(r.mode==='navigate'||k.endsWith('/')?INDEX():k,cp))}
    return res;
   }catch(err){
    const hit=await c.match(k)||await c.match(INDEX());
    return hit||(r.mode==='navigate'?Response.error():Response.error());
   }
  })());
  return;
 }
 e.respondWith(caches.open(V).then(async c=>{
  const hit=await c.match(k);
  const net=fetch(r).then(res=>{if(res&&res.ok&&!res.redirected)c.put(k,res.clone());return res}).catch(()=>null);
  if(hit){e.waitUntil(net);return hit}
  return (await net)||Response.error();
 }));
});
/* tapping a timer notification brings the app back to the front */
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c)return c.focus()}return self.clients.openWindow?self.clients.openWindow('./index.html'):null}))});
