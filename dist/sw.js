// Cache-first for same-origin app-shell files. The cache name carries the build hash
// (scripts/build.mjs rewrites it), so a new build replaces the old cache.
// Paths are relative to where this worker lives, so it works at a domain root or under /orb/.
const BUILD='orbit-5614f4f5a247';
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
 event.respondWith(caches.open(BUILD).then(cache=>cache.match(path)).then(hit=>hit||fetch(request)));
});
