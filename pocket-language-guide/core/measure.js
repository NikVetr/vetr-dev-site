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
// Two of these are conditional, and both conditions come from real rows.
//
// Break after a hyphen that joins two words (`no-pork`), never after one that
// opens a token: every language's number note lists the Japanese counters as
// `-tsu`, `-mai`, `-hon`, and an unconditional rule offered a break between the
// hyphen and its own word, so a bare `-` dangled at the end of a line.
//
// Break after a slash only when at least two characters follow it. Gendered forms
// are written `solo/a`, `alérgico/a`, `vegetariano/a` in Italian, Spanish and
// Portuguese, and breaking there orphans a single letter onto the next line --
// which reads as a typo rather than as a wrap.
const BREAK_AFTER = /(?<=[ \t\n\u3000\u2013\u2014])|(?<=[^\s-]-)|(?<=\/)(?=\S{2})/;

// In a script that breaks anywhere, a Latin word embedded in it is still one
// atom: `any` means between ideographs, kana and hangul, not inside a
// romanisation printed among them. Without this, `ichiman` in a Japanese note
// could break after any of its letters. Han, kana, hangul, Thai and Khmer are
// excluded because breaking between those characters is the whole point.
const WORDISH = /[\p{L}\p{N}\p{M}]/u;
const BREAKS_ANYWHERE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Khmer}\p{Script=Lao}]/u;
/* **A digit is never a break opportunity, whatever script it belongs to.** Thai and
   Khmer digits carry `Script=Thai`/`Script=Khmer`, so `BREAKS_ANYWHERE` made them
   non-`wordish` and the glue clause never welded them: `๑๐๐` in the *shipped* Thai
   pack measured as three atoms, and a line could break inside a number. Found by the
   Khmer survey looking for its own `១១៩`, which does the same. Latin digits were
   never affected, which is why this survived so long. */
const NUMERIC = /\p{N}/u;
/** @param {string} ch */
const wordish = (ch) => ch !== '' && WORDISH.test(ch)
  && (!BREAKS_ANYWHERE.test(ch) || NUMERIC.test(ch));

// Punctuation that sits *inside* a word or a number rather than after it, so an
// any-breaking script does not split it. Found in a Chinese note, where `16:00`
// wrapped as `16:` and `00`; `0.1 yuan` and `1/2` are the same shape. It only
// glues when a word character follows, so a colon or comma that really does end a
// clause still offers the break after it.
const IN_WORD = '-:./,';

// Minimal kinsoku: never strand closing punctuation at the start of a line, and
// never leave an opening bracket dangling at the end of one.
//
// The Thai and Khmer entries are doing something different from the CJK ones —and
// the comment here used to say "Thai and Lao", which was wrong twice: Lao is in
// neither `BREAKS_ANYWHERE` nor this set, and Khmer is in both. Those two scripts
// want dictionary line breaking, which is not implemented, so a line may break
// between any two characters —but breaking *inside* a character cluster is not
// merely a poor word division, it is broken text: a tone mark or a vowel orphaned at
// the start of a line renders over a dotted circle, and a leading vowel left at the
// end of one is separated from the consonant it is pronounced after. Gluing the
// combining marks and the spacing vowels to the consonant they belong to is the cheap
// core of a character cluster segmenter, and it costs one string.
//
// **Khmer's half was missing until a Burmese survey went looking for it.** Khmer is
// in `BREAKS_ANYWHERE` but had no marks here, so `ភ្នំពេញ` measured as *seven* atoms, one
// per codepoint, and a line could open on a bare coeng — U+17D2, whose whole job is
// to bind the consonant after it into a subscript. Nothing had noticed because no
// Khmer pack exists yet; it would have shipped broken on the day one did.
//
// **Lao is the third of these and was in neither list, which is the opposite
// failure.** With no Lao in `BREAKS_ANYWHERE`, `wordish` was true of every Lao
// letter, the glue clause welded every adjacent pair, and a whitespace-delimited
// Lao run was *one unbreakable atom* — measured at 8.78em for `ຂ້ອຍເສຍໜັງສືຜ່ານແດນ`
// ("I lost my passport") against the 9.9-10.3em that `rowsplit.js`'s 0.6 floor cap
// allows a column at 7pt. That is a 12-17% margin on the reference sheet and none
// at all on a narrower card, and an over-wide atom overflows rather than splitting,
// because `wrap` puts it on its own line whole. Lao is therefore in both lists now,
// which is Thai's arrangement exactly and takes the widest atom down to one cluster.
// Both halves have to land together: Lao in `BREAKS_ANYWHERE` alone is Khmer's
// defect again, since a line could then open on a bare tone mark.
const THAI_MARKS = '\u0E31\u0E33\u0E34\u0E35\u0E36\u0E37\u0E38\u0E39\u0E3A'
  + '\u0E47\u0E48\u0E49\u0E4A\u0E4B\u0E4C\u0E4D\u0E4E\u0E30\u0E32\u0E45\u0E46';
// Dependent vowels U+17B6..17C5, the signs U+17C6..17D1 and U+17DD, and the coeng
// U+17D2. The coeng matters most: it is a prefix to the consonant it subscripts, so
// it can neither end a line nor start one, and it appears in both sets below.
const KHMER_MARKS = '\u17B6\u17B7\u17B8\u17B9\u17BA\u17BB\u17BC\u17BD\u17BE\u17BF'
  + '\u17C0\u17C1\u17C2\u17C3\u17C4\u17C5\u17C6\u17C7\u17C8\u17C9\u17CA\u17CB'
  + '\u17CC\u17CD\u17CE\u17CF\u17D0\u17D1\u17D2\u17DD';
// Every Lao dependent vowel, semivowel, tone mark and sign: U+0EB0..0EBD (the
// vowel signs, the two semivowels and the Pali virama), U+0EC8..0ECD (the four
// tone marks, the cancellation mark and the niggahita), and U+0EC6, which repeats
// the word before it and so has nothing to say at the head of a line. The spacing
// ones \u2014 \u0EB0 \u0EB2 \u0EB3 \u0EBD \u2014 are here for the same reason Thai's \u0E30 \u0E32 \u0E46 are: they follow
// their consonant and mean nothing without it.
const LAO_MARKS = '\u0EB0\u0EB1\u0EB2\u0EB3\u0EB4\u0EB5\u0EB6\u0EB7\u0EB8\u0EB9'
  + '\u0EBA\u0EBB\u0EBC\u0EBD\u0EC6\u0EC8\u0EC9\u0ECA\u0ECB\u0ECC\u0ECD';
const THAI_LEAD_VOWELS = '\u0E40\u0E41\u0E42\u0E43\u0E44';
// Lao's five pre-base vowels, stored in visual order like Thai's rather than
// logically like Khmer's and Burmese's -- which is the whole reason Lao needs no
// shaper reordering. They are still written before a consonant they are pronounced
// after, so a line may not end on one.
const LAO_LEAD_VOWELS = '\u0EC0\u0EC1\u0EC2\u0EC3\u0EC4';
const KHMER_LEAD = '\u17D2';
// The ASCII brackets are here for the same reason the full-width ones are: notes
// gloss a romanisation parenthetically -- `-mai (flat things)` -- and in an
// any-breaking script a bare `)` would otherwise be free to open a line.
const NO_LINE_START = `、。，．：；？！）」』》＞…)]}${THAI_MARKS}${KHMER_MARKS}${LAO_MARKS}`;
const NO_LINE_END = `（「『《＜([{${THAI_LEAD_VOWELS}${KHMER_LEAD}${LAO_LEAD_VOWELS}`;

// Grapheme boundaries, for the last-resort break inside a word. Built once: a
// `Segmenter` is not cheap to construct and this one is stateless.
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

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
      const last = prev.slice(-1);
      const glue = prev !== '' && (
        NO_LINE_START.includes(ch)
        || NO_LINE_END.includes(last)
        // A hyphen belongs to the word it opens, for the same reason the
        // space-breaking rule above says so, and a colon or a point inside a
        // number belongs to the number. Both directions are needed: gluing only
        // forwards left `16` and `:00` as two atoms with a legal break between.
        || (wordish(ch) && (wordish(last) || IN_WORD.includes(last)))
        || (IN_WORD.includes(ch) && wordish(last))
      );
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

  /**
   * Last resort for a word wider than the whole line it has to sit on: cut it
   * into pieces that do fit.
   *
   * `maxAtomWidth` is a floor the width solvers honour, so this is only reached
   * when the floors could not all be met at once -- a four-column reference table
   * in which every field is a long word, and `fractions.js` had to scale them
   * down together. Until now the over-wide word simply ran past its column and
   * printed on top of its neighbour, which is how a Russian sheet came to read
   * `пожалуйстаpozhaluysta` and an Amharic one `ቁርጭምጭሚትk'urch'imich'imīt`.
   * Breaking a word without a hyphen is a compromise; two words overprinting each
   * other is not legible at all.
   *
   * Cut at grapheme boundaries, and measured on the accumulated string rather
   * than a character at a time, because shaping is not additive: a Devanagari
   * conjunct or an Arabic join is narrower than the sum of its parts, and a
   * combining mark has no width of its own to add.
   * @param {Piece} piece @param {number} limit  em
   * @param {RunStyle} style
   * @returns {Piece[]}
   */
  function cut(piece, limit, style) {
    /** @type {Piece[]} */ const out = [];
    let text = '';
    let w = 0;
    for (const { segment } of GRAPHEMES.segment(piece.text)) {
      const grown = advanceEm(text + segment, style);
      if (text !== '' && grown > limit + 1e-4) {
        out.push({ type: 'text', text, w, inkW: w });
        text = segment;
        w = advanceEm(segment, style);
      } else {
        text += segment;
        w = grown;
      }
    }
    // The trailing space of the original piece still hangs past the right edge,
    // so only the final fragment carries it.
    if (text !== '') out.push({ type: 'text', text, w: piece.w - (piece.inkW - w), inkW: w });
    return out;
  }

  /**
   * The cached atoms, with any atom too wide for the line cut down. Shared by
   * `wrap` and `lineCount` so a line that is painted and a line that is counted
   * can never disagree about how many there are.
   * @param {string} text @param {number} limit  em; zero or less means no limit
   * @param {RunStyle} style
   */
  function fitPieces(text, limit, style) {
    const all = piecesEm(text, style);
    if (!(limit > 0) || !all.some((p) => p.inkW > limit + 1e-4)) return all;
    return all.flatMap((p) => (p.type === 'text' && p.inkW > limit + 1e-4
      ? cut(p, limit, style) : [p]));
  }

  /**
   * Same pieces, scaled to points and fitted to `avail`.
   * @param {string} text @param {RunStyle} style @param {number} avail  points
   */
  function pieces(text, style, avail) {
    return fitPieces(text, avail / style.size, style).map((p) => ({
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
      for (const piece of pieces(text, style, avail)) {
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
      const limit = avail / style.size;
      let count = 1;
      let w = 0;
      let started = false;
      for (const piece of fitPieces(text, limit, style)) {
        if (started && w + piece.inkW > limit + 1e-4) {
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
     * The pieces `text` may be broken between, as their own text. A break
     * opportunity is a property of the string and its script, not of any
     * particular width, so this reports them without laying anything out -- which
     * is also why it is not `wrap` at a hair's width. Since the last-resort break
     * arrived, that would report single graphemes.
     * @param {string} text @param {RunStyle} style
     */
    atoms(text, style) {
      return piecesEm(text, style).map((p) => p.text);
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
