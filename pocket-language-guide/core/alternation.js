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

/**
 * Variants of one sentence, one per gender, put back into a single cell: the words
 * they share, and where they differ, the alternatives -- after the start the word
 * shares when that is at least `MIN_STEM` characters (`ser-KAH-n[oh|ah]`), whole
 * otherwise (`[el|la]`). How the respelling of a varied row is made, since the
 * respeller reads one sentence at a time.
 * @param {string[]} variants
 */
export function joinAlternates(variants) {
  const words = variants.map((v) => v.split(' '));
  if (words.some((w) => w.length !== words[0].length)) {
    throw new Error(`alternatives do not line up word for word: ${variants.join(' | ')}`);
  }
  return words[0].map((_, k) => {
    const forms = words.map((w) => w[k]);
    if (forms.every((f) => f === forms[0])) return forms[0];
    let n = 0;
    while (n < forms[0].length && forms.every((f) => f[n] === forms[0][n])) n += 1;
    // Never between a letter and its combining mark.
    while (n > 0 && /\p{M}/u.test(forms[0][n] ?? '')) n -= 1;
    const stem = n >= MIN_STEM ? forms[0].slice(0, n) : '';
    return `${stem}[${forms.map((f) => f.slice(stem.length)).join('|')}]`;
  }).join(' ');
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
