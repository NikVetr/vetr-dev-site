// The studio: format on the left, faces in the middle, content on the right.

import {
  browserSheetContext, ensureFontCss, loadText, loadLanguages, makeSpec,
  pairFromQuery, readerLanguage, showFatal,
} from './app.js';
import { buildSheet, stacksFor } from '../core/sheet.js';
import { faceSvgs, exportPdf, exportPng, exportSvg, loadIcons } from './export.js';
import { proposeBalance } from '../core/solve/weights.js';
import { contentBox } from '../core/solve/index.js';
import { splitCards } from '../render/impose.js';
import { openQuiz, applyQuiz } from './quiz.js';
import { attachHandles } from './handles.js';
import { createTree, revealItem } from './content-tree.js';
import { renderFaces, highlight } from './preview.js';
import { exportSheetCsv, importSheetCsv, loadEdits, saveEdits, clearEdits } from './io.js';

const BANNER_KEY = 'plg.banner-hidden';
const SOLVE_DEBOUNCE_MS = 120;

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const sel = (/** @type {string} */ id) => /** @type {HTMLSelectElement} */ ($(id));

async function main() {
  const languages = await loadLanguages();
  const choice = pairFromQuery(new URLSearchParams(location.search), readerLanguage(languages));
  const ctx = await browserSheetContext();
  const presets = JSON.parse(await loadText('data/presets.json'));
  const icons = await loadIcons();

  /** @type {import('../core/types.js').SheetSpec} */
  let spec = makeSpec(ctx, presets, choice);
  let edits = loadEdits(spec.target, spec.source);
  /** @type {number|null} */ let focused = 0;
  /** @type {import('../core/types.js').LayoutPlan|null} */ let plan = null;
  /** @type {import('../core/types.js').Block[]} */ let blocks = [];
  /** @type {string[]} */ let svgs = [];
  let manifest = /** @type {any} */ (null);
  /** @type {Awaited<ReturnType<typeof buildSheet>>|null} */ let built = null;
  /** @type {ReturnType<typeof createTree>|null} */ let updateTree = null;
  /** @type {ReturnType<typeof setTimeout>|undefined} */ let pending;

  // --- static controls ----------------------------------------------------

  for (const [id, g] of Object.entries(presets.geometry)) {
    sel('geometry').append(new Option(/** @type {any} */ (g).name, id));
  }
  for (const p of Object.values(ctx.corpus.paper)) {
    sel('paper').append(new Option(p.name, p.preset_id));
  }
  for (const l of languages.filter((x) => x.status !== 'planned' && x.bcp47 !== spec.target)) {
    sel('source').append(new Option(`${l.endonym} (${l.exonym_en})`, l.bcp47));
  }
  const systems = (ctx.corpus.languages[spec.target].romanizations || '').split(';').filter(Boolean);
  for (const s of systems) sel('romanization').append(new Option(s, s));
  if (!systems.length) {
    sel('romanization').append(new Option('none', ''));
    sel('romanization').disabled = true;
  }

  const FIELD_LABELS = {
    script: 'Target script',
    script_alt: 'Alternate script',
    roman: 'Romanisation',
    ipa: 'IPA',
    gloss: 'Your language',
    respell: 'Say-it-like',
    literal: 'Literal meaning',
  };
  $('fields').replaceChildren(...Object.entries(FIELD_LABELS).map(([field, label]) => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.field = field;
    box.checked = spec.fieldSet.includes(/** @type {any} */ (field));
    box.addEventListener('change', () => {
      const next = new Set(spec.fieldSet);
      if (box.checked) next.add(/** @type {any} */ (field));
      else next.delete(/** @type {any} */ (field));
      // `numeral` rides with the gloss: it is the same source-language cell.
      spec = { ...spec, fieldSet: [.../** @type {any} */ (next), 'numeral'] };
      schedule();
    });
    const wrap = document.createElement('label');
    wrap.className = 'small';
    wrap.style.display = 'flex';
    wrap.style.gap = '.4em';
    wrap.append(box, document.createTextNode(label));
    return wrap;
  }));

  sel('geometry').value = choice.geometry ?? 'card-7x5-4col';
  sel('paper').value = spec.paper.presetId;
  sel('source').value = spec.source;
  sel('romanization').value = spec.romanization;
  sel('theme').value = spec.themeId;
  /** @type {HTMLInputElement} */ ($('faces')).value = String(spec.geometry.faces);

  if (localStorage.getItem(BANNER_KEY) === '1') $('banner').hidden = true;
  $('banner-hide').addEventListener('click', () => {
    $('banner').hidden = true;
    localStorage.setItem(BANNER_KEY, '1');
  });
  $('quiz-open').addEventListener('click', async () => {
    const answers = await openQuiz();
    if (!answers) return;
    spec = applyQuiz(spec, ctx.corpus, answers);
    // Reflect the answers in the controls the reader can still adjust.
    sel('scale').value = String(spec.scale);
    for (const box of $('fields').querySelectorAll('input[type=checkbox]')) {
      if (box instanceof HTMLInputElement && box.dataset.field) {
        box.checked = spec.fieldSet.includes(/** @type {any} */ (box.dataset.field));
      }
    }
    $('banner').hidden = true;
    schedule();
  });

  // --- solving ------------------------------------------------------------

  let appliedPreset = choice.geometry ?? 'card-7x5-4col';

  /**
   * Fold the control values into the spec. Geometry is only taken from the preset
   * when the preset itself changed -- otherwise margins and the column gap are
   * whatever the reader last dragged them to, and re-reading the preset on every
   * solve would silently undo that.
   */
  function readControls() {
    const presetId = sel('geometry').value;
    const changedPreset = presetId !== appliedPreset;
    appliedPreset = presetId;
    const base = changedPreset ? presets.geometry[presetId] : spec.geometry;
    return {
      ...spec,
      source: sel('source').value,
      romanization: sel('romanization').value,
      themeId: sel('theme').value,
      inkMode: /** @type {any} */ (sel('ink').value),
      scale: Number(sel('scale').value),
      geometry: {
        ...base,
        faces: Math.max(1, Number(/** @type {HTMLInputElement} */ ($('faces')).value) || base.faces),
      },
      paper: makeSpec(ctx, presets, { ...choice, paper: sel('paper').value }).paper,
    };
  }

  async function solve() {
    spec = readControls();
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
    if (focused !== null && focused >= svgs.length) focused = svgs.length ? 0 : null;

    $('pair').textContent = `${ctx.corpus.languages[spec.target].exonym_en} → `
      + `${ctx.corpus.languages[spec.source].exonym_en}`;
    $('status').dataset.busy = '0';
    $('status').textContent = plan.faces.length
      ? `${plan.faces.length} faces · ${plan.scale.toFixed(2)}×`
      : 'nothing to lay out';
    $('canvas-note').textContent = focused === null
      ? 'Click a face to work on it'
      : 'Click a row to find it in the content list';

    $('warnings').replaceChildren(...plan.warnings.map((w) => {
      const li = document.createElement('li');
      li.className = w.severity;
      li.textContent = w.message;
      return li;
    }));

    const total = Object.keys(ctx.corpus.concepts).length;
    const shown = blocks.reduce((n, b) => n + (b.rows?.length ?? 0), 0);
    $('counts').textContent = `${shown} of ${total} items`;

    // Built once; afterwards only the checkboxes and counts change, so scroll
    // position and expanded sections survive a re-solve.
    if (!updateTree) {
      updateTree = createTree({
        root: $('tree'), corpus: ctx.corpus, targetRows, sourceRows, spec, theme,
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
    renderCanvas();
  }

  /** @type {(()=>void)|null} */ let detachHandles = null;

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
    addHandles();
  }

  /** Margin and gap bars, on the focused face only. */
  function addHandles() {
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

  function schedule() {
    clearTimeout(pending);
    pending = setTimeout(() => solve().catch(showFatal), SOLVE_DEBOUNCE_MS);
  }

  // --- wiring -------------------------------------------------------------

  sel('geometry').addEventListener('change', () => {
    const preset = presets.geometry[sel('geometry').value];
    /** @type {HTMLInputElement} */ ($('faces')).value = String(preset.faces);
    schedule();
  });
  for (const id of ['paper', 'source', 'romanization', 'theme', 'ink', 'scale', 'faces']) {
    $(id).addEventListener('change', schedule);
  }
  $('grid-toggle').addEventListener('click', () => {
    focused = focused === null ? 0 : null;
    renderCanvas();
  });
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

  const name = () => `${ctx.corpus.languages[spec.target].exonym_en
    .toLowerCase().replace(/\W+/g, '-').replace(/^-|-$/g, '')}-pocket-guide`;

  /** Exporting cards is the same plan, cut in half and paired for duplexing. */
  const input = () => {
    if (!plan) throw new Error('nothing solved yet');
    const flip = /** @type {any} */ (sel('flip').value);
    const out = flip ? splitCards(plan, { flip }) : plan;
    return {
      plan: out,
      manifest,
      icons,
      name: flip ? `${name()}-cards` : name(),
      stacks: stacksFor(ctx.corpus, spec.target, spec.source),
    };
  };

  const FLIP_NOTES = {
    '': 'Four 7×5in faces. Print double-sided on two sheets.',
    'short-edge': 'Eight 3½×5in sides in card order. Cut each sheet down the middle '
      + 'and you have four double-sided cards.',
    'long-edge': 'Same eight sides, but each back is pre-rotated so it comes out '
      + 'upright when your printer flips top-over-bottom.',
  };
  const flipNote = () => {
    $('flip-note').textContent = FLIP_NOTES[/** @type {'' } */ (sel('flip').value)] ?? '';
  };
  sel('flip').addEventListener('change', flipNote);
  flipNote();

  // --- balance proposals --------------------------------------------------

  $('balance').addEventListener('click', () => {
    if (!plan || !built) return;
    const box = contentBox(spec.geometry, spec.paper);
    const diff = proposeBalance({
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
    });
    showDiff(diff);
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
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.gap = '.4em';
      label.style.alignItems = 'baseline';
      const text = document.createElement('span');
      text.textContent = add.label;
      const why = document.createElement('span');
      why.className = 'why';
      why.textContent = add.reason;
      label.append(box, text, why);
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
  $('pdf').addEventListener('click', () => exportPdf(input(), {
    title: `${ctx.corpus.languages[spec.target].exonym_en} pocket guide`, language: spec.source,
  }).catch(showFatal));
  $('png').addEventListener('click', () => exportPng(input(), 600).catch(showFatal));
  $('svg').addEventListener('click', () => exportSvg(input()).catch(showFatal));

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
