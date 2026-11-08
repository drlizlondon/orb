import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
await mkdir('dist/vendor',{recursive:true});
await copyFile('node_modules/three/LICENSE','dist/vendor/THREE-LICENSE.txt');
await build({entryPoints:['src/galaxy.js'],bundle:true,minify:true,format:'esm',target:['es2020'],outfile:'dist/app.js',legalComments:'linked'});
await build({entryPoints:['src/inspector.jsx'],bundle:true,minify:true,format:'esm',target:['es2020'],outfile:'dist/inspector.js',define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
console.log('Three.js / GSAP / Lenis scene and Radix / Sonner inspector built.');

let html=await readFile('dist/index.html','utf8');
for(const file of ['app.js','inspector.js','style.css']){const hash=createHash('sha256').update(await readFile('dist/'+file)).digest('hex').slice(0,12);html=html.replace(new RegExp('([\"\'])\\./'+file.replace('.','\\.')+'(?:\\?v=[a-f0-9]+)?([\"\'])','g'),'$1./'+file+'?v='+hash+'$2');}
await writeFile('dist/index.html',html);

// Service worker cache name: changes whenever the shell changes.
const shellHash=createHash('sha256');
for(const file of ['app.js','inspector.js','style.css'])shellHash.update(await readFile('dist/'+file));
const buildHash=shellHash.digest('hex').slice(0,12);
let worker=await readFile('dist/sw.js','utf8');
worker=worker.replace(/const BUILD='orbit-[a-f0-9]+';/,"const BUILD='orbit-"+buildHash+"';");
await writeFile('dist/sw.js',worker);
