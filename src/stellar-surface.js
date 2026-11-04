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
// Rotated, warped scales keep the fine photosphere irregular without a lattice.
// Two value-noise samples replace the former eight-corner cellular search.
float granulation(vec3 p) {
  vec3 q = mat3(0.,.8,.6,-.8,.36,-.48,-.6,-.48,.64)*p;
  float broad = noise3(q);
  float fine = noise3(q.zxy*1.91+vec3(5.7,19.1,8.3)+(broad-.5)*.72);
  // Fold the warped field into bright interiors separated by thin, darker
  // downflow lanes. Its fine field distorts the lanes, rather than painting
  // independent rocky-looking light and dark noise patches.
  float field = broad*.78+fine*.22;
  float interior = smoothstep(.012,.085,abs(field-.5));
  return interior*(.86+fine*.14);
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
  vec3 flow = p+(warp-.5)*.10;
  float convection = fbm(flow*11.+drift);
  float pixelSize = length(fwidth(flow));
  // Spend the granule scale on detail that the visible stellar disk can
  // resolve; the former 88x field was mostly filtered out at the wide view.
  float cells = granulation(flow*64.-drift*.45);
  float micro = noise3(flow*185.+drift);
  cells = mix(.64,cells,1.-smoothstep(.55,1.5,pixelSize*105.));
  micro = mix(.5,micro,1.-smoothstep(.6,1.6,pixelSize*185.));
  float magnetic = noise3(flow*vec3(32.,24.,32.)+warp*.7+drift);
  float filaments = pow(1.-abs(magnetic*2.-1.),12.);
  filaments *= 1.-smoothstep(.6,1.5,pixelSize*32.);
  float activeRegion = noise3(flow*6.+vec3(4.,1.,8.));
  float spotField = noise3(flow*21.+warp*.35);
  // Sparse magnetic regions are softly bounded, rather than crater-like holes.
  float penumbra = smoothstep(.74,.89,activeRegion)*smoothstep(.53,.77,spotField);
  float umbra = smoothstep(.81,.94,activeRegion)*smoothstep(.64,.84,spotField);
  float heat = clamp(.41+(convection-.5)*.10+cells*.30+(micro-.5)*.055,0.,1.);
  vec3 hot = mix(uColor,vec3(1.,.96,.88),.25);
  vec3 cool = mix(uColor*vec3(.48,.39,.34),hot,.22);
  vec3 surface = mix(cool,hot,heat);
  surface *= 1.-penumbra*.20-umbra*.32;
  // Broken luminous ribbons follow active regions; broad noise no longer dominates.
  float plage = smoothstep(.52,.79,activeRegion);
  surface += hot*filaments*(.025+.045*uActivity)*(.30+plage*.70);
  surface += hot*plage*.035;
  float facing = max(dot(normalize(vNormal),normalize(cameraPosition-vWorld)),0.);
  // Keep the limb softly darker and bright-mode texture below the bloom threshold.
  surface *= .36+.64*pow(facing,.46);
  // Keep the quiet mood self-luminous while bright modes retain headroom.
  surface *= .28+uActivity*.69;
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
  float wisps = smoothstep(.26,.76,streamers);
  float alpha = rim*(.10+wisps*.38)*(.12+uActivity*.66);
  gl_FragColor = vec4(mix(uColor,vec3(1.,.96,.88),.10),alpha);
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
