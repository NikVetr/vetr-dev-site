// The studio: format on the left, faces in the middle, content on the right.
//
// The spec is the single source of truth. Panels report changes as patches and are
// told to sync afterwards, so no control ever has to read a value back out of the
// DOM -- which is how a dragged margin used to get overwritten by a dropdown.

import {
  browserSheetContext, ensureFontCss, loadText, loadLanguages, makeSpec,
  pairFromQuery, readerLanguage, showFatal,
} from './app.js';
import { buildSheet, stacksFor } from '../core/sheet.js';
import { contentBox } from '../core/solve/index.js';
import { proposeBalance } from '../core/solve/weights.js';
import { splitCards } from '../render/impose.js';
import { faceSvgs, exportPdf, exportPng, exportSvg, loadIcons } from './export.js';
import { createFormatPanel } from './format-panel.js';
import { createTree, revealItem } from './content-tree.js';
import { renderFaces, highlight } from './preview.js';
import { exportSheetCsv, importSheetCsv, loadEdits, saveEdits, clearEdits } from './io.js';
import { openQuiz, applyQuiz } from './quiz.js';
import { attachHandles } from './handles.js';
import { createAddTerm } from './add-term.js';

const BANNER_KEY = 'plg.banner-hidden';
const SOLVE_DEBOUNCE_MS = 120;
const THEME_IDS = ['latex-reference', 'cvd-safe'];

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function main() {
  const languages = await loadLanguages();
  const choice = pairFromQuery(new URLSearchParams(location.search), readerLanguage(languages));
  const ctx = await browserSheetContext();
  const presets = JSON.parse(await loadText('data/presets.json'));
  const icons = await loadIcons();
  /** @type {Record<string,any>} */ const themes = {};
  for (const id of THEME_IDS) themes[id] = await ctx.theme(id);

  /** @type {import('../core/types.js').SheetSpec} */
  let spec = makeSpec(ctx, presets, choice);
  let edits = loadEdits(spec.target, spec.source);
  /** @type {number|null} */ let focused = 0;
  // Grid view is either something the reader asked for or a consequence of there
  // being no faces to show. Only the first should survive a re-solve.
  let gridByChoice = false;
  /** @type {import('../core/types.js').LayoutPlan|null} */ let plan = null;
  /** @type {import('../core/types.js').Block[]} */ let blocks = [];
  /** @type {string[]} */ let svgs = [];
  let manifest = /** @type {any} */ (null);
  /** @type {Awaited<ReturnType<typeof buildSheet>>|null} */ let built = null;
  /** @type {ReturnType<typeof createTree>|null} */ let updateTree = null;
  let treeKey = '';
  /** @type {ReturnType<typeof createAddTerm>|null} */ let addTerm = null;
  /** @type {(()=>void)|null} */ let detachHandles = null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let pending;

  function schedule() {
    clearTimeout(pending);
    pending = setTimeout(() => solve().catch(showFatal), SOLVE_DEBOUNCE_MS);
  }

  const format = createFormatPanel({
    root: $('format'),
    spec,
    presets,
    corpus: ctx.corpus,
    languages,
    themes,
    onChange: (patch) => {
      spec = { ...spec, ...patch };
      schedule();
    },
    onCutChange: () => renderCanvas(),
  });

  // --- banner and quiz ----------------------------------------------------

  if (localStorage.getItem(BANNER_KEY) === '1') $('banner').hidden = true;
  $('banner-hide').addEventListener('click', () => {
    $('banner').hidden = true;
    localStorage.setItem(BANNER_KEY, '1');
  });
  $('quiz-open').addEventListener('click', async () => {
    const answers = await openQuiz();
    if (!answers) return;
    spec = applyQuiz(spec, ctx.corpus, answers);
    $('banner').hidden = true;
    schedule();
  });

  // --- solving ------------------------------------------------------------

  async function solve() {
    $('status').dataset.busy = '1';
    // Yield so the busy state paints before the solver takes the main thread.
    await new Promise((r) => setTimeout(r, 0));

    manifest = await ensureFontCss(ctx, spec.target, spec.source);
    built = await buildSheet(ctx, spec, edits);
    const { theme, targetRows, sourceRows } = built;
    blocks = built.blocks;
    plan = built.plan;
    const stacks = stacksFor(ctx.corpus, spec.target, spec.source);
    svgs = plan.faces.length ? faceSvgs({ plan, manifest, icons, stacks, name: 'x' }) : [];
    if (!svgs.length) focused = null;
    else if (focused === null && !gridByChoice) focused = 0;
    else if (focused !== null && focused >= svgs.length) focused = 0;

    $('pair').textContent = `${ctx.corpus.languages[spec.target].exonym_en} to `
      + `${ctx.corpus.languages[spec.source].exonym_en}`;
    $('status').dataset.busy = '0';
    $('status').textContent = plan.faces.length
      ? `${plan.faces.length} faces at ${plan.scale.toFixed(2)}x`
      : 'nothing to lay out';
    $('warnings').replaceChildren(...plan.warnings.map(renderWarning));

    const total = Object.keys(ctx.corpus.concepts).length;
    const shown = blocks.reduce((n, b) => n + (b.rows?.length ?? 0), 0);
    $('counts').textContent = `${shown} of ${total} items`;

    // Rebuilt only when its shape changes -- a term added or removed. Otherwise
    // only checkboxes and counts change, so scroll position and expanded sections
    // survive a re-solve.
    const nextTreeKey = edits.extras.map((e) => e.conceptId).join('|');
    if (!updateTree || nextTreeKey !== treeKey) {
      treeKey = nextTreeKey;
      updateTree = createTree({
        root: $('tree'),
        corpus: ctx.corpus,
        targetRows,
        sourceRows,
        spec,
        theme,
        icons,
        edits,
        onToggle: (patch) => {
          spec = {
            ...spec,
            selection: {
              sections: { ...spec.selection.sections, ...(patch.sections ?? {}) },
              items: { ...spec.selection.items, ...(patch.items ?? {}) },
            },
          };
          schedule();
        },
        onHover: (id) => highlight($('face-area'), id),
      });
    }
    updateTree(spec, blocks);
    // Custom items are written into the same edits an import produces, so a term
    // typed here and a term imported from a CSV behave identically.
    if (!addTerm) {
      addTerm = createAddTerm({
        root: $('add-term'),
        corpus: ctx.corpus,
        spec: () => spec,
        edits: () => edits,
        onAdd: (entry) => {
          edits = { ...edits, extras: [...edits.extras, entry] };
          saveEdits(spec.target, spec.source, edits);
          // A new item is worth nothing if its section is switched off.
          spec = {
            ...spec,
            selection: {
              sections: { ...spec.selection.sections, [entry.sectionId]: true },
              items: { ...spec.selection.items, [entry.conceptId]: true },
            },
          };
          schedule();
        },
      });
    }
    addTerm.sync();
    format.sync(spec);
    renderCanvas();
  }

  /**
   * A warning plus, where the solver found one, a button that actually fixes it.
   * @param {import('../core/types.js').Warning} warning
   */
  function renderWarning(warning) {
    const li = document.createElement('li');
    li.className = warning.severity;
    li.append(document.createTextNode(warning.message));
    if (!warning.fixes?.length) return li;

    const row = document.createElement('div');
    row.className = 'row fixes';
    for (const fix of warning.fixes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fix';
      button.textContent = fix.label;
      button.addEventListener('click', () => {
        spec = { ...spec, ...fix.patch };
        schedule();
      });
      row.append(button);
    }
    li.append(row);
    return li;
  }

  // --- canvas -------------------------------------------------------------

  function renderCanvas() {
    if (!plan) return;
    detachHandles?.();
    detachHandles = null;
    $('canvas-note').textContent = focused === null
      ? 'Click a face to work on it'
      : 'Click a row to find it in the content list';
    renderFaces({
      root: $('face-area'),
      plan,
      svgs,
      focused,
      onFocus: (i) => { focused = i; renderCanvas(); },
      onPick: (id) => revealItem($('tree'), id),
      onHover: (id) => highlight($('face-area'), id),
    });

    const focusedFace = $('face-area').querySelector('.face.focused');
    if (!(focusedFace instanceof HTMLElement)) return;
    detachHandles = attachHandles({
      face: focusedFace,
      spec,
      onCommit: (geometry) => {
        spec = { ...spec, geometry };
        schedule();
      },
    });
  }

  $('grid-toggle').addEventListener('click', () => {
    if (!svgs.length) return;
    gridByChoice = focused !== null;
    focused = gridByChoice ? null : 0;
    renderCanvas();
  });

  // --- content ------------------------------------------------------------

  $('all-on').addEventListener('click', () => {
    spec = { ...spec, selection: { sections: {}, items: {} } };
    schedule();
  });
  $('all-off').addEventListener('click', () => {
    /** @type {Record<string,boolean>} */ const off = {};
    for (const s of ctx.corpus.sections) off[s.section_id] = false;
    spec = { ...spec, selection: { sections: off, items: {} } };
    schedule();
  });

  $('balance').addEventListener('click', () => {
    if (!plan || !built) return;
    if (!plan.faces.length) {
      showDiff({
        adds: [],
        removes: [],
        slack: 0,
        note: 'The sheet does not fit yet, so there is no whitespace to fill. '
          + 'Clear the errors above first.',
      });
      return;
    }
    const box = contentBox(spec.geometry, spec.paper);
    showDiff(proposeBalance({
      corpus: ctx.corpus,
      spec,
      theme: built.theme,
      measurer: ctx.measurer,
      targetRows: built.targetRows,
      sourceRows: built.sourceRows,
      respell: built.respell,
      blocks,
      plan,
      colWidth: box.colWidth,
      colHeight: box.height,
    }));
  });

  /** @param {ReturnType<typeof proposeBalance>} diff */
  function showDiff(diff) {
    const panel = $('diff');
    panel.hidden = false;
    const note = document.createElement('p');
    note.style.margin = '0';
    note.textContent = diff.note;

    const list = document.createElement('ul');
    /** @type {HTMLInputElement[]} */ const boxes = [];
    for (const add of diff.adds) {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = true;
      box.dataset.concept = add.conceptId;
      boxes.push(box);
      const label = document.createElement('label');
      const text = document.createElement('span');
      text.textContent = add.label;
      const why = document.createElement('span');
      why.className = 'why';
      why.textContent = add.reason;
      label.append(box, text, why);
      const li = document.createElement('li');
      li.append(label);
      list.append(li);
    }

    const actions = document.createElement('div');
    actions.className = 'row';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'ghost';
    dismiss.textContent = diff.adds.length ? 'Reject all' : 'Close';
    dismiss.addEventListener('click', () => { panel.hidden = true; });
    actions.append(dismiss);
    if (diff.adds.length) {
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'primary';
      apply.textContent = 'Add the ticked items';
      apply.addEventListener('click', () => {
        /** @type {Record<string,boolean>} */ const items = {};
        for (const box of boxes) {
          if (box.checked && box.dataset.concept) items[box.dataset.concept] = true;
        }
        spec = {
          ...spec,
          selection: { ...spec.selection, items: { ...spec.selection.items, ...items } },
        };
        panel.hidden = true;
        schedule();
      });
      actions.prepend(apply);
    }
    panel.replaceChildren(note, ...(diff.adds.length ? [list] : []), actions);
  }

  // --- export -------------------------------------------------------------

  const name = () => `${ctx.corpus.languages[spec.target].exonym_en
    .toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '')}-pocket-guide`;

  /** Exporting cards is the same plan, cut in half and paired for duplexing. */
  const exportInput = () => {
    if (!plan) throw new Error('nothing solved yet');
    const flip = format.cut();
    const out = flip ? splitCards(plan, { flip }) : plan;
    return {
      plan: out,
      manifest,
      icons,
      name: flip ? `${name()}-cards` : name(),
      stacks: stacksFor(ctx.corpus, spec.target, spec.source),
    };
  };

  $('pdf').addEventListener('click', () => exportPdf(exportInput(), {
    title: `${ctx.corpus.languages[spec.target].exonym_en} pocket guide`,
    language: spec.source,
  }).catch(showFatal));
  $('png').addEventListener('click', () => exportPng(exportInput(), 600).catch(showFatal));
  $('svg').addEventListener('click', () => exportSvg(exportInput()).catch(showFatal));

  $('csv-out').addEventListener('click', () => {
    exportSheetCsv({ corpus: ctx.corpus, blocks, spec, edits, name: name() });
  });
  $('csv-in').addEventListener('click', () => /** @type {HTMLInputElement} */ ($('csv-file')).click());
  $('csv-file').addEventListener('change', async (event) => {
    const file = /** @type {HTMLInputElement} */ (event.target).files?.[0];
    if (!file) return;
    try {
      const result = importSheetCsv(await file.text(), ctx.corpus, edits);
      edits = result.edits;
      saveEdits(spec.target, spec.source, edits);
      alert(`Imported ${result.updated} edits and ${result.added} new items.`
        + (result.problems.length ? `\n\nSkipped:\n${result.problems.slice(0, 8).join('\n')}` : ''));
      schedule();
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      /** @type {HTMLInputElement} */ ($('csv-file')).value = '';
    }
  });

  if (edits.extras.length || Object.keys(edits.overrides).length) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ghost small';
    reset.textContent = 'Discard my edits';
    reset.addEventListener('click', () => {
      clearEdits(spec.target, spec.source);
      edits = loadEdits(spec.target, spec.source);
      schedule();
    });
    $('csv-in').after(reset);
  }

  await solve();
}

main().catch(showFatal);
