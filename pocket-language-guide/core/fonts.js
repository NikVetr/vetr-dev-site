// Font resolution and metrics. fontkit does the OpenType shaping, so the same
// advances feed the solver, the DOM preview and the PDF -- there is no second
// measurement path to keep in sync.

import * as fontkit from '../vendor/fontkit.esm.js';

/** Which script a field is written in, given the sheet's language pair. */
// Which language a field belongs to, and so which font stack draws it. Two of
// these were wrong, both in the same way -- named for where the column *sits* on
// the row rather than for the language whose text lands in it, which only matters
// once the two sides use different scripts:
//
//   `numeral` is the label column of a number table and reads from the same cell
//   as the gloss (see core/pack.js), so it is source-side. Calling it Latin drew
//   an Arabic, Hindi, Thai or CJK gloss in the condensed Latin face, which has
//   none of those glyphs and printed a row of boxes in the PDF.
//
//   `literal` prints on the reader's side of the row but is read from the
//   *target* row, and forty-one Korean literals quote Hangul while fifty-six
//   Arabic ones are in Arabic. Drawn in the source's stack those were boxes for
//   every reader but their own.
const FIELD_SIDE = {
  script: 'target', script_alt: 'target', roman: 'latin', ipa: 'latin',
  gloss: 'source', literal: 'target', respell: 'source', numeral: 'source',
};

/**
 * @typedef {Object} Face
 * @property {import('../vendor/fontkit.esm.js').Font} font
 * @property {number} upem
 * @property {number} ascent
 * @property {number} descent  negative
 * @property {string} key
 */

/**
 * @param {(file:string)=>Promise<Uint8Array>} loadBytes  resolves `data/fonts/<file>.ttf`
 * @param {{faces:{stack:string,weight:number,italic:boolean,file:string}[]}} manifest
 */
export function createFontRegistry(loadBytes, manifest) {
  /** @type {Map<string,Face>} */ const loaded = new Map();
  const available = new Set(manifest.faces.map((f) => `${f.stack}|${f.weight}|${f.italic}`));
  const stacks = new Set(manifest.faces.map((f) => f.stack));
  /** @param {string} stack */
  const hasStack = (stack) => stacks.has(stack);

  /** Nearest available face in a stack: italics and bold are optional per stack. */
  /** @param {string} stack @param {number} weight @param {boolean} italic */
  function pick(stack, weight, italic) {
    for (const [w, i] of [[weight, italic], [weight, false], [400, italic], [400, false]]) {
      if (available.has(`${stack}|${w}|${i}`)) return { stack, weight: w, italic: i };
    }
    throw new Error(`no face for stack ${stack} (wanted ${weight}${italic ? 'i' : ''})`);
  }

  return {
    /**
     * The stack to use for a base stack and a chosen typeface. Not every script has
     * every typeface -- there is no condensed Arabic serif here -- so a missing
     * variant falls back to the sans face rather than failing: a serif sheet with
     * one sans column is a compromise, a crash is not.
     * @param {string} base
     * @param {import('./types.js').SheetSpec['typeface']} typeface
     */
    stackFor(base, typeface) {
      if (typeface === 'sans') return base;
      const variant = `${base}-${typeface}`;
      return stacks.has(variant) ? variant : base;
    },

    /** @param {{stack:string,weight:number,italic:boolean}[]} wanted */
    async load(wanted) {
      for (const w of wanted) {
        const { stack, weight, italic } = pick(w.stack, w.weight, w.italic);
        const file = `${stack}-${weight}${italic ? 'i' : ''}`;
        if (loaded.has(file)) continue;
        const font = fontkit.create(await loadBytes(`${file}.ttf`));
        loaded.set(file, {
          font, key: file, upem: font.unitsPerEm, ascent: font.ascent, descent: font.descent,
        });
      }
    },

    /**
     * @param {string} stack @param {number} weight @param {boolean} italic
     * @returns {Face}
     */
    face(stack, weight, italic) {
      const p = pick(stack, weight, italic);
      const file = `${p.stack}-${p.weight}${p.italic ? 'i' : ''}`;
      const face = loaded.get(file);
      if (!face) throw new Error(`face ${file} not loaded -- call load() first`);
      return face;
    },

    /** @returns {string[]} font files needed to render this pair, for preloading */
    filesFor(/** @type {string[]} */ stacks) {
      /** @type {[number,boolean][]} */
      const wanted = [[400, false], [700, false], [400, true], [700, true]];
      const files = new Set();
      for (const stack of stacks) {
        // A serif variant we do not ship is not an error here: stackFor falls back
        // to the sans face, so there is simply nothing to preload.
        if (!stacks.includes(stack) || !hasStack(stack)) continue;
        for (const [weight, italic] of wanted) {
          const p = pick(stack, weight, italic);
          files.add(`${p.stack}-${p.weight}${p.italic ? 'i' : ''}`);
        }
      }
      return [...files];
    },
  };
}

/**
 * Which font stack and text direction a field needs. Derived rather than stored
 * per theme: `script` is always the target's, `gloss` always the source's, and
 * romanisation is Latin by definition.
 * @param {import('./types.js').FieldId} field
 * @param {string} targetIso   ISO 15924 code of the target language's script
 * @param {string} sourceIso
 * @param {Record<string,Record<string,string>>} scripts
 */
export function resolveField(field, targetIso, sourceIso, scripts) {
  const side = FIELD_SIDE[field];
  const iso = side === 'target' ? targetIso : side === 'source' ? sourceIso : 'Latn';
  const row = scripts[iso];
  if (!row) throw new Error(`unknown script ${iso} for field ${field}`);
  return { stack: row.font_stack, dir: /** @type {'ltr'|'rtl'} */ (row.direction), iso };
}

/** True for fields carrying the target language's own writing, which take a rule
 * for an open slot; source-side fields take an ellipsis instead. */
/** @param {import('./types.js').FieldId} field */
export function isTargetSide(field) {
  return FIELD_SIDE[field] === 'target' || field === 'roman' || field === 'ipa';
}
