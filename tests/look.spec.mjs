// SOC-13.4 acceptance: Playwright against a blank page plus dist/carousel-insta/look.js.
// Run: node tests/look.spec.mjs   (Playwright is not an Orb dependency; set PLAYWRIGHT_DIR to a node_modules that has it,
//   and CHROMIUM_PATH to a headless chromium if the default browser is not installed.)
// LOOK_FILE=<path> runs the same tests against another copy of look.js (used by tests/look-mutations.spec.mjs: every must-fail below
// is proved by breaking the file and watching this suite go red).
// Named .spec.mjs on purpose so `node --test tests/*.test.mjs` does not pick it up.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.LOOK_FILE || path.join(here, '../dist/carousel-insta/look.js');
const SRC = fs.readFileSync(FILE, 'utf8');
const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR || '/Users/lizzie/colourpuzzle/node_modules';
const { chromium } = require(path.join(pwDir, 'playwright'));

// Slide text: the fixture strings already in tests/carousel-insta.spec.mjs (first 7 of its 8 slides).
const SLIDES = [
  ['', '', 'I stopped doing this one thing', 'Here is what changed for me.', 'Swipe'],
  ['Why I can say this', '', 'I tried it myself', 'It saved me real time.', ''],
  ['The story', '', 'It started on a busy shift', 'I needed a faster way to plan.', ''],
  ['Idea', '1', 'Start with one question', 'Ask it one clear thing.', ''],
  ['Idea', '2', 'Give it your context', 'Tell it who you are writing for.', ''],
  ['Idea', '3', 'Edit in your voice', 'Make it sound like you.', ''],
  ['Real talk', '', 'It is not magic', 'You still do the thinking.', '']
].map(([kicker, num, title, sub, swipe]) => ({ handle: '@drlizlondon', kicker, num, title, sub, swipe }));
const STRAP = "I'll show you how I'm using AI"; // her live default arrow-box line in dist/cover-series/index.html
const COVER_COLOURS = { pink: '#f29bd0', hot: '#ee3f9a', purple: '#3a1150', cream: '#faf1e2', yellow: '#ffd21e', lilac: '#f1e0f7', soft: '#f9c9e6' };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({ content: SRC });

// helpers living in the page
await page.evaluate(() => {
  window.__rec = null; window.__target = null;
  const ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { if (window.__rec && this.canvas === window.__target) window.__rec.push(String(t)); return ft.call(this, t, ...a); };
  window.mkImg = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2a6'); g.addColorStop(0.5, '#fa4'); g.addColorStop(1, '#46c'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#c33'; x.fillRect(w * 0.1, h * 0.1, w * 0.2, h * 0.2); return c; };
  window.hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  // padded face box mapped through the returned framing, then intersected with the returned rects
  window.faceHits = (img, face, r) => {
    const sc = Math.max(1080 / img.width, 1350 / img.height) * r.zoom, dw = img.width * sc, dh = img.height * sc;
    const box = { x: (face.x - face.w * 0.08) * img.width * sc - (dw - 1080) * r.fx, y: (face.y - face.h * 0.12) * img.height * sc - (dh - 1350) * r.fy, w: face.w * 1.16 * img.width * sc, h: face.h * 1.24 * img.height * sc };
    return r.rects.some(z => window.hit(box, z));
  };
  window.rec = (cv, fn) => { window.__rec = []; window.__target = cv; const r = fn(); const out = window.__rec; window.__rec = null; window.__target = null; return { r, out }; };
});

let failed = 0, passed = 0;
async function t(name, fn) { try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + String(e.message).split('\n').slice(0, 3).join('\n  ')); } }

await t('API surface and tokens', async () => {
  const k = await page.evaluate(() => ({ keys: Object.keys(OneLook).sort(), T: OneLook.T, C: OneLook.C, pad: OneLook.pad3(7), cd: OneLook.coverDefaults() }));
  assert.deepEqual(k.keys, ['C', 'T', 'coverDefaults', 'detectFace', 'fontsReady', 'pad3', 'place', 'placeFaceSafe', 'renderSeries', 'renderSlide']);
  assert.equal(k.pad, '#007');
  assert.deepEqual(k.cd, { kicker: 'Dr Liz London', h1: 'Using', h2: 'AI', h3: 'to Earn More', h4: 'and', h5: 'Work Less' });
  for (const [n, v] of Object.entries({ W: 1080, H: 1350, margin: 48, bottom: 96, maxTextTop: 0.5, titleMaxW: 800, subMaxW: 700, titleMin: 48, titleStep: 6, subSize: 38, subMin: 30, subLH: 1.22, kickerSize: 58, numSize: 130, handleSize: 46, counterSize: 30, swipeSize: 48, K: 0.6 })) assert.equal(k.T[n], v, 'T.' + n);
  assert.deepEqual(k.T.titleSize, [84, 72]);
});

await t('Words stay low: decks of 2, 4 and 7, every slide fits, textTop >= 675, rects below the top row >= 675', async () => {
  const res = await page.evaluate(({ SLIDES, STRAP }) => [2, 4, 7].map(n => SLIDES.slice(0, n).map((s, i) => { const r = OneLook.renderSlide(document.createElement('canvas'), s, i, n, null, {}); return { n, i, fits: r.fits, textTop: r.textTop, low: r.rects.slice(2).every(z => z.y >= 675), count: r.rects.length }; }))
    .flat().concat([(() => { const r = OneLook.renderSeries(document.createElement('canvas'), { ...OneLook.coverDefaults(), strap: STRAP, num: 1 }, 0, 4, null, {}); return { n: 'series', fits: r.fits, textTop: r.textTop, low: r.rects.slice(2).every(z => z.y >= 675), count: r.rects.length }; })()]), { SLIDES, STRAP });
  assert.equal(res.length, 14);
  for (const r of res) { assert.ok(r.fits, JSON.stringify(r)); assert.ok(r.textTop >= 675, JSON.stringify(r)); assert.ok(r.low, JSON.stringify(r)); assert.ok(r.count >= 3, JSON.stringify(r)); }
  // series with the defaults and no strapline too
  const s2 = await page.evaluate(() => OneLook.renderSeries(document.createElement('canvas'), { ...OneLook.coverDefaults(), num: 1 }, 0, 4, null, {}).textTop);
  assert.ok(s2 >= 675);
});
await t('Words stay low, must-fail: with T.maxTextTop patched to 0.2 a long slide reports textTop under 675', async () => {
  const r = await page.evaluate(({ SLIDES }) => {
    const long = { ...SLIDES[3], title: (SLIDES[3].title + ' ').repeat(6) };
    const before = OneLook.renderSlide(document.createElement('canvas'), long, 3, 4, null, {});
    const old = OneLook.T.maxTextTop; OneLook.T.maxTextTop = 0.2;
    const after = OneLook.renderSlide(document.createElement('canvas'), long, 3, 4, null, {});
    OneLook.T.maxTextTop = old; return { before: before.textTop, after: after.textTop };
  }, { SLIDES });
  assert.ok(r.after < 675, 'patched textTop ' + r.after); // the assert of the previous test would fire on this value
  assert.ok(r.before >= 0);
});

await t('Too many words is reported, not hidden (fits:false), and the normal case is fits:true', async () => {
  const r = await page.evaluate(({ SLIDES }) => {
    const big = { ...SLIDES[0], title: (SLIDES[0].title + ' ').repeat(12) };
    return { big: OneLook.renderSlide(document.createElement('canvas'), big, 0, 4, null, {}).fits, ok: OneLook.renderSlide(document.createElement('canvas'), SLIDES[0], 0, 4, null, {}).fits };
  }, { SLIDES });
  assert.equal(r.big, false); assert.equal(r.ok, true);
});

await t('Face clear (face-clear fixture, 1200x1600): normal and series, and the mapped box hits no rect', async () => {
  const r = await page.evaluate(({ SLIDES, STRAP }) => {
    const img = mkImg(1200, 1600), face = { x: 0.35, y: 0.15, w: 0.3, h: 0.22 };
    const a = OneLook.renderSlide(document.createElement('canvas'), SLIDES[3], 3, 4, img, { face });
    const b = OneLook.renderSeries(document.createElement('canvas'), { ...OneLook.coverDefaults(), strap: STRAP, num: 1 }, 0, 4, img, { face });
    return { a: { c: a.faceClear, z: a.zoom, hit: faceHits(img, face, a) }, b: { c: b.faceClear, z: b.zoom, hit: faceHits(img, face, b) } };
  }, { SLIDES, STRAP });
  assert.equal(r.a.c, true); assert.equal(r.b.c, true); assert.equal(r.a.hit, false); assert.equal(r.b.hit, false); assert.equal(r.a.z, 1);
});
await t('Face blocked (must-fail fixture, 1080x1350 no room): faceClear false, and the mapped box does hit a rect', async () => {
  const r = await page.evaluate(({ SLIDES, STRAP }) => {
    const img = mkImg(1080, 1350), face = { x: 0.05, y: 0.7, w: 0.3, h: 0.2 };
    const a = OneLook.renderSlide(document.createElement('canvas'), SLIDES[3], 3, 4, img, { face });
    const b = OneLook.renderSeries(document.createElement('canvas'), { ...OneLook.coverDefaults(), strap: STRAP, num: 1 }, 0, 4, img, { face });
    return { a: a.faceClear, b: b.faceClear, hit: faceHits(img, face, a) };
  }, { SLIDES, STRAP });
  assert.equal(r.a, false); assert.equal(r.b, false); assert.equal(r.hit, true);
});

await t('No face data: face null gives faceClear null, fx 0.5, fy 0.5, zoom 1 (and no image: same)', async () => {
  const r = await page.evaluate(({ SLIDES }) => {
    const img = mkImg(1200, 1600);
    const a = OneLook.renderSlide(document.createElement('canvas'), SLIDES[3], 3, 4, img, { face: null });
    const b = OneLook.renderSlide(document.createElement('canvas'), SLIDES[3], 3, 4, null, { face: { x: .1, y: .1, w: .2, h: .2 } });
    const c = OneLook.renderSlide(document.createElement('canvas'), SLIDES[3], 3, 4, img);
    const pick = o => ({ c: o.faceClear, fx: o.fx, fy: o.fy, z: o.zoom }); return [pick(a), pick(b), pick(c)];
  }, { SLIDES });
  for (const o of r) assert.deepEqual(o, { c: null, fx: 0.5, fy: 0.5, z: 1 });
});

await t('Her framing wins: frame returned unchanged, cleared still worked out; face-blocked stays false with any frame', async () => {
  const r = await page.evaluate(({ SLIDES }) => {
    const frame = { fx: 0, fy: 1, zoom: 1.5 };
    const img = mkImg(1200, 1600), clearFace = { x: 0.35, y: 0.15, w: 0.3, h: 0.22 };
    const a = OneLook.renderSlide(document.createElement('canvas'), SLIDES[3], 3, 4, img, { face: clearFace, frame });
    const blk = mkImg(1080, 1350), blockedFace = { x: 0.05, y: 0.7, w: 0.3, h: 0.2 };
    // frames that leave her face in the word zone (a frame that moves it out, e.g. zoom 2 pinned to the top, legitimately clears)
    const frames = [{ fx: 0, fy: 1, zoom: 1.5 }, { fx: 0.5, fy: 0.5, zoom: 1 }, { fx: 0.3, fy: 0.9, zoom: 1.2 }];
    const bl = frames.map(f => OneLook.renderSlide(document.createElement('canvas'), SLIDES[3], 3, 4, blk, { face: blockedFace, frame: f }).faceClear);
    return { a: { fx: a.fx, fy: a.fy, zoom: a.zoom, c: a.faceClear, hit: faceHits(img, clearFace, a) }, bl };
  }, { SLIDES });
  assert.deepEqual([r.a.fx, r.a.fy, r.a.zoom], [0, 1, 1.5]);
  assert.equal(typeof r.a.c, 'boolean'); assert.equal(r.a.c, !r.a.hit, 'cleared matches the real intersection');
  assert.deepEqual(r.bl, [false, false, false]);
});

await t('Words drawn (recording): normal slide 2 of 4; series slide; handle not drawn on the series slide', async () => {
  const r = await page.evaluate(({ SLIDES, STRAP }) => {
    const cv = document.createElement('canvas');
    const n = rec(cv, () => OneLook.renderSlide(cv, SLIDES[3], 1, 4, null, {})).out;
    const cv2 = document.createElement('canvas');
    const s = rec(cv2, () => OneLook.renderSeries(cv2, { ...OneLook.coverDefaults(), strap: STRAP, num: 7 }, 0, 4, null, {})).out;
    return { n, s };
  }, { SLIDES, STRAP });
  const nj = r.n.join(' | ');
  for (const w of ['@drlizlondon', '2 / 4', 'Idea', '1']) assert.ok(r.n.includes(w), 'normal: ' + w + ' in ' + nj);
  assert.ok(r.n.join(' ').includes('Start with one question'), nj); assert.ok(r.n.join(' ').includes('Ask it one clear thing.'), nj);
  for (const w of ['#007', 'Dr Liz London', 'Using', 'AI', 'to Earn More', 'and', 'Work Less', '1 / 4']) assert.ok(r.s.includes(w), 'series: ' + w + ' in ' + r.s.join(' | '));
  assert.ok(r.s.join(' ').includes(STRAP), 'strap text');
  assert.ok(!r.s.some(x => x.includes('@')), 'no handle on the series slide');
});

await t('Empty stays empty (G1): empty kicker/num/sub/swipe draw nothing; no strap default; empty handle draws no tag', async () => {
  const r = await page.evaluate(({ SLIDES }) => {
    const cv = document.createElement('canvas'), s = { handle: '@drlizlondon', kicker: '', num: '', title: SLIDES[3].title, sub: '', swipe: '' };
    const a = rec(cv, () => OneLook.renderSlide(cv, s, 0, 4, null, {})).out;
    const cv2 = document.createElement('canvas');
    const b = rec(cv2, () => OneLook.renderSlide(cv2, { handle: '', kicker: '', num: '', title: '', sub: '', swipe: '' }, 0, 4, null, {})).out;
    const cv3 = document.createElement('canvas');
    const c = rec(cv3, () => OneLook.renderSeries(cv3, { ...OneLook.coverDefaults(), num: 1 }, 0, 4, null, {})).out;
    return { a, b, c, cd: Object.keys(OneLook.coverDefaults()) };
  }, { SLIDES });
  const allowed = new Set(['@drlizlondon', '1 / 4']);
  for (const x of r.a) assert.ok(allowed.has(x) || 'Start with one question'.includes(x), 'unexpected text: ' + x);
  assert.deepEqual(r.b, ['1 / 4']);
  assert.equal(r.cd.includes('strap'), false);
  assert.ok(!r.c.some(x => /Idea|Swipe|I'll show/.test(x)), 'no stock strapline: ' + r.c.join('|'));
});

await t('Same in, same out: identical toDataURL; 1080x1350; more than 20 colours with an image', async () => {
  const r = await page.evaluate(({ SLIDES, STRAP }) => {
    const img = mkImg(1200, 1600), face = { x: 0.35, y: 0.15, w: 0.3, h: 0.22 };
    const draw = () => { const cv = document.createElement('canvas'); OneLook.renderSlide(cv, SLIDES[3], 3, 4, img, { face }); return cv; };
    const a = draw(), b = draw();
    const sa = document.createElement('canvas'), sb = document.createElement('canvas'); const cov = { ...OneLook.coverDefaults(), strap: STRAP, num: 1 };
    OneLook.renderSeries(sa, cov, 0, 4, img, { face }); OneLook.renderSeries(sb, cov, 0, 4, img, { face });
    const d = a.getContext('2d').getImageData(0, 0, 1080, 1350).data, set = new Set(); for (let i = 0; i < d.length; i += 4 * 97) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return { same: a.toDataURL() === b.toDataURL(), sameS: sa.toDataURL() === sb.toDataURL(), w: a.width, h: a.height, colours: set.size };
  }, { SLIDES, STRAP });
  assert.ok(r.same && r.sameS, 'two draws differ'); assert.equal(r.w, 1080); assert.equal(r.h, 1350); assert.ok(r.colours > 20, 'colours ' + r.colours);
  assert.equal((SRC.match(/Math\.random/g) || []).length, 0, 'Math.random in look.js');
});

await t('Colours: no ffd9a0 in look.js; the seven C values equal the cover list', async () => {
  assert.equal((SRC.match(/ffd9a0/gi) || []).length, 0);
  assert.deepEqual(await page.evaluate(() => OneLook.C), COVER_COLOURS);
});

await t('No network, no storage, no write paths in look.js (G5)', async () => {
  for (const bad of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'localStorage', 'sessionStorage', 'Authorization', 'token', 'WebSocket', 'http://', 'https://']) assert.ok(!SRC.includes(bad), 'look.js contains ' + bad);
});

await t('No page errors', async () => { assert.deepEqual(errors, []); });

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
