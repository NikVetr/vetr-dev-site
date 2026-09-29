// How often the reader presses each button, so the Most used screen can put first the
// ones they keep reaching for.
//
// **Sparse, and richer than any one view of it.** A record exists only for a phrase
// that has been pressed -- most never are -- and it keeps, for each listener language
// it was said to, an all-time count and a count for each day of the last year. The
// settings choose a window (a week, a month, a year, all time) and whether to count
// this language only or every language pooled; both are read off the same record, so
// switching loses nothing. Keyed by what was *said* -- a concept, one of the reader's
// own phrases, a beacon -- so a sentence pressed on three screens is one item, shown
// by the button it was last pressed on.
//
// Kept on the device through `ui/platform/store.js`, in the reader's backups, and
// deleted with everything else or by its own reset.

import * as store from './platform/store.js';
import { t } from './i18n.js';
import { askConfirm, el } from './board-menu.js';
import { dialogHead } from './dialog.js';

const KEY = 'plg.usage';
const DAY = 86_400_000;
/** Days of daily counts kept: the longest window, and one over for its edge. */
const KEPT = 366;
/** @type {Record<string, number>} the windows, in days */
export const WINDOWS = { week: 7, month: 30, year: 365, all: Infinity };

/**
 * @typedef {{board:string, node:string, button:string, phrase?:string}} UsedAt  where it
 *   was last pressed; `phrase` when the button was one of the reader's own
 * @typedef {{at: UsedAt, by: Record<string, {n:number, d:Record<string, number>}>,
 *   said?: Record<string, string>}} UsedItem  `said` is its label, by the reader's
 *   language, so the counts can be named without loading the corpus
 * @typedef {{items: Record<string, UsedItem>}} Usage
 */

/** Today, counted in the reader's own days rather than UTC's. */
const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60_000) / DAY);

/** @returns {Usage} */
export function readUsage() {
  try {
    const held = JSON.parse(store.get(KEY) ?? '{}');
    return held && typeof held.items === 'object' && held.items ? held : { items: {} };
  } catch {
    // A corrupt record is the same as none, as every personal store here treats it.
    return { items: {} };
  }
}

/** @param {Usage} usage */
export function writeUsage(usage) {
  return store.set(KEY, JSON.stringify(usage));
}

export function forgetUsage() {
  return store.remove(KEY);
}

/**
 * One press of something said.
 * @param {string} key  what was said: `c:<concept>` (with `:<fill>`), `own:<id>`, `diet`, `beacon:<kind>`
 * @param {UsedAt} at  the button it was pressed on
 * @param {string} lang  the listener's language
 * @param {Record<string, string>} said  its label in the reader's language, by that language
 */
export function recordUse(key, at, lang, said) {
  const usage = readUsage();
  const item = (usage.items[key] ??= { at, by: {} });
  item.at = at;
  item.said = { ...item.said, ...said };
  const day = today();
  const tally = (item.by[lang] ??= { n: 0, d: {} });
  tally.n += 1;
  tally.d[day] = (tally.d[day] ?? 0) + 1;
  for (const d of Object.keys(tally.d)) if (day - Number(d) >= KEPT) delete tally.d[d];
  return writeUsage(usage);
}

/**
 * An item's presses in a window, in one language or -- given none -- all of them.
 * @param {UsedItem} item @param {string} window @param {string|null} lang
 */
export function countOf(item, window, lang) {
  const day = today();
  const span = WINDOWS[window] ?? Infinity;
  let n = 0;
  for (const [code, tally] of Object.entries(item.by)) {
    if (lang && code !== lang) continue;
    if (span === Infinity) { n += tally.n; continue; }
    for (const [d, c] of Object.entries(tally.d)) if (day - Number(d) < span) n += c;
  }
  return n;
}

/** The last day an item was pressed, in one language or any. @param {UsedItem} item @param {string|null} lang */
const lastDay = (item, lang) => Math.max(0, ...Object.entries(item.by)
  .filter(([code]) => !lang || code === lang)
  .flatMap(([, tally]) => Object.keys(tally.d).map(Number)));

/**
 * Everything pressed at all in the window, most first, and the more recent first
 * between two pressed as often.
 * @param {Usage} usage @param {string} window @param {string|null} lang
 * @returns {{key:string, item:UsedItem, count:number}[]}
 */
export function ranked(usage, window, lang) {
  return Object.entries(usage.items)
    .map(([key, item]) => ({ key, item, count: countOf(item, window, lang) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || lastDay(b.item, lang) - lastDay(a.item, lang));
}

/**
 * The settings section: which window to count over, which languages to count, the
 * counts themselves, and a reset that asks first.
 * @param {object} config
 * @param {{usedOver:string, usedPooled:boolean}} config.current
 * @param {(next:{usedOver:string, usedPooled:boolean}) => void} config.onChange
 * @param {string} config.language  the listener language's name, for "this language only"
 * @param {string} config.lang  its code
 * @param {(key:string, item:UsedItem) => string} config.label  what an item says, in the reader's words
 * @param {() => void} config.onReset
 */
export function usageSection({ current, onChange, language, lang, label, onReset }) {
  let held = { ...current };
  const box = el('fieldset', { class: 'speaker-block usage-block' });
  box.append(el('legend', { text: t('boards.mostUsed.title') }), el('p', { class: 'speaker-why', text: t('usage.lede') }));
  /** @param {string} name @param {string} legend @param {[string, string][]} options @param {string} value
   * @param {(value:string) => void} set */
  const radios = (name, legend, options, value, set) => {
    const group = el('div', { class: 'usage-choice', role: 'radiogroup', 'aria-label': legend }, [el('span', { class: 'usage-choice-name', text: legend })]);
    for (const [v, text] of options) {
      const input = /** @type {HTMLInputElement} */ (el('input', { type: 'radio', name, value: v }));
      input.checked = v === value;
      input.addEventListener('change', () => set(v));
      group.append(el('label', { class: 'speaker-option' }, [input, text]));
    }
    return group;
  };
  box.append(
    radios('usage-window', t('usage.window'), Object.keys(WINDOWS).map((w) => [w, t(`usage.${w}`)]), held.usedOver,
      (v) => { held = { ...held, usedOver: v }; onChange(held); }),
    radios('usage-scope', t('usage.scope'), [['one', t('usage.scopeOne', { language })], ['all', t('usage.scopeAll')]],
      held.usedPooled ? 'all' : 'one', (v) => { held = { ...held, usedPooled: v === 'all' }; onChange(held); }),
  );
  const see = el('button', { type: 'button', class: 'chip', text: t('usage.stats') });
  see.addEventListener('click', () => openStats({ lang: held.usedPooled ? null : lang, label }));
  const reset = el('button', { type: 'button', class: 'chip', text: t('usage.reset') });
  reset.addEventListener('click', async () => {
    const { ok } = await askConfirm({
      title: t('usage.resetTitle'), body: t('usage.resetBody'),
      yes: t('usage.resetYes'), no: t('usage.resetNo'), close: t('gallery.previewClose'),
    });
    if (!ok) return;
    await forgetUsage();
    onReset();
  });
  box.append(el('div', { class: 'usage-actions' }, [see, reset]));
  return box;
}

/**
 * The counts, in a dialog of their own: every item pressed, most first by all time,
 * with its week, month and year beside it.
 * @param {{lang:string|null, label:(key:string, item:UsedItem) => string}} config
 */
function openStats({ lang, label }) {
  const usage = readUsage();
  const rows = ranked(usage, 'all', lang);
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'speaker-settings usage-stats', 'aria-label': t('usage.stats') }));
  const windows = Object.keys(WINDOWS);
  const table = el('table', { class: 'usage-table' }, [
    el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: t('usage.button') }),
      ...windows.map((w) => el('th', { scope: 'col', text: t(`usage.${w}`) }))])]),
    el('tbody', {}, rows.map(({ key, item }) => el('tr', {}, [
      el('th', { scope: 'row', text: label(key, item) }),
      ...windows.map((w) => el('td', { text: new Intl.NumberFormat().format(countOf(item, w, lang)) })),
    ]))),
  ]);
  panel.append(
    dialogHead({ title: t('usage.stats'), close: t('gallery.previewClose'), onClose: () => panel.close() }),
    rows.length ? table : el('p', { class: 'speaker-why', text: t('usage.none') }),
  );
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();
}
