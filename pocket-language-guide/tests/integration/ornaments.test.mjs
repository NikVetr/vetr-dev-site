import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet } from '../../core/sheet.js';
import { referenceSpec } from '../../scripts/spec.mjs';
import { LANGUAGE_MOTIFS } from '../../core/ornaments.js';
import { splitCards, foldCards } from '../../render/impose.js';

const ctx = await createSheetContext({
  loadText: p => readFile(p, 'utf8'), loadBytes: p => readFile(p),
});

test('all language designs preserve text layout, content clearance and card cuts', async () => {
  for (const target of Object.keys(LANGUAGE_MOTIFS)) {
    // Quenya has a reserved frame and its own fitting/clearance regression suite.
    if (target === 'qya') continue;
    const plainSpec = await referenceSpec(target, 'en');
    const plain = (await buildSheet(ctx, plainSpec)).plan;
    const decorated = (await buildSheet(ctx, { ...plainSpec, ornamentStyle: 'language' })).plan;
    assert.equal(decorated.scale, plain.scale, target);
    assert.equal(decorated.faces.length, plain.faces.length, target);
    for (let i = 0; i < plain.faces.length; i++) {
      assert.deepEqual(decorated.faces[i].runs, plain.faces[i].runs, target);
      for (const mark of decorated.faces[i].paths ?? []) {
        for (const hit of decorated.faces[i].hits.filter(h => h.conceptId)) {
          assert(!(mark.x < hit.x + hit.w && mark.x + mark.w > hit.x
            && mark.y < hit.y + hit.h && mark.y + mark.h > hit.y), `${target}: ${hit.conceptId}`);
        }
      }
    }
    const count = (/** @type {import('../../core/types.js').LayoutPlan} */ plan) =>
      plan.faces.reduce((n, face) => n + (face.paths?.length ?? 0), 0);
    assert(count(decorated) > 0, target);
    // A sparse card is set on one face and printed one-sided, and the studio offers
    // no cut or fold for it (`setFinishable`): there is no back to pair it with.
    if (decorated.faces.length % 2 === 0) {
      assert.equal(count(splitCards(decorated)), count(decorated), target);
      assert.equal(count(foldCards(decorated)), count(decorated), target);
    }
  }
});

