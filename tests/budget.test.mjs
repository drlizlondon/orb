import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderBudget} from '../src/budget.js';
test('T2 renderBudget returns the spec columns exactly',()=>{
 assert.deepEqual(renderBudget({lite:false,fallback:false}),{stars:118000,dust:3600,maxPixelRatio:1.8,sphereSegments:[96,64],foregroundStars:260,bloom:true,maxPlanets:12});
 assert.deepEqual(renderBudget({lite:true,fallback:false}),{stars:24000,dust:800,maxPixelRatio:1.25,sphereSegments:[40,28],foregroundStars:80,bloom:false,maxPlanets:8});
 const fb=renderBudget({lite:false,fallback:true});
 assert.equal(fb.stars,22000);assert.equal(fb.dust,600);
 assert.equal(fb.maxPixelRatio,1.8);assert.equal(fb.maxPlanets,12);
});
test('renderBudget results are independent copies',()=>{
 const a=renderBudget({});a.sphereSegments[0]=1;
 assert.equal(renderBudget({}).sphereSegments[0],96);
});
