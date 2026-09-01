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
  const max = opts.max ?? 4;
  const shown = codes.length > max ? codes.slice(0, max - 1) : codes;

  const row = document.createElement('span');
  row.className = flagsSupported() ? 'flags' : 'flags as-codes';
  // The flags are decorative duplication of the language name, so the accessible
  // name is the country list rather than a string of unpronounceable emoji.
  row.setAttribute('role', 'img');
  row.setAttribute('aria-label', opts.label ?? `Spoken in ${codes.join(', ')}`);

  for (const code of shown) {
    const chip = document.createElement('span');
    chip.className = 'flag';
    chip.textContent = flagsSupported() ? flagEmoji(code) : code;
    chip.title = code;
    row.append(chip);
  }
  if (codes.length > shown.length) {
    const more = document.createElement('span');
    more.className = 'flag more';
    more.textContent = `+${codes.length - shown.length}`;
    more.title = codes.slice(shown.length).join(', ');
    row.append(more);
  }
  return row;
}
