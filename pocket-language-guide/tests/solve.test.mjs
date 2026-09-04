import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSheetContext, buildSheet, loadFontsFor } from '../core/sheet.js';
import {
  loadLanguage, loadRespellOverrides, buildBlocks, PRIORITY_STEPS,
} from '../core/pack.js';
import { buildAtoms } from '../core/solve/atoms.js';
import { breakColumns } from '../core/solve/columnbreak.js';
import { distribute } from '../core/solve/justify.js';
import { contentBox, COMFORT, LOOSE_FRACTION } from '../core/solve/index.js';
import { referenceSpec } from '../scripts/spec.mjs';

const ctx = await createSheetContext({
  loadText: (rel) => readFile(rel, 'utf8'),
  loadBytes: (rel) => readFile(rel),
});
const spec = await referenceSpec();
const box = contentBox(spec.geometry, spec.paper);

await loadFontsFor(ctx, spec.target, spec.source);
const theme = await ctx.theme(spec.themeId);
const targetRows = await loadLanguage(ctx.loadText, spec.target, ctx.corpus.groups);
const sourceRows = await loadLanguage(ctx.loadText, spec.source, ctx.corpus.groups);
const respell = await loadRespellOverrides(ctx.loadText, spec.target, spec.source, spec.accent);
const blocks = buildBlocks({ corpus: ctx.corpus, targetRows, sourceRows, respell, spec });
// The spec asks for auto faces, so the resolved count comes back on the plan.
const solved = (await buildSheet(ctx, spec)).plan;
const bins = solved.geometry.faces * solved.geometry.columns;
const atoms = buildAtoms({
  blocks, theme, spec: { ...spec, geometry: solved.geometry }, corpus: ctx.corpus,
  measurer: ctx.measurer, registry: ctx.registry, colWidth: box.colWidth,
  scale: solved.scale, withPaint: true,
});

test('content box reproduces the reference geometry', () => {
  // The reference sheet was printed borderless, with the margins in its own
  // preamble and nothing taken off for a printer's dead zone. That is what these
  // two numbers are: 1.662in columns and the full height between its margins.
  // Asserted against a zero-inset paper rather than whatever the app defaults to,
  // because the default is a safety decision -- it currently keeps 8.5pt clear of
  // the ET-8550's bordered edge -- and this test is about the geometry maths.
  const bare = { ...spec.paper, borderless: true, oversprayPct: 0, nonprintablePt: 0 };
  const reference = contentBox(spec.geometry, bare);
  assert.ok(Math.abs(reference.colWidth - 119.66) < 0.01, `colWidth ${reference.colWidth}`);
  assert.ok(Math.abs(reference.height - 347.76) < 0.01, `height ${reference.height}`);
});

test('the shipped default keeps clear of the printer edge', () => {
  // And the default the app actually renders insets by that dead zone, which is
  // the difference the gallery thumbnails used to get wrong.
  assert.equal(spec.paper.presetId, 'et8550-5x7-photo-bordered');
  assert.ok(spec.paper.nonprintablePt > 0, 'the bordered preset has a dead zone');
  assert.ok(box.height < 347.76, `height ${box.height} should be inset`);
});

test('no heading can be stranded: each is bound to the rows it introduces', () => {
  const headings = atoms.filter((a) => a.kind === 'heading');
  assert.equal(headings.length, blocks.filter((b) => b.kind === 'heading').length);
  atoms.forEach((atom, i) => {
    if (atom.kind !== 'heading' || !atoms[i + 1] || atoms[i + 1].kind === 'heading') return;
    assert.ok(atom.keepWithNext, `heading ${atom.sectionId} is not bound to its rows`);
  });
  // And the breaker honours the binding, so no column ends on a bound atom.
  for (const col of breakColumns(atoms, box.height, bins).columns) {
    const end = col.at(-1);
    if (end === undefined) continue;
    assert.ok(!atoms[end].keepWithNext,
      `column ends at atom ${end} in ${atoms[end].sectionId}, mid keep-with-next`);
  }
});

test('the rows opening a section sit at the same pitch as the rest of it', () => {
  // The binding above used to be a merge: a heading and its first two rows became
  // one atom, so the gaps between them were frozen at their natural size while
  // every later gap in the column stretched to flush the bottom. The first two
  // rows of every section printed measurably tighter than the rest, which is only
  // visible once the paint is placed -- a merge hides it from the atom list
  // entirely, which is why this test reads the finished plan.
  for (const face of solved.faces) {
    /** @type {Map<string, typeof face.hits>} */ const columns = new Map();
    for (const hit of face.hits) {
      if (!hit.conceptId) continue;
      const key = `${hit.x.toFixed(1)}\u0000${hit.sectionId}`;
      columns.set(key, (columns.get(key) ?? []).concat(hit));
    }
    for (const [key, run] of columns) {
      if (run.length < 3) continue;
      const gap = (/** @type {number} */ i) => run[i + 1].y - (run[i].y + run[i].h);
      assert.ok(Math.abs(gap(0) - gap(1)) < 0.6,
        `${key}: opening gap ${gap(0).toFixed(2)}pt against ${gap(1).toFixed(2)}pt`);
    }
  }
});

test('every atom fits a column, and each is placed exactly once', () => {
  const tooTall = atoms.filter((a) => a.height > box.height);
  assert.deepEqual(tooTall, []);
  const broken = breakColumns(atoms, box.height, bins);
  assert.equal(broken.failure, null);
  const placed = broken.columns.flat();
  assert.equal(placed.length, atoms.length);
  assert.ok(placed.every((v, i) => v === i), 'atom order was not preserved');
});

test('no column overflows its height', () => {
  const broken = breakColumns(atoms, box.height, bins);
  broken.columns.forEach((col, i) => {
    const used = col.reduce(
      (sum, k, n) => sum + atoms[k].height + (n ? atoms[k].gapBefore.natural : 0),
      0,
    );
    assert.ok(used <= box.height + 0.01, `column ${i} used ${used} of ${box.height}`);
  });
});

test('at the fitted scale, glue absorbs the slack in all but the last pair', async () => {
  // `split: 'adaptive'` because this is a claim about the *reference* sheet, whose
  // per-row divider search is what leaves the columns flush. The app defaults to a
  // shared divider, which is tidier and packs less densely.
  const { plan } = await buildSheet(ctx, { ...spec, scale: 0, split: 'adaptive' });
  const columns = plan.geometry.columns;
  // Faces come in pairs and the content does not divide evenly into them, so the
  // final pair carries whatever is left over. Every column before it must flush.
  const full = plan.looseness.slice(0, -2 * columns);
  const worst = Math.max(...full, 0);
  assert.ok(worst < 1, `worst unabsorbed slack outside the last pair ${worst.toFixed(2)}pt`);
  // And even there the shortfall stays a small fraction of a column, rather than
  // leaving a visibly empty one.
  const box = contentBox(plan.geometry, spec.paper);
  const tail = Math.max(...plan.looseness.slice(-2 * columns), 0);
  assert.ok(tail < box.height * 0.25, `last pair left ${tail.toFixed(1)}pt unabsorbed`);
});

test('a column too loose to flush is reported rather than quietly left ragged', async () => {
  // Deliberately under-fill, with an eighth of the sections. It was a quarter, and
  // before that a half; each time the sheet learned to absorb more slack the old
  // fraction stopped under-filling and this test started passing without ever
  // exercising the thing it is about. The guard below is what catches that.
  const sections = Object.fromEntries(
    ctx.corpus.sections.filter((_, i) => i % 8).map((s) => [s.section_id, false]),
  );
  const { plan } = await buildSheet(ctx, { ...spec, selection: { sections, items: {} } });
  // Judged against the engine's own threshold rather than a number of our own: a
  // point or two of residue is invisible, and the engine only speaks up past
  // LOOSE_FRACTION of a column. Excluding the trailing columns for the same
  // reason it does -- a sheet's content does not end on a column boundary, so the
  // last column with anything in it is short by nature and not a fault.
  const box = contentBox(plan.geometry, spec.paper);
  const lastUsed = plan.looseness.length - 1
    - [...plan.looseness].reverse().findIndex((r) => r < box.height - 1e-6);
  const loose = plan.looseness
    .filter((r, bin) => bin < lastUsed && r > box.height * LOOSE_FRACTION).length;
  assert.ok(loose > 0, 'this selection was supposed to under-fill');
  assert.ok(plan.warnings.some((w) => w.code === 'loose-columns'),
    `${loose} loose column(s) went unreported`);
});

test('a note in a spaceless script wraps inside its own box', async () => {
  // A note is prose in the reader's language, and its break class was hardcoded
  // to 'space'. Japanese and Chinese have none, so the whole paragraph was a
  // single unbreakable run and painted straight past the right edge of its shaded
  // box. Nothing downstream re-measures a placed run, so it was invisible except
  // on the page -- three translators hit it and wrote around it by hand.
  const conceptId = 'numbers-money.number-and-classifier-notes';
  const pair = { ...spec, target: 'zh-Hans', source: 'ja' };
  const { plan } = await buildSheet(ctx, pair, {
    overrides: {
      [conceptId]: { values: { gloss: '\u6570\u306e\u4f5c\u308a\u65b9'.repeat(40) }, include: true },
    },
    extras: [],
  });
  const box = contentBox(plan.geometry, pair.paper);
  const pitch = box.colWidth + plan.geometry.columnGap;
  /** @param {import('../core/types.js').TextRun} run */
  const overshoot = (run) => {
    const parts = /^(.*)-(\d+)(i?)$/.exec(run.fontId);
    if (!parts) throw new Error(`unparsable face id ${run.fontId}`);
    const width = ctx.measurer.width(run.text, {
      stack: parts[1],
      weight: Number(parts[2]),
      italic: parts[3] === 'i',
      size: run.size,
      leading: run.size,
      dir: run.dir,
      wordBreak: 'space',
      slotAsRule: false,
    });
    const column = Math.round((run.x - box.left) / pitch);
    return run.x + width - (box.left + column * pitch + box.colWidth);
  };
  const runs = plan.faces.flatMap((f) => f.runs);
  assert.ok(runs.length, 'the sheet rendered nothing to check');
  const worst = Math.max(...runs.map(overshoot));
  assert.ok(worst < 0.01, `a run runs ${worst.toFixed(2)}pt past its column`);
});

test('a screen keeps its reserved bands clear of any ink', async () => {
  // A lock screen's operating system draws its clock over the top of the wallpaper
  // and its shortcuts over the bottom, so a sheet meant to be one has to keep those
  // bands empty. They go through the same `max()` as a printer's dead zone, because
  // they are the same thing -- area the sheet may not use -- which is what keeps the
  // breaker, the auto-fit and all three renderers ignorant of them.
  const phone = JSON.parse(await readFile('data/presets.json', 'utf8')).geometry['phone-1col'];
  assert.ok(phone?.screen, 'expected a screen preset to test');
  const reserve = { top: 0.3, bottom: 0.12 };
  const geometry = { ...phone, reserve };

  const box = contentBox(geometry, spec.paper);
  assert.ok(box.top >= geometry.pageH * reserve.top - 0.01, `top ${box.top}`);
  assert.ok(
    geometry.pageH - (box.top + box.height) >= geometry.pageH * reserve.bottom - 0.01,
    `bottom ${geometry.pageH - (box.top + box.height)}`,
  );

  // And it holds through a real solve, which is the claim that matters: no run, no
  // rule and no shaded row may enter either band.
  const { plan } = await buildSheet(ctx, {
    ...spec, geometry, autoFaces: true, scale: 0, priority: 0.95,
  });
  assert.ok(plan.faces.length, 'the top priority step must still fit');
  const limitTop = geometry.pageH * reserve.top;
  const limitBottom = geometry.pageH * (1 - reserve.bottom);
  for (const face of plan.faces) {
    for (const r of face.rects) {
      assert.ok(r.y >= limitTop - 0.01, `a rule starts at ${r.y}, inside the top band`);
      assert.ok(r.y + r.h <= limitBottom + 0.01, `a rule ends at ${r.y + r.h}, inside the bottom band`);
    }
    for (const run of face.runs) {
      assert.ok(run.y > limitTop, `a baseline at ${run.y} is inside the top band`);
      assert.ok(run.y <= limitBottom + 0.01, `a baseline at ${run.y} is inside the bottom band`);
    }
  }
});

test('no field prints below its own script’s legibility floor', async () => {
  // `scripts.csv` sets 4.4pt for Latin and 5.4pt for Arabic, Devanagari and Thai.
  // The respelling column's theme size is 5.22pt, under three of those -- so the
  // interpolation toward the floor had nothing to travel toward and the floor was
  // silently not one. It only mattered once a respelling could reach a non-Latin
  // *reader*, which the generated column now makes possible.
  //
  // The respelling is injected rather than read, because no non-English reader has
  // one on disk yet: without that this test passes by having nothing to check,
  // which is the failure mode three other tests in this file have already had.
  const byStack = Object.fromEntries(Object.values(ctx.corpus.scripts)
    .map((r) => [r.font_stack, Number(r.min_size_pt)]));
  const shown = /** @type {any} */ (['script', 'roman', 'gloss', 'respell', 'numeral']);
  /** @type {Record<string, number>} */ const checked = {};

  for (const [source, sample] of [['ar', 'كيتاب'], ['hi', 'किताब'], ['th', 'หนังสือ']]) {
    const { plan } = await buildSheet(
      ctx,
      { ...spec, source, fieldSet: shown, scale: 0 },
      {
        overrides: Object.fromEntries(Object.keys(ctx.corpus.concepts)
          .map((id) => [id, { values: { respell: sample }, include: true }])),
        extras: [],
      },
    );
    for (const run of plan.faces.flatMap((f) => f.runs)) {
      const stack = Object.keys(byStack).find((s) => run.fontId.startsWith(`${s}-`));
      if (!stack) continue;
      checked[stack] = Math.min(checked[stack] ?? Infinity, run.size);
      assert.ok(run.size >= byStack[stack] - 0.01,
        `a ${stack} run at ${run.size}pt is under its ${byStack[stack]}pt floor`);
    }
  }
  // And it really did see the three scripts whose floor is above the respelling's
  // nominal size, which is the whole point.
  for (const stack of ['arabic', 'deva', 'thai']) {
    assert.ok(stack in checked, `no ${stack} run was checked, so this proves nothing`);
  }
});

test('distribute respects per-gap ceilings and reports what it cannot place', () => {
  const gaps = [
    { natural: 0, stretch: 1, max: 3 },
    { natural: 0, stretch: 1, max: 3 },
  ];
  const easy = distribute(gaps, 4);
  assert.deepEqual(easy.extra, [2, 2]);
  assert.equal(easy.residual, 0);

  const capped = distribute(gaps, 10);
  assert.deepEqual(capped.extra, [3, 3]);
  assert.equal(capped.residual, 4);

  const weighted = distribute([{ natural: 0, stretch: 3, max: 99 }, { natural: 0, stretch: 1, max: 99 }], 8);
  assert.deepEqual(weighted.extra, [6, 2]);
});

test('solving twice gives byte-identical output', async () => {
  const a = await buildSheet(ctx, spec);
  const b = await buildSheet(ctx, spec);
  assert.equal(JSON.stringify(a.plan), JSON.stringify(b.plan));
});

test('auto faces picks the fewest pairs that hold the content legibly', async () => {
  const { plan } = await buildSheet(ctx, spec);
  // Not a fixed number: the corpus grows, and the point of auto is that the count
  // follows the content. What must hold is that it is a whole number of
  // double-sided sheets, that it stopped as soon as the type was comfortable, and
  // that one pair fewer genuinely would not have done.
  assert.equal(plan.faces.length % 2, 0, 'a sheet is two faces, so the count must be even');
  assert.equal(plan.geometry.faces, plan.faces.length);
  assert.ok(plan.scale >= COMFORT, `settled at ${plan.scale}, below comfort`);
  assert.ok(plan.scale <= 1, `auto should not exceed nominal, got ${plan.scale}`);
  const tighter = await buildSheet(ctx, {
    ...spec, autoFaces: false, geometry: { ...spec.geometry, faces: plan.faces.length - 2 },
  });
  assert.ok(tighter.plan.faces.length === 0
      || tighter.plan.scale < COMFORT
      || tighter.plan.warnings.some((w) => w.severity === 'error'),
  `${plan.faces.length - 2} faces would have been comfortable at ${tighter.plan.scale}`);
  assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), []);
});

test('auto-fit never inflates type past the theme\'s own sizes', async () => {
  // Above nominal it is not an improvement, and for a CJK target it wraps entries
  // that fit on one line at the designed size. Leftover room becomes glue instead.
  for (const [target, source] of [['en', 'ja'], ['en', 'zh-Hans'], ['zh-Hans', 'ja']]) {
    const { plan } = await buildSheet(ctx, { ...(await referenceSpec(target, source)), scale: 0 });
    assert.ok(plan.scale <= 1 + 1e-9, `${target} <- ${source} auto-fitted to ${plan.scale}`);
  }
  // An explicit request still gets bigger type than nominal.
  const big = await buildSheet(ctx, { ...spec, scale: 1.3 });
  assert.ok(big.plan.scale > 1, `explicit 1.3x gave ${big.plan.scale}`);
});

test('bigger type means more faces, not a broken sheet', async () => {
  const small = await buildSheet(ctx, { ...spec, scale: 0.9 });
  const large = await buildSheet(ctx, { ...spec, scale: 1.3 });
  assert.ok(large.plan.faces.length > small.plan.faces.length,
    `${large.plan.faces.length} should exceed ${small.plan.faces.length}`);
  for (const plan of [small.plan, large.plan]) {
    assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), []);
    assert.equal(plan.faces.length % 2, 0);
  }
});

test('a fixed face count is honoured rather than overridden', async () => {
  // `autoFaces: false` is the pin; a number in the geometry alone is only the
  // anchor auto starts from, and this test used to assert on that instead -- so it
  // was really asserting where auto happened to land, and broke the moment the
  // default padding changed.
  const { plan } = await buildSheet(ctx, {
    ...spec, autoFaces: false, geometry: { ...spec.geometry, faces: 6 }, scale: 0,
  });
  assert.equal(plan.faces.length, 6);
  assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), []);
});

test('a pinned face count with too little room is reported, not truncated', async () => {
  const cramped = {
    ...spec,
    autoFaces: false,
    geometry: { ...spec.geometry, faces: 2, columns: 2 },
    scale: 0,
  };
  const { plan } = await buildSheet(ctx, cramped);
  const codes = plan.warnings.map((w) => w.code);
  assert.ok(codes.some((c) => c.startsWith('no-fit')) || codes.includes('break-failed'),
    `expected a failure warning, got ${codes.join(', ')}`);
  const fixes = plan.warnings.flatMap((w) => w.fixes ?? []).map((f) => f.label);
  assert.ok(fixes.length > 0, 'a failure should come with something to do about it');
  assert.ok(fixes.some((l) => /page count follow/.test(l)),
    `expected an auto-faces remedy, got ${fixes.join(' | ')}`);
});

test('auto reproduces the hand-built originals at their own spacing', async () => {
  // Both reference sheets settled on four faces by hand, typeset with almost no
  // padding -- consecutive rows held apart by a 0.22pt rule -- which is
  // `padding: 0`. Reproducing that is the acceptance criterion for the engine.
  //
  // The comparison has to be against the *original content*, not against whatever
  // the default sheet currently holds: the corpus went from 413 concepts to 755,
  // so the default legitimately needs six faces now, and asserting four on it
  // would only be measuring the corpus size. The reviewed rows are identifiable by
  // provenance, so the selection is narrowed to exactly the hand-built sheet.
  for (const [target, source] of [['zh-Hans', 'en'], ['ja', 'en'], ['en', 'ja']]) {
    // `split: 'adaptive'` is part of what is being reproduced: the reference's own
    // 27-candidate per-row split search is why four faces are reachable at all, and
    // the app's shared-divider default needs six. That is measured in the divider
    // test below; here the point is that the engine can still hit the original.
    const spec0 = /** @type {import('../core/types.js').SheetSpec} */ ({
      ...(await referenceSpec(target, source)), scale: 0, padding: 0, split: 'adaptive',
    });
    const rows = await loadLanguage(ctx.loadText, target, ctx.corpus.groups);
    /** @type {Record<string, boolean>} */ const items = {};
    let original = 0;
    for (const [cid, row] of Object.entries(rows)) {
      const reviewed = !/agent|expansion/.test(row.provenance ?? '');
      if (reviewed) original += 1;
      else items[cid] = false;
    }
    assert.ok(original > 300, `${target}: only ${original} reviewed rows`);
    const { plan } = await buildSheet(ctx, {
      ...spec0, selection: { sections: {}, items },
    });
    assert.equal(plan.faces.length, 4, `${target} <- ${source}`);
    assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), []);
  }
});

test('asking for more padding costs paper, never legibility', async () => {
  // Given room to breathe, content that no longer fits takes another pair of faces
  // rather than shrinking the type toward its floor. That is the intended trade and
  // the whole reason padding is a control rather than a constant.
  const base = { ...(await referenceSpec('zh-Hans', 'en')), scale: 0 };
  const tight = (await buildSheet(ctx, { ...base, padding: 0 })).plan;
  const roomy = (await buildSheet(ctx, { ...base, padding: 3.6 })).plan;
  assert.ok(roomy.faces.length >= tight.faces.length,
    `padding should never buy fewer faces: ${tight.faces.length} -> ${roomy.faces.length}`);
  assert.ok(roomy.faces.length > tight.faces.length || roomy.scale <= tight.scale,
    'if the face count held, the type must have absorbed the padding');
  assert.ok(roomy.scale >= COMFORT,
    `type fell below comfort at ${roomy.scale} instead of taking paper`);
});

test('each field shrinks toward its own floor, not in lockstep', async () => {
  // The Japanese sheet only fits four faces because its Latin respellings go
  // smaller than its Japanese does -- which a single multiplier cannot express.
  const { plan } = await buildSheet(ctx, { ...(await referenceSpec('ja', 'en')), scale: 0 });
  const sizes = plan.faces.flatMap((f) => f.runs.map((r) => ({ font: r.fontId, size: r.size })));
  const latin = Math.min(...sizes.filter((s) => s.font.startsWith('latin')).map((s) => s.size));
  const japanese = Math.min(...sizes.filter((s) => s.font.startsWith('cjk')).map((s) => s.size));
  assert.ok(latin < japanese, `latin ${latin.toFixed(2)}pt should go below japanese ${japanese.toFixed(2)}pt`);
  assert.ok(latin >= 4.4 - 0.01, `latin ${latin.toFixed(2)}pt below its 4.4pt floor`);
  assert.ok(japanese >= 5.0 - 0.01, `japanese ${japanese.toFixed(2)}pt below its 5.0pt floor`);
});

test('a column with nothing to print says so, and stops once it is filled', async () => {
  // `ipa` is why this exists. The field toggle offers a column the corpus has never
  // held a value for -- 0 of 12,061 rows across all sixteen languages -- so
  // switching it on drew nothing and said nothing, which is the same symptom the
  // three fields that had no template cell at all used to have. The wiring is live:
  // the `entry` template has a cell for it and an imported value renders, so the
  // honest report is about the data, and it has to clear itself when the data
  // arrives.
  //
  // One section, so this measures a sheet rather than the whole corpus.
  /** @type {Record<string, boolean>} */ const only = {};
  for (const s of ctx.corpus.sections) only[s.section_id] = s.section_id === 'social-basics';
  const base = {
    ...(await referenceSpec('ja', 'en')),
    selection: { sections: only, items: {} },
  };
  const withIpa = {
    ...base,
    fieldSet: /** @type {import('../core/types.js').FieldId[]} */ ([...base.fieldSet, 'ipa']),
  };
  /** @param {import('../core/types.js').LayoutPlan} plan */
  const dead = (plan) => plan.warnings
    .filter((w) => w.code === 'empty-column').map((w) => w.params?.field);
  /** @param {import('../core/types.js').LayoutPlan} plan */
  const runs = (plan) => plan.faces.reduce((n, f) => n + f.runs.length, 0);

  const off = (await buildSheet(ctx, base)).plan;
  const on = (await buildSheet(ctx, withIpa)).plan;
  // The default columns all have content, and `numeral` -- which is the gloss cell
  // under another name and rides in the set unconditionally -- is never reported.
  assert.deepEqual(dead(off), []);
  // And `ipa` is not reported either, any more. This test asserted the opposite
  // until `scripts/build_ipa.py` filled the column, and its own comment predicted
  // that: the honest report is about the data, so it has to clear itself when the
  // data arrives. Switching the column on now adds runs rather than nothing.
  assert.deepEqual(dead(on), []);
  assert.ok(runs(on) > runs(off), `${runs(on)} runs with ipa against ${runs(off)} without`);

  // One value, in the shape `ui/io.js` imports one, and the column is alive.
  const ipa = 'koɲ.ɲi.tɕi.wa';
  const filled = await buildSheet(ctx, withIpa, {
    overrides: { 'social-basics.hello': { values: { ipa }, include: true } },
    extras: [],
  });
  assert.deepEqual(dead(filled.plan), []);
  assert.ok(filled.plan.faces.flatMap((f) => f.runs).some((r) => r.text === ipa),
    'an imported IPA value should reach the page');

  // And the warning firing at all, which is the half that actually matters.
  //
  // **Constructed, not found, and that is the point.** This assertion used to name a
  // pair whose reader had no respelling table -- `de <- tr`, then `de <- id`, then
  // `de <- hi` -- and it broke every time one of those tables landed, three times,
  // because the premise was a gap in the data rather than a property of the code.
  // Sixteen of the seventeen readers have a table now and the seventeenth is being
  // written, so there will shortly be no pair in the corpus that satisfies it and
  // repointing it a fourth time is not available.
  //
  // A sheet holding one custom item is the honest construction: an imported term
  // carries whatever fields the person typed, so a term with a script and a gloss and
  // no respelling is exactly the case the warning's own text answers -- "fill it in
  // with the CSV import, or switch the column off". It cannot expire, because nothing
  // about the corpus decides it.
  const one = /** @type {Record<string, boolean>} */ ({});
  for (const s of ctx.corpus.sections) one[s.section_id] = false;
  const noItems = /** @type {Record<string, boolean>} */ ({});
  for (const c of Object.values(ctx.corpus.concepts)) noItems[c.concept_id] = false;
  const custom = await buildSheet(ctx, {
    ...(await referenceSpec('ja', 'en')),
    selection: { sections: { ...one, 'social-basics': true }, items: noItems },
  }, {
    overrides: {},
    extras: [{
      conceptId: 'custom.no-respell',
      sectionId: 'social-basics',
      template: 'entry',
      weight: 1,
      values: { script: 'こんばんは', gloss: 'good evening' },
    }],
  });
  const texts = custom.plan.faces.flatMap((f) => f.runs).map((r) => r.text);
  // Concatenated for the Japanese, because a CJK run breaks between every character
  // -- `scripts.csv` gives Japanese `word_break: any`, so each kana is its own run by
  // the time it is drawn, while the English breaks at its spaces into whole words.
  assert.ok(texts.join('').includes('こんばんは'), 'the custom item should be the sheet');
  assert.ok(texts.includes('good') && texts.includes('evening'), 'with the gloss typed for it');
  // `roman` comes with it: Japanese declares a romanisation system, so the column is
  // applicable, and a typed term has no Hepburn either.
  assert.deepEqual(dead(custom.plan).sort(), ['respell', 'roman']);
});

test('an empty selection reports itself instead of measuring as NaN', async () => {
  /** @type {Record<string, boolean>} */ const off = {};
  for (const s of ctx.corpus.sections) off[s.section_id] = false;
  const { plan } = await buildSheet(ctx, {
    ...spec, selection: { ...spec.selection, sections: off },
  });
  assert.ok(plan.looseness.every(Number.isFinite), `looseness ${plan.looseness}`);
  assert.equal(plan.looseness.length, plan.geometry.faces * plan.geometry.columns);
  assert.ok(plan.warnings.some((w) => w.code === 'nothing-selected'));
});

/**
 * One phone face, pinned. `faces: 1` in the preset is the card's natural count --
 * a screen has no back -- and pinning it is what the claim below is about.
 */
const phoneGeometry = JSON.parse(await readFile('data/presets.json', 'utf8')).geometry['phone-1col'];

/** Concepts a set of blocks actually prints, merged rows counted individually. */
const printed = (/** @type {import('../core/types.js').Block[]} */ list) => new Set(
  list.flatMap((b) => (b.rows ?? []).flatMap((r) => [r.conceptId, ...(r.mergedFrom ?? [])])),
);

test('the top priority step fits one phone face in every language', async () => {
  // This is the whole claim the phone card makes: the highest-priority phrases fit
  // a single image, so a traveller can set them as a lock screen. It has to hold
  // for every language on file, not just the Latin ones -- Devanagari and Thai
  // carry a 1.35 and 1.40 leading factor and a 5.4pt floor where Latin has 4.4.
  //
  // The bar asserted is the comfort threshold rather than the legibility floor,
  // because the step was chosen to fit with room: every language currently settles
  // at nominal size, scale 1.00, which is what you want on something you glance at
  // in an emergency.
  const langs = Object.keys(ctx.corpus.coverage.languages);
  assert.ok(langs.length >= 16, `only ${langs.length} languages have coverage`);
  for (const target of langs) {
    const base = await referenceSpec(target, target === 'en' ? 'es' : 'en');
    const { plan, blocks: kept } = await buildSheet(ctx, {
      ...base,
      geometry: { ...phoneGeometry },
      autoFaces: false,
      scale: 0,
      priority: PRIORITY_STEPS.essential,
    });
    assert.equal(plan.faces.length, 1, `${target} needed ${plan.faces.length} phone faces`);
    assert.deepEqual(plan.warnings.filter((w) => w.severity === 'error'), [],
      `${target} did not fit one phone face`);
    assert.ok(plan.scale >= COMFORT,
      `${target} fitted one phone face only at ${plan.scale.toFixed(2)}, below comfort`);
    assert.ok(printed(kept).size >= 8, `${target} kept only ${printed(kept).size} concepts`);
  }

  // And it is the top of the distribution that fits, not merely a small number:
  // the next cut down -- 0.90, 35 concepts under 12 headings -- overflows one face
  // even with every field pushed to its script's floor. If this ever stops being
  // true the step should move, which is what the failure would be saying.
  const over = await buildSheet(ctx, {
    ...(await referenceSpec('zh-Hans', 'en')),
    geometry: { ...phoneGeometry },
    autoFaces: false,
    scale: 0,
    priority: 0.9,
  });
  assert.ok(over.plan.warnings.some((w) => w.severity === 'error'),
    'a step below 0.95 now fits one phone face; move the step rather than deleting this');
});

test('auto faces follows the card\'s own parity, so a screen can be one face', async () => {
  // Pairs are a fact about paper: a sheet has two sides. The phone card's natural
  // count is one, and auto steps in twos *from the anchor*, so it stays odd there
  // and stays even on paper.
  const phone = await buildSheet(ctx, {
    ...(await referenceSpec('zh-Hans', 'en')),
    geometry: { ...phoneGeometry },
    autoFaces: true,
    scale: 0,
    priority: PRIORITY_STEPS.essential,
  });
  assert.equal(phone.plan.geometry.faces, 1, 'auto should not spend a second wallpaper');
  const paper = await buildSheet(ctx, { ...spec, priority: PRIORITY_STEPS.essential });
  assert.equal(paper.plan.geometry.faces % 2, 0,
    `paper got ${paper.plan.geometry.faces} faces, which has a blank back`);
});

test('a priority step nests, and never leaves a heading over nothing', async () => {
  // Sections are not uniform: `emergency-medical` is dense with high-importance
  // rows and `hike` has none above 0.8, so a global threshold empties whole
  // sections. A heading whose rows have all gone must go with them.
  const steps = [PRIORITY_STEPS.all, PRIORITY_STEPS.wide, PRIORITY_STEPS.core,
    PRIORITY_STEPS.essential];
  /** @type {Set<string>[]} */ const sets = [];
  for (const priority of steps) {
    const kept = buildBlocks({
      corpus: ctx.corpus, targetRows, sourceRows, respell, spec: { ...spec, priority },
    });
    for (const [i, block] of kept.entries()) {
      if (block.kind !== 'heading') continue;
      const under = kept.slice(i + 1).findIndex((b) => b.kind === 'heading');
      const body = kept.slice(i + 1, under < 0 ? undefined : i + 1 + under);
      assert.ok(body.some((b) => b.rows?.length || b.kind === 'note'),
        `at ${priority} the ${block.sectionId} heading prints over nothing`);
      assert.ok(body.every((b) => b.sectionId === block.sectionId),
        `at ${priority} a ${block.sectionId} heading introduces another section`);
    }
    sets.push(printed(kept));
  }
  // Each step is a subset of the one below it, so tightening priority only ever
  // takes phrases away -- an importance floor is nested by construction, and the
  // cluster-decayed score in solve/weights.js would not be.
  for (let i = 1; i < sets.length; i += 1) {
    assert.ok(sets[i].size < sets[i - 1].size,
      `step ${steps[i]} kept ${sets[i].size}, no fewer than ${sets[i - 1].size}`);
    for (const id of sets[i]) {
      assert.ok(sets[i - 1].has(id), `${id} survives ${steps[i]} but not ${steps[i - 1]}`);
    }
  }
});

test('an item ticked by hand outranks the priority floor', async () => {
  // Otherwise the content tree's checkbox is a silent no-op on a trimmed sheet:
  // it states an intent the sheet then ignores, which is precisely the failure the
  // `applies_to` filter used to cause in the balance solver.
  const low = 'shopping.how-much-is-this';
  assert.ok(Number(ctx.corpus.concepts[low].importance) < PRIORITY_STEPS.core,
    `${low} is no longer below the core step; pick another sample`);
  const trimmed = { ...spec, priority: PRIORITY_STEPS.core };
  assert.ok(!printed(buildBlocks({
    corpus: ctx.corpus, targetRows, sourceRows, respell, spec: trimmed,
  })).has(low));
  assert.ok(printed(buildBlocks({
    corpus: ctx.corpus,
    targetRows,
    sourceRows,
    respell,
    spec: { ...trimmed, selection: { ...trimmed.selection, items: { [low]: true } } },
  })).has(low));
});

test('a column with no neighbour centres what the glue could not absorb', async () => {
  // Slack the glue refuses -- opening it further would make a canyon -- is left
  // over, and it has to go somewhere. Against a neighbour it belongs at the
  // bottom: a short column whose first row no longer lines up with the column
  // beside it looks like a mistake rather than like whitespace. Alone it has
  // nothing to line up with.
  //
  // The phone wallpaper is why this matters. At the `essential` priority step the
  // content is a single face and ends about a fifth of the way early, so 71pt sat
  // under the last row -- between a band reserved for the clock above it and one
  // reserved for widgets below, which made the sheet look cut off.
  const presets = JSON.parse(await readFile('data/presets.json', 'utf8'));
  const phone = {
    ...(await referenceSpec('zh-Hans', 'en')),
    geometry: { ...presets.geometry['phone-1col'] },
    priority: PRIORITY_STEPS.essential,
    autoFaces: true,
  };
  const built = await buildSheet(ctx, phone);
  const box = contentBox(phone.geometry, phone.paper);
  assert.equal(built.plan.faces.length, 1, 'the essential step is one wallpaper');
  const ys = built.plan.faces[0].runs.map((r) => r.y);
  const above = Math.min(...ys) - box.top;
  const below = box.top + box.height - Math.max(...ys);
  assert.ok(above > 20, `expected the block to sit off the top, ${above.toFixed(0)}pt`);
  assert.ok(Math.abs(above - below) < 12,
    `expected the leftover split evenly, ${above.toFixed(0)}pt above and ${below.toFixed(0)}pt below`);

  // And the multi-column card is untouched, because there its columns must agree.
  const card = await referenceSpec('zh-Hans', 'en');
  const paper = await buildSheet(ctx, card);
  const cardBox = contentBox(card.geometry, card.paper);
  const firsts = paper.plan.faces[0].runs.map((r) => r.y);
  assert.ok(Math.min(...firsts) - cardBox.top < 8,
    'the reference card still starts its columns at the top of the box');
});

test('the divider is solved once per section unless asked for per row', async () => {
  // Per-row solving lets a long phrase borrow width from a short gloss, and it
  // buys real type size. It also moves the divider between an entry's two halves
  // from row to row inside one section, which is what a reader looking at a
  // section notices -- so the tidier behaviour is a setting.
  //
  // The tidier behaviour *is* the default, and the cost is known rather than
  // hidden: it takes the hand-built Japanese sheet from four faces to six, so the
  // acceptance test above asks for `adaptive` explicitly to keep pinning the
  // original. There is no middle -- sharing the divider except where a row would
  // gain a line recovers 0.50 against 0.50, because the compromise width is itself
  // the cost.
  const base = await referenceSpec('es', 'en');
  const even = await buildSheet(ctx, base);
  const perRow = await buildSheet(ctx, { ...base, split: 'adaptive' });
  assert.equal(even.plan.faces.length, perRow.plan.faces.length,
    'the trade is type size at a fixed face count, not more faces');
  assert.ok(perRow.plan.scale > even.plan.scale + 0.05,
    `per-row should afford visibly more type, got ${perRow.plan.scale} against ${even.plan.scale}`);
});

test('mixed is the default and leaves a reference table as a table', async () => {
  // The setting was already being disobeyed with no way to say so: a reference
  // table is one line of four columns whose point is that its rows line up, so it
  // keeps its own grid whatever is chosen. `mixed` says that rather than implying
  // "One per line" applies to the number tables too.
  const base = await referenceSpec('zh-Hans', 'en');
  assert.equal(base.arrangement, 'mixed');
  const stacked = await buildSheet(ctx, { ...base, arrangement: 'stacked' });
  const mixed = await buildSheet(ctx, base);
  // The number table's rows are four cells on one line in both.
  const wide = (/** @type {import('../core/types.js').LayoutPlan} */ plan) => plan.faces
    .flatMap((f) => f.runs).filter((r) => /^\d+$/.test(r.text)).length;
  assert.ok(wide(mixed.plan) > 0, 'the numerals are on the sheet');
  assert.equal(wide(stacked.plan), wide(mixed.plan),
    'a numeral table has the same cells whatever the arrangement');
});

test('a running head takes its band from the margin, not from the columns', async () => {
  // There was no page furniture at all: no folio, no running head, nothing naming
  // the pair on the paper. The band comes out of `contentBox`, which is the same
  // seam a printer's dead zone and a lock screen's clock go through -- so the
  // breaker, the fit search and all three renderers need no knowledge of it.
  const base = await referenceSpec('zh-Hans', 'en');
  const plain = await buildSheet(ctx, { ...base, head: { at: 'none' } });
  const footed = await buildSheet(ctx, {
    ...base,
    head: { at: 'bottom', left: ['region'], center: ['pair'], right: ['page'] },
  });
  assert.equal(footed.plan.faces.length, plain.plan.faces.length,
    'a line of furniture should not cost a face');

  const runs = footed.plan.faces[0].runs;
  const lowest = Math.max(...runs.map((r) => r.y));
  const foot = runs.filter((r) => Math.abs(r.y - lowest) < 0.5).sort((a, b) => a.x - b.x);
  const said = foot.map((r) => r.text).join('');
  assert.match(said, /police/, 'the region supplies its own emergency line');
  assert.match(said, /Chinese/, 'the middle names the pair');
  assert.match(said, /1 \/ \d+/, 'and the folio counts the faces');

  // The emergency *number* is emphasised and the words around it are not. It is the
  // one thing on the card somebody reads in a hurry, and 5.2pt muted grey is not
  // where you put a number that has to be found.
  const emphasised = foot.filter((r) => r.bold);
  assert.ok(emphasised.length >= 2, 'the emergency line should break out its numbers');
  assert.ok(emphasised.every((r) => /^[\d\s/-]+$/.test(r.text)),
    `only digits take emphasis, got ${emphasised.map((r) => r.text).join('|')}`);
  assert.ok(foot.some((r) => /police/.test(r.text) && !r.bold), 'but not the service word');
  // The folio starts with a digit and is *not* emphasised: emphasis marks the thing
  // a stranger has to find, and a page number is not that.
  assert.ok(foot.some((r) => /^1 \/ \d+$/.test(r.text) && !r.bold));

  // Three positions: outer corners at the edges, and the middle in the middle.
  const box = contentBox(base.geometry, base.paper);
  const mid = box.left + box.width / 2;
  assert.ok(foot[0].x < box.left + box.width * 0.2, 'the region opens at the left edge');
  assert.ok(foot[foot.length - 1].x > mid, 'the folio sits in the right corner');
  assert.ok(foot.some((r) => /Chinese/.test(r.text) && Math.abs(r.x - mid) < box.width * 0.3),
    'and the pair is near the centre line');
});

test('a head position takes several slots, joined with a bullet', async () => {
  // One slot per position was the shape at first, chosen from a `<select>`, so a
  // folio and the pair could not both print and the middle of the band was
  // unreachable. A position is a list now, and the solver joins it.
  const base = await referenceSpec('zh-Hans', 'en');
  const { plan } = await buildSheet(ctx, {
    ...base, head: { at: 'top', left: ['pair', 'page'] },
  });
  const runs = plan.faces[0].runs;
  const highest = Math.min(...runs.map((r) => r.y));
  const band = runs.filter((r) => Math.abs(r.y - highest) < 0.5).sort((a, b) => a.x - b.x);
  const said = band.map((r) => r.text).join('');
  assert.match(said, /Chinese/);
  assert.match(said, /1 \/ \d+/);
  assert.match(said, /\u2022/, 'joined with a bullet');
  // A bare slot is still accepted, so a spec saved before this keeps working.
  const old = await buildSheet(ctx, {
    ...base, head: /** @type {any} */ ({ at: 'top', left: 'page' }),
  });
  const first = old.plan.faces[0].runs;
  const top = Math.min(...first.map((r) => r.y));
  assert.match(first.filter((r) => Math.abs(r.y - top) < 0.5).map((r) => r.text).join(''),
    /1 \/ \d+/, 'a scalar slot reads as a list of one');
});

test('the narrow face is a smaller sheet, not only a different one', async () => {
  // Four typefaces cost nothing new: `stackFor` resolves `<stack>-<typeface>` and
  // falls back per script, and the condensed Latin faces were already subset for
  // the dense reference tables. Narrow earns its place on legibility rather than
  // taste -- it fits more per line, so the same eight faces afford larger type.
  const base = await referenceSpec('zh-Hans', 'en');
  const sans = await buildSheet(ctx, { ...base, typeface: 'sans' });
  const cond = await buildSheet(ctx, { ...base, typeface: 'cond' });
  assert.equal(cond.plan.faces.length, sans.plan.faces.length);
  assert.ok(cond.plan.scale > sans.plan.scale + 0.02,
    `narrow should afford more type, got ${cond.plan.scale} against ${sans.plan.scale}`);
  // And the Han is untouched, which is what the per-script fallback is for.
  const stacks = (/** @type {any} */ plan) => new Set(plan.faces.flatMap(
    (/** @type {any} */ f) => f.runs.map((/** @type {any} */ r) => r.fontId),
  ));
  assert.ok([...stacks(cond.plan)].some((id) => String(id).startsWith('cjk-sc-')));
  assert.ok(![...stacks(cond.plan)].some((id) => String(id) === 'latin-400'),
    'and the Latin is the condensed face throughout');
});
