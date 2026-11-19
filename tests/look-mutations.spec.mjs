// SOC-13.4 "a check that cannot fail proves nothing": breaks a copy of look.js in 11 ways and demands tests/look.spec.mjs goes red each time.
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
  ['the old handle drawn on the series slide', s => s.replace("if (c.kicker) {", "if (c.kicker) { ctx.fillText('@drlizlondon', 0, 0);")]
];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-mut-'));
let bad = 0;
const base = spawnSync('node', [path.join(here, 'look.spec.mjs')], { encoding: 'utf8' });
console.log('baseline (unmodified look.js): exit ' + base.status + ' ' + (base.stdout.trim().split('\n').pop()));
if (base.status !== 0) { console.log('baseline is red, mutation results mean nothing'); process.exit(1); }
for (const [name, fn] of MUT) {
  const out = fn(SRC);
  if (out === SRC) { console.log('NOT APPLIED  ' + name + ' (the mutation did not change the file)'); bad++; continue; }
  const f = path.join(dir, 'look.js'); fs.writeFileSync(f, out);
  const r = spawnSync('node', [path.join(here, 'look.spec.mjs')], { encoding: 'utf8', env: { ...process.env, LOOK_FILE: f } });
  const fails = (r.stdout.match(/^FAIL .*/gm) || []).map(x => x.slice(5, 70));
  const caught = r.status !== 0 && fails.length > 0;
  if (!caught) bad++;
  console.log((caught ? 'CAUGHT  ' : 'MISSED  ') + name + '\n          -> ' + (fails.join(' || ') || '(suite stayed green)'));
}
console.log(bad ? `\n${bad} mutation(s) not caught` : `\nall ${MUT.length} mutations caught`);
process.exit(bad ? 1 : 0);
