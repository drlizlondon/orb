import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCameraMotion,compactFramingWeight} from '../src/camera-motion.js';
const near=(actual,expected,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≈ ${expected}`);

test('camera response agrees across 30, 60 and 144 Hz without stacked smoothing',()=>{
 const values=[30,60,144].map(hz=>{
  const motion=createCameraMotion({fitDistance:20});
  motion.setProgress(.8);motion.setInspection(true);motion.setProgress(.8);
  motion.setOrbit(.7,.3);motion.setFraming(28,1);
  for(let frame=0;frame<hz;frame++)motion.step(1/hz);
  return motion.state;
 });
 for(const key of Object.keys(values[0])) {near(values[0][key],values[1][key]);near(values[1][key],values[2][key]);}
 assert.ok(values[0].progress>.79);
});

test('same-direction wheel bursts are coalesced into one frame target',()=>{
 const burst=createCameraMotion({progress:.2}),single=createCameraMotion({progress:.2});
 burst.queueScroll(40);burst.queueScroll(90);burst.queueScroll(110);
 single.queueScroll(240);
 assert.equal(burst.state.progress,.2,'input does not mutate the rendered state');
 burst.step(1/60);single.step(1/60);
 assert.deepEqual(burst.state,single.state);near(burst.targets.progress,.3);
});

test('a reversed gesture discards the unrendered tail and moves in the requested direction',()=>{
 const motion=createCameraMotion({progress:.4});
 motion.queueScroll(900);motion.step(.08);
 const before=motion.state.progress;
 assert.ok(motion.targets.progress>before);
 motion.queueScroll(-120);motion.step(1/60);
 assert.ok(motion.state.progress<before);
 assert.ok(motion.targets.progress<before);
});

test('zoom limits have no overscroll debt and invalid input leaves the camera finite',()=>{
 const motion=createCameraMotion({progress:1});
 motion.queueScroll(100000);motion.step(1/60);
 assert.equal(motion.state.progress,1);
 motion.queueScroll(-120);motion.step(1/60);
 assert.ok(motion.state.progress<1);
 motion.queueScroll(NaN);motion.setProgress(Infinity);motion.step(NaN);
 assert.ok(Object.values(motion.state).every(Number.isFinite));
 motion.setProgress(-10,true);assert.equal(motion.state.progress,0);
});

test('inspection holds the visible framing and reverses continuously',()=>{
 const motion=createCameraMotion({progress:.4});
 motion.queueScroll(900);motion.step(.1);
 const visible=motion.state.progress;
 motion.setInspection(true);assert.equal(motion.targets.progress,visible);
 motion.step(.4);assert.equal(motion.state.progress,visible);
 const focus=motion.state.focus;
 motion.setInspection(false);assert.equal(motion.state.focus,focus,'retargeting never jumps position');
 for(let i=0;i<180;i++)motion.step(1/60);
 near(motion.state.focus,0,1e-5);assert.equal(motion.state.progress,visible);
});

test('resize updates only framing targets and reduced motion settles pending input immediately',()=>{
 const motion=createCameraMotion({fitDistance:20});
 motion.setFraming(38,1);
 assert.equal(motion.state.fitDistance,20);
 motion.step(1/60);assert.ok(motion.state.fitDistance>20&&motion.state.fitDistance<38);
 motion.queueScroll(600);motion.setInspection(true);motion.queueScroll(240);
 motion.setOrbit(1,.8);motion.step(1/60,true);
 assert.deepEqual(motion.state,motion.targets);
 assert.equal(motion.state.compact,1);assert.equal(motion.state.tilt,.35);
 const settled={...motion.state};motion.step(1/60);assert.deepEqual(motion.state,settled);
});

test('phone close framing fades continuously through the former .75 switch',()=>{
 near(compactFramingWeight(0),1);near(compactFramingWeight(1),0);
 assert.ok(Math.abs(compactFramingWeight(.750001)-compactFramingWeight(.749999))<.00002);
 assert.equal(compactFramingWeight(.6,0),0);
 near(compactFramingWeight(.6,.5),compactFramingWeight(.6)*.5);
});

// This mirrors the caller's pose contract: snapshot what is rendered and apply
// one blend to the new destination, including an interrupted return.
test('a new inspection can restart from the rendered pose during return without a jump',()=>{
 const motion=createCameraMotion();
 let pose=[0,6,12],anchor=[...pose],destination=[5,2,3];
 const render=()=>pose=anchor.map((value,i)=>value+(destination[i]-value)*motion.state.transition);
 motion.setInspection(true);motion.step(.25);render();
 const firstPose=[...pose];
 anchor=[...pose];destination=[0,6,12];motion.setInspection(false);render();
 assert.deepEqual(pose,firstPose);
 motion.step(.18);render();
 const returningPose=[...pose],returningFocus=motion.state.focus;
 anchor=[...pose];destination=[-4,1,-3];motion.setInspection(true);render();
 assert.deepEqual(pose,returningPose);
 assert.equal(motion.state.focus,returningFocus);
 motion.step(1/60);render();
 assert.ok(pose.every(Number.isFinite));
 assert.ok(Math.hypot(...pose.map((value,i)=>value-returningPose[i]))<.15);
 for(let i=0;i<180;i++)motion.step(1/60);render();
 for(let i=0;i<3;i++)near(pose[i],destination[i],.0001);
});
