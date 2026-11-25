// Founder ruling 2026-11-25 [override on approval]: "Approve anyway" under any approval block. Playwright against a local static server + a stubbed Worker.
// Playwright against a local static server + a stubbed Worker (fixture data, a fake token; the live Worker is never called).
// Run: node tests/approve-anyway.spec.mjs   (same env as tests/carousel-insta.spec.mjs: PLAYWRIGHT_DIR, CHROMIUM_PATH)
// PAGE_FILE=<path> runs the same checks against another copy of index.html (used to show each must-fail check failing on the pre-change page).
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
const TOKEN = 'test-token-not-real-0005'; // fake, test only

function crc32(buf) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function gradientPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = 160; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = gradientPng(2160, 2880);


const SMALL = gradientPng(600, 800); // a photo too small for a sharp slide: lowRes
const ALBUM = [{ guid: 'gc0', width: 2160, height: 2880, caption: '', face: { x: 0.35, y: 0.15, w: 0.3, h: 0.22 } }, { guid: 'gsmall', width: 600, height: 800, caption: '', face: null }];
const mkDeck = photo => ({ slides: [0, 1, 2].map(i => ({ kicker: '', num: '', swipe: i === 0 ? 'Swipe' : '', title: 'Fixture line ' + (i + 1), sub: 'Fixture second line ' + (i + 1) + '.', photo })), caption: 'Fixture caption.', claims: [], evidence: 'Fixture evidence' });
const concept = (id, photo) => ({ id, concept: 'Fixture concept ' + id, lane: 'wide', kind: 'idea', status: 'drafted', createdAt: '2026-11-25T07:00:00Z', deck: mkDeck(photo) });
let st; const calls = [];
const defaults = () => ({ concepts: [concept('c-ok', 'gc0')], approve422: false });
st = defaults();
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
const worker = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (/^\/img-album\//.test(u.pathname)) { res.writeHead(200, { ...cors, 'content-type': 'image/png' }); return res.end(/gsmall/.test(u.pathname) ? SMALL : PNG); }
  let body = ''; req.on('data', d => body += d);
  req.on('end', () => {
    calls.push({ method: req.method, path: u.pathname + u.search, body });
    const j = (s, o) => { res.writeHead(s, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return j(401, { ok: false, error: 'access token required' });
    const p = u.pathname, m = req.method;
    if (p === '/api/concepts' && m === 'GET') { const s = u.searchParams.get('status'); return j(200, { ok: true, concepts: st.concepts.filter(c => c.status === s).map(c => ({ ...c, postState: 'none' })) }); }
    if (p === '/api/publish' && m === 'PUT') { const d = JSON.parse(body).drafts[0]; st.lastDraft = d; return j(200, { ok: true }); }
    if (/^\/api\/drafts\/([^/]+)\/approve$/.test(p) && m === 'POST') {
      const b = JSON.parse(body || '{}');
      if (st.approve422 && b.override !== true) return j(422, { ok: false, error: 'copy gate failed', reasons: st.approve422 });
      const c = st.concepts.find(x => x.id === (st.lastDraft && st.lastDraft.conceptId)); if (c) c.status = 'approved';
      return j(200, { ok: true });
    }
    if (p === '/api/reels' && m === 'GET') return j(200, { ok: true, reels: [] });
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
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href), r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(([b, t]) => { localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', t); }, [W, TOKEN]);
  await page.goto(S);
  await page.waitForFunction(() => /Ready to post/.test(document.getElementById('ready-heading').textContent) && !document.getElementById('ready-heading').hidden, null, { timeout: 15000 });
  await page.click('.ready-item');
  await page.waitForFunction(() => !document.getElementById('screen-review').hidden && document.querySelectorAll('#review-strip canvas').length === 3 && document.getElementById('msg').textContent !== '' || (!document.getElementById('approve-btn').disabled && !document.getElementById('screen-review').hidden), null, { timeout: 15000 });
  return { page, errors, ctx };
}
const approvePosts = () => calls.filter(c => c.method === 'POST' && /\/approve$/.test(c.path));
const writes = () => calls.filter(c => c.method !== 'GET');

await check('A blocked check (photo too small) keeps the message, disables Approve and shows "Approve anyway"', async () => {
  st.concepts = [concept('c-small', 'gsmall')];
  const { page, errors, ctx } = await open();
  await page.waitForSelector('#approve-anyway', { timeout: 15000 });
  assert.equal(await page.isDisabled('#approve-btn'), true);
  assert.match(await page.textContent('#msg'), /Photo too small for a sharp slide on slide 1\. Pick another photo\./);
  assert.equal((await page.textContent('#approve-anyway')).trim(), 'Approve anyway');
  assert.equal(writes().length, 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check('Approve anyway asks once; Cancel sends nothing; OK runs publish + approve with override:true and the text shown', async () => {
  st.concepts = [concept('c-small', 'gsmall')];
  const { page, ctx } = await open();
  await page.waitForSelector('#approve-anyway');
  const dialogs = [];
  page.once('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  await page.click('#approve-anyway'); await page.waitForTimeout(300);
  assert.equal(writes().length, 0, 'cancel must send nothing');
  assert.match(dialogs[0], /^Approve with this flagged\? Photo too small/);
  page.once('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.click('#approve-anyway');
  await page.waitForFunction(() => document.querySelectorAll('.approved-item').length === 1, null, { timeout: 30000 });
  assert.equal(dialogs.length, 2, 'asked once per tap');
  const ap = approvePosts(); assert.equal(ap.length, 1);
  const b = JSON.parse(ap[0].body);
  assert.equal(b.override, true); assert.equal(b.caption, 'Fixture caption.');
  assert.deepEqual(b.overrideReasons, ['Photo too small for a sharp slide on slide 1. Pick another photo.']);
  await ctx.close();
});

await check('FALSE ALARM: an unblocked draft shows no "Approve anyway", and plain Approve sends no override fields', async () => {
  const { page, ctx } = await open();
  await page.waitForFunction(() => !document.getElementById('approve-btn').disabled);
  assert.equal(await page.locator('#approve-anyway').count(), 0);
  await page.click('#approve-btn');
  await page.waitForFunction(() => document.querySelectorAll('.approved-item').length === 1, null, { timeout: 30000 });
  const b = JSON.parse(approvePosts()[0].body);
  assert.deepEqual(Object.keys(b), ['caption']);
  assert.equal(await page.locator('#approve-anyway').count(), 0);
  await ctx.close();
});

await check('Server 422 with reasons: reasons shown as today, plus "Approve anyway", which re-posts the same caption with override and those reasons', async () => {
  st.approve422 = ['Caption has an em dash.', 'A number is not in the evidence.'];
  const { page, ctx } = await open();
  await page.waitForFunction(() => !document.getElementById('approve-btn').disabled);
  await page.click('#approve-btn');
  await page.waitForSelector('#approve-anyway', { timeout: 30000 });
  assert.match(await page.textContent('#msg'), /Not approved yet\. Fix this and tap approve again:/);
  assert.match(await page.textContent('#msg'), /Caption has an em dash\./);
  page.once('dialog', d => d.accept());
  await page.click('#approve-anyway');
  await page.waitForFunction(() => document.querySelectorAll('.approved-item').length === 1, null, { timeout: 30000 });
  const ap = approvePosts(); assert.equal(ap.length, 2);
  assert.equal(JSON.parse(ap[0].body).override, undefined);
  const b = JSON.parse(ap[1].body);
  assert.equal(b.override, true); assert.equal(b.caption, 'Fixture caption.'); assert.deepEqual(b.overrideReasons, st.approve422);
  assert.equal(calls.filter(c => c.path === '/api/publish').length, 1, 'the draft is not published twice');
  await ctx.close();
});

await browser.close(); worker.close(); site.close();
for (const [s, n] of results) console.log(s + '  ' + n);
const bad = results.filter(r => r[0] === 'FAIL');
console.log(bad.length ? bad.length + ' failed' : 'all ' + results.length + ' passed');
process.exit(bad.length ? 1 : 0);
