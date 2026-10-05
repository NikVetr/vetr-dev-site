// Quiz mode: drill the rows a card carries.
//
// The sheet is a printed artifact and this is its screen counterpart -- the same
// content, drilled instead of typeset. Three question shapes over the rows, with the
// reader choosing which columns the question hands them and which they have to supply.
//
// **It reads built `blocks`, not `spec.selection`.** Those differ, and the
// difference is the whole point: `buildBlocks` is where `applies_to`, the priority
// floor, an `include: false` override and the existence of a row on *both* sides are
// decided, and a row the reader ticked that could not render is not on the card. The
// raw selection would ask about the Japanese yen on a Spanish sheet, which is exactly
// the defect `core/solve/weights.js` had before it learned to apply the same filters.
// It also gets `mergeIdenticalRows` for free: where Spanish answers two concepts with
// `Buenos días`, the card carries one row with both glosses in it, and so does the
// quiz.
//
// **A page of its own** (`drill.html`, `ui/drill-page.js`), the third thing to do with
// a language beside its card and its conversation. The page chooses which rows may be
// asked about and keeps the record of how the reader did; this module asks.
//
// `ui/quiz.js` is the onboarding questionnaire -- "Too many options? Help me decide."
// -- and is a different thing entirely. Separate module, separate `drill.*` message
// namespace, separate button.

import { sayable } from '../core/pack.js';
import { chipToggle } from './chips.js';
import { fieldsFor, fieldLabels } from './format-panel.js';
import { nextIndex } from './keys.js';
import { languageName, t } from './i18n.js';
import { helpTip, pills } from './dialog.js';
import { listening, speech } from './platform/speech.js';

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
  // **An open slot is dropped wherever it falls, not only at an edge.** The rule
  // above already said nobody types `{}`, and the edge strip only made that true for
  // a row that ends in one. `place-words.stay-at` is `zhù {} wǎn`, and asked as a
  // fill-in-the-blank it was unanswerable: every answer a learner can type was
  // marked wrong, including the card's own wording, because the expected string
  // carried two braces in the middle of it. Nothing landed on such a row until the
  // bank grew past the seed that had been picking a different one.
  // The blank a template is *shown* with, `____`, is the same slot, and a reader who
  // types what they see must not be marked down for it.
  // Outside a Turkish locale `İ` lowercases to `i` and a combining dot, so a recogniser's
  // `İki` was not the catalogue's `iki`, and a typed `istanbul` only half-matched.
  const nfc = value.normalize('NFC').toLowerCase().replace(/i\u0307/gu, 'i')
    .replace(/\{\}|_{2,}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
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
 * The cards, not only their values: each wrong answer is some other card's right
 * one, which is what a reader who picked it wants to be told.
 * @param {Card} row @param {FieldId} field @param {Card[]} pool
 * @param {Record<string,Record<string,string>>} concepts  `corpus.concepts`
 * @param {() => number} rand @param {number} want
 * @returns {Card[]}
 */
function distractors(row, field, pool, concepts, rand, want) {
  const cluster = concepts[row.conceptId]?.cluster_id;
  const rungs = [
    /** @param {Card} c */ (c) => Boolean(cluster) && concepts[c.conceptId]?.cluster_id === cluster,
    /** @param {Card} c */ (c) => c.sectionId === row.sectionId,
    () => true,
  ];
  const seen = new Set([normalise(row.values[field] ?? '')]);
  /** @type {Card[]} */ const out = [];
  for (const rung of rungs) {
    for (const other of shuffled(pool.filter((c) => c !== row && rung(c)), rand)) {
      const value = other.values[field] ?? '';
      const key = normalise(value);
      if (!value || seen.has(key)) continue;
      seen.add(key);
      out.push(other);
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
 * @property {Card[]} [choices]   multiple choice: the card each option is the right
 *   answer to, in the options' order -- the prompt a wrong one would have answered
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
    const choices = shuffled([row, ...wrong], rand);
    questions.push({
      kind,
      rows: [row],
      asks: [field],
      options: choices.map((c) => /** @type {string} */ (c.values[field])),
      choices,
    });
  }
  return questions;
}

// --- hearing an answer ----------------------------------------------------

/** Best first, for choosing among what a recogniser offers. */
const RANK = { right: 0, marks: 1, wrong: 2 };

/**
 * The ways an answer may be said aloud: each gloss of a merged row on its own, with
 * and without what its brackets add -- nobody says "hello (polite)", and a row that
 * means two things is answered by saying either.
 * @param {string} answer
 */
function sayings(answer) {
  return answer.split(' / ').flatMap((part) => [part.trim(), sayable(part)]).filter(Boolean);
}

/**
 * How well what was heard answers a typed-answer question: the best verdict any of
 * the recogniser's guesses earns against any way of saying the answer, graded as a
 * typed answer is -- the same typo budget and the same three outcomes, so a word the
 * recogniser spelled a letter wrong is still right.
 * @param {string[]} heard  the recogniser's guesses @param {string[]} answers
 * @returns {{text:string, verdict:Verdict}|null}  null when nothing was heard
 */
export function heardVerdict(heard, answers) {
  /** @type {{text:string, verdict:Verdict}|null} */ let best = null;
  for (const text of heard) {
    for (const answer of answers.flatMap(sayings)) {
      const verdict = grade(text, answer);
      if (!best || RANK[verdict] < RANK[best.verdict]) best = { text, verdict };
    }
  }
  return best;
}

/** What was heard, as words: lower case, punctuation gone. @param {string} text */
const wordsHeard = (text) => normalise(text).replace(/[\p{P}\p{S}]/gu, ' ').split(/\s+/u).filter(Boolean);

/**
 * Which option was said: its digit, in Latin figures or the reader's own, or its
 * number as a word. The words come from the catalogue, where each number is a list of
 * what a recogniser writes for it -- English hears "two" as `to` as often as not.
 * @param {string[]} heard @param {string[][]} words  the words for one, two, three, four
 * @param {string[]} digits  the reader's own figures for one to four
 * @returns {number}  1-based, or 0 for none
 */
export function numberIn(heard, words, digits) {
  for (const text of heard) {
    for (const word of wordsHeard(text)) {
      const at = words.findIndex((list, i) => list.includes(word) || word === String(i + 1) || word === digits[i]);
      if (at >= 0) return at + 1;
    }
  }
  return 0;
}

/**
 * Which command was said, if any: one of its words, as a whole word of what was heard,
 * or the whole of it in a script that does not space its words.
 * @param {string[]} heard @param {Record<string, string[]>} commands
 * @returns {string|null}
 */
export function commandIn(heard, commands) {
  for (const text of heard) {
    const words = wordsHeard(text);
    const whole = words.join('');
    for (const [command, list] of Object.entries(commands)) {
      if (list.some((word) => words.includes(word) || whole === word.replace(/\s+/gu, ''))) return command;
    }
  }
  return null;
}

/** A catalogue's list of words, `one, won`, as the words. @param {string} list */
const listed = (list) => list.split(',').map((word) => normalise(word)).filter(Boolean);

// --- the page --------------------------------------------------------------

/** A template's slot as the blank a reader fills, not the `{}` it is stored as. @param {string} text */
const blank = (text) => text.replaceAll('{}', '____');

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
 * @property {HTMLElement} root  where the quiz is drawn, one phase at a time
 * @property {() => import('../core/types.js').Block[]} blocks  the rows it may ask
 *   about, read when they are counted: the page's choice of rows can change under it
 * @property {Awaited<ReturnType<import('../core/pack.js').loadCorpus>>} corpus
 * @property {import('../core/types.js').SheetSpec} spec
 * @property {Node} [choose]  the page's choice of rows, at the head of the setup
 * @property {(conceptId:string, verdict:Verdict) => void} onAnswer  each row as it is graded
 * @property {(phase:'setup'|'run'|'summary') => void} [onPhase]
 * @property {(key: string) => string} targetWords  the target language's catalogue, for
 *   the spoken commands of an answer heard in that language
 */

/**
 * Draw the quiz into the page: its setup, then its questions, then how it went.
 * @param {DrillInput} input
 * @returns {{refresh: () => void}}  counts the rows again, after the page's choice moved
 */
export function mountDrill({ root, blocks, corpus, spec, choose, onAnswer, onPhase, targetWords }) {
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
  /** @param {string} code */
  const nameOf = (code) => languageName(code, corpus.languages[code]?.exonym_en ?? code);

  /**
   * The language a cell is said in. A romanisation, a respelling or IPA is a way of
   * writing the target's sounds, so what is said for one is its row's own script, in
   * the target's voice; the literal reading is the reader's own words.
   * @param {FieldId} field
   */
  const saidIn = (field) => (TARGET_CELLS.has(field) && field !== 'literal' ? spec.target : spec.source);
  /**
   * A cell as it is said, and in which language.
   * @param {Card} card @param {FieldId} field @returns {[string, string]}
   */
  const spoken = (card, field) => [
    (saidIn(field) === spec.target ? card.values.script : card.values[field]) ?? '', saidIn(field),
  ];

  /**
   * Why hands-free cannot run on these columns, or '' when it can: it needs a
   * recogniser for the language the answer is said in, and a voice for every language
   * it reads aloud -- the reader's, for the numbers and the verdicts, and the target's
   * wherever a question or an answer is in it.
   */
  const voiceBlocked = (
    /** @type {DrillKind} */ kind, /** @type {FieldId[]} */ shown, /** @type {FieldId[]} */ asked,
  ) => {
    const hearIn = kind === 'choice' ? spec.source : saidIn(asked[0]);
    const ear = listening.unavailable(hearIn);
    if (ear === 'unsupported') return t('drill.voice.noListening');
    if (ear) return t('drill.voice.noLanguage', { language: nameOf(hearIn) });
    const said = new Set([spec.source]);
    for (const field of [...shown, ...asked]) said.add(saidIn(field));
    for (const code of said) {
      if (speech.getCapabilities(code).reason) return t('drill.voice.noVoice', { language: nameOf(code) });
    }
    return '';
  };

  /** What the setup does when the rows change; nothing once a quiz is running. */
  let recount = () => {};
  // Voices arrive late in Chrome, and whether hands-free can read a question is theirs.
  speech.onVoicesChanged(() => recount());
  setup(false);
  return { refresh: () => recount() };


  /** @param {'setup'|'run'|'summary'} phase @param {Node[]} nodes */
  function show(phase, nodes) {
    root.replaceChildren(...nodes);
    onPhase?.(phase);
  }

  // --- setup ------------------------------------------------------------

  /** @param {boolean} [focus]  coming back to it from a quiz, rather than opening the page */
  function setup(focus = true) {
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

    // **Hands-free: the question read aloud, the answer heard.** Offered only where it
    // can work for the columns chosen, and where it cannot, the reason is said beside
    // the switch rather than found out after pressing Start.
    let handsFree = false;
    const voice = pills({
      name: 'drill-voice',
      label: t('drill.voice.label'),
      options: [{ value: 'off', label: t('drill.voice.off') }, { value: 'on', label: t('drill.voice.on') }],
      value: 'off',
      onChange: (value) => { handsFree = value === 'on'; refresh(); },
    });
    const [voiceOff, voiceOn] = /** @type {HTMLInputElement[]} */ ([...voice.querySelectorAll('input')]);
    const voiceHelp = helpTip(t('drill.voice.help'), t('drill.voice.privacy'));
    voice.querySelector('.pill-name')?.append(voiceHelp.button);
    const voiceNote = el('p', { class: 'small muted drill-voice-note' });

    /**
     * One of the two column lists, built once and synced afterwards.
     *
     * **A column is shown or entered, never both** -- one that is both prints the
     * answer beside the question -- so ticking it on one side unticks it on the
     * other rather than being refused, which is what the reader meant. That is
     * also why the boxes are synced rather than rebuilt: rebuilding destroys the
     * box that was just ticked and drops a keyboard reader back to the top of the
     * setup, which is the same reason the content tree updates in place.
     * @param {Set<FieldId>} own @param {Set<FieldId>} other
     * @param {string} legend @param {string} hint
     */
    function columnGroup(own, other, legend, hint) {
      /** @type {HTMLInputElement[]} */ const boxes = [];
      // Chips rather than a column of checkboxes. Seven column names -- "Japanese",
      // "Hepburn", "English" -- are exactly the short labels `ui/chips.js` is for,
      // and the two lists were fourteen full-width rows above the fold in a form
      // whose point is the question below them.
      const options = columns.map((field) => {
        const chip = chipToggle({
          label: labels[field].caption,
          title: labels[field].title,
          checked: own.has(field),
          onChange: (on) => {
            if (on) {
              own.add(field);
              other.delete(field);
            } else {
              own.delete(field);
            }
            refresh();
          },
        });
        // Which cell this is, for the specs that drive the setup by column.
        chip.box.value = field;
        boxes.push(chip.box);
        return chip.label;
      });
      return {
        node: el('fieldset', {}, [
          el('legend', { text: legend }),
          el('p', { class: 'small muted', text: hint, style: 'margin:0 0 .2em' }),
          el('div', { class: 'chip-grid' }, options),
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
      const pool = prompt.size && answer.size ? drillPool(blocks(), fields) : [];
      const distinct = new Set(pool.flatMap(
        (row) => [...answer].map((f) => normalise(row.values[f] ?? '')),
      ));
      for (const option of kind.options) {
        const value = /** @type {DrillKind} */ (option.value);
        // Five menus are not a question anyone can answer out loud.
        option.disabled = (value === 'match' && (pool.length < 2 || handsFree))
          || (value === 'choice' && distinct.size < MIN_OPTIONS);
      }
      if (kind.selectedOptions[0]?.disabled) {
        kind.value = [...kind.options].find((o) => !o.disabled)?.value ?? '';
      }
      const blocked = kind.value && answer.size
        ? voiceBlocked(/** @type {DrillKind} */ (kind.value), [...prompt], columns.filter((f) => answer.has(f)))
        : '';
      // Unavailable, it is greyed and says why; a switch left on is put back off.
      voiceOn.disabled = Boolean(blocked);
      if (blocked && handsFree) {
        handsFree = false;
        voiceOff.checked = true;
      }
      voiceNote.textContent = blocked || (handsFree ? t('drill.voice.say', {
        skip: listed(t('drill.voice.skip'))[0], repeat: listed(t('drill.voice.repeat'))[0],
        stop: listed(t('drill.voice.stop'))[0],
      }) : '');
      const sections = new Set(pool.map((row) => row.sectionId));
      note.textContent = !prompt.size || !answer.size
        ? t('drill.needBoth')
        : pool.length
          ? t('drill.pool', { count: pool.length, sections: sections.size })
          : t('drill.poolEmpty');
      start.disabled = !pool.length || !kind.value;
    }

    const form = el('form', { class: 'drill-setup' }, [
      ...(choose ? [choose] : []),
      el('div', { class: 'field' }, [
        el('label', { for: 'drill-kind' }, [el('span', { text: t('drill.kind') })]), kind,
      ]),
      el('div', { class: 'field drill-voice' }, [voice, voiceHelp.tip, voiceNote]),
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
    form.append(el('div', { class: 'row', style: 'justify-content:flex-end' }, [start]));
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
        blocks: blocks(),
        concepts: corpus.concepts,
        kind: /** @type {DrillKind} */ (kind.value),
        prompt: shownFields,
        answer: askedFields,
        seed: used,
        count: Number(length.value),
      }), shownFields, used, handsFree);
    });

    show('setup', [form]);
    recount = refresh;
    refresh();
    if (focus) kind.focus();
  }

  // --- running ----------------------------------------------------------

  /**
   * One question's own controls: its body, how to grade what is in them, and
   * where the keyboard should land -- and, for hands-free, how to choose an option
   * by its number, or grade an answer that was said rather than typed.
   * `check` answers with how the row went, for hands-free to say.
   * @typedef {{body:(Node|string)[], focus:()=>HTMLElement|null, pick?:(i:number)=>void,
   *   check:(revealed?:boolean, said?:{text:string, verdict:Verdict})=>Verdict}} Panel
   */

  /**
   * @param {Question[]} questions
   * @param {FieldId[]} prompt  the columns the question hands the reader
   * @param {string} seed
   * @param {boolean} handsFree  read each question aloud and listen for its answer
   */
  function run(questions, prompt, seed, handsFree) {
    let at = 0;
    /** @type {Record<Verdict, number>} */
    const tally = { right: 0, marks: 0, wrong: 0 };

    // What hands-free is doing, in words beside a mark that says the same, carried
    // from one question's head to the next.
    const voiceState = el('span', { class: 'small drill-voice-state', role: 'status' });
    /** @param {'speaking'|'listening'|''} state @param {string} text */
    const voiceSays = (state, text) => {
      voiceState.dataset.state = state;
      voiceState.textContent = text;
    };
    /** Which hands-free turn is current; anything an older one was waiting on is dropped. */
    let turn = 0;
    const interrupt = () => {
      turn += 1;
      speech.stop();
      listening.stop();
    };
    /**
     * Say each part in its own language, in turn. False when the turn was overtaken
     * or a voice failed -- a failure also ends hands-free, and says so.
     * @param {[string, string][]} parts @param {number} mine
     */
    const sayAll = async (parts, mine) => {
      for (const [text, code] of parts) {
        if (mine !== turn) return false;
        if (!text.trim()) continue;
        try {
          if (await speech.speak({ text: sayable(text.replaceAll('{}', ' ')), locale: code }) !== 'completed') return false;
        } catch (err) {
          stopHandsFree(t('drill.voice.error', { error: String(/** @type {any} */ (err).reason ?? err) }));
          return false;
        }
      }
      return mine === turn;
    };
    /** @param {string} why */
    const stopHandsFree = (why) => {
      handsFree = false;
      interrupt();
      voiceSays('', why);
    };
    const commands = () => Object.fromEntries(['skip', 'repeat', 'stop'].map((name) => [name, [
      ...listed(t(`drill.voice.${name}`)), ...listed(targetWords(`drill.voice.${name}`)),
    ]]));
    const numberWords = () => ['one', 'two', 'three', 'four'].map((n) => listed(t(`drill.voice.${n}`)));
    const digits = [1, 2, 3, 4].map((n) => new Intl.NumberFormat(spec.source).format(n));

    /** One cell of a prompt, in its own language and direction. */
    const cell = (/** @type {FieldId} */ field, /** @type {string} */ value) => el(
      'div', { class: 'drill-cell' }, [
        el('span', { class: 'small muted', text: labels[field].caption }),
        el('span', { class: 'drill-value', lang: locale(field).lang, dir: locale(field).dir, text: blank(value) }),
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
          el('span', { lang, dir, text: blank(value) }),
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
        pick: choose,
        check: (revealed = false) => {
          const want = /** @type {string} */ (row.values[field]);
          const right = !revealed && chosen >= 0 && normalise(options[chosen]) === normalise(want);
          tally[right ? 'right' : 'wrong'] += 1;
          onAnswer(row.conceptId, right ? 'right' : 'wrong');
          buttons.forEach((button, k) => {
            const correct = normalise(options[k]) === normalise(want);
            button.disabled = true;
            button.classList.toggle('right', correct);
            button.classList.toggle('wrong', !revealed && k === chosen && !right);
            // **Missed, every wrong option says what it does answer** -- the prompt
            // it is the right answer to, Jeopardy's way round -- so a miss teaches
            // four words rather than one.
            const source = question.choices?.[k];
            if (!right && !correct && source) {
              button.append(el('span', { class: 'drill-answers small muted' },
                prompt.map((f) => el('span', { ...locale(f), text: blank(/** @type {string} */ (source.values[f])) }))));
            }
          });
          mark.className = `drill-mark ${right ? 'right' : 'wrong'}`;
          // Revealed is not a miss and is not told it is one: it counts as wrong
          // in the tally, because the reader did not know it, and shows the answer.
          mark.textContent = right ? t('drill.right')
            : revealed ? t('drill.expected', { answer: blank(want) })
              : `${t('drill.wrong')} ${t('drill.expected', { answer: blank(want) })}`;
          return right ? 'right' : 'wrong';
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
          pick.append(new Option(blank(label), label));
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
        check: (revealed = false) => {
          let missed = false;
          for (const line of lines) {
            const want = /** @type {string} */ (line.row.values[field]);
            const right = !revealed && normalise(line.pick.value) === normalise(want);
            tally[right ? 'right' : 'wrong'] += 1;
            onAnswer(line.row.conceptId, right ? 'right' : 'wrong');
            if (revealed) line.pick.value = want;
            line.pick.disabled = true;
            line.mark.className = `drill-mark ${right ? 'right' : 'wrong'}`;
            line.mark.textContent = right ? t('drill.right')
              : revealed ? t('drill.expected', { answer: blank(want) })
                : `${t('drill.wrong')} ${t('drill.expected', { answer: blank(want) })}`;
            missed ||= !right;
          }
          return missed ? 'wrong' : 'right';
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
        check: (revealed = false, said = undefined) => {
          // Said rather than typed, the answer is one utterance, graded once against the
          // row's spoken form, and what was heard goes into the first box in its language.
          if (said) (boxes.find((b) => saidIn(b.field) === saidIn(question.asks[0])) ?? boxes[0]).box.value = said.text;
          /** @type {Verdict[]} */ const verdicts = [];
          for (const entry of boxes) {
            const want = /** @type {string} */ (row.values[entry.field]);
            const verdict = revealed ? 'wrong' : said?.verdict ?? grade(entry.box.value, want);
            verdicts.push(verdict);
            tally[verdict] += 1;
            // Revealed, the answer goes into the box itself, where the reader
            // would have typed it: the spelling is what they came to see.
            if (revealed) entry.box.value = want;
            entry.box.readOnly = true;
            entry.mark.className = `drill-mark ${verdict}`;
            // The expected string prints on every outcome, not only on a miss: a
            // typo inside the budget is graded right, and the reader still has to
            // see the spelling they nearly had.
            entry.mark.textContent = revealed
              ? t('drill.expected', { answer: blank(want) })
              : `${verdictText(verdict)} ${t('drill.expected', { answer: blank(want) })}`;
          }
          // One row asked for in two columns is one row known or not: the record
          // keeps the worse of its answers.
          const worst = verdicts.includes('wrong') ? 'wrong' : verdicts.includes('marks') ? 'marks' : 'right';
          onAnswer(row.conceptId, worst);
          return worst;
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
      // Stopping early still says how it went, over the questions answered so far.
      const quit = el('button', { type: 'button', class: 'ghost', text: t('drill.stop') });
      quit.addEventListener('click', () => { interrupt(); summarise(); });
      let graded = false;

      /**
       * Grade the question, by answer or by giving up on it, and turn Check into Next.
       * @param {boolean} revealed @param {{text:string, verdict:Verdict}} [said]
       */
      const settle = (revealed, said) => {
        graded = true;
        const verdict = panel.check(revealed, said);
        // Gone rather than hidden: it is used once per question, and the house button
        // rule sets a display that outranks `[hidden]`.
        reveal.remove();
        if (speak) speak.disabled = false;
        action.textContent = at + 1 < questions.length ? t('drill.next') : t('drill.finish');
        action.focus();
        return verdict;
      };

      // **Not knowing is an answer.** A learner stuck on a row could only guess or
      // close the quiz; either way they left without the one thing they wanted, the
      // answer. This shows it, in place, and counts the question as missed -- which
      // is what it was.
      const reveal = el('button', { type: 'button', class: 'ghost', text: t('drill.reveal') });
      reveal.addEventListener('click', () => { if (!graded) { interrupt(); settle(true); } });

      // **Hearing it is part of learning it**, and the engine is the board's own.
      // The target text of the row is what is read out -- in a matching question
      // there are several rows, so no Speak there. Enabled at once when the target
      // text is one of the columns shown, and only after grading when it is the
      // column being asked for: a learner typing the word should not be able to
      // have the answer read to them first.
      const target = question.rows.length === 1 ? question.rows[0] : null;
      const canSpeak = target && typeof target.values.script === 'string'
        && speech.getCapabilities(spec.target).voices.length > 0;
      const speak = canSpeak
        ? /** @type {HTMLButtonElement} */ (el('button', { type: 'button', text: t('board.speak') }))
        : null;
      if (speak && target) {
        speak.disabled = question.asks.includes('script');
        speak.addEventListener('click', () => {
          speech.speak({ text: sayable(/** @type {string} */ (target.values.script)), locale: spec.target })
            .catch(() => {});
        });
      }

      const form = /** @type {HTMLFormElement} */ (el('form', { class: 'drill-run' }, [
        el('div', { class: 'row drill-head' }, [
          el('span', {
            class: 'small muted',
            text: t('drill.progress', { at: at + 1, total: questions.length }),
          }),
          el('span', { class: 'spacer' }),
          ...(handsFree ? [voiceState] : []),
          el('span', { class: 'small muted', text: t('drill.seedIs', { seed }) }),
        ]),
        ...panel.body,
        el('div', { class: 'row', style: 'justify-content:flex-end' }, [
          ...(speak ? [speak] : []), reveal, quit, action,
        ]),
      ]));
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        // An answer typed or picked while hands-free is reading or listening is the answer.
        if (!graded) { interrupt(); settle(false); return; }
        at += 1;
        ask();
      });
      // **Enter means the same thing in all three shapes**, which needs saying
      // because none of them gets it for free. A lone text input submits
      // implicitly; a form of `<select>`s does not; and a chosen multiple-choice
      // option leaves focus on a `<button>`, whose own default for Enter is to
      // click itself -- so Enter re-picked the option the reader had just picked
      // and the question never graded. The two real buttons are the exception,
      // because pressing Enter on Check or Stop should do what pressing them
      // does. Space still selects an option, which is the radio convention.
      form.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        if (event.target === action || event.target === quit) return;
        event.preventDefault();
        form.requestSubmit(action);
      });

      show('run', [form]);
      panel.focus()?.focus();
      if (handsFree) converse(question, panel, settle, () => form.requestSubmit(action), form);
    }

    /**
     * One question, hands-free: read it out, listen, and do what was said -- answer it,
     * or skip, repeat or stop. A choice that was not a number, or silence, is listened
     * for once more; after that the reader is asked to press Listen again, rather than
     * the quiz listening for ever to a room.
     * @param {Question} question @param {Panel} panel
     * @param {(revealed:boolean, said?:{text:string, verdict:Verdict}) => Verdict} settle
     * @param {() => void} next @param {HTMLFormElement} form
     * @param {boolean} [again]  listening again, without reading the question again
     * @param {number} [tries]
     */
    async function converse(question, panel, settle, next, form, again = false, tries = 0) {
      const mine = (turn += 1);
      const row = question.rows[0];
      const field = question.asks[0];
      if (!again) {
        voiceSays('speaking', t('drill.voice.speaking'));
        /** @type {[string, string][]} */ const parts = [];
        for (const shown of prompt) {
          const part = spoken(row, shown);
          if (!parts.some(([text]) => text === part[0])) parts.push(part);
        }
        (question.choices ?? []).forEach((card, i) => {
          parts.push([digits[i], spec.source], spoken(card, field));
        });
        if (!await sayAll(parts, mine)) return;
      }
      voiceSays('listening', t('drill.voice.listening'));
      /** @type {string[]} */ let heard;
      try {
        heard = await listening.listen({ locale: question.kind === 'choice' ? spec.source : saidIn(field) });
      } catch (err) {
        if (mine !== turn) return;
        const reason = String(/** @type {any} */ (err).reason ?? err);
        stopHandsFree(reason === 'not-allowed' || reason === 'service-not-allowed'
          ? t('drill.voice.denied') : t('drill.voice.error', { error: reason }));
        return;
      }
      if (mine !== turn) return;

      // The answer first: a gloss that is itself "stop" is an answer, not a command.
      const n = question.kind === 'choice' ? numberIn(heard, numberWords(), digits) : 0;
      const said = question.kind === 'blank'
        ? heardVerdict(heard, saidIn(field) === spec.target
          ? [row.values.script ?? '', row.values.script_alt ?? ''].filter(Boolean)
          : [row.values[field] ?? ''])
        : null;
      const command = (n || (said && said.verdict !== 'wrong')) ? null : commandIn(heard, commands());
      if (command === 'stop') { interrupt(); summarise(); return; }
      if (command === 'repeat') { converse(question, panel, settle, next, form); return; }
      /** @type {Verdict} */ let verdict;
      if (command === 'skip') {
        verdict = settle(true);
      } else if (n && n <= (question.options?.length ?? 0)) {
        panel.pick?.(n - 1);
        verdict = settle(false);
      } else if (said) {
        verdict = settle(false, said);
      } else {
        // Nothing heard, or a choice that was not one of its numbers.
        if (tries < 1) { converse(question, panel, settle, next, form, true, tries + 1); return; }
        voiceSays('', heard.length ? t('drill.voice.unclear', { heard: heard[0] }) : t('drill.voice.silent'));
        const listen = el('button', { type: 'button', text: t('drill.voice.again') });
        listen.addEventListener('click', () => {
          listen.remove();
          converse(question, panel, settle, next, form, true);
        });
        form.querySelector('.drill-run > .row:last-child')?.prepend(listen);
        return;
      }
      // Then what it was, out loud, and on to the next question.
      voiceSays('speaking', t('drill.voice.speaking'));
      /** @type {[string, string][]} */ const told = command === 'skip' ? [] : [[verdictText(verdict), spec.source]];
      if (verdict !== 'right') told.push(spoken(row, field));
      if (await sayAll(told, mine)) next();
    }

    function summarise() {
      const total = tally.right + tally.marks + tally.wrong;
      const summary = t('drill.summary', {
        right: tally.right, marks: tally.marks, wrong: tally.wrong, total,
      });
      const again = el('button', { type: 'button', class: 'primary', text: t('drill.again') });
      again.addEventListener('click', () => setup());
      show('summary', [el('div', { class: 'drill-summary' }, [
        el('h2', { text: t('drill.summaryHeading') }),
        el('p', { text: summary }),
        el('p', { class: 'small muted', text: t('drill.seedIs', { seed }) }),
        el('div', { class: 'row', style: 'justify-content:flex-end' }, [again]),
      ])]);
      again.focus();
      if (handsFree) sayAll([[summary, spec.source]], (turn += 1));
    }

    recount = () => {};
    ask();
    // The setup above it may have been a long form; the question starts where it did.
    root.scrollIntoView({ block: 'start' });
  }
}

/** @param {Verdict} verdict */
function verdictText(verdict) {
  if (verdict === 'right') return t('drill.right');
  if (verdict === 'marks') return t('drill.marks');
  return t('drill.wrong');
}
