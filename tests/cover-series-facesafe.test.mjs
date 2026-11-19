import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../dist/carousel-insta/look.js', import.meta.url), 'utf8');
const m = html.match(/\/\/ FACE-SAFE-BEGIN[\s\S]*?\/\/ FACE-SAFE-END/);
assert.ok(m, 'FACE-SAFE block present in look.js');
const ctx = vm.createContext({ window: {} });
vm.runInContext(m[0] + '\nthis.placeFaceSafe = placeFaceSafe; this.detectFace = detectFace;', ctx);
const { placeFaceSafe, detectFace } = ctx;

const W = 1080, H = 1350;
const zone = [{ x: 0, y: 0, w: 640, h: H }];
const hits = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const moved = (f, r) => ({ x: f.x + r.photoOffsetX, y: f.y + r.photoOffsetY, w: f.w, h: f.h });

test('face under the element zone is moved out of it', () => {
  const face = { x: 400, y: 500, w: 250, h: 300 };
  assert.ok(hits(face, zone[0]));
  const r = placeFaceSafe({ faceBox: face, canvasW: W, canvasH: H, elementZone: zone, slack: { right: 500, left: 200, up: 0, down: 0 } });
  const f2 = moved(face, r);
  assert.ok(r.photoOffsetX > 0, 'moved right');
  assert.ok(!hits(f2, zone[0]), 'no overlap after shift');
  assert.ok(f2.x + f2.w <= W, 'stays on canvas');
  assert.equal(r.cleared, true);
});

test('face already clear: no shift', () => {
  const r = placeFaceSafe({ faceBox: { x: 760, y: 400, w: 250, h: 300 }, canvasW: W, canvasH: H, elementZone: zone });
  assert.ok(Math.abs(r.photoOffsetX) < 1 && Math.abs(r.photoOffsetY) < 1);
  assert.equal(JSON.stringify(r.elementShift), '{"x":0,"y":0}');
});

test('no / invalid face returns default layout without throwing', () => {
  for (const fb of [null, undefined, { x: NaN, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 0, h: 0 }]) {
    const r = placeFaceSafe({ faceBox: fb, canvasW: W, canvasH: H, elementZone: zone });
    assert.equal(r.photoOffsetX, 0); assert.equal(r.photoOffsetY, 0); assert.equal(r.scale, 1);
    assert.equal(JSON.stringify(r.elementShift), '{"x":0,"y":0}');
  }
  assert.doesNotThrow(() => placeFaceSafe({}));
});

test('face too wide to clear by panning: pans as far as allowed and nudges elements', () => {
  const face = { x: 500, y: 500, w: 420, h: 400 };
  const r = placeFaceSafe({ faceBox: face, canvasW: W, canvasH: H, elementZone: [{ x: 0, y: 0, w: 690, h: H }], slack: { right: 900, left: 0, up: 0, down: 0 } });
  assert.equal(r.photoOffsetX, W - face.x - face.w, 'pushed to the right canvas edge');
  assert.ok(r.elementShift.x < 0);
});

test('detectFace: absent FaceDetector -> null, throwing detector -> null, picks largest face', async () => {
  ctx.window.FaceDetector = undefined;
  assert.equal(await detectFace({}), null);
  ctx.window.FaceDetector = function () { this.detect = async () => { throw new Error('x'); }; };
  assert.equal(await detectFace({}), null);
  ctx.window.FaceDetector = function () { this.detect = async () => [{ boundingBox: { x: 0, y: 0, width: 10, height: 10 } }, { boundingBox: { x: 100, y: 100, width: 200, height: 200 } }]; };
  const f = await detectFace({});
  assert.ok(f.w > 200 && f.x < 100 && f.x > 70);
});
