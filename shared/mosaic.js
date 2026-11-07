/** @typedef {{id: string, width: number, height: number}} Tile */
/** @typedef {Tile & {column: number, row: number}} PlacedTile */

/** CSS row-dense first-fit packing, with optional full-row expansion for content-flow cards.
 * @param {Tile[]} tiles @param {number} columns
 * @param {{flow?: boolean, requireRectangle?: boolean}} [options]
 * @returns {{items: PlacedTile[], rows: number}}
 */
export function packMosaic(tiles, columns, { flow = false, requireRectangle = false } = {}) {
  if (!Number.isInteger(columns) || columns < 1 || !tiles.length) throw new Error('Mosaic needs columns and tiles');
  const used = new Set();
  const ids = new Set();
  /** @type {PlacedTile[]} */
  const items = [];
  let rows = 0;
  for (const tile of tiles) {
    const { id } = tile;
    if (!id || ids.has(id) || !Number.isInteger(tile.width) || !Number.isInteger(tile.height) || tile.width < 1 || tile.height < 1) throw new Error(`Invalid mosaic tile: ${id}`);
    const width = flow ? Math.min(tile.width, columns, 2) : tile.width;
    const height = flow ? 1 : tile.height;
    if (width > columns) throw new Error(`Invalid mosaic tile: ${id}`);
    ids.add(id);
    let row = 1, column = 1;
    search: for (;; row++) {
      searchColumn: for (column = 1; column + width - 1 <= columns; column++) {
        for (let y = row; y < row + height; y++) for (let x = column; x < column + width; x++) if (used.has(`${x},${y}`)) continue searchColumn;
        break search;
      }
    }
    for (let y = row; y < row + height; y++) for (let x = column; x < column + width; x++) used.add(`${x},${y}`);
    items.push({ id, width, height, row, column });
    rows = Math.max(rows, row + height - 1);
  }
  if (flow) {
    for (let row = 1; row <= rows; row++) {
      const rowItems = items.filter(tile => tile.row === row).sort((a, b) => a.column - b.column);
      const last = rowItems[rowItems.length - 1];
      for (let column = last.column + last.width; column <= columns; column++) used.add(`${column},${row}`);
      last.width = columns - last.column + 1;
    }
  }
  if (requireRectangle && used.size !== rows * columns) throw new Error(`Mosaic has ${rows * columns - used.size} unfilled cells at ${columns} columns`);
  return { items, rows };
}

/** Place a static collection, then put its DOM in visual reading order. CSS owns track sizes.
 * Direct children have data-mosaic-key; a single column follows their initial source order.
 * @param {HTMLElement} wall
 * @param {{layouts: Record<number, Tile[]>, onLayout?: () => void}} options
 */
export function mountMosaic(wall, { layouts, onLayout = () => {} }) {
  const source = /** @type {HTMLElement[]} */ ([...wall.children]);
  const cards = new Map(source.map(card => [card.dataset.mosaicKey, card]));
  if (cards.size !== source.length || cards.has(undefined)) throw new Error('Mosaic cards need unique data-mosaic-key values');
  let previous = '', pending = 0;
  const redraw = () => {
    const css = getComputedStyle(wall);
    const columns = Number(css.getPropertyValue('--cols'));
    const flow = columns === 1 || css.getPropertyValue('--mosaic-flow').trim() === '1';
    const key = `${columns}:${flow}`;
    if (key !== previous) {
      const layout = columns === 1 ? source.map(card => ({ id: /** @type {string} */ (card.dataset.mosaicKey), width: 1, height: 1 })) : layouts[columns];
      if (!layout || layout.length !== source.length || layout.some(tile => !cards.has(tile.id))) throw new Error(`Mosaic layout does not match cards at ${columns} columns`);
      const { items } = packMosaic(layout, columns, { flow, requireRectangle: true });
      const focused = document.activeElement;
      for (const tile of items) {
        const card = /** @type {HTMLElement} */ (cards.get(tile.id));
        card.style.setProperty('--w', String(tile.width));
        card.style.setProperty('--h', String(tile.height));
        card.style.gridColumn = `${tile.column} / span ${tile.width}`;
        card.style.gridRow = `${tile.row} / span ${tile.height}`;
      }
      wall.append(...items.sort((a, b) => a.row - b.row || a.column - b.column).map(tile => /** @type {HTMLElement} */ (cards.get(tile.id))));
      if (focused instanceof HTMLElement && wall.contains(focused)) focused.focus({ preventScroll: true });
      previous = key;
    }
    onLayout();
  };
  redraw();
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(redraw);
  });
  observer.observe(wall);
  return () => { observer.disconnect(); cancelAnimationFrame(pending); };
}
