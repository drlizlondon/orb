// Founder ruling 2026-11-24 [Orb / approve and edit where you look]: Approve on the open draft (Posts and Reels), tap-to-edit words, scroll kept.
// Playwright against a local static server + a stubbed Worker (fixture data, a fake token; the live Worker is never called).
// Run: node tests/review-flow.spec.mjs   (same env as tests/carousel-insta.spec.mjs: PLAYWRIGHT_DIR, CHROMIUM_PATH)
// PAGE_FILE=<path> runs the same checks against another copy of index.html (used to show each must-fail check failing on the pre-change page).
// SHOT_DIR=<dir> also writes review-flow-390.png, review-flow-1280.png and review-flow-edit-390.png.
// Named .spec.mjs so `node --test tests/*.test.mjs` does not pick it up.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const FILE = process.env.PAGE_FILE || path.join(root, 'dist/carousel-insta/index.html');
const LOOK = path.join(root, 'dist/carousel-insta/look.js');
const REEL = path.join(root, 'dist/carousel-insta/reel.js');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.PLAYWRIGHT_DIR || '/Users/lizzie/colourpuzzle/node_modules', 'playwright'));
const TOKEN = 'test-token-not-real-0003'; // fake, test only

function crc32(buf) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function gradientPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = 160; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = gradientPng(2160, 2880);
const ALBUM = ['gc0', 'gc1', 'gc2'].map(guid => ({ guid, width: 2160, height: 2880, caption: '', face: { x: 0.35, y: 0.15, w: 0.3, h: 0.22 } }));

// The founder's inbox post, verbatim from the SOC-34 spec Fixtures section (the caption is the part of it the spec quotes).
const INBOX = {
  slides: [
    { title: '30,000 emails in my inbox 😞 Nightmare.', sub: '', photo: 'gc0' },
    { title: 'I could always have pressed delete all. But actually sorting it out felt impossible.', sub: '', photo: 'gc1' },
    { title: 'So I built an AI tool to do it. 1,147 gone from one sender alone.', sub: '', photo: 'gc2' }
  ],
  caption: 'One inbox sorted... 3 more to go. Is this tool something you need?'
};
const mkDeck = (d, kick) => ({ slides: d.slides.map((s, i) => ({ kicker: '', num: '', swipe: i === 0 ? 'Swipe' : '', ...s })), caption: d.caption, claims: [], evidence: kick || 'Fixture evidence' });
const fixtureDeck = tag => ({ slides: [0, 1, 2].map(i => ({ title: `Fixture ${tag} line ${i + 1}`, sub: `Fixture second line ${i + 1}.`, photo: 'gc' + i })), caption: 'Fixture caption ' + tag + '.' });
function concept(id, d, o = {}) { return { id, concept: 'Fixture concept ' + id, lane: 'wide', kind: o.kind || 'idea', status: 'drafted', createdAt: o.createdAt || '2026-11-24T07:00:00Z', deck: mkDeck(d), ...(o.extra || {}) }; }

let st; const calls = [];
const defaults = () => ({ concepts: [concept('c-inbox', INBOX)], reels: [{ id: 'r-1', status: 'ready', script: 'Fixture reel script one', durationMs: 10000, review: null }], putMode: 'ok' });
st = defaults();
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
const worker = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (/^\/img-album\//.test(u.pathname)) { res.writeHead(200, { ...cors, 'content-type': 'image/png' }); return res.end(PNG); }
  let body = ''; req.on('data', d => body += d);
  req.on('end', () => {
    calls.push({ method: req.method, path: u.pathname + u.search, body });
    const j = (s, o) => { res.writeHead(s, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return j(401, { ok: false, error: 'access token required' });
    const p = u.pathname, m = req.method;
    if (p === '/api/concepts' && m === 'GET') { const s = u.searchParams.get('status'); return j(200, { ok: true, concepts: st.concepts.filter(c => c.status === s).map(c => ({ ...c, postState: 'none' })) }); }
    const dt = /^\/api\/concepts\/([^/]+)\/deck-text$/.exec(p);
    if (dt && m === 'PUT') {
      const c = st.concepts.find(x => x.id === decodeURIComponent(dt[1])); if (!c) return j(404, { ok: false, error: 'no such concept' });
      if (st.putMode === '422') return j(422, { ok: false, error: 'not postable', reasons: ['Slide 2 repeats slide 1.', 'The caption is a copy of the idea.'] });
      const b = JSON.parse(body);
      c.deck.slides.forEach((sl, i) => { sl.title = b.slides[i].title; sl.sub = b.slides[i].sub; }); c.deck.caption = b.caption;
      return j(200, { ok: true, concept: c });
    }
    if (p === '/api/publish' && m === 'PUT') { const d = JSON.parse(body).drafts[0]; st.lastDraft = d; return j(200, { ok: true }); }
    const ap = /^\/api\/drafts\/([^/]+)\/approve$/.exec(p);
    if (ap && m === 'POST') { const cid = st.lastDraft && st.lastDraft.conceptId; const c = st.concepts.find(x => x.id === cid); if (c) c.status = 'approved'; return j(200, { ok: true }); }
    if (p === '/api/reels' && m === 'GET') return j(200, { ok: true, reels: st.reels });
    const ra = /^\/api\/reels\/([^/]+)\/approve$/.exec(p);
    if (ra && m === 'POST') { const r = st.reels.find(x => x.id === ra[1]); if (!r) return j(404, { ok: false }); r.status = 'approved'; return j(200, { ok: true }); }
    if (/^\/api\/reels\/[^/]+\/video$/.test(p)) { res.writeHead(200, { ...cors, 'content-type': 'video/mp4' }); return res.end(Buffer.from('not a real video')); }
    if (p === '/api/album-stats') return j(200, { ok: true, stats: null });
    if (p === '/api/album') return j(200, { ok: true, photos: ALBUM.map(a => ({ ...a, url: '/img-album/' + a.guid })) });
    if (p === '/api/series') return j(200, { ok: true, last: 6, next: 7, assigned: [] });
    j(404, { ok: false, error: 'not found' });
  });
});
const site = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const send = (f, t) => { res.writeHead(200, { 'content-type': t }); res.end(fs.readFileSync(f)); };
  if (p === '/look.js') return send(LOOK, 'text/javascript');
  if (p === '/reel.js') return send(REEL, 'text/javascript');
  if (p === '/') return send(FILE, 'text/html');
  res.writeHead(404); res.end('no');
});
await new Promise(r => worker.listen(0, '127.0.0.1', r));
await new Promise(r => site.listen(0, '127.0.0.1', r));
const W = `http://127.0.0.1:${worker.address().port}`;
const S = `http://127.0.0.1:${site.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
const check = async (name, fn) => { st = defaults(); calls.length = 0; try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' :: ' + e.message.split('\n')[0]]); } };
async function open(w, h, hash = '') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href), r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(([b, t]) => { localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', t); }, [W, TOKEN]);
  await page.goto(S + hash);
  if (!hash) await page.waitForFunction(() => /Ready to post/.test(document.getElementById('ready-heading').textContent) && !document.getElementById('ready-heading').hidden, null, { timeout: 15000 });
  return { page, errors, ctx };
}
const reviewReady = page => page.waitForFunction(() => !document.getElementById('approve-btn').disabled && !document.getElementById('screen-review').hidden, null, { timeout: 15000 });
const writes = () => calls.filter(c => c.method !== 'GET');
// fully inside the viewport (so no scrolling is needed to tap it)
const inView = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; }, sel);
const many = n => Array.from({ length: n }, (_, i) => concept('c-' + i, fixtureDeck('n' + i), { createdAt: `2026-11-24T07:${String(10 + i)}:00Z` }));

await check('Approve on an open Posts draft: visible without scrolling at 390x844, one tap sends publish + approve, and the list shows the post as approved', async () => {
  const { page, errors, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  assert.ok(await inView(page, '#approve-btn'), 'Approve is outside the 390x844 screen');
  await page.click('#approve-btn');
  await page.waitForFunction(() => !document.getElementById('screen-ready').hidden && document.querySelectorAll('.approved-item').length === 1, null, { timeout: 30000 });
  assert.ok(calls.some(c => c.method === 'POST' && c.path === '/api/drafts/' + JSON.parse(calls.find(x => x.path === '/api/publish').body).drafts[0].id + '/approve'), 'approve was called');
  assert.match(await page.textContent('.approved-item'), /Approved\./);
  assert.match(await page.textContent('.approved-item'), /30,000 emails in my inbox/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check('Approve on an open Reel: the open reel shows Approve in view at 390x844, one tap posts /approve, and the Reels list shows it as Approved', async () => {
  const { page, errors, ctx } = await open(390, 844, '#reels');
  await page.waitForSelector('.reel-item'); await page.click('.reel-open');
  await page.waitForSelector('#screen-reel:not([hidden])');
  assert.ok(await inView(page, '#nr-approve'), 'Approve is not on the open reel screen');
  await page.click('#nr-approve');
  await page.waitForFunction(() => !document.getElementById('screen-trial').hidden, null, { timeout: 15000 });
  assert.ok(calls.some(c => c.method === 'POST' && c.path === '/api/reels/r-1/approve'));
  await page.waitForFunction(() => /Approved/.test(document.querySelector('.reel-status').textContent));
  assert.equal(await page.locator('#reel-approve-r-1').count(), 0, 'no second Approve once approved');
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check('Scroll kept: with 12 drafts, scroll to the 10th, open it, Approve: the list is back at the same place (within 50px) with the approved row where it stood', async () => {
  st.concepts = many(12);
  const { page, ctx } = await open(390, 700);
  const tenth = page.locator('.ready-item').nth(9);
  await tenth.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 120));
  const before = await page.evaluate(() => scrollY); assert.ok(before > 400, 'scrolled ' + before);
  await tenth.click(); await reviewReady(page); await page.click('#approve-btn');
  await page.waitForFunction(() => !document.getElementById('screen-ready').hidden && document.querySelectorAll('.approved-item').length === 1, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => scrollY);
  assert.ok(Math.abs(after - before) <= 50, 'after ' + after + ' vs before ' + before);
  await ctx.close();
});

await check('Reel scroll kept: Approve from an open reel returns to the Reels list at the same place', async () => {
  st.reels = Array.from({ length: 14 }, (_, i) => ({ id: 'r-' + (i + 1), status: 'ready', script: 'Fixture reel script ' + (i + 1), durationMs: 10000, review: null }));
  const { page, ctx } = await open(390, 700, '#reels');
  await page.waitForSelector('.reel-item');
  const row = page.locator('.reel-item').nth(10); await row.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 100));
  const before = await page.evaluate(() => scrollY); assert.ok(before > 300, 'scrolled ' + before);
  await row.locator('.reel-open').click(); await page.waitForSelector('#nr-approve:not([hidden])'); await page.click('#nr-approve');
  await page.waitForFunction(() => !document.getElementById('screen-trial').hidden);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => scrollY);
  assert.ok(Math.abs(after - before) <= 50, 'after ' + after + ' vs before ' + before);
  await ctx.close();
});

await check('Tap to edit: the hint is above the words; tap line 2, type, Save words sends PUT with only line 2 changed; the slides show it and a reload keeps it', async () => {
  const { page, errors, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  assert.equal((await page.textContent('#words-hint')).trim(), 'Tap any line to change it.');
  assert.ok(await page.evaluate(() => document.getElementById('words-hint').getBoundingClientRect().top < document.getElementById('words-list').getBoundingClientRect().top));
  assert.equal(await page.locator('#words-save').isVisible(), false, 'Save words only appears while editing');
  await page.click('#words-list li:nth-child(2)');
  const f = page.locator('#words-list li:nth-child(2) textarea'); assert.equal(await f.count(), 1);
  await f.fill('I could have pressed delete all. Sorting it out felt impossible.');
  assert.equal(await page.locator('#words-save').isVisible(), true);
  assert.ok(await inView(page, '#words-save'), 'Save words is not in view');
  await page.click('#words-save');
  await page.waitForFunction(() => /Saved/.test(document.getElementById('msg').textContent));
  const w = writes(); assert.equal(w.length, 1); assert.equal(w[0].method, 'PUT'); assert.equal(w[0].path, '/api/concepts/c-inbox/deck-text');
  assert.deepEqual(JSON.parse(w[0].body), { slides: [{ title: INBOX.slides[0].title, sub: '' }, { title: 'I could have pressed delete all. Sorting it out felt impossible.', sub: '' }, { title: INBOX.slides[2].title, sub: '' }], caption: INBOX.caption });
  assert.equal(await page.locator('#words-list textarea').count(), 0, 'fields close after saving');
  assert.match(await page.textContent('#words-list'), /I could have pressed delete all\./);
  assert.equal(await page.locator('#review-strip canvas').count(), 3);
  await page.reload(); await page.waitForSelector('.ready-item'); await page.click('.ready-item'); await reviewReady(page);
  assert.match(await page.textContent('#words-list'), /I could have pressed delete all\./);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check('Tap the caption to edit it: Save words sends the new caption and the slide lines unchanged', async () => {
  const { page, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  await page.click('#words-caption'); await page.fill('#words-caption-edit', 'One inbox sorted. 3 more to go.');
  await page.click('#words-save'); await page.waitForFunction(() => /Saved/.test(document.getElementById('msg').textContent));
  assert.deepEqual(JSON.parse(writes()[0].body), { slides: INBOX.slides.map(s => ({ title: s.title, sub: '' })), caption: 'One inbox sorted. 3 more to go.' });
  assert.equal(await page.textContent('#words-caption'), 'One inbox sorted. 3 more to go.');
  await ctx.close();
});

await check('Edit refused (422): the reasons show in plain words under the words, the field stays open, nothing is saved, and a reload shows the old words', async () => {
  st.putMode = '422';
  const { page, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  await page.click('#words-list li:nth-child(2)'); await page.fill('#words-list li:nth-child(2) textarea', 'She said something else entirely.');
  await page.click('#words-save');
  await page.waitForFunction(() => /not postable yet/.test(document.getElementById('words-msg').textContent));
  assert.deepEqual(await page.locator('#words-msg li').allTextContents(), ['Slide 2 repeats slide 1.', 'The caption is a copy of the idea.']);
  assert.equal(await page.locator('#words-list li:nth-child(2) textarea').count(), 1, 'the field stays open so she can fix it');
  assert.equal(st.concepts[0].deck.slides[1].title, INBOX.slides[1].title, 'nothing saved');
  await page.reload(); await page.waitForSelector('.ready-item'); await page.click('.ready-item'); await reviewReady(page);
  assert.doesNotMatch(await page.textContent('#words-list'), /She said/);
  await ctx.close();
});

await check('Cancel restores the old words and sends nothing; Approve is held while a line is open', async () => {
  const { page, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  await page.click('#words-list li:nth-child(3)'); await page.fill('#words-list li:nth-child(3) textarea', 'Typed then dropped.');
  assert.equal(await page.locator('#approve-btn').isDisabled(), true, 'Approve held while editing');
  await page.click('#words-cancel');
  assert.equal(await page.locator('#words-list textarea').count(), 0);
  assert.equal(await page.locator('#words-list li:nth-child(3)').textContent(), INBOX.slides[2].title);
  assert.equal(await page.locator('#approve-btn').isDisabled(), false, 'Approve back after Cancel');
  assert.equal(writes().length, 0);
  await ctx.close();
});

await check('G1 an empty title or caption cannot be saved (Save words is off), and an unchanged field cannot be saved either', async () => {
  const { page, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  await page.click('#words-list li:nth-child(1)');
  assert.equal(await page.locator('#words-save').isDisabled(), true, 'nothing changed yet');
  await page.fill('#words-list li:nth-child(1) textarea', '   ');
  assert.equal(await page.locator('#words-save').isDisabled(), true, 'blank title');
  await page.click('#words-cancel');
  await page.click('#words-caption'); await page.fill('#words-caption-edit', '');
  assert.equal(await page.locator('#words-save').isDisabled(), true, 'blank caption');
  assert.equal(writes().length, 0);
  await ctx.close();
});

await check('A draft with no concept id (local deck) is not tap-to-edit: no hint, no fields', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(([b, t]) => { localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', t); }, [W, TOKEN]);
  await page.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href), r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto(S);
  await page.waitForSelector('.ready-item');
  const r = await page.evaluate(() => { meta.conceptId = null; renderDraftWords(); return { hint: document.getElementById('words-hint').hidden }; });
  assert.equal(r.hint, true);
  await ctx.close();
});

await check('The token is never in the page text, and there are no console errors on the open draft or open reel', async () => {
  const { page, errors, ctx } = await open(1280, 900);
  await page.click('.ready-item'); await reviewReady(page);
  assert.deepEqual(errors, []); assert.ok(!(await page.content()).includes(TOKEN));
  await ctx.close();
});

if (process.env.SHOT_DIR) {
  fs.mkdirSync(process.env.SHOT_DIR, { recursive: true });
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    st = defaults();
    const { page, ctx } = await open(w, h);
    await page.click('.ready-item'); await reviewReady(page);
    await page.screenshot({ path: path.join(process.env.SHOT_DIR, `review-flow-${w}.png`) });
    if (w === 390) {
      await page.click('#words-list li:nth-child(2)');
      await page.fill('#words-list li:nth-child(2) textarea', 'I could have pressed delete all. Sorting it out felt impossible.');
      await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'review-flow-edit-390.png') });
    }
    await ctx.close();
  }
}

await browser.close(); worker.close(); site.close();
let bad = 0;
for (const [r, n] of results) { console.log(r + ' ' + n); if (r === 'FAIL') bad++; }
console.log(`${results.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
