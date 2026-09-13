// Flag emoji, with a fallback for platforms that do not draw them.
//
// Windows ships no glyphs for regional-indicator pairs, so `🇺🇸` comes out as the
// letters "US" in two boxes. That is a meaningful share of visitors, and a row of
// letter boxes reads as broken rather than as a design choice, so the support is
// detected once and country codes are shown as small chips instead.

const OFFSET = 0x1f1e6 - 'A'.charCodeAt(0);

/** @param {string} code ISO 3166-1 alpha-2, uppercase */
export function flagEmoji(code) {
  return String.fromCodePoint(...[...code].map((c) => c.charCodeAt(0) + OFFSET));
}

/**
 * Each region's two flag colours, when a page has loaded them.
 *
 * Empty by default: not every page pays for `regions.csv`. A page that has it calls
 * `setFlagColours` and the code chips below stop being white boxes.
 * @type {Record<string, string[]>}
 */
let colours = Object.create(null);

/**
 * Hand the chips the flag colours `data/registry/regions.csv` carries.
 * @param {Record<string, {flag_colors?: string}>} regions  keyed by ISO 3166
 */
export function setFlagColours(regions) {
  colours = Object.create(null);
  for (const [code, row] of Object.entries(regions ?? {})) {
    const parts = (row?.flag_colors ?? '').split(';').map((c) => c.trim()).filter(Boolean);
    if (parts.length) colours[code] = parts;
  }
}

/** @type {boolean|null} */ let supported = null;

/**
 * Whether the platform composes regional-indicator pairs into a flag.
 *
 * A composed flag is one glyph, so it measures narrower than the two indicator
 * letters drawn separately; where flags are unsupported the pair renders as those
 * two letters and the widths match.
 */
export function flagsSupported() {
  if (supported !== null) return supported;
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return (supported = false);
    ctx.font = '32px sans-serif';
    const pair = ctx.measureText(flagEmoji('US')).width;
    const letters = ctx.measureText(String.fromCodePoint(0x1f1fa)).width
      + ctx.measureText(String.fromCodePoint(0x1f1f8)).width;
    supported = pair < letters - 1;
  } catch {
    supported = false;
  }
  return supported;
}

/**
 * One country: the flag where the platform draws flags, and its code where it does
 * not -- carrying that flag's own two colours as a split wash behind the letters.
 *
 * **Windows ships no glyph for a regional-indicator pair, and the fallback read as
 * broken.** Two grey letters in a white box, twelve of them down a card, look like
 * something that failed to load rather than a choice. The colours are the same
 * `flag_colors` the sheet's own background wash uses, mixed most of the way to paper
 * for the same reason it is: the letters have to stay legible on Ireland's green and
 * on San Marino's white alike, and a chip that is 28% of a saturated flag colour is
 * a country you can tell apart at a glance without guessing at contrast.
 *
 * Real flags were measured and refused. They never reach a renderer -- `regionRow`
 * is called only from the gallery, the sheet options and the format panel -- so a
 * webfont would have been enough, and Noto Color Emoji subset to the regional
 * indicators is **795KB of woff2**: its flags are CBDT bitmaps, which do not
 * compress, and the GSUB ligatures keep all 258 reachable so asking for 78 saves
 * nothing. Four times the whole Latin face, in a shell that has to download
 * completely for offline to work. An SVG set would be a tenth of that and sharper,
 * and it is the right answer the day someone picks a licence for one.
 * @param {string} code ISO 3166-1 alpha-2
 */
function chip(code) {
  const node = document.createElement('span');
  node.className = 'flag';
  node.title = code;
  if (flagsSupported()) {
    node.textContent = flagEmoji(code);
    return node;
  }
  node.textContent = code;
  const own = colours[code];
  if (own?.length) {
    node.classList.add('tinted');
    node.style.setProperty('--flag-a', own[0]);
    node.style.setProperty('--flag-b', own[own.length - 1]);
  }
  return node;
}

/**
 * A row of flags for the countries a language is spoken in, or country-code chips
 * where flags are unavailable.
 * @param {string} regions  semicolon-separated alpha-2 codes
 * @param {{max?:number, label?:string}} [opts]
 * @returns {HTMLElement|null}
 */
export function regionRow(regions, opts = {}) {
  const codes = regions.split(';').map((c) => c.trim()).filter(Boolean);
  if (!codes.length) return null;
  // A cap on cells, not on flags: the overflow chip occupies one, so the grid is
  // never taller than the two lines of title it sits beside.
  //
  // Six, not four, because six is what the widest languages need: French, Spanish
  // and Arabic are each spoken in exactly six of the registry's countries, and
  // showing three of them behind a `+3` hid half the answer to fit a grid two
  // columns wide. The grid takes its column count from the cell count instead, so
  // it stays two rows tall whether that is one column or three -- which is the
  // constraint that actually matters, since the header beside it is two lines of
  // title. Only English overflows now, at eight.
  const max = opts.max ?? 6;
  const shown = codes.length > max ? codes.slice(0, max - 1) : codes;

  const row = document.createElement('span');
  row.className = flagsSupported() ? 'flags' : 'flags as-codes';
  // The flags are decorative duplication of the language name, so the accessible
  // name is the country list rather than a string of unpronounceable emoji.
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', opts.label ?? `Spoken in ${codes.join(', ')}`);

  for (const code of shown) row.append(chip(code));
  const rest = codes.slice(shown.length);
  if (rest.length) {
    // The hidden flags are rendered, not summarised: pointing at "+3" should show
    // you the three, and a tooltip of country codes is not that. They sit in a
    // popover so revealing them cannot reflow the card behind it.
    const more = document.createElement('span');
    more.className = 'flag more';
    more.textContent = `+${rest.length}`;
    more.tabIndex = 0;
    more.title = rest.join(', ');
    const popover = document.createElement('span');
    popover.className = 'flag-rest';
    for (const code of rest) popover.append(chip(code));
    more.append(popover);
    row.append(more);
  }
  // Two rows, always: the column count follows the cells so the block matches the
  // two lines of title beside it whatever the language.
  row.style.setProperty('--flag-cols', String(Math.min(3, Math.ceil((shown.length + (rest.length ? 1 : 0)) / 2))));
  return row;
}
