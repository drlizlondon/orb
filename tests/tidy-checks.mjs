// Orb Instagram tidy-up: the launcher and stored-tools checks, as one function so tests/tidy-mutations.test.mjs can run the very
// same asserts against deliberately broken copies and demand that each one fails.
import assert from 'node:assert/strict';
const memory = initial => { const m = new Map(initial ? Object.entries(initial) : []); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), m }; };
export function runToolChecks({ loadTools, seedTools, projects, TOOLS_KEY, SEEN_KEY, exportTools }) {
  const ids = l => l.map(t => t.id);
  // no Cover Series label or tile in the launcher list
  assert.ok(!projects.some(p => p.id === 'cover' || /cover\s*series/i.test(p.title + p.description)), 'a Cover Series tile is in projects');
  assert.ok(!seedTools(1).some(t => /cover\s*series/i.test(t.title + t.desc)), 'a Cover Series tool is seeded');
  assert.deepEqual(projects.filter(p => /instagram/i.test(p.title)).map(p => p.title), ['Instagram'], 'one name: Instagram');
  // a returning visitor with cover-series in the stored tools ends up without it
  const defaults = seedTools(1);
  const old = [...defaults.map(t => t.id === 'igc' ? { ...t, title: 'Instagram Carousel' } : t), { id: 'cover', title: 'Cover Series', url: 'https://drlizlondon.github.io/orb/cover-series/', desc: 'old', icon: '', addedAt: 1 }];
  const s = memory({ [TOOLS_KEY]: exportTools(old), [SEEN_KEY]: JSON.stringify([...ids(defaults), 'cover']) });
  const loaded = loadTools(s, 9);
  assert.ok(!ids(loaded).includes('cover'), 'cover still in the loaded list');
  assert.equal(loaded.find(t => t.id === 'igc').title, 'Instagram', 'old title not renamed');
  assert.ok(!ids(JSON.parse(s.m.get(TOOLS_KEY)).tools).includes('cover'), 'stored list still holds cover');
  assert.ok(ids(loadTools(s, 10)).every(id => id !== 'cover'), 'cover came back on the next load');
}
