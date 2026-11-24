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
  assert.deepEqual(k.keys, ['C', 'T', 'coverDefaults', 'detectFace', 'fontsReady', 'pad3', 'place', 'placeFaceSafe', 'reelCaptionSize', 'renderReelOverlay', 'renderSeries', 'renderSlide']);
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
    return { small: f(mkImg(400, 500), {}), seriesSmall: OneLook.renderSeries(document.createElement('canvas'), { ...OneLook.coverDefaults(), num: 1 }, 0, 4, mkImg(683, 1024), {}).lowRes, exact: f(mkImg(1080, 1350), {}), p: f(mkImg(1200, 1600), {}), l: f(mkImg(2048, 1536), {}), none: f(null, {}), dark: f(mkImg(400, 500), { look: 'dark' }), zoomed: f(mkImg(1080, 1350), { frame: { fx: 0.5, fy: 0.5, zoom: 1.3 } }) };
  }, { SLIDES });
  assert.deepEqual(r, { small: true, seriesSmall: true, exact: false, p: false, l: false, none: null, dark: true, zoomed: true });
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

await t('Colours: ffd9a0 appears once in look.js (the dark look accent, DARK.accent); the seven C values equal the cover list', async () => {
  assert.equal((SRC.match(/ffd9a0/gi) || []).length, 1);
  assert.deepEqual(await page.evaluate(() => OneLook.C), COVER_COLOURS);
});

await t('No network, no storage, no write paths in look.js (G5)', async () => {
  for (const bad of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'localStorage', 'sessionStorage', 'Authorization', 'token', 'WebSocket', 'http://', 'https://']) assert.ok(!SRC.includes(bad), 'look.js contains ' + bad);
});

// ---- SOC-26: the dark look (opts.look === 'dark'), replaces the SOC-24 plain look ----
// Template values: git commit 2c825b7 of dist/carousel-insta/index.html (the page that drew the 20 Nov post), card units x 1080/460.
const DKW = 1080 / 460;
await t('SOC-26 dark: gradient (must-fail fixture): on a flat light photo the bottom edge is dark and the top edge is almost untouched', async () => {
  const px = await page.evaluate(({ S }) => {
    const flat = document.createElement('canvas'); flat.width = 1080; flat.height = 1350; const fx = flat.getContext('2d'); fx.fillStyle = '#eeeeee'; fx.fillRect(0, 0, 1080, 1350);
    const cv = document.createElement('canvas'); OneLook.renderSlide(cv, S, 3, 7, flat, { look: 'dark' });
    const x = cv.getContext('2d'); const at = (a, b) => [...x.getImageData(a, b, 1, 1).data];
    return { top: at(1076, 2), mid: at(1076, 900), bottom: at(1076, 1346) };
  }, { S: SLIDES[3] });
  // #eee under rgba(10,10,16,a): a = .05 at the top edge, .92 at the bottom edge (index.html:53)
  const near = (p, e, tol) => p.slice(0, 3).every((v, k) => Math.abs(v - e[k]) <= tol);
  assert.ok(near(px.top, [227, 227, 227], 3), 'top ' + px.top);
  assert.ok(near(px.bottom, [28, 28, 34], 3), 'bottom ' + px.bottom);
  assert.ok(px.bottom[0] < px.mid[0] && px.mid[0] < px.top[0], 'darker towards the bottom: ' + JSON.stringify(px));
});
await t('SOC-26 dark: no photo draws the template ground #2b2a33 under the scrim; no plum tint on a photo', async () => {
  const r = await page.evaluate(({ S }) => {
    const cv = document.createElement('canvas'); OneLook.renderSlide(cv, S, 3, 7, null, { look: 'dark' });
    const x = cv.getContext('2d'); const top = [...x.getImageData(2, 2, 1, 1).data];
    const flat = document.createElement('canvas'); flat.width = 1080; flat.height = 1350; const fx = flat.getContext('2d'); fx.fillStyle = '#ffffff'; fx.fillRect(0, 0, 1080, 1350);
    const c2 = document.createElement('canvas'); OneLook.renderSlide(c2, { handle: '', kicker: '', num: '', title: '', sub: '', swipe: '' }, 0, 1, flat, { look: 'dark' });
    const tl = [...c2.getContext('2d').getImageData(0, 0, 1, 1).data];
    return { top, tl };
  }, { S: SLIDES[3] });
  // #2b2a33 = 43,42,51 under .05 of (10,10,16) = 41,40,49; a white photo under .05 is 243, with no plum tint (plum would pull green down to ~230)
  assert.ok(r.top.slice(0, 3).every((v, k) => Math.abs(v - [41, 40, 49][k]) <= 2), 'ground ' + r.top);
  assert.ok(r.tl[0] >= 240 && r.tl[1] >= 240 && r.tl[2] >= 240, 'no tint ' + r.tl);
});
await t('SOC-26 dark: words in the template colours and fonts: handle, title white, sub #f3f1ee, kicker upper-case, kicker/num/swipe #ffd9a0, system sans, no pill', async () => {
  const o = await page.evaluate(({ S }) => {
    const seen = {}, fonts = {}; const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (tx, ...a) { if (this.canvas === window.__cv) { seen[tx] = this.fillStyle; fonts[tx] = this.font; } return ft.call(this, tx, ...a); };
    const cv = document.createElement('canvas'); window.__cv = cv;
    const r = OneLook.renderSlide(cv, { ...S, swipe: 'Swipe to see how' }, 3, 7, null, { look: 'dark' });
    CanvasRenderingContext2D.prototype.fillText = ft; window.__cv = null;
    return { seen, fonts, titleTop: r.blocks.title };
  }, { S: SLIDES[3] });
  assert.equal(o.seen['IDEA'], '#ffd9a0'); assert.equal(o.seen['1'], '#ffd9a0'); assert.equal(o.seen['Swipe to see how'], '#ffd9a0');
  assert.equal(o.seen['Start with one question'], '#ffffff'); assert.equal(o.seen['Ask it one clear thing.'], '#f3f1ee');
  assert.equal(o.seen['@drlizlondon'], 'rgba(255, 255, 255, 0.9)'); assert.equal(o.seen['4 / 7'], 'rgba(255, 255, 255, 0.85)');
  assert.ok(/^800 /.test(o.fonts['1']) && /^800 /.test(o.fonts['Start with one question']) && /^500 /.test(o.fonts['Ask it one clear thing.']) && /^(700|bold) /.test(o.fonts['Swipe to see how']) && /^(700|bold) /.test(o.fonts['IDEA']) && /^(700|bold) /.test(o.fonts['@drlizlondon']), JSON.stringify(o.fonts));
  assert.equal(Math.round(parseFloat(o.fonts['1'].split(' ')[1])), Math.round(92 * DKW), 'num 92 card px');
  assert.equal(Math.round(parseFloat(o.fonts['Start with one question'].split(' ')[1])), Math.round(30 * DKW), 'title 30 card px');
});
await t('SOC-26 dark: the stack is bottom-aligned at 46 card px from the bottom, left edge at 34 card px, in the template order kicker, num, title, sub, swipe', async () => {
  const o = await page.evaluate(({ S }) => OneLook.renderSlide(document.createElement('canvas'), { ...S, swipe: 'Swipe' }, 3, 7, null, { look: 'dark' }), { S: SLIDES[3] });
  const b = o.blocks, H = 1350;
  assert.ok(Math.abs((b.swipe.y + b.swipe.h) - (H - 46 * DKW)) <= 1.5, 'bottom ' + (b.swipe.y + b.swipe.h));
  for (const k of ['kicker', 'num', 'title', 'sub', 'swipe']) assert.ok(Math.abs(b[k].x - 34 * DKW) <= 0.5, k + ' x ' + b[k].x);
  assert.ok(b.kicker.y < b.num.y && b.num.y < b.title.y && b.title.y < b.sub.y && b.sub.y < b.swipe.y);
  assert.equal(o.fits, true);
  assert.ok(Math.abs(b.handle.x - 30 * DKW) <= 0.5 && Math.abs(b.handle.y - 24 * DKW) <= 0.5, 'handle ' + JSON.stringify(b.handle));
});
await t('SOC-26 dark: a long title wraps to 3 lines inside the 34 card px margins and still fits; a huge one reports fits:false', async () => {
  const o = await page.evaluate(({ S }) => {
    const seen = []; const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (tx, x) { if (this.canvas === window.__cv) seen.push([tx, x, this.measureText(tx).width]); return ft.apply(this, arguments); };
    const cv = document.createElement('canvas'); window.__cv = cv;
    const r = OneLook.renderSlide(cv, { ...S, num: '01', title: 'I stopped holding my whole life in my head and started writing every single small thing down in one place', swipe: 'Swipe to see how' }, 0, 5, null, { look: 'dark' });
    CanvasRenderingContext2D.prototype.fillText = ft; window.__cv = null;
    const huge = OneLook.renderSlide(document.createElement('canvas'), { ...S, title: ('word ').repeat(400) }, 0, 5, null, { look: 'dark' });
    return { seen, fits: r.fits, hugeFits: huge.fits, ts: r.titleSize };
  }, { S: SLIDES[3] });
  const lines = o.seen.filter(([tx]) => /^(I stopped|life|writing|every|one place|small|in my|started)/.test(tx) && tx.length > 6 && !/Swipe/.test(tx));
  assert.ok(lines.length >= 3, 'wrapped: ' + JSON.stringify(o.seen.map(z => z[0])));
  for (const [, x, w] of lines) assert.ok(x + w <= 1080 - 34 * DKW + 1, 'inside the right margin');
  assert.equal(o.fits, true); assert.equal(o.hugeFits, false);
});
await t('SOC-26 dark: keeps the photo guards: face check runs (boolean), lowRes is true for a 400x500 photo, false for 1080x1350, null with no photo', async () => {
  const r = await page.evaluate(({ S }) => {
    const f = (img, o) => OneLook.renderSlide(document.createElement('canvas'), S, 3, 4, img, { look: 'dark', ...o });
    return { small: f(mkImg(400, 500), {}).lowRes, exact: f(mkImg(1080, 1350), {}).lowRes, none: f(null, {}).lowRes, face: typeof f(mkImg(1200, 1600), { face: { x: 0.35, y: 0.15, w: 0.3, h: 0.22 } }).faceClear, noface: f(mkImg(1200, 1600), {}).faceClear };
  }, { S: SLIDES[3] });
  assert.deepEqual(r, { small: true, exact: false, none: null, face: 'boolean', noface: null });
});
await t('SOC-26 dark: empty fields draw nothing (G1): no kicker, number, title, sub or swipe text from a blank slide', async () => {
  const seen = await page.evaluate(() => {
    const out = []; const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (tx) { if (this.canvas === window.__cv) out.push(tx); return ft.apply(this, arguments); };
    const cv = document.createElement('canvas'); window.__cv = cv;
    OneLook.renderSlide(cv, { handle: '', kicker: '', num: '', title: '', sub: '', swipe: '' }, 0, 3, null, { look: 'dark' });
    CanvasRenderingContext2D.prototype.fillText = ft; window.__cv = null; return out;
  });
  assert.deepEqual(seen, ['1 / 3'], 'only the page counter');
});
await t('SOC-26 dark leaves no state behind: a photo-look draw after a dark draw is identical to one with no dark draw before', async () => {
  const o = await page.evaluate(({ S }) => {
    const d = opts => { const c = document.createElement('canvas'); OneLook.renderSlide(c, S, 3, 4, mkImg(1200, 1600), opts); return c.toDataURL(); };
    const a = d({}); d({ look: 'dark' }); return a === d({});
  }, { S: SLIDES[3] });
  assert.ok(o);
});
// ---- SOC-26: the photo finish (numbers are the SOC-26 brief's design values) ----
await t('SOC-26 finish (must-fail fixture): a flat, low-contrast mid-grey photo gets a wider range with the finish than without, in the photo look and the dark look', async () => {
  const o = await page.evaluate(() => {
    const flat = document.createElement('canvas'); flat.width = 1080; flat.height = 1350; const fx = flat.getContext('2d');
    const g = fx.createLinearGradient(0, 0, 1080, 0); g.addColorStop(0, 'rgb(110,110,110)'); g.addColorStop(1, 'rgb(146,146,146)'); fx.fillStyle = g; fx.fillRect(0, 0, 1080, 1350);
    const E = { handle: '', kicker: '', num: '', title: '', sub: '', swipe: '' };
    const sd = (look, finish) => { const cv = document.createElement('canvas'); OneLook.renderSlide(cv, E, 0, 1, flat, { look, finish }); const d = cv.getContext('2d').getImageData(700, 500, 300, 1).data; let m = 0, n = 0; for (let k = 0; k < d.length; k += 4) { m += d[k + 1]; n++; } m /= n; let v = 0; for (let k = 0; k < d.length; k += 4) v += (d[k + 1] - m) ** 2; return Math.sqrt(v / n); };
    return { pOn: sd('photo', true), pOff: sd('photo', false), dOn: sd('dark', true), dOff: sd('dark', false) };
  });
  assert.ok(o.pOn > o.pOff * 1.25, 'photo ' + JSON.stringify(o)); assert.ok(o.dOn > o.dOff * 1.25, 'dark ' + JSON.stringify(o));
});
await t('SOC-26 finish: a near-perfect photo (full range 4..250) changes little: mean abs difference per channel <= 8, and a flat photo keeps its brightness', async () => {
  const o = await page.evaluate(() => {
    const mk = (a, b) => { const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 1080, 0); g.addColorStop(0, `rgb(${a},${a},${a})`); g.addColorStop(1, `rgb(${b},${b},${b})`); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350); return c; };
    const E = { handle: '', kicker: '', num: '', title: '', sub: '', swipe: '' };
    const px = (img, finish) => { const cv = document.createElement('canvas'); OneLook.renderSlide(cv, E, 0, 1, img, { look: 'photo', finish }); return cv.getContext('2d').getImageData(700, 500, 300, 100).data; };
    const diff = (a, b) => { let s = 0, n = 0; for (let k = 0; k < a.length; k += 4) for (let c = 0; c < 3; c++) { s += Math.abs(a[k + c] - b[k + c]); n++; } return s / n; };
    const perfect = mk(4, 250), flatImg = mk(200, 200);
    const f = px(flatImg, true), nf = px(flatImg, false);
    return { perfect: diff(px(perfect, true), px(perfect, false)), flatMean: [f[1], nf[1]] };
  });
  assert.ok(o.perfect <= 8, 'mean diff ' + o.perfect); assert.ok(o.perfect > 0, 'it is not a no-op');
  assert.ok(Math.abs(o.flatMean[0] - o.flatMean[1]) <= 8, 'a flat photo keeps its brightness ' + o.flatMean);
});
await t('SOC-26 finish skin protection (brief rev2): skin-hue patches (120,80,60 and 200,150,120) change by <= 6 mean luminance and <= 4 in R-B, in the photo look and the dark look', async () => {
  const o = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 1080, 0); g.addColorStop(0, 'rgb(40,40,40)'); g.addColorStop(1, 'rgb(200,200,200)'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    const P = [[120, 80, 60, 150, 300], [200, 150, 120, 450, 300]]; for (const [r, gg, b, px, py] of P) { x.fillStyle = `rgb(${r},${gg},${b})`; x.fillRect(px, py, 120, 120); }
    const E = { handle: '', kicker: '', num: '', title: '', sub: '', swipe: '' };
    const read = (look, finish) => { const cv = document.createElement('canvas'); OneLook.renderSlide(cv, E, 0, 1, c, { look, finish }); const cx = cv.getContext('2d'); return P.map(([r, gg, b, px, py]) => { const d = cx.getImageData(px + 30, py + 30, 60, 60).data; let R = 0, G = 0, B = 0, n = 0; for (let k = 0; k < d.length; k += 4) { R += d[k]; G += d[k + 1]; B += d[k + 2]; n++; } R /= n; G /= n; B /= n; return { y: 0.299 * R + 0.587 * G + 0.114 * B, rb: R - B }; }); };
    const out = {}; for (const look of ['photo', 'dark']) { const a = read(look, true), b = read(look, false); out[look] = a.map((v, i) => ({ dy: Math.abs(v.y - b[i].y), drb: Math.abs(v.rb - b[i].rb) })); }
    return out;
  });
  for (const look of ['photo', 'dark']) for (const v of o[look]) { assert.ok(v.dy <= 6, look + ' luminance moved ' + JSON.stringify(o)); assert.ok(v.drb <= 4, look + ' R-B moved ' + JSON.stringify(o)); }
});
await t('SOC-26 finish highlight cap (brief rev2): no pixel with original luminance above 150 is raised by more than 6 (mean over a grey patch at 200 inside a dark photo)', async () => {
  const o = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d'); x.fillStyle = 'rgb(60,60,60)'; x.fillRect(0, 0, 1080, 1350); x.fillStyle = 'rgb(200,200,200)'; x.fillRect(500, 300, 200, 200);
    const E = { handle: '', kicker: '', num: '', title: '', sub: '', swipe: '' };
    const rd = f => { const cv = document.createElement('canvas'); OneLook.renderSlide(cv, E, 0, 1, c, { look: 'dark', finish: f }); const d = cv.getContext('2d').getImageData(560, 360, 80, 80).data; let m = 0, n = 0; for (let k = 0; k < d.length; k += 4) { m += d[k + 1]; n++; } return m / n; };
    return rd(true) - rd(false);
  });
  assert.ok(o <= 6.5, 'raised by ' + o);
});
await t('SOC-26 finish gain clamp (brief rev2, 1.25): a narrow 120..130 gradient widens by at most 1.25x (+2), it does not explode to the full range', async () => {
  const o = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1080; c.height = 1350; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 1080, 0); g.addColorStop(0, 'rgb(120,120,120)'); g.addColorStop(1, 'rgb(130,130,130)'); x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
    const E = { handle: '', kicker: '', num: '', title: '', sub: '', swipe: '' };
    const sp = f => { const cv = document.createElement('canvas'); OneLook.renderSlide(cv, E, 0, 1, c, { look: 'dark', finish: f }); const cx = cv.getContext('2d'); return cx.getImageData(1000, 500, 1, 1).data[1] - cx.getImageData(80, 500, 1, 1).data[1]; }; return { on: sp(true), off: sp(false) };
  });
  assert.ok(o.on <= o.off * 1.25 + 3, 'span ' + JSON.stringify(o)); assert.ok(o.on >= o.off, 'span ' + JSON.stringify(o));
});
await t('SOC-26 finish: deterministic, runs only on the photo (no photo = no change), skipped when finish is false; lowRes unchanged by it', async () => {
  const o = await page.evaluate(({ S }) => {
    const d = (img, opts) => { const c = document.createElement('canvas'); const r = OneLook.renderSlide(c, S, 3, 4, img, { look: 'dark', ...opts }); return { u: c.toDataURL(), low: r.lowRes }; };
    const im = mkImg(1200, 1600);
    return { same: d(im, {}).u === d(im, {}).u, differs: d(im, {}).u !== d(im, { finish: false }).u, noPhoto: d(null, {}).u === d(null, { finish: false }).u, low: [d(mkImg(400, 500), {}).low, d(mkImg(400, 500), { finish: false }).low] };
  }, { S: SLIDES[3] });
  assert.ok(o.same && o.differs && o.noPhoto); assert.deepEqual(o.low, [true, true]);
});
await t('SOC-26 finish golden: a fixed photo through the finish (photo look and dark look) hashes to the stored values (tests/fixtures/look-golden.json finishPhoto, finishDark)', async () => {
  const h = await page.evaluate(({ S }) => {
    const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16) + ':' + s.length; };
    const d = look => { const c = document.createElement('canvas'); OneLook.renderSlide(c, S, 3, 7, mkImg(1200, 1600), { look }); return hash(c.toDataURL()); };
    return { finishPhoto: d('photo'), finishDark: d('dark') };
  }, { S: SLIDES[3] });
  const gp = path.join(here, 'fixtures/look-golden.json'), g = JSON.parse(fs.readFileSync(gp, 'utf8'));
  if (process.env.GOLDEN_WRITE) { Object.assign(g, h); fs.writeFileSync(gp, JSON.stringify(g, null, 1) + '\n'); }
  assert.equal(h.finishPhoto, g.finishPhoto); assert.equal(h.finishDark, g.finishDark);
});
await t('SOC-26 dark: soft text shadow 0 2px 12px rgba(0,0,0,.35) x 1080/460 on the white and cream text (handle, counter, title, sub) and not on the accent text', async () => {
  const o = await page.evaluate(({ S }) => {
    const seen = {}; const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (tx, ...a) { if (this.canvas === window.__cv) seen[tx] = [this.shadowColor, this.shadowBlur, this.shadowOffsetY]; return ft.call(this, tx, ...a); };
    const cv = document.createElement('canvas'); window.__cv = cv;
    OneLook.renderSlide(cv, { ...S, swipe: 'Swipe' }, 3, 7, null, { look: 'dark' });
    CanvasRenderingContext2D.prototype.fillText = ft; window.__cv = null; return seen;
  }, { S: SLIDES[3] });
  const K = 1080 / 460;
  for (const k of ['@drlizlondon', '4 / 7', 'Start with one question', 'Ask it one clear thing.']) { assert.equal(o[k][0], 'rgba(0, 0, 0, 0.35)', k); assert.ok(Math.abs(o[k][1] - 12 * K) < 0.01 && Math.abs(o[k][2] - 2 * K) < 0.01, k + ' ' + o[k]); }
  for (const k of ['IDEA', '1', 'Swipe']) assert.equal(o[k][1], 0, k + ' has no shadow');
});
await t('SOC-24 photo look is pixel-identical to before: look "photo" and no look give the same pixels, and both match the pre-SOC-24 golden hashes', async () => {
  const o = await page.evaluate(({ S }) => {
    const img = mkImg(1200, 1600), face = { x: 0.35, y: 0.15, w: 0.3, h: 0.22 };
    const d = opts => { const c = document.createElement('canvas'); OneLook.renderSlide(c, S, 3, 4, img, opts); return c.toDataURL(); };
    return { same: d({ face }) === d({ face, look: 'photo' }), darkDiffers: d({ face }) !== d({ face, look: 'dark' }) };
  }, { S: SLIDES[3] });
  assert.ok(o.same); assert.ok(o.darkDiffers);
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
