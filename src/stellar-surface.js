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
  for(int i=0;i<3;i++) {value += amplitude*noise3(p);p=p*2.03+vec3(7.1,3.7,1.9);amplitude*=.47;}
  return value;
}
// Eight jittered cell corners give the photosphere rounded convective granules.
// The fixed small search replaces another high-frequency fractal octave.
float granulation(vec3 p) {
  vec3 cell = floor(p), f = fract(p);
  float nearest = 4.;
  for(int z=0;z<2;z++) for(int y=0;y<2;y++) for(int x=0;x<2;x++) {
    vec3 corner = vec3(float(x),float(y),float(z));
    vec3 id = cell + corner;
    vec3 jitter = vec3(hash31(id),hash31(id+13.7),hash31(id+31.3));
    vec3 d = f - corner - (jitter-.5)*.28;
    nearest = min(nearest,dot(d,d));
  }
  return 1.-smoothstep(.18,.72,sqrt(nearest));
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
  // Differential advection keeps the plasma flowing across latitude bands.
  float shear = uTime*.002*(1.-p.y*p.y);
  p.xz = mat2(cos(shear),-sin(shear),sin(shear),cos(shear))*p.xz;
  vec3 drift = vec3(uTime*.009, -uTime*.005, uTime*.003);
  vec3 warp = vec3(noise3(p*4.8+drift),noise3(p*4.8+8.+drift),noise3(p*4.8+17.-drift));
  vec3 flow = p+(warp-.5)*.13;
  float convection = fbm(flow*11.+drift);
  float pixelSize = length(fwidth(flow));
  float cells = granulation(flow*74.-drift*.45);
  float micro = noise3(flow*185.+drift);
  cells = mix(.5,cells,1.-smoothstep(.55,1.5,pixelSize*74.));
  micro = mix(.5,micro,1.-smoothstep(.6,1.6,pixelSize*185.));
  float magnetic = noise3(flow*32.+warp*.7+drift);
  float filaments = pow(1.-abs(magnetic*2.-1.),10.);
  filaments *= 1.-smoothstep(.6,1.5,pixelSize*32.);
  float activeRegion = noise3(flow*6.+vec3(4.,1.,8.));
  float spotField = noise3(flow*21.+warp*.35);
  float penumbra = smoothstep(.64,.8,activeRegion)*smoothstep(.42,.67,spotField);
  float umbra = smoothstep(.72,.84,activeRegion)*smoothstep(.54,.75,spotField);
  float heat = clamp(.16+convection*.58+cells*.22+(micro-.5)*.07,0.,1.);
  vec3 cool = uColor*vec3(.3,.23,.2);
  vec3 hot = mix(uColor,vec3(1.,.96,.87),.16);
  vec3 surface = mix(cool,hot,heat);
  surface *= 1.-penumbra*.28-umbra*.48;
  surface += hot*filaments*(.035+.065*uActivity)*(.45+activeRegion);
  float facing = max(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.);
  // Keep the limb softly darker and bright-mode texture below the bloom threshold.
  surface *= .25+.75*pow(facing,.38);
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
  float rim = pow(1.-facing,2.8)*smoothstep(0.,.2,facing);
  float streamers = fbm(vSurface*vec3(26.,8.,26.)+vec3(uTime*.008,0.,-uTime*.004));
  float alpha = rim*(.12+streamers*.46)*(.12+uActivity*.66);
  gl_FragColor = vec4(uColor*1.08,alpha);
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
