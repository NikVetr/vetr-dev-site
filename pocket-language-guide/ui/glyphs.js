// Little inline-SVG diagrams for the settings panels.
//
// A choice between four page shapes, or between three row spacings, is a shape
// question, and a dropdown of words makes the reader translate words back into
// shapes. These draw the thing instead.
//
// Each glyph keeps a short caption underneath. Icon-only would be worse here: a
// 3-column A6 and a 3-column 4x6 differ only in proportion, and nobody should have
// to hover to find out which is which.

import { nextIndex } from './keys.js';
import { PERCENT_FIRST, t, uiLanguage } from './i18n.js';
import { PRIORITY_STEPS } from '../core/pack.js';

const NS = 'http://www.w3.org/2000/svg';

/** @param {string} tag @param {Record<string,string|number>} attrs */
function svgEl(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Half the widest stroke any glyph draws, so the viewBox can bleed by that much.
 * A rect drawn flush to the box edge is centred on the path: without the bleed its
 * outer half fell outside the viewBox and the 7x5in card lost its right border.
 */
const BLEED = 0.6;

/** @param {number} w @param {number} h */
function frame(w, h) {
  const svg = svgEl('svg', {
    viewBox: `${-BLEED} ${-BLEED} ${w + BLEED * 2} ${h + BLEED * 2}`,
    width: w, height: h, 'aria-hidden': 'true', class: 'glyph',
  });
  return svg;
}

/**
 * A page at its true proportions, with its columns drawn in. Communicates the
 * aspect ratio and the column count in one mark.
 * @param {{pageW:number, pageH:number, columns:number, box?:number}} spec
 */
export function pageGlyph({ pageW, pageH, columns, box = 30 }) {
  const scale = Math.min(box / pageW, box / pageH);
  const w = Math.max(8, pageW * scale);
  const h = Math.max(8, pageH * scale);
  const svg = frame(box, box);
  const x0 = (box - w) / 2;
  const y0 = (box - h) / 2;
  svg.append(svgEl('rect', {
    x: x0, y: y0, width: w, height: h, rx: 1.5, class: 'g-page',
  }));

  const inset = Math.min(2, w * 0.09);
  const usable = w - inset * 2;
  const gap = columns > 1 ? Math.min(1.4, usable * 0.06) : 0;
  const colW = (usable - gap * (columns - 1)) / columns;
  for (let i = 0; i < columns; i += 1) {
    svg.append(svgEl('rect', {
      x: x0 + inset + i * (colW + gap),
      y: y0 + inset,
      width: Math.max(0.8, colW),
      height: Math.max(2, h - inset * 2),
      class: 'g-col',
    }));
  }
  return svg;
}

/**
 * The card-size ladder: one option per geometry preset, at true proportions.
 *
 * Shared because both panels that offer it built the list themselves and only one
 * honoured a preset's `captionKey` -- so the credit-card and phone cards, the two
 * whose names are descriptions rather than dimensions, read in English on the
 * export page whatever language the rest of it was in.
 * @param {Record<string, any>} geometry  `presets.geometry`
 */
export function cardOptions(geometry) {
  return Object.entries(geometry).map(([id, g]) => ({
    value: id,
    caption: g.captionKey
      ? t(g.captionKey)
      : g.name.split('·')[0].trim().replace(/landscape|portrait/g, '').trim(),
    title: g.name,
    glyph: pageGlyph({ pageW: g.pageW, pageH: g.pageH, columns: g.columns }),
  }));
}

/** How many faces, as that many little pages. 0 draws the auto case.
 * @param {number} count */
export function facesGlyph(count) {
  const box = 30;
  const svg = frame(box, box);
  if (count <= 0) {
    // Two pages and a plus meaning "and as many more as it takes". The plus used to
    // be drawn across the second page; it now sits in its own column to the right.
    svg.append(svgEl('rect', { x: 2, y: 7, width: 9, height: 16, rx: 1, class: 'g-page' }));
    svg.append(svgEl('rect', { x: 12.5, y: 7, width: 9, height: 16, rx: 1, class: 'g-page' }));
    svg.append(svgEl('path', { d: 'M23.5 15 h5 M26 12.5 v5', class: 'g-bracket' }));
    return svg;
  }
  const shown = Math.min(count, 6);
  const cols = shown <= 2 ? shown : Math.ceil(shown / 2);
  const rows = shown <= 2 ? 1 : 2;
  const overflow = count > shown;
  // A "+2" needs its own strip. It used to be placed over the bottom-right page,
  // which put digits on top of the drawing at every count above six.
  const bottom = overflow ? 9 : 4;
  const cw = (box - 4 - (cols - 1) * 2) / cols;
  const ch = (box - 4 - bottom - (rows - 1) * 2) / rows;
  for (let i = 0; i < shown; i += 1) {
    svg.append(svgEl('rect', {
      x: 2 + (i % cols) * (cw + 2),
      y: 4 + Math.floor(i / cols) * (ch + 2),
      width: cw, height: ch, rx: 1, class: 'g-page',
    }));
  }
  if (overflow) {
    const label = svgEl('text', { x: box / 2, y: box - 1, class: 'g-count' });
    label.textContent = `+${count - shown}`;
    svg.append(label);
  }
  return svg;
}

/**
 * Points of extra breathing room around every text element, at nominal type size.
 *
 * `Tight` is 0, which reproduces the hand-built LaTeX original exactly -- its
 * padding really is almost nil, with consecutive rows held apart by a 0.22pt rule
 * alone. That reads as cramped anywhere the original's density is not the point,
 * so the default is the airy setting instead.
 *
 * There were five steps here, and the middle two are gone: 0.5 and 0.9 both sat
 * close enough to `Tight` that no one would choose them once the default moved
 * up, and the slider under the presets still reaches any value between them.
 *
 * Carries a caption *key* rather than a caption: this is module scope, evaluated
 * before any catalogue is loaded, so the words are looked up where the option is
 * built.
 */
export const PADDING_CHOICES = [
  { value: 0, captionKey: 'format.padding.tight' },
  { value: 1.4, captionKey: 'format.padding.normal' },
  { value: 2.0, captionKey: 'format.padding.extra' },
];


/**
 * Breathing room, drawn as the gap between rows. Index-matched to
 * PADDING_CHOICES above.
 * @param {number} level
 */
export function paddingGlyph(level) {
  const box = 30;
  const svg = frame(box, box);
  const gap = [0.8, 4.4, 6][level];
  const barH = 2.4;
  const pitch = barH + gap;
  const count = Math.max(2, Math.floor((box - 4) / pitch));
  const total = count * pitch - gap;
  let y = (box - total) / 2;
  for (let i = 0; i < count; i += 1) {
    svg.append(svgEl('rect', { x: 4, y, width: 14, height: barH, rx: 0.8, class: 'g-ink' }));
    svg.append(svgEl('rect', { x: 20, y, width: 6, height: barH, rx: 0.8, class: 'g-ink faint' }));
    y += pitch;
  }
  return svg;
}

/**
 * The priority ladder's words. The thresholds themselves are `PRIORITY_STEPS` in
 * `core/pack.js`, where the measurement that chose them is written down: each is
 * the largest cut in the corpus that still fills a real card, and the top one is
 * the set that fits a single phone face.
 *
 * Carries caption *keys*, like PADDING_CHOICES above and for the same reason.
 */
const PRIORITY_CHOICES = [
  { value: PRIORITY_STEPS.all, captionKey: 'format.priority.all' },
  { value: PRIORITY_STEPS.wide, captionKey: 'format.priority.wide' },
  { value: PRIORITY_STEPS.core, captionKey: 'format.priority.core' },
  { value: PRIORITY_STEPS.essential, captionKey: 'format.priority.essential' },
];

/**
 * The priority ladder's options: the words, the drawing, and how many phrases each
 * step keeps. Shared by the two panels that offer it, which need the same four
 * options and differ only in whether a Custom segment follows them.
 *
 * The count goes in the tooltip because `Core` cannot say how much that is and the
 * number is what a reader wants -- counted off the corpus rather than written into
 * the catalogue, so it stays true as the bank grows.
 * @param {Record<string, Record<string,string>>} concepts  `corpus.concepts`
 */
export function priorityOptions(concepts) {
  const all = Object.values(concepts);
  return PRIORITY_CHOICES.map((step, i) => ({
    value: step.value,
    caption: t(step.captionKey),
    title: t('format.priorityTitle', {
      count: all.filter((c) => Number(c.importance) >= step.value).length,
      total: all.length,
    }),
    glyph: priorityGlyph(i),
  }));
}

/**
 * A priority step, drawn as the ranked corpus with the kept part inked and a cut
 * where the rest begins.
 *
 * Bars rather than words, and bars rather than *text*: unlike the column toggles --
 * where the question is what lands in a column and the answer is best given in the
 * column's own words -- this question is only how far down the list to go, and a
 * sample phrase would say nothing about depth. Index-matched to PRIORITY_CHOICES,
 * as `paddingGlyph` is to PADDING_CHOICES, because the steps are qualitative: the
 * corpus is steep enough that drawing the share it keeps would put three of the
 * four glyphs within one bar of each other.
 * @param {number} level
 */
function priorityGlyph(level) {
  const box = 30;
  const svg = frame(box, box);
  const bars = 8;
  const kept = [8, 5, 3, 1][level] ?? bars;
  svg.append(svgEl('rect', { x: 1, y: 2, width: box - 2, height: box - 4, rx: 1.5, class: 'g-page' }));
  const pitch = (box - 8) / bars;
  for (let i = 0; i < bars; i += 1) {
    // Widths taper down the list, so the glyph reads as a ranking rather than as a
    // stack of equal rows.
    svg.append(svgEl('rect', {
      x: 4,
      y: 5 + i * pitch,
      width: 22 - i * 1.9,
      height: 1.8,
      rx: 0.7,
      class: i < kept ? 'g-ink' : 'g-ink faint',
    }));
  }
  if (kept < bars) {
    const y = 5 + kept * pitch - pitch / 2 + 0.9;
    svg.append(svgEl('path', { d: `M2 ${y.toFixed(2)} H28`, class: 'g-cut' }));
  }
  return svg;
}

/**
 * What the ink modes actually give up: colour, then shading, then both.
 * @param {'full'|'low-ink'|'mono'} mode @param {string[]} roles
 */
export function inkGlyph(mode, roles) {
  const box = 30;
  const svg = frame(box, box);
  const rows = 3;
  for (let i = 0; i < rows; i += 1) {
    const y = 5 + i * 7;
    if (mode === 'full' && i % 2 === 1) {
      svg.append(svgEl('rect', { x: 3, y: y - 1.5, width: 24, height: 6.5, class: 'g-shade' }));
    }
    svg.append(svgEl('rect', {
      x: 3, y: y - 1.5, width: 1.8, height: 6.5,
      fill: mode === 'mono' ? '#111820' : roles[i % roles.length],
    }));
    svg.append(svgEl('rect', { x: 7, y, width: 13, height: 2.4, rx: 0.8, class: 'g-ink' }));
    svg.append(svgEl('rect', { x: 21, y, width: 6, height: 2.4, rx: 0.8, class: 'g-ink faint' }));
  }
  return svg;
}

/** The palette itself. @param {string[]} roles */
export function paletteGlyph(roles) {
  const box = 30;
  const svg = frame(box, box);
  const size = 9;
  roles.slice(0, 5).forEach((hex, i) => {
    const x = 2 + (i % 3) * (size + 1.5);
    const y = 4 + Math.floor(i / 3) * (size + 1.5);
    svg.append(svgEl('rect', { x, y, width: size, height: size, rx: 1.5, fill: hex }));
  });
  return svg;
}

/**
 * An item's own sub-grid: which cells carry text and where they sit. This is the
 * arrangement control, so it has to show arrangement rather than name it.
 * @param {{rows:number, cols:number, cells:{row:number, col:number, align:string, minor?:boolean}[]}} shape
 */
export function itemGlyph(shape) {
  const box = 30;
  const svg = frame(box, box);
  svg.append(svgEl('rect', { x: 1, y: 4, width: box - 2, height: box - 8, rx: 1.5, class: 'g-page' }));
  svg.append(svgEl('rect', { x: 1, y: 4, width: 1.6, height: box - 8, class: 'g-accent' }));

  const padX = 3.4;
  // Rows share the full inner height rather than a fixed cell height, so the
  // one-per-line shape -- four or five rows where the others have one or two --
  // does not end up as a stack of hairlines too close together to read as separate
  // lines. Bars thin as the count grows, but the gaps between them stay visible.
  const inner = box - 11;
  const cellH = inner / shape.rows;
  const barH = Math.max(1.4, Math.min(2.8, cellH * 0.55));
  const padY = 5.5;
  const cellW = (box - 2 - padX * 2) / shape.cols;
  for (const cell of shape.cells) {
    const thin = cell.minor ? 0.7 : 1;
    const w = cellW * (cell.minor ? 0.62 : 0.86);
    const x = cell.align === 'end'
      ? padX + (cell.col + 1) * cellW - w
      : cell.align === 'center'
        ? padX + cell.col * cellW + (cellW - w) / 2
        : padX + cell.col * cellW;
    const h = Math.max(1.2, barH * thin);
    svg.append(svgEl('rect', {
      x,
      y: padY + cell.row * cellH + (cellH - h) / 2,
      width: Math.max(2, w),
      height: h,
      rx: Math.min(0.8, h / 2),
      class: cell.minor ? 'g-ink faint' : 'g-ink',
    }));
  }
  return svg;
}

/**
 * Type size: a letter drawn at the actual relative size, with the auto option
 * showing it snapped to the page.
 * @param {number} scale  0 means fit to the page
 */
export function typeGlyph(scale) {
  const box = 30;
  const svg = frame(box, box);
  svg.append(svgEl('rect', { x: 5, y: 3, width: 20, height: 24, rx: 1.5, class: 'g-page' }));
  const size = scale === 0 ? 17 : 10 * scale + 4;
  const letter = svgEl('text', {
    x: box / 2, y: 15 + size * 0.36, 'font-size': size, class: 'g-letter',
  });
  letter.textContent = 'A';
  svg.append(letter);
  if (scale === 0) {
    // Corner brackets: the type is sized to the page rather than chosen.
    svg.append(svgEl('path', {
      d: 'M7 6 h3 M7 6 v3 M23 6 h-3 M23 6 v3 M7 24 h3 M7 24 v-3 M23 24 h-3 M23 24 v-3',
      class: 'g-bracket',
    }));
  }
  return svg;
}

/**
 * A typeface, shown by drawing in it. `family` is a CSS font-family that must
 * already be loaded, so the sample is the real face rather than an impression of it.
 * @param {string} family
 */
export function typefaceGlyph(family) {
  const box = 30;
  const svg = frame(box, box);
  const sample = svgEl('text', {
    x: box / 2, y: 21, 'font-size': 17, 'font-family': family, class: 'g-sample',
  });
  sample.textContent = 'Aa';
  svg.append(sample);
  return svg;
}

/**
 * Export resolution, as a page with a coarse or fine grain over it.
 * @param {number} dpi
 */
export function dpiGlyph(dpi) {
  const box = 30;
  const svg = frame(box, box);
  svg.append(svgEl('rect', { x: 5, y: 4, width: 20, height: 22, rx: 1.5, class: 'g-page' }));
  const step = dpi >= 600 ? 2 : dpi >= 300 ? 3.4 : 5.2;
  for (let x = 7; x < 24; x += step) {
    for (let y = 6; y < 24; y += step) {
      svg.append(svgEl('rect', {
        x, y, width: Math.max(0.7, step - 1), height: Math.max(0.7, step - 1),
        class: 'g-ink faint',
      }));
    }
  }
  return svg;
}

/** A sheet whole, or cut down the middle with the back's orientation shown.
 * @param {''|'short-edge'|'long-edge'} flip */
export function cutGlyph(flip) {
  const box = 30;
  const svg = frame(box, box);
  svg.append(svgEl('rect', { x: 2, y: 8, width: 26, height: 15, rx: 1.5, class: 'g-page' }));
  if (!flip) {
    for (let i = 0; i < 4; i += 1) {
      svg.append(svgEl('rect', { x: 4 + i * 6.2, y: 10, width: 4.6, height: 11, class: 'g-col' }));
    }
    return svg;
  }
  for (let i = 0; i < 4; i += 1) {
    svg.append(svgEl('rect', { x: 4 + i * 6.2, y: 10, width: 4.6, height: 11, class: 'g-col' }));
  }
  svg.append(svgEl('path', { d: `M15 5V26`, class: 'g-cut' }));
  // Which way the back comes out: an upright mark, or an inverted one.
  const mark = svgEl('path', {
    d: flip === 'long-edge' ? 'M20.5 19 L23.5 19 L22 15.5 Z' : 'M20.5 12 L23.5 12 L22 15.5 Z',
    class: 'g-mark',
  });
  svg.append(mark);
  return svg;
}

/**
 * Which cell of an entry a field occupies, so the "columns shown" checkboxes can
 * say where each one lands rather than only naming it.
 *
 * The two stacks match `core/solve/arrange.js`: the target language's own writing
 * and its pronunciation run down the left, the reader's language answers down the
 * right, and the accent rule marks the left edge as it does on the sheet.
 */
const FIELD_ROWS = {
  script: [0, 0], script_alt: [0, 1], roman: [0, 2], ipa: [0, 3],
  gloss: [1, 0], literal: [1, 1], respell: [1, 2],
};

/**
 * One real entry from the pair being edited, for the column glyphs to draw.
 * @typedef {Object} FieldSample
 * @property {Partial<Record<string,string>>} values  field id -> that row's own cell
 * @property {string} targetFamily  CSS family for the target's script
 * @property {string} sourceFamily  CSS family for the reader's script
 * @property {string} latinFamily   romanisation and IPA are Latin either way
 */

/**
 * Which face draws each field, mirroring `FIELD_SIDE` in `core/fonts.js`. It is
 * not the same as which *stack* of the entry a field sits in: romanisation runs
 * down the target's side of the row and is set in Latin regardless.
 */
const FIELD_FACE = {
  script: 'target', script_alt: 'target', literal: 'target',
  roman: 'latin', ipa: 'latin',
  gloss: 'source', respell: 'source',
};

const FIELD_W = 86;
const FIELD_H = 34;

/**
 * A column toggle, drawn as the entry it controls with that column's own words in
 * it.
 *
 * These were abstract bars, and a picture of where a column lands says less than
 * the column's own text: someone deciding whether to print romanisation wants to
 * see the romanisation, in the face it will be set in. So the chosen field is
 * drawn from a real row of the current pair and the other six stay as faint rules,
 * which keeps the "where does this land" reading the bars had.
 *
 * A field the corpus has nothing for draws an empty dashed rule instead of text.
 * That is the honest answer and the one nothing else in the interface gave: the
 * `ipa` column is empty in every language, and its toggle looked exactly as
 * substantial as the ones that work.
 *
 * @param {keyof typeof FIELD_ROWS} field
 * @param {FieldSample} [sample]
 */
export function fieldGlyph(field, sample) {
  const svg = frame(FIELD_W, FIELD_H);
  const [side, row] = FIELD_ROWS[field];
  const colW = (FIELD_W - 10) / 2 - 2;
  const left = side === 0 ? 5 : FIELD_W - 3 - colW;
  /** @param {number} r */
  const lineY = (r) => 7 + r * 7;

  // The accent rule down the left edge of every entry on the sheet.
  svg.append(svgEl('rect', { x: 1, y: 3, width: 1.6, height: FIELD_H - 6, class: 'g-ink faint' }));

  // Every other line as a rule, so the glyph still reads as a whole entry.
  for (const [name, [s, r]] of Object.entries(FIELD_ROWS)) {
    if (name === field) continue;
    const w = colW * (r === 0 ? 1 : 0.72);
    svg.append(svgEl('rect', {
      x: s === 0 ? 5 : FIELD_W - 3 - w,
      y: lineY(r), width: w, height: r === 0 ? 2.6 : 1.9,
      rx: 0.8, class: 'g-ink faint',
    }));
  }

  const text = (sample?.values?.[field] ?? '').trim();
  if (!text) {
    const w = colW * 0.72;
    svg.append(svgEl('line', {
      x1: side === 0 ? 5 : FIELD_W - 3 - w,
      x2: side === 0 ? 5 + w : FIELD_W - 3,
      y1: lineY(row) + 1, y2: lineY(row) + 1,
      class: 'g-accent-line', 'stroke-dasharray': '2.2 1.8',
    }));
    return svg;
  }

  // Clipped to its own column, so a long cell cannot spill into the other stack.
  const clipId = `fg-${field}`;
  const clip = svgEl('clipPath', { id: clipId });
  clip.append(svgEl('rect', { x: left, y: 0, width: colW, height: FIELD_H }));
  svg.append(clip);

  const node = svgEl('text', {
    x: side === 0 ? left : left + colW,
    y: lineY(row) + (row === 0 ? 6.4 : 5.6),
    'font-size': row === 0 ? 8.2 : 7,
    'font-family': {
      target: sample?.targetFamily, latin: sample?.latinFamily, source: sample?.sourceFamily,
    }[FIELD_FACE[field]] ?? 'inherit',
    'font-weight': row === 0 ? '700' : '400',
    'font-style': field === 'roman' || field === 'respell' ? 'italic' : 'normal',
    'text-anchor': side === 0 ? 'start' : 'end',
    'clip-path': `url(#${clipId})`,
    class: 'g-accent-text',
  });
  node.textContent = text;
  svg.append(node);
  return svg;
}

/**
 * One glyph button: the icon, the caption underneath, and an optional tooltip.
 * Shared by the radio group and the multi-select group below, which differ only in
 * their ARIA role and in whether choosing one clears the others.
 * @param {{caption:string, glyph:SVGElement, title?:string}} option
 * @param {string} role
 */
function glyphButton(option, role) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'segment';
  button.setAttribute('role', role);
  if (option.title) button.title = option.title;
  button.append(option.glyph);
  const caption = document.createElement('span');
  caption.className = 'segment-caption';
  caption.textContent = option.caption;
  button.append(caption);
  return button;
}

/**
 * A group of glyph buttons where any number can be on. Used for the fields an
 * entry shows, which were a column of bare checkboxes -- the one control in the
 * panel that named a thing instead of drawing it.
 * @template T
 * @param {Object} config
 * @param {string} config.label
 * @param {{value:T, caption:string, glyph:SVGElement, title?:string}[]} config.options
 * @param {T[]} config.values
 * @param {(values:T[])=>void} config.onChange
 */
export function toggles({ label, options, values, onChange }) {
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);

  /** @type {Set<T>} */ let on = new Set(values);
  /** @type {{value:T, button:HTMLButtonElement}[]} */ const items = [];
  for (const option of options) {
    const button = glyphButton(option, 'checkbox');
    button.addEventListener('click', () => {
      if (on.has(option.value)) on.delete(option.value);
      else on.add(option.value);
      paint();
      onChange(options.filter((o) => on.has(o.value)).map((o) => o.value));
    });
    items.push({ value: option.value, button });
    group.append(button);
  }

  function paint() {
    for (const { value, button } of items) {
      button.classList.toggle('current', on.has(value));
      button.setAttribute('aria-checked', String(on.has(value)));
    }
  }
  paint();

  return {
    group,
    /** @param {T[]} next */
    select(next) {
      on = new Set(next);
      paint();
    },
  };
}

/**
 * A radio group of glyph buttons. Returns the group element plus a setter so the
 * caller can reflect state changes made elsewhere.
 * @template T
 * @param {Object} config
 * @param {string} config.label
 * @param {{value:T, caption:string, glyph:SVGElement, title?:string}[]} config.options
 * @param {T} config.value
 * @param {(value:T)=>void} config.onChange
 */
export function segmented({ label, options, value, onChange }) {
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);

  /** @type {{value:T, button:HTMLButtonElement}[]} */ const items = [];
  for (const option of options) {
    const button = glyphButton(option, 'radio');
    button.addEventListener('click', () => {
      select(option.value);
      onChange(option.value);
    });
    items.push({ value: option.value, button });
    group.append(button);
  }

  // The radiogroup contract: one tab stop for the group, and arrows move focus and
  // the selection together so every option is one keypress away. Space and Enter
  // need nothing here -- they already fire the buttons' own click.
  group.addEventListener('keydown', (event) => {
    const from = items.findIndex((item) => item.button === event.target);
    const to = from < 0 ? -1 : nextIndex(event.key, from, items.length);
    if (to < 0) return;
    event.preventDefault();
    select(items[to].value);
    items[to].button.focus();
    onChange(items[to].value);
  });

  /** @param {T} next */
  function select(next) {
    let matched = false;
    for (const { value: key, button } of items) {
      const on = key === next;
      matched ||= on;
      button.classList.toggle('current', on);
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    }
    // A value outside the options -- a custom geometry matching no card preset --
    // would otherwise leave every option at -1 and drop the whole group out of the
    // tab order. An empty radiogroup still has to be reachable, so the first
    // option holds the stop.
    if (!matched && items.length) items[0].button.tabIndex = 0;
  }
  select(value);

  return { group, select };
}

/** A slider, for the Custom segment: the control it opens, drawn small. */
export function customGlyph() {
  const box = 30;
  const svg = frame(box, box);
  svg.append(svgEl('path', { d: 'M4 11 h22', class: 'g-bracket' }));
  svg.append(svgEl('path', { d: 'M4 20 h22', class: 'g-bracket' }));
  svg.append(svgEl('rect', { x: 9, y: 7.5, width: 3.4, height: 7, rx: 1.2, class: 'g-ink' }));
  svg.append(svgEl('rect', { x: 18, y: 16.5, width: 3.4, height: 7, rx: 1.2, class: 'g-ink' }));
  return svg;
}

/**
 * A segmented control with a Custom option that opens a numeric entry.
 *
 * The presets cover what most people want, but they are a ladder somebody else
 * chose: four columns and six faces are opinions, not limits. Custom reveals a
 * slider paired with a number box -- the slider to feel the range, the box to type
 * or step an exact value -- and the two stay in step with each other.
 *
 * Choosing a value that happens to match a preset selects that preset instead, so
 * the control never shows Custom for something the ladder already names.
 *
 * @param {Object} config
 * @param {string} config.label
 * @param {{value:number, caption:string, glyph:SVGElement, title?:string}[]} config.options
 * @param {number} config.value
 * @param {(value:number)=>void} config.onChange
 * @param {string} config.customCaption
 * @param {SVGElement} config.customGlyph
 * @param {number} config.min
 * @param {number} config.max
 * @param {number} config.step
 * @param {string} [config.unit]        shown after the number box
 * @param {(value:number)=>number} [config.snap] round a typed value to a legal one
 */
export function numericChoice(config) {
  const {
    label, options, value, onChange, customCaption, customGlyph,
    min, max, step, unit, snap = (/** @type {number} */ v) => v,
  } = config;

  const isPreset = (/** @type {number} */ v) => options.some((o) => o.value === v);
  const CUSTOM = Symbol('custom');

  const panel = document.createElement('div');
  panel.className = 'numeric-custom';
  panel.hidden = isPreset(value);

  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.setAttribute('aria-label', label);

  const box = document.createElement('input');
  box.type = 'number';
  box.min = String(min);
  box.max = String(max);
  box.step = String(step);
  box.className = 'numeric-box';
  box.setAttribute('aria-label', label);

  panel.append(range, box);
  if (unit) {
    const suffix = document.createElement('span');
    suffix.className = 'numeric-unit';
    suffix.textContent = unit;
    panel.append(suffix);
  }

  /** @type {{ group: HTMLElement, select: (v: number|symbol) => void }} */
  let control;

  /** @param {number} next @param {boolean} fromBox */
  function commit(next, fromBox) {
    const clamped = Math.min(max, Math.max(min, snap(next)));
    range.value = String(clamped);
    if (!fromBox) box.value = String(clamped);
    // A custom value that lands on a preset should light that preset up.
    control.select(isPreset(clamped) ? clamped : CUSTOM);
    panel.hidden = isPreset(clamped);
    onChange(clamped);
  }

  range.addEventListener('input', () => commit(Number(range.value), false));
  box.addEventListener('change', () => commit(Number(box.value), false));

  control = segmented({
    label,
    value: isPreset(value) ? value : CUSTOM,
    options: [
      ...options,
      { value: CUSTOM, caption: customCaption, glyph: customGlyph, title: customCaption },
    ],
    onChange: (chosen) => {
      if (chosen !== CUSTOM) {
        panel.hidden = true;
        onChange(/** @type {number} */ (chosen));
        return;
      }
      // Opening Custom must not change the sheet: it starts from where you are.
      panel.hidden = false;
      box.focus();
    },
  });

  range.value = String(Math.min(max, Math.max(min, value)));
  box.value = String(value);

  const wrap = document.createElement('div');
  wrap.append(control.group, panel);
  return {
    group: wrap,
    /** @param {number} next */
    select(next) {
      control.select(isPreset(next) ? next : CUSTOM);
      panel.hidden = isPreset(next);
      range.value = String(Math.min(max, Math.max(min, next)));
      box.value = String(next);
    },
  };
}

/** A labelled block wrapping any control. @param {string} title @param {Node[]} kids */
export function panelField(title, kids) {
  const wrap = document.createElement('div');
  wrap.className = 'panel-field';
  const heading = document.createElement('span');
  heading.className = 'panel-field-title';
  heading.textContent = title;
  wrap.append(heading, ...kids);
  return wrap;
}

/**
 * A number box in inches that reports points, which is what a `Geometry` holds.
 * @param {string} label
 */
function inchBox(label) {
  const box = /** @type {HTMLInputElement} */ (document.createElement('input'));
  box.type = 'number';
  box.className = 'numeric-box';
  box.min = '1';
  box.max = '17';
  box.step = '0.1';
  box.setAttribute('aria-label', label);
  return {
    box,
    points: () => Math.round(Number(box.value) * 72 * 100) / 100,
    /** @param {number} points */
    set(points) { box.value = String(Math.round((points / 72) * 100) / 100); },
  };
}

/**
 * The card-size ladder, with a Custom row of two inch boxes under it.
 *
 * Shared by both panels rather than written twice: the export page offered the
 * presets and no way past them, so a reader who wanted 4x3in had to open the
 * studio for a number the quick page could perfectly well take.
 *
 * @param {Object} config
 * @param {Record<string, any>} config.geometry  `presets.geometry`
 * @param {import('../core/types.js').Geometry} config.value
 * @param {(patch:Partial<import('../core/types.js').SheetSpec>)=>void} config.onChange
 */
export function cardSizeControl({ geometry, value, onChange }) {
  let current = value;
  const width = inchBox(t('format.cardWidth'));
  const height = inchBox(t('format.cardHeight'));
  const custom = document.createElement('div');
  custom.className = 'numeric-custom';
  const unit = (/** @type {string} */ text) => {
    const span = document.createElement('span');
    span.className = 'numeric-unit';
    span.textContent = text;
    return span;
  };
  custom.append(width.box, unit('×'), height.box, unit(t('format.inches')));

  /** Which preset the current page size corresponds to, if any. */
  const presetOf = () => Object.entries(geometry).find(
    ([, g]) => g.pageW === current.pageW && g.pageH === current.pageH,
  )?.[0] ?? '';

  const push = () => onChange({
    geometry: { ...current, pageW: width.points(), pageH: height.points() },
  });
  width.box.addEventListener('change', push);
  height.box.addEventListener('change', push);

  const group = segmented({
    label: t('format.cardSize'),
    value: presetOf(),
    options: [
      ...cardOptions(geometry),
      { value: '', caption: t('format.custom'), title: t('format.cardCustom'), glyph: customGlyph() },
    ],
    // A different card is a different sheet, so a preset takes its margins, gap,
    // columns and natural face count wholesale rather than keeping values tuned for
    // the old shape. Custom keeps the size that is there and just opens the boxes.
    onChange: (id) => {
      custom.hidden = id !== '';
      if (id) onChange({ geometry: { ...geometry[id] } });
    },
  });
  custom.hidden = presetOf() !== '';
  width.set(current.pageW);
  height.set(current.pageH);

  return {
    group: group.group,
    custom,
    /** @param {import('../core/types.js').Geometry} next */
    sync(next) {
      current = next;
      group.select(presetOf());
      custom.hidden = presetOf() !== '';
      width.set(next.pageW);
      height.set(next.pageH);
    },
  };
}

/**
 * The colours a reader can set. The five section roles first, because those are the
 * encoding; ink last, because it is the one that makes a sheet unreadable if it is
 * got wrong, and it should not be the first thing to hand.
 */
const COLOUR_KEYS = [
  { key: 'roles.comm', labelKey: 'colour.comm' },
  { key: 'roles.money', labelKey: 'colour.money' },
  { key: 'roles.move', labelKey: 'colour.move' },
  { key: 'roles.stay', labelKey: 'colour.stay' },
  { key: 'roles.alert', labelKey: 'colour.alert' },
  { key: 'ink', labelKey: 'colour.ink' },
];

/**
 * The palette ladder, with a Custom row of swatches under it.
 *
 * Colour is how a section is coded on the card, so it is the part of a theme worth
 * handing over -- and the only part that can change without re-measuring anything,
 * which is why `themeColors` rides beside `themeId` rather than replacing it. The
 * theme underneath still supplies every size, leading and rule.
 *
 * @param {Object} config
 * @param {Record<string, any>} config.themes  id -> theme
 * @param {string} config.themeId
 * @param {Record<string,string>|undefined} config.themeColors
 * @param {(patch:Partial<import('../core/types.js').SheetSpec>)=>void} config.onChange
 */
export function paletteControl({ themes, themeId, themeColors, onChange }) {
  let state = { themeId, themeColors };
  const roles = (/** @type {string} */ id) => Object.values(themes[id]?.colors?.roles ?? {});

  const swatches = COLOUR_KEYS.map((entry) => {
    const input = /** @type {HTMLInputElement} */ (document.createElement('input'));
    input.type = 'color';
    input.className = 'swatch';
    input.setAttribute('aria-label', t(entry.labelKey));
    input.title = t(entry.labelKey);
    input.addEventListener('input', () => onChange({
      themeColors: { ...currentColours(), [entry.key]: input.value },
    }));
    return { ...entry, input };
  });
  const custom = document.createElement('div');
  custom.className = 'numeric-custom swatches';
  custom.append(...swatches.map((s) => s.input));

  /** Every colour the reader could have changed, defaulted from the base theme. */
  const currentColours = () => {
    /** @type {Record<string,string>} */ const out = {};
    for (const { key, input } of swatches) out[key] = input.value;
    return out;
  };
  const paint = () => {
    const base = themes[state.themeId]?.colors ?? {};
    for (const { key, input } of swatches) {
      const fallback = key.startsWith('roles.') ? base.roles?.[key.slice(6)] : base[key];
      input.value = state.themeColors?.[key] ?? fallback ?? '#000000';
    }
  };

  const group = segmented({
    label: t('format.colours'),
    value: state.themeColors ? 'custom' : state.themeId,
    options: [
      ...Object.keys(themes).map((id) => ({
        value: id,
        caption: id === 'cvd-safe' ? t('format.theme.accessible') : t('format.theme.reference'),
        title: themes[id]?.name ?? id,
        glyph: paletteGlyph(roles(id)),
      })),
      { value: 'custom', caption: t('format.custom'), title: t('format.coloursCustom'), glyph: customGlyph() },
    ],
    onChange: (value) => {
      custom.hidden = value !== 'custom';
      // Starting from what is on screen means the first swatch a reader drags moves
      // one colour rather than resetting the other five.
      if (value === 'custom') onChange({ themeColors: currentColours() });
      else onChange({ themeId: value, themeColors: undefined });
    },
  });
  custom.hidden = !state.themeColors;
  paint();

  return {
    group: group.group,
    custom,
    /** The five section-role colours in effect, which is what the ink-mode glyph
     * draws with -- a custom palette has to show up there too. */
    colours: () => COLOUR_KEYS.filter((c) => c.key.startsWith('roles.'))
      .map((c) => state.themeColors?.[c.key] ?? roles(state.themeId)[0] ?? '#000000')
      .map((c, i) => (state.themeColors ? c : roles(state.themeId)[i] ?? c)),
    /** @param {{themeId:string, themeColors?:Record<string,string>}} next */
    sync(next) {
      state = { themeId: next.themeId, themeColors: next.themeColors };
      group.select(next.themeColors ? 'custom' : next.themeId);
      custom.hidden = !next.themeColors;
      paint();
      redrawGlyphs(group.group, [
        ...Object.keys(themes).map((id) => paletteGlyph(roles(id))),
        customGlyph(),
      ]);
    },
  };
}

/** Swap the icons in a glyph group in place, for the ones that depend on other
 * settings. @param {HTMLElement} group @param {SVGElement[]} glyphs */
export function redrawGlyphs(group, glyphs) {
  [...group.querySelectorAll('.segment')].forEach((button, i) => {
    const old = button.querySelector('svg');
    if (old && glyphs[i]) old.replaceWith(glyphs[i]);
  });
}

/**
 * Three stacked entries whose divider is either in one place or in three, which
 * is the whole of what the setting does.
 * @param {boolean} even
 */
export function splitGlyph(even) {
  const box = 30;
  const svg = frame(box, box);
  // The dividers, at a fixed fraction or at three different ones.
  const at = even ? [0.5, 0.5, 0.5] : [0.38, 0.62, 0.47];
  at.forEach((frac, i) => {
    const y = 5 + i * 7;
    const x = 3 + (box - 6) * frac;
    // The target half, left-aligned; the gloss half, right-aligned. Same shape as
    // `itemGlyph` draws, at a size that reads at 30px.
    svg.append(svgEl('rect', { x: 3, y, width: (x - 3) * 0.72, height: 2, rx: 0.8, class: 'g-ink' }));
    svg.append(svgEl('rect', {
      x: box - 3 - (box - 3 - x) * 0.72, y, width: (box - 3 - x) * 0.72, height: 2, rx: 0.8, class: 'g-ink faint',
    }));
    svg.append(svgEl('line', {
      x1: x, y1: y - 1.5, x2: x, y2: y + 3.5, class: 'g-accent-line',
    }));
  });
  return svg;
}

/**
 * Re-set a glyph group's captions and tooltips, the same way `redrawGlyphs`
 * re-sets its drawings. Needed by any group whose labels name something the reader
 * chose, rather than naming a fixed setting -- the column list names the two
 * languages, so it changes whenever either of them does.
 * @param {HTMLElement} group
 * @param {{caption:string, title?:string}[]} labels
 */
export function relabelGlyphs(group, labels) {
  [...group.querySelectorAll('.segment')].forEach((button, i) => {
    const label = labels[i];
    if (!label) return;
    const caption = button.querySelector('.segment-caption');
    if (caption) caption.textContent = label.caption;
    if (label.title) /** @type {HTMLElement} */ (button).title = label.title;
  });
}

/**
 * How much of a lock screen the operating system draws over, as fractions of the
 * screen's height kept clear at each end.
 *
 * **These numbers are observational, and deliberately coarse.** Neither iOS nor
 * Android publishes a safe area for wallpaper: there is no API, the layouts change
 * between releases, and Android's clock is *dynamic* -- large when there are no
 * notifications, shrinking to a corner when one arrives. Apple's own guidance to
 * wallpaper designers is the vaguest form of it, that detail in roughly the top
 * third is obscured. So the ladder is a starting point rather than a
 * specification, and the thing to trust is the band drawn on the canvas, which is
 * why it is drawn: a reader can hold the phone up against it. Custom takes exact
 * fractions for anyone who has measured their own screen.
 *
 * Both ends, because both systems put controls at the bottom -- the flashlight and
 * camera on one, two shortcut buttons on the other -- and a phrase under those is
 * a phrase you cannot read.
 */
export const RESERVE_CHOICES = [
  { value: { top: 0, bottom: 0 }, captionKey: 'format.reserve.none' },
  { value: { top: 0.30, bottom: 0.12 }, captionKey: 'format.reserve.ios' },
  { value: { top: 0.26, bottom: 0.12 }, captionKey: 'format.reserve.android' },
  { value: { top: 0.42, bottom: 0.12 }, captionKey: 'format.reserve.widgets' },
];

/**
 * A phone with the reserved bands shaded and the rows that survive drawn between
 * them, so the choice is a picture of the screen rather than two percentages.
 * @param {{top:number, bottom:number}} reserve
 */
export function reserveGlyph(reserve) {
  const box = 30;
  const svg = frame(box, box);
  const w = 15;
  const x = (box - w) / 2;
  const y = 2;
  const h = box - 4;
  svg.append(svgEl('rect', { x, y, width: w, height: h, rx: 2, class: 'g-page' }));

  const top = h * reserve.top;
  const bottom = h * reserve.bottom;
  if (top > 0.5) {
    svg.append(svgEl('rect', { x: x + 1, y: y + 1, width: w - 2, height: top - 1, class: 'g-shade' }));
    // The clock, so the shaded band reads as "something is here" rather than as a
    // crop mark.
    svg.append(svgEl('rect', {
      x: x + 3, y: y + top / 2 - 1.4, width: w - 6, height: 2.8, rx: 0.6, class: 'g-ink faint',
    }));
  }
  if (bottom > 0.5) {
    svg.append(svgEl('rect', {
      x: x + 1, y: y + h - bottom, width: w - 2, height: bottom - 1, class: 'g-shade',
    }));
  }
  // The rows that are left, at the pitch the card actually sets them.
  for (let ry = y + top + 2; ry < y + h - bottom - 1.4; ry += 2.6) {
    svg.append(svgEl('rect', { x: x + 2.5, y: ry, width: w - 5, height: 1.2, rx: 0.4, class: 'g-ink' }));
  }
  return svg;
}

/**
 * The lock-screen reserve ladder, with a Custom row of two percent boxes.
 *
 * Shared by both panels, and shown only on a `screen` preset: reserving a third of
 * a 7x5in card for a clock that is not there would be nonsense, and offering the
 * control anyway is the kind of thing that teaches a reader to ignore a panel.
 *
 * @param {Object} config
 * @param {import('../core/types.js').Geometry} config.value
 * @param {(patch:Partial<import('../core/types.js').SheetSpec>)=>void} config.onChange
 */
export function reserveControl({ value, onChange }) {
  let current = value;
  const pct = (/** @type {string} */ label) => {
    const box = /** @type {HTMLInputElement} */ (document.createElement('input'));
    box.type = 'number';
    box.className = 'numeric-box';
    box.min = '0';
    box.max = '60';
    box.step = '1';
    box.setAttribute('aria-label', label);
    return box;
  };
  const top = pct(t('format.reserveTop'));
  const bottom = pct(t('format.reserveBottom'));
  const custom = document.createElement('div');
  custom.className = 'numeric-custom';
  const unit = () => {
    const span = document.createElement('span');
    span.className = 'numeric-unit';
    span.textContent = t('format.percent');
    return span;
  };
  // Turkish writes `%50`, not `50 %`.
  custom.append(...(PERCENT_FIRST.has(uiLanguage())
    ? [unit(), top, unit(), bottom]
    : [top, unit(), bottom, unit()]));

  const reserveOf = () => current.reserve ?? { top: 0, bottom: 0 };
  const asKey = (/** @type {{top:number, bottom:number}} */ r) => `${r.top.toFixed(3)}|${r.bottom.toFixed(3)}`;
  const presetOf = () => (RESERVE_CHOICES.find((c) => asKey(c.value) === asKey(reserveOf()))
    ? asKey(reserveOf()) : '');

  const push = () => onChange({
    geometry: {
      ...current,
      reserve: { top: Number(top.value) / 100, bottom: Number(bottom.value) / 100 },
    },
  });
  top.addEventListener('change', push);
  bottom.addEventListener('change', push);

  const paint = () => {
    const r = reserveOf();
    top.value = String(Math.round(r.top * 100));
    bottom.value = String(Math.round(r.bottom * 100));
    custom.hidden = presetOf() !== '';
  };

  const group = segmented({
    label: t('format.reserve'),
    value: presetOf(),
    options: [
      ...RESERVE_CHOICES.map((choice) => ({
        value: asKey(choice.value),
        caption: t(choice.captionKey),
        title: t('format.reserveTitle', {
          top: Math.round(choice.value.top * 100),
          bottom: Math.round(choice.value.bottom * 100),
        }),
        glyph: reserveGlyph(choice.value),
      })),
      {
        value: '',
        caption: t('format.custom'),
        title: t('format.reserve'),
        glyph: reserveGlyph({ top: 0.18, bottom: 0.3 }),
      },
    ],
    onChange: (key) => {
      const choice = RESERVE_CHOICES.find((c) => asKey(c.value) === key);
      if (choice) onChange({ geometry: { ...current, reserve: { ...choice.value } } });
      else custom.hidden = false;
    },
  });
  paint();

  return {
    group: group.group,
    custom,
    /** @param {import('../core/types.js').Geometry} next */
    sync(next) {
      current = next;
      group.select(presetOf());
      paint();
    },
  };
}
