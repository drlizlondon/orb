// NL-2c acceptance (Newsletter page): Playwright at 390 px against a local static server and a stubbed Worker.
// The live Worker is never called. Run: node tests/newsletter.spec.mjs
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
const TOKEN = 'test-token-not-real-0001'; // fake, test only

const ROWS = [
  { id: 'aaaaaaaaaa', title: 'Fixture week event', type: 'event', link: 'https://fixture.test/a', when_text: 'Thu 26 Nov 2026', place: 'Fixture hall', description: 'd', status: 'this_week', shown_status: 'this_week', source: 'fixture', end_date: '2026-11-27' },
  { id: 'bbbbbbbbbb', title: 'Fixture found item', type: 'opportunity', link: 'https://fixture.test/b', when_text: 'Closes 1 Dec 2026', place: '', description: 'd', status: 'found', shown_status: 'found', source: 'fixture', end_date: '2026-12-01' },
  { id: 'cccccccccc', title: 'Fixture closed item', type: 'news', link: 'https://fixture.test/c', when_text: 'Published 1 Nov 2026', place: '', description: 'd', status: 'found', shown_status: 'closed', source: 'fixture', end_date: '2026-11-22' },
  { id: 'dddddddddd', title: 'Fixture dateless item', type: 'opportunity', link: 'https://fixture.test/d', when_text: 'Open now', place: '', description: 'd', status: 'found', shown_status: 'needs_date', source: 'pasted 2026-11-22 (link needs sign-in)', end_date: '' },
];

let ops, posts;
const stub = http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-allow-methods': 'GET, POST, PUT, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const send = (code, obj) => { res.writeHead(code, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.headers.authorization !== 'Bearer ' + TOKEN) return send(401, { ok: false, error: 'access token required' });
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.method === 'GET' && req.url === '/api/newsletter') return send(200, { ok: true, meta: { issue_date: '2026-11-24', generated_at: 'z', messages: ['Added: Fixture'], issue_html: '<p>hi</p>\n' }, rows: ROWS, pending_ops: ops });
    if (req.method === 'POST' && req.url === '/api/newsletter/op') {
      const b = JSON.parse(body); posts.push(b);
      const op = { op_id: 'srv-' + posts.length, at: new Date().toISOString(), ...b };
      ops.push(op);
      return send(201, { ok: true, op });
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
async function t(name, fn) {
  ops = []; posts = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  await ctx.addInitScript(([b, k]) => { try { localStorage.setItem('orb_worker_base', b); localStorage.setItem('orb_approve_token', k); } catch (e) {} }, [BASE, TOKEN]);
  const page = await ctx.newPage();
  const hosts = new Set();
  page.on('request', r => { const u = new URL(r.url()); if (u.protocol.startsWith('http')) hosts.add(u.host); });
  page.on('pageerror', e => { throw e; });
  await page.goto(`http://127.0.0.1:${pagePort}/newsletter/`);
  await page.waitForSelector('.card');
  try { await fn(page, hosts); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n  ')); }
  await ctx.close();
}
const titles = async (page, list) => page.$$eval(`#${list} .card a.title`, els => els.map(e => e.textContent));

await t('Take out moves a This week card to Found in one tap, Undo restores it, and only the Worker is called', async (page, hosts) => {
  assert.deepEqual(await titles(page, 'list-week'), ['Fixture week event']);
  await page.click('#list-week .card button:has-text("Take out")');
  assert.deepEqual(await titles(page, 'list-week'), [], 'gone from This week at once');
  await page.waitForSelector('#toast-undo', { state: 'visible' }); // Undo toast is shown
  await page.click('#tab-all');
  const chipText = await page.$eval('#list-all .card[data-id="aaaaaaaaaa"] .chip.status', e => e.textContent);
  assert.equal(chipText, 'Found');
  await page.click('#tab-week');
  await page.click('#toast-undo');
  assert.deepEqual(await titles(page, 'list-week'), ['Fixture week event'], 'Undo puts it back');
  await page.waitForTimeout(150);
  assert.deepEqual(posts, [{ kind: 'status', id: 'aaaaaaaaaa', to: 'found' }, { kind: 'status', id: 'aaaaaaaaaa', to: 'this_week' }]);
  assert.deepEqual([...hosts].sort(), [`127.0.0.1:${stubPort}`, `127.0.0.1:${pagePort}`].sort(), 'no network call other than the Worker (and this local page)');
});

await t('the Undo toast goes after 6 seconds', async (page) => {
  await page.click('#list-week .card button:has-text("Take out")');
  await page.waitForSelector('#toast', { state: 'visible' });
  await page.waitForTimeout(6300);
  assert.ok(!(await page.isVisible('#toast')));
});

await t('buttons follow the shown status; closed is read-only; Needs sign-in chip shows', async (page) => {
  await page.click('#tab-all');
  const btns = id => page.$$eval(`#list-all .card[data-id="${id}"] button`, els => els.map(e => e.textContent));
  assert.deepEqual(await btns('aaaaaaaaaa'), ['Take out', 'Never use']);
  assert.deepEqual(await btns('bbbbbbbbbb'), ['Put in', 'Never use']);
  assert.deepEqual(await btns('cccccccccc'), []);
  assert.deepEqual(await btns('dddddddddd'), ['No end date', 'Set date']);
  assert.ok(await page.$eval('#list-all .card[data-id="cccccccccc"]', e => e.classList.contains('closed')));
  assert.ok((await page.$eval('#list-all .card[data-id="dddddddddd"] .chips', e => e.textContent)).includes('Needs sign-in'));
  await page.click('#list-all .card[data-id="dddddddddd"] button:has-text("No end date")');
  await page.waitForTimeout(100);
  assert.deepEqual(posts, [{ kind: 'end', id: 'dddddddddd', end: 'evergreen' }]);
  assert.equal(await page.$eval('#list-all .card[data-id="dddddddddd"] .chip.status', e => e.textContent), 'Found');
});

await t('Put in, Never use, Use again send the specified ops; Set date sends the chosen date', async (page) => {
  await page.click('#tab-all');
  await page.click('#list-all .card[data-id="bbbbbbbbbb"] button:has-text("Put in")');
  await page.waitForTimeout(120);
  await page.click('#list-all .card[data-id="bbbbbbbbbb"] button:has-text("Never use")');
  await page.waitForTimeout(120);
  await page.click('#list-all .card[data-id="bbbbbbbbbb"] button:has-text("Use again")');
  await page.waitForTimeout(120);
  await page.fill('#list-all .card[data-id="dddddddddd"] input[type=date]', '2027-02-02');
  await page.click('#list-all .card[data-id="dddddddddd"] button:has-text("Set date")');
  await page.waitForTimeout(150);
  assert.deepEqual(posts, [{ kind: 'status', id: 'bbbbbbbbbb', to: 'this_week' }, { kind: 'status', id: 'bbbbbbbbbb', to: 'not_using' },
    { kind: 'status', id: 'bbbbbbbbbb', to: 'found' }, { kind: 'end', id: 'dddddddddd', end: '2027-02-02' }]);
});

await t('strings are verbatim and the page does not scroll sideways at 390 px', async (page) => {
  assert.deepEqual(await page.$$eval('.tab', e => e.map(x => x.textContent)), ['This week', 'Everything', 'Add']);
  assert.equal(await page.textContent('#week-note'), "Take out removes it from this week only. It comes back next week while it is still open. Never use stops it for good. Nothing is ever deleted.");
  await page.click('#tab-add');
  assert.equal(await page.textContent('label[for=paste-box]'), 'Paste from a newsletter');
  assert.equal(await page.textContent('#paste-send'), 'Add to list');
  assert.equal(await page.textContent('label[for=thoughts-box]'), 'My thoughts this week');
  assert.ok((await page.textContent('#pane-add')).includes('Rough notes are fine. Only your notes are used.'));
  assert.equal(await page.textContent('#thoughts-send'), 'Save thoughts');
  assert.deepEqual(await page.$$eval('#results .msg', e => e.map(x => x.textContent)), ['Added: Fixture']);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'no horizontal scroll');
});

await t('the paste box sends both text/html and text/plain; thoughts send the issue date', async (page) => {
  await page.click('#tab-add');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<p><a href="https://x.test/e">Event</a></p>');
    dt.setData('text/plain', 'Event');
    const ta = document.getElementById('paste-box');
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    ta.value = 'Event';
  });
  await page.click('#paste-send');
  await page.fill('#thoughts-box', 'some rough notes');
  await page.click('#thoughts-send');
  await page.waitForTimeout(150);
  assert.deepEqual(posts, [{ kind: 'paste', html: '<p><a href="https://x.test/e">Event</a></p>', text: 'Event' },
    { kind: 'thoughts', text: 'some rough notes', issue_date: '2026-11-24' }]);
});

await t('a wrong access code says so', async (page) => {
  await page.evaluate(() => localStorage.setItem('orb_approve_token', 'wrong'));
  await page.click('#list-week .card button:has-text("Take out")');
  await page.waitForSelector('#say.err');
  assert.ok((await page.textContent('#say')).includes('wrong or old'));
  assert.deepEqual(await titles(page, 'list-week'), ['Fixture week event'], 'a failed save puts the card back');
});

await browser.close();
stub.close(); statics.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
