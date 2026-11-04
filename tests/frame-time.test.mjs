import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFrameClock} from '../src/frame-time.js';
import {createCameraMotion} from '../src/camera-motion.js';

test('a long visible frame advances the camera by elapsed time while limiting decorative time',()=>{
 const clock=createFrameClock(0),{elapsed,decorative}=clock.step(1000);
 assert.equal(elapsed,1);assert.equal(decorative,.15);
 const stalled=createCameraMotion(),steady=createCameraMotion();
 stalled.setProgress(1);steady.setProgress(1);
 stalled.step(elapsed);for(let i=0;i<60;i++)steady.step(1/60);
 assert.ok(Math.abs(stalled.state.progress-steady.state.progress)<1e-12);
});
test('visibility reset excludes time spent suspended from the next frame',()=>{
 const clock=createFrameClock(100);
 clock.step(120);clock.reset();
 assert.deepEqual(clock.step(60000),{elapsed:0,decorative:0});
 const next=clock.step(60016);assert.equal(next.elapsed,.016);assert.equal(next.decorative,.016);
 assert.deepEqual(clock.step(NaN),{elapsed:0,decorative:0});
});
