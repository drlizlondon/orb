// Cache-first for same-origin app-shell files. The cache name carries the build hash
// (scripts/build.mjs rewrites it), so a new build replaces the old cache.
const BUILD='orbit-07b022a5f94b';
const SHELL=['/','/app.js','/inspector.js','/style.css','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(BUILD).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('orbit-aaaaaaaaaaaa')&&key!==BUILD).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 const path=request.mode==='navigate'&&(url.pathname==='/app'||url.pathname==='/'||url.pathname==='/index.html')?'/':url.pathname;
 if(!SHELL.includes(path))return;
 event.respondWith(caches.open(BUILD).then(cache=>cache.match(path)).then(hit=>hit||fetch(request)));
});
