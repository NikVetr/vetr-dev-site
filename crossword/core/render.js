// SVG drawings of a crossword, in the R generator's style (R/plot.R): square cells
// with a drop shadow, letters in bold, clue numbers in the top-left corner.

/**
 * @typedef {{ rows: number, cols: number, grid: string[][], entries: { number: number, row: number, col: number }[] }} Drawable
 */

const CELL = 0.9; // cell side, in units of the grid pitch
const SHADOW = 0.1 * CELL;
const FONT = 0.4;
const DIGIT_HEIGHT = 0.72 * FONT; // cap height of Helvetica and Arial digits

/**
 * @param {Drawable} crossword a crossword from a result (its orig or refined layout)
 * @param {{ style?: 'filled' | 'blank', cellSize?: number }} [options] filled shows the
 *   letters, blank only the numbers; cellSize is the grid pitch in pixels
 * @returns {string} SVG text
 */
export function renderSvg(crossword, { style = 'filled', cellSize = 40 } = {}) {
  const { rows, cols, grid, entries } = crossword;
  const width = cols + 1;
  const height = rows + 1;
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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width * cellSize}" height="${height * cellSize}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<g fill="#000000">${shadows.join('')}</g>`,
    `<g fill="#fcfcfc" stroke="#000000" stroke-width="0.05">${cells.join('')}</g>`,
    `<g font-family="Helvetica, Arial, sans-serif" font-size="${FONT}" fill="#000000">`,
    `<g font-weight="bold" text-anchor="middle" dominant-baseline="central">${letters.join('')}</g>`,
    `<g>${numbers.join('')}</g>`,
    '</g>',
    '</svg>',
  ].join('\n');
}

/** @param {number} x */
function fmt(x) {
  return String(Math.round(x * 1000) / 1000);
}

/** @param {string} text */
function escapeXml(text) {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? ch);
}
