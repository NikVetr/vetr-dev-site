// What the quiz keeps on the device: which rows each pair's quiz asks about, and how
// the reader has done.
//
// **The record has the usage record's shape, for the same reasons** (`ui/usage.js`).
// Sparse -- a row is in it once it has been asked -- and richer than any one view of
// it: a tally for each day of the last year and one for all time, so a week, a month,
// a year and all time are all read off the one record. Keyed by pair, because knowing
// the Japanese for "thank you" says nothing about knowing the Korean, and by concept
// inside a pair, because a concept is what a question asks about. A tally is three
// numbers: right, right but for the marks, and missed.
//
// Through `ui/platform/store.js`, and deleted with everything else or by its own reset.

import * as store from './platform/store.js';
import { t } from './i18n.js';
import { askConfirm, el } from './board-menu.js';
import { helpTip } from './dialog.js';
import { WINDOWS, today } from './usage.js';

const RECORD_KEY = 'plg.drill-record';
const PICK_KEY = 'plg.drill';
/** Days of daily tallies kept: the longest window, and one over for its edge. */
const KEPT = 366;
/** How many rows the record names as the ones to practise. */
const TO_PRACTISE = 8;
const SLOT = /** @type {const} */ ({ right: 0, marks: 1, wrong: 2 });

/**
 * @typedef {[number, number, number]} Tally  right, right but for the marks, missed
 * @typedef {{n: Tally, days: Record<string, Tally>,
 *   rows: Record<string, {n: Tally, last: import('./drill.js').Verdict}>}} PairRecord
 * @typedef {{sections: Record<string, boolean>, items: Record<string, boolean>}} Pick
 */

/** @returns {{pairs: Record<string, PairRecord>}} */
function readRecord() {
  try {
    const held = JSON.parse(store.get(RECORD_KEY) ?? '{}');
    return held && typeof held.pairs === 'object' && held.pairs ? held : { pairs: {} };
  } catch {
    // A corrupt record is the same as none, as every personal store here treats it.
    return { pairs: {} };
  }
}

/** The record of one pair, `target__source`, empty where it has none. @param {string} pair @returns {PairRecord} */
export function pairRecord(pair) {
  return readRecord().pairs[pair] ?? { n: [0, 0, 0], days: {}, rows: {} };
}

/**
 * One row graded.
 * @param {string} pair @param {string} conceptId @param {import('./drill.js').Verdict} verdict
 */
export function recordAnswer(pair, conceptId, verdict) {
  const record = readRecord();
  const held = (record.pairs[pair] ??= { n: [0, 0, 0], days: {}, rows: {} });
  const day = today();
  held.n[SLOT[verdict]] += 1;
  (held.days[day] ??= [0, 0, 0])[SLOT[verdict]] += 1;
  for (const d of Object.keys(held.days)) if (day - Number(d) >= KEPT) delete held.days[d];
  const row = (held.rows[conceptId] ??= { n: [0, 0, 0], last: verdict });
  row.n[SLOT[verdict]] += 1;
  row.last = verdict;
  return store.set(RECORD_KEY, JSON.stringify(record));
}

/** A pair's tallies added up over a window of days. @param {PairRecord} record @param {string} window @returns {Tally} */
export function tallyOver(record, window) {
  // All time is its own tally, because the days are kept for a year and no longer.
  if (WINDOWS[window] === Infinity) return record.n;
  const day = today();
  /** @type {Tally} */ const sum = [0, 0, 0];
  for (const [d, tally] of Object.entries(record.days)) {
    if (day - Number(d) >= WINDOWS[window]) continue;
    tally.forEach((n, i) => { sum[i] += n; });
  }
  return sum;
}

/**
 * The rows still worth practising: missed or half-known the last time they were
 * asked, the most often missed first. A row answered right since is off the list,
 * whatever it cost before -- the list is what to work on now, not a history.
 * @param {PairRecord} record
 */
export function toPractise(record) {
  return Object.entries(record.rows)
    .filter(([, row]) => row.last !== 'right')
    .sort(([, a], [, b]) => b.n[2] - a.n[2] || b.n[1] - a.n[1])
    .slice(0, TO_PRACTISE)
    .map(([conceptId, row]) => ({ conceptId, n: row.n }));
}

/** Which rows a pair's quiz asks about, or null before the reader has chosen. @param {string} pair @returns {Pick|null} */
export function loadPick(pair) {
  try {
    return JSON.parse(store.get(`${PICK_KEY}.${pair}`) ?? 'null');
  } catch {
    return null;
  }
}

/** @param {string} pair @param {Pick} pick */
export function savePick(pair, pick) {
  return store.set(`${PICK_KEY}.${pair}`, JSON.stringify(pick));
}

/** Every pair's choice and the whole record, for Delete everything. */
export async function forgetDrill() {
  await Promise.all([RECORD_KEY, ...store.keys(`${PICK_KEY}.`)].map((key) => store.remove(key)));
}

/**
 * The record, drawn: what share of each window's answers were right, the rows to
 * practise, and a reset that asks first.
 * @param {object} config
 * @param {string} config.pair
 * @param {(conceptId: string) => {said: string, lang: string, gloss: string}|null} config.row
 *   a row's words, where the pair still has it
 * @returns {{node: HTMLElement, update: () => void}}
 */
export function recordSection({ pair, row }) {
  const box = el('fieldset', { class: 'speaker-block drill-record' });
  const help = helpTip(t('drill.record.lede'));
  const body = el('div');
  const reset = el('button', { type: 'button', class: 'chip', text: t('drill.record.reset') });
  reset.addEventListener('click', async () => {
    const { ok } = await askConfirm({
      title: t('drill.record.resetTitle'), body: t('drill.record.resetBody'),
      yes: t('usage.resetYes'), no: t('drill.record.resetNo'), close: t('gallery.previewClose'),
    });
    if (!ok) return;
    const record = readRecord();
    delete record.pairs[pair];
    await store.set(RECORD_KEY, JSON.stringify(record));
    update();
  });
  const actions = el('div', { class: 'usage-actions' });
  box.append(el('legend', {}, [t('drill.record.heading'), help.button]), help.tip, body, actions);

  function update() {
    const record = pairRecord(pair);
    const windows = Object.keys(WINDOWS);
    const tallies = windows.map((w) => tallyOver(record, w));
    // Out of the row rather than hidden: the house button rule outranks `[hidden]`.
    actions.replaceChildren(...(Object.keys(record.rows).length ? [reset] : []));
    if (!Object.keys(record.rows).length) {
      body.replaceChildren(el('p', { class: 'speaker-why', text: t('drill.record.none') }));
      return;
    }
    const format = new Intl.NumberFormat();
    // A share as well as the counts: "18 right" means nothing until it is out of something.
    const share = (/** @type {Tally} */ n) => {
      const asked = n[0] + n[1] + n[2];
      return asked ? new Intl.NumberFormat(undefined, { style: 'percent' }).format(n[0] / asked) : '';
    };
    const line = (/** @type {string} */ label, /** @type {(n: Tally) => string} */ cell) => el('tr', {}, [
      el('th', { scope: 'row', text: label }), ...tallies.map((n) => el('td', { text: cell(n) })),
    ]);
    const table = el('table', { class: 'usage-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: t('drill.record.answers') }),
        ...windows.map((w) => el('th', { scope: 'col', text: t(`usage.${w}`) }))])]),
      el('tbody', {}, [
        line(t('drill.record.right'), (n) => format.format(n[0])),
        line(t('drill.record.marks'), (n) => format.format(n[1])),
        line(t('drill.record.wrong'), (n) => format.format(n[2])),
        line(t('drill.record.share'), share),
      ]),
    ]);
    const practise = toPractise(record)
      .map(({ conceptId, n }) => ({ words: row(conceptId), n }))
      .filter(({ words }) => words);
    body.replaceChildren(table, ...(practise.length ? [
      el('h3', { class: 'drill-record-practise', text: t('drill.record.practise') }),
      el('ul', { class: 'drill-practise' }, practise.map(({ words, n }) => el('li', {}, [
        el('span', { class: 'drill-practise-said', lang: words?.lang ?? '', text: words?.said ?? '' }),
        el('span', { class: 'muted', text: words?.gloss ?? '' }),
        el('span', {
          class: 'small muted drill-practise-count',
          text: t('drill.record.missed', { wrong: n[2], asked: n[0] + n[1] + n[2] }),
        }),
      ]))),
    ] : []));
  }
  update();
  return { node: box, update };
}
