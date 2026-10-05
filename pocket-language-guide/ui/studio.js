// The studio: format on the left, faces in the middle, content on the right.
//
// The spec is the single source of truth. Panels report changes as patches and are
// told to sync afterwards, so no control ever has to read a value back out of the
// DOM -- which is how a dragged margin used to get overwritten by a dropdown.

import { openAppearance, wireSiteMenu } from './site-menu.js';
import {
  browserSheetContext, ensureFontCss, loadText, loadLanguages, makeSpec,
  pairFromQuery, readerLanguage, setReaderLanguage, showFatal, afterPaint, withBusy, download,
} from './app.js';
import { buildSheet, stacksFor } from '../core/sheet.js';
import { paperSpec } from '../core/pack.js';
import { contentBox } from '../core/solve/index.js';
import { elvenInset, isElven } from '../core/elven-frame.js';
import { proposeBalance } from '../core/solve/weights.js';
import { foldCards, splitCards } from '../render/impose.js';
import {
  faceSvgs, exportPdf, exportPng, exportSvg, loadIcons,
  showSavedImages, reportExportError,
} from './export.js';
import { createFormatPanel } from './format-panel.js';
import { createTree, revealItem, sectionConcepts } from './content-tree.js';
import { lockScreenSelection } from './chips.js';
import { renderFaces, highlight } from './preview.js';
import { openItemPopup, closeItemPopup } from './item-popup.js';
import {
  exportSheetCsv, importSheetCsv, loadEdits, saveEdits, clearEdits, loadConfig, saveConfig,
} from './io.js';
import { openQuiz, applyQuiz } from './quiz.js';
import { attachHandles } from './handles.js';
import { attachPanelResizers, attachPhoneChrome, revealPanel, widenPanel } from './panels.js';
import { createAddTerm } from './add-term.js';
import { readerSections } from './personal-data.js';
import { createWarnings } from './warnings.js';
import { openSectionFormat } from './section-format.js';
import { savedCardsSection } from './saved-cards.js';
import * as store from './platform/store.js';
import {
  applyStatic, languageName, loadUiLanguage, number, t, uiLanguage,
} from './i18n.js';

const BANNER_KEY = 'plg.banner-hidden';
// A full solve is a few hundred milliseconds of synchronous work, so the debounce
// has to be long enough that working down a list of checkboxes coalesces into one
// solve rather than queueing one per click.
const SOLVE_DEBOUNCE_MS = 260;
const THEME_IDS = ['latex-reference', 'cvd-safe', 'dark', 'parchment'];
/** How much of a phone's column the content list opens to when a lock-screen level is
 * chosen: enough to see which sections lit up and how many of their rows came. */
const LOCK_SHARE = 0.36;

/**
 * An edit the disk refused. The studio has no "saved" message to make a liar of --
 * edits are kept as they are made -- so the console is where this goes; the editor
 * and the portable copy, which do say "saved" and "loaded", await theirs.
 * @param {Error} err
 */
const unsaved = (err) => console.warn('[plg] card edits not saved:', err.message);
/** The same for the card's settings, which are kept as they change for the same reason.
 * @param {Error} err */
const unkept = (err) => console.warn('[plg] card settings not saved:', err.message);

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/**
 * Narrow enough that the three panels are stacked rather than side by side.
 *
 * The same 700px the layout uses. Read per gesture rather than latched, so rotating
 * a phone gets the behaviour that matches what is actually on screen.
 */
const narrow = () => matchMedia('(max-width: 700px)').matches;

/**
 * The plan as it will be printed, for whichever finish is chosen.
 *
 * Both the canvas preview and all three export paths need this and they must agree:
 * a duplex overlay that showed a different imposition from the PDF would be worse
 * than no overlay at all.
 * @param {import('../core/types.js').LayoutPlan} plan
 * @param {{mode:''|'cut'|'fold', flip:'short-edge'|'long-edge'}} finish
 */
function imposed(plan, finish) {
  if (finish.mode === 'cut') return splitCards(plan, { flip: finish.flip });
  if (finish.mode === 'fold') return foldCards(plan, { flip: finish.flip });
  return plan;
}

async function main() {
  const { languages, coverage } = await loadLanguages();
  const choice = pairFromQuery(new URLSearchParams(location.search), readerLanguage(languages, coverage));
  // The interface language is the one the sheet is glossed into -- the reader's
  // own -- so it is loaded before anything is drawn, static markup included.
  await loadUiLanguage(choice.source, loadText);
  applyStatic();
  const ctx = await browserSheetContext();
  // **The reader's own details and their saved copy are in the settings**, as on the
  // boards and the languages -- the same sections, in the same words -- while the one
  // fact about them that changes the card, how they speak, is in the format panel.
  let reader = await readerSections({ corpus: ctx.corpus, reader: choice.source, loadText, save: download });
  // **The settings borrow the warnings while they are open.** The record is parked in
  // the phone's menu, which a desktop never shows, so on a desktop it is handed to the
  // settings dialog -- the bars it flies into -- and taken back when that closes.
  wireSiteMenu(() => {
    const record = $('warnings-menu');
    openAppearance([record, savedCards(), ...reader()]).addEventListener('close', () => $('header-menu').append(record));
  });
  const presets = JSON.parse(await loadText('data/presets.json'));
  const icons = await loadIcons();
  /** @type {Record<string,any>} */ const themes = {};
  for (const id of THEME_IDS) themes[id] = await ctx.theme(id);

  /** @type {import('../core/types.js').SheetSpec} */
  let spec = makeSpec(ctx, presets, choice);
  // **The card comes back as it was left.** Every change below is saved as it is
  // made (`persist`), and a phone closes an app without asking -- so what the studio
  // opens on is the reader's own card for this pair where there is one, over the
  // defaults, which still fill in anything a card saved by an older build lacks.
  const saved = loadConfig(spec.target, spec.source);
  // The paper's facts are the registry's rather than the reader's, so only which paper
  // it was comes back: a printer margin corrected in `paper.csv` reaches a saved card.
  if (saved) {
    spec = {
      ...spec, ...saved.spec, paper: paperSpec(ctx.corpus, (saved.spec.paper ?? spec.paper).presetId),
    };
  }
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
  let pngDpi = saved?.dpi ?? 600;

  let solving = false;
  let dirty = false;

  /**
   * Re-solve soon. Only one solve runs at a time: anything that arrives while one
   * is in flight is folded into a single follow-up, so a burst of toggles cannot
   * pile up a queue of them.
   */
  function schedule() {
    persist();
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

  /**
   * Keep the card as it stands. Every spec change goes through `schedule`, which
   * calls this, and the two settings the panel holds itself call it directly. The
   * pair is left out because the address names it, and the voice because it is the
   * reader's, read afresh by `makeSpec` wherever a card is made.
   */
  function persist() {
    const { target, source, speaker, ...kept } = spec;
    saveConfig(target, source, { spec: kept, finish: format.finish(), dpi: pngDpi }).catch(unkept);
  }

  /** @param {{mode:''|'cut'|'fold', flip:'short-edge'|'long-edge'}} finish */
  const formatConfig = (finish) => ({
    root: $('format'),
    spec,
    presets,
    corpus: ctx.corpus,
    languages,
    themes,
    finish,
    dpi: pngDpi,
    /** @param {Partial<import('../core/types.js').SheetSpec>} patch */
    onChange: async (patch) => {
      marked = null;
      const readerChanged = Boolean(patch.source) && patch.source !== spec.source;
      spec = { ...spec, ...patch };
      // Off a screen there is no lock screen, so what one set aside comes back.
      if (spec.lockScreen && !spec.geometry.screen) {
        const { lockScreen: { kept }, ...rest } = spec;
        spec = { ...rest, selection: kept.selection, autoFaces: kept.autoFaces };
      }
      if (readerChanged) await retranslate();
      schedule();
    },
    /** @param {''|'beginner'|'intermediate'|'advanced'} level */
    onLockScreen: (level) => {
      marked = null;
      spec = lockScreen(level);
      // **The list opens beside the panel the choice was made in**, so the reader can
      // press the other levels and watch which sections light up and how many of
      // their rows came, then go on to change any of them there.
      if (level) {
        widenPanel($('tree'), LOCK_SHARE);
        const first = ctx.corpus.sections.find((section) => spec.selection.sections[section.section_id]);
        $('section-picker').querySelector(`[data-section="${first?.section_id}"]`)
          ?.scrollIntoView({ block: 'center' });
      }
      schedule();
    },
    onFinishChange: () => { persist(); renderCanvas(); },
    /** @param {number} dpi */
    onDpiChange: (dpi) => { pngDpi = dpi; persist(); },
  });
  let format = createFormatPanel(formatConfig(saved?.finish ?? { mode: '', flip: 'short-edge' }));

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
    // **The new pair's edits, not the old pair's.** `edits` is keyed on (target,
    // source) in `localStorage`, and changing the reader used to leave the previous
    // pair's overrides in memory: they showed on the new sheet, and the next save
    // wrote them under the new pair's key -- so correcting an English respelling and
    // then switching to French silently filed that correction against French and
    // could overwrite what was there.
    edits = loadEdits(spec.target, spec.source);
    reader = await readerSections({ corpus: ctx.corpus, reader: spec.source, loadText, save: download });
    format = createFormatPanel(formatConfig(format.finish()));
    updateTree = null;
    addTerm = null;
    // The address names the pair and a reload reads it back from there, so it has to
    // name the pair on screen -- or a reload after changing the reader would open the
    // old pair's saved card instead of this one.
    const url = new URL(location.href);
    url.searchParams.set('source', spec.source);
    history.replaceState(history.state, '', url);
    quizLink();
  }

  /**
   * The screen set up as a lock screen for a level of the language, or -- given no
   * level -- put back as it was before. One face, because a phone has one lock screen,
   * and the level's essentials as the selection (`lockScreenSelection`), out of the
   * rows the content list itself offers. What it replaces is kept on the spec, and a
   * second level keeps the first one's, so Off is always the reader's own card.
   * @param {''|'beginner'|'intermediate'|'advanced'} level
   * @returns {import('../core/types.js').SheetSpec}
   */
  function lockScreen(level) {
    const { lockScreen: held, ...rest } = spec;
    const kept = held?.kept ?? { selection: spec.selection, autoFaces: spec.autoFaces, faces: spec.geometry.faces };
    if (!level) {
      return {
        ...rest, selection: kept.selection, autoFaces: kept.autoFaces,
        geometry: { ...spec.geometry, faces: kept.faces },
      };
    }
    if (!built || !plan) throw new Error('a lock screen is chosen from a solved card, and there is none yet');
    const rows = { corpus: ctx.corpus, spec, targetRows: built.targetRows, sourceRows: built.sourceRows, edits };
    const sections = ctx.corpus.sections.map((section) => ({
      sectionId: section.section_id, title: section.title_en, icon: null, items: sectionConcepts(rows, section),
    }));
    const box = contentBox(spec.geometry, spec.paper, plan.bands, elvenInset(spec));
    return {
      ...rest,
      lockScreen: { level, kept },
      autoFaces: false,
      geometry: { ...spec.geometry, faces: 1 },
      selection: lockScreenSelection({ corpus: ctx.corpus, level, sections, area: box.width * box.height }),
    };
  }

  /**
   * The card as a saved card would keep it: the spec fields that differ from a fresh
   * card of this pair -- the paper as its preset's id, which is all the studio reads
   * back of it -- with the finish, the resolution, the pair's own edits, and what the
   * list says about it, counted off the solve in front of the reader.
   */
  const cardSnapshot = () => {
    if (!plan) throw new Error('a card is saved from a solved sheet, and there is none yet');
    const fresh = /** @type {Record<string, unknown>} */ (makeSpec(ctx, presets, { target: spec.target, source: spec.source }));
    const { target, source, speaker, ...kept } = spec;
    const differs = Object.fromEntries(Object.entries(kept)
      .filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(fresh[key])));
    if (differs.paper) differs.paper = { presetId: spec.paper.presetId };
    const sections = new Set(blocks.filter((b) => b.rows?.length).map((b) => b.sectionId));
    return {
      target, source, spec: differs, finish: format.finish(), dpi: pngDpi,
      ...(edits.extras.length || Object.keys(edits.overrides).length ? { edits } : {}),
      summary: {
        sections: sections.size, items: shownItems(), faces: plan.faces.length,
        width: spec.geometry.pageW, height: spec.geometry.pageH,
      },
    };
  };
  /** @param {string} code */
  const nameOf = (code) => languageName(code, ctx.corpus.languages[code]?.exonym_en ?? code);
  const savedCards = () => savedCardsSection({
    snapshot: cardSnapshot,
    name: t('cards.defaultName', {
      language: nameOf(spec.target),
      date: new Intl.DateTimeFormat(uiLanguage(), { dateStyle: 'medium' }).format(Date.now()),
    }),
    pairName: (target, source) => t('studio.pair', { target: nameOf(target), source: nameOf(source) }),
    known: (code) => Boolean(ctx.corpus.languages[code]),
    save: download,
  });

  // --- banner and quiz ----------------------------------------------------

  const studio = /** @type {HTMLElement} */ (document.querySelector('.studio'));
  attachPanelResizers(studio);
  // The header's overflow menu and the panels' collapse bars, at the stacked width
  // only. See `ui/panels.js` for why both are built rather than written in the
  // markup: the markup is the desktop's, and this is taken down again above 700px.
  attachPhoneChrome(studio, () => [savedCards(), ...reader()]);

  // **The banner does not hide any more, and the stored flag is cleared.** It lives
  // in the header rather than in a bar of its own, so it is one line among the
  // controls and costs nothing to keep -- which removed the reason to hide it from a
  // reader, and then left the reason to hide it from *itself*: answering the quiz set
  // a flag that never cleared, so a reader who answered it once could not reach it
  // again. Re-running it is an obvious thing to want, the questionnaire being the one
  // control that sets several others at once. The key is removed rather than merely
  // ignored, so anyone already carrying it gets the banner back instead of holding a
  // value nothing reads.
  store.remove(BANNER_KEY);
  $('quiz-open').addEventListener('click', async () => {
    const answers = await openQuiz();
    if (!answers) return;
    spec = applyQuiz(spec, ctx.corpus, answers);
    schedule();
  });

  // The quiz is a page of its own for the same pair, which until the reader chooses
  // otherwise asks about the rows this card carries.
  const quizLink = () => {
    /** @type {HTMLAnchorElement} */ ($('drill-open')).href = `drill.html?target=${
      encodeURIComponent(spec.target)}&source=${encodeURIComponent(spec.source)}`;
  };
  quizLink();

  // --- solving ------------------------------------------------------------

  async function solve() {
    $('status').dataset.busy = '1';
    // Yield so the busy state paints before the solver takes the main thread.
    await afterPaint();

    manifest = await ensureFontCss(ctx, spec.target, spec.source, spec.typeface, isElven(spec));
    built = await buildSheet(ctx, spec, edits);
    const { theme, targetRows, sourceRows } = built;
    blocks = built.blocks;
    plan = built.plan;
    const stacks = stacksFor(ctx.corpus, spec.target, spec.source, spec.typeface, isElven(spec));
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
      ? t('studio.status', { faces: plan.faces.length, scale: number(plan.scale, 2) })
      : t('studio.nothingToLayOut');
    showWarnings(plan.warnings);

    const total = Object.keys(ctx.corpus.concepts).length;
    $('counts').textContent = t('studio.counts', { included: shownItems(), total });
    /** @type {HTMLButtonElement} */ ($('reset-formats')).disabled = !Object.keys(spec.sectionFormats ?? {}).length;

    // Rebuilt only when its shape changes -- a term added or removed, or a column
    // switched on. Otherwise only checkboxes and counts change, so scroll position
    // and expanded sections survive a re-solve.
    //
    // `fieldSet` is part of the shape because a tree row carries one cell per shown
    // column and the row editor one input per cell, both built at construction: with
    // only the extras in the key, switching IPA on left the tree with no IPA cell and
    // the editor with no IPA field, and neither ever caught up.
    const nextTreeKey = [spec.fieldSet.join(','), ...edits.extras.map((e) => e.conceptId)]
      .join('|');
    if (!updateTree || nextTreeKey !== treeKey) {
      treeKey = nextTreeKey;
      updateTree = createTree({
        root: $('tree'),
        pickerRoot: $('section-picker'),
        corpus: ctx.corpus,
        sectionTitles: built.sectionTitles,
        targetRows,
        sourceRows,
        spec,
        theme,
        icons,
        edits,
        // An edit lands in `edits.overrides`, the layer the CSV import writes, so it
        // persists across a reload and leaves with an export. `include` is preserved
        // where the row already had one, because switching a row off and correcting
        // its text are separate decisions.
        onEdit: (conceptId, values) => {
          const held = edits.overrides[conceptId];
          edits = {
            ...edits,
            overrides: {
              ...edits.overrides,
              [conceptId]: { values, include: held?.include ?? true },
            },
          };
          saveEdits(spec.target, spec.source, edits).catch(unsaved);
          schedule();
        },
        onToggle: (patch) => {
          marked = null;
          spec = {
            ...spec,
            selection: {
              sections: { ...spec.selection.sections, ...(patch.sections ?? {}) },
              items: { ...spec.selection.items, ...(patch.items ?? {}) },
            },
            sectionColors: { ...spec.sectionColors, ...(patch.sectionColors ?? {}) },
          };
          schedule();
        },
        // Only the keys the section sets apart are kept, and a section that sets none
        // is dropped, so "has its own format" is simply "is in the table".
        onFormat: (sectionId, title) => openSectionFormat({
          title,
          spec,
          format: spec.sectionFormats?.[sectionId] ?? {},
          onChange: (format) => {
            marked = null;
            const { [sectionId]: _, ...rest } = spec.sectionFormats ?? {};
            spec = { ...spec, sectionFormats: Object.keys(format).length ? { ...rest, [sectionId]: format } : rest };
            schedule();
          },
        }),
        onReorder: (sectionId, ids) => {
          marked = null;
          spec = { ...spec, itemOrder: { ...spec.itemOrder, [sectionId]: ids } };
          schedule();
        },
        onHover: (id) => highlight($('face-area'), id),
        // The mirror of the canvas's own `onPick`, which brings a row in the tree
        // into view: a click in the tree brings the row on the *card* into view.
        // Only the focused face carries a hit layer, so a row on another face needs
        // that face focused first -- which the plan can answer and the DOM cannot.
        onPick: (id) => {
          const at = plan?.faces.findIndex(
            (face) => face.hits.some((hit) => hit.conceptId === id),
          ) ?? -1;
          if (at >= 0 && at !== focused) {
            focused = at;
            renderCanvas();
          }
          highlight($('face-area'), id);
        },
      });
    }
    updateTree(spec, blocks, marked);
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
          saveEdits(spec.target, spec.source, edits).catch(unsaved);
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

  const showWarnings = createWarnings({
    menu: $('warnings-menu'),
    list: $('warnings'),
    count: $('warnings-count'),
    buttons: [$('site-menu'), $('header-more')],
    onFix: (fix) => {
      spec = { ...spec, ...fix.patch };
      schedule();
    },
  });

  /**
   * How many items the card carries. Concepts, not rows: two that came out as the same
   * target text share one row, and both are on the card. Counting rows made the number
   * drop when a pack got *better* at collapsing a distinction its language does not make.
   */
  function shownItems() {
    return blocks.reduce((n, b) => n + (b.rows ?? []).reduce(
      (k, r) => k + 1 + (r.mergedFrom?.length ?? 0), 0,
    ), 0);
  }

  // --- canvas -------------------------------------------------------------

  function renderCanvas() {
    if (!plan) return;
    // The popup is anchored to a hit box this is about to replace, so it can no
    // longer be pointing at anything true.
    closeItemPopup();
    detachHandles?.();
    detachHandles = null;

    // With a cut or a fold selected, the canvas shows the imposed sheet rather than a
    // single face: what matters then is what goes on the paper.
    //
    // **Only a cut gets the duplex overlay, and that is not an omission.** The
    // overlay lays each face over the next one, which is exactly right for a cut,
    // where consecutive faces are one card's front and its back. A fold's
    // consecutive faces are the two *sides of one sheet*, and under a short-edge
    // flip the front's left half backs the back's *right* half -- so overlaying them
    // as they come would pair page 4 with page 2 and quietly claim that is what the
    // printer will do. Showing what will be printed, and saying why it is out of
    // order, is the honest answer; checking a fold is a matter of folding one.
    const finish = format.finish();
    if (finish.mode && plan.faces.length) {
      const cards = imposed(plan, finish);
      const sides = faceSvgs({ plan: cards, manifest, icons, stacks: [], name: 'x' });
      renderFaces({
        root: $('face-area'),
        plan: cards,
        svgs: sides,
        focused: null,
        ...(finish.mode === 'cut' ? { duplex: sides } : {}),
        onFocus: () => {},
        onPick: () => {},
        onHover: () => {},
      });
      // Say what the canvas has become. Without this the pages silently reorder,
      // which for a fold is the correct output and looks like a fault.
      const note = document.createElement('p');
      note.className = 'small muted';
      note.textContent = t(finish.mode === 'fold' ? 'studio.foldOrder' : 'studio.duplexChecking');
      $('face-area').prepend(note);
      return;
    }

    renderFaces({
      root: $('face-area'),
      plan,
      svgs,
      focused,
      onFocus: (i) => { focused = i; renderCanvas(); },
      // From the button that leads the thumbnail strip, where "All faces" now lives.
      onGrid: () => {
        if (!svgs.length) return;
        gridByChoice = true;
        focused = null;
        renderCanvas();
      },
      // **On a phone the content list is a screen and a half away, so the row is
      // edited over the card instead.** The three panels stack at this width with
      // the card first, so scrolling to the list -- which is the right answer on a
      // desktop, where both are in front of you -- threw the reader away from the
      // thing they had just tapped. The popup offers the same four decisions the
      // list does for a row, and keeps "show in list" as a way back for the things
      // it does not do.
      onPick: (id, box) => {
        if (!narrow() || !built) { revealItem($('tree'), id); return; }
        const { theme, targetRows, sourceRows, sectionTitles } = built;
        const concept = ctx.corpus.concepts[id];
        const sectionId = concept?.section_id ?? '';
        const section = ctx.corpus.sectionById[sectionId];
        // The solved row carries the generated columns -- respelling, romanisation --
        // which the corpus does not, so the editor opens on what the sheet actually
        // prints. A row the solve dropped falls back to the two authored sides.
        const row = blocks.flatMap((b) => b.rows ?? []).find((r) => r.conceptId === id);
        const values = row
          ? Object.fromEntries(Object.entries(/** @type {any} */ (row.values))
            .filter(([field]) => spec.fieldSet.includes(/** @type {any} */ (field))
              && field !== 'numeral')
            .map(([field, v]) => [field, String(v ?? '')]))
          : {
            script: targetRows[id]?.text ?? '',
            gloss: sourceRows[id]?.text ?? '',
          };
        const role = spec.sectionColors?.[sectionId] ?? section?.color_role ?? '';
        const roles = /** @type {Record<string,string>} */ (theme?.colors?.roles ?? {});
        openItemPopup({
          conceptId: id,
          anchor: box,
          title: values.script || values.gloss || id,
          sectionId,
          sectionTitle: sectionTitles?.[sectionId] || section?.title_en || sectionId,
          itemOn: spec.selection.items[id] !== false
            && spec.selection.sections[sectionId] !== false,
          sectionOn: spec.selection.sections[sectionId] !== false,
          role,
          colours: Object.entries(roles).map(([r, hex]) => ({
            key: r, hex: String(hex), label: t(`colour.${r}`),
          })),
          values,
          target: spec.target,
          source: spec.source,
          onToggle: (patch) => {
            marked = null;
            spec = {
              ...spec,
              selection: {
                sections: { ...spec.selection.sections, ...(patch.sections ?? {}) },
                items: { ...spec.selection.items, ...(patch.items ?? {}) },
              },
              sectionColors: { ...spec.sectionColors, ...(patch.sectionColors ?? {}) },
            };
            schedule();
          },
          onEdit: (conceptId, next) => {
            const held = edits.overrides[conceptId];
            edits = {
              ...edits,
              overrides: {
                ...edits.overrides,
                [conceptId]: { values: next, include: held?.include ?? true },
              },
            };
            saveEdits(spec.target, spec.source, edits).catch(unsaved);
            schedule();
          },
          onReveal: (conceptId) => {
            // The list may be folded into its bar on a phone, in which case
            // scrolling it to the row would move nothing anyone can see.
            revealPanel($('tree'));
            revealItem($('tree'), conceptId);
          },
        });
      },
      onHover: (id) => highlight($('face-area'), id),
    });

    const focusedFace = $('face-area').querySelector('.face.focused');
    if (!(focusedFace instanceof HTMLElement)) return;
    detachHandles = attachHandles({
      face: focusedFace,
      spec,
      bands: plan.bands,
      onCommit: (geometry) => {
        spec = { ...spec, geometry };
        schedule();
      },
    });
  }

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

  // Every section back on the card's own format, in one press.
  $('reset-formats').addEventListener('click', () => {
    marked = null;
    spec = { ...spec, sectionFormats: {} };
    schedule();
  });

  $('balance').addEventListener('click', () => {
    if (!plan || !built) return;
    if (!plan.faces.length) {
      showDiff({
        adds: [],
        removes: [],
        slack: 0,
        note: t('studio.balanceWarnings'),
      });
      return;
    }
    const box = contentBox(spec.geometry, spec.paper, plan.bands, elvenInset(spec));
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

  /**
   * What the last balance changed, until the reader touches anything else.
   *
   * Balancing can move a dozen rows at once and the only feedback was the total
   * changing, so the answer to "what did that do" was to compare two numbers.
   * Cleared on the next interaction, which is what makes it a diff rather than a
   * permanent decoration.
   * @type {Record<string,boolean>|null}
   */
  let marked = null;

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
        //
        // Except the rows the reader ticked themselves. Those are already `true` in
        // the spec, and blanket-clearing the section took them away again: accept one
        // proposal from a hidden section and every item you had picked out of it
        // vanished, which is the opposite of what accepting an addition means.
        for (const sectionId of Object.keys(sections)) {
          if (spec.selection.sections[sectionId] !== false) continue;
          const section = ctx.corpus.sectionById[sectionId];
          for (const concept of ctx.corpus.conceptsByGroup[section.group] ?? []) {
            if (concept.section_id !== sectionId) continue;
            if (items[concept.concept_id]) continue;
            if (spec.selection.items[concept.concept_id]) continue;
            items[concept.concept_id] = false;
          }
        }
        // What balancing did, so the reader can see it rather than infer it from a
        // count. `items` holds both halves already: `true` is a row it added and
        // `false` is one it turned off to stop a whole section arriving with it --
        // which is the surprising half and the one worth colouring.
        marked = items;
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

  /** Exporting cards is the same plan, cut or folded and paired for duplexing. */
  const exportInput = () => {
    if (!plan) throw new Error('nothing solved yet');
    const finish = format.finish();
    return {
      plan: imposed(plan, finish),
      manifest,
      icons,
      name: finish.mode ? `${name()}-${finish.mode === 'fold' ? 'fold' : 'cards'}` : name(),
      stacks: stacksFor(ctx.corpus, spec.target, spec.source, spec.typeface, isElven(spec)),
      present: (/** @type {any[]} */ files, /** @type {string} */ pages) => {
        showSavedImages($('saved-images'), files, pages);
        // They land in the content panel, which on a phone the reader may have
        // folded away -- and then the export would look like it had done nothing.
        revealPanel($('saved-images'));
      },
    };
  };

  /** Nothing-to-export is a sentence; anything else is still fatal. */
  const failed = (/** @type {unknown} */ err) => reportExportError(err, $('status'), showFatal);

  $('pdf').addEventListener('click', () => withBusy($('pdf'), t('common.buildingPdf'), () => exportPdf(
    exportInput(),
    {
      title: t('quick.heading', {
        language: languageName(spec.target, ctx.corpus.languages[spec.target].exonym_en),
      }),
      language: spec.source,
    },
  )).catch(failed));
  $('png').addEventListener('click', () => withBusy($('png'), t('common.rendering'),
    (onProgress) => exportPng({ ...exportInput(), onProgress }, pngDpi)).catch(failed));
  $('svg').addEventListener('click', () => withBusy($('svg'), t('common.buildingSvg'),
    () => exportSvg(exportInput())).catch(failed));

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
      saveEdits(spec.target, spec.source, edits).catch(unsaved);
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
      clearEdits(spec.target, spec.source).catch(unsaved);
      edits = loadEdits(spec.target, spec.source);
      schedule();
    });
    $('csv-in').after(reset);
  }

  await solve();
}

main().catch(showFatal);
