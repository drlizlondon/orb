import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTouchGestureGate} from '../src/touch-gesture.js';
import {createCameraMotion} from '../src/camera-motion.js';
const touch=(identifier,clientX)=>({identifier,clientX});
const event=(type,touches)=>({type,touches});

test('a released finger never repeats Lenis lastDelta into camera travel',()=>{
 const gate=createTouchGestureGate(),motion=createCameraMotion({progress:.3});
 const start=event('touchstart',[touch(1,20)]);
 gate.update(start);assert.equal(gate.shouldZoom(start),false);
 const move=event('touchmove',[touch(1,20)]);
 if(gate.shouldZoom(move))motion.queueScroll(120);
 const end=event('touchend',[]);gate.update(end);
 if(gate.shouldZoom(end))motion.queueScroll(120);
 motion.step(1/60,true);
 assert.equal(motion.state.progress,.35);
});

test('two-finger orbit cannot become zoom until every finger is lifted',()=>{
 const gate=createTouchGestureGate();
 gate.update(event('touchstart',[touch(1,20)]));
 assert.equal(gate.shouldZoom(event('touchmove',[touch(1,25)])),true);
 gate.update(event('touchstart',[touch(1,25),touch(2,70)]));
 assert.equal(gate.shouldZoom(event('touchmove',[touch(1,35),touch(2,80)])),false);
 gate.update(event('touchend',[touch(2,80)]));
 assert.equal(gate.shouldZoom(event('touchend',[touch(2,80)])),false);
 assert.equal(gate.shouldZoom(event('touchmove',[touch(2,95)])),false);
 gate.update(event('touchend',[]));
 gate.update(event('touchstart',[touch(3,30)]));
 assert.equal(gate.shouldZoom(event('touchmove',[touch(3,40)])),true);
});

test('orbit follows a stable finger and rebases when it leaves',()=>{
 const gate=createTouchGestureGate();
 gate.update(event('touchstart',[touch(1,20),touch(2,70)]));
 assert.equal(gate.orbitDelta(event('touchmove',[touch(1,32),touch(2,82)])),12);
 // A reordered TouchList must still follow identifier 1.
 assert.equal(gate.orbitDelta(event('touchmove',[touch(2,90),touch(1,40)])),8);
 gate.update(event('touchstart',[touch(1,40),touch(2,90),touch(3,140)]));
 gate.update(event('touchend',[touch(2,90),touch(3,140)]));
 assert.equal(gate.orbitDelta(event('touchmove',[touch(2,96),touch(3,146)])),6);
});

test('cancellation resets the gesture only after remaining fingers leave',()=>{
 const gate=createTouchGestureGate();
 gate.update(event('touchstart',[touch(1,20),touch(2,70)]));
 gate.update(event('touchcancel',[touch(2,70)]));
 assert.equal(gate.shouldZoom(event('touchmove',[touch(2,75)])),false);
 gate.update(event('touchcancel',[]));
 gate.update(event('touchstart',[touch(3,20)]));
 assert.equal(gate.shouldZoom(event('touchmove',[touch(3,25)])),true);
 assert.equal(gate.orbitDelta(event('touchmove',[touch(3,25)])),0);
 assert.equal(gate.shouldZoom({type:'wheel'}),true);
});
