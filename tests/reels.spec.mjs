// SOC-18.5 + 18.5a acceptance (Insta Creator, Reels screen): Playwright against a local static server + a stubbed Worker.
// Run: node tests/reels.spec.mjs   (set PLAYWRIGHT_DIR and CHROMIUM_PATH as for tests/carousel-insta.spec.mjs)
// PAGE_FILE=<path> runs the same tests against a broken copy of index.html (tests/reels-mutations.spec.mjs).
// SHOT_DIR=<dir> also writes the two screenshots for the founder (home choice, reels screen with Approve).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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
const TOKEN = 'test-token-not-real-0001'; // fake, test only
const VIDEO = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 13) & 255)); // stub bytes, not a real mp4

let st; const calls = [];
const reset = () => { st = { reels: [], videoStatus: 200, makeMode: 201, nextId: 1 }; calls.length = 0; };
const R = (o) => ({ id: 'r-20261120100000-000' + (st.nextId++), script: 'A script for the stub.', status: 'ready', createdAt: '2026-11-20T10:00:00Z', durationMs: 10400, ...o });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
const worker = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  let body = ''; req.on('data', d => body += d);
  req.on('end', () => {
    calls.push({ method: req.method, path: u.pathname + u.search, auth: req.headers.authorization || '', body });
    const j = (s, o) => { res.writeHead(s, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return j(401, { ok: false, error: 'access token required' });
    const p = u.pathname, m = req.method;
    if (p === '/api/concepts') return j(200, { ok: true, concepts: [] });
    if (p === '/api/series') return j(200, { ok: true, last: 6, next: 7, assigned: [] });
    if (p === '/api/album') return j(200, { ok: true, photos: [] });
    if (p === '/api/reels' && m === 'GET') return j(200, { ok: true, reels: st.reels });
    if (p === '/api/reels' && m === 'POST') {
      if (st.makeMode === 422) return j(422, { ok: false, error: 'copy gate failed', reasons: ['names the founder'] });
      if (st.makeMode === 500) return j(500, { ok: false, error: 'broken' });
      const r = R({ script: JSON.parse(body).script, status: 'queued', durationMs: undefined }); st.reels.unshift(r); return j(201, { ok: true, reel: r });
    }
    const a = /^\/api\/reels\/([^/]+)\/(retry|approve|saved|video)$/.exec(p);
    if (a) {
      const r = st.reels.find(x => x.id === a[1]); if (!r) return j(404, { ok: false });
      if (a[2] === 'video') { if (st.videoStatus !== 200) { res.writeHead(st.videoStatus, cors); return res.end(); } res.writeHead(200, { ...cors, 'content-type': 'video/mp4' }); return res.end(VIDEO); }
      if (a[2] === 'retry') { r.status = 'queued'; delete r.reasons; return j(200, { ok: true, reel: r }); }
      if (a[2] === 'approve') { if (r.status !== 'ready') return j(409, { ok: false }); r.status = 'approved'; return j(200, { ok: true, reel: r }); }
      if (a[2] === 'saved') { r.status = 'saved'; return j(200, { ok: true, reel: r }); }
    }
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
const check = async (name, fn) => { reset(); try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' :: ' + e.message.split('\n')[0] + (process.env.DBG ? e.stack : '')]); } };
const PH = { w: 390, h: 844 };
async function open(o = {}) {
  const ctx = await browser.newContext({ viewport: { width: PH.w, height: PH.h } });
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href), r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(([b, t, withSettings]) => {
    if (withSettings) { localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', t); }
    window.__shared = []; window.__shareMode = 'ok';
    navigator.canShare = () => true;
    navigator.share = async (d) => { if (window.__shareMode === 'abort') { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; } window.__shared.push(d.files.map(f => ({ name: f.name, type: f.type, size: f.size }))); };
  }, [W, TOKEN, o.connected !== false]);
  if (o.clock) await page.clock.install();
  await page.goto(S + (o.hash || ''));
  return { page, errors, ctx };
}
const settle = page => page.waitForTimeout(400);
const inView = (page, sel) => page.evaluate(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }, sel);
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const reelCalls = (m, re) => calls.filter(c => c.method === m && re.test(c.path));
const posts = () => calls.filter(c => c.method === 'POST');
const SHOT = process.env.SHOT_DIR;

await check('A-home: first screen at 390x844 shows Carousels and Reels as two equal buttons; each goes to its own screen; #reels and #series load directly', async () => {
  const { page, errors, ctx } = await open();
  await settle(page);
  assert.equal((await page.textContent('#carousels-btn')).trim(), 'Carousels');
  assert.equal((await page.textContent('#trial-btn')).trim(), 'Reels');
  const a = await page.locator('#carousels-btn').boundingBox(), b = await page.locator('#trial-btn').boundingBox();
  assert.ok(Math.abs(a.width - b.width) <= 1 && Math.abs(a.height - b.height) <= 1 && Math.abs(a.y - b.y) <= 1, 'equal size and row');
  assert.ok(await inView(page, '#carousels-btn') && await inView(page, '#trial-btn'), 'both in view without scrolling');
  if (SHOT) await page.screenshot({ path: path.join(SHOT, 'soc-18-5-home.png') });
  await page.click('#trial-btn');
  assert.ok(await page.locator('#screen-trial').isVisible()); assert.ok(!(await page.locator('#screen-ready').isVisible()));
  assert.equal(new URL(page.url()).hash, '#reels');
  await page.click('#trial-back');
  assert.ok(await page.locator('#screen-ready').isVisible());
  await page.click('#carousels-btn');
  assert.ok(await page.locator('#screen-ready').isVisible() && !(await page.locator('#screen-trial').isVisible()));
  assert.deepEqual(errors, []);
  await ctx.close();
  const d = await open({ hash: '#reels' }); await settle(d.page);
  assert.ok(await d.page.locator('#screen-trial').isVisible(), '#reels opens the Reels screen directly');
  assert.equal(await overflow(d.page) <= 0, true);
  await d.ctx.close();
  const s = await open({ hash: '#series' }); await settle(s.page);
  assert.ok(await s.page.locator('#screen-edit').isVisible(), '#series still opens the editor');
  await s.ctx.close();
});

await check('G1: opening Reels, #reel-script is "" and #reel-make is disabled; never filled by the page', async () => {
  const { page, ctx } = await open({ hash: '#reels' }); await settle(page);
  assert.equal(await page.inputValue('#reel-script'), '');
  assert.ok(await page.locator('#reel-make').isDisabled());
  await page.fill('#reel-script', '   '); assert.ok(await page.locator('#reel-make').isDisabled(), 'spaces only stay disabled');
  await page.fill('#reel-script', ''); await page.click('#trial-back'); await page.click('#trial-btn');
  assert.equal(await page.inputValue('#reel-script'), '', 'still empty after leaving and coming back');
  await page.fill('#reel-script', 'Kept text'); await page.click('#trial-back'); await page.click('#trial-btn');
  assert.equal(await page.inputValue('#reel-script'), 'Kept text', 'only her own text is ever in the box');
  await ctx.close();
});

await check('Make: one POST /api/reels with the typed script (outer spaces trimmed, inner kept byte for byte); box clears; row Waiting for your Mac; Make is not approval', async () => {
  const { page, ctx } = await open({ hash: '#reels' }); await settle(page);
  const typed = '  Meet Lizzie.\n\nShe  is a doctor.  ';
  await page.fill('#reel-script', typed);
  await page.click('#reel-make'); await page.waitForSelector('.reel-item');
  const mk = reelCalls('POST', /^\/api\/reels$/); assert.equal(mk.length, 1);
  assert.equal(JSON.parse(mk[0].body).script, typed.trim());
  assert.equal(await page.inputValue('#reel-script'), '');
  assert.match(await page.textContent('#reel-msg'), /On its way/);
  assert.match(await page.textContent('.reel-item .reel-status'), /^Waiting for your Mac$/);
  assert.equal(reelCalls('POST', /approve/).length, 0, 'making never approves');
  await ctx.close();
});

await check('422: the reasons show and the box keeps her text; a 500 shows the connection line and keeps it', async () => {
  const { page, ctx } = await open({ hash: '#reels' }); await settle(page);
  st.makeMode = 422;
  await page.fill('#reel-script', 'My text here'); await page.click('#reel-make');
  await page.waitForFunction(() => /needs a change/.test(document.getElementById('reel-msg').textContent));
  assert.match(await page.textContent('#reel-msg'), /names the founder/);
  assert.equal(await page.inputValue('#reel-script'), 'My text here');
  st.makeMode = 500; await page.click('#reel-make');
  await page.waitForFunction(() => /Could not send it/.test(document.getElementById('reel-msg').textContent));
  assert.equal(await page.inputValue('#reel-script'), 'My text here');
  await ctx.close();
});

await check('States: one reel of each status shows its line; first 60 characters; Try again sends one retry; Saved (1)', async () => {
  const long = 'x'.repeat(70);
  st.reels = [R({ status: 'queued', script: long }), R({ status: 'rendering' }), R({ status: 'ready' }), R({ status: 'approved' }), R({ status: 'failed', reasons: ['Not enough footage.'] }), R({ status: 'saved' })];
  const { page, ctx } = await open({ hash: '#reels' }); await page.waitForSelector('.reel-item');
  const lines = await page.locator('#reel-list .reel-status').allTextContents();
  for (const want of ['Waiting for your Mac', 'Being made', 'Ready, 10.4 seconds', 'Approved, 10.4 seconds', 'Could not make it: Not enough footage.']) assert.ok(lines.includes(want), want + ' in ' + JSON.stringify(lines));
  assert.equal(await page.textContent('#reel-saved-heading'), 'Saved (1)');
  assert.equal((await page.locator('#reel-saved-list .reel-status').textContent()), 'Saved');
  const titles = await page.locator('#reel-list .reel-title').allTextContents(); assert.ok(titles.includes('x'.repeat(60) + '...'), 'cut at 60 with an ellipsis');
  assert.equal(await page.locator('.reel-retry').count(), 1);
  await page.click('.reel-retry'); await page.waitForTimeout(300);
  assert.equal(reelCalls('POST', /\/retry$/).length, 1);
  await ctx.close();
});

await check('Polling: a queued reel is listed again after 30 s; with nothing waiting it is not', async () => {
  st.reels = [R({ status: 'queued' })];
  const a = await open({ hash: '#reels', clock: true }); await a.page.waitForSelector('.reel-item');
  const n0 = reelCalls('GET', /^\/api\/reels$/).length;
  await a.page.clock.runFor(31000); await a.page.waitForTimeout(500);
  assert.equal(reelCalls('GET', /^\/api\/reels$/).length, n0 + 1, 'one more list call after the timer');
  await a.ctx.close();
  reset(); st.reels = [R({ status: 'ready' })];
  const b = await open({ hash: '#reels', clock: true }); await b.page.waitForSelector('.reel-item');
  const m0 = reelCalls('GET', /^\/api\/reels$/).length;
  await b.page.clock.runFor(95000); await b.page.waitForTimeout(500);
  assert.equal(reelCalls('GET', /^\/api\/reels$/).length, m0, 'no list call when nothing waits');
  await b.ctx.close();
});

await check('A-approve: ready row has Approve and the reel screen has no Save; Approve sends exactly one POST /approve; then Save to phone appears', async () => {
  st.reels = [R({ status: 'ready' })]; const id = st.reels[0].id;
  const { page, ctx } = await open({ hash: '#reels' }); await page.waitForSelector('#reel-approve-' + id);
  if (SHOT) await page.screenshot({ path: path.join(SHOT, 'soc-18-5-reels.png') });
  // ready: open it, no Save
  await page.click('.reel-open'); await page.waitForFunction(() => /Ready, 10.4 seconds/.test(document.getElementById('nr-status').textContent));
  assert.equal(await page.locator('#nr-save:visible').count(), 0, 'Save to phone absent on a ready reel');
  await page.click('#reel-back');
  await page.click('#reel-approve-' + id); await page.waitForFunction(() => /Approved, 10.4 seconds/.test(document.querySelector('.reel-status').textContent));
  assert.equal(reelCalls('POST', new RegExp('^/api/reels/' + id + '/approve$')).length, 1);
  assert.equal(await page.locator('#reel-approve-' + id).count(), 0, 'no Approve once approved');
  await page.click('.reel-open'); await page.waitForFunction(() => !document.getElementById('nr-save').disabled);
  assert.equal(await page.locator('#nr-save:visible').count(), 1, 'Save to phone present on an approved reel');
  assert.equal(reelCalls('POST', /approve$/).length, 1);
  await ctx.close();
});

await check('Save, 390x844: Save inside the viewport with no scrolling, video above the bar; one share of drliz-reel-<id>.mp4 (video/mp4, stub size); then one POST saved; 693px fails the edge assert', async () => {
  st.reels = [R({ status: 'approved' })]; const id = st.reels[0].id;
  const { page, ctx } = await open({ hash: '#reels' }); await page.waitForSelector('.reel-open');
  await page.click('.reel-open'); await page.waitForFunction(() => !document.getElementById('nr-save').disabled);
  assert.ok(await inView(page, '#nr-save'), 'save inside the viewport');
  const edge = () => page.evaluate(() => document.getElementById('nr-video').getBoundingClientRect().bottom <= document.getElementById('nr-bar').getBoundingClientRect().top);
  assert.ok(await edge(), 'video bottom above the bar');
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.ok((await overflow(page)) <= 0);
  await page.click('#nr-save'); await page.waitForFunction(() => /Saved\. Now post it/.test(document.getElementById('nr-msg').textContent));
  assert.ok(await edge(), 'video bottom still above the bar once the Saved message has made the bar taller');
  assert.ok(await inView(page, '#nr-save'), 'save still inside the viewport with the message showing');
  const shared = await page.evaluate(() => window.__shared);
  assert.equal(shared.length, 1); assert.equal(shared[0].length, 1);
  assert.deepEqual(shared[0][0], { name: 'drliz-reel-' + id + '.mp4', type: 'video/mp4', size: VIDEO.length });
  assert.equal(reelCalls('POST', new RegExp('^/api/reels/' + id + '/saved$')).length, 1);
  assert.ok(calls.filter(c => /\/video$/.test(c.path)).every(c => c.auth === 'Bearer ' + TOKEN));
  // must-fail kept in the test: a 693px video overlaps the bar (message showing) and the edge assert goes false
  await page.addStyleTag({ content: '#nr-video { height: 693px !important; }' });
  assert.equal(await edge(), false, 'the 693px video must fail the edge assert');
  await ctx.close();
});

await check('Cancel: AbortError sends no saved call and shows Not saved.', async () => {
  st.reels = [R({ status: 'approved' })];
  const { page, ctx } = await open({ hash: '#reels' }); await page.waitForSelector('.reel-open');
  await page.click('.reel-open'); await page.waitForFunction(() => !document.getElementById('nr-save').disabled);
  await page.evaluate(() => { window.__shareMode = 'abort'; });
  await page.click('#nr-save'); await page.waitForFunction(() => /Not saved\./.test(document.getElementById('nr-msg').textContent));
  assert.equal(reelCalls('POST', /saved$/).length, 0);
  assert.equal(await page.evaluate(() => window.__shared.length), 0);
  await ctx.close();
});

await check('Gone: the video route answers 404; status says no longer kept and Save stays disabled; a videoGone saved row does not open', async () => {
  st.reels = [R({ status: 'approved' }), R({ status: 'saved', videoGone: true })]; st.videoStatus = 404;
  const { page, ctx } = await open({ hash: '#reels' }); await page.waitForSelector('.reel-open');
  assert.equal(await page.locator('#reel-saved-list .reel-status').textContent(), 'Saved, video no longer kept');
  assert.ok(await page.locator('#reel-saved-list .reel-open').isDisabled());
  await page.locator('#reel-list .reel-open').click();
  await page.waitForFunction(() => /no longer kept/.test(document.getElementById('nr-status').textContent));
  assert.ok(await page.locator('#nr-save').isDisabled());
  await ctx.close();
});

await check('Not connected: only the connection box on Reels and zero /api calls', async () => {
  const { page, ctx } = await open({ hash: '#reels', connected: false }); await settle(page);
  assert.ok(await page.locator('#screen-trial').isVisible());
  assert.ok(await page.locator('#conn-box').isVisible());
  assert.ok(!(await page.locator('#reel-script').isVisible()));
  assert.equal(calls.filter(c => c.path.startsWith('/api')).length, 0);
  await ctx.close();
});

await check('At 390 px neither new screen has horizontal overflow; source has no en or em dash and no "calm"; reel.js has none either', async () => {
  st.reels = [R({ status: 'ready', script: 'w'.repeat(200) }), R({ status: 'failed', reasons: ['y'.repeat(150)] })];
  const { page, ctx } = await open({ hash: '#reels' }); await page.waitForSelector('.reel-item');
  assert.ok((await overflow(page)) <= 0, 'reels screen');
  await page.locator('.reel-open').first().click(); await settle(page);
  assert.ok((await overflow(page)) <= 0, 'reel screen');
  await ctx.close();
  for (const f of [FILE, REEL]) { const src = fs.readFileSync(f, 'utf8'); assert.ok(!/[–—]/.test(src), 'dash in ' + f); assert.ok(!/calm/i.test(src), 'calm in ' + f); }
});

await check('reel.js save(): share gets one file, AbortError is cancelled, no canShare is a download', async () => {
  const { page, ctx } = await open({ hash: '#reels' });
  const out = await page.evaluate(async () => {
    const f = new File([new Uint8Array(3)], 'a.mp4', { type: 'video/mp4' });
    const seen = []; const r1 = await OneReel.save(f, { canShare: () => true, share: async d => { seen.push(d.files.length); } });
    const r2 = await OneReel.save(f, { canShare: () => true, share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } });
    let clicks = 0; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { clicks += this.download === 'a.mp4' ? 1 : 0; };
    const r3 = await OneReel.save(f, {}); HTMLAnchorElement.prototype.click = orig;
    return { r1, r2, r3, seen, clicks };
  });
  assert.deepEqual(out, { r1: 'shared', r2: 'cancelled', r3: 'downloaded', seen: [1], clicks: 1 });
  await ctx.close();
});

await browser.close(); worker.close(); site.close();
for (const [s, n] of results) console.log(s, n);
const failed = results.filter(r => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
