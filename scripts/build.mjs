import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist/vendor',{recursive:true});
await copyFile('node_modules/three/build/three.module.js','dist/vendor/three.module.js');
await copyFile('node_modules/three/LICENSE','dist/vendor/THREE-LICENSE.txt');
console.log('Static site ready in dist/');
