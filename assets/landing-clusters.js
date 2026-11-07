import { traceCellContours, roundedContourPath } from './cluster-contours.js';

/** Grid track boundaries halfway through each gutter. @param {string} tracks @param {number} gap @param {number} offset */
function boundaries(tracks, gap, offset) {
  return tracks.split(' ').map(Number.parseFloat).reduce((at, size) => [...at, at[at.length - 1] + size + gap], [offset - gap / 2]);
}

/** Shrink a clockwise orthogonal union by moving its edges to their right. Holes expand.
 * @param {[number, number][]} ring @param {number} distance
 * @returns {[number, number][]}
 */
function inset(ring, distance) {
  return ring.map(([x, y], i) => {
    const previous = ring[(i + ring.length - 1) % ring.length];
    const next = ring[(i + 1) % ring.length];
    return [x - distance * (Math.sign(y - previous[1]) + Math.sign(next[1] - y)),
      y + distance * (Math.sign(x - previous[0]) + Math.sign(next[0] - x))];
  });
}

/** Draw the actual placed cells, after packing; outlines never affect placement.
 * @param {HTMLElement} wall
 */
export function drawClusters(wall) {
  const frame = wall.parentElement;
  const svg = frame?.querySelector('.cluster-outlines');
  const labels = frame?.querySelector('.cluster-labels');
  if (!frame || !svg || !labels) throw new Error('Missing landing cluster layers');
  const origin = frame.getBoundingClientRect();
  const grid = wall.getBoundingClientRect();
  const style = getComputedStyle(wall);
  const xs = boundaries(style.gridTemplateColumns, parseFloat(style.columnGap), grid.left - origin.left);
  const ys = boundaries(style.gridTemplateRows, parseFloat(style.rowGap), grid.top - origin.top);
  svg.setAttribute('viewBox', `0 0 ${origin.width} ${origin.height}`);
  svg.replaceChildren();
  labels.replaceChildren();
  /** @type {Map<string, {cells: [number, number][]}>} */
  const groups = new Map();
  for (const card of /** @type {NodeListOf<HTMLElement>} */ (wall.querySelectorAll(':scope > li'))) {
    const category = card.dataset.category;
    if (!category) throw new Error('Landing card has no category');
    const group = groups.get(category) ?? { cells: [] };
    groups.set(category, group);
    const css = getComputedStyle(card);
    const left = parseInt(css.gridColumnStart) - 1, top = parseInt(css.gridRowStart) - 1;
    const width = Number(css.getPropertyValue('--w')) || 1, height = Number(css.getPropertyValue('--h')) || 1;
    if (!Number.isInteger(left) || !Number.isInteger(top)) throw new Error('Cluster outlines require placed grid cards');
    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) group.cells.push([x, y]);
  }
  for (const [category, { cells }] of groups) {
    const name = document.getElementById(`category-${category}`)?.textContent?.trim();
    if (!name) throw new Error(`Missing category label: ${category}`);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.dataset.category = category;
    path.setAttribute('fill-rule', 'evenodd');
    const paths = [];
    for (const loop of traceCellContours(cells)) {
      const points = inset(loop.map(([x, y]) => [xs[x], ys[y]]), 2);
      paths.push(roundedContourPath(points, 7));
      // A clockwise loop encloses a component; counterclockwise loops enclose holes.
      const area = points.reduce((sum, [x, y], i) => {
        const next = points[(i + 1) % points.length];
        return sum + x * next[1] - y * next[0];
      }, 0);
      if (area < 0) continue;
      const label = document.createElement('span');
      label.className = 'cluster-label';
      label.dataset.category = category;
      label.textContent = name;
      labels.append(label);
      const edges = points.flatMap(([x, y], i) => {
        const next = points[(i + 1) % points.length];
        return next[1] === y && next[0] - x >= label.offsetWidth + 16 ? [{ x, y }] : [];
      }).sort((a, b) => a.y - b.y || a.x - b.x);
      if (!edges.length) throw new Error(`No room for category label: ${category}`);
      label.style.left = `${edges[0].x + 8}px`;
      label.style.top = `${edges[0].y}px`;
    }
    path.setAttribute('d', paths.join(' '));
    svg.append(path);
  }
}
