import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createGalaxyParticles} from '../src/galaxy-particles.js';

function make(dust=false) {
  let seed=421;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  const mood={tint:new THREE.Color('#b9caff')};
  const pointerLocal=new THREE.Vector3(100,0,100),galaxy=new THREE.Group();
  const material=createGalaxyParticles(2000,dust,{mood,pointerLocal,galaxy,rand});
  return {material,galaxy,mood,pointerLocal};
}

test('seeded galaxy clouds retain deterministic finite geometry and shared scene controls',()=>{
  const first=make(),second=make(),dust=make(true);
  try {
    for(const cloud of [first,second,dust]) {
      const {material,galaxy,mood,pointerLocal}=cloud;
      assert.equal(galaxy.children.length,1);
      const geometry=material.userData.points.geometry;
      for(const name of ['position','aColor','aSize','aPhase']) {
        assert.equal(geometry.getAttribute(name).count,2000);
        assert.ok(geometry.getAttribute(name).array.every(Number.isFinite));
      }
      assert.equal(material.uniforms.uTint.value,mood.tint);
      assert.equal(material.uniforms.uPointer.value,pointerLocal);
      assert.equal(material.depthWrite,false);
      const positions=geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++)assert.ok(Math.hypot(positions.getX(i),positions.getZ(i))<10,'disk stays inside the camera-fit perimeter');
    }
    assert.deepEqual(first.material.userData.points.geometry.getAttribute('position').array,second.material.userData.points.geometry.getAttribute('position').array);
  } finally {
    for(const {material} of [first,second,dust]) {material.userData.points.geometry.dispose();material.dispose();}
  }
});
