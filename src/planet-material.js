import * as THREE from 'three';

// Surface coordinates remain seamless across the sphere and independent of UVs.
const vertex = `
uniform vec3 uLightPosition;
varying vec3 vNormal,vWorld,vPos,vLocalLight;
void main(){
 vNormal=normalize(mat3(modelMatrix)*normal);
 vWorld=(modelMatrix*vec4(position,1.)).xyz;
 vPos=normalize(position);
 vec3 worldLight=uLightPosition-vWorld;
 // Uniformly scaled worlds: the transposed basis brings light into the same
 // seamless coordinates as the cloud field, including during card capture.
 vLocalLight=normalize(vec3(dot(modelMatrix[0].xyz,worldLight),dot(modelMatrix[1].xyz,worldLight),dot(modelMatrix[2].xyz,worldLight)));
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
varying vec3 vNormal,vWorld,vPos,vLocalLight;
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
  // A sheared weather deck stays coherent around the sphere. Rotating the
  // sampling basis and stretching its middle axis breaks value-noise cubes
  // into elongated fronts without adding a texture lookup or noise octave.
  vec3 cloudP=p;
  float cloudShear=uTime*.007+sin(p.y*3.1)*.22;
  cloudP.xz=mat2(cos(cloudShear),-sin(cloudShear),sin(cloudShear),cos(cloudShear))*cloudP.xz;
  vec3 cloudDomain=(mat3(0.,.8,.6,-.8,.36,-.48,-.6,-.48,.64)*cloudP)*vec3(17.,23.,17.)+19.;
  float cloudBroad=noise3(cloudDomain);
  float cloudWisps=noise3(cloudDomain*vec3(1.8,2.4,1.8)+7.+cloudBroad*.9);
  cloudWisps=mix(.5,cloudWisps,coverage(footprint,58.));
  float cloudEnvelope=smoothstep(.40,.80,cloudBroad);
  // Fine structure erodes the edges of larger systems instead of turning
  // every noise cell into a separate opaque patch.
  cloudCover=pow(smoothstep(.14,.88,cloudEnvelope-(1.-cloudWisps)*.28),1.2)*.55;
  // A raised cloud deck casts its broad shadow down-light. Two cloud scales
  // plus this displaced sample cost the same as the previous three-scale fbm.
  vec3 localLight=normalize(vLocalLight);
  vec3 shadowP=normalize(p+(localLight-p*dot(localLight,p))*.022);
  float shadowShear=uTime*.007+sin(shadowP.y*3.1)*.22;
  shadowP.xz=mat2(cos(shadowShear),-sin(shadowShear),sin(shadowShear),cos(shadowShear))*shadowP.xz;
  vec3 shadowDomain=(mat3(0.,.8,.6,-.8,.36,-.48,-.6,-.48,.64)*shadowP)*vec3(17.,23.,17.)+19.;
  float cloudOccluder=noise3(shadowDomain);
  cloudShadow=1.-smoothstep(.40,.80,cloudOccluder)*.14;
  relief=mix(.46,terrain,land);
  reliefScale=.004;
  specularStrength=mix(.38,.025,land);
  specularPower=62.;
 }else if(uKind<1.5){
  // Uneven latitude belts and nested wisps share the same advected flow.
  // The broad modulation avoids evenly spaced, high-contrast zebra stripes.
  vec3 gasDomain=p*vec3(7.,5.5,7.)+vec3(uTime*.005,0.,0.);
  float flow=fbm(gasDomain);
  vec3 stormAxis=normalize(vec3(.73,-.22,.64));
  vec2 stormUV=vec2(dot(p,normalize(vec3(.64,0.,-.73))),p.y+.22)*vec2(.82,1.85);
  float stormRadius=length(stormUV);
  float stormMask=(1.-smoothstep(.12,.29,stormRadius))*smoothstep(.82,.95,dot(p,stormAxis));
  float vortexPhase=stormRadius*85.-flow*9.+terrain*3.;
  float vortex=sin(vortexPhase)*(1.-smoothstep(.55,1.5,fwidth(vortexPhase)));
  float bandPhase=p.y*28.+sin(p.y*8.4+terrain*2.)*1.8+(flow-.5)*6.4;
  bandPhase+=stormMask*vortex*1.1;
  float primary=sin(bandPhase);
  float secondary=sin(bandPhase*.47+terrain*4.+flow*1.2);
  float bands=.5+primary*.31+secondary*.15;
  bands=mix(.5,bands,1.-smoothstep(.55,1.5,fwidth(bandPhase)));
  // Filter the actual warped phase to hold its texture steady during travel.
  float filamentPhase=bandPhase*4.8+fine*2.7+flow*3.5;
  float filamentVisibility=1.-smoothstep(.55,1.5,fwidth(filamentPhase));
  float filaments=sin(filamentPhase)*filamentVisibility;
  float belt=pow(1.-bands,3.);
  vec3 deep=uColor*vec3(.45,.36,.53);
  vec3 high=mix(uColor,vec3(.91,.78,.67),.19)*.82;
  albedo=mix(deep,high,smoothstep(.08,.94,bands));
  vec3 storm=mix(high,deep,.35+.13*vortex+.12*flow);
  albedo=mix(albedo,storm,stormMask*.79);
  albedo*=.86+flow*.23-belt*.05+filaments*.075*(1.-stormMask*.55);
  relief=flow*.24+bands*.09+filaments*.012;reliefScale=.001;
  specularStrength=.035;
 }else if(uKind<2.5){
  // Pale ice plates with darker, translucent-looking fracture seams.
  float fault=abs(noise3(p*vec3(16.,22.,13.)+terrain*2.)-.5);
  float seamWidth=max(.014,footprint*.32);
  float cracks=1.-smoothstep(.015,.015+seamWidth,fault);
  cracks*=coverage(footprint,28.);
  float frost=smoothstep(.38,.7,terrain);
  float polar=smoothstep(.62,.94,abs(p.y)+terrain*.10);
  albedo=mix(uColor*vec3(.24,.47,.56),mix(uColor,vec3(.91,.96,1.),.47),.46+frost*.44);
  albedo=mix(albedo,uColor*vec3(.08,.32,.43),cracks*.66);
  albedo=mix(albedo,mix(uColor,vec3(.94,.97,1.),.65),polar*.23);
  relief=terrain*.30-cracks*.11+(fine-.5)*.055*coverage(footprint,43.);
  reliefScale=.004;specularStrength=.23;specularPower=42.;
 }else if(uKind<3.5){
  // Weathered mineral strata: broad folds, ridges and grain rather than bands.
  float folds=p.y*20.+terrain*11.;
  float strata=(.5+.5*sin(folds))*coverage(footprint,25.);
  float ridge=1.-abs(terrain*2.-1.);
  // Reuse the fine field for fractured mineral shelves and shallow stone relief.
  float fineVisibility=coverage(footprint,43.);
  float mineralRidge=1.-abs(fine*2.-1.);
  float seamWidth=max(.018,fwidth(fine)*1.5);
  float seams=(1.-smoothstep(.018,.018+seamWidth,abs(fine-.47)))*fineVisibility;
  vec3 basalt=uColor*vec3(.19,.17,.26);
  vec3 mineral=mix(uColor,vec3(.76,.60,.48),.32)*.84;
  albedo=mix(basalt,mineral,smoothstep(.29,.72,terrain)*.72+strata*.17);
  albedo*=.975+(fine-.5)*.27*fineVisibility;
  albedo*=1.-seams*.13;
  relief=terrain+strata*.055+ridge*.10;
  relief+=mineralRidge*.12*fineVisibility-seams*.025+grain*.025;
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
 // A restrained cool fill retains the unlit side without flattening the
 // terminator. Star-tinted direct light supplies the material's main shape.
 vec3 directLight=mix(vec3(1.),uLightColor,.18)*sunlight*(.72+uLightEnergy*.16);
 vec3 surface=albedo*(vec3(.14+fill*.29)+directLight)*cloudShadow;
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
