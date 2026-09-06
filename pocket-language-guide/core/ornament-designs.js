// Imaginative art directions, not national emblems or historical reproductions.
export const LANGUAGE_MOTIFS = /** @type {const} */ ({
  en: 'oak', es: 'rosette', 'zh-Hans': 'cloud', ja: 'seigaiha', ar: 'interlace',
  fr: 'iris', de: 'compass', pt: 'azulejo', ko: 'petal', hi: 'lotus', th: 'flame',
  ru: 'berry', id: 'kawung', sw: 'sail', tr: 'tulip', vi: 'bamboo', it: 'acanthus',
  el: 'meander', hu: 'embroidery', he: 'pomegranate', fa: 'cypress',
  qya: 'botanical', tlh: 'starforge',
  // Art directions rather than emblems, on the same rule as the rest of this table.
  // `alpona` is Bengal's rice-paste floor drawing -- radial, vine-led, made freehand
  // for a festival and swept away after; `wycinanki` is Polish folk paper-cutting,
  // which is symmetric because it is cut through a fold; and `jali` is the pierced
  // lattice screen, chosen for Urdu over anything calligraphic because Arabic already
  // holds `interlace` and a jali is a *grid* where an interlace is a knot.
  bn: 'alpona', pl: 'wycinanki', ur: 'jali',
  // `kolam` is the Tamil doorstep drawing, laid on a grid of dots the line loops
  // around; `petrykivka` is Ukrainian brush painting, where every shape is one pull
  // of the brush. Both are named against the neighbour they could be confused with:
  // a kolam is a *grid* where `alpona` is freehand and radial, and a petrykivka
  // bloom is struck outward from its own centre where `berry` is fruit on a vine.
  ta: 'kolam', uk: 'petrykivka',
});
/** @typedef {typeof LANGUAGE_MOTIFS[keyof typeof LANGUAGE_MOTIFS]} LanguageMotif */

/** Absolute commands only: imposition can translate, transpose and mirror the
 * coordinate pairs without changing the art. @param {number} w @param {number} h */
export function pathPen(w, h) {
  /** @type {string[]} */ const parts = [];
  /** @param {string} op @param {number[]} coords */
  const add = (op, coords) => parts.push(op + coords.map(
    (v, i) => Number((v * (i % 2 ? h : w) / 100).toFixed(3)),
  ).join(' '));
  return {
    m: (/** @type {number} */ x, /** @type {number} */ y) => add('M', [x, y]),
    l: (/** @type {number} */ x, /** @type {number} */ y) => add('L', [x, y]),
    c: (/** @type {number[]} */ ...xy) => add('C', xy),
    q: (/** @type {number[]} */ ...xy) => add('Q', xy),
    close: () => parts.push('Z'),
    d: () => parts.join(' '),
  };
}
/** @typedef {ReturnType<typeof pathPen>} Pen */
/** @param {Pen} p @param {number} x @param {number} y @param {number} w @param {number} h */
function frame(p, x, y, w, h) {
  /** @param {number[]} xy */
  const map = xy => xy.map((v, i) => (i % 2 ? y : x) + v * (i % 2 ? h : w) / 100);
  return {
    m: (/** @type {number} */ a, /** @type {number} */ b) => p.m(x + a * w / 100, y + b * h / 100),
    l: (/** @type {number} */ a, /** @type {number} */ b) => p.l(x + a * w / 100, y + b * h / 100),
    c: (/** @type {number[]} */ ...xy) => p.c(...map(xy)),
    q: (/** @type {number[]} */ ...xy) => p.q(...map(xy)),
    close: p.close, d: p.d,
  };
}
/** @param {Pen} p @param {number} x @param {number} y @param {number} rx @param {number} ry */
function oval(p, x, y, rx, ry) {
  const k = 0.552285;
  p.m(x + rx, y); p.c(x + rx, y + k * ry, x + k * rx, y + ry, x, y + ry);
  p.c(x - k * rx, y + ry, x - rx, y + k * ry, x - rx, y);
  p.c(x - rx, y - k * ry, x - k * rx, y - ry, x, y - ry);
  p.c(x + k * rx, y - ry, x + rx, y - k * ry, x + rx, y); p.close();
}
/** @param {Pen} p @param {number} x @param {number} y @param {number} rx @param {number} ry */
function diamond(p, x, y, rx, ry) {
  p.m(x - rx, y); p.l(x, y - ry); p.l(x + rx, y); p.l(x, y + ry); p.close();
}
/** Pointed leaf between two tips. @param {Pen} p @param {number} x @param {number} y
 * @param {number} dx @param {number} dy @param {number} breadth */
function leaf(p, x, y, dx, dy, breadth) {
  const length = Math.hypot(dx, dy), nx = -dy / length * breadth, ny = dx / length * breadth;
  p.m(x, y); p.q(x + dx / 2 + nx, y + dy / 2 + ny, x + dx, y + dy);
  p.q(x + dx / 2 - nx, y + dy / 2 - ny, x, y);
}
/** @param {Pen} p @param {number} petals @param {number} radius */
function flower(p, petals, radius) {
  for (let i = 0; i < petals; i++) {
    const a = i * Math.PI * 2 / petals - Math.PI / 2;
    leaf(p, 50 + Math.cos(a) * 7, 50 + Math.sin(a) * 7,
      Math.cos(a) * radius, Math.sin(a) * radius, radius * 0.5);
  }
  oval(p, 50, 50, 5, 5);
}

/** Each emblem lives in a 100-square; shared primitives keep the ink economical.
 * @type {Record<Exclude<LanguageMotif,'botanical'|'starforge'>, (p:Pen)=>void>} */
const emblems = {
  oak(p) {
    p.m(47, 88); p.q(53, 48, 50, 9);
    p.m(50, 77); p.c(14, 73, 17, 55, 30, 59); p.c(8, 37, 27, 29, 36, 39);
    p.c(25, 10, 45, 12, 50, 9); p.c(57, 12, 75, 10, 64, 39);
    p.c(73, 29, 92, 37, 70, 59); p.c(83, 55, 86, 73, 50, 77);
    for (const y of [40, 58]) { p.m(50, y + 8); p.l(32, y); p.m(50, y + 8); p.l(68, y); }
  },
  rosette(p) {
    diamond(p, 50, 50, 45, 45); flower(p, 8, 27);
    for (const [x, y] of [[11, 11], [89, 11], [11, 89], [89, 89]]) diamond(p, x, y, 4, 4);
  },
  cloud(p) {
    p.m(9, 71); p.c(0, 45, 25, 42, 31, 51); p.c(10, 18, 50, 10, 57, 32);
    p.c(64, 15, 88, 23, 85, 44); p.c(99, 49, 97, 72, 79, 71); p.l(9, 71);
    p.m(23, 60); p.c(16, 47, 38, 43, 42, 53); p.c(47, 63, 60, 57, 56, 46);
    p.m(39, 82); p.c(54, 71, 70, 91, 88, 80);
  },
  seigaiha(p) {
    for (const r of [42, 29, 16]) {
      p.m(50 - r, 84); p.c(50 - r, 84 - r * 1.8, 50 + r, 84 - r * 1.8, 50 + r, 84);
    }
    p.m(8, 88); p.l(92, 88);
    p.m(8, 33); p.q(25, 7, 42, 33); p.m(58, 33); p.q(75, 7, 92, 33);
  },
  interlace(p) {
    for (const turn of [0, Math.PI / 4]) {
      for (let i = 0; i < 4; i++) {
        const a = turn + i * Math.PI / 2, b = a + Math.PI / 2;
        p.m(50 + 43 * Math.cos(a), 50 + 43 * Math.sin(a));
        p.l(50 + 43 * Math.cos(b), 50 + 43 * Math.sin(b));
      }
    }
    diamond(p, 50, 50, 16, 16);
  },
  iris(p) {
    p.m(50, 91); p.c(39, 71, 64, 45, 50, 8);
    leaf(p, 50, 57, 0, -49, 17); leaf(p, 47, 65, -33, -38, 23);
    leaf(p, 53, 65, 33, -38, 23);
    p.m(47, 80); p.c(11, 77, 8, 51, 24, 57); p.m(53, 80); p.c(89, 77, 92, 51, 76, 57);
  },
  compass(p) {
    oval(p, 50, 50, 32, 32); diamond(p, 50, 50, 15, 43);
    p.m(6, 50); p.l(94, 50); p.m(13, 19); p.l(13, 10); p.l(32, 10);
    p.m(68, 90); p.l(87, 90); p.l(87, 81);
  },
  azulejo(p) {
    p.m(9, 9); p.l(91, 9); p.l(91, 91); p.l(9, 91); p.close();
    flower(p, 4, 34);
    for (const [x, y] of [[20, 20], [80, 20], [20, 80], [80, 80]]) oval(p, x, y, 4, 4);
  },
  petal(p) {
    flower(p, 6, 29); oval(p, 50, 50, 43, 43); oval(p, 50, 50, 12, 12);
  },
  lotus(p) {
    leaf(p, 50, 78, 0, -66, 22); leaf(p, 46, 79, -28, -46, 21);
    leaf(p, 54, 79, 28, -46, 21); leaf(p, 46, 80, -37, -16, 14);
    leaf(p, 54, 80, 37, -16, 14); p.m(22, 90); p.q(50, 81, 78, 90);
  },
  flame(p) {
    p.m(48, 90); p.c(12, 87, 8, 63, 31, 46); p.c(47, 35, 40, 19, 54, 6);
    p.c(51, 33, 83, 34, 78, 58); p.c(94, 47, 91, 36, 91, 36);
    p.c(99, 74, 73, 92, 48, 90);
    p.m(48, 79); p.c(28, 62, 62, 52, 55, 35); p.c(77, 64, 47, 65, 48, 79);
  },
  berry(p) {
    p.m(18, 88); p.q(55, 60, 76, 12);
    for (const [x, y] of [[38, 72], [54, 50]]) {
      leaf(p, x, y, -23, -27, 11); leaf(p, x, y, 29, 3, 9);
    }
    for (const [x, y] of [[67, 25], [82, 29], [76, 43]]) oval(p, x, y, 6, 6);
  },
  kawung(p) {
    for (const [dx, dy] of [[-31, -31], [31, -31], [-31, 31], [31, 31]]) {
      leaf(p, 50, 50, dx, dy, 24);
      leaf(p, 50, 50, dx * 0.7, dy * 0.7, 12);
    }
    diamond(p, 50, 50, 6, 6);
  },
  sail(p) {
    p.m(58, 9); p.l(58, 72); p.m(53, 16); p.l(17, 61); p.q(40, 48, 53, 16);
    p.m(64, 31); p.l(86, 65); p.l(64, 65); p.close();
    p.m(13, 74); p.q(50, 96, 90, 74); p.l(13, 74);
    p.m(10, 89); p.c(27, 77, 38, 98, 51, 89); p.c(66, 79, 75, 98, 90, 89);
  },
  tulip(p) {
    p.m(50, 91); p.l(50, 59);
    p.m(50, 59); p.c(19, 54, 24, 24, 25, 15); p.l(41, 29); p.l(50, 8);
    p.l(59, 29); p.l(75, 15); p.c(76, 24, 81, 54, 50, 59);
    leaf(p, 50, 85, -34, -29, 11); leaf(p, 50, 79, 34, -27, 11);
  },
  bamboo(p) {
    p.m(44, 9); p.l(44, 91); p.m(54, 9); p.l(54, 91);
    for (const y of [29, 62]) { p.m(39, y); p.l(59, y); p.m(39, y + 4); p.l(59, y + 4); }
    leaf(p, 54, 35, 35, -21, 8); leaf(p, 54, 35, 33, 13, 6);
    leaf(p, 44, 68, -31, -26, 8); leaf(p, 44, 68, -32, 9, 6);
  },
  acanthus(p) {
    p.m(50, 91); p.c(52, 69, 42, 36, 50, 10);
    for (const [y, spread] of [[80, 35], [58, 30], [36, 20]]) {
      for (const s of [-1, 1]) {
        p.m(50, y); p.c(50 + s * spread, y - 1, 50 + s * spread, y - 26, 50 + s * 13, y - 20);
        p.c(50 + s * 3, y - 16, 50 + s * 12, y - 9, 50 + s * 16, y - 15);
      }
    }
  },
  meander(p) {
    p.m(6, 85); p.l(6, 16); p.l(86, 16); p.l(86, 69); p.l(34, 69); p.l(34, 40); p.l(62, 40);
    p.m(20, 85); p.l(20, 29); p.l(73, 29); p.l(73, 56); p.l(48, 56);
    p.m(34, 85); p.l(94, 85); p.l(94, 39);
  },
  embroidery(p) {
    flower(p, 5, 30);
    for (const [x, y] of [[11, 15], [85, 11], [15, 85], [89, 85]]) {
      p.m(x - 4, y - 4); p.l(x + 4, y + 4); p.m(x - 4, y + 4); p.l(x + 4, y - 4);
    }
    p.m(50, 86); p.l(50, 94);
  },
  pomegranate(p) {
    p.m(38, 27); p.l(34, 12); p.l(46, 19); p.l(50, 6); p.l(54, 19); p.l(66, 12); p.l(62, 27);
    p.c(94, 41, 87, 86, 50, 91); p.c(13, 86, 6, 41, 38, 27);
    p.m(39, 31); p.q(50, 37, 61, 31);
    for (const [x, y] of [[39, 52], [61, 52], [50, 68]]) diamond(p, x, y, 4, 6);
  },
  cypress(p) {
    p.m(48, 92); p.c(11, 82, 33, 39, 64, 7); p.c(50, 35, 83, 61, 66, 83);
    p.q(59, 93, 48, 92); p.m(49, 86); p.q(43, 53, 60, 19);
    for (const y of [51, 65, 78]) { p.m(49, y); p.q(37, y - 6, 37, y - 13); p.m(49, y); p.q(62, y - 5, 62, y - 11); }
  },
  alpona(p) {
    // Six-fold, because an alpona is drawn outward from a centre with the whole hand
    // rather than laid out on a grid.
    flower(p, 6, 26);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      leaf(p, 50 + Math.cos(a) * 26, 50 + Math.sin(a) * 26,
        Math.cos(a) * 16, Math.sin(a) * 16, 8);
      diamond(p, 50 + Math.cos(a + Math.PI / 6) * 34,
        50 + Math.sin(a + Math.PI / 6) * 34, 5, 5);
    }
  },
  wycinanki(p) {
    // Cut through a fold, so the two halves are the same curve mirrored -- and the
    // notches along the outer edge are where the scissors went in.
    p.m(50, 92); p.l(50, 34);
    for (const s of [-1, 1]) {
      p.m(50, 34); p.c(50 + s * 30, 30, 50 + s * 36, 12, 50 + s * 12, 9);
      p.q(50, 18, 50, 34);
      p.m(50, 52); p.c(50 + s * 24, 50, 50 + s * 30, 34, 50 + s * 10, 31);
      p.m(50, 70); p.c(50 + s * 18, 68, 50 + s * 24, 54, 50 + s * 8, 51);
      p.m(50 + s * 8, 88); p.l(50 + s * 20, 79); p.l(50 + s * 8, 79);
    }
  },
  kolam(p) {
    // The pulli are the point: the line loops around the dots rather than joining
    // them, and the grid is what a kolam is measured out on before any line is
    // drawn. That is the whole difference from `alpona`, which is freehand.
    for (const x of [26, 50, 74]) for (const y of [26, 50, 74]) oval(p, x, y, 2.5, 2.5);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      leaf(p, 50 + dx * 10, 50 + dy * 10, dx * 30, dy * 30, 13);
    }
    p.m(50, 6); p.q(94, 6, 94, 50); p.q(94, 94, 50, 94); p.q(6, 94, 6, 50); p.q(6, 6, 50, 6);
  },
  petrykivka(p) {
    // Brush painting, so every shape is one pull of a cat's-hair brush: the bloom is
    // struck outward from its own centre and the buds are single teardrops laid along
    // the stem, which is why nothing here is a closed grid or a mirrored cut.
    p.m(8, 92); p.c(26, 74, 30, 56, 48, 44);
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7 - Math.PI / 2;
      leaf(p, 62 + Math.cos(a) * 6, 32 + Math.sin(a) * 6,
        Math.cos(a) * 19, Math.sin(a) * 19, 9);
    }
    oval(p, 62, 32, 4, 4);
    for (const [x, y, dx, dy] of [[26, 74, -16, 6], [36, 60, -15, 3]]) leaf(p, x, y, dx, dy, 7);
  },
  jali(p) {
    // A pierced screen: a grid of pointed arches, each one an opening rather than a
    // motif, which is what a jali is for.
    for (const x of [22, 50, 78]) {
      for (const y of [30, 62]) {
        p.m(x - 11, y + 14); p.l(x - 11, y); p.q(x, y - 18, x + 11, y);
        p.l(x + 11, y + 14); p.close();
      }
    }
    p.m(7, 92); p.l(93, 92); p.m(7, 8); p.l(93, 8);
  },
};

// At divider height, use the motif's silhouette rather than its interior detail.
// Closely packed strokes otherwise merge into blobs on a home printer.
/** @type {Record<keyof typeof emblems, (p:Pen)=>void>} */
const tracery = {
  oak(p) { leaf(p, 7, 62, 86, -24, 35); },
  rosette(p) { diamond(p, 50, 50, 43, 40); p.m(50, 10); p.l(50, 90); },
  cloud(p) { p.m(6, 74); p.c(8, 25, 32, 25, 42, 54); p.c(37, 4, 75, 8, 72, 47); p.q(94, 25, 94, 74); },
  seigaiha(p) { p.m(5, 90); p.c(5, 6, 95, 6, 95, 90); p.m(22, 90); p.c(22, 38, 78, 38, 78, 90); },
  interlace(p) { diamond(p, 34, 50, 29, 40); diamond(p, 66, 50, 29, 40); },
  iris(p) { p.m(7, 14); p.q(7, 85, 50, 85); p.q(93, 85, 93, 14); p.m(50, 85); p.l(50, 6); },
  compass(p) { diamond(p, 50, 50, 28, 43); p.m(5, 50); p.l(95, 50); },
  azulejo(p) { p.m(6, 15); p.l(94, 15); p.l(94, 85); p.l(6, 85); p.close(); p.m(30, 15); p.q(50, 85, 70, 15); },
  petal(p) { leaf(p, 7, 50, 43, 0, 40); leaf(p, 50, 50, 43, 0, 40); },
  lotus(p) { p.m(8, 36); p.q(25, 92, 50, 88); p.q(75, 92, 92, 36); leaf(p, 50, 88, 0, -78, 20); },
  flame(p) { p.m(8, 87); p.c(2, 39, 72, 55, 69, 7); p.c(97, 39, 89, 84, 8, 87); },
  berry(p) { p.m(6, 84); p.q(50, 63, 93, 11); oval(p, 36, 28, 12, 18); oval(p, 76, 69, 12, 18); },
  kawung(p) { leaf(p, 9, 15, 82, 70, 15); leaf(p, 9, 85, 82, -70, 15); },
  sail(p) { p.m(8, 66); p.l(69, 9); p.l(69, 66); p.close(); p.m(7, 79); p.q(50, 96, 94, 79); },
  tulip(p) { p.m(9, 13); p.l(31, 42); p.l(50, 9); p.l(69, 42); p.l(91, 13); p.q(94, 88, 50, 88); p.q(6, 88, 9, 13); },
  bamboo(p) { p.m(5, 30); p.l(95, 30); p.m(5, 70); p.l(95, 70); p.m(45, 7); p.l(45, 93); p.m(55, 7); p.l(55, 93); },
  acanthus(p) { p.m(5, 70); p.c(46, 82, 18, 8, 49, 13); p.c(80, 18, 52, 86, 95, 70); },
  meander(p) { p.m(6, 90); p.l(6, 10); p.l(94, 10); p.l(94, 90); p.l(33, 90); p.l(33, 47); p.l(65, 47); },
  embroidery(p) { p.m(7, 18); p.l(28, 82); p.l(50, 18); p.l(72, 82); p.l(93, 18); },
  pomegranate(p) { p.m(36, 30); p.l(32, 8); p.l(50, 24); p.l(68, 8); p.l(64, 30); p.c(96, 41, 90, 90, 50, 90); p.c(10, 90, 4, 41, 36, 30); },
  cypress(p) { p.m(10, 88); p.c(14, 34, 63, 44, 86, 8); p.c(71, 38, 99, 89, 10, 88); },
  alpona(p) { flower(p, 6, 40); },
  wycinanki(p) { p.m(50, 92); p.l(50, 8); p.m(8, 60); p.q(50, 6, 92, 60); },
  kolam(p) { p.m(50, 8); p.q(92, 8, 92, 50); p.q(92, 92, 50, 92); p.q(8, 92, 8, 50); p.q(8, 8, 50, 8); oval(p, 50, 50, 7, 7); },
  petrykivka(p) { p.m(8, 92); p.q(34, 66, 46, 44); oval(p, 62, 34, 26, 26); },
  jali(p) { for (const x of [28, 72]) { p.m(x - 20, 90); p.l(x - 20, 46); p.q(x, 4, x + 20, 46); p.l(x + 20, 90); } },
};

/** @param {string} motif @returns {motif is keyof typeof emblems} */
export function isLanguageEmblem(motif) { return Object.hasOwn(emblems, motif); }

/** Repeat a few small emblems with breathing room; avoid a dense ink band even
 * when a heading is wide. @param {keyof typeof emblems} motif @param {Pen} p
 * @param {number} w @param {number} h */
export function languageRule(motif, p, w, h) {
  const count = Math.min(9, Math.max(1, Math.floor(w / Math.max(22, h * 2.3)) | 1));
  const step = 100 / count;
  // Shallow rules use elongated tracery; retaining square emblems at 2pt would
  // collapse every language into the same dotted line at normal print size.
  const width = h < 4 ? step * 0.72 : Math.min(step * 0.66, h * 1.3 / w * 100);
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * step;
    p.m(i * step, 50); p.l(x - width * 0.58, 50);
    (h < 4 ? tracery : emblems)[motif](frame(p, x - width / 2, 0, width, 100));
    p.m(x + width * 0.58, 50); p.l((i + 1) * step, 50);
  }
}

/** @param {keyof typeof emblems} motif @param {Pen} p */
export function languageCorner(motif, p) {
  const angular = ['rosette', 'interlace', 'compass', 'azulejo', 'kawung', 'meander', 'embroidery'].includes(motif);
  if (angular) {
    p.m(7, 93); p.l(7, 7); p.l(93, 7);
    p.m(14, 65); p.l(14, 14); p.l(65, 14);
  } else {
    p.m(7, 93); p.c(25, 72, 0, 24, 24, 12); p.c(43, 2, 75, 23, 93, 7);
    p.m(15, 85); p.c(31, 66, 12, 34, 33, 22); p.c(52, 11, 75, 33, 87, 16);
  }
  emblems[motif](frame(p, 27, 27, 64, 64));
}
