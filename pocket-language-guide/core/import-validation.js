// Imported settings are data, never markup or paths. Cards and backups share these
// checks so neither route can install a value the studio cannot read.

/** @typedef {(v:any) => boolean} Check */
/** @param {unknown} v @returns {v is Record<string, any>} */
export const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** @type {Check} */ const text = (v) => typeof v === 'string';
/** @type {Check} */ const identifier = (v) => text(v) && /^[\w-]+$/.test(v);
/** @type {Check} */ const rowId = (v) => text(v) && v.length > 0 && !['__proto__', 'constructor', 'prototype'].includes(v);
/** @type {Check} */ const bool = (v) => typeof v === 'boolean';
/** @param {number} min @param {number} max @returns {Check} */
const number = (min, max) => (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
/** @param {number} min @param {number} max @returns {Check} */
const integer = (min, max) => (v) => Number.isInteger(v) && number(min, max)(v);
/** @param {string[]} values @returns {Check} */ const oneOf = (values) => (v) => values.includes(v);
/** @param {Check} check @returns {Check} */ const list = (check) => (v) => Array.isArray(v) && v.every(check);
/** @param {Check} check @returns {Check} */ const record = (check) => (v) => plain(v) && Object.values(v).every(check);
/** @param {Record<string, Check>} fields @param {boolean} [partial] @returns {Check} */
const shape = (fields, partial = false) => (v) => plain(v)
  && Object.keys(v).every((key) => Object.hasOwn(fields, key))
  && Object.entries(fields).every(([key, check]) => partial && !Object.hasOwn(v, key) || check(v[key]));
/** @param {Check} check @returns {Check} */ const optional = (check) => (v) => v === undefined || check(v);

const count = integer(0, Number.MAX_SAFE_INTEGER);
const fraction = number(0, 1);
const dimension = number(1, 10000);
const faces = integer(0, 128); // zero requests automatic fitting
const color = /** @type {Check} */ ((v) => text(v) && /^#[\da-f]{6}$/i.test(v));
const colorRole = /** @type {Check} */ ((v) => text(v) && /^[\w.-]*$/.test(v));
export const CUSTOM_TEMPLATES = ['entry', 'ref', 'refphrase', 'num'];
const fields = ['script', 'script_alt', 'roman', 'ipa', 'gloss', 'respell', 'literal', 'numeral'];
const values = shape(Object.fromEntries(fields.map((field) => [field, text])), true);
const arrangement = oneOf(['mixed', 'two-column', 'one-row', 'stacked']);
const split = oneOf(['consistent', 'adaptive']);
const selection = shape({ sections: record(bool), items: record(bool) });
const slot = oneOf(['none', 'page', 'pair', 'region', 'legend', 'theme', 'logo', 'custom']);
/** @type {Check} */ const slots = (v) => slot(v) || list(slot)(v);
const band = shape({
  at: oneOf(['none', 'top', 'bottom']), span: oneOf(['full', 'left', 'center', 'right']),
  left: slots, center: slots, right: slots, text,
  fill: colorRole, colour: colorRole, fillReach: oneOf(['band', 'corner', 'edge']),
}, true);
const spec = shape({
  target: identifier, source: identifier, accent: identifier, romanization: text,
  register: identifier, region: text, speaker: record(text), fieldSet: list(oneOf(fields)),
  geometry: shape({
    pageW: dimension, pageH: dimension, marginTop: number(0, 5000), marginBottom: number(0, 5000),
    marginLeft: number(0, 5000), marginRight: number(0, 5000), columns: integer(1, 32),
    columnGap: number(0, 5000), faces, fold: oneOfNumbers([2, 3]), foldSized: oneOf(['panel', 'sheet']),
    screen: bool, reserve: shape({ top: fraction, bottom: fraction }),
    name: text, note: text, captionKey: text, phone: bool, model: bool, models: text, aspect: number(0.1, 10),
  }, true),
  paper: shape({ presetId: identifier, borderless: bool, oversprayPct: number(0, 100),
    nonprintablePt: number(0, 5000), minRulePt: number(0, 100), minSizeDelta: number(-100, 100) }, true),
  themeId: identifier, themeColors: record(color),
  typeface: oneOf(['sans', 'serif', 'cond', 'cond-serif']), inkMode: oneOf(['full', 'low-ink', 'mono']),
  ornamentStyle: oneOf(['classic', 'language', 'botanical', 'waves', 'mosaic', 'weave', 'laurel', 'starforge']),
  head: band, foot: band,
  background: shape({ mode: oneOf(['none', 'tint', 'flag', 'sections']), color,
    strength: fraction, rowShading: fraction, flagRegions: list(identifier) }, true),
  autoFaces: bool, padding: number(0, 100), arrangement, split, flush: bool,
  sectionColors: record(colorRole), itemOrder: record(list(text)),
  sectionFormats: record(shape({ across: integer(1, 32), arrangement, split }, true)),
  lockScreen: shape({ level: oneOf(['beginner', 'intermediate', 'advanced']),
    kept: shape({ selection, autoFaces: bool, faces }) }),
  scale: number(0, 10), priority: fraction, selection,
}, true);
/** @param {number[]} choices @returns {Check} */ function oneOfNumbers(choices) { return (v) => choices.includes(v); }

/** @type {Check} */
export const validEdits = shape({
  overrides: optional(record(shape({ values: optional(values), include: optional(bool) }))),
  extras: optional(list(shape({ conceptId: rowId, sectionId: rowId, template: oneOf(CUSTOM_TEMPLATES),
    weight: fraction, values }))),
});

/** Check the JSON envelope before walking any settings. @param {unknown} value @param {number} depth
 * @param {string} at @param {string[]} problems */
export function checkShape(value, depth, at, problems) {
  if (depth > 8) { problems.push(`${at}: nested deeper than 8`); return; }
  if (value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach((v, i) => checkShape(v, depth + 1, `${at}[${i}]`, problems)); return; }
  if (!plain(value)) { problems.push(`${at}: not text or a plain value`); return; }
  for (const [key, v] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) problems.push(`${at}: unsafe key ${key}`);
    else checkShape(v, depth + 1, `${at}.${key}`, problems);
  }
}

/** @param {unknown} value @param {boolean} [stored] @returns {string[]} */
export function cardProblems(value, stored = false) {
  if (!plain(value)) return ['card: not an object'];
  /** @type {string[]} */ const problems = [];
  checkShape(value, 0, 'card', problems);
  for (const key of ['name', 'target', 'source', ...(stored ? ['id'] : [])]) {
    if (!text(value[key]) || !value[key]) problems.push(`card.${key}: missing`);
    else if (key !== 'name' && !identifier(value[key])) problems.push(`card.${key}: invalid identifier`);
  }
  if (!plain(value.spec)) problems.push('card.spec: not an object');
  else if (!spec(value.spec)) problems.push('card.spec: invalid settings');
  if (!shape({ mode: oneOf(['', 'cut', 'fold']), flip: oneOf(['short-edge', 'long-edge']) })(value.finish)) problems.push('card.finish: invalid finish');
  if (!shape({ sections: count, items: count, faces, width: dimension, height: dimension })(value.summary)) problems.push('card.summary: invalid summary');
  if (!number(36, 2400)(value.dpi)) problems.push('card.dpi: expected a number from 36 to 2400');
  if (!count(value.at) || !optional(count)(value.binned)) problems.push('card.at: invalid timestamp');
  if (!optional(validEdits)(value.edits)) problems.push('card.edits: not a set of edits');
  return problems;
}

/** @type {Check} */
export const validUsage = shape({ items: record(shape({
  at: shape({ board: text, node: text, button: text, phrase: optional(text) }),
  by: record(shape({ n: count, d: record(count) })), said: optional(record(text)),
})) });
/** @type {Check} */ const tally = (v) => Array.isArray(v) && v.length === 3 && v.every(count);
/** @type {Check} */
export const validQuiz = shape({ pairs: record(shape({ n: tally, days: record(tally),
  rows: record(shape({ n: tally, last: oneOf(['right', 'marks', 'wrong']) })),
})) });
