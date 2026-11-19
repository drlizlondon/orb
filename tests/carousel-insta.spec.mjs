// SOC-10.3 acceptance: Playwright against a local static server + a stubbed Worker.
// Run: node tests/carousel-insta.spec.mjs   (Playwright is not an Orb dependency; set PLAYWRIGHT_DIR to a node_modules that has it)
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
const FILE = path.join(root, 'dist/carousel-insta/index.html');
const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR || '/Users/lizzie/colourpuzzle/node_modules';
const { chromium } = require(path.join(pwDir, 'playwright'));
const TOKEN = 'test-token-not-real-0001'; // fake, test only

// ---- a real coloured PNG (gradient) so "not flat" is meaningful ----
function crc32(buf) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function gradientPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = 160; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = gradientPng(240, 300);

// ---- stub Worker (cross-origin to the static server, like production) ----
const calls = [];
let approveMode = 'ok';
let listMode = 'plain';
const QBN = { id: 'c-qbn', concept: 'Build notes: queued topic\nsecond line', lane: 'wide', status: 'queued' };
const SLIDES = [
  ['', '', 'I stopped doing this one thing', 'Here is what changed for me.', 'Swipe'],
  ['Why I can say this', '', 'I tried it myself', 'It saved me real time.', ''],
  ['The story', '', 'It started on a busy shift', 'I needed a faster way to plan.', ''],
  ['Idea', '1', 'Start with one question', 'Ask it one clear thing.', ''],
  ['Idea', '2', 'Give it your context', 'Tell it who you are writing for.', ''],
  ['Idea', '3', 'Edit in your voice', 'Make it sound like you.', ''],
  ['Real talk', '', 'It is not magic', 'You still do the thinking.', ''],
  ['One thing', '', 'Comment IDEAS', 'And I will send you the list.', '']
].map(([kicker, num, title, sub, swipe]) => ({ kicker, num, title, sub, swipe }));
const DRAFTED = { id: 'c-20261119-070000-ab12', concept: 'Use AI to plan the week', lane: 'ambitious-women', status: 'drafted', deck: { slides: SLIDES, caption: 'A short caption in my words.', claims: [], evidence: 'Use AI to plan the week' } };
const BN = { id: 'c-bn', concept: 'Build notes: what shipped today', lane: 'wide', status: 'drafted', deck: { slides: SLIDES, caption: 'Series caption.', claims: [], evidence: 'Build notes: what shipped today' } };
const DRAFTED_PH = { ...DRAFTED, deck: { ...DRAFTED.deck, slides: SLIDES.map((x, i) => ({ ...x, photo: i % 2 ? 'g1' : 'g2-test_guid' })) } };
const FAILED = { id: 'c-20261119-070001-cd34', concept: 'A concept that failed', lane: 'wide', status: 'failed', reasons: ['invented figure: 90%'] };
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
const worker = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (u.pathname === '/img-album/g1') { res.writeHead(200, { ...cors, 'content-type': 'image/png' }); return res.end(PNG); }
  if (u.pathname === '/nocors.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(PNG); } // no ACAO on purpose
  let body = ''; req.on('data', d => body += d);
  req.on('end', () => {
    calls.push({ method: req.method, path: u.pathname + u.search, auth: req.headers.authorization || '', body });
    const j = (s, o) => { res.writeHead(s, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer ' + TOKEN) return j(401, { ok: false, error: 'access token required' });
    if (u.pathname === '/api/concepts' && req.method === 'POST') return j(201, { ok: true, concept: { id: 'c-x', status: 'queued' } });
    if (u.pathname === '/api/concepts' && req.method === 'GET') { const st = u.searchParams.get('status'); if (listMode === 'photos') return j(200, { ok: true, concepts: st === 'drafted' ? [DRAFTED_PH] : [] }); if (listMode === 'series') return j(200, { ok: true, concepts: st === 'drafted' ? [BN, DRAFTED] : st === 'failed' ? [FAILED] : st === 'queued' ? [QBN] : [] }); return j(200, { ok: true, concepts: st === 'drafted' ? [DRAFTED] : st === 'failed' ? [FAILED] : [] }); }
    if (u.pathname === '/api/run-now' && req.method === 'POST') return j(202, { ok: true, requestedAt: '2026-11-19T10:00:00Z' });
    if (u.pathname === '/api/album') return j(200, { ok: true, photos: [{ guid: 'g1', width: 240, height: 300, caption: 'a photo', url: '/img-album/g1' }] });
    if (u.pathname === '/api/publish' && req.method === 'PUT') return j(200, { ok: true, added: [JSON.parse(body).drafts[0].id], kept: [] });
    if (/^\/api\/drafts\/[^/]+\/approve$/.test(u.pathname)) return approveMode === 'ok' ? j(200, { ok: true }) : j(422, { ok: false, error: 'copy gate failed', reasons: ['number 90 is not in your evidence'] });
    j(404, { ok: false, error: 'not found' });
  });
});
const site = http.createServer((req, res) => {
  const f = req.url.startsWith('/vendor/') ? path.join(root, 'dist/carousel-insta', req.url.split('?')[0]) : FILE;
  res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(fs.readFileSync(f));
});
await new Promise(r => worker.listen(0, '127.0.0.1', r));
await new Promise(r => site.listen(0, '127.0.0.1', r));
const W = `http://127.0.0.1:${worker.address().port}`;
const S = `http://127.0.0.1:${site.address().port}/`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' :: ' + e.message.split('\n')[0]]); } };
async function open(viewport, withSettings = true) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  if (withSettings) await page.addInitScript(([b, t]) => { localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', t); }, [W, TOKEN]);
  await page.goto(S);
  return { page, errors, ctx };
}

await check('AC-10.3.1 concept saved message; drafted concept fills 8 slides + caption, no [brackets]', async () => {
  calls.length = 0;
  const { page, ctx } = await open({ width: 1200, height: 900 });
  await page.fill('#concept-text', 'Use AI to plan the week');
  await page.click('#concept-send');
  await page.waitForFunction(() => document.getElementById('msg').textContent.includes('Saved.'));
  assert.equal(await page.textContent('#msg'), 'Saved. Your carousel will be ready after the next run (7am, 1pm or 7pm).');
  const post = calls.find(c => c.method === 'POST' && c.path === '/api/concepts');
  assert.ok(post, 'POST /api/concepts issued'); assert.equal(JSON.parse(post.body).lane, 'ambitious-women');
  await page.click('#drafts-refresh');
  await page.waitForSelector('#drafts-list .draft-item button');
  assert.match(await page.textContent('#drafts-list'), /invented figure: 90%/); // failed reasons shown
  await page.click('#drafts-list .draft-item button');
  assert.equal(await page.locator('.ig-card').count(), 8);
  const all = await page.locator('.ig-card').allInnerTexts();
  for (const t of all) { assert.ok(t.trim().length > 0); assert.ok(!/[\[\]]/.test(t), 'bracket placeholder: ' + t); }
  assert.equal(await page.inputValue('#caption'), 'A short caption in my words.');
  await ctx.close();
});

await check('AC-10.3.2/3 album photo via crossorigin img exports; PNG is 1080x1350 and not flat', async () => {
  const { page, ctx } = await open({ width: 1200, height: 900 });
  await page.click('#drafts-refresh'); await page.waitForSelector('#drafts-list .draft-item button'); await page.click('#drafts-list .draft-item button');
  await page.click('#album-load'); await page.waitForSelector('#album-grid button'); await page.click('#album-grid button');
  await page.click('#album-all');
  assert.equal(await page.locator('.ig-card img.ig-bg[crossorigin="anonymous"]').count(), 8);
  await page.waitForFunction(() => [...document.querySelectorAll('.ig-bg')].every(i => i.complete && i.naturalWidth > 0));
  const r = await page.evaluate(async () => {
    const url = await window.renderCardPng(0);
    const im = new Image(); await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = url; });
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const seen = new Set(); for (let i = 0; i < 400; i++) { const d = x.getImageData((i * 37) % c.width, (i * 91) % c.height, 1, 1).data; seen.add(d.join(',')); }
    return { w: im.naturalWidth, h: im.naturalHeight, colours: seen.size };
  });
  console.log('   PNG', r);
  assert.equal(r.w, 1080); assert.equal(r.h, 1350); assert.ok(r.colours > 20, 'flat image: ' + r.colours + ' colours');
  await ctx.close();
});

await check('AC-10.3.2 must-fail: non-CORS image makes export throw (proxy path is required)', async () => {
  const { page, ctx } = await open({ width: 1200, height: 900 });
  await page.click('#drafts-refresh'); await page.waitForSelector('#drafts-list .draft-item button'); await page.click('#drafts-list .draft-item button');
  const raw = await page.evaluate(async (u) => { // the browser fact the whole design rests on
    const im = new Image(); await new Promise((ok, no) => { im.onload = ok; im.onerror = no; im.src = u; });
    const c = document.createElement('canvas'); c.width = 10; c.height = 10; c.getContext('2d').drawImage(im, 0, 0);
    try { c.toDataURL(); return 'no throw'; } catch (e) { return e.name; }
  }, W + '/nocors.png');
  assert.equal(raw, 'SecurityError');
  await page.evaluate((u) => { cards[0].photo = u; render(); }, W + '/nocors.png');
  const threw = await page.evaluate(async () => { try { await window.renderCardPng(0); return false; } catch (e) { return true; } });
  assert.equal(threw, true, 'export must throw for a non-CORS photo');
  await ctx.close();
});

await check('AC-10.3.4/5 exactly one PUT then one POST approve; Bearer comes from localStorage; 8 PNG images', async () => {
  calls.length = 0; approveMode = 'ok';
  const { page, errors, ctx } = await open({ width: 1200, height: 900 });
  await page.click('#drafts-refresh'); await page.waitForSelector('#drafts-list .draft-item button'); await page.click('#drafts-list .draft-item button');
  calls.length = 0;
  await page.click('#approve-btn');
  await page.waitForFunction(() => /Buffer queue/.test(document.getElementById('msg').textContent), null, { timeout: 60000 });
  assert.equal(await page.textContent('#msg'), 'In your Buffer queue once your Mac syncs');
  const w = calls.filter(c => c.method !== 'GET');
  assert.equal(w.length, 2); assert.equal(w[0].method, 'PUT'); assert.equal(w[0].path, '/api/publish'); assert.equal(w[1].method, 'POST'); assert.match(w[1].path, /^\/api\/drafts\/drliz-\d{8}-\d{6}\/approve$/);
  assert.ok(calls.every(c => c.auth === 'Bearer ' + TOKEN));
  const body = JSON.parse(w[0].body); const id = body.drafts[0].id;
  assert.match(id, /^drliz-\d{8}-\d{6}$/); assert.equal(body.drafts[0].slides.length, 8); assert.equal(body.drafts[0].evidence, 'Use AI to plan the week');
  const imgs = Object.values(body.images[id]); assert.equal(imgs.length, 8);
  for (const b of imgs) { const buf = Buffer.from(b, 'base64'); assert.equal(buf.readUInt32BE(16), 1080); assert.equal(buf.readUInt32BE(20), 1350); }
  assert.ok(w[1].path.includes(id));
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check('AC-10.3.4 422 copy gate reason shown, fixable without a second PUT', async () => {
  calls.length = 0; approveMode = 'fail';
  const { page, ctx } = await open({ width: 1200, height: 900 });
  await page.click('#drafts-refresh'); await page.waitForSelector('#drafts-list .draft-item button'); await page.click('#drafts-list .draft-item button');
  await page.click('#approve-btn');
  await page.waitForFunction(() => /not in your evidence/.test(document.getElementById('msg').textContent), null, { timeout: 60000 });
  approveMode = 'ok';
  await page.fill('#caption', 'Fixed caption'); await page.click('#approve-btn');
  await page.waitForFunction(() => /Buffer queue/.test(document.getElementById('msg').textContent));
  assert.equal(calls.filter(c => c.method === 'PUT').length, 1);
  assert.equal(calls.filter(c => c.method === 'POST' && /approve/.test(c.path)).length, 2);
  await ctx.close();
});

await check('AC-10.3.5 no token in localStorage means no request is sent', async () => {
  calls.length = 0;
  const { page, ctx } = await open({ width: 1200, height: 900 }, false);
  await page.fill('#concept-text', 'x'); await page.click('#concept-send');
  await page.waitForFunction(() => /Paste your Worker/.test(document.getElementById('msg').textContent));
  assert.equal(calls.length, 0);
  await ctx.close();
});

await check('AC-10.3.6 phone width 390: no horizontal scroll, whole flow, no console errors', async () => {
  approveMode = 'ok';
  const { page, errors, ctx } = await open({ width: 390, height: 844 });
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(ov <= 0, 'horizontal overflow ' + ov);
  await page.fill('#concept-text', 'idea'); await page.click('#concept-send');
  await page.waitForFunction(() => /Saved\./.test(document.getElementById('msg').textContent));
  await page.click('#drafts-refresh'); await page.waitForSelector('#drafts-list .draft-item button'); await page.click('#drafts-list .draft-item button');
  await page.click('#approve-btn');
  await page.waitForFunction(() => /Buffer queue/.test(document.getElementById('msg').textContent), null, { timeout: 60000 });
  const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(ov2 <= 0, 'horizontal overflow after flow ' + ov2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

await check('AC-12.1 Draft now: with text saves then run-now; without text only run-now; exact message', async () => {
  const MSG = 'Asked your Mac to draft now. Check back in about 10 minutes (your Mac needs to be awake).';
  calls.length = 0;
  const { page, ctx } = await open({ width: 1200, height: 900 });
  await page.fill('#concept-text', 'Use AI to plan the week');
  await page.click('#draft-now');
  await page.waitForFunction(() => document.getElementById('msg').textContent.startsWith('Asked your Mac'));
  assert.equal(await page.textContent('#msg'), MSG);
  const posts = calls.filter(c => c.method === 'POST');
  assert.deepEqual(posts.map(c => c.path), ['/api/concepts', '/api/run-now']);
  for (const c of posts) assert.equal(c.auth, 'Bearer ' + TOKEN);
  calls.length = 0;
  await page.click('#draft-now');
  await page.waitForFunction(() => document.getElementById('msg').textContent.startsWith('Asked your Mac'));
  assert.deepEqual(calls.filter(c => c.method === 'POST').map(c => c.path), ['/api/run-now']);
  await ctx.close();
});

await check('AC-12.2/3 split sections, queued greyed, series draft loads 8 slides', async () => {
  listMode = 'series';
  const { page, ctx } = await open({ width: 390, height: 800 });
  await page.click('#drafts-refresh2');
  await page.waitForSelector('#drafts-list .draft-section .draft-item');
  const secs = page.locator('#drafts-list .draft-section');
  assert.equal(await secs.count(), 2);
  const s0 = await secs.nth(0).innerText(), s1 = await secs.nth(1).innerText();
  assert.match(s0, /Build notes series/); assert.match(s0, /Build notes: what shipped today/); assert.match(s0, /Waiting to be drafted/); assert.match(s0, /Build notes: queued topic/); assert.ok(!/second line/.test(s0));
  assert.match(s1, /Your ideas/); assert.match(s1, /Use AI to plan the week/); assert.match(s1, /invented figure: 90%/); assert.ok(!/Waiting/.test(s1));
  assert.equal(await secs.nth(0).locator('.draft-item.waiting').count(), 1);
  await secs.nth(0).locator('button').first().click();
  assert.equal(await page.locator('.ig-card').count(), 8);
  for (const x of await page.locator('.ig-card').allInnerTexts()) assert.ok(!/[\[\]]/.test(x));
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(ov <= 0, 'overflow ' + ov);
  listMode = 'plain';
  await ctx.close();
});

await check('AC-12.2 empty sections say Nothing here yet.', async () => {
  const { page, ctx } = await open({ width: 390, height: 800 });
  await page.evaluate(() => {}); 
  const txt = await page.evaluate(async ([w, t]) => { const r = await fetch(w + '/api/concepts?status=queued', { headers: { Authorization: 'Bearer ' + t } }); return r.status; }, [W, TOKEN]);
  assert.equal(txt, 200);
  await page.click('#drafts-refresh2'); await page.waitForSelector('#drafts-list .draft-section');
  assert.match(await page.locator('#drafts-list .draft-section').nth(0).innerText(), /Nothing here yet\./);
  await ctx.close();
});

await check('AC-14.5 a draft whose slides carry guids shows img.ig-bg /img-album/<guid> on every slide; placeholder never reaches the export', async () => {
  listMode = 'photos';
  const { page, ctx } = await open({ width: 1200, height: 900 });
  await page.click('#drafts-refresh'); await page.waitForSelector('#drafts-list .draft-item button'); await page.click('#drafts-list .draft-item button');
  assert.equal(await page.locator('.ig-card').count(), 8);
  const srcs = await page.locator('.ig-card').evaluateAll(cs => cs.map(c => { const i = c.querySelector('img.ig-bg'); return i ? i.getAttribute('src') : null; }));
  srcs.forEach((u, i) => { assert.ok(u, 'slide ' + (i + 1) + ' has no img.ig-bg'); assert.ok(u.endsWith('/img-album/' + (i % 2 ? 'g1' : 'g2-test_guid')), u); });
  assert.equal(await page.locator('.ig-photo-ph').count(), 0, 'no placeholder when every slide has a photo');
  // a slide with no photo shows the placeholder on screen but the exported clone must not carry it
  await page.evaluate(() => { cards[0].photo = ''; render(); });
  assert.equal(await page.locator('.ig-card').first().locator('.ig-photo-ph').count(), 1);
  const seen = await page.evaluate(async () => {
    const real = window.html2canvas; let hadPh = null;
    window.html2canvas = (el, o) => { hadPh = !!el.querySelector('.ig-photo-ph'); return real(el, o); };
    await window.renderCardPng(0);
    window.html2canvas = real; return hadPh;
  });
  assert.equal(seen, false, 'placeholder present in the element being exported');
  listMode = 'plain';
  await ctx.close();
});

await check('AC-10.3.4/5/7 + G2/G5/G7 greps and the stray-tool guard', async () => {
  const src = fs.readFileSync(FILE, 'utf8');
  assert.ok(!/api\.buffer\.com|buffer-api|find-generic-password/i.test(src), 'buffer/credential path');
  assert.ok(!src.includes(TOKEN));
  assert.ok(!/[–—]/.test(src), 'dash');
  assert.ok(!(/function\s+renderDeck/.test(src) && /carousel_decks_v2/.test(src) && /syncDomToState/.test(src)));
  execFileSync('node', ['/Users/lizzie/NightMode/scripts/no-stray-orb-tool.mjs'], { stdio: 'pipe' });
});

await browser.close(); worker.close(); site.close();
for (const [s, n] of results) console.log(s, n);
process.exit(results.some(r => r[0] === 'FAIL') ? 1 : 0);
