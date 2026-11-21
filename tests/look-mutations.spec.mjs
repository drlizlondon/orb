// SOC-13.4 "a check that cannot fail proves nothing": breaks a copy of look.js in many ways and demands tests/look.spec.mjs or tests/look-offsets.spec.mjs goes red each time.
// Run: node tests/look-mutations.spec.mjs   (same env as tests/look.spec.mjs)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, '../dist/carousel-insta/look.js'), 'utf8');
const MUT = [
  ['pad3 to two digits', s => s.replace("padStart(3, '0')", "padStart(2, '0')")],
  ['a default strap on coverDefaults', s => s.replace("h5: 'Work Less' })", "h5: 'Work Less', strap: 'Stock line' })")],
  ['a stock swipe cue when empty', s => s.replace('if (s.swipe) {', "if (true) { s.swipe = s.swipe || 'Swipe';")],
  ['a random number in the brush', s => s.replace('let s = seed >>> 0;', 'let s = (Math.random() * 1e9) >>> 0;')],
  ['a changed cover colour', s => s.replace("pink:'#f29bd0'", "pink:'#f29bd1'")],
  ['the old amber colour back', s => s + '\n// #ffd9a0\n'],
  ['maxTextTop 0.2 instead of 0.5', s => s.replace('maxTextTop: 0.5,', 'maxTextTop: 0.2,')],
  ['fits always true', s => s.replace('const fits = L.h <= maxH;', 'const fits = true;')],
  ['face check always says clear', s => s.replace('cleared = !rects.some(', 'cleared = true || !rects.some(')],
  ['her frame zoom ignored', s => s.replace('const zoom = frame ? frame.zoom : 1;', 'const zoom = 1;')],
  ['the old handle drawn on the series slide', s => s.replace("if (c.kicker) g('kicker', (cx, R) => {", "if (c.kicker) g('kicker', (cx, R) => { cx.fillText('@drlizlondon', 0, 0);")],
  // SOC-18.10
  ['offsets ignored', s => s.replace('const o = offsets && offsets[name],', 'const o = null,')],
  ['a default offset of 1 px in y', s => s.replace('dy: (o && +o.dy) || 0 };', 'dy: (o && +o.dy) || 1 };')],
  ['clamp removed', s => s.replace('dx = Math.max(-b.x0, Math.min(T.W - b.x1, want.dx)); dy = Math.max(-b.y0, Math.min(T.H - b.y1, want.dy));', 'dx = want.dx; dy = want.dy;')],
  // SOC-26 (the dark look)
  ['dark gradient removed (no scrim over the photo)', s => s.replace('if (dark) drawDarkScrim(ctx); draw(ctx);', 'draw(ctx);')],
  ['dark gradient runs top to bottom (dark at the top)', s => s.replace('ctx.createLinearGradient(0, T.H, 0, 0); DARK.scrim', 'ctx.createLinearGradient(0, 0, 0, T.H); DARK.scrim')],
  ['dark scrim too weak at the bottom (0.92 becomes 0.5)', s => s.replace("[0, 'rgba(10,10,16,0.92)']", "[0, 'rgba(10,10,16,0.5)']")],
  ['dark look keeps the plum tint on the photo', s => s.replace('  if (dark) return; // the dark look has no plum tint', '  // tint kept')],
  ['dark no-photo ground is the photo grey', s => s.replace("ctx.fillStyle = dark ? DARK.ground : '#bdbdba'", "ctx.fillStyle = '#bdbdba'")],
  ['dark accent colour changed', s => s.replace("accent: '#ffd9a0'", "accent: '#ffd9a1'")],
  ['dark title not white', s => s.replace("color: '#fff' },", "color: '#eee' },")],
  ['dark title size 32 card px instead of 30', s => s.replace('title: { size: 30,', 'title: { size: 32,')],
  ['dark number size changed', s => s.replace('num: { size: 92,', 'num: { size: 80,')],
  ['dark stack top-aligned instead of bottom-aligned', s => s.replace('let y = bottom - L.h; const textTop = y;', 'let y = top; const textTop = y;')],
  ['dark kicker not upper-case', s => s.replace('s.kicker.toUpperCase()', 's.kicker')],
  ['dark left margin changed', s => s.replace('box: { left: 34,', 'box: { left: 40,')],
  ['dark fit never reported', s => s.replace('const fits = L.h <= avail;', 'const fits = true;')],
  ['dark look leaks into the photo look (every slide drawn dark)', s => s.replace("const dk = !!opts && opts.look === 'dark';", 'const dk = true;')],
  ['dark look drops the photo (never drawn)', s => s.replace("drawPhoto(ctx, im, pl.fx, pl.fy, pl.zoom, dark); if (dark)", "drawPhoto(ctx, null, pl.fx, pl.fy, pl.zoom, dark); if (dark)")],
  // SOC-26 finish
  ['finish disabled', s => s.replace('if (finish !== false) applyFinish(ctx);', 'if (false) applyFinish(ctx);')],
  ['finish gain not clamped (a flat photo explodes)', s => s.replace('maxGain: 1.4,', 'maxGain: 9,')],
  ['finish sharpening far too strong (0.35 becomes 3)', s => s.replace('sharpAmt: 0.35', 'sharpAmt: 3')],
  ['finish warmth too strong (4 becomes 40)', s => s.replace('warmR: 4, warmB: 4', 'warmR: 40, warmB: 40')],
  ['finish applied when finish is false', s => s.replace('if (finish !== false) applyFinish(ctx);', 'applyFinish(ctx);')],
  ['dark text shadow removed', s => s.replace('function shadowOn(c) {', 'function shadowOn(c) { return;')],
  ['dark shadow left on for the accent text', s => s.replace('function shadowOff(c) {', 'function shadowOff(c) { return;')],
  // SOC-25
  ['photo fitted to the slide on both axes (non-uniform scale)', s => s.replace('ctx.drawImage(im, -(dw - T.W) * fx, -(dh - T.H) * fy, dw, dh);', 'ctx.drawImage(im, 0, 0, T.W, T.H);')],
  ['photo scaled by width only (a landscape source is squeezed in y)', s => s.replace('const s = Math.max(T.W / iw, T.H / ih) * zoom, dw = iw * s, dh = ih * s;', 'const s = T.W / iw * zoom, dw = iw * s, dh = T.H * zoom;')],
  ['low-res flag removed', s => s.replace('const lowResAt = sc => sc > 1 + 1e-6;', 'const lowResAt = sc => false;')],
  ['low-res flag fires on an exact-fit photo', s => s.replace('const lowResAt = sc => sc > 1 + 1e-6;', 'const lowResAt = sc => sc >= 1;')],
  ['moved rects not reported to the face check', s => s.replace('rects.push({ x: r.x + dx - p, y: r.y + dy - p,', 'rects.push({ x: r.x - p, y: r.y - p,')]
];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-mut-'));
let bad = 0;
const SPECS = ['look.spec.mjs', 'look-offsets.spec.mjs'];
const runAll = env => SPECS.map(f => spawnSync('node', [path.join(here, f)], { encoding: 'utf8', env: env ? { ...process.env, ...env } : process.env }));
const base = runAll();
console.log('baseline (unmodified look.js): exit ' + base.map(b => b.status).join(',') + ' ' + base.map(b => b.stdout.trim().split('\n').pop()).join(' | '));
if (base.some(b => b.status !== 0)) { console.log('baseline is red, mutation results mean nothing'); process.exit(1); }
for (const [name, fn] of MUT) {
  const out = fn(SRC);
  if (out === SRC) { console.log('NOT APPLIED  ' + name + ' (the mutation did not change the file)'); bad++; continue; }
  const f = path.join(dir, 'look.js'); fs.writeFileSync(f, out);
  const rs = runAll({ LOOK_FILE: f });
  const fails = rs.flatMap(r => (r.stdout.match(/^FAIL .*/gm) || []).map(x => x.slice(5, 70)));
  const caught = rs.some(r => r.status !== 0) && fails.length > 0;
  if (!caught) bad++;
  console.log((caught ? 'CAUGHT  ' : 'MISSED  ') + name + '\n          -> ' + (fails.join(' || ') || '(suite stayed green)'));
}
console.log(bad ? `\n${bad} mutation(s) not caught` : `\nall ${MUT.length} mutations caught`);
process.exit(bad ? 1 : 0);
