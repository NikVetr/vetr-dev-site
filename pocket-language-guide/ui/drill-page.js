// The quiz, on a page of its own: one pair, the rows the reader chose to be asked
// about, and how they have done.
//
// **The rows are the card's, without the card.** `buildContent` (`core/content.js`) is
// everything the studio does before it solves -- both packs in the reader's voice, the
// respellings, their own terms and corrections, and `buildBlocks`' decision about which
// rows the pair can show -- so what is asked here is what a card would print, and
// nothing is measured or laid out to find it. It runs once, with every section on, and
// the reader's choice is a filter over what it built rather than a second build.

import { openAppearance, wireSiteMenu } from './site-menu.js';
import {
  download, loadLanguages, loadText, makeSpec, pairFromQuery, readerLanguage, registerOffline,
  showFatal,
} from './app.js';
import { defaultSelection, loadCorpus } from '../core/pack.js';
import { buildContent } from '../core/content.js';
import { loadConfig, loadEdits } from './io.js';
import { mountDrill } from './drill.js';
import { loadPick, recordAnswer, recordSection, savePick } from './drill-store.js';
import { readerSections } from './personal-data.js';
import { el } from './board-menu.js';
import { applyStatic, languageName, loadCatalogue, loadUiLanguage, t } from './i18n.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** The quiz's own stores are kept as they change, so a refusal goes to the console. */
const unkept = (/** @type {Error} */ err) => console.warn('[plg] quiz not saved:', err.message);

/** A template's slot as the blank the quiz draws it as. @param {string} text */
const blank = (text) => text.replaceAll('{}', '____');

/** @typedef {import('./drill-store.js').Pick} Pick */
/** @typedef {{sectionId:string, title:string, rows:import('../core/types.js').ItemRow[]}} PickSection */

/**
 * The pair's rows by section, in the card's order, from blocks built with every
 * section on: a heading names its section, and the item blocks after it are its rows.
 * @param {import('../core/types.js').Block[]} blocks @returns {PickSection[]}
 */
function sectionsOf(blocks) {
  /** @type {Map<string, PickSection>} */ const out = new Map();
  for (const block of blocks) {
    if (block.kind === 'heading') out.set(block.sectionId, { sectionId: block.sectionId, title: block.text ?? '', rows: [] });
    else if (block.kind === 'items') out.get(block.sectionId)?.rows.push(...(block.rows ?? []));
  }
  return [...out.values()].filter((section) => section.rows.length);
}

/**
 * What to practise: each section's tick for all of it, and its rows' own ticks under
 * it, in a list folded to one line until it is wanted.
 *
 * The content list's shape (`.tree`), without its colours, formats and editors, which
 * are about the card: here a row is only asked about or not. Checkboxes rather than
 * chips for the reason that list gives -- a row is two languages of text, read rather
 * than scanned -- and a row of a section that is off is unavailable, not merely off.
 * @param {object} config
 * @param {PickSection[]} config.sections
 * @param {{target:string, source:string}} config.pair  for each row's `lang`
 * @param {() => Pick} config.pick
 * @param {(next: Pick) => void} config.onChange
 * @param {() => Pick} config.asOnCard
 */
function rowPicker({ sections, pair, pick, onChange, asOnCard }) {
  /** @param {string} text @param {() => void} run */
  const bulk = (text, run) => {
    const button = el('button', { type: 'button', class: 'ghost', text });
    button.addEventListener('click', run);
    return button;
  };
  const count = el('span', { class: 'muted small drill-pick-count' });
  const lines = sections.map((section) => {
    const box = /** @type {HTMLInputElement} */ (el('input', {
      type: 'checkbox', 'aria-label': t('tree.include', { section: section.title }),
    }));
    box.addEventListener('change', () => onChange({
      ...pick(), sections: { ...pick().sections, [section.sectionId]: box.checked },
    }));
    const tally = el('span', { class: 'count' });
    const items = section.rows.map((row) => {
      const item = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox' }));
      item.addEventListener('change', () => onChange({
        ...pick(), items: { ...pick().items, [row.conceptId]: item.checked },
      }));
      return {
        row,
        box: item,
        node: el('li', {}, [el('label', {}, [
          item,
          el('span', { class: 'cell script', lang: pair.target, text: blank(row.values.script ?? '') }),
          el('span', { class: 'cell gloss', lang: pair.source, text: blank(row.values.gloss ?? '') }),
        ])]),
      };
    });
    return {
      section, box, tally, items,
      node: el('li', {}, [el('details', {}, [
        el('summary', {}, [box, el('span', { text: section.title }), tally]),
        el('ul', { class: 'items' }, items.map((i) => i.node)),
      ])]),
    };
  });
  const node = /** @type {HTMLDetailsElement} */ (el('details', { class: 'drill-pick' }, [
    el('summary', {}, [el('span', { class: 'drill-pick-name', text: t('drill.pick.heading') }), count]),
    el('div', { class: 'row bulk-actions' }, [
      bulk(t('studio.allOn'), () => onChange({ sections: {}, items: {} })),
      bulk(t('studio.allOff'), () => onChange({
        sections: Object.fromEntries(sections.map((s) => [s.sectionId, false])), items: {},
      })),
      bulk(t('drill.pick.card'), () => onChange(asOnCard())),
    ]),
    el('ul', { class: 'tree' }, lines.map((line) => line.node)),
  ]));
  // Open where there is room for it beside nothing else; on a phone it is a screen of
  // its own, and the line that says what is chosen is enough until it is asked for.
  node.open = matchMedia('(min-width: 701px)').matches;

  const sync = () => {
    const now = pick();
    let rows = 0;
    let picked = 0;
    for (const line of lines) {
      const on = now.sections[line.section.sectionId] !== false;
      line.box.checked = on;
      let asked = 0;
      for (const item of line.items) {
        item.box.checked = on && now.items[item.row.conceptId] !== false;
        item.box.disabled = !on;
        if (item.box.checked) asked += 1;
      }
      line.tally.textContent = `${asked}/${line.items.length}`;
      rows += asked;
      if (asked) picked += 1;
    }
    count.textContent = t('drill.pick.count', { rows, sections: picked });
  };
  sync();
  return { node, sync };
}

async function main() {
  const { languages, coverage } = await loadLanguages();
  const choice = pairFromQuery(new URLSearchParams(location.search), readerLanguage(languages, coverage));
  const { target, source } = choice;
  // The interface is the reader's own language, as on every page that names a pair.
  await loadUiLanguage(source, loadText);
  applyStatic();
  const corpus = await loadCorpus(loadText);
  const reader = await readerSections({ corpus, reader: source, loadText, save: download });
  wireSiteMenu(() => openAppearance(reader()));
  const presets = JSON.parse(await loadText('data/presets.json'));
  const pair = `${target}__${source}`;
  const query = `?target=${encodeURIComponent(target)}&source=${encodeURIComponent(source)}`;
  /** @type {HTMLAnchorElement} */ ($('to-card')).href = `customize.html${query}`;
  $('pair').textContent = t('studio.pair', {
    target: languageName(target, corpus.languages[target].exonym_en),
    source: languageName(source, corpus.languages[source].exonym_en),
  });

  // The card's own settings where the reader has one -- its columns, its romanisation,
  // its region's emergency numbers -- with every section on, because which rows are
  // asked about is this page's choice rather than the card's.
  const card = loadConfig(target, source)?.spec;
  /** @type {import('../core/types.js').SheetSpec} */
  const spec = {
    ...makeSpec({ corpus }, presets, choice), ...card,
    target, source, selection: { sections: {}, items: {} }, priority: 0,
  };
  const [{ blocks }, targetCatalogue] = await Promise.all([
    buildContent({ corpus, loadText }, spec, loadEdits(target, source)),
    // Hands-free hears an answer in the target language, and a command said in it.
    loadCatalogue(target, loadText),
  ]);
  const sections = sectionsOf(blocks);
  const rows = new Map(sections.flatMap((s) => s.rows.map((row) => [row.conceptId, row])));

  /**
   * The rows on the card, as a choice: its sections and its ticks, and its priority
   * floor as ticks off -- the floor is a filter `buildBlocks` applies, so a row under it
   * is not on the card whatever its section says.
   * @returns {Pick}
   */
  const asOnCard = () => {
    const selection = card?.selection ?? defaultSelection(corpus);
    const floor = card?.priority ?? 0;
    const items = { ...selection.items };
    for (const row of rows.values()) {
      if (row.weight < floor && items[row.conceptId] !== true) items[row.conceptId] = false;
    }
    return { sections: { ...selection.sections }, items };
  };
  // Until the reader has chosen, the quiz asks about what their card carries.
  let pick = loadPick(pair) ?? asOnCard();
  const asked = () => blocks
    .filter((block) => block.kind === 'items')
    .map((block) => ({
      ...block,
      rows: (block.rows ?? []).filter((row) => pick.sections[block.sectionId] !== false
        && pick.items[row.conceptId] !== false),
    }));

  const picker = rowPicker({
    sections,
    pair: { target, source },
    pick: () => pick,
    asOnCard,
    onChange: (next) => {
      pick = next;
      savePick(pair, pick).catch(unkept);
      picker.sync();
      drill.refresh();
    },
  });
  const record = recordSection({
    pair,
    row: (id) => {
      const row = rows.get(id);
      return row ? { said: blank(row.values.script ?? ''), lang: target, gloss: blank(row.values.gloss ?? '') } : null;
    },
  });
  $('drill-record').append(record.node);
  const drill = mountDrill({
    root: $('drill'),
    blocks: asked,
    corpus,
    spec,
    choose: picker.node,
    targetWords: (key) => targetCatalogue.t(key),
    onAnswer: (conceptId, verdict) => { recordAnswer(pair, conceptId, verdict).catch(unkept); },
    // The record is the setup's and the summary's; a question has the page to itself.
    onPhase: (phase) => {
      $('drill-record').hidden = phase === 'run';
      if (phase !== 'run') record.update();
    },
  });
  registerOffline();
}

main().catch(showFatal);
