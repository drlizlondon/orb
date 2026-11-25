// SOC-41 acceptance: the Ready list stream filter. Playwright against a local static server + a stubbed Worker (no live Worker is called).
// Run: node tests/ready-filter.spec.mjs   (PLAYWRIGHT_DIR / CHROMIUM_PATH / PAGE_FILE as in carousel-insta.spec.mjs)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const FILE = process.env.PAGE_FILE || path.join(root, 'dist/carousel-insta/index.html');
const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR || '/Users/lizzie/colourpuzzle/node_modules';
const { chromium } = require(path.join(pwDir, 'playwright'));
const TOKEN = 'test-token-not-real-0001'; // fake, test only

let drafts = [];
const mk = (tag, o, i) => ({ id: 'c-' + tag, concept: 'Fixture ' + tag, lane: 'wide', kind: o.kind, ...(o.series ? { series: o.series } : {}), status: 'drafted', createdAt: `2026-11-19T07:0${i}:00Z`,
  deck: { slides: [{ kicker: '', num: '', title: 'Fixture ' + tag, sub: 'Fixture second line.', swipe: 'Swipe', photo: '' }, { kicker: 'k', num: '', title: 'Fixture ' + tag + ' two', sub: 'Fixture.', swipe: '', photo: '' }, { kicker: 'k', num: '', title: 'Fixture ' + tag + ' three', sub: 'Fixture.', swipe: '', photo: '' }], caption: 'Fixture caption.', claims: [], evidence: 'Fixture evidence' } });
const SIX = () => [
  ...['e1', 'e2', 'e3'].map((t, i) => mk(t, { kind: 'series', series: 'earn-more' }, i)),
  ...['b1', 'b2'].map((t, i) => mk(t, { kind: 'idea', series: 'build' }, 3 + i)),
  mk('i1', { kind: 'idea' }, 5)
];
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
const worker = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const j = (s, o) => { res.writeHead(s, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.headers.authorization !== 'Bearer ' + TOKEN) return j(401, { ok: false });
  if (u.pathname === '/api/concepts') { const s = u.searchParams.get('status'); return j(200, { ok: true, concepts: s === 'drafted' ? drafts.map(c => ({ ...c, postState: 'none' })) : [] }); }
  if (u.pathname === '/api/series') return j(200, { ok: true, last: 6, next: 7, assigned: [] });
  if (u.pathname === '/api/album') return j(200, { ok: true, photos: [] });
  if (u.pathname === '/api/album-stats') return j(200, { ok: true, stats: null });
  if (u.pathname === '/api/reels') return j(200, { ok: true, reels: [] });
  j(404, { ok: false });
});
const site = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(fs.readFileSync(FILE)); }
  const f = path.join(root, 'dist/carousel-insta', p.slice(1));
  if (/^\/[\w.-]+\.js$/.test(p) && fs.existsSync(f)) { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(fs.readFileSync(f)); }
  res.writeHead(404); res.end('no');
});
await new Promise(r => worker.listen(0, '127.0.0.1', r));
await new Promise(r => site.listen(0, '127.0.0.1', r));
const W = `http://127.0.0.1:${worker.address().port}`, S = `http://127.0.0.1:${site.address().port}/`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
const check = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name + ' :: ' + e.message.split('\n')[0]]); } };
async function open(remembered) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(u => !/^http:\/\/127\.0\.0\.1/.test(u.href), r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const page = await ctx.newPage();
  await page.addInitScript(([b, t, rem]) => { localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', t); if (rem != null && !sessionStorage.getItem('seeded')) { localStorage.setItem('orb.readyFilter', rem); sessionStorage.setItem('seeded', '1'); } }, [W, TOKEN, remembered]);
  await page.goto(S);
  await page.waitForSelector('#ready-heading:not([hidden])', { timeout: 15000 });
  await page.waitForTimeout(300);
  return { page, ctx };
}
const opts = page => page.locator('#ready-filter option').allTextContents();

await check('options list only streams with posts, in order, with counts (All (6), Earn more (3), Build (2), One-off (1); no Life)', async () => {
  drafts = SIX(); const { page, ctx } = await open();
  assert.deepEqual(await opts(page), ['All (6)', 'Earn more (3)', 'Build (2)', 'One-off (1)']);
  assert.equal(await page.inputValue('#ready-filter'), '');
  assert.equal(await page.textContent('#ready-heading'), 'Ready to post (6)');
  await ctx.close();
});
await check('selecting Build (2) shows exactly 2 .ready-item, both tagged Build; heading reads Ready to post (2 of 6); choice is remembered', async () => {
  drafts = SIX(); const { page, ctx } = await open();
  await page.selectOption('#ready-filter', { label: 'Build (2)' });
  assert.equal(await page.locator('.ready-item').count(), 2);
  assert.deepEqual(await page.locator('.ready-tag').allTextContents(), ['Build', 'Build']);
  assert.equal(await page.textContent('#ready-heading'), 'Ready to post (2 of 6)');
  assert.equal(await page.evaluate(() => localStorage.getItem('orb.readyFilter')), 'build');
  await page.reload(); await page.waitForSelector('.ready-item'); await page.waitForTimeout(300);
  assert.equal(await page.locator('.ready-item').count(), 2, 'remembered across reload');
  await ctx.close();
});
await check('a remembered filter whose stream is now empty falls back to All (false-alarm guard)', async () => {
  drafts = SIX().filter(c => c.series !== 'build'); const { page, ctx } = await open('build');
  assert.equal(await page.inputValue('#ready-filter'), '');
  assert.equal(await page.locator('.ready-item').count(), 4);
  assert.equal(await page.textContent('#ready-heading'), 'Ready to post (4)');
  assert.deepEqual(await opts(page), ['All (4)', 'Earn more (3)', 'One-off (1)']);
  await ctx.close();
});
await check('tag text reads Earn more for an earn-more draft', async () => {
  drafts = SIX(); const { page, ctx } = await open();
  const tags = await page.locator('.ready-tag').allTextContents();
  assert.equal(tags.filter(x => x === 'Earn more').length, 3); assert.equal(tags.includes('Work less, do more'), false);
  await ctx.close();
});
await check('G1: zero ready drafts shows no filter and no rows', async () => {
  drafts = []; const { page, ctx } = await open();
  assert.equal(await page.locator('#ready-filter').isVisible(), false);
  assert.equal(await page.locator('.ready-item').count(), 0);
  await ctx.close();
});
await check('screenshot at 390px with the filter visible', async () => {
  drafts = SIX(); const { page, ctx } = await open();
  await page.selectOption('#ready-filter', { label: 'Build (2)' });
  fs.mkdirSync('/Users/lizzie/NightMode/assets/previews', { recursive: true });
  await page.screenshot({ path: '/Users/lizzie/NightMode/assets/previews/soc41-filter.png' });
  await ctx.close();
});
await browser.close(); worker.close(); site.close();
for (const [s, n] of results) console.log(s, n);
process.exit(results.some(r => r[0] === 'FAIL') ? 1 : 0);
