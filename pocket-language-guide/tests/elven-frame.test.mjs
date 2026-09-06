import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet, stacksFor } from '../core/sheet.js';
import { planToSvg } from '../render/svg.js';
import { cssFaces } from '../render/fonts.js';
import { referenceSpec } from '../scripts/spec.mjs';
import { splitCards, foldCards, nUp } from '../render/impose.js';

const ctx = await createSheetContext({ loadText: p => readFile(p, 'utf8'), loadBytes: p => readFile(p) });
const spec = await referenceSpec('qya', 'en');
const classic = (await buildSheet(ctx, spec)).plan;
const styled = { ...spec, ornamentStyle: /** @type {const} */ ('language') };
const ornate = (await buildSheet(ctx, styled)).plan;
const ids = (/** @type {import('../core/types.js').LayoutPlan} */ plan) => plan.faces.flatMap(f => f.hits.filter(h => h.conceptId).map(h => h.conceptId)).sort();
const count = (/** @type {import('../core/types.js').LayoutPlan} */ plan) => plan.faces.reduce((n, f) => n + (f.paths?.length ?? 0), 0);

/** @param {import('../core/types.js').LayoutPlan} plan */
function checkClearance(plan, top = 0, bottom = plan.pageH) {
  for (const face of plan.faces) for (const p of face.paths ?? []) {
    assert(p.x >= 0 && p.y >= top - 0.001 && p.x + p.w <= plan.pageW + 0.001
      && p.y + p.h <= bottom + 0.001, `off page/reservation: ${JSON.stringify(p)}`);
    assert(!/NaN|Infinity/.test(p.d));
    const coordinates = (p.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    coordinates.forEach((v, i) => assert(v >= -0.001 && v <= (i % 2 ? p.h : p.w) + 0.001,
      `path leaves its declared box at coordinate ${i}: ${v}`));
    for (const hit of face.hits.filter(h => h.conceptId)) {
      // Touching edges can differ by floating-point roundoff after imposition.
      assert(!(p.x < hit.x + hit.w - 1e-7 && p.x + p.w > hit.x + 1e-7
        && p.y < hit.y + hit.h - 1e-7 && p.y + p.h > hit.y + 1e-7), `ornament overlaps ${hit.conceptId}`);
    }
  }
}

test('the Quenya frame preserves every entry and reserves real space without changing saved margins', async () => {
  assert.deepEqual(ids(ornate), ids(classic));
  assert.equal(ornate.geometry.marginLeft, classic.geometry.marginLeft);
  assert.equal(ornate.geometry.columnGap, classic.geometry.columnGap);
  assert(ornate.faces[0].hits[0].x > classic.faces[0].hits[0].x);
  assert(ornate.faces[0].hits[0].y > classic.faces[0].hits[0].y);
  assert(ornate.scale >= 0.45, 'auto fitting keeps the existing comfort threshold');
  assert(ornate.faces.length <= classic.faces.length + 2, 'default frame costs at most one face pair');
  assert(count(ornate) > 0);
  for (const run of ornate.faces.flatMap(f => f.runs)) {
    const script = /[\uE000-\uF8FF]/u.test(run.text) ? 'Teng' : 'Latn';
    assert(run.size >= Number(ctx.corpus.scripts[script].min_size_pt) - 0.01,
      `${script} falls below its legibility floor`);
  }
  checkClearance(ornate);
  assert.deepEqual((await buildSheet(ctx, { ...spec, ornamentStyle: 'classic' })).plan, classic);
});

test('Quenya low ink restores Classic layout; monochrome has no coloured ornament', async () => {
  const low = { ...spec, inkMode: /** @type {const} */ ('low-ink') };
  assert.deepEqual((await buildSheet(ctx, { ...low, ornamentStyle: 'language' })).plan,
    (await buildSheet(ctx, low)).plan);
  const mono = await buildSheet(ctx, { ...styled, inkMode: 'mono' });
  assert(mono.plan.faces.flatMap(f => f.paths ?? []).every(p => p.stroke === mono.theme.colors.ink));
  assert(mono.plan.faces.flatMap(f => f.paths ?? []).every(p => !p.fill || p.fill === mono.theme.colors.ink));
});

test('filled foliage and the measured serif headings reach the exported SVG', async () => {
  const manifest = JSON.parse(await readFile('data/fonts/manifest.json', 'utf8'));
  const icons = JSON.parse(await readFile('data/icons.json', 'utf8'));
  const painted = ornate.faces.flatMap(f => f.paths ?? []).filter(p => p.fill);
  assert(painted.length > 0, 'foliage must have real silhouettes');
  assert(painted.every(p => p.d.includes('Z')), 'filled shapes must be closed');
  const svgs = planToSvg(ornate, { faces: cssFaces(manifest), icons });
  assert.equal(svgs.reduce((n, svg) => n + (svg.match(/class="ornament"[^>]+fill="(?!none)[^"]+"/g) ?? []).length, 0), painted.length);
  const stacks = stacksFor(ctx.corpus, styled.target, styled.source, styled.typeface, true);
  const headingRuns = ornate.faces.flatMap(f => f.runs).filter(r => r.fontId.startsWith('latin-serif-'));
  assert(headingRuns.length > 0);
  assert(headingRuns.every(r => r.italic));
  assert(stacks.includes('latin-serif'), 'preview/export CSS must include the measured heading face');
  for (const plan of [splitCards(ornate), foldCards(ornate), nUp(ornate, { paperW: 1200, paperH: 800 })]) {
    assert.deepEqual(plan.faces.flatMap(f => f.paths ?? []).filter(p => p.fill).map(p => p.fill).sort(),
      painted.map(p => p.fill).sort());
  }
});

test('the complete frame survives card cuts, folding and n-up', () => {
  for (const plan of [splitCards(ornate), foldCards(ornate),
    nUp(ornate, { paperW: 1200, paperH: 800 })]) {
    assert.equal(count(plan), count(ornate));
    checkClearance(plan);
  }
});

test('frame adapts to odd columns, narrow gutters, headers and phone reservations', async () => {
  const variants = /** @type {Partial<import('../core/types.js').SheetSpec>[]} */ ([
    { geometry: { ...spec.geometry, columns: 3, columnGap: 0 } },
    { geometry: { ...spec.geometry, pageW: 360, pageH: 504, columns: 2,
      reserve: { top: 0.15, bottom: 0.1 } } },
    { head: { span: 'full', left: ['page'] }, foot: { span: 'full', right: ['pair'] } },
  ]);
  for (const variant of variants) {
    const candidate = { ...styled, ...variant };
    const { plan } = await buildSheet(ctx, candidate);
    const reserve = candidate.geometry.reserve;
    checkClearance(plan, plan.pageH * (reserve?.top ?? 0), plan.pageH * (1 - (reserve?.bottom ?? 0)));
    assert.deepEqual(ids(plan), ids(classic));
    // Odd columns may put vocabulary across the cut; paths themselves must remain cuttable.
    for (const p of plan.faces.flatMap(f => f.paths ?? [])) {
      assert(!(p.x < plan.pageW / 2 && p.x + p.w > plan.pageW / 2));
    }
  }
});
