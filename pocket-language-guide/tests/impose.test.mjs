import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet } from '../core/sheet.js';
import { splitCards, foldCards, nUp } from '../render/impose.js';
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

test('a fold keeps the sheet whole and puts the four panels in printers\' order', () => {
  const folded = foldCards(plan);
  // A fold changes nothing about the paper: same size, same number of sheets. That
  // is the difference from a cut, which halves the page and doubles the count.
  assert.equal(folded.pageW, plan.pageW);
  assert.equal(folded.pageH, plan.pageH);
  assert.equal(folded.faces.length, plan.faces.length);

  const halfW = plan.pageW / 2;
  /** The text of one half-page of the solved sheet, in reading order. */
  const page = (/** @type {number} */ n) => {
    const face = plan.faces[Math.floor(n / 2)];
    const lo = (n % 2) * halfW;
    return face.runs.filter((r) => r.x >= lo - 0.01 && r.x < lo + halfW - 0.01)
      .map((r) => r.text);
  };
  /** The text of one half of an imposed sheet. */
  const half = (/** @type {import('../core/types.js').Face} */ face,
    /** @type {number} */ side) => face.runs
    .filter((r) => r.x >= side * halfW - 0.01 && r.x < (side + 1) * halfW - 0.01)
    .map((r) => r.text);

  // **The order is 4-1 then 2-3, and it is not the reading order.** This is the whole
  // content of the fold: pages 1 and 2 have to be the two faces of one leaf and 4 and
  // 3 the two faces of the other, or the folded card does not read in sequence. A
  // reading-order imposition -- 1-2 on the front, 3-4 on the back -- is the mistake
  // this asserts against, and it produces a card whose panels run 1, 3, 4, 2.
  assert.deepEqual(half(folded.faces[0], 0), page(3), 'front left should be page 4');
  assert.deepEqual(half(folded.faces[0], 1), page(0), 'front right should be page 1');
  assert.deepEqual(half(folded.faces[1], 0), page(1), 'back left should be page 2');
  assert.deepEqual(half(folded.faces[1], 1), page(2), 'back right should be page 3');

  // Nothing is lost at the crease, and the fold ticks are the only new marks.
  const runsBefore = plan.faces.reduce((n, f) => n + f.runs.length, 0);
  const runsAfter = folded.faces.reduce((n, f) => n + f.runs.length, 0);
  assert.equal(runsAfter, runsBefore, 'runs were lost or duplicated at the crease');
  const rectsBefore = plan.faces.reduce((n, f) => n + f.rects.length, 0);
  const rectsAfter = folded.faces.reduce((n, f) => n + f.rects.length, 0);
  assert.equal(rectsAfter - rectsBefore, folded.faces.length * 2, 'two ticks a sheet');
});

test('a folded back is pre-rotated only when the printer flips the long edge', () => {
  const short = foldCards(plan, { flip: 'short-edge' });
  const long = foldCards(plan, { flip: 'long-edge' });
  // Same arrangement both ways -- one `rotate` does the whole of the long-edge case,
  // because rotating a sheet side 180 degrees is exactly the half-swap it also needs.
  assert.deepEqual(short.faces[1].runs.map((r) => r.text), long.faces[1].runs.map((r) => r.text));
  assert.ok(short.faces.every((f) => !f.rotate), 'short-edge should need no rotation');
  assert.ok(long.faces.every((f, i) => (i % 2 === 1 ? f.rotate === 180 : !f.rotate)),
    'only the back of each sheet should be rotated');
});

test('folding refuses an odd face count rather than losing a panel', () => {
  const odd = { ...plan, faces: plan.faces.slice(0, 3) };
  assert.throws(() => foldCards(odd), /even number of faces/);
});
