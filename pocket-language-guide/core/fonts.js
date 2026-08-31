// Font resolution and metrics. fontkit does the OpenType shaping, so the same
// advances feed the solver, the DOM preview and the PDF -- there is no second
// measurement path to keep in sync.

import * as fontkit from '../vendor/fontkit.esm.js';

/** Which script a field is written in, given the sheet's language pair. */
const FIELD_SIDE = {
  script: 'target', script_alt: 'target', roman: 'latin', ipa: 'latin',
  gloss: 'source', literal: 'source', respell: 'source', numeral: 'latin',
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

  /** Nearest available face in a stack: italics and bold are optional per stack. */
  /** @param {string} stack @param {number} weight @param {boolean} italic */
  function pick(stack, weight, italic) {
    for (const [w, i] of [[weight, italic], [weight, false], [400, italic], [400, false]]) {
      if (available.has(`${stack}|${w}|${i}`)) return { stack, weight: w, italic: i };
    }
    throw new Error(`no face for stack ${stack} (wanted ${weight}${italic ? 'i' : ''})`);
  }

  return {
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
