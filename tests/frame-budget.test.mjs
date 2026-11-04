import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFrameBudget} from '../src/frame-budget.js';

function setup(ratio){
 const scales=[],budgets=[];
 const renderer={domElement:{dataset:{}},getPixelRatio:()=>ratio,setPixelRatio:value=>{ratio=value;scales.push(value);}};
 const record=createFrameBudget(renderer,{setPixelRatio(){}},(scale,budget)=>budgets.push(budget),true);
 return {record,renderer,scales,budgets};
}
test('adaptation never raises an initial sub-one pixel ratio',()=>{
 const s=setup(.75);for(let i=0;i<285;i++)s.record(45);
 assert.equal(s.renderer.getPixelRatio(),.75);assert.equal(s.budgets[0],.85);
});
test('sustained long visible frames remain measurable and trigger adaptation',()=>{
 const s=setup(1.8);for(let i=0;i<285;i++)s.record(2800);
 assert.equal(s.renderer.domElement.dataset.frameMedianMs,'2800.00');assert.equal(s.renderer.getPixelRatio(),1.6);
});
test('steady frames preserve resolution and particle budget',()=>{
 const s=setup(1.5);for(let i=0;i<400;i++)s.record(16.7);
 assert.equal(s.renderer.getPixelRatio(),1.5);assert.equal(s.scales.length,0);
});

test('quality recovers particles before resolution after sustained healthy frames',()=>{
 const s=setup(1.2);
 // Two slow windows lower DPR, then two more lower the particle budget.
 for(let i=0;i<570;i++)s.record(40);
 assert.equal(s.renderer.getPixelRatio(),1);
 assert.equal(s.budgets.at(-1),.85);
 for(let i=0;i<1005;i++)s.record(16);
 assert.equal(s.budgets.at(-1),1);
 assert.equal(s.renderer.getPixelRatio(),1);
 for(let i=0;i<1005;i++)s.record(16);
 assert.equal(s.renderer.getPixelRatio(),1.1);
 for(let i=0;i<2010;i++)s.record(16);
 assert.equal(s.renderer.getPixelRatio(),1.2);
 assert.equal(s.budgets.at(-1),1);
});

test('recovery never exceeds a low initial pixel ratio or full particle budget',()=>{
 const s=setup(.75);
 for(let i=0;i<285;i++)s.record(40);
 for(let i=0;i<2500;i++)s.record(16);
 assert.equal(s.renderer.getPixelRatio(),.75);
 assert.equal(s.budgets.at(-1),1);
});

test('intermittent healthy windows do not trigger recovery',()=>{
 const s=setup(1.2);
 for(let i=0;i<285;i++)s.record(40);
 for(let cycle=0;cycle<3;cycle++){
  for(let i=0;i<7*120+45;i++)s.record(16);
  for(let i=0;i<120;i++)s.record(22);
 }
 assert.equal(s.renderer.getPixelRatio(),1);
 assert.equal(s.scales.length,1);
});
