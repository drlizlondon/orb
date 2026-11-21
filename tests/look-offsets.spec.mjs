// SOC-18.10 acceptance (look.js): per-block offsets. Playwright against a blank page plus dist/carousel-insta/look.js.
// Run: node tests/look-offsets.spec.mjs   (env as tests/look.spec.mjs: PLAYWRIGHT_DIR, CHROMIUM_PATH)
// LOOK_FILE=<path> runs the same tests against another copy of look.js (tests/look-mutations.spec.mjs breaks copies and demands red).
// GOLDEN_WRITE=1 rewrites tests/fixtures/look-golden.json (hashes of toDataURL for the no-offset draws, captured from look.js
// BEFORE SOC-18.10 on this machine's fonts; AC1 = the new code must reproduce them exactly).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.LOOK_FILE || path.join(here, '../dist/carousel-insta/look.js');
const SRC = fs.readFileSync(FILE, 'utf8');
const GOLD = path.join(here, 'fixtures/look-golden.json');
const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR || '/Users/lizzie/colourpuzzle/node_modules';
const { chromium } = require(path.join(pwDir, 'playwright'));

const SLIDES = [
  ['', '', 'I stopped doing this one thing', 'Here is what changed for me.', 'Swipe'],
  ['Why I can say this', '', 'I tried it myself', 'It saved me real time.', ''],
  ['The story', '', 'It started on a busy shift', 'I needed a faster way to plan.', ''],
  ['Idea', '1', 'Start with one question', 'Ask it one clear thing.', ''],
  ['Idea', '2', 'Give it your context', 'Tell it who you are writing for.', ''],
  ['Idea', '3', 'Edit in your voice', 'Make it sound like you.', ''],
  ['Real talk', '', 'It is not magic', 'You still do the thinking.', '']
].map(([kicker, num, title, sub, swipe]) => ({ handle: '@drlizlondon', kicker, num, title, sub, swipe }));
const STRAP = "I'll show you how I'm using AI";

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: SRC });
await page.evaluate(() => {
  window.mkImg = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2a6'); g.addColorStop(0.5, '#fa4'); g.addColorStop(1, '#46c'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#c33'; x.fillRect(w * 0.1, h * 0.1, w * 0.2, h * 0.2); return c; };
  window.hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16) + ':' + s.length; };
  window.cv = () => document.createElement('canvas');
  window.draws = (mod) => {
    const out = {}, cover = { ...OneLook.coverDefaults(), strap: 'I will show you how I am using AI', num: 1 };
    SLIDES_.forEach((s, i) => { out['slide' + i] = hash(mk(s, i, mod)); });
    out.series = hash((() => { const c = cv(); OneLook.renderSeries(c, mod ? { ...cover, offsets: mod } : cover, 0, 4, null, {}); return c.toDataURL(); })());
    const img = mkImg(1200, 1600), face = { x: 0.35, y: 0.15, w: 0.3, h: 0.22 };
    out.photo = hash((() => { const c = cv(); OneLook.renderSlide(c, mod ? { ...SLIDES_[3], offsets: mod } : SLIDES_[3], 3, 4, img, { face, finish: false }); return c.toDataURL(); })());
    out.seriesPhoto = hash((() => { const c = cv(); OneLook.renderSeries(c, mod ? { ...cover, offsets: mod } : cover, 0, 4, img, { face, finish: false }); return c.toDataURL(); })());
    return out;
  };
  window.mk = (s, i, mod) => { const c = cv(); OneLook.renderSlide(c, mod ? { ...s, offsets: mod } : s, i, 7, null, {}); return c.toDataURL(); };
});
await page.evaluate(S => { window.SLIDES_ = S; }, SLIDES);

let failed = 0, passed = 0;
async function t(name, fn) { try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + String(e.message).split('\n').slice(0, 3).join('\n  ')); } }

if (process.env.GOLDEN_WRITE) {
  fs.writeFileSync(GOLD, JSON.stringify(await page.evaluate(() => draws(null)), null, 1) + '\n');
  console.log('wrote ' + GOLD); await browser.close(); process.exit(0);
}
const golden = JSON.parse(fs.readFileSync(GOLD, 'utf8')); delete golden.finishPhoto; delete golden.finishDark; // SOC-26: owned by look.spec.mjs

await t('AC1: with no offsets, every slide, idea and series draw is toDataURL-identical to before SOC-18.10', async () => {
  assert.deepEqual(await page.evaluate(() => draws(null)), golden);
});
await t('AC1: empty offsets, and zero offsets, are also identical to before', async () => {
  assert.deepEqual(await page.evaluate(() => draws({})), golden);
  assert.deepEqual(await page.evaluate(() => draws({ title: { dx: 0, dy: 0 }, sub: { dx: 0, dy: 0 }, kicker: { dx: 0, dy: 0 }, handle: { dx: 0, dy: 0 } })), golden);
});
await t('AC1 must-fail: a 1 px offset on a block changes the draw', async () => {
  const d = await page.evaluate(() => draws({ title: { dx: 0, dy: 1 } }));
  for (const k of ['slide0', 'slide3', 'series', 'photo']) assert.notEqual(d[k], golden[k], k);
});

const names = ['handle', 'kicker', 'num', 'title', 'sub', 'swipe'];
await t('AC2: slide.offsets.title = {dx:0, dy:-200} moves the reported title rect by exactly 200 in y, and only the title (the title sits low, so up is the free direction; a +200 on the handle is asserted too)', async () => {
  const r = await page.evaluate(() => {
    const s = SLIDES_[0], a = OneLook.renderSlide(cv(), s, 0, 4, null, {}), b = OneLook.renderSlide(cv(), { ...s, offsets: { title: { dx: 0, dy: -200 } } }, 0, 4, null, {});
    return { a: a.blocks, b: b.blocks };
  });
  assert.ok(r.a.title && r.a.sub && r.a.handle && r.a.swipe, Object.keys(r.a).join());
  assert.equal(r.b.title.y, r.a.title.y - 200); assert.equal(r.b.title.x, r.a.title.x);
  assert.equal(r.b.title.w, r.a.title.w); assert.equal(r.b.title.h, r.a.title.h);
  for (const n of Object.keys(r.a)) if (n !== 'title') assert.deepEqual(r.b[n], r.a[n], n + ' must not move');
  const h = await page.evaluate(() => { const s = SLIDES_[0], a = OneLook.renderSlide(cv(), s, 0, 4, null, {}).blocks.handle, b = OneLook.renderSlide(cv(), { ...s, offsets: { handle: { dx: 0, dy: 200 } } }, 0, 4, null, {}).blocks.handle; return b.y - a.y; });
  assert.equal(h, 200);
});
await t('AC2: pixel probe: the title centre pixel is where it was, 150 px higher, and the old spot no longer shows it', async () => {
  const r = await page.evaluate(() => {
    const s = { ...SLIDES_[2], swipe: '' }, a = cv(), b = cv();
    const ra = OneLook.renderSlide(a, s, 2, 4, null, {}), rb = OneLook.renderSlide(b, { ...s, offsets: { title: { dx: 0, dy: -150 } } }, 2, 4, null, {});
    const px = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data).join();
    const t = ra.blocks.title, x = Math.round(t.x + t.w / 2), y = Math.round(t.y + t.h / 2);
    return { was: px(a, x, y), movedAway: px(b, x, y), movedTo: px(b, x, y - 150), orig: px(a, x, y) };
  });
  assert.notEqual(r.was, r.movedAway, 'the old spot must change'); assert.equal(r.movedTo, r.was, 'the ink is 150 px higher');
});
await t('AC2: every block name moves by its offset (series: handle tag kicker, headline title, strap, badge)', async () => {
  const r = await page.evaluate(({ names }) => {
    const out = {};
    const s = { ...SLIDES_[3], swipe: 'Swipe' }, base = OneLook.renderSlide(cv(), s, 3, 4, null, {}).blocks;
    for (const n of names) { const b = OneLook.renderSlide(cv(), { ...s, offsets: { [n]: { dx: 20, dy: -30 } } }, 3, 4, null, {}).blocks[n]; out[n] = base[n] ? [b.x - base[n].x, b.y - base[n].y] : null; }
    const cover = { ...OneLook.coverDefaults(), strap: 'A strap line', num: 4 }, sb = OneLook.renderSeries(cv(), cover, 0, 4, null, {}).blocks;
    for (const n of ['kicker', 'title', 'strap', 'badge']) { const b = OneLook.renderSeries(cv(), { ...cover, offsets: { [n]: { dx: 15, dy: -40 } } }, 0, 4, null, {}).blocks[n]; out['series.' + n] = [b.x - sb[n].x, b.y - sb[n].y]; }
    return out;
  }, { names });
  for (const n of names) assert.deepEqual(r[n], [20, -30], n);
  for (const n of ['kicker', 'title', 'strap', 'badge']) assert.deepEqual(r['series.' + n], [15, -40], 'series ' + n);
});
await t('AC2: the face check uses the moved rects (dragging a block off the face clears it)', async () => {
  const r = await page.evaluate(() => {
    const img = mkImg(1080, 1350), face = { x: 0.05, y: 0.7, w: 0.3, h: 0.2 }, s = SLIDES_[3];
    const a = OneLook.renderSlide(cv(), s, 3, 4, img, { face });
    const mv = { title: { dx: 0, dy: -600 }, sub: { dx: 0, dy: -600 }, kicker: { dx: 0, dy: -600 }, num: { dx: 0, dy: -600 } };
    const b = OneLook.renderSlide(cv(), { ...s, offsets: mv }, 3, 4, img, { face });
    const part = OneLook.renderSlide(cv(), { ...s, offsets: { title: mv.title } }, 3, 4, img, { face });
    return { a: a.faceClear, b: b.faceClear, part: part.faceClear, ar: a.rects.length, br: b.rects.length };
  });
  assert.equal(r.a, false); assert.equal(r.ar, r.br); assert.equal(r.part, false, 'one block moved, the others still cover the face'); assert.equal(r.b, true, 'every block moved off the face');
});
await t('AC4: a far drag stays fully inside the slide (all four directions, every block); the applied offset is reported', async () => {
  const r = await page.evaluate(() => {
    const out = []; const s = { ...SLIDES_[3], swipe: 'Swipe' };
    for (const [dx, dy] of [[9999, 0], [-9999, 0], [0, 9999], [0, -9999], [-9999, -9999], [9999, 9999]]) {
      const offsets = {}; ['handle', 'kicker', 'num', 'title', 'sub', 'swipe'].forEach(n => { offsets[n] = { dx, dy }; });
      const b = OneLook.renderSlide(cv(), { ...s, offsets }, 3, 4, null, {}).blocks;
      for (const [n, k] of Object.entries(b)) out.push({ n, dx, dy, in: k.x >= 0 && k.y >= 0 && k.x + k.w <= 1080 && k.y + k.h <= 1350, ax: k.dx, ay: k.dy });
    }
    const cover = { ...OneLook.coverDefaults(), strap: 'A strap line', num: 4 };
    const sb = OneLook.renderSeries(cv(), { ...cover, offsets: { title: { dx: 9999, dy: 9999 }, strap: { dx: -9999, dy: 9999 }, badge: { dx: 9999, dy: -9999 }, kicker: { dx: -9999, dy: -9999 } } }, 0, 4, null, {}).blocks;
    for (const [n, k] of Object.entries(sb)) out.push({ n: 'series.' + n, in: k.x >= 0 && k.y >= 0 && k.x + k.w <= 1080 && k.y + k.h <= 1350 });
    return out;
  });
  assert.ok(r.length > 30); for (const x of r) assert.ok(x.in, JSON.stringify(x));
  assert.ok(r.some(x => x.ax && Math.abs(x.ax) < 9999), 'applied dx is the clamped value');
});
await t('Words that fit stay put: with offsets set the "fits" result is unchanged', async () => {
  const r = await page.evaluate(() => [OneLook.renderSlide(cv(), SLIDES_[0], 0, 4, null, {}).fits, OneLook.renderSlide(cv(), { ...SLIDES_[0], offsets: { title: { dx: 10, dy: -10 } } }, 0, 4, null, {}).fits]);
  assert.deepEqual(r, [true, true]);
});
await t('No random numbers, network or storage were added to look.js', async () => {
  for (const bad of ['Math.random', 'fetch(', 'localStorage', 'sessionStorage', 'Authorization', 'token', 'http://', 'https://']) assert.ok(!SRC.includes(bad), bad);
});
await t('No page errors', async () => { assert.deepEqual(errors, []); });
await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
