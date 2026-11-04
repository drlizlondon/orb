import * as THREE from 'three';

// All surface detail is evaluated per pixel in object space. There is no
// stretched image map, UV seam or fixed-resolution bitmap on the star.
const noiseGLSL = `
float hash31(vec3 p) {
  p = fract(p * .1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f*f*f*(f*(f*6.-15.)+10.);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),
    mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
    mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float value = 0., amplitude = .55;
  for(int i=0;i<4;i++) {value += amplitude*noise3(p);p=p*2.03+vec3(7.1,3.7,1.9);amplitude*=.47;}
  return value;
}`;

const vertex = `
varying vec3 vNormal, vWorld, vSurface;
void main() {
  vNormal = normalize(mat3(modelMatrix)*normal);
  vWorld = (modelMatrix*vec4(position,1.)).xyz;
  vSurface = normalize(position);
  gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;

const surfaceFragment = `
uniform vec3 uColor;
uniform float uTime, uActivity;
varying vec3 vNormal, vWorld, vSurface;
${noiseGLSL}
void main() {
  vec3 p = normalize(vSurface);
  vec3 drift = vec3(uTime*.012, -uTime*.007, uTime*.005);
  vec3 warp = vec3(noise3(p*5.+drift),noise3(p*5.+8.+drift),noise3(p*5.+17.-drift));
  float convection = fbm(p*12.+warp*2.3+drift);
  float cells = noise3(p*115.+warp*3.-drift*.6);
  float micro = noise3(p*280.+drift);
  float pixelSize = length(fwidth(p));
  cells = mix(.5,cells,1.-smoothstep(.7,1.8,pixelSize*115.));
  micro = mix(.5,micro,1.-smoothstep(.6,1.6,pixelSize*280.));
  float filaments = pow(1.-abs(noise3(p*37.+warp*4.+drift)*2.-1.),9.);
  filaments *= 1.-smoothstep(.7,1.8,pixelSize*37.);
  float activeRegion = noise3(p*7.+vec3(4.,1.,8.));
  float spots = smoothstep(.66,.79,activeRegion)*smoothstep(.44,.7,noise3(p*24.+warp));
  float detail = clamp(convection*.61 + cells*.31 + micro*.08,0.,1.);
  vec3 dark = uColor * vec3(.22,.15,.12);
  vec3 hot = mix(uColor,vec3(1.,.96,.87),.24);
  vec3 surface = mix(dark,hot,smoothstep(.22,.75,detail));
  surface *= 1.-spots*.64;
  surface += hot*filaments*.17*(.3+uActivity);
  float facing = max(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.);
  // Limb darkening preserves a spherical silhouette without a hard sticker edge.
  surface *= .28+.72*pow(facing,.34);
  surface *= .23+uActivity*.78;
  gl_FragColor = vec4(surface,1.);
}`;

const coronaFragment = `
uniform vec3 uColor;
uniform float uTime, uActivity;
varying vec3 vNormal, vWorld, vSurface;
${noiseGLSL}
void main() {
  float facing = abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld)));
  float rim = pow(1.-facing,3.4);
  float streamers = fbm(vSurface*vec3(26.,8.,26.)+vec3(uTime*.008,0.,-uTime*.004));
  float alpha = rim*(.15+streamers*.5)*(.12+uActivity*.66);
  gl_FragColor = vec4(uColor*1.2,alpha);
}`;

export function createStellarSurface({mood, compact}) {
  const uniforms = {uColor:{value:mood.light},uTime:{value:0},uActivity:{value:mood.sun}};
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(7,compact?96:192,compact?64:128),
    new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:surfaceFragment,depthWrite:true})
  );
  sphere.userData.stellarSurface = true;
  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(7.34,compact?64:128,compact?48:96),
    new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:coronaFragment,transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending})
  );
  corona.userData.stellarCorona = true;
  return {sphere,corona,update(time) {
    uniforms.uTime.value=time;
    uniforms.uActivity.value=mood.sun;
    sphere.rotation.y=time*.006;
    corona.rotation.copy(sphere.rotation);
  }};
}
