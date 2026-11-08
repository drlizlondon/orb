import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
const walk=dir=>readdirSync(dir).flatMap(n=>{const p=join(dir,n);return statSync(p).isDirectory()?walk(p):[p];});
test('T5 no third-party icon service anywhere in src/ or dist/',()=>{
 const banned=['google.com/s2','duckduckgo.com/ip','favicon.im'];
 const files=[...walk('src'),...walk('dist')].filter(f=>!/\.(png|jpg|ico)$/.test(f));
 assert.ok(files.length>10);
 for(const f of files){const text=readFileSync(f,'utf8');for(const b of banned)assert.ok(!text.includes(b),`${f} contains ${b}`);}
});
