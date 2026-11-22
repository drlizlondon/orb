// Network-first for same-origin app-shell files, cache as the offline fallback, so a new deploy
// reaches a returning visitor on the next load instead of being pinned to the old cache.
// The cache name carries the build hash (scripts/build.mjs rewrites it); activate deletes older orbit-* caches.
// Paths are relative to where this worker lives, so it works at a domain root or under /orb/.
const BUILD='orbit-c17ec0ff2e2e';
const BASE=new URL('./',self.location).pathname;
const SHELL=['','app/','app.js','inspector.js','style.css','manifest.webmanifest','icon-192.png','icon-512.png'].map(p=>BASE+p);
self.addEventListener('install',event=>{event.waitUntil(caches.open(BUILD).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('orbit-')&&key!==BUILD).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 let path=url.pathname;
 if(path===BASE+'index.html')path=BASE;
 if(path===BASE+'app'||path===BASE+'app/index.html')path=BASE+'app/';
 if(!SHELL.includes(path))return;
 event.respondWith(fetch(url.href,{cache:'no-cache'}).then(res=>{
  if(res.ok&&!res.redirected){const copy=res.clone();caches.open(BUILD).then(cache=>cache.put(path,copy));}
  return res;
 }).catch(()=>caches.open(BUILD).then(cache=>cache.match(path)).then(hit=>hit||Response.error())));
});
