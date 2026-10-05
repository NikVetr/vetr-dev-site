// What an exported card has to be for the studio to open on it.
import test from 'node:test';
import assert from 'node:assert/strict';

const { readExport } = await import('../ui/saved-cards.js');

const card = {
  name: 'For the phone', at: 1, target: 'zh-Hans', source: 'en', spec: { geometry: { pageW: 180 } },
  finish: { mode: '', flip: 'short-edge' }, dpi: 600,
  summary: { sections: 2, items: 9, faces: 1, width: 180, height: 396 },
};
const file = (/** @type {any} */ c, kind = 'wanderwart-card') => JSON.stringify({ kind, version: 1, card: c });

test('an exported card reads back as it was', () => {
  const got = readExport(file(card));
  assert.equal(got.ok, true);
  assert.deepEqual(got.ok && got.card, card);
  const withEdits = readExport(file({ ...card, edits: { overrides: {}, extras: [] } }));
  assert.equal(withEdits.ok, true);
});

test('anything else is refused, with what is wrong with it', () => {
  assert.deepEqual(readExport('not json'), { ok: false, problems: ['not JSON'] });
  assert.equal(readExport(file(card, 'pocket-language-guide')).ok, false);
  const broken = readExport(file({ ...card, target: '', spec: [], dpi: '600', edits: { extras: {} } }));
  assert.equal(broken.ok, false);
  assert.deepEqual(!broken.ok && broken.problems,
    ['card.target: missing', 'card.spec: not an object', 'card.dpi: not a number', 'card.edits: not a set of edits']);
});
