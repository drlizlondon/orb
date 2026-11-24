// SOC-34 Part B acceptance: Playwright against a local static server + a stubbed Worker (fixture data, a fake token; the live Worker is never called).
// Run: node tests/review-layout.spec.mjs   (same env as tests/carousel-insta.spec.mjs: PLAYWRIGHT_DIR, CHROMIUM_PATH)
// PAGE_FILE=<path> runs the same checks against another copy of index.html (used to show each must-fail check failing on the pre-change page).
// SHOT_DIR=<dir> also writes the founder's review screenshots (soc34-review-390.png, soc34-review-1280.png, plus the list with the counts bar).
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
const TOKEN = 'test-token-not-real-0002'; // fake, test only

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
const defaults = () => ({ concepts: [concept('c-inbox', INBOX)], stats: null, putMode: 'ok', rewriteMode: 'ok' });
st = defaults();
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
const worker = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const im = /^\/img-album\/(.+)$/.exec(u.pathname);
  if (im) { calls.push({ method: 'GET', path: u.pathname + u.search, auth: '' }); res.writeHead(200, { ...cors, 'content-type': 'image/png' }); return res.end(PNG); }
  let body = ''; req.on('data', d => body += d);
  req.on('end', () => {
    calls.push({ method: req.method, path: u.pathname + u.search, auth: req.headers.authorization || '', body });
    const j = (s, o) => { res.writeHead(s, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return j(401, { ok: false, error: 'access token required' });
    const p = u.pathname, m = req.method;
    if (p === '/api/concepts' && m === 'GET') { const s = u.searchParams.get('status'); return j(200, { ok: true, concepts: st.concepts.filter(c => c.status === s).map(c => ({ ...c, postState: 'none' })) }); }
    const rw = /^\/api\/concepts\/([^/]+)\/rewrite$/.exec(p);
    if (rw && m === 'POST') {
      const c = st.concepts.find(x => x.id === decodeURIComponent(rw[1])); if (!c) return j(404, { ok: false, error: 'no such concept' });
      if (st.rewriteMode === 'posted') return j(409, { ok: false, error: 'already posted' });
      const b = JSON.parse(body); c.feedback = (c.feedback || []).concat([{ note: b.note, score: b.score, at: '2026-11-24T08:00:00Z' }]);
      c.rewrite = { note: b.note, previousDeck: c.deck }; c.status = 'queued'; return j(200, { ok: true, concept: c });
    }
    const dt = /^\/api\/concepts\/([^/]+)\/deck-text$/.exec(p);
    if (dt && m === 'PUT') {
      const c = st.concepts.find(x => x.id === decodeURIComponent(dt[1])); if (!c) return j(404, { ok: false, error: 'no such concept' });
      if (st.putMode === '422') return j(422, { ok: false, error: 'not postable', reasons: ['Slide 2 repeats slide 1.', 'The caption is a copy of the idea.'] });
      const b = JSON.parse(body);
      c.deck.slides.forEach((sl, i) => { sl.title = b.slides[i].title; sl.sub = b.slides[i].sub; }); c.deck.caption = b.caption;
      return j(200, { ok: true, concept: c });
    }
    if (p === '/api/album-stats') return j(200, { ok: true, stats: st.stats });
    if (p === '/api/album') return j(200, { ok: true, photos: ALBUM.map(a => ({ ...a, url: '/img-album/' + a.guid })) });
    if (p === '/api/series') return j(200, { ok: true, last: 6, next: 7, assigned: [] });
    if (p === '/api/reels') return j(200, { ok: true, reels: [] });
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
async function open(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href), r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(([b, t]) => {
    localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', t);
    window.__copied = []; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => { window.__copied.push(t); return Promise.resolve(); } }, configurable: true }); } catch (e) {}
  }, [W, TOKEN]);
  await page.goto(S);
  await page.waitForFunction(() => /Ready to post/.test(document.getElementById('ready-heading').textContent) && !document.getElementById('ready-heading').hidden, null, { timeout: 15000 });
  return { page, errors, ctx };
}
const reviewReady = page => page.waitForFunction(() => !document.getElementById('approve-btn').disabled && !document.getElementById('screen-review').hidden, null, { timeout: 15000 });
const writes = () => calls.filter(c => c.method !== 'GET');
const minsAgo = n => new Date(Date.now() - n * 60000).toISOString();
const STATS = { photos: 73, usable: 61, unusable: [{ guid: 'u1', reasons: ['resolution'] }, { guid: 'u2', reasons: ['sharpness'] }, { guid: 'u3', reasons: ['exposure'] }, { guid: 'u4', reasons: ['not measured'] }, { guid: 'u5', reasons: ['resolution', 'sharpness'] }], videos: 16 };

await check('Rewrite: the box posts {note, score} to /rewrite (score is the chip, or null with none); a blank note posts nothing; after Send the list shows "Rewriting, usually a few minutes" and the draft is gone from Ready', async () => {
  const { page, errors, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  assert.equal(await page.locator('#rewrite-box').isVisible(), false);
  await page.click('#rewrite-btn');
  assert.equal(await page.textContent('label[for=rewrite-note]'), 'What should change?');
  await page.click('#rewrite-send');
  assert.equal(writes().length, 0, 'a blank note must post nothing');
  await page.fill('#rewrite-note', 'Make slide 3 shorter.');
  await page.click('#rewrite-scores button[data-score="7"]');
  await page.click('#rewrite-send');
  await page.waitForFunction(() => document.querySelectorAll('.rewriting-item').length === 1);
  const w = writes(); assert.equal(w.length, 1); assert.equal(w[0].method, 'POST'); assert.equal(w[0].path, '/api/concepts/c-inbox/rewrite');
  assert.deepEqual(JSON.parse(w[0].body), { note: 'Make slide 3 shorter.', score: 7 });
  assert.equal(await page.locator('.rewriting-line').textContent(), 'Rewriting, usually a few minutes');
  assert.equal(await page.locator('.ready-item').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
  // no chip chosen -> score null
  st = defaults(); calls.length = 0;
  const o = await open(390, 844);
  await o.page.click('.ready-item'); await reviewReady(o.page); await o.page.click('#rewrite-btn');
  await o.page.fill('#rewrite-note', 'Not me.'); await o.page.click('#rewrite-send');
  await o.page.waitForFunction(() => document.querySelectorAll('.rewriting-item').length === 1);
  assert.deepEqual(JSON.parse(writes()[0].body), { note: 'Not me.', score: null });
  await o.ctx.close();
});

await check('Rewrite refused (409): the plain message shows in the box and the draft stays', async () => {
  const { page, ctx } = await open(390, 844); st.rewriteMode = 'posted';
  await page.click('.ready-item'); await reviewReady(page); await page.click('#rewrite-btn');
  await page.fill('#rewrite-note', 'x'); await page.click('#rewrite-send');
  await page.waitForFunction(() => /Could not send that: already posted/.test(document.getElementById('rewrite-msg').textContent));
  assert.equal(await page.locator('#screen-review').isVisible(), true);
  await ctx.close();
});

await check('Rewritten draft: "Editor 8/10" small line, previous version collapsed until tapped; a queued concept carrying rewrite shows as Rewriting, not in "more being written"', async () => {
  st.concepts = [concept('c-new', INBOX, { extra: { editorScore: 8, previousDeck: mkDeck(fixtureDeck('old')) } }),
    { id: 'c-rw', concept: 'Fixture concept c-rw', lane: 'wide', kind: 'idea', status: 'queued', deck: mkDeck(fixtureDeck('mid')), rewrite: { note: 'shorter', previousDeck: mkDeck(fixtureDeck('mid')) } },
    { id: 'c-q', concept: 'Fixture concept c-q', lane: 'wide', kind: 'idea', status: 'queued' }];
  const { page, ctx } = await open(390, 844);
  assert.equal(await page.locator('.rewriting-item').count(), 1);
  assert.equal(await page.textContent('#ready-waiting'), '1 more being written');
  await page.click('.ready-item'); await reviewReady(page);
  assert.equal((await page.textContent('#editor-line')).trim(), 'Editor 8/10');
  assert.equal(await page.locator('#prev-version').isVisible(), true);
  assert.equal(await page.evaluate(() => document.getElementById('prev-version').open), false);
  assert.equal(await page.locator('#prev-words').isVisible(), false);
  await page.click('#prev-version summary');
  assert.match(await page.textContent('#prev-words'), /Fixture old line 1/);
  await ctx.close();
});

await check('Counts line: "Photos: 61 usable of 73 · Videos: 16 · checked 5 minutes ago"; videos null drops the videos part; no stats hides the line; tapping lists the unusable thumbnails with plain reasons and the never-deletes line', async () => {
  st.stats = { ...STATS, at: minsAgo(5) };
  const { page, ctx } = await open(390, 844);
  await page.waitForFunction(() => !document.getElementById('album-counts').hidden);
  assert.equal((await page.textContent('#album-counts')).trim(), 'Photos: 61 usable of 73 · Videos: 16 · checked 5 minutes ago');
  assert.equal(await page.locator('#unusable-panel').isVisible(), false);
  await page.click('#album-counts');
  const caps = await page.locator('#unusable-grid figcaption').allTextContents();
  assert.deepEqual(caps, ['too small', 'blurry', 'too dark or bright', 'not measured', 'too small, blurry']);
  const srcs = await page.locator('#unusable-grid img').evaluateAll(a => a.map(i => i.getAttribute('src')));
  assert.equal(srcs.length, 5); assert.ok(srcs.every(s => /\/img-album\/u\d\?size=thumb$/.test(s)), srcs.join());
  assert.equal((await page.textContent('#unusable-note')).trim(), "Delete these in Photos if you don't need them. Orb never deletes from your album.");
  assert.ok(await page.evaluate(() => { const r = document.getElementById('top-bar').getBoundingClientRect(); return r.top === 0; }));
  await ctx.close();
  st.stats = { ...STATS, videos: null, at: minsAgo(120) };
  const o = await open(390, 844);
  await o.page.waitForFunction(() => !document.getElementById('album-counts').hidden);
  assert.equal((await o.page.textContent('#album-counts')).trim(), 'Photos: 61 usable of 73 · checked 2 hours ago');
  await o.ctx.close();
  st.stats = null;
  const n = await open(390, 844);
  assert.equal(await n.page.locator('#album-counts').isVisible(), false);
  await n.ctx.close();
});

await check('Sticky bar and Top: with 12 drafts the bar stays at the top while scrolled and Top scrolls to 0', async () => {
  st.concepts = Array.from({ length: 12 }, (_, i) => concept('c-' + i, fixtureDeck('n' + i), { createdAt: `2026-11-24T07:${String(10 + i)}:00Z` }));
  const { page, ctx } = await open(390, 844);
  await page.evaluate(() => window.scrollTo(0, 900));
  assert.ok(await page.evaluate(() => scrollY) > 400);
  assert.equal(await page.evaluate(() => Math.round(document.getElementById('top-bar').getBoundingClientRect().top)), 0);
  await page.click('#top-btn');
  await page.waitForFunction(() => scrollY === 0);
  await ctx.close();
});

await check('Paste text: saves through PUT deck-text with {slides:[{title,sub}], caption}, shows the new words, and survives a reload', async () => {
  const { page, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  assert.equal(await page.locator('#draft-copy').isVisible(), true);
  assert.equal(await page.locator('#draft-paste').isVisible(), true);
  await page.click('#draft-copy');
  const copied = await page.evaluate(() => window.__copied[0]);
  assert.match(copied, /=== SLIDE 1 ===\nTITLE: 30,000 emails in my inbox/); assert.match(copied, /=== CAPTION ===\nOne inbox sorted\.\.\. 3 more to go\./);
  const edited = copied.replace('Nightmare.', 'Nightmare, honestly.').replace('3 more to go', '2 more to go');
  await page.click('#draft-paste');
  await page.fill('#paste-area', edited); await page.click('#paste-apply');
  await page.waitForFunction(() => /Saved/.test(document.getElementById('msg').textContent));
  const w = writes(); assert.equal(w.length, 1); assert.equal(w[0].method, 'PUT'); assert.equal(w[0].path, '/api/concepts/c-inbox/deck-text');
  const b = JSON.parse(w[0].body);
  assert.deepEqual(b, { slides: [{ title: '30,000 emails in my inbox 😞 Nightmare, honestly.', sub: '' }, { title: INBOX.slides[1].title, sub: '' }, { title: INBOX.slides[2].title, sub: '' }], caption: 'One inbox sorted... 2 more to go. Is this tool something you need?' });
  assert.match(await page.textContent('#words-list'), /Nightmare, honestly\./);
  assert.match(await page.textContent('#words-caption'), /2 more to go/);
  assert.equal(await page.locator('#paste-overlay').isVisible(), false);
  await page.reload();
  await page.waitForSelector('.ready-item'); await page.click('.ready-item'); await reviewReady(page);
  assert.match(await page.textContent('#words-list'), /Nightmare, honestly\./);
  assert.match(await page.textContent('#words-caption'), /2 more to go/);
  await ctx.close();
});

await check('Paste text refused (422): the reasons show in plain words, the box stays open, nothing is saved, and a reload still shows the old words', async () => {
  st.putMode = '422';
  const { page, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  await page.click('#draft-copy'); const copied = await page.evaluate(() => window.__copied[0]);
  await page.click('#draft-paste'); await page.fill('#paste-area', copied.replace('Nightmare.', 'Nightmare, she said.')); await page.click('#paste-apply');
  await page.waitForFunction(() => /not postable yet/.test(document.getElementById('paste-msg').textContent));
  assert.deepEqual(await page.locator('#paste-msg li').allTextContents(), ['Slide 2 repeats slide 1.', 'The caption is a copy of the idea.']);
  assert.equal(await page.locator('#paste-overlay').isVisible(), true);
  assert.doesNotMatch(await page.textContent('#words-list'), /she said/);
  assert.equal(st.concepts[0].deck.slides[0].title, INBOX.slides[0].title, 'nothing saved');
  await page.reload(); await page.waitForSelector('.ready-item'); await page.click('.ready-item'); await reviewReady(page);
  assert.doesNotMatch(await page.textContent('#words-list'), /she said/);
  await ctx.close();
});

await check('Paste text with the wrong number of slides says so and calls nothing', async () => {
  const { page, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  await page.click('#draft-paste'); await page.fill('#paste-area', '=== SLIDE 1 ===\nTITLE: Only one\n'); await page.click('#paste-apply');
  await page.waitForFunction(() => /1 slides and the post has 3/.test(document.getElementById('paste-msg').textContent));
  assert.equal(writes().length, 0);
  await ctx.close();
});

await check('Copy-first order at 390: the numbered words and the caption come first, then the three buttons, then the slides; the slides are one horizontal swipe row', async () => {
  const { page, ctx } = await open(390, 844);
  await page.click('.ready-item'); await reviewReady(page);
  const y = await page.evaluate(() => { const t = id => document.getElementById(id).getBoundingClientRect().top; return { words: t('words-list'), cap: t('words-caption'), btn: t('rewrite-btn'), strip: t('review-strip') }; });
  assert.ok(y.words < y.cap && y.cap < y.btn && y.btn < y.strip, JSON.stringify(y));
  assert.deepEqual(await page.locator('#words-list li').allTextContents(), INBOX.slides.map(s => s.title));
  assert.equal(await page.textContent('#words-caption'), INBOX.caption);
  const g = await page.evaluate(() => { const s = document.getElementById('review-strip'), cs = [...s.querySelectorAll('canvas')].map(c => c.getBoundingClientRect()); return { tops: [...new Set(cs.map(r => Math.round(r.top)))], overflow: s.scrollWidth > s.clientWidth, w: Math.round(cs[0].width), page: document.documentElement.scrollWidth - innerWidth }; });
  assert.equal(g.tops.length, 1, 'one row'); assert.ok(g.overflow, 'swipes sideways'); assert.ok(g.w < 300, 'small slides, width ' + g.w); assert.ok(g.page <= 0, 'no page overflow');
  await ctx.close();
});

for (const [w, cols] of [[390, 1], [768, 2], [1024, 3], [1280, 3]]) {
  await check(`Grid at ${w}px: the slides sit ${cols === 1 ? 'in one swipe row' : cols + ' across'}`, async () => {
    st.concepts = [concept('c-six', { slides: [0, 1, 2, 3, 4, 5].map(i => ({ title: 'Fixture t' + i, sub: 's', photo: 'gc' + (i % 3) })), caption: 'Fixture caption.' })];
    const { page, ctx } = await open(w, 900);
    await page.click('.ready-item'); await reviewReady(page);
    const lefts = await page.evaluate(() => { const cs = [...document.querySelectorAll('#review-strip canvas')].map(c => c.getBoundingClientRect()), top0 = Math.round(cs[0].top); return cs.filter(r => Math.round(r.top) === top0).map(r => Math.round(r.left)); });
    if (cols === 1) assert.equal(lefts.length, 6, 'all six on the one row'); else { assert.equal(lefts.length, cols, 'first row has ' + lefts.length); assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('review-strip')).gridTemplateColumns.split(' ').length), cols); }
    await ctx.close();
  });
}

await check('Scroll restore: with 12 drafts, scroll to the 10th, open it, go back (Back button, then browser back, then More and Close): the list is at the same place, within 50px', async () => {
  st.concepts = Array.from({ length: 12 }, (_, i) => concept('c-' + i, fixtureDeck('n' + i), { createdAt: `2026-11-24T07:${String(10 + i)}:00Z` }));
  const { page, ctx } = await open(390, 700);
  const tenth = page.locator('.ready-item').nth(9);
  await tenth.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 120));
  const before = await page.evaluate(() => scrollY); assert.ok(before > 400, 'scrolled down ' + before);
  await tenth.click(); await reviewReady(page);
  assert.ok(await page.evaluate(() => scrollY) < 50, 'draft opens at its top');
  await page.click('#review-back');
  await page.waitForFunction(() => !document.getElementById('screen-ready').hidden);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) <= 50, 'back: ' + await page.evaluate(() => scrollY) + ' vs ' + before);
  await tenth.click(); await reviewReady(page);
  await page.goBack();
  await page.waitForFunction(() => !document.getElementById('screen-ready').hidden);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) <= 50, 'browser back: ' + await page.evaluate(() => scrollY) + ' vs ' + before);
  await page.click('#more-btn'); await page.click('#more-close');
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - before) <= 50, 'More and Close');
  await ctx.close();
});

await check('No console errors and the token is never in the page text or console on the draft screen', async () => {
  const { page, errors, ctx } = await open(1280, 900);
  await page.click('.ready-item'); await reviewReady(page);
  assert.deepEqual(errors, []);
  assert.ok(!(await page.content()).includes(TOKEN));
  await ctx.close();
});

if (process.env.SHOT_DIR) {
  st = defaults(); calls.length = 0;
  st.stats = { ...STATS, at: minsAgo(5) };
  fs.mkdirSync(process.env.SHOT_DIR, { recursive: true });
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const { page, ctx } = await open(w, h);
    await page.waitForFunction(() => !document.getElementById('album-counts').hidden);
    if (w === 390) { await page.click('#album-counts'); await page.waitForFunction(() => [...document.querySelectorAll('#unusable-grid img')].every(i => i.complete)); await page.screenshot({ path: path.join(process.env.SHOT_DIR, 'soc34-list-390.png') }); }
    await page.click('.ready-item'); await reviewReady(page);
    await page.screenshot({ path: path.join(process.env.SHOT_DIR, `soc34-review-${w}.png`), fullPage: true });
    await ctx.close();
  }
}

await browser.close(); worker.close(); site.close();
let bad = 0;
for (const [r, n] of results) { console.log(r + ' ' + n); if (r === 'FAIL') bad++; }
console.log(`${results.length - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
