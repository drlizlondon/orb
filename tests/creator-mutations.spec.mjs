// SOC-13.2 "a check that cannot fail proves nothing": breaks a copy of dist/carousel-insta/index.html in many ways and demands
// tests/carousel-insta.spec.mjs goes red each time (PAGE_FILE points the suite at the broken copy).
// Run: node tests/creator-mutations.spec.mjs   (same env as tests/carousel-insta.spec.mjs)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, '../dist/carousel-insta/index.html'), 'utf8');
const rep = (a, b) => s => s.replace(a, b);
const MUT = [
  ['review bar not fixed (Approve and messages scroll away)', rep('#review-bar, #edit-bar { position: fixed;', '#review-bar, #edit-bar { position: static;')],
  ['one more visible button on Ready (Check for drafts is back)', rep('<button id="more-btn" class="quiet-btn" type="button">More</button>', '<button id="more-btn" class="quiet-btn" type="button">More</button><button type="button">Check for drafts</button>')],
  ['Ready ignores postState (approved posts stay listed)', rep(".filter(x => (x[0].postState || 'none') === 'none')", '')],
  ['review strip is a vertical stack, no snap', rep('#review-strip { display: flex; overflow-x: auto; scroll-snap-type: x mandatory;', '#review-strip { display: block; scroll-snap-type: none;')],
  ['a fifth slide appears in a series publish', rep('const slides = cards.map((c, i) =>', 'const slides = cards.concat(type === \'series\' ? [cards[0]] : []).map((c, i) =>')],
  ['no face data blocks Approve', rep("kind = 'warn'; text = 'Could not check", "kind = 'warn'; blocked = true; text = 'Could not check")],
  ['face rule removed', rep('const f = results.findIndex(r => r && r.faceClear === false);', 'const f = -1;')],
  ['publish drops conceptId', rep('if (meta.conceptId) draft.conceptId = meta.conceptId;', '')],
  ['409 keeps the pending draft id', rep('meta.pending = null;\n      const nx = ap.data.next;', 'const nx = ap.data.next;')],
  ['1-slide check removed', rep("if (cards.length < 2) { say('err', 'A post needs at least 2 slides.'); return; }", '')],
  ['series with no photo goes on', rep("if (type === 'series' && !cards[0].photo) { say('err', 'Choose a photo for the first slide.'); return; }", '')],
  ['D5 carries the old number without her tap', rep('if (seriesInfo.last != null && L > seriesInfo.last) {', "if (seriesInfo.last != null && L > seriesInfo.last) { api('/api/series/floor', 'POST', { last: L });")],
  ['Ready main stays visible when not connected', rep("$('ready-main').hidden = !on;", "$('ready-main').hidden = false;")],
  ['a words post carries a series key', rep("if (type === 'series') draft.series = { n };", 'draft.series = { n };')],
  ['Edit opens an empty editor', rep("$('edit-btn').addEventListener('click', () => { renderEdit(); show('edit'); });", "$('edit-btn').addEventListener('click', () => { show('edit'); });")],
  ['queued line always shown', rep("$('ready-waiting').hidden = !q;", "$('ready-waiting').hidden = false;")],
  ['arrow box and slide 1 title drift apart', rep("if (f === 'title' && i === 0) $('cv-strap').value = inp.value;", '')],
  ['an en dash in the page', rep('<title>Insta Creator</title>', '<title>Insta Creator</title><!-- a – b -->')],
  ['the old amber is back', rep('.small-btn {', '.small-btn { color: #ffd9a0;')],
  ['the number is added to the caption', rep("const draft = { id, caption, evidence", "const draft = { id, caption: caption + (type === 'series' ? ' ' + OneLook.pad3(n) : ''), evidence")],
  ['success message is hidden before the screen changes (no wait)', rep('await sleep(1500);', '')],
  ['404 branch removed (wrong Worker address looks like a server error)', rep("if (e && e.status === 404) return 'Could not get your drafts: the Worker address on this phone is wrong. Under More, paste the address that ends in workers.dev.';", '')],
  ['saved address is not reduced to its origin (path and missing https:// kept)', rep("try { return new URL(/^https?:\\/\\//i.test(raw) ? raw : 'https://' + raw).origin; }", "try { return raw.replace(/\\/+$/, ''); }")],
  // SOC-24
  ['plain look is not passed to the renderer (plain draws the photo look)', rep("  if (plain) opts.look = 'plain';", '')],
  ['the toggle redraws but never tells the Worker', rep("'/api/concepts/' + encodeURIComponent(meta.conceptId) + '/look'", "'/api/series'")],
  ['the series label is never shown', rep('if (c && SERIES[c.kind]) {', 'if (false) {')],
  ['a concept with look plain opens as photo', rep("look = c.look === 'plain' ? 'plain' : 'photo';", "look = 'photo';")],
  ['the look is not part of the approve signature (a stale publish can be reused)', rep('[type, look, n, cover,', '[type, n, cover,')],
  // SOC-18.10
  ['slideFor drops the offsets (preview and export ignore the move)', rep('sub: c.sub, swipe: c.swipe, offsets: c.offsets }; }', 'sub: c.sub, swipe: c.swipe }; }')],
  ['a drag is not saved with the slide (norm drops offsets)', rep('face: s.face, offsets: s.offsets || null };', 'face: s.face, offsets: null };')],
  ['the face check is not shown again after a drag', rep('if (afterDrag.delete(i)) editFaceCheck(i);', 'afterDrag.delete(i);')],
  ['Reset words does nothing', rep('c.offsets = null; persist(); queueDraw(i); afterDrag.add(i);', 'persist();')],
  ['handles scroll the page instead of dragging (no touch-action none)', rep('touch-action: none; cursor: grab;', 'cursor: grab;')],
  ['the raw drag is kept instead of the clamped value', rep('else if (o.dx !== b.dx || o.dy !== b.dy) { c.offsets[n] = { dx: b.dx, dy: b.dy }; changed = true; }', '')],
  ['approve can fire before the face check finishes (never disabled while drawing)', rep("  $('approve-btn').disabled = true;\n  const rs = await Promise.all(", "  const rs = await Promise.all(")]
];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-mut-'));
let bad = 0;
const base = spawnSync('node', [path.join(here, 'carousel-insta.spec.mjs')], { encoding: 'utf8' });
console.log('baseline (unmodified page): exit ' + base.status + ' ' + (base.stdout.trim().split('\n').pop()));
if (base.status !== 0) { console.log('baseline is red, mutation results mean nothing'); process.exit(1); }
for (const [name, fn] of MUT) {
  const out = fn(SRC);
  if (out === SRC) { console.log('NOT APPLIED  ' + name + ' (the mutation did not change the file)'); bad++; continue; }
  const f = path.join(dir, 'index.html'); fs.writeFileSync(f, out);
  const r = spawnSync('node', [path.join(here, 'carousel-insta.spec.mjs')], { encoding: 'utf8', env: { ...process.env, PAGE_FILE: f } });
  const fails = (r.stdout.match(/^FAIL .*/gm) || []).map(x => x.slice(5, 78));
  const caught = r.status !== 0 && fails.length > 0;
  if (!caught) bad++;
  console.log((caught ? 'CAUGHT  ' : 'MISSED  ') + name + '\n          -> ' + (fails.slice(0, 2).join(' || ') || '(suite stayed green)'));
}
console.log(bad ? `\n${bad} mutation(s) not caught` : `\nall ${MUT.length} mutations caught`);
process.exit(bad ? 1 : 0);
