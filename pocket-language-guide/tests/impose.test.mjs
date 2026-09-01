import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet } from '../core/sheet.js';
import { splitCards, nUp } from '../render/impose.js';
import { referenceSpec } from '../scripts/spec.mjs';

const ctx = await createSheetContext({
  loadText: (rel) => readFile(rel, 'utf8'),
  loadBytes: (rel) => readFile(rel),
});
const { plan } = await buildSheet(ctx, { ...(await referenceSpec()), scale: 0 });

test('every face becomes two card sides at half the width', () => {
  const cards = splitCards(plan);
  // Not a fixed count: the face count follows the content, and the corpus grows.
  assert.ok(plan.faces.length >= 4 && plan.faces.length % 2 === 0, `${plan.faces.length} faces`);
  assert.equal(cards.faces.length, plan.faces.length * 2);
  assert.equal(cards.pageW, plan.pageW / 2);
  assert.equal(cards.pageH, plan.pageH);
});

test('splitting keeps every run exactly once, shifted into its own half', () => {
  const cards = splitCards(plan);
  const before = plan.faces.reduce((n, f) => n + f.runs.length, 0);
  const after = cards.faces.reduce((n, f) => n + f.runs.length, 0);
  assert.equal(after, before, 'runs were lost or duplicated at the cut');
  for (const face of cards.faces) {
    for (const run of face.runs) {
      assert.ok(run.x >= -0.01 && run.x < cards.pageW, `run at x=${run.x} outside the card`);
    }
  }
});

test('the flip axis decides which half backs which, and only one needs rotating', () => {
  const short = splitCards(plan, { flip: 'short-edge' });
  const long = splitCards(plan, { flip: 'long-edge' });
  // Card 1's front is the same either way; its back is not.
  assert.deepEqual(short.faces[0].runs.map((r) => r.text), long.faces[0].runs.map((r) => r.text));
  assert.notDeepEqual(short.faces[1].runs.map((r) => r.text), long.faces[1].runs.map((r) => r.text));
  assert.ok(short.faces.every((f) => !f.rotate), 'short-edge should need no rotation');
  // Half the card sides are backs, whatever the face count.
  const backs = long.faces.filter((f) => f.rotate === 180).length;
  assert.equal(backs, long.faces.length / 2, 'each back should be rotated');
});

test('an odd face count is refused rather than silently mispaired', () => {
  const odd = { ...plan, faces: plan.faces.slice(0, 3) };
  assert.throws(() => splitCards(odd), /even number of faces/);
});

test('n-up tiles faces onto larger paper without losing content', () => {
  const sheet = nUp(plan, { paperW: 612, paperH: 792 });
  assert.equal(sheet.pageW, 612);
  const before = plan.faces.reduce((n, f) => n + f.runs.length, 0);
  const after = sheet.faces.reduce((n, f) => n + f.runs.length, 0);
  assert.equal(after, before);
  assert.ok(sheet.faces.length < plan.faces.length, 'should fit more than one face per sheet');
});
