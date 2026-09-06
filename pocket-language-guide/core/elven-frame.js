import { pathPen } from './ornament-designs.js';

/** @typedef {import('./types.js').SheetSpec} SheetSpec */
/** @typedef {import('./types.js').PathMark} PathMark */
/** @typedef {ReturnType<typeof pathPen>} Pen */

/** @param {SheetSpec} spec */
export function isElven(spec) {
  return spec.target === 'qya' && spec.inkMode !== 'low-ink'
    && (spec.ornamentStyle === 'language' || spec.ornamentStyle === 'botanical');
}

/** A real, measured reservation: the frame never borrows space from glyphs.
 * @param {SheetSpec} spec */
export function elvenInset(spec) {
  return isElven(spec) ? Math.min(14, Math.max(6, Math.min(spec.geometry.pageW, spec.geometry.pageH) * 0.032)) : 0;
}

/** @param {SheetSpec} spec @param {string} ink */
export function elvenColours(spec, ink) {
  return spec.inkMode === 'mono'
    ? { stem: ink, thread: ink, rule: ink }
    : { stem: '#486455', thread: '#a38b58', rule: '#b5c2b6' };
}

/** A curved, pointed leaf with a fine central vein. Coordinates are in points.
 * @param {Pen} p @param {number} x @param {number} y @param {number} dx
 * @param {number} dy @param {number} breadth @param {boolean} [vein] */
function leaf(p, x, y, dx, dy, breadth, vein = false) {
  const length = Math.hypot(dx, dy);
  if (length < 0.1) return;
  const nx = -dy / length * breadth, ny = dx / length * breadth;
  p.m(x, y);
  p.c(x + dx * 0.18 + nx, y + dy * 0.18 + ny,
    x + dx * 0.62 + nx, y + dy * 0.62 + ny, x + dx, y + dy);
  p.c(x + dx * 0.7 - nx * 0.35, y + dy * 0.7 - ny * 0.35,
    x + dx * 0.22 - nx * 0.5, y + dy * 0.22 - ny * 0.5, x, y);
  if (vein) { p.m(x, y); p.q(x + dx * 0.6, y + dy * 0.4, x + dx, y + dy); }
}

/** @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string} stroke @param {number} strokeWidth @param {(p:Pen)=>void} draw
 * @returns {PathMark} */
function mark(x, y, w, h, stroke, strokeWidth, draw) {
  const p = pathPen(100, 100);
  draw(p);
  return { x, y, w, h, stroke, strokeWidth, d: p.d() };
}

/** @param {PathMark} path @param {boolean} horizontal @param {boolean} vertical */
function mirror(path, horizontal, vertical) {
  let i = 0;
  return { ...path, d: path.d.replace(/-?\d+(?:\.\d+)?/g, n => {
    const y = i++ % 2;
    return String(Number(((y ? vertical : horizontal) ? (y ? path.h : path.w) - Number(n) : Number(n)).toFixed(3)));
  }) };
}

/** Section branches grow out of the side stem, curl beneath the title, and rise
 * into the measured space to its right. @param {number} w @param {number} y
 * @param {number} h @param {number} titleEnd @param {string} colour
 * @returns {PathMark[]} */
export function elvenHeading(w, y, h, titleEnd, colour) {
  const ruleH = Math.min(2.6, h);
  const out = [mark(0, y + h - ruleH, w, ruleH, colour, 0.28, p => {
    p.m(0.3, ruleH * 0.66);
    p.c(w * 0.24, ruleH * 0.66, w * 0.3, ruleH * 0.22, w * 0.51, ruleH * 0.52);
    p.c(w * 0.76, ruleH * 0.87, w * 0.88, ruleH * 0.32, w - 0.3, ruleH * 0.58);
    for (const a of [0.12, 0.25, 0.76, 0.9]) {
      leaf(p, w * a, ruleH * 0.57, Math.min(8, w * 0.08), -ruleH * 0.37, ruleH * 0.14);
    }
  })];
  const room = w - titleEnd - 5;
  if (room >= 18 && h >= 5) {
    out.push(mark(titleEnd + 5, y, room, h, colour, 0.3, p => {
      const floor = h - ruleH * 0.42;
      p.m(room - 0.3, floor);
      p.c(room * 0.51, floor, room * 0.77, 0.9, room * 0.19, h * 0.4);
      p.c(room * 0.07, h * 0.48, room * 0.11, h * 0.8, room * 0.26, h * 0.66);
      p.m(room * 0.63, floor - 0.3);
      p.c(room * 0.45, h * 0.7, room * 0.53, h * 0.13, room * 0.78, 0.7);
      leaf(p, room * 0.56, h * 0.63, room * 0.2, -h * 0.43, Math.min(1.1, h * 0.1), true);
      leaf(p, room * 0.8, h * 0.81, room * 0.12, -h * 0.54, Math.min(0.8, h * 0.09));
    }));
  }
  return out;
}

/** @param {number} w @param {number} y */
const stemX = (w, y) => w * (0.5 + 0.19 * Math.sin(y / 29));
/** @param {number} w @param {number} y */
const stemSlope = (w, y) => w * 0.19 / 29 * Math.cos(y / 29);

/** One continuous climbing stem. Leaves are sized in points, so a taller page
 * grows more branches instead of stretching a leaf into a ribbon.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{stem:string,thread:string}} colours @returns {PathMark[]} */
function vine(x, y, w, h, colours) {
  if (w < 1 || h < 3) return [];
  const out = [mark(x, y, w, h, colours.stem, 0.32, p => {
    p.m(stemX(w, 0), 0.3);
    for (let a = 0.3; a < h - 0.3; a += 18) {
      const b = Math.min(a + 18, h - 0.3), d = (b - a) / 3;
      p.c(stemX(w, a) + stemSlope(w, a) * d, a + d,
        stemX(w, b) - stemSlope(w, b) * d, b - d, stemX(w, b), b);
    }
    if (w >= 2.8) for (let a = 20, i = 0; a < h - 5; a += 24, i++) {
      const s = i % 2 ? -1 : 1;
      const dx = s * Math.min(w * 0.27, 3.2);
      leaf(p, stemX(w, a), a, dx, -Math.min(15, w * 2.5), Math.min(0.65, w * 0.065), w > 6);
      if (w > 6) leaf(p, stemX(w, a - 7), a - 7, -dx * 0.65, -8, 0.45);
    }
  })];
  out.push(mark(x, y, w, h, colours.thread, 0.2, p => {
    p.m(w * 0.5, 0.3);
    for (let a = 0.3; a < h - 0.3; a += 35) {
      const b = Math.min(a + 35, h - 0.3);
      p.c(w * 0.09, a + (b - a) * 0.32, w * 0.91, a + (b - a) * 0.68, w * 0.5, b);
    }
  }));
  return out;
}

/** Interwoven arches between the vertical stems, with richer foliage at the
 * junctions. All detail stays in the reserved horizontal band.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number[]} nodes @param {{stem:string,thread:string}} colours
 * @param {boolean} bottom @returns {PathMark[]} */
function canopy(x, y, w, h, nodes, colours, bottom) {
  const base = h * 0.76;
  const knots = [0.4, ...nodes.filter(a => a > 6 && a < w - 6), w - 0.4].sort((a, b) => a - b);
  const out = [mark(x, y, w, h, colours.stem, 0.35, p => {
    p.m(0.4, base);
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1], b = knots[i], d = b - a;
      p.m(a, base);
      p.c(a + d * 0.28, h * 0.04, b - d * 0.28, h * 0.04, b, base);
      p.m(a, base);
      p.c(a + d * 0.3, h * 0.95, b - d * 0.3, h * 0.14, b, base);
      for (const s of [-1, 1]) {
        const root = s > 0 ? a : b;
        for (let k = 0; k < 3; k++) {
          const dx = s * Math.min(d * (0.2 + k * 0.09), 13 + k * 7);
          leaf(p, root + s * (1.4 + k), base - k * 0.5, dx,
            -h * (0.47 - k * 0.09), Math.min(0.8, h * 0.055), k === 0 && h > 12);
        }
      }
      const middle = (a + b) / 2;
      p.m(middle - 3, h * 0.27); p.q(middle, h * 0.2, middle, h * 0.07);
      p.q(middle, h * 0.2, middle + 3, h * 0.27);
    }
  }), mark(x, y, w, h, colours.thread, 0.22, p => {
    p.m(0.4, base + 0.6);
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1], b = knots[i], d = b - a;
      p.c(a + d * 0.23, h * 0.14, b - d * 0.32, h * 0.14, b, base + 0.6);
    }
  })];
  return bottom ? out.map(p => mirror(p, false, true)) : out;
}

/** A corner is drawn as two connected arms, keeping their bounding boxes clear
 * of text as well as their ink. The long arm coils into the canopy; the short
 * arm turns down into the outer willow stem.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{stem:string,thread:string}} colours @param {boolean} right
 * @param {boolean} bottom @returns {PathMark[]} */
function cornerCrown(x, y, w, h, colours, right, bottom) {
  const ink = mark(x, y, w, h, colours.stem, 0.32, p => {
    p.m(0.7, h * 0.85);
    p.c(w * 0.2, h * 0.81, w * 0.19, h * 0.12, w * 0.48, h * 0.12);
    p.c(w * 0.8, h * 0.12, w * 0.76, h * 0.95, w * 0.48, h * 0.79);
    p.c(w * 0.29, h * 0.66, w * 0.55, h * 0.25, w * 0.61, h * 0.5);
    p.m(0.8, h * 0.9);
    p.c(w * 0.2, h * 0.46, w * 0.39, h * 0.55, w * 0.98, h * 0.67);
    for (let i = 0; i < 5; i++) {
      const a = 0.055 + i * 0.075;
      leaf(p, w * a, h * (0.85 - i * 0.07), w * (0.08 + i * 0.015),
        -h * (0.5 - i * 0.03), Math.min(1, h * 0.06), true);
    }
    leaf(p, w * 0.76, h * 0.63, w * 0.19, -h * 0.25, h * 0.065);
    p.m(w * 0.66, h * 0.62); p.c(w * 0.79, h * 0.56, w * 0.83, h * 0.2, w * 0.73, h * 0.2);
  });
  const thread = mark(x, y, w, h, colours.thread, 0.2, p => {
    p.m(0.9, h * 0.95); p.c(w * 0.27, h * 0.74, w * 0.38, h * 0.18, w * 0.69, h * 0.67);
    p.c(w * 0.82, h * 0.89, w * 0.93, h * 0.63, w * 0.96, h * 0.39);
  });
  return [ink, thread].map(path => mirror(path, right, bottom));
}

/** Let an underfilled column end in a growing branch, joined to the bottom frame,
 * rather than a disconnected badge. @param {number} x @param {number} y
 * @param {number} w @param {number} h @param {{stem:string,thread:string}} colours */
function lowerBranches(x, y, w, h, colours) {
  return [mark(x, y, w, h, colours.stem, 0.3, p => {
    p.m(0.3, h - 0.4);
    p.c(w * 0.29, h - 0.4, w * 0.12, h * 0.24, w * 0.41, h * 0.27);
    p.c(w * 0.65, h * 0.3, w * 0.38, h * 0.86, w * 0.26, h * 0.58);
    p.c(w * 0.19, h * 0.42, w * 0.37, h * 0.4, w * 0.38, h * 0.53);
    p.m(w - 0.3, h - 0.4);
    p.c(w * 0.75, h - 0.4, w * 0.89, h * 0.1, w * 0.55, h * 0.13);
    p.c(w * 0.35, h * 0.17, w * 0.58, h * 0.72, w * 0.68, h * 0.49);
    p.m(w * 0.5, h - 0.4); p.c(w * 0.62, h * 0.69, w * 0.49, h * 0.51, w * 0.5, h * 0.04);
    leaf(p, w * 0.5, h * 0.53, -w * 0.15, -h * 0.4, Math.min(1.2, h * 0.04), true);
    leaf(p, w * 0.5, h * 0.37, w * 0.12, -h * 0.34, Math.min(1, h * 0.03));
    leaf(p, w * 0.72, h * 0.68, w * 0.14, -h * 0.37, Math.min(1.3, h * 0.035), true);
    leaf(p, w * 0.16, h * 0.79, -w * 0.09, -h * 0.4, Math.min(1.1, h * 0.03));
  }), mark(x, y, w, h, colours.thread, 0.2, p => {
    p.m(0.3, h - 0.8); p.c(w * 0.31, h * 0.74, w * 0.29, h * 0.27, w * 0.5, h * 0.6);
    p.c(w * 0.76, h * 0.97, w * 0.75, h * 0.43, w - 0.3, h - 0.8);
  })];
}

/** @param {SheetSpec} spec @param {import('./types.js').Face} face
 * @param {{left:number,top:number,width:number,height:number,colWidth:number,columnGap:number}} box
 * @param {{top:number,bottom:number}} bands @param {string} ink @returns {PathMark[]} */
export function elvenFrame(spec, face, box, bands, ink) {
  const inset = elvenInset(spec);
  if (!inset) return [];
  const colours = elvenColours(spec, ink), g = spec.geometry;
  const bandH = inset * 1.5;
  const top = box.top - bandH - bands.top;
  const bottom = box.top + box.height + bands.bottom;
  const outerW = inset - 1;
  const left = box.left - inset + 0.5;
  const right = box.left + box.width + 0.5;
  const cut = g.pageW / 2;
  /** @type {PathMark[]} */ const out = [];
  /** @type {{x:number,w:number,start:number,end:number,column:number}[]} */ const rails = [];
  for (let c = 0; c <= g.columns; c++) {
    const colX = box.left + c * (box.colWidth + box.columnGap);
    const x = c === 0 ? left : c === g.columns ? right : colX - box.columnGap + 0.5;
    const w = c === 0 || c === g.columns ? outerW : box.columnGap - 1;
    const outer = c === 0 || c === g.columns;
    const start = outer || !bands.top ? top + bandH * 0.76 : box.top;
    const end = outer || !bands.bottom ? bottom + bandH * 0.24 : box.top + box.height;
    const pieces = x < cut && x + w > cut
      ? [[x, cut - 0.65 - x], [cut + 0.65, x + w - cut - 0.65]] : [[x, w]];
    for (const [rx, rw] of pieces) {
      if (rw < 1) continue;
      out.push(...vine(rx, start, rw, end - start, colours));
      rails.push({ x: rx, w: rw, start, end, column: c });
    }
  }
  const x0 = left + outerW / 2, x1 = right + outerW / 2;
  for (const [a, b] of [[x0, Math.min(cut - 0.7, x1)], [Math.max(cut + 0.7, x0), x1]]) {
    if (b - a < 6) continue;
    const nodes = rails.map(r => r.x + r.w * 0.5 - a);
    out.push(...canopy(a, top, b - a, bandH, nodes, colours, false));
    out.push(...canopy(a, bottom, b - a, bandH, nodes, colours, true));
  }
  const crownW = Math.min(65, (x1 - x0) * 0.23);
  for (const rightSide of [false, true]) for (const bottomSide of [false, true]) {
    out.push(...cornerCrown(rightSide ? x1 - crownW : x0,
      bottomSide ? bottom : top, crownW, bandH, colours, rightSide, bottomSide));
    const sideW = Math.min(48, box.height * 0.22);
    const side = cornerCrown(0, 0, sideW, outerW, colours, bottomSide, rightSide);
    for (const p of side) out.push({ ...p,
      x: rightSide ? right : left,
      y: bottomSide ? bottom + bandH * 0.24 - sideW : top + bandH * 0.76,
      w: p.h, h: p.w,
      d: p.d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, '$2 $1'),
    });
  }
  for (let c = 0; c < g.columns; c++) {
    const x = box.left + c * (box.colWidth + box.columnGap);
    const hits = face.hits.filter(hit => Math.abs(hit.x - x) < 0.1);
    if (!hits.length || bands.bottom) continue;
    const end = Math.max(...hits.map(hit => hit.y + hit.h));
    const free = box.top + box.height - end - 3;
    if (free < 22) continue;
    const rise = Math.min(36, free);
    const h = rise + bandH * 0.24;
    const y = box.top + box.height - rise;
    const from = rails.find(r => r.column === c);
    const to = rails.find(r => r.column === c + 1);
    const start = from ? from.x + from.w * 0.5 : x;
    const finish = to ? to.x + to.w * 0.5 : x + box.colWidth;
    for (const [a, b] of [[start, Math.min(finish, cut - 0.7)],
      [Math.max(start, cut + 0.7), finish]]) {
      if (b - a > 24) out.push(...lowerBranches(a, y, b - a, h, colours));
    }
  }
  // Branch from the same stem into the existing row rules. The connector stops
  // at the content edge; no decorative path enters a vocabulary hit box.
  for (const hit of face.hits) {
    const c = Math.round((hit.x - box.left) / (box.colWidth + box.columnGap));
    const rail = rails.filter(r => r.column === c && r.x + r.w <= hit.x + 0.01).at(-1);
    if (!rail) continue;
    const endY = hit.y + hit.h - (hit.conceptId ? 0.2 : 1.3);
    const localY = endY - rail.start;
    const startX = rail.x + stemX(rail.w, localY);
    if (hit.x - startX < 0.5 || localY < 2 || endY > rail.end) continue;
    out.push(mark(startX, endY - 1.4, hit.x - startX, 1.7,
      hit.conceptId ? colours.rule : colours.stem, hit.conceptId ? 0.18 : 0.28, p => {
      const w = hit.x - startX;
      p.m(0.1, 0.3); p.c(w * 0.4, 1.1, w * 0.7, 1.2, w - 0.1, 1.2);
    }));
  }
  return out;
}
