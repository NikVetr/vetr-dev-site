import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet } from '../core/sheet.js';
import { referenceSpec } from '../scripts/spec.mjs';
import { ORNAMENT_STYLES, LANGUAGE_MOTIFS, motifFor, ornamentRule, cornerOrnaments } from '../core/ornaments.js';
import { splitCards, foldCards, nUp } from '../render/impose.js';
import { planToSvg } from '../render/svg.js';
import { cssFaces } from '../render/fonts.js';
import { parseTable } from '../core/csv.js';

const ctx = await createSheetContext({
  loadText: p => readFile(p, 'utf8'), loadBytes: p => readFile(p),
});
const spec = await referenceSpec('en', 'en');
const classic = (await buildSheet(ctx, spec)).plan;
const adorned = (await buildSheet(ctx, { ...spec, ornamentStyle: 'language' })).plan;

test('classic is exactly the existing layout, and ornament never moves text', async () => {
  assert.deepEqual((await buildSheet(ctx, { ...spec, ornamentStyle: 'classic' })).plan, classic);
  assert.equal(adorned.scale, classic.scale);
  assert.deepEqual(adorned.geometry, classic.geometry);
  assert.deepEqual(adorned.warnings, classic.warnings);
  for (let i = 0; i < classic.faces.length; i++) {
    for (const field of /** @type {const} */ (['runs', 'hits', 'icons'])) {
      assert.deepEqual(adorned.faces[i][field], classic.faces[i][field]);
    }
  }
});

test('every style stays inside the page and clear of vocabulary rows', async () => {
  for (const ornamentStyle of ORNAMENT_STYLES.filter(s => s !== 'classic')) {
    const { plan } = await buildSheet(ctx, { ...spec, scale: classic.scale,
      autoFaces: false, geometry: classic.geometry, ornamentStyle });
    assert(plan.faces.some(f => f.paths?.length));
    for (const face of plan.faces) for (const p of face.paths ?? []) {
      assert(p.x >= 0 && p.y >= 0 && p.x + p.w <= plan.pageW && p.y + p.h <= plan.pageH);
      assert(!/NaN|Infinity/.test(p.d));
      for (const hit of face.hits.filter(h => h.conceptId)) {
        assert(!(p.x < hit.x + hit.w && p.x + p.w > hit.x
          && p.y < hit.y + hit.h && p.y + p.h > hit.y), `${ornamentStyle} overlaps ${hit.conceptId}`);
      }
    }
  }
});

test('low ink restores plain rules; monochrome ornaments use the ink colour', async () => {
  const low = { ...spec, inkMode: /** @type {const} */ ('low-ink') };
  assert.deepEqual((await buildSheet(ctx, { ...low, ornamentStyle: 'botanical' })).plan,
    (await buildSheet(ctx, low)).plan);
  const mono = await buildSheet(ctx, { ...spec, ornamentStyle: 'language', inkMode: 'mono' });
  assert(mono.plan.faces.flatMap(f => f.paths ?? []).every(p => p.stroke === mono.theme.colors.ink));
});

test('corner flourishes respect empty space, printer edges and phone reservations', () => {
  const empty = { rects: [], runs: [], icons: [], hits: [] };
  const styled = { ...spec, ornamentStyle: /** @type {const} */ ('language') };
  const corners = cornerOrnaments(styled, empty, { insetX: 8.5, insetY: 8.5 }, '#237547');
  assert.equal(corners.length, 4);
  assert(corners.every(p => p.x >= 8.5 && p.y >= 8.5));
  const filled = { ...empty, hits: [{ x: 0, y: 0, w: spec.geometry.pageW, h: spec.geometry.pageH }] };
  assert.equal(cornerOrnaments(styled, filled, { insetX: 0, insetY: 0 }, '#237547').length, 0);
  const phone = { ...styled, geometry: { ...spec.geometry, reserve: { top: 0.2, bottom: 0.1 } } };
  assert(cornerOrnaments(phone, empty, { insetX: 0, insetY: 0 }, '#237547')
    .every(p => p.y >= phone.geometry.pageH * 0.2 && p.y + p.h <= phone.geometry.pageH * 0.9));
});

test('cutting, folding and n-up preserve every ornament', () => {
  const count = (/** @type {import('../core/types.js').LayoutPlan} */ plan) =>
    plan.faces.reduce((n, f) => n + (f.paths?.length ?? 0), 0);
  assert(count(adorned) > 0);
  for (const plan of [splitCards(adorned), foldCards(adorned),
    nUp(adorned, { paperW: 1200, paperH: 800 })]) {
    assert.equal(count(plan), count(adorned));
    for (const p of plan.faces.flatMap(f => f.paths ?? [])) {
      assert(p.x >= 0 && p.x + p.w <= plan.pageW);
    }
  }
});

test('SVG contains real vector paths, and language choices are deterministic', async () => {
  const manifest = JSON.parse(await readFile('data/fonts/manifest.json', 'utf8'));
  const icons = JSON.parse(await readFile('data/icons.json', 'utf8'));
  assert(planToSvg(adorned, { faces: cssFaces(manifest), icons })[0].includes('class="ornament"'));
  assert.equal(motifFor('language', 'qya'), 'botanical');
  assert.equal(motifFor('language', 'tlh'), 'starforge');
  assert.equal(motifFor('language', 'ja'), 'seigaiha');
  assert.throws(() => motifFor(/** @type {any} */ ('typo'), 'en'), /unknown ornament/);
  assert.throws(() => motifFor('language', 'unknown'), /no ornament design/);
});

test('every ready language has distinct rules and corners, with ink inside its box', async () => {
  const rows = parseTable(await readFile('data/registry/languages.csv', 'utf8'));
  const ready = rows.filter(row => row.status === 'ready').map(row => row.bcp47);
  assert.deepEqual(Object.keys(LANGUAGE_MOTIFS).sort(), ready.sort());
  const rules = new Set(), corners = new Set();
  for (const target of ready) {
    const motif = motifFor('language', target);
    assert(motif);
    const cornerMarks = cornerOrnaments({ ...spec, target, ornamentStyle: 'language' },
      { rects: [], runs: [], icons: [], hits: [] }, { insetX: 8, insetY: 8 }, '#123456');
    assert.equal(cornerMarks.length, 4);
    const ruleMarks = [[140, 2], [80, 7], [220, 18], [2, 3]].map(([w, h]) =>
      ornamentRule(motif, 0, 0, w, h, '#123456'));
    rules.add(ruleMarks[0].d);
    corners.add(cornerMarks[0].d);
    for (const mark of [...ruleMarks, ...cornerMarks]) {
      const values = mark.d.match(/-?\d+(?:\.\d+)?/g);
      assert(values, `${target}: empty path`);
      const coordinates = values.map(Number);
      // A Bezier lies inside its control-point hull, so this also bounds curves.
      coordinates.forEach((v, i) => assert(v >= mark.strokeWidth / 2 - 0.001
        && v <= (i % 2 ? mark.h : mark.w) - mark.strokeWidth / 2 + 0.001,
      `${target}: coordinate ${i} outside ornament box (${v})`));
    }
  }
  assert.equal(rules.size, ready.length);
  assert.equal(corners.size, ready.length);
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
    const count = (/** @type {import('../core/types.js').LayoutPlan} */ plan) =>
      plan.faces.reduce((n, face) => n + (face.paths?.length ?? 0), 0);
    assert(count(decorated) > 0, target);
    assert.equal(count(splitCards(decorated)), count(decorated), target);
    assert.equal(count(foldCards(decorated)), count(decorated), target);
  }
});

test('all interface catalogues translate every style choice and help message', async () => {
  const keys = ['format.ornamentStyle', 'ornament.hint', 'ornament.frameHint', 'ornament.lowInk',
    ...ORNAMENT_STYLES.map(style => `ornament.${style}`)];
  for (const code of Object.keys(LANGUAGE_MOTIFS)) {
    const messages = JSON.parse(await readFile(`data/i18n/${code}.json`, 'utf8'));
    for (const key of keys) assert.equal(typeof messages[key], 'string', `${code}: ${key}`);
    assert.equal(new Set(ORNAMENT_STYLES.map(style => messages[`ornament.${style}`])).size,
      ORNAMENT_STYLES.length, `${code}: indistinguishable choices`);
  }
});
