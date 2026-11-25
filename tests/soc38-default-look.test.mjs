// SOC-38 A1: a draft or new post with no stored look opens as Dark; a chosen Photo stays Photo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../dist/carousel-insta/index.html', import.meta.url), 'utf8');
const lookOf = new Function('return (' + html.match(/const lookOf = (v => [^\n]*?);\s*(?:\/\/|\n)/)[1] + ')')();

test('SOC-38 A1: lookOf defaults to dark, keeps a chosen photo, maps retired plain to dark', () => {
  assert.equal(lookOf(undefined), 'dark');
  assert.equal(lookOf(null), 'dark');
  assert.equal(lookOf(''), 'dark');
  assert.equal(lookOf('dark'), 'dark');
  assert.equal(lookOf('plain'), 'dark');
  assert.equal(lookOf('photo'), 'photo');
});

test('SOC-38 A1: no fallback in the page still resolves a missing look to photo', () => {
  assert.ok(!/c\.kind === 'life' \? 'dark' : 'photo'/.test(html), 'old kind-based photo fallback is gone');
  assert.match(html, /id="look-dark"[^>]*aria-pressed="true"/);
  assert.match(html, /id="look-photo"[^>]*aria-pressed="false"/);
});
