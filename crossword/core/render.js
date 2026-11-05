// SVG drawings of a crossword, in the R generator's style (R/plot.R): square cells
// with a drop shadow, letters in bold, clue numbers in the top-left corner. Unlike R,
// the numbers are smaller than the letters, so two digits stay clear of the letter.

/**
 * @typedef {{ number: number, row: number, col: number }} Start
 * @typedef {{ rows: number, cols: number, grid: string[][], entries: Start[] }} Drawable
 * @typedef {{ rows: number, cols: number, grid: string[][], entries: (Start & { dir: 'across' | 'down', clue: string, length: number })[] }} Puzzle
 */

const CELL = 0.9; // cell side, in units of the grid pitch
const SHADOW = 0.1 * CELL;
const FONT = 0.4;
const NUMBER_FONT = 0.24;
const DIGIT_HEIGHT = 0.72 * NUMBER_FONT; // cap height of Helvetica and Arial digits

/**
 * @param {Drawable} crossword a crossword from a result (its orig or refined layout)
 * @param {{ style?: 'filled' | 'blank', cellSize?: number }} [options] filled shows the
 *   letters, blank only the numbers; cellSize is the grid pitch in pixels
 * @returns {string} SVG text
 */
export function renderSvg(crossword, { style = 'filled', cellSize = 40 } = {}) {
  const width = crossword.cols + 1;
  const height = crossword.rows + 1;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * cellSize}" height="${height * cellSize}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    gridMarkup(crossword, style),
    '</svg>',
  ].join('\n');
}

/**
 * The puzzle to hand to a solver: the blank grid, with the numbered Across and Down clues
 * (and each answer's length) in two columns beneath it, and no answers.
 * @param {Puzzle} crossword
 * @param {{ cellSize?: number }} [options] cellSize is the grid pitch in pixels
 * @returns {string} SVG text
 */
export function renderPuzzleSvg(crossword, { cellSize = 40 } = {}) {
  const width = Math.max(crossword.cols + 1, PUZZLE_WIDTH);
  const columnWidth = (width - 2 * PUZZLE_MARGIN - PUZZLE_GAP) / 2;
  const top = crossword.rows + 1 + PUZZLE_MARGIN;
  /** @type {string[]} */
  const texts = [];
  let bottom = top;
  ['across', 'down'].forEach((dir, k) => {
    const x = PUZZLE_MARGIN + k * (columnWidth + PUZZLE_GAP);
    let y = top + HEADING_FONT;
    texts.push(`<text x="${fmt(x)}" y="${fmt(y)}" font-size="${HEADING_FONT}" font-weight="bold">${dir === 'across' ? 'Across' : 'Down'}</text>`);
    y += 0.5 * CLUE_LINE;
    const list = crossword.entries.filter((e) => e.dir === dir);
    const indent = Math.max(0, ...list.map((e) => textWidth(`${e.number}. `, CLUE_FONT)));
    for (const e of list) {
      wrap(`${e.clue} (${e.length})`, columnWidth - indent, CLUE_FONT).forEach((line, i) => {
        y += CLUE_LINE;
        if (i === 0) texts.push(`<text x="${fmt(x)}" y="${fmt(y)}" font-weight="bold">${e.number}.</text>`);
        texts.push(`<text x="${fmt(x + indent)}" y="${fmt(y)}">${escapeXml(line)}</text>`);
      });
    }
    bottom = Math.max(bottom, y);
  });
  const height = bottom + PUZZLE_MARGIN;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width * cellSize)}" height="${fmt(height * cellSize)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    `<rect width="${fmt(width)}" height="${fmt(height)}" fill="#ffffff"/>`,
    `<g transform="translate(${fmt((width - crossword.cols - 1) / 2)} 0)">${gridMarkup(crossword, 'blank')}</g>`,
    `<g font-family="Helvetica, Arial, sans-serif" font-size="${CLUE_FONT}" fill="#000000">${texts.join('')}</g>`,
    '</svg>',
  ].join('\n');
}

/** The cells, their shadows, letters (filled) and clue numbers, in grid-pitch units. @param {Drawable} crossword @param {'filled' | 'blank'} style */
function gridMarkup(crossword, style) {
  const { rows, cols, grid, entries } = crossword;
  /** @type {string[]} */
  const shadows = [];
  /** @type {string[]} */
  const cells = [];
  /** @type {string[]} */
  const letters = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const letter = grid[r][c];
      if (letter === '') continue;
      const x = c + 1 - CELL / 2;
      const y = r + 1 - CELL / 2;
      shadows.push(`<rect x="${fmt(x + SHADOW)}" y="${fmt(y + SHADOW)}" width="${CELL}" height="${CELL}"/>`);
      cells.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${CELL}" height="${CELL}"/>`);
      if (style === 'filled') letters.push(`<text x="${c + 1}" y="${r + 1}">${escapeXml(letter)}</text>`);
    }
  }
  const starts = new Map(entries.map((e) => [`${e.row},${e.col}`, e]));
  // each number's top-left corner 1/16 of a cell in from the cell's, as in R
  const inset = CELL / 16;
  const numbers = [...starts.values()].map((e) => (
    `<text x="${fmt(e.col + 1 - CELL / 2 + inset)}" y="${fmt(e.row + 1 - CELL / 2 + inset + DIGIT_HEIGHT)}">${e.number}</text>`
  ));
  return [
    `<g fill="#000000">${shadows.join('')}</g>`,
    `<g fill="#fcfcfc" stroke="#000000" stroke-width="0.05">${cells.join('')}</g>`,
    `<g font-family="Helvetica, Arial, sans-serif" font-size="${FONT}" fill="#000000">`,
    `<g font-weight="bold" text-anchor="middle" dominant-baseline="central">${letters.join('')}</g>`,
    `<g font-size="${NUMBER_FONT}">${numbers.join('')}</g>`,
    '</g>',
  ].join('\n');
}

// The puzzle's clue lists, in grid-pitch units: at least 16 wide, in two columns.
const PUZZLE_WIDTH = 16;
const PUZZLE_MARGIN = 0.6;
const PUZZLE_GAP = 0.8;
const HEADING_FONT = 0.44;
const CLUE_FONT = 0.34;
const CLUE_LINE = 1.35 * CLUE_FONT;

// Advance widths of Helvetica (and Arial and Liberation Sans, which share them), per 1000
// em, for printable ASCII from the space on. Other characters count as wide, and every
// width as a tenth wider, so a line set in a fallback font still fits its column.
const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];

/** @param {string} text @param {number} size */
function textWidth(text, size) {
  let em = 0;
  for (const ch of text) {
    const code = /** @type {number} */ (ch.codePointAt(0));
    em += code >= 32 && code <= 126 ? WIDTHS[code - 32] : code < 0x1100 ? 833 : 1000;
  }
  return (1.1 * size * em) / 1000;
}

/**
 * Breaks a text into lines no wider than `width`, between words where it can and inside a
 * word only when the word alone is wider (as overflow-wrap: break-word does).
 * @param {string} text @param {number} width @param {number} size
 */
function wrap(text, width, size) {
  /** @type {string[]} */
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const joined = line ? `${line} ${word}` : word;
    if (textWidth(joined, size) <= width) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const ch of word) {
      if (line && textWidth(line + ch, size) > width) {
        lines.push(line);
        line = '';
      }
      line += ch;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

/** @param {number} x */
function fmt(x) {
  return String(Math.round(x * 1000) / 1000);
}

/** @param {string} text */
function escapeXml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
}
