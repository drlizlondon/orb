import * as THREE from 'three';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {CanvasGalaxyRenderer} from '../dist/canvas-fallback.js';

// Render the actual world once per inspection, without another animation loop
// or WebGL context. Shared materials retain its surface, mood and orientation.
export function createPlanetPortrait(renderer, planet, compact = false) {
  const size = 192;
  planet.group.updateWorldMatrix(true, true);
  const scene = new THREE.Scene();
  for (const source of [planet.mesh, planet.atmosphere, planet.ring]) {
    if (!source) continue;
    const copy = source.clone(false);
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(source.matrixWorld);
    scene.add(copy);
  }
  const center = planet.group.getWorldPosition(new THREE.Vector3());
  const scale = planet.group.getWorldScale(new THREE.Vector3());
  const worldScale = Math.max(scale.x, scale.y, scale.z);
  const radius = worldScale * (planet.ring ? .72 * planet.ring.scale.x : planet.mesh.geometry.parameters.radius * planet.mesh.scale.x * 1.04);
  const camera = new THREE.PerspectiveCamera(35, 1, .01, 100);
  const direction = new THREE.Vector3(compact ? 0 : .9, compact ? .9 : 1.1, compact ? 3.4 : 3.5).normalize();
  camera.position.copy(center).addScaledVector(direction, radius / Math.sin(THREE.MathUtils.degToRad(17.5)) * 1.1);
  camera.lookAt(center);

  if (renderer.isFallback) return canvasPortrait(scene, camera, size);

  const previous = {
    target: renderer.getRenderTarget(),
    face: renderer.getActiveCubeFace(),
    mip: renderer.getActiveMipmapLevel(),
    viewport: renderer.getViewport(new THREE.Vector4()),
    scissor: renderer.getScissor(new THREE.Vector4()),
    scissorTest: renderer.getScissorTest(),
    clear: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
  };
  // Planet radiance stays within the byte target's range. RGBA8 multisampling
  // avoids requiring mobile floating-point renderbuffer support for an icon.
  const linear = new THREE.WebGLRenderTarget(size, size, {samples: 4});
  const output = new THREE.WebGLRenderTarget(size, size, {depthBuffer: false});
  const finish = new OutputPass();
  try {
    renderer.autoClear = true;
    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(linear);
    renderer.clear();
    renderer.render(scene, camera);
    // Match the scene's ACES exposure and sRGB conversion rather than exporting
    // the raw linear shader colors into an ordinary browser image.
    finish.render(renderer, output, linear);
    const pixels = new Uint8Array(size * size * 4);
    renderer.readRenderTargetPixels(output, 0, 0, size, size, pixels);
    if (!pixels.some((value, index) => index % 4 === 3 && value > 0)) throw new Error('Empty planet preview');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y++) image.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.warn('Planet preview used the Canvas fallback', error);
    return canvasPortrait(scene, camera, size);
  } finally {
    renderer.setRenderTarget(previous.target, previous.face, previous.mip);
    renderer.setViewport(previous.viewport);
    renderer.setScissor(previous.scissor);
    renderer.setScissorTest(previous.scissorTest);
    renderer.setClearColor(previous.clear, previous.alpha);
    renderer.autoClear = previous.autoClear;
    finish.dispose();
    linear.dispose();
    output.dispose();
    // Geometry and materials belong to the live scene and are deliberately shared.
    scene.clear();
  }
}

function canvasPortrait(scene, camera, size) {
  // The 2D fallback renders spheres and lines, not ring-shaped meshes.
  // Recreate a ring outline using its world transform without touching the
  // original scene or disposing its shared geometry and materials.
  scene.updateWorldMatrix(true, true);
  const fallbackScene = new THREE.Scene();
  const temporaryResources = [];
  try {
    for (const source of scene.children) {
      let copy;
      if (source.isMesh && source.geometry.type === 'RingGeometry') {
        const {innerRadius, outerRadius} = source.geometry.parameters;
        const radius = (innerRadius + outerRadius) / 2;
        const points = Array.from({length: 129}, (_, index) => {
          const angle = index * Math.PI * 2 / 128;
          return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
        });
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: source.material.color || source.material.uniforms.uColor.value,
          transparent: true,
          opacity: source.material.opacity,
        });
        temporaryResources.push(geometry, material);
        copy = new THREE.LineLoop(geometry, material);
      } else {
        copy = source.clone(false);
      }
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(source.matrixWorld);
      fallbackScene.add(copy);
    }
    const renderer = new CanvasGalaxyRenderer();
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    renderer.render(fallbackScene, camera);
    return renderer.domElement.toDataURL('image/png');
  } finally {
    fallbackScene.clear();
    for (const resource of temporaryResources) resource.dispose();
  }
}
