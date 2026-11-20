// SOC-18.1: the only Mac door into Orb's one drawing file (dist/carousel-insta/look.js).
//   node scripts/look-render.mjs overlay <in.json> <outDir>   reel tag + caption PNGs (1080x1920, alpha) and rects.json
//   node scripts/look-render.mjs check <in.json>              does a deck fit, and which photo keeps the words off the face
// Playwright is not an Orb dependency: set PLAYWRIGHT_DIR (default /Users/lizzie/colourpuzzle/node_modules)
// and CHROMIUM_PATH if the default browser is not installed. LOOK_NO_FONTS=1 leaves the font links out (a test flag).
// Exit codes: 0 ok, 1 a caption or tag failed its rule (overlay), 2 fonts did not load or bad usage.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOOK = fs.readFileSync(path.join(root, 'dist/carousel-insta/look.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(root, 'dist/carousel-insta/index.html'), 'utf8');
const require = createRequire(import.meta.url);
const pwDir = process.env.PLAYWRIGHT_DIR || '/Users/lizzie/colourpuzzle/node_modules';
const { chromium } = require(path.join(pwDir, 'playwright'));

const [mode, inFile, outDir] = process.argv.slice(2);
if (!['overlay', 'check'].includes(mode) || !inFile || (mode === 'overlay' && !outDir)) {
  console.error('usage: look-render.mjs overlay <in.json> <outDir> | check <in.json>'); process.exit(2);
}
const input = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const lookSha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const links = process.env.LOOK_NO_FONTS ? '' : (INDEX.match(/<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g) || []).join('\n');

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.setContent('<!doctype html><html><head>' + links + '</head><body></body></html>');
await page.addScriptTag({ content: LOOK });
const ready = await page.evaluate(async () => {
  await OneLook.fontsReady();
  const loaded = fam => [...document.fonts].some(f => f.family.replace(/["']/g, '').startsWith(fam) && f.status === 'loaded');
  return document.fonts.check('700 italic 46px Caveat') && document.fonts.check("800 40px 'Baloo 2'") && loaded('Caveat') && loaded('Baloo 2');
});
if (!ready) { console.log('fonts did not load'); await browser.close(); process.exit(2); }

let code = 0;
if (mode === 'overlay') {
  fs.mkdirSync(outDir, { recursive: true });
  const ID = /^[a-z0-9-]{1,40}$/;
  const draw = (handle, caption) => page.evaluate(({ handle, caption }) => {
    const cv = document.createElement('canvas'); const r = OneLook.renderReelOverlay(cv, { handle, caption });
    return { r, png: cv.toDataURL('image/png').split(',')[1] };
  }, { handle, caption });
  const save = (f, b64) => fs.writeFileSync(path.join(outDir, f), Buffer.from(b64, 'base64'));
  const problems = [];
  const t = await draw(input.handle || '', ''); save('tag.png', t.png);
  if (!t.r.safe) problems.push('outside the safe zone: tag');
  const caps = [];
  for (const c of input.captions || []) {
    if (!ID.test(c.id || '')) { problems.push('bad id: ' + c.id); continue; }
    const d = await draw('', c.text || ''); save(c.id + '.png', d.png);
    if (!d.r.fits) problems.push('caption too wide: ' + c.id);
    if (!d.r.safe) problems.push('outside the safe zone: ' + c.id);
    caps.push({ id: c.id, file: c.id + '.png', rect: d.r.rects.caption, size: d.r.captionSize, fits: d.r.fits, safe: d.r.safe });
  }
  const SAFE = await page.evaluate(() => OneLook.T.SAFE);
  fs.writeFileSync(path.join(outDir, 'rects.json'), JSON.stringify({ lookSha, SAFE, tag: t.r.rects.tag, captions: caps }, null, 2));
  for (const p of problems) console.error(p);
  if (problems.length) code = 1;
} else {
  const out = await page.evaluate(async ({ kind, slides }) => {
    const load = url => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
    const drawOne = (cv, s, i, total, im, face) => {
      const opts = { face: im ? face || null : null, frame: null };
      return (kind === 'series' && i === 0)
        ? OneLook.renderSeries(cv, { ...OneLook.coverDefaults(), strap: s.title, num: 1 }, i, total, im, opts)
        : OneLook.renderSlide(cv, { handle: s.handle || '@drlizlondon', kicker: s.kicker || '', num: s.num || '', title: s.title || '', sub: s.sub || '', swipe: s.swipe || '' }, i, total, im, opts);
    };
    const res = [];
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i], cands = (s.candidates || []).slice(0, 8);
      const fits = drawOne(document.createElement('canvas'), s, i, slides.length, null, null).fits;
      let pick = -1, faceClear = null;
      for (let k = 0; k < cands.length; k++) {
        const im = await load(cands[k].url);
        const fc = im ? drawOne(document.createElement('canvas'), s, i, slides.length, im, cands[k].face).faceClear : false;
        if (fc !== false) { pick = k; faceClear = fc; break; }
        faceClear = false;
      }
      res.push({ i, fits, pick, faceClear });
    }
    return res;
  }, { kind: input.kind, slides: input.slides || [] });
  console.log(JSON.stringify({ lookSha, slides: out }));
}
await browser.close();
process.exit(code);
