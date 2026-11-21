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
  assert.deepEqual(k.keys, ['C', 'T', 'coverDefaults', 'detectFace', 'fontsReady', 'pad3', 'place', 'placeFaceSafe', 'renderReelOverlay', 'renderSeries', 'renderSlide']);
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
// SOC-25: the founder saw stretched faces on a posted carousel (html2canvas ignored object-fit:cover and fitted the photo to the box on
// both axes). A perfect circle in the source must stay a perfect circle on the slide, for landscape, portrait and square sources.
await t('SOC-25 uniform cover (must-fail fixture): a circle drawn into the slide stays a circle, drawn w:h = 1.00 +/- 0.02 for 800x600, 600x800 and 1000x1000 sources', async () => {
  const r = await page.evaluate(() => {
    const circleImg = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000'; x.beginPath(); x.arc(w / 2, h * 0.38, Math.min(w, h) * 0.3, 0, Math.PI * 2); x.fill(); return c; };
    const bbox = cv => { const d = cv.getContext('2d').getImageData(0, 0, 1080, 1350).data; let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let y = 0; y < 1350; y++) for (let x = 0; x < 1080; x++) { const o = (y * 1080 + x) * 4; if (d[o] < 30 && d[o + 1] < 30 && d[o + 2] < 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return { w: x1 - x0 + 1, h: y1 - y0 + 1 }; };
    // empty slide text: only the page counter is drawn, away from the circle
    return [[800, 600], [600, 800], [1000, 1000]].map(([w, h]) => { const cv = document.createElement('canvas'); OneLook.renderSlide(cv, { handle: '', kicker: '', num: '', title: '', sub: '', swipe: '' }, 0, 3, circleImg(w, h), {}); const b = bbox(cv); return { w, h, bw: b.w, bh: b.h, ratio: b.w / b.h }; });
  });
  for (const o of r) { assert.ok(o.bw > 200 && o.bh > 200, 'circle found ' + JSON.stringify(o)); assert.ok(Math.abs(o.ratio - 1) <= 0.02, 'circle ratio ' + JSON.stringify(o)); }
});
await t('SOC-25 low-res flag (must-fail fixture): a 400x500 photo is lowRes true; 1080x1350, 1200x1600 and 2048x1536 are false; no photo is null; zooming a 1080x1350 photo in makes it true', async () => {
  const r = await page.evaluate(({ SLIDES }) => {
    const f = (img, opts) => OneLook.renderSlide(document.createElement('canvas'), SLIDES[3], 3, 4, img, opts).lowRes;
    return { small: f(mkImg(400, 500), {}), seriesSmall: OneLook.renderSeries(document.createElement('canvas'), { ...OneLook.coverDefaults(), num: 1 }, 0, 4, mkImg(683, 1024), {}).lowRes, exact: f(mkImg(1080, 1350), {}), p: f(mkImg(1200, 1600), {}), l: f(mkImg(2048, 1536), {}), none: f(null, {}), plain: f(mkImg(400, 500), { look: 'plain' }), zoomed: f(mkImg(1080, 1350), { frame: { fx: 0.5, fy: 0.5, zoom: 1.3 } }) };
  }, { SLIDES });
  assert.deepEqual(r, { small: true, seriesSmall: true, exact: false, p: false, l: false, none: null, plain: null, zoomed: true });
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

// ---- SOC-24: the plain look (opts.look === 'plain') ----
await t('SOC-24 plain: purple ground (rgb 58,17,80) at 6 empty points even with a photo handed in; no scrim, no photo', async () => {
  const px = await page.evaluate(({ S }) => {
    const cv = document.createElement('canvas'), img = mkImg(1200, 1600);
    const r = OneLook.renderSlide(cv, S, 3, 7, img, { look: 'plain', face: { x: 0.35, y: 0.15, w: 0.3, h: 0.22 } });
    const x = cv.getContext('2d'); const at = (a, b) => [...x.getImageData(a, b, 1, 1).data];
    return { r: { fits: r.fits, faceClear: r.faceClear }, pts: [at(2, 2), at(1076, 2), at(2, 700), at(1076, 700), at(540, 300), at(1076, 1346)] };
  }, { S: SLIDES[3] });
  for (const p of px.pts) assert.deepEqual(p, [58, 17, 80, 255]);
  assert.equal(px.r.faceClear, null, 'no face check on plain');
  assert.equal(px.r.fits, true);
});
await t('SOC-24 plain: title and sub drawn in #faf1e2, kicker, num and swipe in #f9c9e6, no pill behind the title', async () => {
  const o = await page.evaluate(({ S }) => {
    const seen = {}; const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (tx, ...a) { if (this.canvas === window.__cv) seen[tx] = this.fillStyle; return ft.call(this, tx, ...a); };
    const cv = document.createElement('canvas'); window.__cv = cv;
    const s = { ...S, swipe: 'Swipe' };
    const r = OneLook.renderSlide(cv, s, 3, 7, null, { look: 'plain' });
    CanvasRenderingContext2D.prototype.fillText = ft; window.__cv = null;
    const b = r.blocks.title, x = cv.getContext('2d');
    return { seen, corner: [...x.getImageData(Math.round(b.x) + 3, Math.round(b.y) + 3, 1, 1).data] };
  }, { S: SLIDES[3] });
  assert.equal(o.seen['Start with one'], '#faf1e2'); assert.equal(o.seen['question'], '#faf1e2'); // the title wraps in two lines
  assert.equal(o.seen['Ask it one clear thing.'], '#faf1e2');
  assert.equal(o.seen['Idea'], '#f9c9e6');
  assert.equal(o.seen['1'], '#f9c9e6');
  assert.equal(o.seen['Swipe  →'], '#f9c9e6');
  assert.deepEqual(o.corner, [58, 17, 80, 255], 'a title pill would be cream here');
});
await t('SOC-24 plain: same layout and fit result as the photo look; the handle tag is still drawn; an over-long slide still reports fits:false', async () => {
  const o = await page.evaluate(({ S }) => {
    const a = OneLook.renderSlide(document.createElement('canvas'), S, 3, 7, null, {}), b = OneLook.renderSlide(document.createElement('canvas'), S, 3, 7, null, { look: 'plain' });
    const long = { ...S, title: (S.title + ' ').repeat(40) };
    const c = OneLook.renderSlide(document.createElement('canvas'), long, 3, 7, null, { look: 'plain' });
    return { ta: a.textTop, tb: b.textTop, ha: a.blocks.handle, hb: b.blocks.handle, fa: [a.titleSize, a.subSize], fits: c.fits };
  }, { S: SLIDES[3] });
  assert.deepEqual(o.ha, o.hb); assert.ok(o.hb && o.hb.w > 0);
  assert.equal(o.fits, false);
});
await t('SOC-24 plain: every title line starts at the same x as line 1 and as the sub (no stray indent on wrapped lines)', async () => {
  const xs = await page.evaluate(({ S }) => {
    const seen = []; const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (tx, x) { if (this.canvas === window.__cv) seen.push([tx, Math.round(x)]); return ft.apply(this, arguments); };
    const cv = document.createElement('canvas'); window.__cv = cv;
    OneLook.renderSlide(cv, { ...S, kicker: '', num: '', title: "I don't want to be a full-time A&E doctor and I want more", sub: 'The question becomes: what else am I going to do?', swipe: 'Swipe' }, 3, 7, null, { look: 'plain' });
    CanvasRenderingContext2D.prototype.fillText = ft; window.__cv = null; return seen;
  }, { S: SLIDES[3] });
  const title = xs.filter(([tx]) => /^(I don|a full|doctor|and I|want|more|be)/.test(tx) || (tx !== 'The question becomes: what else' && !/^(am I|@|\d \/|Swipe|what)/.test(tx) && xs.indexOf(xs.find(z => z[0] === tx)) < xs.findIndex(z => /^The question/.test(z[0]))));
  const sub = xs.find(([tx]) => /^The question/.test(tx));
  assert.ok(title.length >= 3, 'the title wraps in 3 or more lines: ' + JSON.stringify(xs));
  for (const [tx, x] of title) assert.equal(x, title[0][1], 'title line "' + tx + '" x');
  assert.equal(title[0][1], sub[1], 'title and sub share the left edge');
});
await t('SOC-24 plain: the whole text block is centred vertically in the space between the handle tag and the bottom margin (within 5% of the slide centre)', async () => {
  const o = await page.evaluate(({ S }) => {
    const r = OneLook.renderSlide(document.createElement('canvas'), { ...S, swipe: 'Swipe' }, 3, 7, null, { look: 'plain' });
    const b = ['kicker', 'num', 'title', 'sub', 'swipe'].map(k => r.blocks[k]).filter(Boolean);
    return { top: Math.min(...b.map(x => x.y)), bot: Math.max(...b.map(x => x.y + x.h)), H: OneLook.T.H };
  }, { S: SLIDES[3] });
  const mid = (o.top + o.bot) / 2;
  assert.ok(Math.abs(mid - o.H / 2) <= 0.05 * o.H, 'block centre ' + mid + ' vs ' + o.H / 2);
  assert.ok(o.top > 120, 'the block starts below the handle tag');
});
await t('SOC-24 photo look is pixel-identical to before: look "photo" and no look give the same pixels, and both match the pre-SOC-24 golden hashes', async () => {
  const o = await page.evaluate(({ S }) => {
    const img = mkImg(1200, 1600), face = { x: 0.35, y: 0.15, w: 0.3, h: 0.22 };
    const d = opts => { const c = document.createElement('canvas'); OneLook.renderSlide(c, S, 3, 4, img, opts); return c.toDataURL(); };
    return { same: d({ face }) === d({ face, look: 'photo' }), plainDiffers: d({ face }) !== d({ face, look: 'plain' }) };
  }, { S: SLIDES[3] });
  assert.ok(o.same); assert.ok(o.plainDiffers);
  const g = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/look-golden.json'), 'utf8'));
  const h = await page.evaluate(({ S }) => {
    const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16) + ':' + s.length; };
    const c = document.createElement('canvas'); OneLook.renderSlide(c, S, 3, 7, null, { look: 'photo' }); return hash(c.toDataURL());
  }, { S: SLIDES[3] });
  assert.equal(h, g.slide3);
});

await t('No page errors', async () => { assert.deepEqual(errors, []); });

await browser.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
