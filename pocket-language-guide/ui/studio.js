// The studio: format on the left, faces in the middle, content on the right.
//
// The spec is the single source of truth. Panels report changes as patches and are
// told to sync afterwards, so no control ever has to read a value back out of the
// DOM -- which is how a dragged margin used to get overwritten by a dropdown.

import {
  browserSheetContext, ensureFontCss, loadText, loadLanguages, makeSpec,
  pairFromQuery, readerLanguage, setReaderLanguage, showFatal, afterPaint, withBusy,
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
import { warningText, applyStatic, languageName, loadUiLanguage, t } from './i18n.js';

const BANNER_KEY = 'plg.banner-hidden';
// A full solve is a few hundred milliseconds of synchronous work, so the debounce
// has to be long enough that working down a list of checkboxes coalesces into one
// solve rather than queueing one per click.
const SOLVE_DEBOUNCE_MS = 260;
const THEME_IDS = ['latex-reference', 'cvd-safe'];

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

async function main() {
  const { languages, coverage } = await loadLanguages();
  const choice = pairFromQuery(new URLSearchParams(location.search), readerLanguage(languages, coverage));
  // The interface language is the one the sheet is glossed into -- the reader's
  // own -- so it is loaded before anything is drawn, static markup included.
  await loadUiLanguage(choice.source, loadText);
  applyStatic();
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
  let pngDpi = 600;

  let solving = false;
  let dirty = false;

  /**
   * Re-solve soon. Only one solve runs at a time: anything that arrives while one
   * is in flight is folded into a single follow-up, so a burst of toggles cannot
   * pile up a queue of them.
   */
  function schedule() {
    if (solving) {
      dirty = true;
      return;
    }
    clearTimeout(pending);
    pending = setTimeout(() => {
      solving = true;
      solve()
        .catch(showFatal)
        .finally(() => {
          solving = false;
          if (dirty) {
            dirty = false;
            schedule();
          }
        });
    }, SOLVE_DEBOUNCE_MS);
  }

  const formatConfig = () => ({
    root: $('format'),
    spec,
    presets,
    corpus: ctx.corpus,
    languages,
    themes,
    /** @param {Partial<import('../core/types.js').SheetSpec>} patch */
    onChange: async (patch) => {
      const readerChanged = Boolean(patch.source) && patch.source !== spec.source;
      spec = { ...spec, ...patch };
      if (readerChanged) await retranslate();
      schedule();
    },
    onCutChange: () => renderCanvas(),
    /** @param {number} dpi */
    onDpiChange: (dpi) => { pngDpi = dpi; },
  });
  let format = createFormatPanel(formatConfig());

  /**
   * The language the sheet is glossed into is also the language of the interface,
   * so changing one changes the other.
   *
   * Everything here is built by passing `t(...)` in as a value rather than by
   * marking up a key, which `applyStatic` cannot reach -- so the panels have to be
   * rebuilt rather than re-read. All three already know how: the format panel
   * replaces its root's children, and the tree and the add-term form are created
   * lazily by `solve`, so dropping them is enough to have them built again against
   * the new catalogue. Without this, changing "Glossed into" moved the sheet and
   * the warnings into the new language and left every control label in the old one.
   */
  async function retranslate() {
    setReaderLanguage(spec.source);
    await loadUiLanguage(spec.source, loadText);
    applyStatic();
    format = createFormatPanel(formatConfig());
    updateTree = null;
    addTerm = null;
  }

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
    await afterPaint();

    manifest = await ensureFontCss(ctx, spec.target, spec.source, spec.typeface);
    built = await buildSheet(ctx, spec, edits);
    const { theme, targetRows, sourceRows } = built;
    blocks = built.blocks;
    plan = built.plan;
    const stacks = stacksFor(ctx.corpus, spec.target, spec.source, spec.typeface);
    svgs = plan.faces.length ? faceSvgs({ plan, manifest, icons, stacks, name: 'x' }) : [];
    if (!svgs.length) focused = null;
    else if (focused === null && !gridByChoice) focused = 0;
    else if (focused !== null && focused >= svgs.length) focused = 0;

    // In the reader's own language, not in English. This said "Chinese to German"
    // in a German interface, which is the one place on the page that names both
    // languages and so the most conspicuous place to get it wrong.
    $('pair').textContent = t('studio.pair', {
      target: languageName(spec.target, ctx.corpus.languages[spec.target].exonym_en),
      source: languageName(spec.source, ctx.corpus.languages[spec.source].exonym_en),
    });
    $('status').dataset.busy = '0';
    $('status').textContent = plan.faces.length
      ? t('studio.status', { faces: plan.faces.length, scale: plan.scale.toFixed(2) })
      : t('studio.nothingToLayOut');
    $('warnings').replaceChildren(...plan.warnings.map(renderWarning));

    const total = Object.keys(ctx.corpus.concepts).length;
    // Concepts, not rows: two that came out as the same target text share one row,
    // and both are on the card. Counting rows made the number drop when a pack got
    // *better* at collapsing a distinction its language does not make.
    const shown = blocks.reduce((n, b) => n + (b.rows ?? []).reduce(
      (k, r) => k + 1 + (r.mergedFrom?.length ?? 0), 0,
    ), 0);
    $('counts').textContent = t('studio.counts', { included: shown, total });

    // Rebuilt only when its shape changes -- a term added or removed. Otherwise
    // only checkboxes and counts change, so scroll position and expanded sections
    // survive a re-solve.
    const nextTreeKey = edits.extras.map((e) => e.conceptId).join('|');
    if (!updateTree || nextTreeKey !== treeKey) {
      treeKey = nextTreeKey;
      updateTree = createTree({
        root: $('tree'),
        corpus: ctx.corpus,
        sectionTitles: built.sectionTitles,
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
        sectionTitles: built.sectionTitles,
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
    // The pair's own cells go with it, so the column toggles can draw the words
    // they control rather than a shape standing in for them.
    format.sync(spec, plan.geometry.faces, {
      targetRows: built.targetRows,
      sourceRows: built.sourceRows,
      respell: built.respell,
    });
    renderCanvas();
  }

  /**
   * A warning plus, where the solver found one, a button that actually fixes it.
   * @param {import('../core/types.js').Warning} warning
   */
  function renderWarning(warning) {
    const li = document.createElement('li');
    li.className = warning.severity;
    li.append(document.createTextNode(warningText(warning)));
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

    // With a cut selected, the canvas becomes a duplex check: what matters then is
    // whether front and back pair up, not what a single face looks like.
    const flip = format.cut();
    if (flip && plan.faces.length) {
      const cards = splitCards(plan, { flip });
      const sides = faceSvgs({ plan: cards, manifest, icons, stacks: [], name: 'x' });
      $('canvas-note').textContent = t('studio.duplexChecking');
      renderFaces({
        root: $('face-area'),
        plan: cards,
        svgs: sides,
        focused: null,
        duplex: sides,
        onFocus: () => {},
        onPick: () => {},
        onHover: () => {},
      });
      return;
    }

    // "Click" would now be wrong: both are keyboard actions too.
    $('canvas-note').textContent = focused === null
      ? t('studio.chooseFace')
      : t('studio.chooseRow');
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
        note: t('studio.balanceBlocked'),
      });
      return;
    }
    const box = contentBox(spec.geometry, spec.paper);
    showDiff(proposeBalance({
      corpus: ctx.corpus,
      spec,
      theme: built.theme,
      measurer: ctx.measurer,
      registry: ctx.registry,
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
    dismiss.textContent = diff.adds.length ? t('studio.rejectAll') : t('studio.close');
    dismiss.addEventListener('click', () => { panel.hidden = true; });
    actions.append(dismiss);
    if (diff.adds.length) {
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.className = 'primary';
      apply.textContent = t('studio.addTicked');
      apply.addEventListener('click', () => {
        const taken = new Set(boxes
          .filter((box) => box.checked && box.dataset.concept)
          .map((box) => /** @type {string} */ (box.dataset.concept)));
        /** @type {Record<string,boolean>} */ const items = {};
        /** @type {Record<string,boolean>} */ const sections = {};
        for (const add of diff.adds) {
          if (!taken.has(add.conceptId)) continue;
          items[add.conceptId] = true;
          sections[add.sectionId] = true;
        }
        // Most proposals come from a section the default card hides, and switching a
        // section on brings all of its items with it -- so accepting one row from
        // "With children" would quietly add twelve. Turn the rest of that section
        // off explicitly, leaving only what was ticked.
        for (const sectionId of Object.keys(sections)) {
          if (spec.selection.sections[sectionId] !== false) continue;
          const section = ctx.corpus.sectionById[sectionId];
          for (const concept of ctx.corpus.conceptsByGroup[section.group] ?? []) {
            if (concept.section_id !== sectionId) continue;
            if (!items[concept.concept_id]) items[concept.concept_id] = false;
          }
        }
        spec = {
          ...spec,
          selection: {
            sections: { ...spec.selection.sections, ...sections },
            items: { ...spec.selection.items, ...items },
          },
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
      stacks: stacksFor(ctx.corpus, spec.target, spec.source, spec.typeface),
    };
  };

  $('pdf').addEventListener('click', () => withBusy($('pdf'), t('common.buildingPdf'), () => exportPdf(
    exportInput(),
    {
      title: t('quick.heading', {
        language: languageName(spec.target, ctx.corpus.languages[spec.target].exonym_en),
      }),
      language: spec.source,
    },
  )).catch(showFatal));
  $('png').addEventListener('click', () => withBusy($('png'), t('common.rendering'),
    (onProgress) => exportPng({ ...exportInput(), onProgress }, pngDpi)).catch(showFatal));
  $('svg').addEventListener('click', () => withBusy($('svg'), t('common.buildingSvg'),
    () => exportSvg(exportInput())).catch(showFatal));

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
      const skipped = result.problems.length
        ? t('studio.importSkipped', { problems: result.problems.slice(0, 8).join('\n') })
        : '';
      alert(t('studio.imported', { updated: result.updated, added: result.added, skipped }));
      schedule();
    } catch (err) {
      alert(t('studio.importFailed', {
        reason: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      /** @type {HTMLInputElement} */ ($('csv-file')).value = '';
    }
  });

  if (edits.extras.length || Object.keys(edits.overrides).length) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ghost small';
    reset.textContent = t('studio.discardEdits');
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
