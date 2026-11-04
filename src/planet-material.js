import * as THREE from 'three';

// Surface coordinates remain seamless across the sphere and independent of UVs.
const vertex = `
varying vec3 vNormal,vWorld,vPos;
void main(){
 vNormal=normalize(mat3(modelMatrix)*normal);
 vWorld=(modelMatrix*vec4(position,1.)).xyz;
 vPos=normalize(position);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
}`;
const noise = `
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){return noise3(p)*.57+noise3(p*2.03+7.)*.28+noise3(p*4.1+13.)*.15;}
float coverage(float footprint,float frequency){return 1.-smoothstep(.55,1.55,footprint*frequency);}
`;
const fragment = `
uniform vec3 uColor,uLightColor,uLightPosition;
uniform float uTime,uKind,uHover,uLightEnergy;
varying vec3 vNormal,vWorld,vPos;
${noise}
void main(){
 vec3 p=normalize(vPos),baseNormal=normalize(vNormal),view=normalize(cameraPosition-vWorld);
 vec3 key=normalize(uLightPosition-vWorld);
 float footprint=length(fwidth(p));
 float terrain=fbm(p*4.2+uKind*11.);
 float fine=noise3(p*43.+uKind*7.);
 float grain=(noise3(p*130.)-.5)*coverage(footprint,130.);
 float relief=terrain,reliefScale=.0025,specularStrength=.04,specularPower=26.;
 vec3 albedo=uColor*.35,emission=vec3(0.);
 float cloudCover=0.,cloudShadow=1.;

 if(uKind<.5){
  // Deep water, continental shelves and a separate, slowly advecting cloud field.
  float shoreWidth=max(.012,footprint*.42);
  float land=smoothstep(.49-shoreWidth,.49+shoreWidth,terrain);
  float shelf=smoothstep(.40,.50,terrain);
  vec3 sea=mix(uColor*vec3(.035,.13,.25),uColor*vec3(.12,.40,.48),shelf);
  vec3 earth=mix(uColor*vec3(.23,.34,.22),mix(uColor,vec3(.68,.64,.48),.40),smoothstep(.49,.72,terrain));
  earth*=.86+(fine-.5)*.20*coverage(footprint,43.);
  albedo=mix(sea,earth,land);
  vec3 cloudDrift=vec3(uTime*.009,0.,uTime*.003);
  float cloud=fbm(p*7.5+cloudDrift+19.);
  cloudCover=smoothstep(.54,.73,cloud)*.78;
  cloudCover*=mix(.65,1.,coverage(footprint,32.));
  // A soft underlying shade makes clouds read above the surface.
  cloudShadow=1.-smoothstep(.49,.68,cloud)*.17;
  relief=mix(.46,terrain,land);
  reliefScale=.004;
  specularStrength=mix(.38,.025,land);
  specularPower=62.;
 }else if(uKind<1.5){
  // Sheared gas bands and an oval vortex on the ringed world.
  float flow=fbm(p*7.+vec3(uTime*.005,0.,0.));
  vec3 stormAxis=normalize(vec3(.73,-.22,.64));
  vec2 stormUV=vec2(dot(p,normalize(vec3(.64,0.,-.73))),p.y+.22)*vec2(1.,1.8);
  float stormMask=smoothstep(.94,.995,dot(p,stormAxis));
  float vortex=sin(length(stormUV)*108.-flow*8.)*coverage(footprint,54.);
  float bandPhase=p.y*38.+flow*4.7+stormMask*vortex*1.8;
  float bands=.5+.5*sin(bandPhase);
  bands=mix(.5,bands,coverage(footprint,38.));
  vec3 deep=uColor*vec3(.37,.25,.45);
  vec3 high=mix(uColor,vec3(.91,.78,.67),.25)*.88;
  albedo=mix(deep,high,smoothstep(.12,.9,bands));
  albedo=mix(albedo,mix(high,deep,.32+.18*vortex),stormMask*.75);
  albedo*=.84+flow*.29;
  relief=flow*.3+bands*.12;reliefScale=.0012;
  specularStrength=.035;
 }else if(uKind<2.5){
  // Pale ice plates with darker, translucent-looking fracture seams.
  float fault=abs(noise3(p*18.+terrain*2.)-.5);
  float seamWidth=max(.014,footprint*.32);
  float cracks=1.-smoothstep(.015,.015+seamWidth,fault);
  cracks*=coverage(footprint,28.);
  float frost=smoothstep(.38,.7,terrain);
  albedo=mix(uColor*vec3(.24,.47,.56),mix(uColor,vec3(.91,.96,1.),.47),.46+frost*.44);
  albedo=mix(albedo,uColor*vec3(.08,.32,.43),cracks*.66);
  relief=terrain*.30-cracks*.11+(fine-.5)*.055*coverage(footprint,43.);
  reliefScale=.004;specularStrength=.23;specularPower=42.;
 }else if(uKind<3.5){
  // Weathered mineral strata: broad folds, ridges and grain rather than bands.
  float folds=p.y*20.+terrain*11.;
  float strata=(.5+.5*sin(folds))*coverage(footprint,25.);
  float ridge=1.-abs(terrain*2.-1.);
  vec3 basalt=uColor*vec3(.19,.17,.26);
  vec3 mineral=mix(uColor,vec3(.76,.60,.48),.32)*.84;
  albedo=mix(basalt,mineral,smoothstep(.29,.72,terrain)*.72+strata*.17);
  albedo*=.84+fine*.27*coverage(footprint,43.);
  relief=terrain+strata*.055+ridge*.10;
  reliefScale=.006;specularStrength=.035;
 }else{
  // Cool volcanic crust with sparse warm fissures visible beyond the terminator.
  float fault=abs(noise3(p*15.+terrain*2.7)-.5);
  float seamWidth=max(.009,footprint*.22);
  float fissure=1.-smoothstep(.011,.011+seamWidth,fault);
  fissure*=smoothstep(.42,.64,terrain)*coverage(footprint,25.);
  albedo=mix(uColor*vec3(.075,.06,.095),uColor*vec3(.43,.32,.40),terrain);
  albedo*=.86+fine*.26*coverage(footprint,43.);
  vec3 lava=mix(vec3(.98,.23,.045),uLightColor,.12);
  emission=lava*fissure*(.34+.035*sin(uTime*.3+p.y*5.));
  relief=terrain-fissure*.12;reliefScale=.005;specularStrength=.055;
 }

 albedo*=1.+grain*.075;
 // Screen derivatives provide surface relief using samples already evaluated above.
 // Fade at distance and cap grazing-angle slopes to retain a stable silhouette.
 vec3 dpdx=dFdx(vWorld),dpdy=dFdy(vWorld);
 vec3 tangentX=cross(dpdy,baseNormal),tangentY=cross(baseNormal,dpdx);
 float det=dot(dpdx,tangentX);
 vec3 gradient=sign(det)*(dFdx(relief)*tangentX+dFdy(relief)*tangentY)/max(abs(det),.0000001);
 gradient*=reliefScale*coverage(footprint,30.);
 gradient/=max(1.,length(gradient)/.25);
 vec3 normal=normalize(baseNormal-gradient);
 float sunlight=max(dot(normal,key),0.);
 float fill=max(dot(normal,normalize(vec3(-.6,.65,1.))),0.);
 vec3 surface=albedo*(.14+sunlight*(.60+uLightEnergy*.16)+fill*.36)*cloudShadow;
 vec3 halfVector=normalize(key+view);
 float specular=pow(max(dot(normal,halfVector),0.),specularPower)*specularStrength*sunlight;
 surface+=mix(uLightColor,vec3(1.),.35)*specular;
 if(uKind<.5){
  vec3 cloudColor=mix(uColor,vec3(.91,.94,1.),.65);
  surface=mix(surface,cloudColor*(.17+sunlight*.65+fill*.30),cloudCover);
 }
 float facing=max(dot(baseNormal,view),0.);
 float rim=pow(1.-facing,4.);
 float rimLight=.32+.68*smoothstep(-.3,.6,dot(baseNormal,key));
 surface+=mix(uColor,uLightColor,.45)*rim*rimLight*(.22+uHover*.09);
 surface+=emission;
 gl_FragColor=vec4(surface,1.);
}`;
const atmosphereFragment = `
uniform vec3 uColor,uLightColor,uLightPosition;
uniform float uHover,uLightEnergy;
varying vec3 vNormal,vWorld,vPos;
void main(){
 vec3 normal=normalize(vNormal);
 float rim=pow(1.-abs(dot(normal,normalize(cameraPosition-vWorld))),3.6);
 float light=smoothstep(-.45,.75,dot(normal,normalize(uLightPosition-vWorld)));
 vec3 color=mix(uColor,uLightColor,light*.28);
 gl_FragColor=vec4(color,rim*(.13+uHover*.10)*(.55+light*(.42+uLightEnergy*.12)));
}`;

export function createPlanetMaterial(kind,color,mood,lightPosition){
 const uniforms={uColor:{value:new THREE.Color(color)},uLightColor:{value:mood.light},uLightPosition:{value:lightPosition},uKind:{value:kind},uTime:{value:0},uHover:{value:0},uLightEnergy:{value:mood.sun}};
 return {surface:new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment}),atmosphere:new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:atmosphereFragment,transparent:true,depthWrite:false,side:THREE.BackSide,blending:THREE.AdditiveBlending})};
}
