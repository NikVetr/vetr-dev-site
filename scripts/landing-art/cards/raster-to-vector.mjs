// Raster to Vector: the page's default example, the 240 × 240 cartoon, through the tool's core
// with the page's settings (the R defaults, longest side 600). On the left, the SVG it writes,
// six flat colours in ten regions; on the right, its right eye magnified, the input's pixels on
// one side of a divider and the SVG's smooth outlines on the other. The still has the divider in
// the middle. The loop sweeps it right, to show only pixels, then left, to show only the SVG,
// and back to the middle.
import { readFileSync } from 'node:fs';
import { decodePng } from '../../../shared/decode-png.mjs';
import { submit } from '../../../raster-to-vector/core/index.js';
import { H, W, art, esc, num, polyline } from '../svg.mjs';

const PERIOD = 6;
const TOLERANCE = 0.03;   // image pixels: outline points dropped where the outline stays this close
// [seconds, the divider at this share of the zoom's width]: just past the right edge, then the
// left (so neither it nor its far tag shows), and back.
const SWEEP = [[0, 0.5], [0.5, 0.5], [1.5, 1.04], [2.1, 1.04], [3.9, -0.04], [4.5, -0.04], [5.5, 0.5]];

/**
 * Douglas-Peucker on a ring: the points that keep it within `tol` of the original.
 * @param {number[][]} ring
 * @param {number} tol
 */
function simplify(ring, tol) {
  const pts = [...ring, ring[0]];
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  /** @param {number} i @param {number} j */
  const run = (i, j) => {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[j];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let far = -1;
    let worst = tol;
    for (let k = i + 1; k < j; k++) {
      const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / len;
      if (d > worst) { worst = d; far = k; }
    }
    if (far < 0) return;
    keep[far] = 1;
    run(i, far);
    run(far, j);
  };
  // Split the ring at its point farthest from the first, so neither half is degenerate.
  let mid = 1;
  for (let k = 1; k < ring.length; k++) if (Math.hypot(pts[k][0] - pts[0][0], pts[k][1] - pts[0][1]) > Math.hypot(pts[mid][0] - pts[0][0], pts[mid][1] - pts[0][1])) mid = k;
  keep[mid] = 1;
  run(0, mid);
  run(mid, pts.length - 1);
  return ring.filter((_, k) => keep[k]);
}

export function build() {
  const png = readFileSync(new URL('../../../raster-to-vector/examples/cartoon_flat.png', import.meta.url));
  const image = decodePng(png);
  const result = submit({ image, preprocess: { maxDim: 600 } });
  if (result.width !== image.width || result.height !== image.height) throw new Error('raster-to-vector: the SVG is not at the image size');

  // The SVG's paths, in paint order, each one ring, simplified.
  const paths = [...result.svg.matchAll(/<path d="([^"]+)" fill="(#[0-9A-Fa-f]{6})" fill-rule="evenodd"\/>/g)].map(([, d, fill]) => {
    if ((d.match(/M/g) ?? []).length !== 1) throw new Error('raster-to-vector: a path with holes, which this drawing does not expect');
    const ring = [...d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
    return `<path fill="${fill}" d="${polyline(simplify(ring, TOLERANCE), true, 2)}"/>`;
  });
  if (paths.length !== (result.svg.match(/<path/g) ?? []).length) throw new Error('raster-to-vector: an SVG path this drawing could not read');

  // The right eye, nearer the zoom: the bounding box of the white pixels in the image's right half.
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let y = 0; y < image.height; y++) {
    for (let x = image.width / 2; x < image.width; x++) {
      const i = 4 * (y * image.width + x);
      if (image.data[i] === 255 && image.data[i + 1] === 255 && image.data[i + 2] === 255) [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x + 1), Math.min(y0, y), Math.max(y1, y + 1)];
    }
  }
  if (!Number.isFinite(x0)) throw new Error('raster-to-vector: no white eye in the cartoon');

  // Layout: the whole SVG left, the zoom right, on the same height.
  const side = H - 16;
  const lx = 8;
  const ly = 8;
  const ls = side / image.width;
  const zx = lx + side + 16;
  const zw = W - 8 - zx;
  const zh = side;
  // The zoom: the eye with a margin, at the panel's shape.
  const ch = y1 - y0 + 12;
  const cw = (ch * zw) / zh;
  const cx = (x0 + x1) / 2 - cw / 2;
  const cy = (y0 + y1) / 2 - ch / 2;
  const zs = zh / ch;
  const zoom = `translate(${num(zx - cx * zs, 2)} ${num(ly - cy * zs, 2)}) scale(${num(zs, 4)})`;

  // The input's pixels in the zoom, as one path per colour of each row's runs.
  /** @type {Map<string, string>} */
  const runs = new Map();
  for (let y = Math.floor(cy); y < Math.ceil(cy + ch); y++) {
    let x = Math.floor(cx);
    while (x < Math.ceil(cx + cw)) {
      const i = 4 * (y * image.width + x);
      const hex = `#${[0, 1, 2].map((k) => image.data[i + k].toString(16).padStart(2, '0')).join('')}`;
      let end = x + 1;
      while (end < Math.ceil(cx + cw) && [0, 1, 2].every((k) => image.data[4 * (y * image.width + end) + k] === image.data[i + k])) end++;
      runs.set(hex, `${runs.get(hex) ?? ''}M${x} ${y}h${end - x}v1h${x - end}z`);
      x = end;
    }
  }
  const pixels = [...runs].map(([hex, d]) => `<path fill="${hex}" d="${d}"/>`).join('');

  // The divider's sweep, as a translation from the middle.
  const at = (/** @type {number} */ share) => zx + share * zw;
  const mid = at(0.5);
  if (SWEEP[0][1] !== 0.5 || SWEEP.at(-1)?.[1] !== 0.5) throw new Error('raster-to-vector: the sweep must start and end in the middle');
  const stops = (/** @type {number} */ sign) => SWEEP.map(([t, share]) => `${num((100 * t) / PERIOD, 3)}% { transform: translateX(${num(sign * (at(share) - mid), 2)}px); }`).join(' ');

  const tag = (/** @type {string} */ text, /** @type {number} */ x, /** @type {'start' | 'end'} */ anchor) => {
    const w = text.length * 4.3 + 7;
    const left = anchor === 'end' ? x - w : x;
    return `<rect class="tag" x="${num(left)}" y="${num(ly + zh - 15)}" width="${num(w)}" height="11" rx="5.5"/><text x="${num(left + w / 2)}" y="${num(ly + zh - 9.5)}">${esc(text)}</text>`;
  };
  // The region the zoom shows, marked on the whole.
  const [mx0, my0, mx1, my1] = [lx + cx * ls, ly + cy * ls, lx + (cx + cw) * ls, ly + (cy + ch) * ls];

  return art({
    name: 'raster-to-vector',
    period: PERIOD,
    defs: `<g id="raster-to-vector-svg">${paths.join('')}</g>
<clipPath id="raster-to-vector-whole"><rect x="${lx}" y="${ly}" width="${num(side)}" height="${num(side)}"/></clipPath>
<clipPath id="raster-to-vector-zoom"><rect x="${num(zx)}" y="${ly}" width="${num(zw)}" height="${num(zh)}"/></clipPath>
<clipPath id="raster-to-vector-left"><rect x="${num(zx - zw)}" y="${ly}" width="${num(mid - zx + zw)}" height="${num(zh)}"/></clipPath>`,
    body: `<g clip-path="url(#raster-to-vector-whole)"><use href="#raster-to-vector-svg" transform="translate(${lx} ${ly}) scale(${num(ls, 5)})"/></g>
<rect class="mark" x="${num(mx0)}" y="${num(my0)}" width="${num(mx1 - mx0)}" height="${num(my1 - my0)}"/>
<g clip-path="url(#raster-to-vector-zoom)">
<use href="#raster-to-vector-svg" transform="${zoom}"/>
<g class="slide"><g clip-path="url(#raster-to-vector-left)"><g class="counter"><g transform="${zoom}">${pixels}</g></g></g>
<path class="divider-halo" d="M${num(mid)} ${ly}v${num(zh)}"/><path class="divider" d="M${num(mid)} ${ly}v${num(zh)}"/>
<g class="tags">${tag('pixels', mid - 3, 'end')}${tag('vector', mid + 3, 'start')}</g></g>
</g>
<rect class="frame" x="${lx}" y="${ly}" width="${num(side)}" height="${num(side)}"/><rect class="frame" x="${num(zx)}" y="${ly}" width="${num(zw)}" height="${num(zh)}"/>`,
    // The sliding groups are layered at rest as while they move, so the still's pixel edges fall
    // where the loop's first frame puts them.
    css: `& .slide, & .counter { will-change: transform; }
& .frame { fill: none; stroke: var(--art-line); stroke-width: 1; }
& .mark { fill: none; stroke: var(--art-ink); stroke-width: 1; }
& .divider-halo { stroke: #fff; stroke-width: 3; }
& .divider { stroke: #1b1b1b; stroke-width: 1.2; }
& .tag { fill: var(--art-paper); fill-opacity: 0.92; }
& .tags text { fill: var(--art-ink); font: 7.5px ui-sans-serif, system-ui, sans-serif; text-anchor: middle; dominant-baseline: central; }`,
    loop: `& .slide { animation: raster-to-vector-slide ${PERIOD}s ease-in-out infinite; }
& .counter { animation: raster-to-vector-counter ${PERIOD}s ease-in-out infinite; }
@keyframes raster-to-vector-slide { ${stops(1)} 100% { transform: none; } }
@keyframes raster-to-vector-counter { ${stops(-1)} 100% { transform: none; } }`,
  });
}
