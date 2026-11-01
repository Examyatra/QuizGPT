/* Study Timer offline cache. Change the version number when you upload a new timer.html */
const V='study-timer-v17',FILES=['./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const key=u=>{const x=new URL(u);x.search='';x.hash='';return x.href};
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>Promise.all(FILES.map(f=>c.add(new Request(f,{cache:'reload'})).catch(()=>{})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
 const k=key(r.url);
 e.respondWith(caches.open(V).then(async c=>{
  const hit=await c.match(k);
  const net=fetch(r).then(res=>{if(res&&res.ok&&!res.redirected)c.put(k,res.clone());return res}).catch(()=>null);
  if(hit){e.waitUntil(net);return hit}
  const res=await net;
  return res||(r.mode==='navigate'?await c.match('./index.html'):null)||Response.error()}))});
/* tapping a timer notification brings the app back to the front */
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c)return c.focus()}return self.clients.openWindow?self.clients.openWindow('./index.html'):null}))});
