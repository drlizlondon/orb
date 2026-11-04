import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createMoods,moods} from '../src/moods.js';

test('enabling reduced motion settles the current mood transition immediately',t=>{
 const previousDocument=globalThis.document;
 t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
 const handlers={},preferenceHandlers=[],tweens=[];
 const label={textContent:''};
 const button={querySelector:()=>label,setAttribute(){},addEventListener:(name,callback)=>{handlers[name]=callback;}};
 globalThis.document={querySelector:()=>button,documentElement:{dataset:{},style:{setProperty(){}}},addEventListener(){}};
 const reduced={matches:false,addEventListener:(_name,callback)=>preferenceHandlers.push(callback)};
 const gsap={to(target,options){
  tweens.push({target,options});
  if(options.duration===0)for(const [key,value] of Object.entries(options))if(!['duration','ease','overwrite'].includes(key))target[key]=value;
 }};
 const state=createMoods(THREE,gsap,reduced,()=>false);
 handlers.click();
 assert.equal(label.textContent,'Dusk');
 assert.ok(tweens.slice(-4).every(({options})=>options.duration>0));
 // An intermediate rendered state while the existing transition is in flight.
 state.sun=.14;state.background.lerp(new THREE.Color(moods[1].background),.3);
 reduced.matches=true;preferenceHandlers.forEach(callback=>callback({matches:true}));
 assert.equal(label.textContent,'Dusk');
 assert.equal(document.documentElement.dataset.mood,'dusk');
 assert.ok(tweens.slice(-4).every(({options})=>options.duration===0&&options.overwrite===true));
 for(const key of ['background','light','tint'])assert.equal(state[key].getHexString(),new THREE.Color(moods[1][key]).getHexString());
 for(const key of ['speed','warmth','sun'])assert.equal(state[key],moods[1][key]);
});

test('pause settles an in-flight mood and future mood selections are immediate until resumed',t=>{
 const previousDocument=globalThis.document;
 t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
 const handlers={},tweens=[];
 const label={textContent:''};
 const button={querySelector:()=>label,setAttribute(){},addEventListener:(name,callback)=>{handlers[name]=callback;}};
 globalThis.document={querySelector:()=>button,documentElement:{dataset:{},style:{setProperty(){}}},addEventListener(){}};
 const reduced={matches:false,addEventListener(){}};
 const gsap={to(target,options){tweens.push({target,options});if(options.duration===0)for(const[key,value]of Object.entries(options))if(!['duration','ease','overwrite'].includes(key))target[key]=value;}};
 const state=createMoods(THREE,gsap,reduced,()=>false);
 handlers.click();state.sun=.15;state.setPaused(true);
 assert.equal(state.sun,moods[1].sun);
 assert.ok(tweens.slice(-4).every(({options})=>options.duration===0));
 handlers.click();assert.equal(label.textContent,'Evening');assert.equal(state.sun,moods[2].sun);
 assert.ok(tweens.slice(-4).every(({options})=>options.duration===0));
 state.setPaused(false);handlers.click();assert.equal(label.textContent,'Day');
 assert.ok(tweens.slice(-4).every(({options})=>options.duration===2.1));
});
