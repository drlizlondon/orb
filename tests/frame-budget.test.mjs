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
