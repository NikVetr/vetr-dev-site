// The lock-screen levels: which sections each takes, and how many rows, for a screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCorpus, loadLanguage } from '../core/pack.js';
import { LOCK_LEVELS, lockScreenSelection } from '../ui/chips.js';
import { sectionConcepts } from '../ui/content-tree.js';

const loadText = (/** @type {string} */ rel) => readFile(rel, 'utf8');
const corpus = await loadCorpus(loadText);
const [targetRows, sourceRows] = await Promise.all(['zh-Hans', 'en'].map((c) => loadLanguage(loadText, c, corpus.groups)));
const spec = /** @type {any} */ ({ target: 'zh-Hans', source: 'en' });
const sections = corpus.sections.map((section) => ({
  sectionId: section.section_id, title: section.title_en, icon: null,
  items: sectionConcepts({ corpus, spec, targetRows, sourceRows, edits: { overrides: {}, extras: [] } }, section),
}));
const on = (/** @type {{sections:Record<string,boolean>}} */ s) => Object.keys(s.sections).filter((id) => s.sections[id]);
const rows = (/** @type {{items:Record<string,boolean>}} */ s) => Object.values(s.items).filter(Boolean).length;
// An iPhone's content area under its clock, and a screen with no clock.
const IPHONE = 166 * 231;
const BARE = 162 * 378;

test('each level is its own sections, in its own order, a row from each in turn', () => {
  for (const level of /** @type {(keyof typeof LOCK_LEVELS)[]} */ (Object.keys(LOCK_LEVELS))) {
    const chosen = lockScreenSelection({ corpus, level, sections, area: IPHONE });
    // Eight rows, and a heading for every two of them at most.
    assert.equal(rows(chosen), 8, level);
    assert.deepEqual(new Set(on(chosen)), new Set(LOCK_LEVELS[level].slice(0, 4)), level);
    // Rows only in the sections it switched on.
    for (const [id, picked] of Object.entries(chosen.items)) {
      if (picked) assert.ok(on(chosen).includes(corpus.concepts[id].section_id), `${level}: ${id}`);
    }
  }
  const [beginner, intermediate, advanced] = ['beginner', 'intermediate', 'advanced']
    .map((level) => new Set(on(lockScreenSelection({ corpus, level: /** @type {any} */ (level), sections, area: IPHONE }))));
  assert.notDeepEqual(beginner, intermediate);
  assert.notDeepEqual(intermediate, advanced);
});

test('a bigger screen takes more rows, from more of the level\'s sections', () => {
  const small = lockScreenSelection({ corpus, level: 'beginner', sections, area: IPHONE });
  const big = lockScreenSelection({ corpus, level: 'beginner', sections, area: BARE });
  assert.ok(rows(big) > rows(small));
  assert.ok(on(big).length > on(small).length);
  for (const id of on(small)) assert.ok(on(big).includes(id));
});
