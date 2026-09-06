import { pathPen } from './ornament-designs.js';

/** @typedef {import('./types.js').SheetSpec} SheetSpec */
/** @typedef {import('./types.js').PathMark} PathMark */
/** @typedef {ReturnType<typeof pathPen>} Pen */
/** @typedef {{stem:string,thread:string,rule:string,light:string,blue:string}} Colours */

/** @param {SheetSpec} spec */
export function isElven(spec) {
  return spec.target === 'qya' && spec.inkMode !== 'low-ink'
    && (spec.ornamentStyle === 'language' || spec.ornamentStyle === 'botanical');
}

/** The ornament owns measured space; its ink never borrows room from glyphs.
 * @param {SheetSpec} spec */
export function elvenInset(spec) {
  return isElven(spec) ? Math.min(20, Math.max(8, Math.min(spec.geometry.pageW, spec.geometry.pageH) * 0.045)) : 0;
}

/** @param {SheetSpec} spec @param {string} ink @returns {Colours} */
export function elvenColours(spec, ink) {
  return spec.inkMode === 'mono'
    ? { stem: ink, thread: ink, rule: ink, light: ink, blue: ink }
    : { stem: '#355b50', thread: '#9c793c', rule: '#d4c7a9', light: '#d9bd7c', blue: '#29485e' };
}

/** Absolute coordinate pairs let imposition transform the art.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {string} stroke @param {number} strokeWidth @param {(p:Pen)=>void} draw
 * @param {string} [fill] @returns {PathMark} */
function mark(x, y, w, h, stroke, strokeWidth, draw, fill) {
  const p = pathPen(w, h);
  draw(p);
  return { x, y, w, h, stroke, strokeWidth, d: p.d(), ...(fill ? { fill } : {}) };
}

/** @param {PathMark} path @param {boolean} horizontal @param {boolean} vertical */
function mirror(path, horizontal, vertical) {
  let i = 0;
  return { ...path, d: path.d.replace(/-?\d+(?:\.\d+)?/g, n => {
    const y = i++ % 2;
    return String(Number(((y ? vertical : horizontal) ? (y ? path.h : path.w) - Number(n) : Number(n)).toFixed(3)));
  }) };
}

/** A closed broad silhouette and a separate gold midrib.
 * @param {Pen} p @param {number[]} leaf @param {boolean} vein */
function drawLeaf(p, [x, y, dx, dy, width], vein) {
  const length = Math.hypot(dx, dy), nx = -dy / length * width, ny = dx / length * width;
  p.m(x, y);
  if (vein) {
    p.q(x + dx * 0.48, y + dy * 0.48, x + dx * 0.94, y + dy * 0.94);
    return;
  }
  p.c(x + dx * 0.15 + nx, y + dy * 0.15 + ny,
    x + dx * 0.7 + nx, y + dy * 0.7 + ny, x + dx, y + dy);
  p.c(x + dx * 0.7 - nx, y + dy * 0.7 - ny,
    x + dx * 0.15 - nx, y + dy * 0.15 - ny, x, y);
  p.close();
}

/** Leaves attach along one sweeping stem. Bounded proportions keep them from
 * stretching across arbitrarily wide columns.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {Colours} colours @param {boolean} [right] @param {boolean} [bottom] */
function sprig(x, y, w, h, colours, right = false, bottom = false) {
  const leaves = [
    [12, 84, -6, -29, 5], [23, 76, -10, -43, 6],
    [37, 62, -8, -48, 7], [51, 46, 3, -37, 7],
    [65, 33, 20, -23, 6], [33, 66, 24, 19, 7],
    [48, 50, 29, 15, 7], [63, 35, 29, 7, 6],
  ];
  return [
    mark(x, y, w, h, colours.thread, 0.5, p => {
      p.m(3, 93); p.c(30, 83, 45, 42, 94, 12);
    }),
    mark(x, y, w, h, colours.thread, 0.23,
      p => leaves.forEach(l => drawLeaf(p, l, false)), colours.stem),
    mark(x, y, w, h, colours.light, 0.16,
      p => leaves.forEach(l => drawLeaf(p, l, true))),
  ].map(p => mirror(p, right, bottom));
}

/** @param {number} x @param {number} y @param {number} size @param {Colours} colours */
function star(x, y, size, colours) {
  return mark(x, y, size, size, colours.thread, 0.24, p => {
    for (let i = 0; i < 16; i++) {
      const a = i * Math.PI / 8 - Math.PI / 2;
      const r = i % 2 ? 10 : i % 4 ? 30 : 46;
      const px = 50 + Math.cos(a) * r, py = 50 + Math.sin(a) * r;
      if (i) p.l(px, py); else p.m(px, py);
    }
    p.close();
  }, colours.blue);
}

/** A blue enamel lily capital, with gold ribs and a pendant point.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {Colours} colours @param {boolean} bottom */
function capital(x, y, w, h, colours, bottom) {
  const petals = mark(x, y, w, h, colours.thread, 0.4, p => {
    p.m(50, 95); p.c(36, 65, 39, 36, 50, 5); p.c(61, 36, 64, 65, 50, 95); p.close();
    p.m(50, 91); p.c(31, 69, 6, 48, 6, 12); p.c(28, 7, 40, 22, 44, 40);
    p.c(31, 24, 19, 22, 20, 32); p.c(21, 54, 41, 67, 50, 91); p.close();
    p.m(50, 91); p.c(69, 69, 94, 48, 94, 12); p.c(72, 7, 60, 22, 56, 40);
    p.c(69, 24, 81, 22, 80, 32); p.c(79, 54, 59, 67, 50, 91); p.close();
  }, colours.blue);
  const ribs = mark(x, y, w, h, colours.light, 0.2, p => {
    p.m(50, 89); p.l(50, 13);
    p.m(47, 79); p.c(33, 60, 14, 33, 12, 17);
    p.m(53, 79); p.c(67, 60, 86, 33, 88, 17);
  });
  return [petals, ribs].map(p => mirror(p, false, bottom));
}

/** A restrained gold rule and one leaf spray beside a measured title.
 * @param {number} w @param {number} y @param {number} h @param {number} titleEnd
 * @param {string} colour @param {string} [foliage] @returns {PathMark[]} */
export function elvenHeading(w, y, h, titleEnd, colour, foliage = colour) {
  const ruleH = Math.min(2, h);
  const out = [mark(0, y + h - ruleH, w, ruleH, colour, 0.42, p => {
    p.m(0.5, 28); p.q(4, 72, 10, 72); p.l(90, 72); p.q(96, 72, 99.5, 28);
  })];
  const room = w - titleEnd - 4;
  if (room >= 15 && h >= 6) {
    const sw = Math.min(23, room), sh = Math.min(11, h - 1);
    out.push(...sprig(w - sw, y + h - sh - 0.5, sw, sh,
      { stem: foliage, thread: colour, light: colour, rule: colour, blue: foliage }, true));
  }
  return out;
}

/** Gold mullions carry capitals at section junctions; most of each shaft stays quiet.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {Colours} colours @returns {PathMark[]} */
function rail(x, y, w, h, colours) {
  if (w < 1 || h < 3) return [];
  return [
    mark(x, y, w, h, colours.thread, 0.48, p => { p.m(50, 0.2); p.l(50, 99.8); }),
    mark(x, y, w, h, colours.light, 0.22, p => {
      p.m(50 + Math.min(22, 100 / w), 0.2); p.l(50 + Math.min(22, 100 / w), 99.8);
    }),
  ];
}

/** A pointed vault has two parallel contours, no crossing loops.
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {Colours} colours @param {boolean} bottom @returns {PathMark[]} */
function vault(x, y, w, h, colours, bottom) {
  return [
    mark(x, y, w, h, colours.thread, 0.6, p => {
      p.m(0.4, 94); p.c(14, 94, 11, 18, 50, 9);
      p.c(89, 18, 86, 94, 99.6, 94);
    }),
    mark(x, y, w, h, colours.light, 0.26, p => {
      p.m(1, 98); p.c(18, 98, 16, 31, 50, 22);
      p.c(84, 31, 82, 98, 99, 98);
    }),
  ].map(p => mirror(p, false, bottom));
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
  const outerW = inset - 1, cut = g.pageW / 2;
  const left = box.left - inset + 0.5, right = box.left + box.width + 0.5;
  /** @type {PathMark[]} */ const out = [];
  /** @type {{x:number,w:number,start:number,end:number,column:number}[]} */ const rails = [];
  for (let c = 0; c <= g.columns; c++) {
    const colX = box.left + c * (box.colWidth + box.columnGap);
    const x = c === 0 ? left : c === g.columns ? right : colX - box.columnGap + 0.5;
    const w = c === 0 || c === g.columns ? outerW : box.columnGap - 1;
    const outer = c === 0 || c === g.columns;
    const start = outer || !bands.top ? top + bandH * 0.94 : box.top;
    const end = outer || !bands.bottom ? bottom + bandH * 0.06 : box.top + box.height;
    const pieces = x < cut && x + w > cut
      ? [[x, cut - 0.65 - x], [cut + 0.65, x + w - cut - 0.65]] : [[x, w]];
    for (const [rx, rw] of pieces) {
      if (rw < 1) continue;
      out.push(...rail(rx, start, rw, end - start, colours));
      rails.push({ x: rx, w: rw, start, end, column: c });
    }
  }
  const x0 = left + outerW / 2, x1 = right + outerW / 2;
  for (const r of rails.filter(r => r.column === 0 || r.column === g.columns)) {
    const h = Math.min(42, (r.end - r.start) * 0.2);
    out.push(...capital(r.x, r.start, r.w, h, colours, false));
    out.push(...capital(r.x, r.end - h, r.w, h, colours, true));
    for (let y = r.start + h + 30; y + 28 < r.end - h; y += 85) {
      out.push(...sprig(r.x, y, r.w, 28, colours, r.column === g.columns));
    }
  }
  // Panels remain separate on either side of the physical card cut.
  const nodes = [x0, ...rails.map(r => r.x + r.w / 2).filter(x => x > x0 && x < x1), x1];
  for (let i = 1; i < nodes.length; i++) {
    for (const [a, b] of [[nodes[i - 1], Math.min(nodes[i], cut - 0.7)],
      [Math.max(nodes[i - 1], cut + 0.7), nodes[i]]]) {
      const w = b - a;
      if (w < 6) continue;
      out.push(...vault(a, top, w, bandH, colours, false));
      out.push(...vault(a, bottom, w, bandH, colours, true));
      if (w > 35) {
        const sw = Math.min(30, w * 0.28), sh = bandH * 0.8;
        for (const lower of [false, true]) for (const rightSide of [false, true]) {
          out.push(...sprig(rightSide ? b - sw : a, lower ? bottom + bandH - sh : top,
            sw, sh, colours, rightSide, lower));
        }
      }
    }
  }
  // Capitals grow from section rules, wholly within the gutter.
  for (const hit of face.hits.filter(h => !h.conceptId)) {
    const c = Math.round((hit.x - box.left) / (box.colWidth + box.columnGap));
    const r = rails.filter(r => r.column === c && r.x + r.w <= hit.x + 0.01).at(-1);
    if (!r) continue;
    const endY = hit.y + hit.h - 1;
    const h = Math.min(15, endY - r.start);
    if (r.w > 3 && h > 6) out.push(...sprig(r.x, endY - h, r.w, h, colours));
    const x = r.x + r.w / 2, w = hit.x - x;
    if (w > 0.5) out.push(mark(x, endY - 1.2, w, 1.4, colours.thread, 0.42, p => {
      p.m(0.5, 10); p.q(25, 85, 99, 85);
    }));
  }
  // Empty column feet become arched courts attached to the bottom frame.
  for (let c = 0; c < g.columns; c++) {
    const x = box.left + c * (box.colWidth + box.columnGap);
    const hits = face.hits.filter(hit => Math.abs(hit.x - x) < 0.1);
    if (!hits.length) continue;
    const from = rails.filter(r => r.column === c).at(-1);
    const to = rails.find(r => r.column === c + 1);
    const start = from ? from.x + from.w / 2 : x;
    const finish = to ? to.x + to.w / 2 : x + box.colWidth;
    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i], next = hits[i + 1];
      if (!hit.conceptId || (next?.conceptId && next.sectionId === hit.sectionId)) continue;
      const y = hit.y + hit.h + 0.15;
      const h = Math.min(1.7, (next?.y ?? box.top + box.height) - y - 0.15);
      if (h < 0.5) continue;
      for (const [a, b] of [[start, Math.min(finish, cut - 0.7)],
        [Math.max(start, cut + 0.7), finish]]) {
        if (b - a < 4) continue;
        out.push(mark(a, y, b - a, h, colours.thread, 0.4, p => {
          p.m(0.5, 12); p.q(1, 82, 7, 82); p.l(93, 82); p.q(99, 82, 99.5, 12);
        }));
      }
    }
    if (bands.bottom) continue;
    const end = Math.max(...hits.map(hit => hit.y + hit.h));
    const free = box.top + box.height - end - 3;
    if (free < 22) continue;
    const h = Math.min(35, free), y = box.top + box.height - h;
    for (const [a, b] of [[start, Math.min(finish, cut - 0.7)],
      [Math.max(start, cut + 0.7), finish]]) {
      const w = b - a;
      if (w < 30) continue;
      out.push(...vault(a, y, w, h + bandH * 0.06, colours, false));
      const sw = Math.min(32, w * 0.3), sh = Math.min(19, h * 0.65);
      out.push(...sprig(a, y + h - sh, sw, sh, colours));
      out.push(...sprig(b - sw, y + h - sh, sw, sh, colours, true));
      const size = Math.min(8, h * 0.26);
      out.push(star(a + w / 2 - size / 2, y + h * 0.5, size, colours));
    }
  }
  return out;
}
