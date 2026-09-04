// The paper's own colour, behind everything else.
//
// **A grid of flat rects, not a gradient primitive.** The plan carries absolute
// positions and flat fills, which is what lets three renderers agree by
// construction, and `pdf-lib` reaches a real gradient only through a raw shading
// dictionary. Approximating one with cells would normally band visibly -- but every
// background here is *subtle by design*, a wash between paper white and something a
// few percent off it, so the step between adjacent cells is well under a just
// noticeable difference. The constraint and the design point in the same direction,
// which is the only reason this is the right answer rather than a compromise.
//
// It also means imposition, rotation and the card cut need to know nothing: a
// background is rects like any other, first in the list, and `render/impose.js`
// carries it along with the face it belongs to.

/** Cells across the shorter axis. The longer axis takes proportionally more. */
const GRID = 14;

/**
 * Paper white is the default and stays the default. A wash costs ink on a sheet
 * someone prints at home, and the reference card is white -- so this is opt-in, and
 * `low-ink` and `mono` drop it the way they drop row shading.
 */
const STRENGTH = 0.06;

/** @param {string} hex @returns {[number,number,number]} */
function rgb(hex) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** @param {[number,number,number]} c */
const hex = (c) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v)))
  .toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** @param {[number,number,number]} a @param {[number,number,number]} b @param {number} t */
const mix = (a, b, t) => /** @type {[number,number,number]} */ (
  a.map((v, i) => v + (b[i] - v) * t));

/**
 * The colours a mode washes the page with, in the order they are laid across it.
 *
 * `flag` reads them off the countries that speak the target language, which is a
 * fact about the language rather than a decoration: a Swahili card in Tanzanian
 * green and black is recognisable to the person holding it in a way a generic tint
 * is not. `sections` reads them off the sheet's own section colours, so the wash
 * says where you are on the card.
 *
 * @param {import('../types.js').SheetSpec} spec
 * @param {any} theme
 * @param {{colorRole:string, x:number, y:number, w:number, h:number}[]} placed
 * @param {Record<string,Record<string,string>>} regions
 * @param {string[]} languageRegions  ISO 3166 codes for the target language
 */
function sources(spec, theme, placed, regions, languageRegions) {
  const mode = spec.background?.mode ?? 'none';
  if (mode === 'flag') {
    // Two countries' worth is enough for a wash; more and the corners stop being
    // distinguishable at 6% strength. `regions.csv` lists them in the order the
    // registry does, which is roughly by number of speakers.
    const codes = languageRegions.slice(0, 2);
    const colours = codes
      .flatMap((code) => (regions[code]?.flag_colors ?? '').split(';'))
      .map((c) => c.trim())
      .filter(Boolean);
    return colours.length ? colours : [];
  }
  if (mode === 'sections') {
    // Positioned rather than merely collected: a section's colour belongs where its
    // rows are, so the wash under `emergency` is red because emergency is there.
    return placed;
  }
  if (mode === 'tint') {
    const own = spec.background?.color;
    return own ? [own] : [];
  }
  return [];
}

/**
 * The background of one face, as rects to paint before anything else.
 *
 * @param {Object} args
 * @param {import('../types.js').SheetSpec} args.spec
 * @param {any} args.theme
 * @param {number} args.pageW
 * @param {number} args.pageH
 * @param {{colorRole:string, x:number, y:number, w:number, h:number}[]} args.placed
 *   every atom drawn on this face, with the section colour role it belongs to
 * @param {Record<string,Record<string,string>>} args.regions
 * @param {string[]} args.languageRegions
 * @returns {import('../types.js').Rect[]}
 */
export function backgroundRects({
  spec, theme, pageW, pageH, placed, regions, languageRegions,
}) {
  const mode = spec.background?.mode ?? 'none';
  if (mode === 'none') return [];
  // A wash is the first thing to go when ink is scarce, for the same reason row
  // shading is: many printers render a 3% tint as nothing at all, and the ones that
  // do render it spend colour on the whole page to do it.
  if (spec.inkMode !== 'full') return [];

  const paper = rgb(spec.themeColors?.paper ?? theme.colors.paper);
  const strength = spec.background?.strength ?? STRENGTH;
  if (strength <= 0) return [];

  const chosen = sources(spec, theme, placed, regions, languageRegions);
  if (!chosen.length) return [];

  // **`tint` takes the swatch literally.** It is one flat rect, and the colour is not
  // mixed toward paper on the way: the reader picked the paper colour, so diluting it
  // means the picker does not do what it shows. It was mixed at first, and the result
  // was that the default `#F6F2EA` came out at (254,254,254) -- a control that
  // appeared to do nothing. `strength` belongs to the two gradient modes, whose
  // source colours are saturated flag and section colours and *have* to be pulled
  // most of the way to white to stay behind 5pt type.
  if (mode === 'tint') {
    const fill = hex(rgb(/** @type {string} */ (chosen[0])));
    return fill === hex(paper) ? [] : [{ x: 0, y: 0, w: pageW, h: pageH, fill }];
  }

  const long = Math.max(pageW, pageH);
  const short = Math.min(pageW, pageH);
  const cols = pageW >= pageH ? Math.round(GRID * (long / short)) : GRID;
  const rows = pageW >= pageH ? GRID : Math.round(GRID * (long / short));
  const cw = pageW / cols;
  const ch = pageH / rows;

  /** The colour a cell centre takes, before it is mixed toward paper. */
  /** @param {number} cx @param {number} cy @returns {[number,number,number]} */
  const at = (cx, cy) => {
    if (mode === 'sections') {
      // Inverse-square distance to each atom's centre, which makes the wash follow
      // the columns rather than smearing a single average over the page. The `+ 1`
      // floors the weight so a cell sitting exactly on an atom does not divide by
      // zero and take that atom's colour outright.
      let wsum = 0;
      /** @type {[number,number,number]} */ let acc = [0, 0, 0];
      for (const p of /** @type {any[]} */ (chosen)) {
        const role = theme.colors.roles?.[p.colorRole];
        if (!role) continue;
        const dx = cx - (p.x + p.w / 2);
        const dy = cy - (p.y + p.h / 2);
        const w = 1 / (dx * dx + dy * dy + short * short * 0.02);
        const c = rgb(spec.themeColors?.[`roles.${p.colorRole}`] ?? role);
        acc = /** @type {[number,number,number]} */ (acc.map((v, i) => v + c[i] * w));
        wsum += w;
      }
      return wsum ? /** @type {[number,number,number]} */ (acc.map((v) => v / wsum)) : paper;
    }
    // A flag's colours laid corner to corner: the first along the top, the last
    // along the bottom, blended both ways so no edge is a hard band.
    const list = /** @type {string[]} */ (chosen).map(rgb);
    const t = list.length === 1 ? 0
      : ((cx / pageW) * 0.35 + (cy / pageH) * 0.65) * (list.length - 1);
    const i = Math.min(list.length - 2, Math.floor(t));
    return mix(list[i], list[i + 1], t - i);
  };

  /** @type {import('../types.js').Rect[]} */ const out = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const fill = hex(mix(paper, at((c + 0.5) * cw, (r + 0.5) * ch), strength));
      // Cells that came out as paper are not drawn. On a `sections` wash the margins
      // are far from every atom and land on paper, which is most of the saving.
      if (fill === hex(paper)) continue;
      // Half a point of overlap, because a hairline of white between two cells is
      // visible at 600dpi where the colour step between them is not. The page's own
      // edge clips the last row and column.
      out.push({ x: c * cw, y: r * ch, w: cw + 0.5, h: ch + 0.5, fill });
    }
  }
  return out;
}
