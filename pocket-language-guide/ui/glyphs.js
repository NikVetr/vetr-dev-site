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

/** @param {number} w @param {number} h */
function frame(w, h) {
  const svg = svgEl('svg', {
    viewBox: `0 0 ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true', class: 'glyph',
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
    svg.append(svgEl('rect', { x: 2, y: 6, width: 11, height: 18, rx: 1, class: 'g-page' }));
    svg.append(svgEl('rect', { x: 15, y: 6, width: 11, height: 18, rx: 1, class: 'g-page' }));
    svg.append(svgEl('path', {
      d: 'M22 13 h7 M25.5 9.5 v7', class: 'g-bracket',
    }));
    return svg;
  }
  const shown = Math.min(count, 6);
  const cols = shown <= 2 ? shown : Math.ceil(shown / 2);
  const rows = shown <= 2 ? 1 : 2;
  const cw = (box - 4 - (cols - 1) * 2) / cols;
  const ch = (box - 8 - (rows - 1) * 2) / rows;
  for (let i = 0; i < shown; i += 1) {
    svg.append(svgEl('rect', {
      x: 2 + (i % cols) * (cw + 2),
      y: 4 + Math.floor(i / cols) * (ch + 2),
      width: cw, height: ch, rx: 1, class: 'g-page',
    }));
  }
  if (count > shown) {
    const label = svgEl('text', { x: box - 1, y: box - 1, class: 'g-count' });
    label.textContent = `+${count - shown}`;
    svg.append(label);
  }
  return svg;
}

/** Rows at three spacings, so "roomy" looks roomy. @param {number} level 0..2 */
export function densityGlyph(level) {
  const box = 30;
  const svg = frame(box, box);
  const gap = [1.2, 3, 5][level];
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
  const padY = 6.5;
  const cellW = (box - 2 - padX * 2) / shape.cols;
  const cellH = (box - 8 - (padY - 4) * 2) / shape.rows;
  for (const cell of shape.cells) {
    const w = cellW * (cell.minor ? 0.62 : 0.86);
    const x = cell.align === 'end'
      ? padX + (cell.col + 1) * cellW - w
      : cell.align === 'center'
        ? padX + cell.col * cellW + (cellW - w) / 2
        : padX + cell.col * cellW;
    svg.append(svgEl('rect', {
      x,
      y: padY + cell.row * cellH + (cellH - (cell.minor ? 1.8 : 2.6)) / 2,
      width: Math.max(2, w),
      height: cell.minor ? 1.8 : 2.6,
      rx: 0.8,
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'segment';
    button.setAttribute('role', 'radio');
    if (option.title) button.title = option.title;
    button.append(option.glyph);
    const caption = document.createElement('span');
    caption.className = 'segment-caption';
    caption.textContent = option.caption;
    button.append(caption);
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
