// IDEAS acceptance (Ideas page): Playwright at 390 px against a local static server and a stubbed Worker.
// The live Worker is never called. Run: node tests/ideas.spec.mjs
// (Playwright is not an Orb dependency; set PLAYWRIGHT_DIR to a node_modules that has it, and CHROMIUM_PATH if the default browser is missing.)
// Named .spec.mjs on purpose so `node --test tests/*.test.mjs` does not pick it up.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');
const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR || '/Users/lizzie/colourpuzzle/node_modules';
const { chromium } = require(path.join(pwDir, 'playwright'));
const TOKEN = 'test-token-not-real-0002'; // fake, test only

const FIXTURE = () => [
  { id: 'a000000001', date: '2026-11-20', title: 'Fixture older idea', text: 'Fixture older text', angle: '', formats: '', status: 'new', origin: 'file', pending: false, rev: 0, created_at: '2026-11-20' },
  { id: 'a000000002', date: '2026-11-22', title: 'Fixture newer idea', text: 'Fixture newer text ' + 'long '.repeat(60), angle: 'Fixture angle', formats: 'LinkedIn article', status: 'drafting', origin: 'file', pending: false, rev: 0, created_at: '2026-11-22' },
  { id: 'a000000003', date: '2026-11-21', title: 'Fixture dropped idea', text: 'Fixture dropped text', angle: '', formats: 'Reel', status: 'dropped', origin: 'file', pending: false, rev: 0, created_at: '2026-11-21' },
];
let ideas, posts, patches;
const stub = http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const send = (code, obj) => { res.writeHead(code, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.headers.authorization !== 'Bearer ' + TOKEN) return send(401, { ok: false, error: 'access token required' });
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.method === 'GET' && req.url === '/api/ideas') return send(200, { ok: true, ideas });
    if (req.method === 'POST' && req.url === '/api/ideas') {
      const b = JSON.parse(body); posts.push(b);
      const idea = { id: 'b000000001', date: '2026-11-23', title: b.text.split('.')[0], text: b.text, angle: b.angle.trim(), formats: b.formats, status: 'new', origin: 'orb', pending: true, rev: 1, created_at: '2026-11-23T08:00:00Z' };
      ideas.push(idea);
      return send(201, { ok: true, idea });
    }
    const m = /^\/api\/ideas\/([0-9a-f]{10})$/.exec(req.url);
    if (req.method === 'PATCH' && m) {
      const b = JSON.parse(body); patches.push({ id: m[1], ...b });
      const i = ideas.find(x => x.id === m[1]);
      Object.assign(i, { status: b.status, pending: true, rev: i.rev + 1 });
      return send(200, { ok: true, idea: i });
    }
    send(404, { ok: false, error: 'not found' });
  });
});
const statics = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(dist, p);
  if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
  const ext = path.extname(f);
  res.writeHead(200, { 'content-type': ext === '.svg' ? 'image/svg+xml' : ext === '.js' ? 'text/javascript' : 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(f));
});
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(s.address().port)));
const stubPort = await listen(stub), pagePort = await listen(statics);
const BASE = `http://127.0.0.1:${stubPort}`;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let failed = 0;
async function t(name, fn, token = TOKEN) {
  ideas = FIXTURE(); posts = []; patches = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.addInitScript(([b, k]) => { try { localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', k); } catch (e) {} }, [BASE, token]);
  const page = await ctx.newPage();
  const hosts = new Set();
  page.on('request', r => { const u = new URL(r.url()); if (u.protocol.startsWith('http')) hosts.add(u.host); });
  page.on('pageerror', e => { throw e; });
  await page.goto(`http://127.0.0.1:${pagePort}/ideas/`);
  await page.waitForTimeout(250);
  try { await fn(page, hosts); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n  ')); }
  await ctx.close();
}
const titles = page => page.$$eval('#list .card h3', els => els.map(e => e.textContent));

await t('ideas are listed newest first with date, title, tagged text, angle and formats; only the Worker is called', async (page, hosts) => {
  assert.deepEqual(await titles(page), ['Fixture newer idea', 'Fixture dropped idea', 'Fixture older idea']);
  const first = await page.$eval('#list .card', e => e.innerText);
  for (const s of ['2026-11-22', 'Fixture newer idea', 'Tagged text', 'Fixture newer text', 'My angle', 'Fixture angle', 'LinkedIn article', 'drafting']) assert.ok(first.includes(s), s);
  assert.ok(!(await page.$eval('#list .card:last-child', e => e.innerText)).includes('My angle'), 'a blank angle shows no angle block');
  assert.deepEqual([...hosts].sort(), [`127.0.0.1:${stubPort}`, `127.0.0.1:${pagePort}`].sort());
});

await t('the status filter shows counts and narrows the list', async (page) => {
  assert.deepEqual(await page.$$eval('#filters button', e => e.map(x => x.textContent)), ['All 3', 'New 1', 'Drafting 1', 'Used 0', 'Dropped 1']);
  await page.click('#filters button[data-filter=dropped]');
  assert.deepEqual(await titles(page), ['Fixture dropped idea']);
  await page.click('#filters button[data-filter=used]');
  assert.ok((await page.textContent('#list')).includes('Nothing with that status.'));
});

await t('add an idea: text, a blank angle stays "" and the chosen formats are sent; it shows at once', async (page) => {
  await page.click('#tab-add');
  await page.fill('#idea-text', 'Phone fixture idea. More words.');
  await page.click('#formats button[data-format=LinkedIn]');
  await page.click('#formats button[data-format=Reel]');
  await page.click('#idea-save');
  await page.waitForTimeout(200);
  assert.deepEqual(posts, [{ text: 'Phone fixture idea. More words.', angle: '', formats: 'LinkedIn, Reel' }]);
  assert.equal((await titles(page))[0], 'Phone fixture idea');
  assert.ok((await page.$eval('#list .card', e => e.innerText)).includes('Going into your file'));
  assert.ok(!(await page.$eval('#list .card', e => e.innerText)).includes('My angle'));
  assert.equal(await page.inputValue('#idea-text'), '', 'the form clears');
});

await t('empty text is refused on the phone and nothing is sent', async (page) => {
  await page.click('#tab-add');
  await page.click('#idea-save');
  assert.ok((await page.textContent('#say')).includes('Write or paste the idea first.'));
  assert.deepEqual(posts, []);
});

await t('status buttons send PATCH, Undo restores, Drop and Bring back work, Mark used sends the place', async (page) => {
  await page.click('#list .card[data-id=a000000001] button:has-text("Start drafting")');
  await page.waitForTimeout(150);
  assert.equal(await page.$eval('#list .card[data-id=a000000001] .chip.status', e => e.textContent), 'drafting');
  await page.click('#toast-undo');
  await page.waitForTimeout(150);
  assert.equal(await page.$eval('#list .card[data-id=a000000001] .chip.status', e => e.textContent), 'new');
  await page.selectOption('#list .card[data-id=a000000002] select', 'Instagram');
  await page.click('#list .card[data-id=a000000002] button:has-text("Mark used")');
  await page.waitForTimeout(150);
  await page.click('#list .card[data-id=a000000003] button:has-text("Bring back")');
  await page.waitForTimeout(150);
  await page.click('#list .card[data-id=a000000001] button:has-text("Drop")');
  await page.waitForTimeout(150);
  assert.deepEqual(patches, [
    { id: 'a000000001', status: 'drafting' }, { id: 'a000000001', status: 'new' },
    { id: 'a000000002', status: 'used Instagram' }, { id: 'a000000003', status: 'new' }, { id: 'a000000001', status: 'dropped' }]);
  assert.ok(ideas.every(i => i.id), 'nothing is ever deleted: the list still has all three');
  assert.equal(ideas.length, 3);
});

await t('long text is clamped with Show more; the page does not scroll sideways at 390 px; strings are verbatim', async (page) => {
  assert.ok(await page.$eval('#list .card[data-id=a000000002] .body-text', e => e.classList.contains('clamp')));
  await page.click('#list .card[data-id=a000000002] button:has-text("Show more")');
  assert.ok(!(await page.$eval('#list .card[data-id=a000000002] .body-text', e => e.classList.contains('clamp'))));
  assert.deepEqual(await page.$$eval('.tab', e => e.map(x => x.textContent)), ['Ideas', 'Add an idea']);
  await page.click('#tab-add');
  assert.equal(await page.textContent('label[for=idea-angle]'), 'My angle (optional)');
  assert.deepEqual(await page.$$eval('#formats button', e => e.map(x => x.textContent)), ['LinkedIn', 'Instagram', 'Newsletter', 'Reel']);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'no horizontal scroll');
});

await t('a wrong access code says so and a failed change puts nothing on screen', async (page) => {
  assert.ok((await page.textContent('#say')).includes('wrong or old'));
  assert.deepEqual(await titles(page), []);
}, 'wrong');

await browser.close();
stub.close(); statics.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
