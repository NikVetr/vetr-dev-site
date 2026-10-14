// A template's words that agree with whatever fills its slot.
//
// `¿Dónde está [el|la] {} más cercan[o|a]?`: the article and the adjective agree with
// the place the traveller writes into the blank, which the card cannot know, so it
// offers both -- one alternative per gender, in the order `data/registry/genders.csv`
// gives the language -- and prints them `el/la` and `cercano/a`, each in its gender's
// colour. The board never needs this: the only blanks it fills are a name and a
// country, each a whole sentence of its own.

const GROUP = /\[([^[\]{}]*\|[^[\]{}]*)\]/gu;
/** A word's start is shared only this far into it, or the alternatives stay whole. */
const MIN_STEM = 3;
/** A shared end has to be the body of the word to read as one: `j/take` reads as two words. */
const MIN_TAIL = 6;

/** @typedef {{at: number, alts: string[]}} Group  `at` is where it starts in the printed text */

/**
 * A cell as it is printed, and where its alternatives sit in it.
 * @param {string} text
 * @returns {{text: string, groups: Group[]}}
 */
export function parseAlternates(text) {
  /** @type {Group[]} */ const groups = [];
  let out = '';
  let last = 0;
  for (const m of text.matchAll(GROUP)) {
    out += text.slice(last, m.index);
    const alts = m[1].split('|');
    groups.push({ at: out.length, alts });
    out += alts.join('/');
    last = /** @type {number} */ (m.index) + m[0].length;
  }
  return { text: out + text.slice(last), groups };
}

/** A cell as it is printed, for a label or a measurement. @param {string} text */
export const printed = (text) => parseAlternates(text).text;

/** How many alternatives a cell's groups offer, or 0 for a cell with none. @param {string} text */
export function alternativeCount(text) {
  const first = GROUP.exec(text);
  GROUP.lastIndex = 0;
  return first ? first[1].split('|').length : 0;
}

/** The cell as it is said for the `i`th gender. @param {string} text @param {number} i */
export function alternative(text, i) {
  return text.replace(GROUP, (_, body) => body.split('|')[i]);
}

const STRESS = /[ˈˌ]/gu;

/** How far all the forms agree from the start, never stopping before a combining mark. @param {string[]} forms */
function sharedStart(forms) {
  let n = 0;
  while (n < forms[0].length && forms.every((f) => f[n] === forms[0][n])) n += 1;
  while (n > 0 && /\p{M}/u.test(forms[0][n] ?? '')) n -= 1;
  return n;
}

/** How far all the forms agree from the end, never starting on a combining mark. @param {string[]} forms */
function sharedEnd(forms) {
  const at = (/** @type {string} */ f, /** @type {number} */ m) => f[f.length - 1 - m];
  let m = 0;
  while (m < forms[0].length && forms.every((f) => at(f, m) === at(forms[0], m))) m += 1;
  while (m > 0 && /\p{M}/u.test(forms[0][forms[0].length - m])) m -= 1;
  return m;
}

/**
 * One word's forms, one per gender, as a single word: the start they share when it is
 * at least `MIN_STEM` characters (`θeɾkˈan[o|a]`) and the end when it is at least
 * `MIN_TAIL` (`[d|t]ˈɪxtst…`), the whole forms otherwise (`[el|la]`). A respelling's hyphens are its syllables, so there
 * a shared part stops at one (`ser-KA-[no|na]`, never `ser-KA-n[o|a]`). Forms apart only
 * in where a stress mark falls are one reading.
 * @param {string[]} forms
 */
function joinWord(forms) {
  if (forms.every((f) => f.replace(STRESS, '') === forms[0].replace(STRESS, ''))) return forms[0];
  const word = forms[0];
  let head = sharedStart(forms);
  let tail = Math.min(sharedEnd(forms), Math.min(...forms.map((f) => f.length)) - head);
  if (forms.some((f) => f.includes('-'))) {
    head = word.lastIndexOf('-', head - 1) + 1;
    const from = word.indexOf('-', word.length - tail);
    tail = from < 0 ? 0 : word.length - from;
  }
  if (head < MIN_STEM) head = 0;
  if (tail < MIN_TAIL) tail = 0;
  return `${word.slice(0, head)}[${forms.map((f) => f.slice(head, f.length - tail)).join('|')}]${word.slice(word.length - tail)}`;
}

/**
 * Variants of one sentence, one per gender, put back into a single cell word by word
 * (`joinWord`): how the respelling of a varied row is made, since the respeller reads
 * one sentence at a time. `join_alternates` in scripts/build_ipa.py does the same for
 * the IPA.
 * @param {string[]} variants
 */
export function joinAlternates(variants) {
  const words = variants.map((v) => v.split(' '));
  if (words.some((w) => w.length !== words[0].length)) {
    throw new Error(`alternatives do not line up word for word: ${variants.join(' | ')}`);
  }
  return words[0].map((_, k) => joinWord(words.map((w) => w[k]))).join(' ');
}

/**
 * A printed cell as said for each gender in turn, from where its alternatives sit
 * (`parseAlternates`); just the cell when it has none.
 * @param {string} text @param {Group[]} [groups]
 */
export function printedAlternatives(text, groups) {
  if (!groups?.length) return [text];
  return groups[0].alts.map((_, i) => {
    let out = '';
    let last = 0;
    for (const group of groups) {
      out += text.slice(last, group.at) + group.alts[i];
      last = group.at + group.alts.join('/').length;
    }
    return out + text.slice(last);
  });
}

/** The cell as said for each gender in turn, or just the cell. @param {string} text */
export function alternatives(text) {
  const count = alternativeCount(text);
  return count ? Array.from({ length: count }, (_, i) => alternative(text, i)) : [text];
}

/**
 * `fn` applied to a cell one gender at a time, joined back into one cell; a cell with
 * no groups is simply `fn` of it.
 * @param {string} text @param {(said: string) => string} fn
 */
export function perAlternative(text, fn) {
  return alternativeCount(text) ? joinAlternates(alternatives(text).map(fn)) : fn(text);
}
