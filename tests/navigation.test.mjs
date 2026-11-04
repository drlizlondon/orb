import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitGalaxyDistance,advanceProgress} from '../dist/navigation.js';
test('journey gestures are bounded and reversible',()=>{assert.equal(advanceProgress(0,-500),0);assert.equal(advanceProgress(1,500),1);assert.equal(advanceProgress(advanceProgress(.4,360),-360),.4);});
test('the complete galaxy fits phone, tablet, desktop and ultrawide viewports',()=>{
 for(const [w,h] of [[320,568],[390,844],[768,1024],[1366,768],[1920,1080],[3440,1440]])for(const elevation of [.25,.6,.95]){
 const d=fitGalaxyDistance(w,h,elevation),t=Math.tan(Math.PI/8);
 for(let i=0;i<360;i++){const a=i*Math.PI/180,x=Math.cos(a)*10.0,z=Math.sin(a)*10.0,depth=d-z*Math.cos(elevation);
 assert.ok(Math.abs(x/depth/t/(w/h))<(w<600?.75:.88),`horizontal fit ${w}x${h}`);
 assert.ok(Math.abs(z*Math.sin(elevation)/depth/t)<.76,`vertical fit ${w}x${h}`);}
 }
});

import {projects} from '../dist/projects.js';
test('project destinations match the original Galaxy Cloud collection',()=>{
 assert.deepEqual(projects.map(p=>p.url),['https://bigpictureplanner.app','https://girlplanner.lovable.app','https://savemysummary.lovable.app/','https://portfoliocommander.lovable.app','https://webuildforgood.com/departure-alarm/']);
 const radii=projects.map(p=>Math.hypot(p.position[0],p.position[2]));
 assert.equal(new Set(radii.map(r=>r.toFixed(1))).size,5);
 assert.ok(radii.every(r=>r>5&&r<8.5));
});
