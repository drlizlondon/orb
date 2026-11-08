import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutPosition,layoutAll} from '../src/planet-layout.js';
import {seedTools} from '../src/tools.js';
import {projects} from '../dist/projects.js';
test('T8 layoutPosition stays in the orbit band and never crowds',()=>{
 const pts=[];for(let n=5;n<=20;n++)pts.push(layoutPosition(n));
 for(const p of pts){const r=Math.hypot(p[0],p[2]);assert.ok(r>=6.1-1e-9&&r<=8.3,`radius ${r}`);}
 for(const p of projects)pts.push(p.position);
 for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)if(i<16||j<16)assert.ok(Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1],pts[i][2]-pts[j][2])>=.6,`points ${i},${j} too close`);
});
test('seed ids keep orb positions in any order; others take slots from 5',()=>{
 const seed=seedTools(0);
 assert.deepEqual(layoutAll(seed),projects.map(p=>p.position));
 const reordered=[seed[2],{...seed[0],id:'x1'},seed[0]];
 const out=layoutAll(reordered);
 assert.deepEqual(out[0],projects[2].position);
 assert.deepEqual(out[1],layoutPosition(5));
 assert.deepEqual(out[2],projects[0].position);
});
