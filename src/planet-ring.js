import * as THREE from 'three';
// One translucent particulate ring. Its inner edge sits clear of the planet.
export function createPlanetRing(color){
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
  uniforms:{uColor:{value:new THREE.Color(color)},uOpacity:{value:.32}},
  vertexShader:`varying vec3 vLocal;void main(){vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform vec3 uColor;uniform float uOpacity;varying vec3 vLocal;void main(){float r=length(vLocal.xy);float t=(r-.42)/.30;float fade=smoothstep(0.,.09,t)*(1.-smoothstep(.87,1.,t));float coverage=1.-smoothstep(.5,1.5,fwidth(r)*230.);float grain=.74+(.16*sin(r*230.)+.10*sin(r*99.+1.7))*coverage;float gap=1.-.67*exp(-pow((t-.54)/.026,2.));float backlight=.72+.28*max(0.,vLocal.y/.72);gl_FragColor=vec4(uColor*backlight,uOpacity*fade*grain*gap);}`});
 // Retain the same simple material controls used by the scene's mood/hover loop.
 material.color=material.uniforms.uColor.value;
 Object.defineProperty(material,'opacity',{get(){return this.uniforms.uOpacity.value;},set(v){this.uniforms.uOpacity.value=v;}});
 const ring=new THREE.Mesh(new THREE.RingGeometry(.42,.72,128),material);
 ring.rotation.x=-Math.PI/2;ring.rotation.z=.25;return ring;
}
