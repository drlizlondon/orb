import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPlanetRing} from '../src/planet-ring.js';
import {createPlanetMaterial} from '../src/planet-material.js';

test('ring shares the planet light so mood and star changes stay synchronized',()=>{
 const light=new THREE.Vector3(25,4,-48);
 const mood={light:new THREE.Color('#9894ff'),sun:.08};
 const planet=createPlanetMaterial(1,'#c5a0ff',mood,light);
 const ring=createPlanetRing('#c5a0ff',{lighting:planet.surface.uniforms,planetRadius:.294});
 try {
  for(const name of ['uLightPosition','uLightColor','uLightEnergy']) {
   assert.equal(ring.material.uniforms[name],planet.surface.uniforms[name]);
  }
  light.set(23,1,-38);
  mood.light.set('#ffe6a8');
  planet.surface.uniforms.uLightEnergy.value=.95;
  assert.deepEqual(ring.material.uniforms.uLightPosition.value.toArray(),[23,1,-38]);
  assert.equal(ring.material.uniforms.uLightColor.value.getHexString(),'ffe6a8');
  assert.equal(ring.material.uniforms.uLightEnergy.value,.95);
  assert.equal(ring.material.uniforms.uPlanetRadius.value,.294);
  ring.material.opacity=.58;
  assert.equal(ring.material.uniforms.uOpacity.value,.58);
  ring.material.color.set('#efb9df');
  assert.equal(ring.material.uniforms.uColor.value.getHexString(),'efb9df');
 } finally {
  ring.geometry.dispose();ring.material.dispose();
  planet.surface.dispose();planet.atmosphere.dispose();
 }
});
