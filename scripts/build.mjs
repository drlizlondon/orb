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
