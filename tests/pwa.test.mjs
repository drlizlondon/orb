import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=f=>readFileSync(new URL('../dist/'+f,import.meta.url));
test('T9 manifest, icons, service worker hash and /app redirect',()=>{
 const m=JSON.parse(read('manifest.webmanifest','utf8'));
 assert.equal(m.start_url,'./app/');assert.equal(m.scope,'./');assert.equal(m.display,'standalone');
 assert.ok(m.icons.length>=2);
 for(const icon of m.icons){
  assert.ok(!icon.src.startsWith('/'),'icon path is relative');const file=icon.src;assert.ok(existsSync(new URL('../dist/'+file,import.meta.url)),file);
  assert.deepEqual([...read(file).subarray(0,8)],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],file+' PNG header');
 }
 const hash=createHash('sha256');
 for(const f of ['app.js','inspector.js','style.css'])hash.update(read(f));
 assert.ok(read('sw.js').toString().includes('orbit-'+hash.digest('hex').slice(0,12)),'sw.js carries the current build hash');
 const app=read('app/index.html').toString();
 assert.ok(app.includes('src="../app.js')&&app.includes('href="../manifest.webmanifest"'),'app page points one folder up');
 for(const [name,text] of [['index.html',read('index.html').toString()],['app/index.html',app]])
  assert.ok(!/(?:href|src)="\/(?!\/)/.test(text),name+' has no root-absolute links (breaks under /orb/)');
 assert.ok(!/['"]\/(?:app|index|style|icon|manifest)/.test(read('sw.js').toString()),'sw.js has no root-absolute shell paths');
 const html=read('index.html').toString();
 assert.ok(html.includes('rel="manifest"')&&html.includes('apple-mobile-web-app-capable'));
});
test('service worker is registered relative to app.js, not the page (works from /orb/app/)',()=>{
 const src=readFileSync(new URL('../src/galaxy.js',import.meta.url),'utf8');
 assert.ok(src.includes("serviceWorker.register(new URL('sw.js',import.meta.url))"));
 assert.ok(!/serviceWorker\.register\(['"]\.\/sw\.js/.test(src),'page-relative ./sw.js 404s under /orb/app/');
});
