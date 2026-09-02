// Text measurement and line breaking.
//
// The solver only ever asks two things: how wide is this run, and how tall is it
// at width W. Advances come from fontkit's shaping output, cached in em units so
// the same string at a different type scale is still a cache hit.

const SLOT = '{}';
const SLOT_ELLIPSIS = '…';
// The reference sheet drew an open slot as a 0.47in rule under 7.30pt text.
const SLOT_RULE_EMS = 4.6;

/**
 * Where a space-delimited line may break: after a space, a tab, a newline, an
 * ideographic space, a hyphen, an en or em dash, or a slash.
 *
 * Spelled out rather than written `\s`, because JavaScript's `\s` matches U+00A0 and
 * U+202F -- and a no-break space is a request *not* to break. The French pack has
 * 228 of them, holding `Thaïlande :` and `7 h` together, and every one of them was
 * silently a legal break point. Nothing visibly broke, which is the problem: the
 * guarantee was typographic intent and nothing more, and the French translator found
 * it by reading the regex rather than the output.
 */
const BREAK_AFTER = /(?<=[ \t\n\u3000\u2013\u2014\-/])/;

// Minimal kinsoku: never strand closing punctuation at the start of a line, and
// never leave an opening bracket dangling at the end of one.
//
// The Thai and Lao entries are doing something different from the CJK ones. Those
// two scripts want dictionary line breaking, which is not implemented, so a line
// may break between any two characters -- but breaking *inside* a character cluster
// is not merely a poor word division, it is broken text: a tone mark or a vowel
// orphaned at the start of a line renders over a dotted circle, and a leading vowel
// left at the end of one is separated from the consonant it is pronounced after.
// Gluing the combining marks and the spacing vowels to the consonant they belong to
// is the cheap core of a Thai character cluster segmenter, and it costs one string.
const THAI_MARKS = '\u0E31\u0E33\u0E34\u0E35\u0E36\u0E37\u0E38\u0E39\u0E3A'
  + '\u0E47\u0E48\u0E49\u0E4A\u0E4B\u0E4C\u0E4D\u0E4E\u0E30\u0E32\u0E45\u0E46';
const THAI_LEAD_VOWELS = '\u0E40\u0E41\u0E42\u0E43\u0E44';
const NO_LINE_START = `、。，．：；？！）」』》＞…${THAI_MARKS}`;
const NO_LINE_END = `（「『《＜${THAI_LEAD_VOWELS}`;

/**
 * A unit of text that never splits. `w` includes any trailing space; `inkW` is
 * the visible width, which is what matters when the piece ends a line. Both are
 * in points for the caller, and cached internally in em units.
 * @typedef {{type:'text'|'slot', text:string, w:number, inkW:number}} Piece
 */

/**
 * @typedef {Object} RunStyle
 * @property {string} stack
 * @property {number} weight
 * @property {boolean} italic
 * @property {number} size
 * @property {number} leading
 * @property {'ltr'|'rtl'} dir
 * @property {'space'|'any'|'dict'} wordBreak
 * @property {boolean} slotAsRule
 */

/**
 * @param {ReturnType<import('./fonts.js').createFontRegistry>} registry
 * @param {{max?:number}} [opts]
 */
export function createMeasurer(registry, opts = {}) {
  const max = opts.max ?? 20000;
  /** @type {Map<string,number>} */ const cache = new Map();
  /** @type {Map<string,Piece[]>} */ const pieceCache = new Map();

  /**
   * Advance of `text` in em units for one face.
   * @param {string} text @param {RunStyle} style
   */
  function advanceEm(text, style) {
    const face = registry.face(style.stack, style.weight, style.italic);
    const key = `${face.key} ${text}`;
    let em = cache.get(key);
    if (em === undefined) {
      em = text === '' ? 0 : face.font.layout(text).advanceWidth / face.upem;
      if (cache.size >= max) {
        cache.delete(/** @type {string} */ (cache.keys().next().value));
      }
      cache.set(key, em);
    }
    return em;
  }

  /**
   * The atoms a line may be built from.
   *
   * Space-delimited scripts break after whitespace and after an existing hyphen
   * or slash. No hyphen is ever inserted -- like the reference, we never
   * hyphenate -- but refusing to break at one that is already there is what forced
   * the respelling column ("jong-dyen-jahn") and glosses like "high-speed" to
   * reserve their full natural width, squeezing every other column.
   *
   * Scripts that break anywhere yield single characters, subject to kinsoku.
   * @param {string} segment @param {RunStyle['wordBreak']} wordBreak
   */
  function atoms(segment, wordBreak) {
    if (wordBreak === 'space') {
      return segment.split(BREAK_AFTER).filter((s) => s !== '');
    }
    // 'dict' needs a Thai/Khmer dictionary; until one ships it breaks as 'any',
    // and solve/index.js raises a warning for those scripts. The glue below still
    // holds each character cluster together, so the breaks are in the wrong places
    // rather than inside a syllable.
    /** @type {string[]} */ const out = [];
    for (const ch of segment) {
      const prev = out.length ? out[out.length - 1] : '';
      const glue = prev !== ''
        && (NO_LINE_START.includes(ch) || NO_LINE_END.includes(prev[prev.length - 1]));
      if (glue) out[out.length - 1] = prev + ch;
      else out.push(ch);
    }
    return out;
  }

  /**
   * Split text into atomic pieces, widths in em. Break opportunities live between
   * pieces, so the line builder never re-inspects the text.
   *
   * Cached in em rather than points because the width solvers evaluate the same
   * string at dozens of candidate widths, and auto-fit then repeats all of it at
   * each candidate type scale. Em-keyed entries survive both.
   * @param {string} text @param {RunStyle} style @returns {Piece[]}
   */
  function piecesEm(text, style) {
    const key = `${registry.face(style.stack, style.weight, style.italic).key}|`
      + `${style.wordBreak}|${style.slotAsRule ? 'r' : 'e'}|${text}`;
    const hit = pieceCache.get(key);
    if (hit) return hit;

    /** @type {Piece[]} */ const out = [];
    const parts = text.split(SLOT);
    parts.forEach((part, i) => {
      for (const atom of atoms(part, style.wordBreak)) {
        const bare = atom.trimEnd();
        const w = advanceEm(atom, style);
        out.push({ type: 'text', text: atom, w, inkW: bare === atom ? w : advanceEm(bare, style) });
      }
      if (i < parts.length - 1) {
        const w = style.slotAsRule ? SLOT_RULE_EMS : advanceEm(SLOT_ELLIPSIS, style);
        out.push({
          type: style.slotAsRule ? 'slot' : 'text',
          text: style.slotAsRule ? '' : SLOT_ELLIPSIS,
          w,
          inkW: w,
        });
      }
    });
    if (pieceCache.size >= max) {
      pieceCache.delete(/** @type {string} */ (pieceCache.keys().next().value));
    }
    pieceCache.set(key, out);
    return out;
  }

  /** Same pieces, scaled to points. @param {string} text @param {RunStyle} style */
  function pieces(text, style) {
    return piecesEm(text, style).map((p) => ({
      ...p, w: p.w * style.size, inkW: p.inkW * style.size,
    }));
  }

  return {
    /**
     * Natural single-line width, ignoring wrapping.
     * @param {string} text @param {RunStyle} style
     */
    width(text, style) {
      const all = piecesEm(text, style);
      if (!all.length) return 0;
      let total = all[all.length - 1].inkW;
      for (let i = 0; i < all.length - 1; i += 1) total += all[i].w;
      return total * style.size;
    },

    /**
     * Greedy line breaking. A piece's trailing space hangs past the right edge,
     * as it does in every typesetter, so it never forces a break by itself.
     * @param {string} text @param {number} avail @param {RunStyle} style
     * @returns {{lines:Piece[][], width:number, height:number}}
     */
    wrap(text, avail, style) {
      /** @type {Piece[][]} */ const lines = [];
      /** @type {Piece[]} */ let line = [];
      let w = 0;
      for (const piece of pieces(text, style)) {
        if (line.length && w + piece.inkW > avail + 0.01) {
          lines.push(line);
          line = [piece];
          w = piece.w;
        } else {
          line.push(piece);
          w += piece.w;
        }
      }
      if (line.length) lines.push(line);
      if (!lines.length) return { lines: [], width: 0, height: 0 };
      const width = Math.max(...lines.map((l) => inkWidth(l)));
      return { lines, width, height: lines.length * style.leading };
    },

    /**
     * Line count at a given width. Hot path in the split search, so it avoids
     * building the line arrays.
     * @param {string} text @param {number} avail @param {RunStyle} style
     */
    lineCount(text, avail, style) {
      // Compared in em so the cached piece widths are used directly. The hot path
      // of the whole engine: the width solvers call this tens of times per cell.
      const limit = avail / style.size + 1e-4;
      let count = 1;
      let w = 0;
      let started = false;
      for (const piece of piecesEm(text, style)) {
        if (started && w + piece.inkW > limit) {
          count += 1;
          w = piece.w;
        } else {
          w += piece.w;
          started = true;
        }
      }
      return started ? count : 0;
    },

    /**
     * Widest single unbreakable piece. A column narrower than this cannot help
     * overflowing, so the width solvers use it as a floor.
     * @param {string} text @param {RunStyle} style
     */
    maxAtomWidth(text, style) {
      let widest = 0;
      for (const p of piecesEm(text, style)) widest = Math.max(widest, p.inkW);
      return widest * style.size;
    },

    /**
     * Id of the face that will actually be used. Requesting a style a stack does
     * not have (CJK has no italic) falls back, and callers must record the face
     * they got so renderers do not synthesise a different one.
     * @param {RunStyle} style
     */
    faceKey(style) {
      return registry.face(style.stack, style.weight, style.italic).key;
    },

    /**
     * Baseline offset from the top of a line box, taken from the face's own
     * ascent/descent split rather than a magic constant.
     * @param {RunStyle} style
     */
    baselineOffset(style) {
      const face = registry.face(style.stack, style.weight, style.italic);
      return style.leading * (face.ascent / (face.ascent - face.descent));
    },

    stats() {
      return { advances: cache.size, pieces: pieceCache.size };
    },
  };
}

/** Visible width of one assembled line. @param {Piece[]} line */
export function inkWidth(line) {
  if (!line.length) return 0;
  return line.slice(0, -1).reduce((sum, p) => sum + p.w, 0) + line[line.length - 1].inkW;
}
