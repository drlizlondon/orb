import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPlanetPortrait} from '../src/planet-portrait.js';
import {createPlanetRing} from '../src/planet-ring.js';

test('Canvas portrait draws a cloned mesh ring as an outline without disposing the live world',()=>{
 const previousDocument=globalThis.document;
 const paths=[];
 const context={
  clearRect(){}, fillRect(){}, beginPath(){}, arc(){}, fill(){}, stroke(){},
  moveTo(x,y){paths.push([x,y]);}, lineTo(x,y){paths.push([x,y]);},
  createRadialGradient(){return {addColorStop(){}};},
 };
 globalThis.document={createElement(type){
  assert.equal(type,'canvas');
  return {getContext(kind){assert.equal(kind,'2d');return context;},toDataURL(){return 'data:image/png;base64,portrait';}};
 }};
 const group=new THREE.Group();group.position.set(4,.5,-4);group.rotation.y=.25;
 const geometry=new THREE.SphereGeometry(.3,8,6);
 const material=new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color('#c5a0ff')}}});
 const mesh=new THREE.Mesh(geometry,material);
 const ring=createPlanetRing('#c5a0ff');
 group.add(mesh,ring);
 let disposed=0;
 for(const resource of [geometry,material,ring.geometry,ring.material])resource.addEventListener('dispose',()=>disposed++);
 try {
  const result=createPlanetPortrait({isFallback:true},{group,mesh,atmosphere:null,ring});
  assert.equal(result,'data:image/png;base64,portrait');
  assert.ok(paths.length >= 129, 'ring becomes a drawn line loop');
  assert.ok(paths.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)));
  assert.deepEqual(paths.at(-1).map(v=>Math.round(v)),paths[0].map(v=>Math.round(v)),'ring outline closes');
  assert.equal(disposed,0,'live scene resources remain allocated');
  assert.equal(ring.parent,group,'original ring remains in the live scene');
 } finally {
  globalThis.document=previousDocument;
  geometry.dispose();material.dispose();ring.geometry.dispose();ring.material.dispose();
 }
});
