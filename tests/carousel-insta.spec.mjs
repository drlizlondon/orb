// SOC-13.2 acceptance (Insta Creator): Playwright against a local static server + a stubbed Worker. No live Worker is ever called.
// Run: node tests/carousel-insta.spec.mjs   (Playwright is not an Orb dependency; set PLAYWRIGHT_DIR to a node_modules that has it,
//   and CHROMIUM_PATH to a headless chromium if the default browser is not installed.)
// PAGE_FILE=<path> runs the same tests against another copy of index.html (used by tests/creator-mutations.spec.mjs: every
// must-fail below is proved by breaking a copy of the page and watching this suite go red).
// Named .spec.mjs on purpose so `node --test tests/*.test.mjs` does not pick it up.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const FILE = process.env.PAGE_FILE || path.join(root, 'dist/carousel-insta/index.html');
const LOOK = path.join(root, 'dist/carousel-insta/look.js');
const REEL = path.join(root, 'dist/carousel-insta/reel.js');
const OLD_PAGE = path.join(here, 'fixtures/carousel-insta-66d8942.html'); // the page as it was at orb 66d8942 (106 controls, 43 editable, 7.2 screens)
const COVER = path.join(root, 'dist/cover-series/index.html');
const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR || '/Users/lizzie/colourpuzzle/node_modules';
const { chromium } = require(path.join(pwDir, 'playwright'));
const TOKEN = 'test-token-not-real-0001'; // fake, test only

// ---- coloured PNGs (gradients) so "not flat" is meaningful ----
function crc32(buf) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function gradientPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = 160; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// SOC-25: the creator refuses photos smaller than the slide needs (scale > 1), so the fixtures are real slide-sized photos.
const PNG_34 = gradientPng(2160, 2880); // 3:4 (twice the slide: the Edit zoom goes to 2x without upscaling), like a phone photo
const PNG_45 = gradientPng(2160, 2700); // 4:5, exactly the slide shape: no room to move
const PNG_EXACT = gradientPng(1080, 1350); // exactly the slide: 1 output px per source px, still sharp
const PNG_SMALL = gradientPng(400, 500); // too small for a sharp 1080x1350 slide
// the 13.4 fixtures: face-clear (3:4) and face-blocked (4:5, no room)
const FACE_CLEAR = { x: 0.35, y: 0.15, w: 0.3, h: 0.22 };
const FACE_BLOCKED = { x: 0.05, y: 0.7, w: 0.3, h: 0.2 };
const ALBUM = [
  { guid: 'gc0', width: 2160, height: 2880, caption: '', face: FACE_CLEAR },
  { guid: 'gc1', width: 2160, height: 2880, caption: '', face: FACE_CLEAR },
  { guid: 'gc2', width: 2160, height: 2880, caption: '', face: FACE_CLEAR },
  { guid: 'gb', width: 2160, height: 2700, caption: '', face: FACE_BLOCKED },
  { guid: 'gn', width: 2160, height: 2880, caption: '' }, // no face key at all
  { guid: 'ge', width: 1080, height: 1350, caption: '' }, // SOC-25: exactly slide-sized, no face key
  { guid: 'gs', width: 400, height: 500, caption: '', face: FACE_CLEAR } // SOC-25: too small
];

// ---- stub Worker state (cross-origin to the static server, like production) ----
let st;
const calls = [];
function mkDeck(n, tag, photoFor) { return Array.from({ length: n }, (_, i) => ({ kicker: i ? 'Fixture kicker' : '', num: '', title: i ? `Fixture ${tag} line ${i + 1}` : `Fixture ${tag}`, sub: `Fixture second line ${i + 1}.`, swipe: i === 0 ? 'Swipe' : '', photo: photoFor ? photoFor(i) : 'gc' + (i % 3) })); }
function mk(n, kind, tag, o = {}) { return { id: 'c-' + tag, concept: (kind === 'series' ? 'Build notes: ' : 'Idea: ') + tag, lane: 'wide', kind, status: 'drafted', createdAt: o.createdAt || '2026-11-19T07:00:00Z', deck: { slides: mkDeck(n, tag, o.photoFor), caption: 'Fixture caption ' + tag + '.', claims: [], evidence: 'Fixture evidence ' + tag } }; }
function defaults() {
  const t = i => `2026-11-19T07:0${i}:00Z`;
  return {
    drafted: [mk(3, 'series', 'alpha', { createdAt: t(1) }), mk(4, 'series', 'bravo', { createdAt: t(2) }), mk(5, 'series', 'charlie', { createdAt: t(3) }), mk(3, 'series', 'delta', { createdAt: t(4) }), mk(4, 'idea', 'echo', { createdAt: t(5) }), mk(5, 'idea', 'foxtrot', { createdAt: t(6) })],
    queued: 1, failed: [], series: { last: 6, next: 7 }, approveMode: 'ok', approved: new Set(), published: [], draftConcept: {}, albumOk: true
  };
}
st = defaults();
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
const worker = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const im = /^\/img-album\/(.+)$/.exec(u.pathname);
  if (im) { res.writeHead(200, { ...cors, 'content-type': 'image/png' }); return res.end(im[1] === 'gb' ? PNG_45 : im[1] === 'gs' ? PNG_SMALL : im[1] === 'ge' ? PNG_EXACT : PNG_34); }
  let body = ''; req.on('data', d => body += d);
  req.on('end', () => {
    calls.push({ method: req.method, path: u.pathname + u.search, auth: req.headers.authorization || '', body });
    const j = (s, o) => { res.writeHead(s, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return j(401, { ok: false, error: 'access token required' });
    const p = u.pathname, m = req.method;
    if (p === '/api/concepts' && m === 'POST') return j(201, { ok: true, concept: { id: 'c-x', status: 'queued' } });
    if (p === '/api/concepts' && m === 'GET') {
      const s = u.searchParams.get('status');
      if (st.listFail) return j(500, { ok: false, error: 'broken' });
      if (s === 'drafted') return j(200, { ok: true, concepts: st.drafted.map(c => ({ ...c, postState: st.approved.has(c.id) ? 'approved' : 'none' })) });
      if (s === 'queued') return j(200, { ok: true, concepts: Array.from({ length: st.queued }, (_, i) => ({ id: 'c-q' + i, concept: 'Idea: queued ' + i, lane: 'wide', kind: 'idea', status: 'queued', postState: 'none' })) });
      if (s === 'failed') return j(200, { ok: true, concepts: st.failed });
      return j(200, { ok: true, concepts: [] });
    }
    const lk = /^\/api\/concepts\/([^/]+)\/look$/.exec(p);
    if (lk && m === 'POST') { const c = st.drafted.find(x => x.id === decodeURIComponent(lk[1])); if (!c) return j(404, { ok: false, error: 'no such concept' }); c.look = JSON.parse(body).look; return j(200, { ok: true, concept: c }); }
    if (p === '/api/reels' && m === 'GET') return j(200, { ok: true, reels: st.reels || [] });
    if (p === '/api/run-now' && m === 'POST') return j(202, { ok: true, requestedAt: '2026-11-19T10:00:00Z' });
    if (p === '/api/album') return st.albumOk ? j(200, { ok: true, photos: ALBUM.map(a => ({ ...a, url: '/img-album/' + a.guid })) }) : j(502, { ok: false, error: 'album unavailable' });
    if (p === '/api/album-stats' && m === 'GET') return j(200, { ok: true, stats: st.stats || null }); // SOC-34 B3
    if (p === '/api/series' && m === 'GET') return j(200, { ok: true, last: st.series.last, next: st.series.next, assigned: [] });
    if (p === '/api/series/floor' && m === 'POST') { const b = JSON.parse(body); st.series = { last: Math.max(st.series.last, b.last), next: Math.max(st.series.last, b.last) + 1 }; return j(200, { ok: true, last: st.series.last, next: st.series.next }); }
    if (p === '/api/publish' && m === 'PUT') { const b = JSON.parse(body); st.published.push(b); const d = b.drafts[0]; if (d.conceptId) st.draftConcept[d.id] = d.conceptId; return j(200, { ok: true, added: [d.id], kept: [] }); }
    const ap = /^\/api\/drafts\/([^/]+)\/approve$/.exec(p);
    if (ap && m === 'POST') {
      if (st.approveMode === 'taken') { const d = st.published.map(b => b.drafts[0]).find(x => x.id === decodeURIComponent(ap[1])); return j(409, { ok: false, error: 'series number taken', n: d && d.series ? d.series.n : 0, next: 8 }); }
      if (st.approveMode === 'fail') return j(422, { ok: false, error: 'copy gate failed', reasons: ['number 90 is not in your evidence'] });
      const cid = st.draftConcept[decodeURIComponent(ap[1])]; if (cid) st.approved.add(cid);
      return j(200, { ok: true });
    }
    j(404, { ok: false, error: 'not found' });
  });
});
const site = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const send = (f, t) => { res.writeHead(200, { 'content-type': t }); res.end(fs.readFileSync(f)); };
  if (p === '/look.js') return send(LOOK, 'text/javascript');
  if (p === '/reel.js') return send(REEL, 'text/javascript');
  if (p === '/old/') return send(OLD_PAGE, 'text/html');
  if (p === '/cover/') return send(COVER, 'text/html');
  if (p === '/') return send(FILE, 'text/html');
  res.writeHead(404); res.end('no');
});
await new Promise(r => worker.listen(0, '127.0.0.1', r));
await new Promise(r => site.listen(0, '127.0.0.1', r));
const W = `http://127.0.0.1:${worker.address().port}`;
const S = `http://127.0.0.1:${site.address().port}/`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
const check = async (name, fn) => { st = defaults(); calls.length = 0; try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' :: ' + e.message.split('\n')[0] + (process.env.DBG ? e.stack : '')]); } };
const PH = { w: 390, h: 844 }, DT = { w: 1440, h: 900 };
async function open(vp, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  // nothing outside the local stubs is ever reached: fonts and everything else get an empty 200
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href), r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(([b, t, legacy, withSettings]) => {
    if (withSettings) { localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', t); }
    if (legacy != null) localStorage.setItem('orb_cover_series_last', String(legacy));
    window.__clicks = 0; document.addEventListener('click', e => { if (e.isTrusted) window.__clicks++; }, true);
    window.__txt = []; const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { window.__txt.push(String(t)); return ft.call(this, t, ...a); };
  }, [W, TOKEN, o.legacy == null ? null : o.legacy, o.connected !== false]);
  if (o.lsLook) await page.addInitScript(v => { try { localStorage.setItem('ig_look_v1', v); } catch (e) {} }, o.lsLook);
  await page.goto(S + (o.hash || ''));
  if (o.connected !== false && !o.hash && !o.noWait) await page.waitForSelector('.ready-item', { timeout: 15000 }).catch(() => {});
  return { page, errors, ctx };
}
const openItem = async (page, tag) => { await page.locator('.ready-item', { hasText: 'Fixture ' + tag }).first().click(); };
const reviewReady = page => page.waitForFunction(() => !document.getElementById('approve-btn').disabled && !document.getElementById('screen-review').hidden, null, { timeout: 15000 });
const approvedMsg = page => page.waitForFunction(() => /In your Buffer queue/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
const inView = (page, sel) => page.evaluate(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }, sel);
const publishes = () => st.published.map(b => b.drafts[0]);
const lastPub = () => st.published[st.published.length - 1];
const nonGet = () => calls.filter(c => c.method !== 'GET');

// "controls" = visible button, input, select, textarea. "furniture words" = visible words minus caption text and draft titles.
const metrics = page => page.evaluate(() => {
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const controls = [...document.querySelectorAll('button, input, select, textarea')].filter(vis).length;
  let words = 0; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
  while ((t = w.nextNode())) { const el = t.parentElement; if (!el || ['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'TITLE'].includes(el.tagName) || el.closest('.ready-title, .ready-tag, .ready-num, .ready-quality, #words-list, #words-caption, #editor-line') || !el.checkVisibility()) continue; words += t.nodeValue.split(/\s+/).filter(Boolean).length; }
  const ap = document.getElementById('approve-btn'), r = ap ? ap.getBoundingClientRect() : null;
  return { controls, words, height: document.documentElement.scrollHeight, vh: innerHeight, editable: document.querySelectorAll('[contenteditable]').length, approveInView: !!r && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
});
// SOC-34 B caps: controls 7 plus Rewrite, Copy text, Paste text = 10; furniture words 27 plus those buttons' five words = 32 (her own words in #words-list/#words-caption are content, not furniture); 1.9 screens (was 1.3) for the copy-first card.
const reviewViolations = m => { const v = []; if (!m.approveInView) v.push('approve outside the viewport'); if (m.controls > 10) v.push('controls ' + m.controls); if (m.editable) v.push('editable ' + m.editable); if (m.words > 32) v.push('words ' + m.words); if (m.height > 1.9 * m.vh) v.push('height ' + (m.height / m.vh).toFixed(1) + ' screens'); return v; };

// ===== Simplicity caps =====
for (const [vpName, vp] of [['390', PH], ['1440', DT]]) {
  await check(`Ready at ${vpName}: 6 drafts with pictures, controls <= drafts + 4 (two buttons, Posts and Reels, join New post and Settings), <= 2 screens, <= 27 furniture words (25 plus the two new button words), no "Check for drafts"; an injected button trips the cap`, async () => {
    const { page, errors, ctx } = await open(vp);
    assert.equal(await page.locator('.ready-item:visible').count(), 6);
    await page.waitForFunction(() => [...document.querySelectorAll('.ready-item img')].length === 6 && [...document.querySelectorAll('.ready-item img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
    assert.equal(await page.textContent('#ready-heading'), 'Ready to post (6)');
    const m = await metrics(page);
    assert.ok(m.controls <= 6 + 5, 'controls ' + m.controls); // SOC-34 B3: the sticky bar adds Top
    assert.ok(m.height <= 2 * m.vh, 'height ' + m.height);
    assert.ok(m.words <= 28, 'furniture words ' + m.words); // 27 plus the word Top
    assert.equal(await page.getByText('Check for drafts').count(), 0);
    assert.equal(await page.getByText('Refresh').count(), 0);
    assert.equal(await page.textContent('h1'), 'Instagram');
    const tags = await page.locator('.ready-tag').allTextContents(); assert.equal(tags.filter(x => x === 'Work less, do more').length, 4); assert.equal(tags.filter(x => x === 'One-off').length, 2);
    // newest first
    assert.match(await page.locator('.ready-title').first().textContent(), /foxtrot/);
    // must-fail: one more visible button breaks the very assert above
    await page.evaluate(() => { const b = document.createElement('button'); b.textContent = 'Check for drafts'; document.getElementById('ready-main').appendChild(b); });
    const m2 = await metrics(page); assert.ok(m2.controls > 6 + 5, 'the cap assert must fire on an extra button, controls ' + m2.controls);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

await check('Two taps to approved: one .ready-item, then #approve-btn, nothing else; one publish with conceptId and one image per slide, one approve', async () => {
  const { page, ctx } = await open(PH);
  await page.click('.ready-item');
  await page.click('#approve-btn');
  await approvedMsg(page);
  assert.equal(await page.evaluate(() => window.__clicks), 2, 'exactly two taps');
  const pubs = st.published; assert.equal(pubs.length, 1);
  const d = pubs[0].drafts[0];
  assert.equal(d.conceptId, 'c-foxtrot'); assert.equal(d.slides.length, 5); assert.equal(Object.keys(pubs[0].images[d.id]).length, 5);
  assert.equal(calls.filter(c => c.method === 'POST' && /approve$/.test(c.path)).length, 1);
  assert.ok(calls.every(c => c.auth === 'Bearer ' + TOKEN));
  await ctx.close();
});

for (const [vpName, vp] of [['390', PH], ['1440', DT]]) {
  await check(`Check and approve at ${vpName}, right after the first tap, no scrolling: Approve inside the viewport, <= 7 controls (Back, Photo, Dark, caption, Slides from caption, Approve, Edit), no editable text, <= 27 furniture words (15 plus the five words of the SOC-22 line, plus Photo, Dark and the five-word series label of SOC-24 "Second look: not checked yet."), <= 1.3 screens (SOC-24 added the Photo/Plain row and the series line)`, async () => {
    const { page, ctx } = await open(vp);
    await page.click('.ready-item');
    const v = reviewViolations(await metrics(page));
    assert.deepEqual(v, []);
    await reviewReady(page);
    await ctx.close();
  });
}

await check('Approve stays inside the viewport on a short phone (390x600) and the review bar stays fixed while the page scrolls', async () => {
  const { page, ctx } = await open({ w: 390, h: 600 });
  await page.click('.ready-item'); await reviewReady(page);
  assert.ok(await inView(page, '#approve-btn'), 'Approve outside a 600px tall viewport');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  assert.ok(await inView(page, '#approve-btn'), 'Approve scrolled out of view');
  assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('review-bar')).position), 'fixed');
  await ctx.close();
});

await check('Must-fail proof: the saved copy of today\'s page (orb 66d8942) trips the same asserts', async () => {
  st.drafted = [mk(8, 'idea', 'old8')]; // the 8-slide deck the 19 Nov measurement used
  const { page, ctx } = await open(PH, { hash: '' });
  await page.goto(S + 'old/');
  await page.click('#drafts-refresh'); await page.waitForSelector('.draft-item button');
  await page.locator('.draft-item button', { hasText: 'Open this draft' }).first().click();
  const m = await metrics(page); const v = reviewViolations(m);
  console.log('   old page measured', JSON.stringify(m), '->', v.join('; '));
  assert.ok(m.controls + m.editable > 95, 'controls + editable ' + (m.controls + m.editable)); assert.ok(m.editable >= 40, 'editable ' + m.editable);
  assert.ok(m.height / m.vh > 6, 'screens ' + (m.height / m.vh).toFixed(1));
  for (const key of ['approve outside the viewport', 'controls', 'editable', 'words', 'height']) assert.ok(v.some(x => x.startsWith(key)), 'the old page must fail: ' + key);
  await ctx.close();
});

await check('Swipe: on a 4-slide draft, one slide width of scrollLeft changes 1 / 4 to 2 / 4; scroll-snap-type starts with x', async () => {
  const { page, ctx } = await open(PH);
  await openItem(page, 'echo'); await reviewReady(page);
  assert.equal(await page.textContent('#review-count'), '1 / 4');
  assert.equal(await page.locator('#review-strip canvas').count(), 4);
  assert.match(await page.evaluate(() => getComputedStyle(document.getElementById('review-strip')).scrollSnapType), /^x/);
  await page.evaluate(() => { const s = document.getElementById('review-strip'); s.scrollLeft = s.firstElementChild.offsetWidth + 10; }); // SOC-34 B4: slides are small now, one step = one slide plus the gap
  await page.waitForFunction(() => document.getElementById('review-count').textContent === '2 / 4');
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(ov <= 0, 'overflow ' + ov);
  await ctx.close();
});

await check('Feedback on screen: the success text and a stubbed 422 with its reasons are inside the viewport', async () => {
  const { page, ctx } = await open(PH);
  st.approveMode = 'fail';
  await page.click('.ready-item'); await reviewReady(page);
  await page.click('#approve-btn');
  await page.waitForFunction(() => /not in your evidence/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
  assert.ok(await inView(page, '#msg'), '422 message outside the viewport');
  assert.ok(await inView(page, '#msg li'), '422 reason outside the viewport');
  st.approveMode = 'ok';
  await page.fill('#caption', 'Fixed caption'); await page.click('#approve-btn');
  await approvedMsg(page);
  assert.ok(await inView(page, '#msg'), 'success message outside the viewport');
  await page.waitForTimeout(900); assert.ok(await page.locator('#screen-review').isVisible(), 'the success text stays on screen for about 1.5 seconds before the screen changes');
  assert.equal(st.published.length, 1, 'fixable without a second publish');
  assert.equal(calls.filter(c => c.method === 'POST' && /approve$/.test(c.path)).length, 2);
  await ctx.close();
});

await check('Approved posts leave: after approve the stub says postState approved; Ready shows 5 items and Ready to post (5)', async () => {
  const { page, ctx } = await open(PH);
  await page.click('.ready-item'); await page.click('#approve-btn'); await approvedMsg(page);
  await page.waitForFunction(() => !document.getElementById('screen-ready').hidden && document.getElementById('ready-heading').textContent === 'Ready to post (5)', null, { timeout: 15000 });
  assert.equal(await page.locator('.ready-item').count(), 5);
  assert.equal(await page.locator('.ready-item', { hasText: 'foxtrot' }).count(), 0);
  await ctx.close();
});

await check('Edit is a door: Edit shows editable text and per-slide buttons; a changed slide 2 title shows after Done; New idea and More work', async () => {
  const { page, ctx } = await open(PH);
  await openItem(page, 'echo'); await reviewReady(page);
  assert.equal(await page.locator('#screen-edit:visible').count(), 0);
  await page.click('#edit-btn');
  assert.equal(await page.locator('#screen-edit:visible').count(), 1);
  assert.equal(await page.locator('.slide-edit').count(), 4);
  assert.equal(await page.locator('.slide-edit').nth(1).locator('textarea[data-f="title"]:visible').count(), 1);
  for (const b of ['Move up', 'Move down', 'Delete', 'Move photo', 'Add / replace photo']) assert.ok(await page.locator('.slide-edit').nth(1).getByRole('button', { name: b }).count() >= 1, b);
  assert.equal(await page.locator('.slide-edit canvas').count(), 4);
  await page.locator('.slide-edit').nth(1).locator('textarea[data-f="title"]').fill('Changed second title');
  await page.evaluate(() => { window.__txt = []; });
  await page.click('#edit-done');
  await reviewReady(page);
  assert.ok((await page.evaluate(() => window.__txt)).includes('Changed second title'), 'the new title is drawn in the review strip');
  assert.equal(await page.evaluate(() => cards[1].title), 'Changed second title');
  await page.click('#review-back');
  // New idea
  await page.click('#new-idea-btn');
  assert.ok(await page.locator('#idea-sheet').isVisible());
  await page.fill('#concept-text', 'Use AI to plan the week');
  await page.click('#concept-send');
  await page.waitForFunction(() => document.getElementById('idea-msg').textContent.includes('Saved.'));
  assert.equal(await page.textContent('#idea-msg'), 'Saved. Your carousel will be ready after the next run (7am, 1pm or 7pm).');
  assert.ok(await inView(page, '#idea-msg'));
  const post = calls.find(c => c.method === 'POST' && c.path === '/api/concepts'); assert.ok(post); assert.equal(JSON.parse(post.body).lane, 'ambitious-women'); assert.equal(JSON.parse(post.body).concept, 'Use AI to plan the week');
  await page.click('#idea-close'); assert.ok(!(await page.locator('#idea-sheet').isVisible()));
  // More
  await page.click('#more-btn');
  assert.ok(await page.locator('#more-sheet').isVisible());
  for (const id of ['set-base', 'set-token', 'set-save', 'blank-btn', 'copy-btn', 'paste-btn', 'export-btn', 'reset-btn']) assert.ok(await page.locator('#' + id).isVisible(), id);
  await ctx.close();
});

await check('Draft now: with text saves then run-now; without text only run-now; exact message, on screen', async () => {
  const MSG = 'Asked your Mac to draft now. Check back in about 10 minutes (your Mac needs to be awake).';
  const { page, ctx } = await open(PH);
  await page.click('#new-idea-btn');
  await page.fill('#concept-text', 'Use AI to plan the week'); calls.length = 0;
  await page.click('#draft-now');
  await page.waitForFunction(() => document.getElementById('idea-msg').textContent.startsWith('Asked your Mac'));
  assert.equal(await page.textContent('#idea-msg'), MSG);
  assert.deepEqual(calls.filter(c => c.method === 'POST').map(c => c.path), ['/api/concepts', '/api/run-now']);
  calls.length = 0; await page.click('#draft-now');
  await page.waitForFunction(() => document.getElementById('idea-msg').textContent.startsWith('Asked your Mac'));
  assert.deepEqual(calls.filter(c => c.method === 'POST').map(c => c.path), ['/api/run-now']);
  await ctx.close();
});

await check('Not connected: only the connection box is visible, and no /api call is made', async () => {
  const { page, ctx } = await open(PH, { connected: false });
  await page.waitForTimeout(600);
  assert.ok(await page.locator('#conn-box').isVisible());
  assert.equal(await page.locator('.ready-item').count(), 0);
  assert.ok(!(await page.locator('#new-idea-btn').isVisible())); assert.ok(!(await page.locator('#more-btn').isVisible())); assert.ok(!(await page.locator('#ready-heading').isVisible()));
  const m = await metrics(page); assert.equal(m.controls, 4, 'hidden username, address, token and Save, got ' + m.controls);
  assert.equal(calls.length, 0);
  // Save then loads the drafts
  await page.fill('#set-base', W); await page.fill('#set-token', TOKEN); await page.click('#set-save');
  await page.waitForSelector('.ready-item');
  assert.ok(calls.some(c => c.path.startsWith('/api/concepts')));
  await ctx.close();
});

const DEFAULT_WORKER = 'https://drliz-draft-approval.drlizlondon.workers.dev'; // source: NightMode board/drliz-approval.json
await check('Connect box: a fresh browser shows the Worker address prefilled and an empty token; a saved address overrides it', async () => {
  let o = await open(PH, { connected: false });
  assert.equal(await o.page.inputValue('#set-base'), DEFAULT_WORKER); assert.equal(await o.page.inputValue('#set-token'), '');
  assert.ok(!(await o.page.getAttribute('#set-base', 'placeholder') || '').includes('your-worker'), 'stale placeholder hint');
  assert.ok((await o.page.textContent('#conn-box .hint')).startsWith('Paste your access token once. Your browser can save it for next time.'));
  await o.ctx.close();
  o = await open(PH, { connected: false });
  await o.page.evaluate(() => { localStorage.setItem('orb_worker_base', 'https://my-own.example.workers.dev'); });
  await o.page.reload(); await o.page.waitForSelector('#conn-box');
  assert.equal(await o.page.inputValue('#set-base'), 'https://my-own.example.workers.dev');
  await o.ctx.close();
});

await check('Connect box: password-manager form (real form, password + current-password, username input) and submit does not navigate or put the token in the URL', async () => {
  const { page, ctx } = await open(PH, { connected: false });
  const f = await page.evaluate(() => { const t = document.getElementById('set-token'), u = document.querySelector('#conn-form input[autocomplete="username"]'); return { inForm: !!t.closest('form#conn-form'), type: t.type, ac: t.autocomplete, name: t.name, id: t.id, user: !!u, userVal: u && u.value, formAc: document.getElementById('conn-form').autocomplete, submit: document.getElementById('set-save').type }; });
  assert.deepEqual(f, { inForm: true, type: 'password', ac: 'current-password', name: 'password', id: 'set-token', user: true, userVal: 'orb-approval', formAc: 'on', submit: 'submit' });
  const before = page.url();
  await page.fill('#set-base', W); await page.fill('#set-token', TOKEN);
  const prevented = await page.evaluate(() => new Promise(res => { document.getElementById('conn-form').addEventListener('submit', e => setTimeout(() => res(e.defaultPrevented), 0)); document.getElementById('set-save').click(); }));
  assert.equal(prevented, true, 'submit must preventDefault');
  await page.waitForSelector('.ready-item');
  assert.equal(page.url(), before); assert.ok(!page.url().includes(TOKEN) && !decodeURIComponent(page.url()).includes('token'), 'token in URL');
  assert.equal(await page.evaluate(() => localStorage.getItem('orb_approve_token')), TOKEN);
  await ctx.close();
});

await check('Connect box source: no token-shaped literal, no token in location, Worker address is the only host literal added (must fail if a token is hard-coded)', async () => {
  const src = fs.readFileSync(FILE, 'utf8');
  assert.ok(!/(?<!LS_)(approve[_-]?token|bearer|token)\s*[:=]\s*['"](?!orb_)[A-Za-z0-9_\-]{16,}['"]/i.test(src), 'token-shaped literal'); // LS_TOKEN = 'orb_approve_token' is a storage key name
  assert.ok(!/location\.(href|search|hash)\s*=[^=]*token/i.test(src) && !/[?&]token=/.test(src), 'token near location/URL');
  assert.ok(src.includes("const DEFAULT_BASE = '" + DEFAULT_WORKER + "'"));
  assert.deepEqual([...new Set([...src.matchAll(/https:\/\/[a-z0-9.-]*workers\.dev/g)].map(m => m[0]))], [DEFAULT_WORKER]);
});

await check('Quiet lines: 1 queued reads "1 more being written"; 3 queued reads "3 more"; nothing queued or failed shows neither (must-stay-silent); failed opens More with the reason', async () => {
  let o = await open(PH);
  assert.equal(await o.page.textContent('#ready-waiting'), '1 more being written'); assert.ok(await o.page.locator('#ready-waiting').isVisible());
  assert.ok(!(await o.page.locator('#ready-failed').isVisible()));
  await o.ctx.close();
  st.queued = 3; o = await open(PH); assert.equal(await o.page.textContent('#ready-waiting'), '3 more being written'); await o.ctx.close();
  st.queued = 0; st.failed = []; o = await open(PH);
  assert.ok(!(await o.page.locator('#ready-waiting').isVisible())); assert.ok(!(await o.page.locator('#ready-failed').isVisible()));
  await o.ctx.close();
  st.queued = 0; st.failed = [{ id: 'c-f', concept: 'A concept that failed', lane: 'wide', kind: 'idea', status: 'failed', reasons: ['invented figure: 90%'] }]; o = await open(PH);
  assert.equal(await o.page.textContent('#ready-failed'), '1 could not be written');
  await o.page.click('#ready-failed');
  assert.match(await o.page.textContent('#more-failed'), /invented figure: 90%/);
  await o.ctx.close();
});

await check('Retired (superseded) drafts are not counted as "could not be written"; a real failure still is (must-fail)', async () => {
  const sup = { id: 'c-s', concept: 'Retired one', lane: 'wide', kind: 'idea', status: 'failed', reasons: ['Superseded: cut to best 10 by founder'] };
  const real = { id: 'c-r', concept: 'Broke', lane: 'wide', kind: 'idea', status: 'failed', reasons: ['model error'] };
  st.queued = 0; st.failed = [sup]; let o = await open(PH);
  assert.ok(!(await o.page.locator('#ready-failed').isVisible()), 'superseded counted');
  await o.ctx.close();
  st.failed = [sup, real]; o = await open(PH);
  assert.equal(await o.page.textContent('#ready-failed'), '1 could not be written');
  await o.page.click('#ready-failed');
  const more = await o.page.textContent('#more-failed');
  assert.match(more, /model error/); assert.ok(!/uperseded/.test(more));
  await o.ctx.close();
});

await check('Nothing ready: "Nothing ready yet."; and a failed list call shows "Could not get your drafts." with a working Try again', async () => {
  st.drafted = []; let o = await open(PH, { noWait: true });
  await o.page.waitForFunction(() => document.getElementById('ready-status').textContent === 'Nothing ready yet.');
  await o.ctx.close();
  st = defaults(); st.albumOk = true;
  st.listFail = true; // a broken server
  o = await open(PH, { noWait: true });
  await o.page.waitForFunction(() => document.getElementById('ready-status').textContent === 'Could not get your drafts: the server said 500.');
  assert.ok(await o.page.locator('#ready-retry').isVisible()); assert.equal(await o.page.textContent('#ready-retry'), 'Try again');
  st.listFail = false; await o.page.click('#ready-retry'); await o.page.waitForSelector('.ready-item');
  await o.ctx.close();
});

// ===== Short decks and the one look =====
for (const n of [2, 3, 5, 7]) {
  await check(`A deck of ${n} slides opens, reviews and approves: ${n} slides and images numbered 1..${n}, roles hook, point, close`, async () => {
    st.drafted = [mk(n, 'idea', 'deck' + n)];
    const { page, ctx } = await open(PH);
    await page.click('.ready-item'); await reviewReady(page);
    assert.equal(await page.textContent('#review-count'), '1 / ' + n);
    await page.click('#approve-btn'); await approvedMsg(page);
    const d = lastPub().drafts[0];
    assert.deepEqual(d.slides.map(s => s.n), Array.from({ length: n }, (_, i) => i + 1));
    assert.deepEqual(d.slides.map(s => s.role), Array.from({ length: n }, (_, i) => i === 0 ? 'hook' : i === n - 1 ? 'close' : 'point'));
    assert.deepEqual(Object.keys(lastPub().images[d.id]), Array.from({ length: n }, (_, i) => String(i + 1)));
    assert.ok(d.slides.every(s => s.placeholder === false));
    await ctx.close();
  });
}

await check('A 1-slide deck: approve makes zero network calls and shows the 2-slide message; an 11-slide deck shows the Instagram message', async () => {
  st.drafted = [mk(1, 'idea', 'one'), mk(11, 'idea', 'eleven', { createdAt: '2026-11-19T06:00:00Z' })];
  const { page, ctx } = await open(PH);
  await openItem(page, 'one'); await reviewReady(page);
  const before = calls.length;
  await page.click('#approve-btn');
  await page.waitForFunction(() => document.getElementById('msg').textContent === 'A post needs at least 2 slides.');
  await page.waitForTimeout(300); assert.equal(calls.length, before);
  await page.click('#review-back'); await openItem(page, 'eleven'); await reviewReady(page);
  const b2 = calls.length;
  await page.click('#approve-btn');
  await page.waitForFunction(() => document.getElementById('msg').textContent === 'Instagram allows 10 slides. Delete one first.');
  await page.waitForTimeout(300); assert.equal(calls.length, b2);
  await ctx.close();
});

await check('One look in the source: no #ffd9a0, no html2canvas, no contenteditable; vendor file gone; exactly one placeFaceSafe file under dist/', async () => {
  const src = fs.readFileSync(FILE, 'utf8');
  assert.ok(!/ffd9a0/i.test(src), 'old amber'); assert.ok(!/html2canvas/i.test(src), 'html2canvas'); assert.ok(!/contenteditable/i.test(src), 'contenteditable');
  assert.ok(!fs.existsSync(path.join(root, 'dist/carousel-insta/vendor/html2canvas.min.js')), 'vendor file exists');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const hits = walk(path.join(root, 'dist')).filter(f => /\.(html|js|mjs)$/.test(f) && fs.readFileSync(f, 'utf8').includes('function placeFaceSafe'));
  assert.deepEqual(hits.map(f => path.relative(root, f)), ['dist/carousel-insta/look.js']);
  assert.ok(/<script src="look\.js"><\/script>/.test(src)); assert.ok(src.includes('family=Baloo+2') && src.includes('family=Baloo+2:wght@600;700;800&family=Caveat:wght@700'));
  for (const bad of ['8 slides', '/ 8', 'KEYWORD', 'freebie']) assert.ok(!src.includes(bad), 'literal ' + bad);
  assert.ok(!/#ffd9a0/i.test(fs.readFileSync(COVER, 'utf8')));
});

await check('Every image sent on approve decodes to 1080x1350 with more than 20 colours', async () => {
  const { page, ctx } = await open(PH);
  await page.click('.ready-item'); await page.click('#approve-btn'); await approvedMsg(page);
  const d = lastPub().drafts[0], imgs = Object.values(lastPub().images[d.id]); assert.equal(imgs.length, 5);
  const r = await page.evaluate(async list => Promise.all(list.map(async b => {
    const im = new Image(); await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = 'data:image/png;base64,' + b; });
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const seen = new Set(); for (let i = 0; i < 400; i++) seen.add(x.getImageData((i * 37) % c.width, (i * 91) % c.height, 1, 1).data.join(','));
    return { w: im.naturalWidth, h: im.naturalHeight, colours: seen.size };
  })), imgs);
  for (const x of r) { assert.equal(x.w, 1080); assert.equal(x.h, 1350); assert.ok(x.colours > 20, 'colours ' + x.colours); }
  await ctx.close();
});

// ----- SOC-25: small photo rule -----
await check('Small photo (400x500) on slide 3: message names the slide, Approve is disabled, nothing is sent; a photo that is exactly slide-sized is fine', async () => {
  st.drafted = [mk(4, 'idea', 'smallpic', { createdAt: '2026-11-19T08:00:00Z', photoFor: i => i === 2 ? 'gs' : 'gc0' })];
  const { page, ctx } = await open(PH);
  await page.click('.ready-item');
  await page.waitForFunction(() => /Photo too small/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.equal(await page.textContent('#msg'), 'Photo too small for a sharp slide on slide 3. Pick another photo.');
  assert.ok(await page.locator('#approve-btn').isDisabled());
  await page.waitForTimeout(400); assert.equal(st.published.length, 0);
  await ctx.close();
  st.drafted = [mk(4, 'idea', 'exactpic', { createdAt: '2026-11-19T08:00:00Z', photoFor: i => i === 1 ? 'ge' : 'gc0' })];
  const o = await open(PH);
  await o.page.click('.ready-item');
  await o.page.waitForFunction(() => !document.getElementById('approve-btn').disabled && !document.getElementById('screen-review').hidden, null, { timeout: 15000 });
  assert.ok(!/too small/.test(await o.page.textContent('#msg')));
  await o.ctx.close();
});

// ----- face rule -----
const faceDeck = (tag, g) => mk(4, 'idea', tag, { createdAt: '2026-11-19T08:00:00Z', photoFor: i => i === 1 ? g : 'gc0' });
await check('Face rule: words over the face on slide 2 show the message, Approve is disabled, nothing is sent; moving the photo in Edit clears it', async () => {
  st.drafted = [faceDeck('blocked', 'gb')];
  const { page, ctx } = await open(PH);
  await page.click('.ready-item');
  await page.waitForFunction(() => /Words are over your face on slide 2/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.equal(await page.textContent('#msg'), 'Words are over your face on slide 2. Tap Edit and move the photo, or use another photo.');
  assert.ok(await page.locator('#approve-btn').isDisabled()); assert.ok(await inView(page, '#msg'));
  await page.waitForTimeout(400); assert.equal(st.published.length, 0);
  await page.click('#edit-btn');
  const s2 = page.locator('.slide-edit').nth(1);
  await s2.getByRole('button', { name: 'Move photo' }).click();
  assert.equal(await s2.locator('input[type=range]:visible').count(), 3);
  assert.deepEqual(await s2.locator('label:has(input[type=range])').allTextContents(), ['Left / right', 'Up / down', 'Zoom']);
  await s2.locator('[data-frame=fx]').evaluate(e => { e.value = 0; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await s2.locator('[data-frame=fy]').evaluate(e => { e.value = 0; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await s2.locator('[data-frame=zoom]').evaluate(e => { e.value = 2; e.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.deepEqual(await page.evaluate(() => cards[1].frame), { fx: 0, fy: 0, zoom: 2 });
  await page.click('#edit-done'); await reviewReady(page);
  assert.ok(!/over your face/.test(await page.textContent('#msg')));
  // Auto puts the photo back to automatic
  await page.click('#edit-btn'); await page.locator('.slide-edit').nth(1).getByRole('button', { name: 'Move photo' }).click(); await page.locator('.slide-edit').nth(1).getByRole('button', { name: 'Auto' }).click();
  assert.equal(await page.evaluate(() => cards[1].frame), null);
  await ctx.close();
});
await check('Face rule must-stay-silent: the same deck with the face-clear photo shows no face message and approves in two taps', async () => {
  st.drafted = [faceDeck('clearface', 'gc1')];
  const { page, ctx } = await open(PH);
  await page.click('.ready-item'); await page.click('#approve-btn'); await approvedMsg(page);
  assert.equal(await page.evaluate(() => window.__clicks), 2);
  assert.equal(st.published.length, 1);
  await ctx.close();
});
await check('No face data: a photo with no face key shows "Could not check" and Approve still works', async () => {
  st.drafted = [faceDeck('noface', 'gn')];
  const { page, ctx } = await open(PH);
  await page.click('.ready-item');
  await page.waitForFunction(() => document.getElementById('msg').textContent === 'Could not check slide 2 for your face. Have a look before you approve.', null, { timeout: 15000 });
  assert.ok(!(await page.locator('#approve-btn').isDisabled()));
  await page.click('#approve-btn'); await approvedMsg(page);
  assert.equal(st.published.length, 1);
  await ctx.close();
});

// ===== Series and merge =====
await check('Title and header read Instagram; Edit has no Series / Words switch; Series shows series-box, a One-off hides it; flipping keeps 4 canvases in both modes', async () => {
  const { page, ctx } = await open(PH);
  assert.equal(await page.title(), 'Instagram');
  await openItem(page, 'echo'); await reviewReady(page); await page.click('#edit-btn');
  assert.equal(await page.locator('#type-series, #type-words, .type-row').count(), 0, 'the switch is gone');
  assert.ok(!(await page.locator('body').innerText()).includes('Words over my photos'));
  assert.ok(!(await page.locator('#series-box').isVisible()));
assert.equal(await page.locator('.slide-edit canvas').count(), 4);
  await page.evaluate(() => { setType('series'); renderEdit(); });
  assert.ok(await page.locator('#series-box').isVisible());
  assert.equal(await page.locator('.slide-edit canvas').count(), 4);
  await page.click('#edit-done'); await reviewReady(page); assert.equal(await page.locator('#review-strip canvas').count(), 4); assert.equal(await page.textContent('#review-count'), '1 / 4');
  assert.equal(await page.textContent('#review-title'), 'Post #007');
  assert.equal(await page.evaluate(() => localStorage.getItem('ig_post_type_v1')), 'series');
  await ctx.close();
});

await check('Series number 7: series-next, series-num, and slide 1 draws #007, Dr Liz London, Using, AI, to Earn More, and, Work Less, the draft title and 1 / 4', async () => {
  const { page, ctx } = await open(PH);
  await page.evaluate(() => { window.__txt = []; });
  await openItem(page, 'bravo'); await reviewReady(page);
  const txt = await page.evaluate(() => window.__txt);
  for (const w of ['#007', 'Dr Liz London', 'Using', 'AI', 'to Earn More', 'and', 'Work Less', '1 / 4']) assert.ok(txt.includes(w), w + ' in ' + txt.slice(0, 40).join('|'));
  assert.ok(txt.join(' ').includes('Fixture bravo'), 'the draft slide 1 title');
  await page.click('#edit-btn');
  assert.equal(await page.textContent('#series-next'), 'Next in the series: #007');
  assert.equal(await page.inputValue('#series-num'), '7');
  assert.equal(await page.inputValue('#cv-strap'), 'Fixture bravo');
  // editing either keeps the two in step
  await page.fill('#cv-strap', 'Fixture arrow text');
  assert.equal(await page.locator('.slide-edit').first().locator('textarea[data-f="title"]').inputValue(), 'Fixture arrow text');
  await page.locator('.slide-edit').first().locator('textarea[data-f="title"]').fill('Fixture title again');
  assert.equal(await page.inputValue('#cv-strap'), 'Fixture title again');
  // series first slide hides the fields the cover owns
  for (const f of ['kicker', 'num', 'swipe', 'handle']) assert.ok(!(await page.locator('.slide-edit').first().locator(`[data-f="${f}"]`).isVisible()), f);
  assert.equal(await page.locator('.slide-edit').first().getByText('Not shown on a series first slide.').count(), 1);
  assert.ok(await page.locator('.slide-edit').nth(1).locator('[data-f="kicker"]').isVisible());
  await ctx.close();
});

await check('Series approve of a 4-slide draft sends one PUT with series.n 7, 4 slides numbered 1 to 4, 4 images; the success text says Approved as #007', async () => {
  const { page, ctx } = await open(PH);
  await openItem(page, 'bravo'); await reviewReady(page); await page.click('#approve-btn');
  await page.waitForFunction(() => /Approved as #007\. In your Buffer queue once your Mac syncs/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
  assert.equal(st.published.length, 1);
  const d = lastPub().drafts[0];
  assert.deepEqual(d.series, { n: 7 }); assert.deepEqual(d.slides.map(s => s.n), [1, 2, 3, 4]); assert.equal(Object.keys(lastPub().images[d.id]).length, 4);
  assert.equal(d.conceptId, 'c-bravo');
  assert.equal(d.slides[0].text, 'Dr Liz London Using AI to Earn More and Work Less Fixture bravo #007');
  assert.ok(!d.caption.includes('#007'), 'the number is never added to the caption');
  await ctx.close();
});

await check('Words approve of the same draft sends 4 slides, 4 images and no series key; slide 1 draws @drlizlondon and never #007', async () => {
  const { page, ctx } = await open(PH);
  await openItem(page, 'bravo'); await reviewReady(page); await page.click('#edit-btn');
  await page.evaluate(() => { setType('words'); renderEdit(); window.__txt = []; });
  await page.click('#edit-done'); await reviewReady(page);
  const txt = await page.evaluate(() => window.__txt);
  assert.ok(txt.includes('@drlizlondon')); assert.ok(!txt.includes('#007'), 'no series number in a words post');
  await page.click('#approve-btn'); await approvedMsg(page);
  const d = lastPub().drafts[0];
  assert.equal(d.slides.length, 4); assert.equal(Object.keys(lastPub().images[d.id]).length, 4); assert.ok(!('series' in d));
  assert.equal(await page.textContent('#msg'), 'Approved. In your Buffer queue once your Mac syncs');
  await ctx.close();
});

await check('A 409 "series number taken": the #007 message, series-num becomes 8, and the next approve publishes under a different id with series.n 8', async () => {
  const { page, ctx } = await open(PH);
  await openItem(page, 'bravo'); await reviewReady(page);
  st.approveMode = 'taken';
  await page.click('#approve-btn');
  await page.waitForFunction(() => document.getElementById('msg').textContent === '#007 was just used. The next free number is #008. Tap approve again.', null, { timeout: 30000 });
  assert.ok(await inView(page, '#msg'));
  assert.equal(await page.inputValue('#series-num'), '8'); assert.equal(await page.textContent('#review-title'), 'Post #008');
  const firstId = lastPub().drafts[0].id;
  st.approveMode = 'ok';
  await reviewReady(page); await page.click('#approve-btn'); await approvedMsg(page);
  assert.equal(st.published.length, 2);
  const d2 = lastPub().drafts[0]; assert.notEqual(d2.id, firstId, 'a new draft id'); assert.equal(d2.series.n, 8);
  await ctx.close();
});

await check('After a 409, putting the old number back publishes the deck again under a NEW id (the taken id is never reused)', async () => {
  const { page, ctx } = await open(PH);
  await openItem(page, 'bravo'); await reviewReady(page);
  st.approveMode = 'taken';
  await page.click('#approve-btn');
  await page.waitForFunction(() => document.getElementById('msg').textContent.includes('was just used'), null, { timeout: 30000 });
  const firstId = lastPub().drafts[0].id, before = st.published.length;
  st.approveMode = 'ok';
  await page.evaluate(() => { const e = document.getElementById('series-num'); e.value = '7'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await reviewReady(page);
  await page.click('#approve-btn'); await approvedMsg(page);
  assert.equal(st.published.length, before + 1, 'a second publish happened');
  assert.notEqual(lastPub().drafts[0].id, firstId, 'a new draft id');
  await ctx.close();
});

await check('A Series draft whose slide 1 has no photo: approve makes zero network calls and shows "Choose a photo for the first slide."', async () => {
  st.drafted = [mk(4, 'series', 'nophoto', { photoFor: i => i === 0 ? '' : 'gc0' })];
  const { page, ctx } = await open(PH);
  await page.click('.ready-item'); await reviewReady(page);
  const before = calls.length; await page.click('#approve-btn');
  await page.waitForFunction(() => document.getElementById('msg').textContent === 'Choose a photo for the first slide.');
  await page.waitForTimeout(300); assert.equal(calls.length, before);
  await ctx.close();
});

await check('Opening kind series switches to Series and sets cv-strap to slide 1 title; kind idea switches to Words; a fresh page has an empty caption (G1)', async () => {
  const { page, ctx } = await open(PH);
  assert.equal(await page.evaluate(() => document.getElementById('caption').value), '', 'fresh page caption is empty');
  await openItem(page, 'charlie'); await reviewReady(page);
  assert.equal(await page.evaluate(() => document.getElementById('caption').value), 'Fixture caption charlie.');
  await page.click('#edit-btn');
  assert.equal(await page.evaluate(() => type), 'series'); assert.equal(await page.inputValue('#cv-strap'), 'Fixture charlie');
  await page.click('#edit-done'); await reviewReady(page); await page.click('#review-back');
  await openItem(page, 'echo'); await reviewReady(page); await page.click('#edit-btn');
  assert.equal(await page.evaluate(() => type), 'words');
  await ctx.close();
});

await check('Start from blank: Edit opens with the 3-slide starter deck, type Words, empty caption; approving without a caption stops; with one the publish has 3 slides and no conceptId', async () => {
  const { page, ctx } = await open(PH);
  await page.click('#more-btn'); await page.click('#blank-btn');
  assert.ok(await page.locator('#screen-edit').isVisible()); assert.equal(await page.locator('.slide-edit').count(), 3);
  assert.equal(await page.evaluate(() => type), 'words');
  assert.equal(await page.locator('.slide-edit').first().locator('[data-f="title"]').inputValue(), 'Your bold first line goes here.');
  assert.equal(await page.locator('.slide-edit').nth(2).locator('[data-f="title"]').inputValue(), 'The honest limit.');
  await page.click('#edit-done'); await reviewReady(page);
  assert.equal(await page.inputValue('#caption'), '');
  const before = calls.length; await page.click('#approve-btn');
  await page.waitForFunction(() => document.getElementById('msg').textContent === 'Add a caption first.');
  assert.equal(calls.length, before);
  await page.fill('#caption', 'Fixture blank caption'); await page.click('#approve-btn'); await approvedMsg(page);
  const d = lastPub().drafts[0]; assert.equal(d.slides.length, 3); assert.ok(!('conceptId' in d)); assert.deepEqual(d.slides.map(s => s.role), ['hook', 'point', 'close']);
  await ctx.close();
});

await check('D5: old key 12 and Worker last 3 show the line and "Carry on from #013"; no floor call before the tap, exactly one {last:12} after, old key gone', async () => {
  const { page, ctx } = await open(PH, { hash: '#series', legacy: 12 });
  st.series = { last: 3, next: 4 };
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('legacy-count').hidden, null, { timeout: 15000 });
  assert.equal(await page.textContent('#legacy-text'), 'This phone or computer last used #012. Your shared count is at #003.');
  assert.equal(await page.textContent('#legacy-carry'), 'Carry on from #013');
  await page.waitForTimeout(300);
  assert.equal(calls.filter(c => c.path === '/api/series/floor').length, 0, 'no floor call before the tap');
  await page.click('#legacy-carry');
  await page.waitForFunction(() => document.getElementById('legacy-count').hidden);
  const fl = calls.filter(c => c.path === '/api/series/floor'); assert.equal(fl.length, 1); assert.deepEqual(JSON.parse(fl[0].body), { last: 12 });
  assert.equal(await page.evaluate(() => localStorage.getItem('orb_cover_series_last')), null);
  await page.waitForFunction(() => document.getElementById('series-next').textContent === 'Next in the series: #013');
  await ctx.close();
});
await check('D5: old key 2 and Worker last 3 shows nothing, makes no floor call, removes the old key', async () => {
  const { page, ctx } = await open(PH, { hash: '#series', legacy: 2 });
  await page.waitForFunction(() => document.getElementById('series-next').textContent.startsWith('Next in the series'), null, { timeout: 15000 });
  assert.ok(await page.locator('#legacy-count').isHidden());
  assert.equal(calls.filter(c => c.path === '/api/series/floor').length, 0);
  assert.equal(await page.evaluate(() => localStorage.getItem('orb_cover_series_last')), null);
  await ctx.close();
});

await check('dist/cover-series forwards: refresh to ../carousel-insta/#series, the link, no script; loading the creator with #series selects Series', async () => {
  const src = fs.readFileSync(COVER, 'utf8');
  assert.ok(src.includes('<meta http-equiv="refresh" content="0; url=../carousel-insta/#series">')); assert.ok(src.includes('<title>Instagram</title>'));
  assert.ok(src.includes('This page has moved into Instagram.')); assert.ok(/<a href="\.\.\/carousel-insta\/#series">Open Instagram<\/a>/.test(src)); assert.ok(!/<script/i.test(src));
  assert.ok(fs.existsSync(path.join(root, 'dist/cover-series/icon.svg')));
  const { page, ctx } = await open(PH, { hash: '#series' });
  assert.ok(await page.locator('#screen-edit').isVisible()); assert.equal(await page.evaluate(() => type), 'series'); assert.ok(await page.locator('#series-box').isVisible());
  assert.equal(await page.locator('.slide-edit').count(), 3);
  await ctx.close();
});

// ----- SOC-18.10: drag the words -----
// Touch drag through the browser's own touch pipeline (CDP), on the handle the page puts over each block.
async function touchDrag(page, cdp, loc, dx, dy) {
  await loc.evaluate(e => e.closest('.slide-edit').scrollIntoView({ block: 'start' }));
  const b = await loc.boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2, n = 8;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let k = 1; k <= n; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * k / n, y: y + dy * k / n }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
}
async function openTouch(vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: true, isMobile: true });
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href), r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(([b, t]) => { localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', t); }, [W, TOKEN]);
  await page.goto(S); await page.waitForSelector('.ready-item', { timeout: 15000 });
  return { page, ctx, errors, cdp: await ctx.newCDPSession(page) };
}
const handleOf = (page, slide, name) => page.locator('.slide-edit').nth(slide).locator('.mv-handle[data-block="' + name + '"]');
const handlesUp = page => page.waitForFunction(() => document.querySelectorAll('.mv-handle').length >= 8, null, { timeout: 15000 });
await check('Drag words (AC3, AC4): at 390px with touch, dragging the title moves it, the slide keeps a non-zero offset, and a far drag stays inside the slide', async () => {
  const { page, ctx, cdp, errors } = await openTouch(PH);
  await openItem(page, 'echo'); await reviewReady(page); await page.click('#edit-btn'); await handlesUp(page);
  assert.equal(await page.evaluate(() => cards[1].offsets), null);
  assert.equal(await handleOf(page, 1, 'title').evaluate(e => getComputedStyle(e).touchAction), 'none');
  const before = await page.evaluate(() => lastRes[1].blocks.title.y);
  await touchDrag(page, cdp, handleOf(page, 1, 'title'), 0, -90);
  const o = await page.evaluate(() => cards[1].offsets);
  assert.ok(o && o.title && o.title.dy < -150 && Math.abs(o.title.dx) < 40, JSON.stringify(o));
  assert.ok(await page.evaluate(b => lastRes[1].blocks.title.y < b - 150, before));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(STORE_KEY))[1].offsets.title.dy < 0), true, 'saved with the slide');
  const hb = await handleOf(page, 1, 'title').boundingBox(), cb = await page.locator('.slide-edit').nth(1).locator('canvas').boundingBox(), t = await page.evaluate(() => lastRes[1].blocks.title);
  assert.ok(Math.abs((hb.y + 6 - cb.y) / cb.height * 1350 - t.y) < 12, 'the handle sits over the drawn block');
  await touchDrag(page, cdp, handleOf(page, 1, 'title'), -300, -400);
  let k = await page.evaluate(() => lastRes[1].blocks.title); assert.ok(k.x >= 0 && k.y >= 0 && k.x + k.w <= 1080 && k.y + k.h <= 1350, JSON.stringify(k)); assert.ok(k.y < 2 && k.x < 2, 'pinned at the corner ' + JSON.stringify(k));
  await touchDrag(page, cdp, handleOf(page, 1, 'title'), 300, 600);
  k = await page.evaluate(() => lastRes[1].blocks.title); assert.ok(k.x + k.w <= 1080.01 && k.y + k.h <= 1350.01 && k.x >= 0 && k.y >= 0, JSON.stringify(k));
  assert.ok(await page.evaluate(() => { const o = cards[1].offsets.title, b = lastRes[1].blocks.title; return o.dx === b.dx && o.dy === b.dy; }), 'the kept offset is the applied (clamped) one, not the raw drag');
  // it survives a reload: the saved slide comes back with its offset (loadDeck -> norm)
  const kept = await page.evaluate(() => cards[1].offsets.title);
  await page.reload(); await page.waitForFunction(() => typeof cards !== 'undefined' && cards.length > 1);
  assert.deepEqual(await page.evaluate(() => cards[1].offsets.title), kept);
  assert.deepEqual(errors, []);
  await ctx.close();
});
await check('Drag words (AC3 export): the PNG sent on approve uses the moved position; with the offsets stripped the same slide draws differently', async () => {
  const { page, ctx, cdp } = await openTouch(PH);
  await openItem(page, 'echo'); await reviewReady(page); await page.click('#edit-btn'); await handlesUp(page);
  await touchDrag(page, cdp, handleOf(page, 1, 'title'), 0, -90);
  assert.ok(await page.evaluate(() => cards[1].offsets && cards[1].offsets.title));
  await page.click('#edit-done'); await reviewReady(page); await page.click('#approve-btn'); await approvedMsg(page);
  const d = lastPub().drafts[0], sent = lastPub().images[d.id]['2'];
  const r = await page.evaluate(async () => {
    const cv = document.createElement('canvas'); await drawInto(cv, 1); const moved = cv.toDataURL('image/png').split(',')[1];
    const saved = cards[1].offsets; cards[1].offsets = null; const cv2 = document.createElement('canvas'); await drawInto(cv2, 1); const plain = cv2.toDataURL('image/png').split(',')[1]; cards[1].offsets = saved;
    return { moved, plain };
  });
  assert.equal(sent, r.moved, 'the sent image is the moved draw'); assert.notEqual(sent, r.plain, 'and it differs from the unmoved draw');
  await ctx.close();
});
const faceMsg = page => page.textContent('#edit-msg');
await check('Drag words (AC5, AC6): words over the face warn; a drag that still overlaps keeps the warning; dragging every block clear removes it and Approve works; Reset words brings it back', async () => {
  st.drafted = [faceDeck('blocked', 'gb')];
  const { page, ctx, cdp } = await openTouch(PH);
  await page.click('.ready-item');
  await page.waitForFunction(() => /Words are over your face on slide 2/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  await page.click('#edit-btn');
  await page.waitForFunction(() => document.querySelectorAll('.slide-edit')[1].querySelectorAll('.mv-handle').length >= 3, null, { timeout: 15000 });
  const names = await page.evaluate(() => Object.keys(lastRes[1].blocks).filter(n => n !== 'handle'));
  assert.deepEqual(names.sort(), ['kicker', 'sub', 'title']);
  await touchDrag(page, cdp, handleOf(page, 1, 'title'), 0, -190);
  assert.equal(await page.evaluate(() => lastRes[1].faceClear), false); assert.match(await faceMsg(page), /Words are over your face on slide 2/);
  await touchDrag(page, cdp, handleOf(page, 1, 'sub'), 0, -190);
  assert.equal(await page.evaluate(() => lastRes[1].faceClear), false);
  await touchDrag(page, cdp, handleOf(page, 1, 'kicker'), 0, -190);
  assert.equal(await page.evaluate(() => lastRes[1].faceClear), true); assert.equal(await faceMsg(page), '');
  await page.click('#edit-done'); await reviewReady(page);
  assert.ok(!/over your face/.test(await page.textContent('#msg')));
  await page.click('#edit-btn');
  const plain = await page.evaluate(async () => { const keep = cards[1].offsets; cards[1].offsets = null; const c = document.createElement('canvas'); await drawInto(c, 1); const h = c.toDataURL(); cards[1].offsets = keep; return h; });
  const moved = await page.evaluate(async () => { const c = document.createElement('canvas'); await drawInto(c, 1); return c.toDataURL(); });
  assert.notEqual(plain, moved);
  await page.locator('.slide-edit').nth(1).getByRole('button', { name: 'Reset words' }).click(); await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => cards[1].offsets), null);
  assert.equal(await page.evaluate(async () => { const c = document.createElement('canvas'); await drawInto(c, 1); return c.toDataURL(); }), plain);
  assert.equal(await page.evaluate(() => document.querySelectorAll('.slide-edit')[1].querySelector('canvas').toDataURL()), plain, 'the on-screen canvas is back to the plain draw');
  assert.match(await faceMsg(page), /over your face on slide 2/);
  await ctx.close();
});
await check('Drag words: a deck nobody dragged has no offsets on any slide', async () => {
  const { page, ctx } = await openTouch(PH);
  await openItem(page, 'echo'); await reviewReady(page); await page.click('#edit-btn'); await handlesUp(page);
  assert.ok(await page.evaluate(() => cards.every(c => c.offsets === null)));
  await ctx.close();
});

await check('At 390px wide the page has no sideways overflow on each of the three screens, in both modes, and no console errors', async () => {
  const { page, errors, ctx } = await open(PH);
  const ov = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  for (const mode of ['words', 'series']) {
    await page.evaluate(m => { localStorage.setItem('ig_post_type_v1', m); }, mode);
    await page.reload(); await page.waitForSelector('.ready-item');
    assert.ok((await ov()) <= 0, mode + ' ready ' + await ov());
    await openItem(page, mode === 'series' ? 'bravo' : 'echo'); await reviewReady(page);
    assert.ok((await ov()) <= 0, mode + ' review ' + await ov());
    await page.click('#edit-btn'); await page.waitForTimeout(300);
    assert.ok((await ov()) <= 0, mode + ' edit ' + await ov());
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ===== SOC-21: Slides from caption =====
const SOC21_CAPTION = `I run several AI assistants at once. But I discovered that having more AI helpers doesn't necessarily make life easier.

Someone needs to be in charge.

So I gave one of them that job.

It now coordinates the others, runs my daily routines on schedule, checks that things have actually been done, turns failures into tasks and makes sure my work is saved and shared safely.

Essentially, I've given my AI assistants a manager.

And the interesting thing? You don't need to be technical to set something like this up.

You just need someone in charge.`;
const SOC21_OLD = ['P1', 'P2', 'P3', 'P4', 'P5'].map((p, i) => ({ handle: '@fixture-handle', kicker: 'Old kicker ' + (i + 1), num: String(i + 1), title: 'Old title ' + (i + 1), sub: 'Old sub ' + (i + 1), swipe: ['Swipe to see how', 'Next', 'Next', 'Next', 'Save this'][i], photo: p, frame: { x: 1 }, offsets: { title: { dx: 3, dy: 4 } }, face: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } }));
const SOC21_TITLES = ['I run several AI assistants at once.', 'Someone needs to be in charge.', 'So I gave one of them that job.', 'It now coordinates the others, runs my daily routines on schedule, checks that things have actually been done, turns failures into tasks and makes sure my work is saved and shared safely.', "Essentially, I've given my AI assistants a manager.", 'And the interesting thing?', 'You just need someone in charge.'];
const SOC21_SUBS = ["But I discovered that having more AI helpers doesn't necessarily make life easier.", '', '', '', '', "You don't need to be technical to set something like this up.", ''];
const slidesJs = (cap, old) => ({ cap, old });
await check('SOC-21 T1 + G6: the worked example makes 7 slides, field by field; her words are untouched (title+sub joined = the caption)', async () => {
  const { page, ctx } = await open(PH);
  const out = await page.evaluate(({ cap, old }) => slidesFromCaption(cap, old), slidesJs(SOC21_CAPTION, SOC21_OLD));
  assert.equal(out.length, 7);
  assert.deepEqual(out.map(c => c.title), SOC21_TITLES);
  assert.deepEqual(out.map(c => c.sub), SOC21_SUBS);
  assert.deepEqual(out.map(c => c.photo), ['P1', 'P2', 'P3', 'P4', 'P5', 'P1', 'P2']);
  assert.deepEqual(out.map(c => c.swipe), ['Swipe to see how', 'Next', 'Next', 'Next', 'Next', 'Next', 'Save this']);
  assert.deepEqual(out.map(c => c.num), ['01', '02', '03', '04', '05', '06', '07']);
  assert.ok(out.every(c => c.kicker === ''), 'every kicker is empty');
  assert.ok(out.every(c => c.handle === '@fixture-handle' && c.frame === null && c.offsets === null && c.face === undefined), 'handle kept; frame, offsets, face reset');
  // the same caption hard-wrapped (single line breaks inside paragraphs, rule 2) must give the identical slides
  const wrapped = SOC21_CAPTION.replace('at once. But', 'at once.\nBut').replace('on schedule, checks', 'on schedule,\nchecks').replace('And the interesting thing? You', 'And the interesting thing?\nYou');
  assert.notEqual(wrapped, SOC21_CAPTION);
  assert.deepEqual(await page.evaluate(({ cap, old }) => slidesFromCaption(cap, old), slidesJs(wrapped, SOC21_OLD)), out, 'single line breaks are spaces, not slide breaks');
  const norm = t => t.replace(/\s+/g, ' ').trim();
  assert.equal(norm(out.map(c => c.title + ' ' + c.sub).join(' ')), norm(SOC21_CAPTION), 'G6: her words, in order, nothing added');
  await ctx.close();
});
await check('SOC-21 G1 + T2: empty caption and 1 paragraph change nothing and show the blank-line message; 11 paragraphs change nothing and say N = 11', async () => {
  const { page, ctx } = await open(PH);
  await openItem(page, 'echo'); await reviewReady(page);
  assert.equal(await page.evaluate(() => slidesFromCaption('', cards)), null);
  const before = await page.evaluate(() => JSON.stringify(cards));
  let confirms = 0; page.on('dialog', d => { confirms++; d.dismiss(); });
  const msg = () => page.locator('#msg').innerText();
  await page.fill('#caption', ''); await page.click('#caption-slides');
  assert.match(await msg(), /Put a blank line between the parts you want on separate slides\./);
  await page.fill('#caption', 'One paragraph only. With two sentences.'); await page.click('#caption-slides');
  assert.match(await msg(), /Put a blank line between the parts you want on separate slides\./);
  assert.equal(await page.evaluate(() => JSON.stringify(cards)), before, 'cards unchanged');
  await page.fill('#caption', Array.from({ length: 11 }, (_, i) => 'Part ' + (i + 1) + '.').join('\n\n')); await page.click('#caption-slides');
  assert.match(await msg(), /That makes 11 slides\. Instagram allows 10\. Join some parts and try again\./);
  assert.equal(await page.evaluate(() => JSON.stringify(cards)), before, 'cards unchanged');
  assert.equal(confirms, 0, 'no confirm for the refused cases');
  await ctx.close();
});
await check('SOC-21 T3 + T4 + confirm: Cancel changes nothing; OK rebuilds with the confirm text; the caption box is untouched; Undo restores the exact previous cards', async () => {
  const { page, ctx } = await open(PH);
  await openItem(page, 'echo'); await reviewReady(page);
  const photo = 'data:image/png;base64,' + PNG_34.toString('base64');
  await page.evaluate(([old, ph]) => { cards = old.map(c => norm(Object.assign({}, c, { photo: ph }))); }, [SOC21_OLD, photo]);
  await page.fill('#caption', SOC21_CAPTION);
  const before = await page.evaluate(() => JSON.stringify(cards));
  const texts = [];
  page.once('dialog', d => { texts.push(d.message()); d.dismiss(); });
  await page.click('#caption-slides'); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => JSON.stringify(cards)), before, 'Cancel changes nothing');
  page.once('dialog', d => { texts.push(d.message()); d.accept(); });
  await page.click('#caption-slides');
  await page.waitForSelector('#slides-undo');
  assert.deepEqual(texts, Array(2).fill('Replace the 5 slides with 7 slides made from your caption? Photos stay in order.'));
  assert.equal(await page.evaluate(() => cards.length), 7);
  assert.equal(await page.inputValue('#caption'), SOC21_CAPTION, 'T4: caption unchanged');
  assert.match(await page.locator('#msg').innerText(), /Slides rebuilt from your caption\./);
  await page.click('#slides-undo');
  await page.waitForFunction(() => cards.length === 5);
  assert.equal(await page.evaluate(() => JSON.stringify(cards)), before, 'T3: Undo restores the exact previous cards');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem(STORE_KEY)).length), 5);
  assert.equal(await page.inputValue('#caption'), SOC21_CAPTION);
  await ctx.close();
});
await check('SOC-21 series: with type series a rebuilt card 0 title is drawn on the cover (as the strapline), and the 390px page does not scroll sideways', async () => {
  const { page, ctx } = await open(PH);
  await openItem(page, 'bravo'); await reviewReady(page);
  assert.equal(await page.evaluate(() => type), 'series');
  await page.fill('#caption', SOC21_CAPTION);
  await page.evaluate(() => { window.__txt = []; });
  page.once('dialog', d => d.accept());
  await page.click('#caption-slides'); await page.waitForSelector('#slides-undo');
  await page.waitForTimeout(500);
  const txt = await page.evaluate(() => window.__txt.join('|'));
  assert.ok(txt.includes('I run several'), 'cover draws the rebuilt card 0 title (wrapped): ' + txt.slice(0, 200));
  assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'no sideways scroll');
  await ctx.close();
});

// ===== SOC-22: the Second look line (muted, above the caption, never blocks Approve) =====
const SHOTS = path.join(process.env.HOME, 'soc22-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const LOOKS = [
  ['not-checked', null, null, 'Second look: not checked yet.'],
  ['looks-good', { verdict: 'pass', note: 'Clear and worth a stop.', round: 0 }, null, 'Second look: looks good. Clear and worth a stop.'],
  ['reworked-once', { verdict: 'pass', note: 'Better now.', round: 1 }, 'before', 'Second look: reworked once. Better now.'],
  ['needs-work', { verdict: 'rework', note: 'Too long for a quick read.', round: 0 }, null, 'Second look: needs work. Too long for a quick read.']
];
for (const [slug, review, orig, expected] of LOOKS) {
  await check(`SOC-22 Second look (${slug}): the line reads "${expected}" at 390px, sits above the caption, does not block Approve, no sideways scroll`, async () => {
    const c = st.drafted.find(x => x.id === 'c-alpha');
    if (review) c.review = review;
    if (orig) c.deckBefore = { slides: [{ kicker: 'Old kicker', num: '1', title: 'Old title one', sub: 'Old sub', swipe: 'Old swipe' }, { kicker: '', num: '2', title: 'Old title two', sub: '', swipe: '' }], caption: 'Old caption', claims: [], evidence: 'x' };
    const { page, errors, ctx } = await open(PH);
    await openItem(page, 'alpha'); await reviewReady(page);
    const line = await page.evaluate(() => { const p = document.getElementById('second-look'); return { text: p.firstChild.textContent, hidden: p.hidden, y: p.getBoundingClientRect().bottom, capY: document.querySelector('label[for=caption]').getBoundingClientRect().top, btn: !!document.getElementById('look-orig') }; });
    assert.equal(line.text, expected); assert.equal(line.hidden, false); assert.ok(line.y <= line.capY, 'above the caption');
    assert.equal(line.btn, !!orig, 'See the original only when the deck was reworked');
    assert.equal(await page.evaluate(() => document.getElementById('approve-btn').disabled), false, 'Approve is not blocked');
    if (orig) {
      assert.equal(await page.locator('#orig-deck').isHidden(), true);
      await page.click('#look-orig');
      assert.match(await page.textContent('#orig-deck'), /Old title one/);
      assert.equal(await page.locator('#caption').inputValue() === 'Old caption', false, 'read only: the caption box is untouched');
      await page.screenshot({ path: path.join(SHOTS, slug + '-original.png') });
      await page.click('#look-orig'); assert.equal(await page.locator('#orig-deck').isHidden(), true);
    }
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, 'no sideways scroll');
    await page.screenshot({ path: path.join(SHOTS, slug + '.png') });
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
await check('SOC-23 Job line: a drafted post with a job shows "Job: <job>" muted above the Second look line; one without a job shows none', async () => {
  const c = st.drafted.find(x => x.id === 'c-alpha');
  delete c.review; delete c.deckBefore;
  c.job = 'right-people';
  let { page, errors, ctx } = await open(PH);
  await openItem(page, 'alpha'); await reviewReady(page);
  const j = await page.evaluate(() => { const e = document.getElementById('job-line'), p = document.getElementById('second-look'); return { text: e.textContent, hidden: e.hidden, opacity: getComputedStyle(e).opacity, above: e.getBoundingClientRect().bottom <= p.getBoundingClientRect().top, approve: !document.getElementById('approve-btn').disabled }; });
  assert.equal(j.text, 'Job: right-people'); assert.equal(j.hidden, false); assert.ok(Number(j.opacity) < 1, 'muted'); assert.ok(j.above, 'above the Second look line'); assert.ok(j.approve, 'Approve not blocked');
  assert.deepEqual(errors, []); await ctx.close();
  delete c.job;
  ({ page, errors, ctx } = await open(PH));
  await openItem(page, 'alpha'); await reviewReady(page);
  assert.equal(await page.evaluate(() => document.getElementById('job-line').hidden), true, 'no job, no line');
  assert.deepEqual(errors, []); await ctx.close();
});
await check('SOC-22 Second look on the Reels screen: a ready reel shows its line, a reel with no review says not checked yet', async () => {
  st.reels = [
    { id: 'r-20261121000000-aaaa', script: 'A checked reel', status: 'ready', durationMs: 9000, createdAt: '2026-11-21T00:00:00Z', review: { verdict: 'pass', note: 'Easy to follow.', round: 0 } },
    { id: 'r-20261121000001-bbbb', script: 'An unchecked reel', status: 'ready', durationMs: 9000, createdAt: '2026-11-21T00:00:01Z' }
  ];
  const { page, errors, ctx } = await open(PH);
  await page.click('#trial-btn'); await page.waitForSelector('.reel-item');
  const lines = await page.locator('.reel-look').allTextContents();
  assert.deepEqual(lines.sort(), ['Second look: looks good. Easy to follow.', 'Second look: not checked yet.']);
  await page.screenshot({ path: path.join(SHOTS, 'reels.png') });
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ----- SOC-24/26: look toggle (Photo / Dark), series label -----
const SHOTS24 = path.join(process.env.HOME, 'soc24-shots'); fs.mkdirSync(SHOTS24, { recursive: true });
const cornerPx = page => page.evaluate(() => [...document.querySelectorAll('#review-strip canvas')].map(cv => [...cv.getContext('2d').getImageData(1076, 1346, 1, 1).data]));
const isDarkPx = p => p[0] < 45 && p[1] < 45 && p[2] < 50; // the dark scrim is .92 of rgb(10,10,16) at the bottom edge
const waitDark = (page, on) => page.waitForFunction(on => { const c = [...document.querySelectorAll('#review-strip canvas')]; return c.length > 0 && c.every(cv => { const p = cv.getContext('2d').getImageData(1076, 1346, 1, 1).data; return (p[0] < 45 && p[1] < 45 && p[2] < 50) === on; }); }, on, { timeout: 15000 });
const stripHash = page => page.evaluate(() => [...document.querySelectorAll('#review-strip canvas')].map(cv => cv.toDataURL().length + ':' + cv.toDataURL().slice(-60)));
await check('SOC-26 dark look: every slide of a 4-slide deck gets the dark fade over its photo; the photos stay; the face check still runs; toggle Photo > Dark > Photo restores the same pixels; the look "dark" is sent to the Worker', async () => {
  st.drafted = [mk(4, 'idea', 'dark1', { createdAt: '2026-11-19T08:00:00Z' })];
  const { page, ctx } = await open(PH);
  await page.click('.ready-item'); await reviewReady(page);
  const ids0 = await page.evaluate(() => cards.map(c => c.photo));
  const h0 = await stripHash(page);
  assert.ok((await cornerPx(page)).every(p => !isDarkPx(p)), 'photo look has no dark fade');
  await page.screenshot({ path: path.join(SHOTS24, 'photo-390.png') });
  await page.click('#look-dark'); await waitDark(page, true); await reviewReady(page);
  const px = await cornerPx(page);
  assert.equal(px.length, 4); for (const p of px) assert.ok(isDarkPx(p), 'dark ' + p);
  assert.ok(await page.evaluate(() => lastRes.every(r => r && r.hasPhoto === true && typeof r.faceClear === 'boolean')), 'photo and face check on dark');
  assert.ok(!(await page.locator('#approve-btn').isDisabled()));
  await page.screenshot({ path: path.join(SHOTS24, 'dark-390.png') });
  assert.ok(calls.some(c => c.method === 'POST' && /\/api\/concepts\/c-dark1\/look$/.test(c.path) && JSON.parse(c.body).look === 'dark'), 'look sent to the Worker');
  assert.equal(await page.evaluate(() => cards.map(c => c.photo).join()), ids0.join(), 'photos stay on the cards');
  await page.click('#look-photo'); await waitDark(page, false); await reviewReady(page);
  assert.equal(await page.evaluate(() => cards.map(c => c.photo).join()), ids0.join());
  assert.deepEqual(await stripHash(page), h0, 'Photo again draws the same pixels as at the start');
  assert.equal(calls.filter(c => /\/look$/.test(c.path)).length, 2);
  assert.equal(await page.locator('#look-plain').count(), 0, 'no Plain button any more');
  await ctx.close();
});
await check('SOC-33 One photo: hidden on Photo, off by default; on Dark ON -> slides 2+ render with slide 1 photo + onePhoto true, slide 1 untouched; OFF restores each slide photo; saved across reload; part of the deck signature', async () => {
  st.drafted = [mk(4, 'idea', 'one1', { createdAt: '2026-11-19T08:00:00Z' })];
  const { page, errors, ctx } = await open(PH);
  await page.click('.ready-item'); await reviewReady(page);
  assert.equal(await page.locator('#one-photo-wrap').isVisible(), false, 'hidden on the Photo look');
  await page.click('#look-dark'); await waitDark(page, true); await reviewReady(page);
  assert.equal(await page.locator('#one-photo-wrap').isVisible(), true);
  assert.equal(await page.locator('#one-photo-wrap').innerText(), 'One photo');
  assert.equal(await page.locator('#one-photo').isChecked(), false, 'default off');
  await page.evaluate(() => { window.__rs = []; const f = OneLook.renderSlide; OneLook.renderSlide = function (cv, sl, i, n, im, o) { window.__rs.push({ i, src: im && im.src, one: !!(o && o.onePhoto) }); return f.apply(this, arguments); }; });
  const sigOff = await page.evaluate(() => deckSig(null));
  const ownPhotos = await page.evaluate(() => cards.map(c => c.photo));
  const hOff = await stripHash(page);
  assert.ok(new Set(ownPhotos).size > 1, 'fixture slides have different photos');
  await page.check('#one-photo'); await page.waitForTimeout(800); await reviewReady(page);
  const rs = await page.evaluate(() => window.__rs.slice(-4));
  const src0 = await page.evaluate(() => cards[0].photo);
  for (const r of rs) { assert.equal(r.one, r.i > 0, 'onePhoto flag only on slides 2+ (slide ' + (r.i + 1) + ')'); assert.ok(r.src.endsWith(src0.split('/').pop()) || r.src === src0 || r.src.includes(src0.split('/').pop()), 'slide ' + (r.i + 1) + ' uses slide 1 photo'); }
  assert.notEqual(await page.evaluate(() => deckSig(null)), sigOff, 'signature changes with the switch');
  const hOn = await stripHash(page);
  assert.equal(hOn[0], hOff[0], 'slide 1 identical ON and OFF');
  assert.notEqual(hOn[1], hOff[1], 'slide 2 is different when ON');
  await page.reload(); await page.waitForSelector('.ready-item'); await page.click('.ready-item'); await reviewReady(page);
  assert.equal(await page.locator('#one-photo').isChecked(), true, 'kept across reload');
  await page.uncheck('#one-photo'); await page.waitForTimeout(800); await reviewReady(page);
  assert.equal(await page.evaluate(() => cards.map(c => c.photo).join()), ownPhotos.join(), 'own photos kept');
  assert.deepEqual(await stripHash(page), hOff, 'OFF restores the original pixels');
  assert.deepEqual(errors, []);
  await ctx.close();
});
const sha = page => page.evaluate(async () => { const out = []; for (const cv of document.querySelectorAll('#review-strip canvas')) { const b = new TextEncoder().encode(cv.toDataURL()); const h = await crypto.subtle.digest('SHA-256', b); out.push([...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 16)); } return out; });
// Baselines: switch off = the dark deck as origin/main and 4f97749 draw it; colour blur = 4f97749 with One photo ticked (slide 1, slide 2..). Printed by this test on each tree.
await check('SOC-33b One photo treatment: two choices, Colour blur default (pixels = 4f97749), B&W sharp is greyscale, slide 1 untouched, saved, old true = Colour blur', async () => {
  st.drafted = [mk(4, 'idea', 'one2', { createdAt: '2026-11-19T08:00:00Z' })];
  const { page, errors, ctx } = await open(PH);
  await page.click('.ready-item'); await reviewReady(page);
  await page.click('#look-dark'); await waitDark(page, true); await reviewReady(page);
  const hOff = await sha(page); console.log('HASH off', hOff.join(','));
  const hasStyle = await page.locator('#one-style').count();
  if (hasStyle) assert.equal(await page.locator('#one-style').isVisible(), false, 'choice hidden when One photo is off');
  await page.check('#one-photo'); await page.waitForTimeout(800); await reviewReady(page);
  const hBlur = await sha(page); console.log('HASH blur', hBlur.join(','));
  assert.equal(await page.locator('#one-style').isVisible(), true, 'choice shown when One photo is on');
  assert.deepEqual(await page.locator('#one-style label').allInnerTexts(), ['Colour blur', 'B&W sharp']);
  assert.equal(await page.locator('#one-style-blur').isChecked(), true, 'default Colour blur');
  if (process.env.BASE_BLUR) assert.equal(hBlur.join(','), process.env.BASE_BLUR, 'Colour blur pixels = 4f97749');
  if (process.env.BASE_OFF) assert.equal(hOff.join(','), process.env.BASE_OFF, 'switch off pixels = baseline');
  const sigBlur = await page.evaluate(() => deckSig(null));
  await page.check('#one-style-bw'); await page.waitForTimeout(800); await reviewReady(page);
  const hBw = await sha(page); console.log('HASH bw', hBw.join(','));
  assert.equal(hBw[0], hBlur[0], 'slide 1 identical in both modes'); assert.equal(hBw[0], hOff[0], 'slide 1 identical to off');
  assert.notEqual(hBw[1], hBlur[1], 'B&W sharp slide 2 differs from blur');
  assert.notEqual(await page.evaluate(() => deckSig(null)), sigBlur, 'style is in the deck signature');
  const chroma = await page.evaluate(() => { const cv = document.querySelectorAll('#review-strip canvas')[1]; const g = cv.getContext('2d'); let mx = 0, n = 0; for (let y = 100; y < 1300; y += 97) for (let x = 40; x < 1040; x += 89) { const p = g.getImageData(x, y, 1, 1).data; mx = Math.max(mx, Math.abs(p[0] - p[1]), Math.abs(p[1] - p[2])); n++; } return { mx, n }; });
  assert.ok(chroma.n > 100 && chroma.mx <= 6, 'near-zero chroma on B&W slide 2 (max channel gap ' + chroma.mx + ')');
  await page.reload(); await page.waitForSelector('.ready-item'); await page.click('.ready-item'); await reviewReady(page);
  assert.equal(await page.locator('#one-style-bw').isChecked(), true, 'B&W sharp kept across reload');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ig_onephoto_v1'))[meta.conceptId]), 'bw-sharp');
  // backward compatibility: an old saved `true` is Colour blur
  await page.evaluate(() => { const m = JSON.parse(localStorage.getItem('ig_onephoto_v1')); m[meta.conceptId] = true; localStorage.setItem('ig_onephoto_v1', JSON.stringify(m)); });
  await page.reload(); await page.waitForSelector('.ready-item'); await page.click('.ready-item'); await reviewReady(page);
  assert.equal(await page.locator('#one-photo').isChecked(), true); assert.equal(await page.locator('#one-style-blur').isChecked(), true, 'old true = Colour blur');
  assert.equal((await sha(page)).join(','), hBlur.join(','), 'old saved true draws the Colour blur pixels');
  assert.deepEqual(errors, []);
  await ctx.close();
});
await check('SOC-26 dark: the face check runs on dark too: a face-blocked photo deck is blocked on Photo and on Dark', async () => {
  st.drafted = [faceDeck('blockeddark', 'gb')];
  const { page, ctx } = await open(PH);
  await page.click('.ready-item');
  await page.waitForFunction(() => /Words are over your face on slide 2/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.ok(await page.locator('#approve-btn').isDisabled());
  await page.click('#look-dark'); await waitDark(page, true);
  await page.waitForFunction(() => /Words are over your face on slide 2/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.ok(await page.locator('#approve-btn').isDisabled(), 'still blocked on dark');
  await ctx.close();
});
await check('SOC-26 dark: the size guard blocks Approve on a too-small photo (400x500) on dark, names the slide, and sends nothing', async () => {
  st.drafted = [mk(4, 'idea', 'smalldark', { createdAt: '2026-11-19T08:00:00Z', photoFor: i => i === 2 ? 'gs' : 'gc0' })];
  const { page, ctx } = await open(PH);
  await page.click('.ready-item'); await page.waitForFunction(() => /Photo too small/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  await page.click('#look-dark'); await waitDark(page, true);
  await page.waitForFunction(() => /Photo too small for a sharp slide on slide 3/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.equal(await page.textContent('#msg'), 'Photo too small for a sharp slide on slide 3. Pick another photo.');
  assert.ok(await page.locator('#approve-btn').isDisabled());
  await page.waitForTimeout(400); assert.equal(st.published.length, 0);
  assert.ok(await page.evaluate(() => look === 'dark' && lastRes.some(r => r && r.hasPhoto && r.lowRes === true)));
  await ctx.close();
});
await check('SOC-26 dark: the fit check still runs and blocks Approve on an over-long slide', async () => {
  const c = mk(3, 'idea', 'longdark', { createdAt: '2026-11-19T08:00:00Z', photoFor: () => 'gn' }); // no face data, so the fit message is the one shown
  c.deck.slides[1].title = 'Fixture long words '.repeat(60);
  st.drafted = [c];
  const { page, ctx } = await open(PH);
  await page.click('.ready-item'); await reviewReady(page).catch(() => {});
  await page.click('#look-dark'); await waitDark(page, true);
  await page.waitForFunction(() => /Slide 2 has too many words to fit/.test(document.getElementById('msg').textContent), null, { timeout: 15000 });
  assert.ok(await page.locator('#approve-btn').isDisabled());
  await ctx.close();
});
await check('SOC-26 a concept whose look is the old "plain" opens dark; a life concept with no look opens dark; series and idea open Photo; the series label shows for series, life and idea', async () => {
  const t = i => `2026-11-19T07:0${i}:00Z`;
  const life = mk(3, 'life', 'golf', { createdAt: t(1) }); life.look = 'plain';
  const life2 = mk(3, 'life', 'hotel', { createdAt: t(4) }); delete life2.look;
  st.drafted = [mk(3, 'series', 'sierra', { createdAt: t(2) }), life, mk(3, 'idea', 'india', { createdAt: t(3) }), life2];
  const { page, ctx } = await open(PH);
  const want = { sierra: 'Work less, do more', golf: 'Life', india: 'One-off', hotel: 'Life' };
  for (const tag of Object.keys(want)) {
    await openItem(page, tag); await reviewReady(page);
    assert.equal(await page.textContent('#series-line'), want[tag]);
    const dark = tag === 'golf' || tag === 'hotel';
    assert.equal(await page.evaluate(() => look), dark ? 'dark' : 'photo', tag);
    if (dark) { await waitDark(page, true); assert.ok((await cornerPx(page)).every(isDarkPx)); await page.screenshot({ path: path.join(SHOTS24, 'label-life-390.png') }); }
    await page.click('#review-back'); await page.waitForSelector('.ready-item');
  }
  await ctx.close();
});
await check('SOC-26 a saved look "plain" on this device (SOC-24 setting) loads as dark', async () => {
  st.drafted = [mk(3, 'idea', 'oldsetting', { createdAt: '2026-11-19T08:00:00Z' })];
  const { page, ctx } = await open(PH, { lsLook: 'plain' });
  assert.equal(await page.evaluate(() => look), 'dark');
  assert.equal(await page.evaluate(() => lookOf('plain') + lookOf('dark') + lookOf('photo') + lookOf(undefined) + lookOf('neon')), 'darkdarkphotophotophoto');
  await ctx.close();
});

await check('SOC-24 a look change after a refused approve publishes new images (the look is part of the approve signature)', async () => {
  st.drafted = [mk(3, 'idea', 'sigcheck', { createdAt: '2026-11-19T08:00:00Z' })]; st.approveMode = 'fail';
  const { page, ctx } = await open(PH);
  await page.click('.ready-item'); await reviewReady(page);
  await page.click('#approve-btn'); await page.waitForFunction(() => /Not approved yet/.test(document.getElementById('msg').textContent), null, { timeout: 30000 });
  assert.equal(st.published.length, 1);
  await page.click('#look-dark'); await waitDark(page, true); await reviewReady(page);
  st.approveMode = 'ok';
  await page.click('#approve-btn'); await approvedMsg(page);
  assert.equal(st.published.length, 2, 'the dark images were published, not the earlier photo ones');
  await ctx.close();
});

await check('Drafts list failure says why: no access code, wrong code, server error, no connection', async () => {
  const text = page => page.locator('#ready-status').textContent();
  const waitFail = page => page.waitForFunction(() => /Could not get your drafts/.test(document.getElementById('ready-status').textContent), null, { timeout: 15000 });
  // (a) no access code saved on this phone
  const a = await open(PH, { connected: false, noWait: true });
  await a.page.waitForSelector('#ready-retry', { state: 'attached' });
  await a.page.evaluate(() => refreshReady());
  await waitFail(a.page);
  assert.ok((await text(a.page)).includes('no access code saved'), 'a: ' + await text(a.page));
  await a.ctx.close();
  // (b) 401, (c) network failure, (d) 500: load fine, then break the list and retry
  for (const [label, handler, want] of [
    ['b', r => r.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{"ok":false}' }), 'wrong or old'],
    ['c', r => r.abort(), 'no connection'],
    ['d', r => r.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: '{"ok":false}' }), 'server said 500'],
    ['e', r => r.fulfill({ status: 404, headers: cors, contentType: 'application/json', body: '{"ok":false}' }), 'Worker address on this phone is wrong']
  ]) {
    const o = await open(PH);
    await o.ctx.route(u => /\/api\/concepts\?status=/.test(u.href), handler);
    await o.page.evaluate(() => refreshReady());
    await waitFail(o.page);
    assert.ok((await text(o.page)).includes(want), label + ': ' + await text(o.page));
    await o.ctx.close();
  }
});

await check('A saved Worker address with no https:// and a path is reduced to its origin', async () => {
  const o = await open(PH);
  const urls = [];
  await o.ctx.route(u => /^https:\/\/drliz-draft-approval\.drlizlondon\.workers\.dev\//.test(u.href), r => { urls.push(r.request().url()); r.fulfill({ status: 401, headers: cors, contentType: 'application/json', body: '{"ok":false}' }); });
  await o.page.evaluate(() => { localStorage.setItem('orb_worker_base', 'drliz-draft-approval.drlizlondon.workers.dev/some/path/'); return refreshReady(); });
  await o.page.waitForFunction(() => /Could not get your drafts/.test(document.getElementById('ready-status').textContent), null, { timeout: 15000 });
  const hit = urls.find(u => /\/api\/concepts/.test(u));
  assert.ok(hit, 'no request reached the Worker host: ' + JSON.stringify(urls));
  assert.ok(hit.startsWith('https://drliz-draft-approval.drlizlondon.workers.dev/api/concepts'), hit);
  await o.ctx.close();
});

// ===== Orb Instagram tidy-up (2026-11-22): one name, one topic tag, #NNN only on numbered posts, a quality line only from a real check =====
const TD = i => `2026-11-19T07:0${i}:00Z`;
await check('TIDY topic tag: a Life draft is tagged Life (never "Words over my photos"); series and one-off keep their own topic', async () => {
  st.drafted = [mk(3, 'series', 'sx', { createdAt: TD(1) }), mk(3, 'life', 'lx', { createdAt: TD(2) }), mk(3, 'idea', 'ix', { createdAt: TD(3) })];
  const { page, ctx } = await open(PH);
  await page.waitForFunction(() => document.querySelectorAll('.ready-item').length === 3);
  const tagOf = async t => (await page.locator('.ready-item', { hasText: 'Fixture ' + t }).locator('.ready-tag').allTextContents());
  assert.deepEqual(await tagOf('lx'), ['Life']); assert.deepEqual(await tagOf('sx'), ['Work less, do more']); assert.deepEqual(await tagOf('ix'), ['One-off']);
  for (const t of ['sx', 'lx', 'ix']) assert.equal((await page.locator('.ready-item', { hasText: 'Fixture ' + t }).locator('.ready-tag').count()), 1, 'exactly one topic tag');
  await ctx.close();
});
await check('TIDY no "Words over my photos" and no "Cover Series" label anywhere a person can see it (Ready, review, edit, source)', async () => {
  st.drafted = [mk(3, 'life', 'lx', { createdAt: TD(2) }), mk(3, 'idea', 'ix', { createdAt: TD(3) })];
  const { page, ctx } = await open(PH);
  const bad = /Words over my photos|Cover Series|Insta Creator/i;
  assert.ok(!bad.test(await page.locator('body').innerText()), 'Ready');
  for (const t of ['lx', 'ix']) {
    await openItem(page, t); await reviewReady(page); assert.ok(!bad.test(await page.locator('body').innerText()), 'review ' + t);
    await page.click('#edit-btn'); assert.ok(!bad.test(await page.locator('body').innerText()), 'edit ' + t);
    await page.click('#edit-done'); await reviewReady(page); await page.click('#review-back'); await page.waitForSelector('.ready-item');
  }
  assert.ok(!/Words over my photos|Insta Creator/.test(fs.readFileSync(FILE, 'utf8')), 'source');
  assert.equal(await page.title(), 'Instagram');
  await ctx.close();
});
await check('TIDY two tabs Posts and Reels, buttons New post and Settings (no Carousels / New idea / More)', async () => {
  const { page, ctx } = await open(PH);
  assert.equal((await page.textContent('#carousels-btn')).trim(), 'Posts'); assert.equal((await page.textContent('#trial-btn')).trim(), 'Reels');
  assert.equal((await page.textContent('#new-idea-btn')).trim(), 'New post'); assert.equal((await page.textContent('#more-btn')).trim(), 'Settings');
  const txt = await page.locator('#screen-ready').innerText(); assert.ok(!/Carousels|New idea|\bMore\b/.test(txt), txt);
  await ctx.close();
});
await check('TIDY #NNN shows only when a series record carries its own number, never on Life or One-off', async () => {
  st.drafted = [{ ...mk(3, 'series', 'sx', { createdAt: TD(1) }), series: { n: 12 } }, mk(3, 'life', 'lx', { createdAt: TD(2) }), mk(3, 'idea', 'ix', { createdAt: TD(3) })];
  const { page, ctx } = await open(PH);
  await page.waitForFunction(() => document.querySelectorAll('.ready-item').length === 3 && document.querySelectorAll('.ready-num').length > 0, null, { timeout: 15000 });
  const numOf = t => page.locator('.ready-item', { hasText: 'Fixture ' + t }).locator('.ready-num').allTextContents();
  assert.deepEqual(await numOf('sx'), ['#012']); assert.deepEqual(await numOf('lx'), []); assert.deepEqual(await numOf('ix'), []);
  await ctx.close();
});
await check('TIDY two series drafts with no number on the record show no #NNN on either card (never the shared next number)', async () => {
  st.drafted = [mk(3, 'series', 'sa', { createdAt: TD(1) }), mk(3, 'series', 'sb', { createdAt: TD(2) })];
  const { page, ctx } = await open(PH);
  await page.waitForFunction(() => document.querySelectorAll('.ready-item').length === 2);
  await page.waitForFunction(() => seriesInfo.next === 7);
  assert.equal(await page.locator('.ready-num').count(), 0); assert.ok(!/#0\d\d/.test(await page.locator('#ready-list').innerText()));
  await ctx.close();
});
await check('TIDY cover quality line is computed (G6): small photo says too small; a big photo says sharp; no photo or no check shows no line and never "sharp" / "face clear"', async () => {
  st.drafted = [mk(3, 'idea', 'small', { createdAt: TD(1), photoFor: i => i === 0 ? 'gs' : 'gc0' }), mk(3, 'idea', 'big', { createdAt: TD(2), photoFor: i => i === 0 ? 'gc0' : 'gc1' }), mk(3, 'idea', 'nophoto', { createdAt: TD(3), photoFor: () => '' })];
  const { page, ctx } = await open(PH);
  await page.waitForFunction(() => document.querySelectorAll('.ready-item').length === 3);
  await page.waitForFunction(() => document.querySelectorAll('.ready-quality:not([hidden])').length >= 2, null, { timeout: 20000 });
  const q = t => page.locator('.ready-item', { hasText: 'Fixture ' + t }).locator('.ready-quality');
  assert.equal(await q('small').textContent(), 'Cover: photo too small. Pick another');
  assert.match(await q('big').textContent(), /^Cover: sharp/);
  assert.ok(!(await q('nophoto').isVisible()), 'no check ran, no line');
  assert.equal((await q('nophoto').textContent()), '');
  await ctx.close();
});
await check('TIDY G6 with no album connection no draft shows a quality line', async () => {
  st.drafted = [mk(3, 'idea', 'big', { createdAt: TD(2), photoFor: i => i === 0 ? 'gc0' : 'gc1' })];
  const { page, ctx } = await open(PH);
  await page.waitForFunction(() => document.querySelectorAll('.ready-item').length === 1);
  await page.evaluate(() => { localStorage.removeItem('orb_worker_base'); localStorage.removeItem('orb_approve_token'); coverChecks.clear(); });
  assert.equal(await page.evaluate(() => coverLine(null)), '');
  assert.equal(await page.evaluate(() => coverLine({ lowRes: null, faceClear: null })), '');
  assert.equal(await page.evaluate(() => checkCover({ id: 'zz', deck: { slides: [{ photo: 'gc0' }] } }).then(x => x)), null);
  await ctx.close();
});
await check('TIDY 390px: Ready has no sideways scroll and no en/em dash or "calm" in visible text', async () => {
  st.drafted = [mk(3, 'series', 'sx', { createdAt: TD(1) }), mk(3, 'life', 'lx', { createdAt: TD(2) })];
  const { page, ctx } = await open(PH);
  await page.waitForFunction(() => document.querySelectorAll('.ready-quality:not([hidden])').length >= 1, null, { timeout: 20000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow');
  const txt = await page.locator('body').innerText(); assert.ok(!/[–—]/.test(txt) && !/calm/i.test(txt));
  await ctx.close();
});

if (process.env.TIDY_SHOT_DIR) await check('TIDY pictures at 390px for the founder (stub data: gradient photos and Fixture titles, not her drafts)', async () => {
  st.drafted = [{ ...mk(3, 'series', 'sx', { createdAt: TD(1), photoFor: i => i === 0 ? 'gc0' : 'gc1' }), series: { n: 12 } }, mk(3, 'life', 'lx', { createdAt: TD(2), photoFor: i => i === 0 ? 'gc1' : 'gc2' }), mk(3, 'idea', 'ix', { createdAt: TD(3), photoFor: i => i === 0 ? 'gs' : 'gc0' }), mk(3, 'idea', 'nophoto', { createdAt: TD(4), photoFor: () => '' })];
  const { page, ctx } = await open(PH);
  await page.waitForFunction(() => document.querySelectorAll('.ready-item').length === 4);
  await page.waitForFunction(() => document.querySelectorAll('.ready-quality:not([hidden])').length >= 3, null, { timeout: 20000 });
  await page.screenshot({ path: path.join(process.env.TIDY_SHOT_DIR, 'orb-tidy-posts.png'), fullPage: true });
  await page.click('#trial-btn'); await page.waitForSelector('#screen-trial:not([hidden])');
  await page.screenshot({ path: path.join(process.env.TIDY_SHOT_DIR, 'orb-tidy-reels.png'), fullPage: true });
  await ctx.close();
});

await check('Source asserts: no en or em dash, no "calm", no Buffer or Keychain path, no token in the source, only the spec\'d Worker routes', async () => {
  const src = fs.readFileSync(FILE, 'utf8');
  assert.ok(!/api\.buffer\.com|buffer-api|find-generic-password/i.test(src), 'buffer/credential path'); assert.ok(!src.includes(TOKEN));
  assert.ok(!/[–—]/.test(src), 'dash'); assert.ok(!/calm/i.test(src), 'calm');
  assert.ok(!(/function\s+renderDeck/.test(src) && /carousel_decks_v2/.test(src) && /syncDomToState/.test(src)));
  const routes = [...new Set([...src.matchAll(/api\(\s*'(\/api\/[a-z/-]+)/g)].map(m => m[1]).concat([...src.matchAll(/api\(\s*'(\/api\/[a-z/-]+)\?/g)].map(m => m[1])))].sort();
  assert.deepEqual(routes, ['/api/album', '/api/album-stats', '/api/concepts', '/api/concepts/', '/api/drafts/', '/api/publish', '/api/reels', '/api/reels/', '/api/run-now', '/api/series', '/api/series/floor']);
  assert.ok(/'\/api\/drafts\/' \+ encodeURIComponent\(id\) \+ '\/approve'/.test(src));
  assert.ok(!/localStorage\.setItem\(\s*LS_TOKEN[^)]*\)\s*;?\s*\n[^]*fetch\(\s*['"]http/.test(src));
  execFileSync('node', ['/Users/lizzie/NightMode/scripts/no-stray-orb-tool.mjs'], { stdio: 'pipe' });
});

await browser.close(); worker.close(); site.close();
for (const [s, n] of results) console.log(s, n);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
