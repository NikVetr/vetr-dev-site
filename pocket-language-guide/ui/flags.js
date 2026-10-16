// Flag emoji where supported, with bundled SVGs for platforms such as Windows.

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
 * One country, drawn from the bundled MIT-licensed flag-icons set when the
 * platform cannot compose regional indicators. Assets are cached with the shell.
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
  const img = document.createElement('img');
  img.src = `data/flags/${code}.svg`;
  img.alt = code;
  img.width = 20;
  img.height = 15;
  node.append(img);
  return node;
}

/**
 * A row of flags for the countries a language is spoken in.
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
  row.className = 'flags';
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
