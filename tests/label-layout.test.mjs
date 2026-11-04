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
test('fallback rectangles keep consistent bounds even when all space is reserved',()=>{
 const [rect]=layoutLabels([{id:0,x:200,y:500,radius:20,width:140,height:30,priority:0}],[{left:0,top:0,right:390,bottom:200}],390,200);
 assert.equal(rect.bottom-rect.top,30);assert.ok(rect.bottom<=180);
});
test('hover priority does not reorder crowded name placement',()=>{
 const names=[0,1].map(id=>({id,x:180,y:240,radius:20,width:120,height:25,priority:0}));
 const first=layoutLabels(names,[],390,844);
 const second=layoutLabels(names.map(c=>({...c,priority:c.id===1?1:0})),[],390,844,new Map(first.map(r=>[r.id,r])));
 assert.deepEqual(second.map(r=>[r.left,r.top]),first.map(r=>[r.left,r.top]));
});

test('a retained name moves clear when its planet grows underneath it',()=>{
 const c={id:0,x:300,y:300,radius:55,width:120,height:25,priority:0};
 const old={left:240,top:315,right:360,bottom:340,id:0,anchorX:300,anchorY:300};
 const [rect]=layoutLabels([c],[],800,700,new Map([[0,old]]));
 assert.ok(!intersects(rect,{left:238,top:238,right:362,bottom:362}));
});

test('a valid placement follows a one-pixel anchor change without switching to another corridor',()=>{
 const names=[{id:0,x:180,y:138,radius:20,width:130,height:25},{id:1,x:220,y:245,radius:22,width:130,height:25}];
 const old={left:115,top:324,right:245,bottom:349,id:0,anchorX:180,anchorY:137};
 const reserved=[{left:30,top:145,right:160,bottom:310}];
 const result=layoutLabels(names,reserved,390,844,new Map([[0,old]]));
 const current=result.find(r=>r.id===0);
 assert.ok(Math.hypot(current.left-old.left,current.top-old.top)<=8);
 assert.ok(result.every(rect=>!reserved.some(box=>intersects(rect,box))));
 assert.ok(!intersects(result[0],result[1]));
});


test('an obstructed retained placement projects to a nearby obstacle edge',()=>{
 const names=[{id:0,x:180,y:136,radius:20,width:130,height:25},{id:1,x:220,y:245,radius:22,width:130,height:25}];
 const old={left:115,top:317,right:245,bottom:342,id:0,anchorX:180,anchorY:137};
 const reserved=[{left:30,top:145,right:160,bottom:310}];
 const [rect]=layoutLabels(names,reserved,390,844,new Map([[0,old]]));
 assert.ok(Math.hypot(rect.left-old.left,rect.top-old.top)<=8);
 assert.ok(!reserved.some(box=>intersects(rect,box)));
});


test('a clear displaced name restores tight attachment consistently at 30, 60 and 144 Hz',()=>{
 const results=[30,60,144].map(hz=>{
  const c={id:0,x:300,y:200,radius:20,width:120,height:25};
  let rect={left:240,top:350,right:360,bottom:375,id:0,anchorX:300,anchorY:200};
  for(let frame=0;frame<hz;frame++){
   [rect]=layoutLabels([c],[],800,700,new Map([[0,rect]]),1/hz);
   assert.ok(!intersects(rect,{left:273,top:173,right:327,bottom:227}));
  }
  return rect;
 });
 for(const r of results)assert.ok(Math.abs(r.top-233)<.006);
 assert.ok(Math.abs(results[0].top-results[1].top)<1e-10);
 assert.ok(Math.abs(results[1].top-results[2].top)<1e-10);
});

test('a remote name above a planet tightens above it without crossing its surface',()=>{
 const c={id:0,x:300,y:337,radius:20,width:120,height:25};
 let rect={left:240,top:190,right:360,bottom:215,id:0,anchorX:300,anchorY:337};
 for(let i=0;i<60;i++){
  [rect]=layoutLabels([c],[],800,700,new Map([[0,rect]]),1/60);
  assert.ok(rect.bottom<=304);
 }
 assert.ok(Math.abs(rect.top-279)<.006);
});
