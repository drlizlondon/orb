// SOC-13.4 "a check that cannot fail proves nothing": breaks a copy of look.js in 15 ways and demands tests/look.spec.mjs or tests/look-offsets.spec.mjs goes red each time.
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
  // SOC-24
  ['plain look still draws the photo', s => s.replace('ctx.fillStyle = C.purple; ctx.fillRect(0, 0, T.W, T.H); draw(ctx);', "drawPhoto(ctx, im, 0.5, 0.5, 1); draw(ctx);")],
  ['plain title in the wrong colour', s => s.replace('color: C.cream, plainColor: C.cream,', 'color: C.cream, plainColor: C.soft,')],
  ['plain keeps the title pill', s => s.replace('const bare = plainMode && !!o.plainColor;', 'const bare = false;')],
  ['plain ground is the wrong purple', s => s.replace('ctx.fillStyle = C.purple; ctx.fillRect(0, 0, T.W, T.H); draw(ctx);', "ctx.fillStyle = '#3a1151'; ctx.fillRect(0, 0, T.W, T.H); draw(ctx);")],
  ['plain title lines 2+ keep the pill indent', s => s.replace('(k % 2 ? PL(18, 0) : 0)', '(k % 2 ? PL(18, 18) : 0)')],
  ['plain block bottom-anchored again', s => s.replace('if (plainMode) { const top = 48', 'if (false) { const top = 48')],
  ['plain look leaks into the photo look (plainMode left on)', s => s.replace('} finally { plainMode = false; }', '} finally { plainMode = true; }')],
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
