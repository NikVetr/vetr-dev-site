// Quiz mode: drill the card that has just been built.
//
// The sheet is a printed artifact and this is its screen counterpart -- the same
// content, drilled instead of typeset. Three question shapes over the rows that are
// on the card, with the reader choosing which columns the question hands them and
// which they have to supply.
//
// **It reads the solved `blocks`, not `spec.selection`.** Those differ, and the
// difference is the whole point: `buildBlocks` is where `applies_to`, the priority
// floor, an `include: false` override and the existence of a row on *both* sides are
// decided, and a row the reader ticked that could not render is not on the card. The
// raw selection would ask about the Japanese yen on a Spanish sheet, which is exactly
// the defect `core/solve/weights.js` had before it learned to apply the same filters.
// It also gets `mergeIdenticalRows` for free: where Spanish answers two concepts with
// `Buenos días`, the card carries one row with both glosses in it, and so does the
// quiz.
//
// `ui/quiz.js` is the onboarding questionnaire -- "Too many options? Help me decide."
// -- and is a different thing entirely. Separate module, separate `drill.*` message
// namespace, separate button.

import { fieldsFor, fieldLabels } from './format-panel.js';
import { nextIndex } from './keys.js';
import { t } from './i18n.js';

/** How many options a multiple-choice question offers, and the fewest it can be
 * asked with. Below two there is no question, so such a row is dropped. */
const OPTIONS = 4;
const MIN_OPTIONS = 2;
/** Rows per matching question. Five is as many prompts as fit on one screen
 * without scrolling the verdicts out of view. A group of one is not a matching
 * question, so a trailing remainder of one is dropped. */
const MATCH_GROUP = 5;

/** @typedef {import('../core/types.js').FieldId} FieldId */
/** @typedef {'choice'|'match'|'blank'} DrillKind */
/** @typedef {'right'|'marks'|'wrong'} Verdict */
/** @typedef {{conceptId:string, sectionId:string, values:Partial<Record<FieldId,string>>}} Card */

/**
 * The three shapes, in the order the setting offers them. Keys rather than words:
 * this is module scope, evaluated before a catalogue is loaded.
 * @type {{value:DrillKind, captionKey:string}[]}
 */
const KINDS = [
  { value: 'choice', captionKey: 'drill.kind.choice' },
  { value: 'match', captionKey: 'drill.kind.match' },
  { value: 'blank', captionKey: 'drill.kind.blank' },
];

const LENGTHS = [10, 20, 40];

/**
 * Which language a cell is written in.
 *
 * The same set `ui/content-tree.js` calls `TARGET_FIELDS`, asked of the same cells,
 * so an answer box carries the same `lang` the tree row does. Direction is the one
 * thing the tree does not need and this does: an input for an Arabic or Hebrew
 * headword has to start at the right edge, and `roman` and `ipa` run down the
 * target's side of the row while being Latin whatever the target writes in -- which
 * is the split `core/fonts.js`'s `FIELD_SIDE` records as `latin`.
 */
const TARGET_CELLS = new Set(['script', 'script_alt', 'roman', 'ipa', 'literal']);
const LATIN_CELLS = new Set(['roman', 'ipa']);

// --- grading ---------------------------------------------------------------

/**
 * Everything a learner cannot be held to: case, and the punctuation and symbols
 * around the phrase.
 *
 * Edge punctuation rather than all of it. A trailing `?`, the French space before
 * one, and the `{}` of an open slot are furniture the card prints and nobody types;
 * an interior apostrophe or hyphen is part of the word. Interior whitespace runs
 * collapse, because a card may hold two spaces where a keyboard gives one.
 *
 * **The fallback is not defensive.** Twenty-nine rows in the bank are a bare
 * currency sign -- `¥`, `₹` -- and every character of those is `\p{S}`, so stripping
 * would leave nothing and an empty expected answer accepts anything. Those rows are
 * legitimately askable, so a strip that empties the string is discarded.
 * @param {string} value
 */
export function normalise(value) {
  const nfc = value.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();
  const stripped = nfc.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '');
  return stripped || nfc;
}

/**
 * The same string with its non-spacing marks gone.
 *
 * `Mn` and not `Mc`: `Mn` is exactly the class a plain keyboard cannot produce --
 * pinyin's tone marks, Vietnamese's diacritics, Hebrew's niqqud, Arabic's harakat,
 * Devanagari's virama and nukta -- while Devanagari's spacing matras are `Mc` and
 * are letters. Folding `Mn` over Hebrew's pointed column turns `אֲנִי` into `אני`,
 * which *is* the unpointed column, by construction: `validate_data.py` enforces that
 * `text` is `text_alt` with the points stripped. So a learner who types the
 * unpointed form of a pointed answer lands on `marks`, which is the right verdict
 * and not a coincidence.
 * @param {string} value
 */
function foldMarks(value) {
  return value.normalize('NFD').replace(/\p{Mn}/gu, '').normalize('NFC');
}

/**
 * How many edits a typed answer may be away from the expected one.
 *
 * **Proportional, and the obvious alternative is the worst of the ones measured.**
 * Over all 23,755 distinct `text` and `romanization_*` values in the twenty-two
 * packs, the share of answers that have a *different* answer of the same pack inside
 * the budget -- i.e. the share where the budget is wide enough to accept a real word
 * for another one:
 *
 *     flat 1      7.47%   (18% of Han, 16% of Hangul, 30% of pIqaD, 28% of tengwar)
 *     flat 2     21.09%
 *     floor(n/4) 11.29%
 *     floor(n/5)  5.10%
 *     floor(n/6)  2.50%   <- this
 *
 * A flat budget fails on every script that writes a word in one or two glyphs: 我 is
 * one edit from 你, so `flat 1` puts a real word one edit from 292 of Mandarin's
 * 1,587 answers. `floor(n/6)` is zero below six code points, which costs nothing,
 * because the commonest short-answer near-miss is a missing mark and `marks` catches
 * that on its own.
 * @param {number} length in code points
 */
const budget = (length) => Math.floor(length / 6);

/**
 * Damerau-Levenshtein (optimal string alignment) over code points, giving up once
 * every alignment exceeds `cap`.
 *
 * Damerau rather than plain Levenshtein for one row of extra arithmetic:
 * transposition is the commonest typing error there is, and `hte` for `the` is two
 * Levenshtein edits, which a proportional budget refuses on anything under twelve
 * characters.
 *
 * Code points, not UTF-16 units, or a surrogate pair counts as two edits and an
 * emoji-length script would be graded at half the budget it was given.
 * @param {string[]} a @param {string[]} b @param {number} cap
 */
function distance(a, b, cap) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  /** @type {number[]} */ let two = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, two[j - 2] + 1);
      }
      row[j] = v;
      best = Math.min(best, v);
    }
    // Every alignment through this row is already over budget, and the DP is
    // monotone down the rows, so nothing below can come back under it.
    if (best > cap) return cap + 1;
    two = prev;
    prev = row;
  }
  return prev[b.length];
}

/**
 * Grade a typed answer as right, right-but-for-the-marks, or wrong.
 *
 * **Three outcomes rather than two, and the corpus is what says so.** Dropping
 * combining marks before comparing pulls *different words* together, on exactly the
 * languages where the marks are the content. Real pairs from the bank:
 * `Hỏng`/`Họng`, `Nam`/`năm`, `mua`/`Mưa` and `Băng`/`bảng` in Vietnamese;
 * `nǎlǐ`/`nàlǐ`, `jiào`/`jiǎo` and `bèi`/`běi` in pinyin; `เขา`/`เข่า` and
 * `เยน`/`เย็น` in Thai. So a mark-blind *pass* would accept the wrong tone on the one
 * column whose whole purpose is the tone.
 *
 * Keeping them is no better. A mark is *present* to be mistyped on 100% of pinyin
 * answers, 98% of Greek, 97% of Vietnamese, 91% of Thai and 88% of Devanagari, and
 * this is a learning aid, so failing a correct answer for a mark a plain keyboard
 * cannot produce is the expensive error.
 *
 * Both are paid by folding marks only ever to reach a *third* verdict and never to
 * reach `right`. IAST turned out to need none of it -- Hindi's romanisation shows no
 * mark collision at all, so its macrons and dots carry no minimal pair in this bank
 * -- which is the one prediction the measurement overturned.
 *
 * **The whole thing measured end to end, through this function**, by grading every
 * distinct answer of a pack against every other one: 23,920 answers, which is an
 * upper bound, since no drill draws from a pool of 1,600. **2.64% accept some other
 * answer as `right`** and a further **0.51% accept one only as `marks`**. The `marks`
 * share falls where the argument above says it should -- Vietnamese 4.71%, pinyin
 * 1.64%, Thai 1.09%, against zero for English, Hebrew's unpointed column, Hangul,
 * pIqaD and Latin-script Greek. The `right` share is the typo budget on long phrases,
 * worst in Japanese at 5.13% and lowest in Turkish at 0.87%, and it is the price of
 * not failing a learner for a slip.
 * @param {string} typed @param {string} answer
 * @returns {Verdict}
 */
export function grade(typed, answer) {
  const want = normalise(answer);
  const got = normalise(typed);
  if (!got) return 'wrong';
  if (got === want) return 'right';
  const cap = budget([...want].length);
  if (cap && distance([...got], [...want], cap) <= cap) return 'right';
  const bare = foldMarks(want);
  const plain = foldMarks(got);
  if (plain === bare) return 'marks';
  const capBare = budget([...bare].length);
  if (capBare && distance([...plain], [...bare], capBare) <= capBare) return 'marks';
  return 'wrong';
}

// --- shuffling, deterministically ------------------------------------------

/**
 * A seeded generator, because determinism is a project invariant and a quiz needs
 * to shuffle.
 *
 * FNV-1a over the seed string into mulberry32. The seed is a short base-36 string
 * the reader can see and retype, so a question set that misbehaves can be asked for
 * again -- which is the whole reason this is not `Math.random`, of which the
 * repository contains none. The *default* seed comes off the clock, since a drill
 * that asked the same twenty questions every time would be useless; the generator
 * itself is pure.
 * @param {string} seed
 */
function generator(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), a | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, on a copy. @template T @param {T[]} list @param {() => number} rand */
function shuffled(list, rand) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A seed nobody has to think about, short enough to read off the screen and retype. */
export const freshSeed = () => Date.now().toString(36).slice(-6);

// --- what can be asked -----------------------------------------------------

/**
 * The rows on the card that can carry this question, in card order.
 *
 * Every prompt cell *and* every answer cell has to be filled. Empty cells are
 * ordinary -- `literal` is filled on a minority of rows, a respelling is blank for
 * the 76 prose notes and the 29 bare currency signs, and a pack whose romanisation
 * column is not written yet has no `ipa` -- and a question with a blank in it is
 * unanswerable in one direction and a giveaway in the other.
 *
 * All of them, including an answer column this particular question will not use: a
 * multiple-choice run rotates through the answer columns, so requiring only the one
 * being asked would make the pool a different size per question and the count in the
 * setup form a lie. One pool per (prompt, answer) pair, whichever shape is chosen.
 *
 * One function rather than two, because the setup form needs the count to decide
 * what to offer and `buildDrill` needs the rows.
 * @param {import('../core/types.js').Block[]} blocks
 * @param {FieldId[]} fields  prompt and answer columns together
 * @returns {Card[]}
 */
export function drillPool(blocks, fields) {
  /** @type {Card[]} */ const pool = [];
  for (const block of blocks) {
    if (block.kind !== 'items') continue;
    for (const row of block.rows ?? []) {
      if (fields.some((f) => !(row.values[f] ?? '').trim())) continue;
      pool.push({ conceptId: row.conceptId, sectionId: block.sectionId, values: row.values });
    }
  }
  return pool;
}

/**
 * Three wrong answers worth offering.
 *
 * **`cluster_id` first, and it cannot be the only rung.** Items in one coverage
 * cluster answer the same need, so they are the distractors that make a question
 * worth asking -- but 609 of the 813 clusters have a single member, and on a default
 * card a cluster supplies three siblings for only 6% of rows and even one for 17%.
 * So: cluster, then the same section (which reaches three for 100% of rows on a full
 * card and 91% on the smallest pack, Klingon), then whatever else is on the card.
 * Uniform sampling from the whole bank was never the first choice and is the last
 * resort.
 *
 * Deduplicated on the *normalised* value rather than on the row, so an option that
 * would grade as `right` for the real answer can never be offered as a wrong one --
 * two concepts outside one block can land on the same word, which is the same
 * collision `mergeIdenticalRows` folds inside a block. Marks-only variants are
 * deliberately *not* deduplicated: `nàlǐ` beside `nǎlǐ` is the best question this
 * corpus can ask.
 * @param {Card} row @param {FieldId} field @param {Card[]} pool
 * @param {Record<string,Record<string,string>>} concepts  `corpus.concepts`
 * @param {() => number} rand @param {number} want
 */
function distractors(row, field, pool, concepts, rand, want) {
  const cluster = concepts[row.conceptId]?.cluster_id;
  const rungs = [
    /** @param {Card} c */ (c) => Boolean(cluster) && concepts[c.conceptId]?.cluster_id === cluster,
    /** @param {Card} c */ (c) => c.sectionId === row.sectionId,
    () => true,
  ];
  const seen = new Set([normalise(row.values[field] ?? '')]);
  /** @type {string[]} */ const out = [];
  for (const rung of rungs) {
    for (const other of shuffled(pool.filter((c) => c !== row && rung(c)), rand)) {
      const value = other.values[field] ?? '';
      const key = normalise(value);
      if (!value || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length === want) return out;
    }
  }
  return out;
}

/**
 * @typedef {Object} Question
 * @property {DrillKind} kind
 * @property {Card[]} rows        one row, except for matching
 * @property {FieldId[]} asks     the columns the reader supplies
 * @property {string[]} [options] multiple choice: the answers offered, in order
 * @property {string[]} [labels]  matching: the answers to assign, shuffled
 */

/**
 * Build a whole drill. Pure, given the seed.
 *
 * A fill-in-the-blank question asks for every answer column at once, because "which
 * columns do you want to be responsible for entering" is plainly a set -- here is the
 * English, type the Japanese *and* the Hepburn. Multiple choice and matching cannot
 * be a set: a four-way choice over two columns at once is not a question anyone can
 * answer, so those rotate through the answer columns, one per question, and a
 * session covers all of them.
 * @param {Object} input
 * @param {import('../core/types.js').Block[]} input.blocks
 * @param {Record<string,Record<string,string>>} input.concepts  `corpus.concepts`
 * @param {DrillKind} input.kind
 * @param {FieldId[]} input.prompt
 * @param {FieldId[]} input.answer
 * @param {string} input.seed
 * @param {number} input.count
 * @returns {Question[]}
 */
export function buildDrill({ blocks, concepts, kind, prompt, answer, seed, count }) {
  const pool = drillPool(blocks, [...prompt, ...answer]);
  const rand = generator(seed);
  const order = shuffled(pool, rand);
  /** @type {Question[]} */ const questions = [];

  if (kind === 'match') {
    for (let at = 0; at + 1 < order.length && questions.length < count; at += MATCH_GROUP) {
      const rows = order.slice(at, at + MATCH_GROUP);
      const field = answer[questions.length % answer.length];
      // Distinct answers inside a group, or two prompts have the same right label
      // and one of them is graded wrong whichever way round the reader assigns them.
      /** @type {Set<string>} */ const seen = new Set();
      const distinct = rows.filter((row) => {
        const key = normalise(row.values[field] ?? '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (distinct.length < 2) continue;
      questions.push({
        kind,
        rows: distinct,
        asks: [field],
        labels: shuffled(distinct.map((row) => /** @type {string} */ (row.values[field])), rand),
      });
    }
    return questions;
  }

  for (const row of order) {
    if (questions.length >= count) break;
    if (kind === 'blank') {
      questions.push({ kind, rows: [row], asks: answer });
      continue;
    }
    const field = answer[questions.length % answer.length];
    const wrong = distractors(row, field, pool, concepts, rand, OPTIONS - 1);
    // Fewer than one wrong answer is not a question. Fewer than three is, and is
    // what a card with two rows in a column can honestly offer.
    if (wrong.length + 1 < MIN_OPTIONS) continue;
    questions.push({
      kind,
      rows: [row],
      asks: [field],
      options: shuffled([/** @type {string} */ (row.values[field]), ...wrong], rand),
    });
  }
  return questions;
}

// --- the dialog ------------------------------------------------------------

/** @param {string} tag @param {Record<string,string>} attrs @param {(Node|string)[]} kids */
function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...kids);
  return node;
}

/**
 * @typedef {Object} DrillInput
 * @property {import('../core/types.js').Block[]} blocks  the solved card
 * @property {Awaited<ReturnType<import('../core/sheet.js').createSheetContext>>['corpus']} corpus
 * @property {import('../core/types.js').SheetSpec} spec
 */

/**
 * Open the quiz. Resolves when it closes.
 * @param {DrillInput} input
 */
export function openDrill({ blocks, corpus, spec }) {
  // The same columns the format panel offers, named the way that control names them
  // -- "Japanese", "Hepburn", "English" rather than "Their script" -- because this is
  // the same vocabulary asked about the same cells. `numeral` is excluded there and
  // here: it is the gloss cell under another name.
  const columns = fieldsFor(spec, corpus).filter((f) => spec.fieldSet.includes(f));
  const labels = fieldLabels(spec, corpus);
  const direction = (/** @type {string} */ code) => (
    corpus.scripts[corpus.languages[code]?.script]?.direction === 'rtl' ? 'rtl' : 'ltr');
  /** The language tag and direction of a cell, so an answer box takes the target's
   * own script and starts at the right edge when that script does. */
  const locale = (/** @type {FieldId} */ field) => ({
    lang: TARGET_CELLS.has(field) ? spec.target : spec.source,
    dir: LATIN_CELLS.has(field) ? 'ltr' : direction(TARGET_CELLS.has(field) ? spec.target : spec.source),
  });

  // Named on the element rather than by `aria-labelledby`, because the dialog's
  // contents are replaced across its three phases and only the first and last carry
  // a heading -- a label pointing at a node that a question removes is worse than no
  // label.
  const dialog = /** @type {HTMLDialogElement} */ (el('dialog', {
    class: 'drill', 'aria-label': t('drill.heading'),
  }));
  document.body.append(dialog);
  dialog.showModal();

  return new Promise((resolve) => {
    const done = () => {
      dialog.close();
      dialog.remove();
      resolve(undefined);
    };
    dialog.addEventListener('cancel', done);
    setup();

    // --- setup ------------------------------------------------------------

    function setup() {
      /** @type {Set<FieldId>} */ const prompt = new Set(
        columns.includes('gloss') ? ['gloss'] : columns.slice(-1));
      /** @type {Set<FieldId>} */ const answer = new Set(
        columns.filter((f) => !prompt.has(f)).slice(0, 1));

      const kind = /** @type {HTMLSelectElement} */ (el('select', { id: 'drill-kind' }));
      for (const item of KINDS) kind.append(new Option(t(item.captionKey), item.value));
      const length = /** @type {HTMLSelectElement} */ (el('select', { id: 'drill-length' }));
      for (const n of LENGTHS) length.append(new Option(String(n), String(n)));
      const seed = /** @type {HTMLInputElement} */ (el('input', {
        type: 'text', id: 'drill-seed', class: 'drill-seed', value: freshSeed(),
        autocomplete: 'off', spellcheck: 'false',
      }));
      const note = el('p', { class: 'small muted drill-note' });
      const start = /** @type {HTMLButtonElement} */ (el('button', {
        type: 'submit', class: 'primary', text: t('drill.start'),
      }));

      /**
       * One of the two column lists, built once and synced afterwards.
       *
       * **A column is shown or entered, never both** -- one that is both prints the
       * answer beside the question -- so ticking it on one side unticks it on the
       * other rather than being refused, which is what the reader meant. That is
       * also why the boxes are synced rather than rebuilt: rebuilding destroys the
       * box that was just ticked and drops a keyboard reader back to the top of the
       * dialog, which is the same reason the content tree updates in place.
       * @param {Set<FieldId>} own @param {Set<FieldId>} other
       * @param {string} legend @param {string} hint
       */
      function columnGroup(own, other, legend, hint) {
        /** @type {HTMLInputElement[]} */ const boxes = [];
        const options = columns.map((field) => {
          const box = /** @type {HTMLInputElement} */ (el('input', {
            type: 'checkbox', value: field,
          }));
          box.checked = own.has(field);
          box.addEventListener('change', () => {
            if (box.checked) {
              own.add(field);
              other.delete(field);
            } else {
              own.delete(field);
            }
            refresh();
          });
          boxes.push(box);
          return el('label', { class: 'quiz-option', title: labels[field].title }, [
            box, el('span', { text: labels[field].caption }),
          ]);
        });
        return {
          node: el('fieldset', {}, [
            el('legend', { text: legend }),
            el('p', { class: 'small muted', text: hint, style: 'margin:0 0 .2em' }),
            ...options,
          ]),
          sync: () => boxes.forEach((box, i) => { box.checked = own.has(columns[i]); }),
        };
      }

      const shown = columnGroup(prompt, answer, t('drill.shown'), t('drill.shownHint'));
      const asked = columnGroup(answer, prompt, t('drill.asked'), t('drill.askedHint'));

      /**
       * What is possible with the columns currently ticked, and why not otherwise.
       *
       * Said here rather than discovered after pressing Start. Multiple choice needs
       * a second distinct answer to offer and matching needs a second row to match,
       * so on a card trimmed to one row in the asked column neither exists -- and the
       * reader is entitled to know that before choosing rather than after.
       */
      function refresh() {
        shown.sync();
        asked.sync();
        const fields = [...prompt, ...answer];
        const pool = prompt.size && answer.size ? drillPool(blocks, fields) : [];
        const distinct = new Set(pool.flatMap(
          (row) => [...answer].map((f) => normalise(row.values[f] ?? '')),
        ));
        for (const option of kind.options) {
          const value = /** @type {DrillKind} */ (option.value);
          option.disabled = (value === 'match' && pool.length < 2)
            || (value === 'choice' && distinct.size < MIN_OPTIONS);
        }
        if (kind.selectedOptions[0]?.disabled) {
          kind.value = [...kind.options].find((o) => !o.disabled)?.value ?? '';
        }
        const sections = new Set(pool.map((row) => row.sectionId));
        note.textContent = !prompt.size || !answer.size
          ? t('drill.needBoth')
          : pool.length
            ? t('drill.pool', { count: pool.length, sections: sections.size })
            : t('drill.poolEmpty');
        start.disabled = !pool.length || !kind.value;
      }

      const form = el('form', { class: 'drill-setup', method: 'dialog' }, [
        el('h2', { text: t('drill.heading') }),
        el('p', { class: 'lede', text: t('drill.lede') }),
        el('div', { class: 'field' }, [
          el('label', { for: 'drill-kind' }, [el('span', { text: t('drill.kind') })]), kind,
        ]),
        shown.node,
        asked.node,
        el('div', { class: 'field' }, [
          el('label', { for: 'drill-length' }, [el('span', { text: t('drill.length') })]), length,
        ]),
        el('div', { class: 'field' }, [
          el('label', { for: 'drill-seed' }, [
            el('span', { text: t('drill.seed') }),
            el('span', { class: 'small muted', text: t('drill.seedHint') }),
          ]), seed,
        ]),
        note,
      ]);
      const cancel = el('button', { type: 'button', text: t('quiz.cancel') });
      cancel.addEventListener('click', done);
      form.append(el('div', { class: 'row', style: 'justify-content:flex-end' }, [cancel, start]));
      kind.addEventListener('change', refresh);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (start.disabled) return;
        // Shown in the sheet's own column order rather than in tick order, so a
        // question reads the way the printed row does.
        const shownFields = columns.filter((field) => prompt.has(field));
        const askedFields = columns.filter((field) => answer.has(field));
        // The seed the drill actually ran on, which is the one worth showing: a box
        // left empty gets a fresh one rather than an empty string, and the reader has
        // to be able to read back what they were given.
        const used = seed.value.trim() || freshSeed();
        run(buildDrill({
          blocks,
          concepts: corpus.concepts,
          kind: /** @type {DrillKind} */ (kind.value),
          prompt: shownFields,
          answer: askedFields,
          seed: used,
          count: Number(length.value),
        }), shownFields, used);
      });

      dialog.replaceChildren(form);
      refresh();
      kind.focus();
    }

    // --- running ----------------------------------------------------------

    /**
     * One question's own controls: its body, how to grade what is in them, and
     * where the keyboard should land.
     * @typedef {{body:(Node|string)[], check:()=>void, focus:()=>HTMLElement|null}} Panel
     */

    /**
     * @param {Question[]} questions
     * @param {FieldId[]} prompt  the columns the question hands the reader
     * @param {string} seed
     */
    function run(questions, prompt, seed) {
      let at = 0;
      /** @type {Record<Verdict, number>} */
      const tally = { right: 0, marks: 0, wrong: 0 };

      /** One cell of a prompt, in its own language and direction. */
      const cell = (/** @type {FieldId} */ field, /** @type {string} */ value) => el(
        'div', { class: 'drill-cell' }, [
          el('span', { class: 'small muted', text: labels[field].caption }),
          el('span', { class: 'drill-value', lang: locale(field).lang, dir: locale(field).dir, text: value }),
        ]);

      /** Every shown column of a row. `drillPool` has already guaranteed all of
       * them are filled, which is why there is nothing to skip here. */
      const promptOf = (/** @type {Card} */ row) => el('div', { class: 'drill-prompt' },
        prompt.map((field) => cell(field, /** @type {string} */ (row.values[field]))));

      /**
       * Multiple choice. A selection is right or it is not: the three-valued grade
       * exists for a *typed* answer, and picking the wrong label off a list is not a
       * near miss.
       * @param {Question} question @returns {Panel}
       */
      function choicePanel(question) {
        const row = question.rows[0];
        const field = question.asks[0];
        const options = /** @type {string[]} */ (question.options);
        const { lang, dir } = locale(field);
        const group = el('div', {
          class: 'drill-options', role: 'radiogroup',
          'aria-label': t('drill.pick', { field: labels[field].caption }),
        });
        /** @type {HTMLButtonElement[]} */ const buttons = [];
        let chosen = -1;
        /** @param {number} i */
        const choose = (i) => {
          chosen = i;
          buttons.forEach((button, k) => {
            button.setAttribute('aria-checked', String(k === i));
            button.tabIndex = k === i ? 0 : -1;
            button.classList.toggle('chosen', k === i);
          });
          buttons[i].focus();
        };
        options.forEach((value, i) => {
          const button = /** @type {HTMLButtonElement} */ (el('button', {
            type: 'button', class: 'drill-option', role: 'radio', 'aria-checked': 'false',
            tabindex: i ? '-1' : '0',
          }, [
            el('span', { class: 'drill-key small muted', text: String(i + 1) }),
            el('span', { lang, dir, text: value }),
          ]));
          button.addEventListener('click', () => choose(i));
          buttons.push(button);
          group.append(button);
        });
        // The same keys the settings groups, the face chooser and the rows on a face
        // answer -- `nextIndex` is shared for exactly that reason -- plus the digits,
        // because a numbered list of four invites them.
        group.addEventListener('keydown', (event) => {
          const digit = Number(event.key);
          if (digit >= 1 && digit <= options.length) {
            event.preventDefault();
            choose(digit - 1);
            return;
          }
          const to = nextIndex(event.key, chosen < 0 ? 0 : chosen, options.length);
          if (to < 0) return;
          event.preventDefault();
          choose(to);
        });
        // **The verdict is words, not a colour on the option.** Marking the right
        // and the chosen option with a rule and a hue says nothing to a screen
        // reader, and this is the one shape where the grade has no text of its own
        // -- the other two print theirs beside each row. `mark` is inserted empty
        // and filled on grading, so the live region exists before it changes.
        const mark = el('span', { class: 'drill-mark', role: 'status' });
        return {
          body: [promptOf(row), group, mark],
          focus: () => buttons[chosen < 0 ? 0 : chosen],
          check: () => {
            const want = /** @type {string} */ (row.values[field]);
            const right = chosen >= 0 && normalise(options[chosen]) === normalise(want);
            tally[right ? 'right' : 'wrong'] += 1;
            buttons.forEach((button, k) => {
              button.disabled = true;
              button.classList.toggle('right', normalise(options[k]) === normalise(want));
              button.classList.toggle('wrong', k === chosen && !right);
            });
            mark.className = `drill-mark ${right ? 'right' : 'wrong'}`;
            mark.textContent = right
              ? t('drill.right')
              : `${t('drill.wrong')} ${t('drill.expected', { answer: want })}`;
          },
        };
      }

      /**
       * Matching: a menu per prompt, holding the group's own answers shuffled. A
       * menu rather than a drag, because assigning a label to a row is genuinely
       * list-shaped -- which is the house rule for when a menu is the right control
       * -- and because dragging is the one gesture a keyboard cannot reach.
       * @param {Question} question @returns {Panel}
       */
      function matchPanel(question) {
        const field = question.asks[0];
        const { lang, dir } = locale(field);
        /** @type {{row:Card, pick:HTMLSelectElement, mark:HTMLElement}[]} */ const lines = [];
        const body = question.rows.map((row) => {
          const pick = /** @type {HTMLSelectElement} */ (el('select', {
            lang, dir, 'aria-label': t('drill.matchFor'),
          }));
          pick.append(new Option(t('drill.matchChoose'), ''));
          for (const label of /** @type {string[]} */ (question.labels)) {
            pick.append(new Option(label, label));
          }
          const mark = el('span', { class: 'drill-mark', role: 'status' });
          lines.push({ row, pick, mark });
          return el('div', { class: 'drill-line' }, [promptOf(row), pick, mark]);
        });
        return {
          body: [
            el('p', { class: 'lede', text: t('drill.matchLede', { field: labels[field].caption }) }),
            ...body,
          ],
          focus: () => lines[0].pick,
          check: () => {
            for (const line of lines) {
              const want = /** @type {string} */ (line.row.values[field]);
              const right = normalise(line.pick.value) === normalise(want);
              tally[right ? 'right' : 'wrong'] += 1;
              line.pick.disabled = true;
              line.mark.className = `drill-mark ${right ? 'right' : 'wrong'}`;
              line.mark.textContent = right
                ? t('drill.right')
                : `${t('drill.wrong')} ${t('drill.expected', { answer: want })}`;
            }
          },
        };
      }

      /**
       * Fill in the blank: one box per answer column, each graded on its own.
       * @param {Question} question @returns {Panel}
       */
      function blankPanel(question) {
        const row = question.rows[0];
        /** @type {{field:FieldId, box:HTMLInputElement, mark:HTMLElement}[]} */ const boxes = [];
        const body = question.asks.map((field) => {
          const { lang, dir } = locale(field);
          const id = `drill-answer-${field}`;
          const box = /** @type {HTMLInputElement} */ (el('input', {
            type: 'text', id, lang, dir, class: 'drill-answer',
            autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
          }));
          const mark = el('span', { class: 'drill-mark', role: 'status' });
          boxes.push({ field, box, mark });
          return el('div', { class: 'field drill-blank' }, [
            el('label', { for: id }, [
              el('span', { text: t('drill.type', { field: labels[field].caption }) }),
            ]),
            box,
            mark,
          ]);
        });
        return {
          body: [promptOf(row), ...body],
          focus: () => boxes[0].box,
          check: () => {
            for (const entry of boxes) {
              const want = /** @type {string} */ (row.values[entry.field]);
              const verdict = grade(entry.box.value, want);
              tally[verdict] += 1;
              entry.box.readOnly = true;
              entry.mark.className = `drill-mark ${verdict}`;
              // The expected string prints on every outcome, not only on a miss: a
              // typo inside the budget is graded right, and the reader still has to
              // see the spelling they nearly had.
              entry.mark.textContent = `${verdictText(verdict)} ${t('drill.expected', { answer: want })}`;
            }
          },
        };
      }

      function ask() {
        if (at >= questions.length) {
          summarise();
          return;
        }
        const question = questions[at];
        const panel = question.kind === 'choice' ? choicePanel(question)
          : question.kind === 'match' ? matchPanel(question)
            : blankPanel(question);
        const action = /** @type {HTMLButtonElement} */ (el('button', {
          type: 'submit', class: 'primary', text: t('drill.check'),
        }));
        const quit = el('button', { type: 'button', class: 'ghost', text: t('studio.close') });
        quit.addEventListener('click', done);
        let graded = false;

        const form = /** @type {HTMLFormElement} */ (el('form', { class: 'drill-run' }, [
          el('div', { class: 'row drill-head' }, [
            el('span', {
              class: 'small muted',
              text: t('drill.progress', { at: at + 1, total: questions.length }),
            }),
            el('span', { class: 'spacer' }),
            el('span', { class: 'small muted', text: t('drill.seedIs', { seed }) }),
          ]),
          ...panel.body,
          el('div', { class: 'row', style: 'justify-content:flex-end' }, [quit, action]),
        ]));
        form.addEventListener('submit', (event) => {
          event.preventDefault();
          if (!graded) {
            graded = true;
            panel.check();
            action.textContent = at + 1 < questions.length ? t('drill.next') : t('drill.finish');
            action.focus();
            return;
          }
          at += 1;
          ask();
        });
        // **Enter means the same thing in all three shapes**, which needs saying
        // because none of them gets it for free. A lone text input submits
        // implicitly; a form of `<select>`s does not; and a chosen multiple-choice
        // option leaves focus on a `<button>`, whose own default for Enter is to
        // click itself -- so Enter re-picked the option the reader had just picked
        // and the question never graded. The two real buttons are the exception,
        // because pressing Enter on Check or Close should do what pressing them
        // does. Space still selects an option, which is the radio convention.
        form.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter') return;
          if (event.target === action || event.target === quit) return;
          event.preventDefault();
          form.requestSubmit(action);
        });

        dialog.replaceChildren(form);
        panel.focus()?.focus();
      }

      function summarise() {
        const total = tally.right + tally.marks + tally.wrong;
        const again = el('button', { type: 'button', text: t('drill.again') });
        again.addEventListener('click', setup);
        const close = el('button', { type: 'button', class: 'primary', text: t('studio.close') });
        close.addEventListener('click', done);
        dialog.replaceChildren(el('div', { class: 'drill-summary' }, [
          el('h2', { text: t('drill.summaryHeading') }),
          el('p', {
            text: t('drill.summary', {
              right: tally.right, marks: tally.marks, wrong: tally.wrong, total,
            }),
          }),
          el('p', { class: 'small muted', text: t('drill.seedIs', { seed }) }),
          el('div', { class: 'row', style: 'justify-content:flex-end' }, [again, close]),
        ]));
        close.focus();
      }

      ask();
    }
  });
}

/** @param {Verdict} verdict */
function verdictText(verdict) {
  if (verdict === 'right') return t('drill.right');
  if (verdict === 'marks') return t('drill.marks');
  return t('drill.wrong');
}
