import * as THREE from 'three';

// One translucent particulate ring. The optional lighting uniforms belong to
// the planet, so its ring follows the same moving star and mood transition.
export function createPlanetRing(color, {lighting, planetRadius = .294} = {}) {
 const material = new THREE.ShaderMaterial({
  transparent:true, depthWrite:false, side:THREE.DoubleSide,
  uniforms:{
   uColor:{value:new THREE.Color(color)}, uOpacity:{value:.32},
   uPlanetRadius:{value:planetRadius},
   uLightPosition:lighting?.uLightPosition || {value:new THREE.Vector3(25,4,-48)},
   uLightColor:lighting?.uLightColor || {value:new THREE.Color('#9894ff')},
   uLightEnergy:lighting?.uLightEnergy || {value:.08},
  },
  vertexShader:`
   uniform float uPlanetRadius;
   varying vec3 vLocal,vWorld,vNormal,vCenter;
   varying float vPlanetRadius;
   void main(){
    vLocal=position;
    vWorld=(modelMatrix*vec4(position,1.)).xyz;
    vNormal=normalize(mat3(modelMatrix)*normal);
    vCenter=(modelMatrix*vec4(0.,0.,0.,1.)).xyz;
    vPlanetRadius=uPlanetRadius*length(modelMatrix[0].xyz);
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
   }`,
  fragmentShader:`
   uniform vec3 uColor,uLightColor,uLightPosition;
   uniform float uOpacity,uLightEnergy;
   varying vec3 vLocal,vWorld,vNormal,vCenter;
   varying float vPlanetRadius;
   void main(){
    float r=length(vLocal.xy),t=(r-.42)/.30;
    float fade=smoothstep(0.,.09,t)*(1.-smoothstep(.87,1.,t));
    float coverage=1.-smoothstep(.5,1.5,fwidth(r)*230.);
    float grain=.74+(.16*sin(r*230.)+.10*sin(r*99.+1.7))*coverage;
    // Filter the narrow division as well as the fine bands at small sizes.
    float gapWidth=max(.026,fwidth(t)*.65);
    float gap=1.-.67*(.026/gapWidth)*exp(-pow((t-.54)/gapWidth,2.));

    vec3 key=normalize(uLightPosition-vWorld);
    vec3 view=normalize(cameraPosition-vWorld);
    float incidence=abs(dot(normalize(vNormal),key));
    float scattering=pow(max(dot(-key,view),0.),3.);
    float illumination=.52+.30*sqrt(incidence)+.18*scattering;

    // The sphere blocks rays toward the star. Deriving its world-space center
    // and radius from this ring's transform keeps the shadow attached while
    // the galaxy rotates and while the planet grows during inspection.
    vec3 toCenter=vCenter-vWorld;
    float along=dot(toCenter,key);
    float separation=length(toCenter-key*max(along,0.));
    float penumbra=max(vPlanetRadius*.10,fwidth(separation)*1.5);
    float shadow=(1.-smoothstep(vPlanetRadius-penumbra,vPlanetRadius+penumbra,separation))*step(0.,along);
    illumination*=1.-shadow*.70;
    illumination*=.88+.12*clamp(uLightEnergy,0.,1.);
    vec3 color=mix(uColor,uLightColor,.12)*illumination;
    gl_FragColor=vec4(color,uOpacity*fade*grain*gap);
   }`,
 });
 // Retain the material controls used by the scene's mood/hover loop.
 material.color=material.uniforms.uColor.value;
 Object.defineProperty(material,'opacity',{get(){return this.uniforms.uOpacity.value;},set(v){this.uniforms.uOpacity.value=v;}});
 const ring=new THREE.Mesh(new THREE.RingGeometry(.42,.72,128),material);
 ring.rotation.x=-Math.PI/2;ring.rotation.z=.25;
 return ring;
}
