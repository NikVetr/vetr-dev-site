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

/** Rows at three spacings, so "roomy" looks roomy. @param {number} level 0..2 */
/**
 * Points of extra breathing room around every text element, at nominal type size.
 *
 * `Tight` is 0, which reproduces the hand-built LaTeX original exactly -- its
 * padding really is almost nil, with consecutive rows held apart by a 0.22pt rule
 * alone. That is deliberate there and reads as cramped everywhere else, so the
 * default sits one step up.
 *
 * Carries a caption *key* rather than a caption: this is module scope, evaluated
 * before any catalogue is loaded, so the words are looked up where the option is
 * built.
 */
export const PADDING_CHOICES = [
  { value: 0, captionKey: 'format.padding.tight' },
  { value: 0.5, captionKey: 'format.padding.normal' },
  { value: 0.9, captionKey: 'format.padding.roomy' },
  { value: 1.4, captionKey: 'format.padding.airy' },
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
  const gap = [0.8, 1.8, 3, 4.4, 6][level];
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
 * right, and the accent rule marks the left edge as it does on the sheet. The
 * chosen field is drawn in the accent colour; the rest stay faint, so the glyph
 * doubles as a picture of the whole entry.
 */
const FIELD_ROWS = {
  script: [0, 0], script_alt: [0, 1], roman: [0, 2], ipa: [0, 3],
  gloss: [1, 0], literal: [1, 1], respell: [1, 2],
};

/** @param {keyof typeof FIELD_ROWS} field */
export function fieldGlyph(field) {
  const box = 30;
  const svg = frame(box, box);
  const [side, row] = FIELD_ROWS[field];
  // The accent rule down the left edge of every entry on the sheet.
  svg.append(svgEl('rect', { x: 0.8, y: 4, width: 1.5, height: 22, class: 'g-ink faint' }));
  for (const [name, [s, r]] of Object.entries(FIELD_ROWS)) {
    const on = name === field;
    const y = 5.5 + r * 6;
    // The first line of each stack is the one set in bold on the sheet.
    const thick = r === 0 ? 3.2 : 2.4;
    svg.append(svgEl('rect', {
      x: s === 0 ? 4 : 15.5,
      y: on ? y : y + (3.2 - thick) / 2,
      width: 10.5,
      height: on ? 3.4 : thick,
      rx: 0.8,
      class: on ? 'g-accent' : 'g-ink faint',
    }));
  }
  // A tick on the chosen line's own side, so the glyph reads at a glance.
  svg.append(svgEl('rect', {
    x: side === 0 ? 4 : 15.5, y: 5.5 + row * 6 - 1.4, width: 10.5, height: 0.7,
    rx: 0.35, class: 'g-accent',
  }));
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
