import * as THREE from 'three';

const RADIUS = 9.6;
const ARM_PHASE = [0, .12, -.08, .045];
const ARM_PITCH = [.69, .675, .704, .685];

// Two point clouds remain the whole luminous disk. Arm density and dark lanes
// are baked once, so the extra structure costs no texture or rendering pass.
export function createGalaxyParticles(count, dust, {mood, pointerLocal, galaxy, rand = Math.random, gaussian}) {
  const normal = gaussian || (() => Math.sqrt(-2 * Math.log(Math.max(rand(), .00001))) * Math.cos(Math.PI * 2 * rand()));
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const arm = i % 4;
    // Broad irregular concentrations interrupt the formerly uniform pinwheel.
    let r = Math.pow(rand(), .75) * RADIUS;
    for (let attempt = 0; attempt < 3; attempt++) {
      const density = .74 + .17 * Math.sin(r * 1.23 + arm * 2.1) + .08 * Math.sin(r * 2.87 - arm * .7);
      if (rand() < density) break;
      r = Math.pow(rand(), .75) * RADIUS;
    }
    const cluster = rand() < .055;
    if (cluster) {
      const center = [2.65, 5.0, 7.25][Math.floor(rand() * 3)] + Math.sin(arm * 2.3) * .35;
      r = THREE.MathUtils.clamp(center + normal() * .19, .06, RADIUS);
    }
    const radial = r / RADIUS;
    const filament = i % 5 === 0;
    const width = cluster ? .052 : filament ? .04 + .085 * radial : .12 + .34 * radial;
    const spread = normal() * width;
    const meander = Math.sin(r * 1.13 + arm * 1.7) * .045 + Math.sin(r * 2.3 - arm) * .018;
    const armAngle = arm * Math.PI / 2 + ARM_PHASE[arm] + r * ARM_PITCH[arm] + meander;
    const scattered = !cluster && rand() < .13;
    const angle = scattered ? rand() * Math.PI * 2 : armAngle + spread;
    const radius = scattered ? r * .94 : r;
    positions[i * 3] = Math.cos(angle) * radius + normal() * .055;
    positions[i * 3 + 1] = normal() * (dust ? .11 + .14 * radial : .045 + Math.exp(-r * .6) * .32) + Math.sin(angle * 2 + r) * .026;
    positions[i * 3 + 2] = Math.sin(angle) * radius + normal() * .055;

    const hot = Math.exp(-r * .6);
    const temperature = rand();
    color.setRGB(.28 + hot * .65 + temperature * .12, .35 + hot * .58 + temperature * .13, .80 + hot * .2);
    if (arm % 2 === 0 && r > 2) color.setRGB(.29 + hot * .6, .47 + hot * .4, .94);
    const laneCenter = .12 + .025 * Math.sin(r * 1.6 + arm);
    const laneWidth = .045 + .027 * radial;
    const lane = scattered ? 0 : Math.exp(-Math.pow((spread - laneCenter) / laneWidth, 2)) * THREE.MathUtils.smoothstep(r, 1.3, 2.7);
    const outskirts = 1 - THREE.MathUtils.smoothstep(r, 7.6, RADIUS) * .72;
    const patch = .88 + .12 * Math.sin(r * 1.35 + arm * 1.9);
    const brilliance = rand();
    const luminosity = dust ? .92 : .43 + Math.pow(brilliance, .65) * .91;
    color.multiplyScalar(luminosity * patch * outskirts * (1 - lane * (dust ? .62 : .44)));
    colors.set([color.r, color.g, color.b], i * 3);
    // Fine unresolved stars dominate; a small tail gives the disk punctuation.
    sizes[i] = dust ? .85 + rand() * 1.45 : .044 + Math.pow(rand(), 7) * .19 + (brilliance > .988 ? .055 : 0);
    phases[i] = rand() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const material = createGalaxyParticleMaterial(dust, {mood, pointerLocal});
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  galaxy.add(points);
  material.userData.points = points;
  return material;
}

export function createGalaxyParticleMaterial(dust, {mood, pointerLocal}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: {value: 0}, uHero: {value: 1}, uPointer: {value: pointerLocal},
      uPointerStrength: {value: 0}, uPixelRatio: {value: 1}, uPalette: {value: 0},
      uTint: {value: mood.tint}, uAlpha: {value: dust ? .034 : .66},
    },
    vertexShader: `
      attribute float aSize,aPhase;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vPhase,vRadius,vDepth,vCoverage;
      uniform float uTime,uHero,uPointerStrength,uPixelRatio;
      uniform vec3 uPointer;
      void main(){
        vec3 p=position;
        float radius=length(p);
        p*=1.+sin(uTime*.23+radius*.5)*.007;
        p.y+=sin(radius*.9-uTime*.17)*.022*uHero;
        vec2 delta=p.xz-uPointer.xz;
        float influence=exp(-dot(delta,delta)*1.5)*uPointerStrength;
        p.xz+=vec2(-delta.y,delta.x)*influence*.045;
        p.y+=influence*.035;
        vec4 mv=modelViewMatrix*vec4(p,1.);
        vDepth=-mv.z;
        gl_Position=projectionMatrix*mv;
        float projectedSize=aSize*uPixelRatio*(230./max(.1,-mv.z));
        gl_PointSize=clamp(projectedSize,.65,${dust ? '104.' : '10.'});
        // Preserve coverage when distant stars fall below one fragment instead
        // of letting every unresolved point become an equally bright pixel.
        vCoverage=${dust ? '1.' : 'clamp(projectedSize/.65,.34,1.)'};
        vColor=aColor;vPhase=aPhase;vRadius=radius;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vPhase,vRadius,vDepth,vCoverage;
      uniform float uTime,uHero,uPalette,uAlpha;
      uniform vec3 uTint;
      void main(){
        vec2 uv=(gl_PointCoord-.5)*2.;
        float d=length(uv);
        if(d>1.)discard;
        float a=${dust ? 'exp(-d*d*4.1)*pow(1.-d,1.4)' : 'pow(1.-d,2.6)'};
        vec3 c=vColor;
        if(uPalette>1.5)c=vec3(c.r*.95+c.b*.28,c.g*.78,c.b*.55);
        else if(uPalette>.5)c=vec3(c.b*.86,c.r*.8,c.g*1.2);
        c=mix(c,vec3(dot(c,vec3(.21,.72,.07)))*uTint*1.6,.65);
        float twinkle=${dust ? '.985+.015*sin(uTime*.22+vPhase)' : '.96+.04*sin(uTime*.7+vPhase)'};
        ${dust ? `
          float cs=cos(vPhase),sn=sin(vPhase);
          vec2 w=mat2(cs,-sn,sn,cs)*uv;
          float wisp=.78+.11*sin(w.x*9.+w.y*5.+vPhase)+.07*sin(w.y*15.-w.x*3.);
          a*=wisp;` : ''}
        float haze=smoothstep(8.,38.,vDepth);
        c=mix(c,c*uTint,.16*haze);
        gl_FragColor=vec4(c,a*uAlpha*twinkle*vCoverage*(1.-haze*.18));
      }`,
  });
}
