// SOC-39: an earn-more concept is a series post (cover + number); a build concept never is.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html = fs.readFileSync(new URL('../dist/carousel-insta/index.html', import.meta.url), 'utf8');
const a = html.indexOf('function isSeries(c)');
const b = html.indexOf('// Cover quality:');
assert.ok(a > 0 && b > a, 'series block present');
const ctx = vm.createContext({});
vm.runInContext(html.slice(a, b) + '\nthis.isSeries = isSeries; this.numberOf = numberOf; this.topicOf = topicOf;', ctx);
const { isSeries, numberOf, topicOf } = ctx;
test('earn-more concept of kind idea is a series post (cover + number)', () => {
  const c = { kind: 'idea', series: 'earn-more', seriesNumber: 7 };
  assert.equal(isSeries(c), true);
  assert.equal(numberOf(c), 7);
  assert.equal(topicOf(c), 'Work less, do more');
});
test('build concept is not a series post, even with kind series (G6)', () => {
  const c = { kind: 'series', series: 'build', seriesNumber: 7 };
  assert.equal(isSeries(c), false);
  assert.equal(numberOf(c), null);
  assert.equal(topicOf(c), 'Build');
});
test('false alarm: old kind rule unchanged when no series string', () => {
  assert.equal(isSeries({ kind: 'series' }), true);
  assert.equal(isSeries({ kind: 'life' }), false);
  assert.equal(isSeries({ kind: 'idea' }), false);
  assert.equal(topicOf({ kind: 'life' }), 'Life');
});
