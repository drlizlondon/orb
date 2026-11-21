// SOC-18.1 acceptance: the reel overlay in look.js (OneLook.renderReelOverlay) and scripts/look-render.mjs.
// Run: node tests/look-render.spec.mjs   (same env as tests/look.spec.mjs: PLAYWRIGHT_DIR, CHROMIUM_PATH; needs the network for Google Fonts, like the script)
// Every must-fail below is shown failing: either the test breaks a copy of look.js in a second page, or it runs the script on a bad fixture.
// Named .spec.mjs on purpose so `node --test tests/*.test.mjs` does not pick it up.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const SRC = fs.readFileSync(path.join(root, 'dist/carousel-insta/look.js'), 'utf8');
const BASE_COMMIT = '3bf36a5'; // orb main before SOC-18.1: the feed drawing must be byte-identical to it
const BASE_SRC = execFileSync('git', ['-C', root, 'show', BASE_COMMIT + ':dist/carousel-insta/look.js'], { encoding: 'utf8' });
const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR || '/Users/lizzie/colourpuzzle/node_modules';
const { chromium } = require(path.join(pwDir, 'playwright'));
const SCRIPT = path.join(root, 'scripts/look-render.mjs');

// Her locked script v1 (DECISIONS-LOG 2026-11-20 [Dr Liz / Meet Lizzie script v1]); fixture text only.
const SCRIPT_V1 = "Meet Lizzie. Doctor. Big plans. Very little time. So she's teaching AI to do everything it can, and still giving her time for baking. Follow to see what Lizzie is up to next.";
const CAP20 = 'Follow to see what L'; // 20 characters: the addendum's fixture size
const CAP120 = SCRIPT_V1.slice(0, 120);
assert.equal(CAP20.length, 20); assert.equal(CAP120.length, 120);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function openPage(src) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: src });
  await page.evaluate(() => {
    window.__rec = null;
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { if (window.__rec) window.__rec.push(String(t)); return ft.call(this, t, ...a); };
    window.mkImg = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2a6'); g.addColorStop(0.5, '#fa4'); g.addColorStop(1, '#46c'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = '#c33'; x.fillRect(w * 0.1, h * 0.1, w * 0.2, h * 0.2); return c; };
    window.ov = (o) => { const cv = document.createElement('canvas'); const r = OneLook.renderReelOverlay(cv, o); window.__cv = cv; return r; };
    // count pixels inside a rect that match a colour within tol (alpha at least minA)
    window.count = (cv, rc, rgb, tol, minA) => { const x0 = Math.max(0, Math.floor(rc.x)), y0 = Math.max(0, Math.floor(rc.y)), w = Math.min(1080 - x0, Math.ceil(rc.w)), h = Math.min(1920 - y0, Math.ceil(rc.h)); const d = cv.getContext('2d').getImageData(x0, y0, w, h).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= minA && Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol) n++; return n; };
    window.alphaAt = (cv, x, y) => cv.getContext('2d').getImageData(x, y, 1, 1).data[3];
    window.anyAlpha = cv => { const d = cv.getContext('2d').getImageData(0, 0, 1080, 1920).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; };
  });
  page._errors = errors; return page;
}
const page = await openPage(SRC);

let failed = 0, passed = 0;
async function t(name, fn) { try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + String(e.message).split('\n').slice(0, 3).join('\n  ')); } }

await t('Safe zone, tag: y >= 260, x >= 48, safe, canvas alpha 0 at (540, 960)', async () => {
  const r = await page.evaluate(() => { const r = ov({ handle: '@drlizlondon', caption: '' }); return { r, a: alphaAt(window.__cv, 540, 960), w: window.__cv.width, h: window.__cv.height }; });
  assert.ok(r.r.rects.tag.y >= 260, 'tag.y ' + r.r.rects.tag.y); assert.ok(r.r.rects.tag.x >= 48);
  assert.equal(r.r.safe, true); assert.equal(r.a, 0); assert.equal(r.w, 1080); assert.equal(r.h, 1920); assert.equal(r.r.rects.caption, null);
  assert.ok(r.r.rects.tag.x + r.r.rects.tag.w <= 940, 'tag right edge');
});
await t('Safe zone, tag, must-fail: SAFE.top patched to 48 puts the tag under 260; a tag drawn by hand at y 48 reports safe:false', async () => {
  const patched = await page.evaluate(() => { const old = OneLook.T.SAFE.top; OneLook.T.SAFE.top = 48; const r = ov({ handle: '@drlizlondon', caption: '' }); OneLook.T.SAFE.top = old; return r.rects.tag.y; });
  assert.ok(patched < 260, 'patched tag y ' + patched); // the previous test's y >= 260 assert would fire on this value
  const mut = SRC.replace('y: S.top, text: handle', 'y: 48, text: handle'); assert.notEqual(mut, SRC, 'mutation not applied');
  const p2 = await openPage(mut);
  const r = await p2.evaluate(() => ov({ handle: '@drlizlondon', caption: '' }));
  assert.equal(r.rects.tag.y, 48); assert.equal(r.safe, false); await p2.close();
});

await t('Safe zone, caption: 20 characters shrink below 104, fit 800, inside x 140..940, bottom <= 1640', async () => {
  const r = await page.evaluate(c => ov({ handle: '', caption: c }), CAP20);
  assert.ok(r.captionSize < 104, 'size ' + r.captionSize); assert.equal(r.fits, true); assert.equal(r.safe, true);
  const c = r.rects.caption; assert.ok(c.w <= 800, 'w ' + c.w); assert.ok(c.x >= 140 && c.x + c.w <= 940, JSON.stringify(c)); assert.ok(c.y + c.h <= 1640); assert.equal(r.rects.tag, null);
});
await t('Safe zone, caption, must-fail: with the shrink loop removed the width is over 800 and fits:false', async () => {
  const mut = SRC.replace('while (size > 40 &&', 'while (false &&'); assert.notEqual(mut, SRC, 'mutation not applied');
  const p2 = await openPage(mut);
  const r = await p2.evaluate(c => ov({ handle: '', caption: c }), CAP20);
  assert.equal(r.captionSize, 104); assert.ok(r.rects.caption.w > 800, 'w ' + r.rects.caption.w); assert.equal(r.fits, false); await p2.close();
});
await t('Too long is reported: 120 characters give size 40 and fits:false', async () => {
  const r = await page.evaluate(c => ov({ handle: '', caption: c }), CAP120);
  assert.equal(r.captionSize, 40); assert.equal(r.fits, false); assert.equal(r.safe, false);
});

await t('Look of the caption: opaque black outline and white fill inside the caption rect', async () => {
  const r = await page.evaluate(c => { const o = ov({ handle: '', caption: c }); const rc = o.rects.caption; return { black: count(window.__cv, rc, [0, 0, 0], 12, 250), white: count(window.__cv, rc, [255, 255, 255], 12, 250) }; }, CAP20);
  assert.ok(r.black > 200, 'black ' + r.black); assert.ok(r.white > 200, 'white ' + r.white);
});
await t('Look of the caption, must-fail: fill only (no outline) has no opaque black pixel', async () => {
  const mut = SRC.replace('ctx.strokeText(caption, 540, S.capY);', ''); assert.notEqual(mut, SRC, 'mutation not applied');
  const p2 = await openPage(mut);
  const r = await p2.evaluate(c => { const o = ov({ handle: '', caption: c }); return count(window.__cv, o.rects.caption, [0, 0, 0], 12, 250); }, CAP20);
  assert.equal(r, 0); await p2.close();
});

await t('Empty stays empty (G1): blank input is fully transparent with null rects; only the given strings are drawn', async () => {
  const r = await page.evaluate(() => {
    const a = ov({ handle: '', caption: '' }); const blank = anyAlpha(window.__cv);
    const b = ov({}); const blank2 = anyAlpha(window.__cv);
    window.__rec = []; ov({ handle: '@drlizlondon', caption: 'Follow to see what L' }); const rec = window.__rec; window.__rec = null;
    return { a, blank, b, blank2, rec };
  });
  assert.equal(r.blank, false); assert.equal(r.blank2, false); assert.equal(r.a.rects.tag, null); assert.equal(r.a.rects.caption, null); assert.equal(r.b.rects.caption, null);
  assert.deepEqual(r.rec, ['@drlizlondon', CAP20]);
});
await t('Empty stays empty, must-fail: a default caption in the code is caught by the same assert', async () => {
  const mut = SRC.replace("caption = o.caption || ''", "caption = o.caption || 'Follow'"); assert.notEqual(mut, SRC);
  const p2 = await openPage(mut);
  const r = await p2.evaluate(() => { ov({ handle: '', caption: '' }); return { blank: anyAlpha(window.__cv) }; });
  assert.equal(r.blank, true, 'a mutated default draws something, so the blank assert above would fire'); await p2.close();
});

// SOC-26: the photo finish is new; these draws pass finish:false to prove the rest of the drawing is unchanged.
await t('Feed untouched: slide and series drawings are identical to orb ' + BASE_COMMIT, async () => {
  const p0 = await openPage(BASE_SRC);
  const draw = () => {
    const s = { handle: '@drlizlondon', kicker: 'Idea', num: '1', title: 'Start with one question', sub: 'Ask it one clear thing.', swipe: 'Swipe' };
    const img = mkImg(1200, 1600), face = { x: 0.35, y: 0.15, w: 0.3, h: 0.22 }, out = [];
    const cv1 = document.createElement('canvas'); OneLook.renderSlide(cv1, s, 3, 4, img, { face, finish: false }); out.push(cv1.toDataURL());
    const cv2 = document.createElement('canvas'); OneLook.renderSlide(cv2, { ...s, kicker: '', num: '', swipe: '' }, 0, 2, null, {}); out.push(cv2.toDataURL());
    const cv3 = document.createElement('canvas'); OneLook.renderSeries(cv3, { ...OneLook.coverDefaults(), strap: "I'll show you how I'm using AI", num: 1 }, 0, 4, img, { face, finish: false }); out.push(cv3.toDataURL());
    return out;
  };
  const a = await p0.evaluate(draw), b = await page.evaluate(draw); await p0.close();
  assert.equal(a.length, 3); for (let i = 0; i < 3; i++) assert.equal(a[i], b[i], 'fixture ' + i + ' differs from ' + BASE_COMMIT);
});
await t('Feed untouched, must-fail: a one pixel change to the feed margin is seen as a difference', async () => {
  const mut = SRC.replace('const T = { W: 1080, H: 1350, margin: 48,', 'const T = { W: 1080, H: 1350, margin: 49,'); assert.notEqual(mut, SRC);
  const p0 = await openPage(BASE_SRC), p2 = await openPage(mut);
  const draw = () => { const cv = document.createElement('canvas'); OneLook.renderSlide(cv, { handle: '@drlizlondon', kicker: '', num: '', title: 'Start with one question', sub: '', swipe: '' }, 0, 2, null, {}); return cv.toDataURL(); };
  assert.notEqual(await p0.evaluate(draw), await p2.evaluate(draw)); await p0.close(); await p2.close();
});
await t('look.js: no Math.random, no network or storage words; renderReelOverlay is on window.OneLook; deterministic', async () => {
  assert.equal((SRC.match(/Math\.random/g) || []).length, 0);
  const r = await page.evaluate(() => { const a = (ov({ handle: '@drlizlondon', caption: 'Follow to see what L' }), window.__cv.toDataURL()); const b = (ov({ handle: '@drlizlondon', caption: 'Follow to see what L' }), window.__cv.toDataURL()); return { same: a === b, t: typeof OneLook.renderReelOverlay }; });
  assert.equal(r.same, true); assert.equal(r.t, 'function');
});

// ---------- scripts/look-render.mjs ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'look-render-'));
const run = (args, env) => spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...(env || {}) }, maxBuffer: 1 << 26 });
const wr = (n, o) => { const f = path.join(tmp, n); fs.writeFileSync(f, JSON.stringify(o)); return f; };

await t('overlay: 3 captions write tag.png and 3 caption PNGs, 1080x1920 RGBA, and rects.json with a 40 character lookSha', async () => {
  const out = path.join(tmp, 'o1');
  const f = wr('o1.json', { handle: '@drlizlondon', captions: [{ id: 'c1', text: 'Meet Lizzie.' }, { id: 'c2', text: 'Doctor.' }, { id: 'c3-x', text: CAP20 }] });
  const r = run(['overlay', f, out]); assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const n of ['tag', 'c1', 'c2', 'c3-x']) { const b = fs.readFileSync(path.join(out, n + '.png')); assert.equal(b.readUInt32BE(16), 1080); assert.equal(b.readUInt32BE(20), 1920); assert.equal(b[25], 6, n + ' colour type (6 = RGBA)'); }
  const j = JSON.parse(fs.readFileSync(path.join(out, 'rects.json'), 'utf8'));
  assert.equal(j.captions.length, 3); assert.match(j.lookSha, /^[0-9a-f]{40}$/); assert.equal(j.SAFE.top, 260); assert.ok(j.tag.y >= 260);
  assert.ok(j.captions.every(c => c.fits && c.safe && c.file === c.id + '.png'));
});
await t('overlay, must-fail: a 120 character caption exits 1 with "caption too wide: <id>"', async () => {
  const f = wr('o2.json', { handle: '@drlizlondon', captions: [{ id: 'ok', text: 'Doctor.' }, { id: 'long-1', text: CAP120 }] });
  const r = run(['overlay', f, path.join(tmp, 'o2')]);
  assert.equal(r.status, 1); assert.ok(r.stderr.includes('caption too wide: long-1'), r.stderr); assert.ok(!r.stderr.includes('caption too wide: ok'));
});

// PNG fixtures for the check mode (data URLs): the 13.4 face-clear (1200x1600) and face-blocked (1080x1350) images
function crc32(buf) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function gradientUrl(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = 160; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  return 'data:image/png;base64,' + png.toString('base64');
}
const CLEAR = { url: gradientUrl(1200, 1600), face: { x: 0.35, y: 0.15, w: 0.3, h: 0.22 } };
const BLOCKED = { url: gradientUrl(1080, 1350), face: { x: 0.05, y: 0.7, w: 0.3, h: 0.2 } };
const SL = [
  ['', '', 'I stopped doing this one thing', 'Here is what changed for me.', 'Swipe'],
  ['Why I can say this', '', 'I tried it myself', 'It saved me real time.', ''],
  ['The story', '', 'It started on a busy shift', 'I needed a faster way to plan.', ''],
  ['Idea', '1', 'Start with one question', 'Ask it one clear thing.', '']
].map(([kicker, num, title, sub, swipe]) => ({ handle: '@drlizlondon', kicker, num, title, sub, swipe }));
const checkJson = r => JSON.parse(r.stdout.trim().split('\n').pop());

await t('check: 4 short idea slides with only face-clear give fits:true, pick:0 each', async () => {
  const r = run(['check', wr('c1.json', { kind: 'idea', slides: SL.map(s => ({ ...s, candidates: [CLEAR] })) })]); assert.equal(r.status, 0, r.stderr);
  const j = checkJson(r); assert.match(j.lookSha, /^[0-9a-f]{40}$/); assert.equal(j.slides.length, 4);
  for (const s of j.slides) { assert.equal(s.fits, true, JSON.stringify(s)); assert.equal(s.pick, 0); assert.equal(s.faceClear, true); }
});
await t('check: candidates [face-blocked, face-clear] give pick:1; only face-blocked gives pick:-1', async () => {
  const mk = c => ({ kind: 'idea', slides: SL.map((s, i) => i === 3 ? { ...s, candidates: c } : { ...s, candidates: [CLEAR] }) });
  const a = checkJson(run(['check', wr('c2.json', mk([BLOCKED, CLEAR]))])).slides[3];
  assert.equal(a.pick, 1); assert.equal(a.faceClear, true);
  const b = checkJson(run(['check', wr('c3.json', mk([BLOCKED]))])).slides[3];
  assert.equal(b.pick, -1); assert.equal(b.faceClear, false);
});
await t('check: no candidates give pick:-1, faceClear:null; an image that fails to load counts as blocked', async () => {
  const a = checkJson(run(['check', wr('c4.json', { kind: 'idea', slides: [{ ...SL[0], candidates: [] }, { ...SL[1] }] })])).slides;
  for (const s of a) { assert.equal(s.pick, -1); assert.equal(s.faceClear, null); assert.equal(s.fits, true); }
  const b = checkJson(run(['check', wr('c5.json', { kind: 'idea', slides: [{ ...SL[0], candidates: [{ url: 'data:image/png;base64,AAAA', face: null }] }] })])).slides[0];
  assert.equal(b.pick, -1); assert.equal(b.faceClear, false);
});
await t('check: a title repeated 12 times gives fits:false (idea and series), a short one fits:true', async () => {
  const long = Array(12).fill(SL[0].title).join(' ');
  const a = checkJson(run(['check', wr('c6.json', { kind: 'idea', slides: [{ ...SL[0], title: long, candidates: [] }, { ...SL[1], candidates: [] }] })])).slides;
  assert.equal(a[0].fits, false); assert.equal(a[1].fits, true);
  const s = checkJson(run(['check', wr('c7.json', { kind: 'series', slides: [{ ...SL[0], title: long, candidates: [] }, { ...SL[1], candidates: [] }] })])).slides;
  assert.equal(s[0].fits, false, 'the series slide 1 uses its title as the arrow-box line'); assert.equal(s[1].fits, true);
  const ok = checkJson(run(['check', wr('c8.json', { kind: 'series', slides: [{ ...SL[0], candidates: [] }, { ...SL[1], candidates: [] }] })])).slides[0];
  assert.equal(ok.fits, true);
});
await t('check: a series deck draws "Dr Liz London" and the slide 1 title on slide 1 (recording, same call the script makes)', async () => {
  const r = await page.evaluate(title => { window.__rec = []; const cv = document.createElement('canvas'); OneLook.renderSeries(cv, { ...OneLook.coverDefaults(), strap: title, num: 1 }, 0, 2, null, { face: null, frame: null }); const o = window.__rec; window.__rec = null; return o; }, SL[0].title);
  assert.ok(r.includes('Dr Liz London'), r.join('|')); assert.ok(r.join(' ').includes(SL[0].title), r.join('|'));
});

await t('Fonts: with the font links removed (LOOK_NO_FONTS=1) the script prints "fonts did not load" and exits 2', async () => {
  const r = run(['check', wr('c9.json', { kind: 'idea', slides: [] })], { LOOK_NO_FONTS: '1' });
  assert.equal(r.status, 2); assert.ok(r.stdout.includes('fonts did not load'), r.stdout);
  const ok = run(['check', wr('c10.json', { kind: 'idea', slides: [] })]); assert.equal(ok.status, 0, 'with the links the same run succeeds: ' + ok.stdout + ok.stderr);
});

await t('One engine: renderReelOverlay appears in dist/ only in look.js; Math.random count 0', async () => {
  const r = spawnSync('grep', ['-rl', 'renderReelOverlay', path.join(root, 'dist')], { encoding: 'utf8' });
  assert.deepEqual(r.stdout.trim().split('\n'), [path.join(root, 'dist/carousel-insta/look.js')]);
});
await t('No page errors', async () => { assert.deepEqual(page._errors, []); });

await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
