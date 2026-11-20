// SOC-18.5 "a check that cannot fail proves nothing": breaks a copy of dist/carousel-insta/index.html in many ways and demands
// tests/reels.spec.mjs goes red each time (PAGE_FILE points the suite at the broken copy).
// Run: node tests/reels-mutations.spec.mjs   (same env as tests/reels.spec.mjs)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, '../dist/carousel-insta/index.html'), 'utf8');
const rep = (a, b) => s => s.replace(a, b);
const MUT = [
  ['Save to phone shown on a ready reel (Make or Approve is skipped)', rep("const canSave = r.status === 'approved' || r.status === 'saved';", 'const canSave = true;')],
  ['Approve sends two POSTs', rep("const r = await api('/api/reels/' + encodeURIComponent(id) + '/approve', 'POST', {});", "await api('/api/reels/' + encodeURIComponent(id) + '/approve', 'POST', {}); const r = await api('/api/reels/' + encodeURIComponent(id) + '/approve', 'POST', {});")],
  ['the page puts text in the script box on open', rep("$('reel-make').disabled = !$('reel-script').value.trim();\n  loadReels();", "$('reel-script').value = 'Hello'; $('reel-make').disabled = false;\n  loadReels();")],
  ['#reels in the address is ignored', rep("location.hash === '#reels' || location.hash === '#trial'", 'false')],
  ['the Reels button is gone', rep('<button id="trial-btn" class="main-btn" type="button">Reels</button>', '')],
  ['the Carousels and Reels buttons are unequal', rep('#home-choice button { flex: 1 1 0; }', '#home-choice button { flex: 0 0 auto; }')],
  ['polling never stops', rep("if (current === 'trial' && reelWaiting()) reelPoll", "if (current === 'trial') reelPoll")],
  ['polling never starts', rep("if (current === 'trial' && reelWaiting()) reelPoll", "if (false) reelPoll")],
  ['a 422 clears her text', rep("msg.className = 'msg err'; msg.textContent = 'This script needs a change:';", "$('reel-script').value = ''; msg.className = 'msg err'; msg.textContent = 'This script needs a change:';")],
  ['the script is sent untrimmed', rep("const text = $('reel-script').value.trim(), msg", "const text = $('reel-script').value, msg")],
  ['cancel still marks it saved', rep("if (out === 'cancelled') {", 'if (false) {')],
  ['the video is taller than the room (693px)', rep('height: min(60vh, 640px); aspect-ratio: 9 / 16;', 'height: 693px; aspect-ratio: 9 / 16;')],
  ['404 video is not reported', rep("res && res.status === 404 ? 'This video is no longer kept.'", "false ? 'x'")],
  ['wrong file name', rep("'drliz-reel-' + r.id + '.mp4'", "'reel.mp4'")],
  ['saved reels are listed with the open ones', rep("const open = reels.filter(r => r.status !== 'saved'), saved", 'const open = reels, saved')],
  ['Try again is gone', rep("b.className = 'reel-retry quiet-btn small-btn'", "b.className = 'x'")],
  ['a dash in the copy', rep("'Saved. Now post it in Instagram with Trial switched on.'", "'Saved — now post it in Instagram with Trial switched on.'")]
];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reels-mut-'));
let bad = 0;
const base = spawnSync('node', [path.join(here, 'reels.spec.mjs')], { encoding: 'utf8' });
console.log('baseline (unmodified page): exit ' + base.status + ' ' + (base.stdout.trim().split('\n').pop()));
if (base.status !== 0) { console.log('baseline is red, mutation results mean nothing'); process.exit(1); }
for (const [name, fn] of MUT.filter(([n]) => !process.env.ONLY || n.includes(process.env.ONLY))) {
  const out = fn(SRC);
  if (out === SRC) { console.log('NOT APPLIED  ' + name + ' (the mutation did not change the file)'); bad++; continue; }
  const f = path.join(dir, 'index.html'); fs.writeFileSync(f, out);
  const r = spawnSync('node', [path.join(here, 'reels.spec.mjs')], { encoding: 'utf8', env: { ...process.env, PAGE_FILE: f } });
  const fails = (r.stdout.match(/^FAIL .*/gm) || []).map(x => x.slice(5, 78));
  const caught = r.status !== 0 && fails.length > 0;
  if (!caught) bad++;
  console.log((caught ? 'CAUGHT  ' : 'MISSED  ') + name + '\n          -> ' + (fails.slice(0, 2).join(' || ') || '(suite stayed green)'));
}
console.log(bad ? `\n${bad} mutation(s) not caught` : `\nall ${MUT.length} mutations caught`);
process.exit(bad ? 1 : 0);
