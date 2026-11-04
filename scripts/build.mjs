import {mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
await mkdir('dist/vendor',{recursive:true});
await copyFile('node_modules/three/LICENSE','dist/vendor/THREE-LICENSE.txt');
await build({entryPoints:['src/galaxy.js'],bundle:true,minify:true,format:'esm',target:['es2020'],outfile:'dist/app.js',legalComments:'linked'});
await build({entryPoints:['src/inspector.jsx'],bundle:true,minify:true,format:'esm',target:['es2020'],outfile:'dist/inspector.js',define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
console.log('Three.js / GSAP / Lenis scene and Radix / Sonner inspector built.');
