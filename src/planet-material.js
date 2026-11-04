import * as THREE from 'three';

const vertex = `varying vec3 vNormal,vWorld,vPos;void main(){vNormal=normalize(mat3(modelMatrix)*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;vPos=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const noise = `float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}float fbm(vec3 p){return noise3(p)*.57+noise3(p*2.03+7.)*.28+noise3(p*4.1+13.)*.15;}`;
const fragment = `
uniform vec3 uColor,uLightColor,uLightPosition;
uniform float uTime,uKind,uHover;
varying vec3 vNormal,vWorld,vPos;
${noise}
void main(){
 vec3 p=normalize(vPos),n=normalize(vNormal),view=normalize(cameraPosition-vWorld);
 float terrain=fbm(p*5.+uKind*11.);
 float clouds=fbm(p*8.+vec3(uTime*.012,0.,0.));
 float grain=noise3(p*120.);
 grain=mix(.5,grain,1.-smoothstep(.7,1.7,length(fwidth(p))*120.));
 float pattern=terrain;
 // Five related worlds: archipelago, bands, ice, mineral folds and volcanic rifts.
 if(uKind<.5)pattern=smoothstep(.39,.65,terrain)*.72+clouds*.2;
 else if(uKind<1.5)pattern=.35+.45*sin(p.y*28.+clouds*6.)*.5+clouds*.28;
 else if(uKind<2.5)pattern=.64+terrain*.22-pow(1.-abs(noise3(p*19.)*2.-1.),12.)*.4;
 else if(uKind<3.5)pattern=terrain*.62+sin(p.y*12.+terrain*8.)*.14+.22;
 else pattern=terrain*.55+pow(1.-abs(noise3(p*15.)*2.-1.),10.)*.4;
 pattern=clamp(pattern+(grain-.5)*.09,0.,1.);
 vec3 surface=mix(uColor*.12,mix(uColor,vec3(.9,.91,.96),.2),pattern);
 vec3 key=normalize(uLightPosition-vWorld);
 float sunlight=max(dot(n,key),0.);
 float fill=max(dot(n,normalize(vec3(-.6,.65,1.))),0.);
 surface*=.18+sunlight*.6+fill*.44;
 float rim=pow(1.-max(dot(n,view),0.),3.5);
 surface+=mix(uColor,uLightColor,.48)*rim*(.38+uHover*.18);
 if(uKind>3.5)surface+=uColor*pow(max(0.,pattern-.66)*3.,2.)*.28;
 gl_FragColor=vec4(surface,1.);
}`;
const atmosphereFragment = `uniform vec3 uColor;uniform float uHover;varying vec3 vNormal,vWorld,vPos;void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(cameraPosition-vWorld))),3.2);gl_FragColor=vec4(uColor,rim*(.2+uHover*.23));}`;

export function createPlanetMaterial(kind,color,mood,lightPosition){
 const uniforms={uColor:{value:new THREE.Color(color)},uLightColor:{value:mood.light},uLightPosition:{value:lightPosition},uKind:{value:kind},uTime:{value:0},uHover:{value:0}};
 return {surface:new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment}),atmosphere:new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:atmosphereFragment,transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending})};
}
