import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=f=>readFileSync(new URL('../dist/'+f,import.meta.url));
test('T9 manifest, icons, service worker hash and /app redirect',()=>{
 const m=JSON.parse(read('manifest.webmanifest','utf8'));
 assert.equal(m.start_url,'/app');assert.equal(m.display,'standalone');
 assert.ok(m.icons.length>=2);
 for(const icon of m.icons){
  const file=icon.src.replace(/^\//,'');assert.ok(existsSync(new URL('../dist/'+file,import.meta.url)),file);
  assert.deepEqual([...read(file).subarray(0,8)],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],file+' PNG header');
 }
 const hash=createHash('sha256');
 for(const f of ['app.js','inspector.js','style.css'])hash.update(read(f));
 assert.ok(read('sw.js').toString().includes('orbit-'+hash.digest('hex').slice(0,12)),'sw.js carries the current build hash');
 assert.ok(/^\/app\s+\/index\.html\s+200\s*$/m.test(read('_redirects').toString()));
 const html=read('index.html').toString();
 assert.ok(html.includes('rel="manifest"')&&html.includes('apple-mobile-web-app-capable'));
});
