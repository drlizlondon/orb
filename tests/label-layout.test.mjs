import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutLabels} from '../dist/label-layout.js';
const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
test('clustered names stay inside the phone viewport and clear the hero and signature',()=>{
 const reserved=[{left:22,top:145,right:205,bottom:310},{left:20,top:760,right:370,bottom:810}];
 const names=Array.from({length:5},(_,id)=>({id,x:130+id*22,y:220+id*45,radius:20,width:128,height:28,priority:id===2?1:0}));
 const result=layoutLabels(names,reserved,390,844);
 assert.equal(result.length,5);
 for(const rect of result){assert.ok(rect.left>=12&&rect.right<=378&&rect.top>=86&&rect.bottom<=824);assert.ok(!reserved.some(box=>intersects(rect,box)));}
 for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++)assert.ok(!intersects(result[i],result[j]));
});
test('a clear name stays directly beneath its planet',()=>{
 const [rect]=layoutLabels([{id:0,x:600,y:400,radius:30,width:140,height:22,priority:0}],[],1366,768);
 assert.equal(rect.left,530);assert.equal(rect.top,443);
});
