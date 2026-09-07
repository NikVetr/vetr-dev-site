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
  // `warli` is the Maharashtrian tribal mural style built from three shapes --
  // circle, triangle, line -- repeated into human figures and animals; chosen for
  // Marathi because it is the one folk-art tradition of the state's own name, and
  // because no other motif here draws a figure, so it needs no disambiguation.
  mr: 'warli',
  // `kalamkari` is the pen-drawn cotton of the Telugu country -- Srikalahasti and
  // Machilipatnam -- and *kalam* is the pen, which is the whole of its character: a
  // kalamkari shape is **outlined first and filled after**, so this emblem draws a
  // second contour inside its flower head where no other motif here doubles a line
  // at all. Named against the three neighbours it could be confused with: `lotus` is
  // one bloom seen face-on with a single contour, `cypress` is a single tapering
  // silhouette with no creeper, and `kolam` is a floor grid the line loops around
  // rather than a drawn-and-filled figure -- which is why Telugu's own `muggu`, the
  // same doorstep drawing under a different name, was refused as too close to it.
  te: 'kalamkari',
  // `polder` is the reclaimed-land drainage grid, not a tile or a flower --
  // deliberately not Delft tile-work or a tulip-book illustration, the two motifs a
  // Dutch entry would reach for first, because both are already taken and by
  // exactly the wrong neighbours: `pt` already holds `azulejo`, a painted glazed
  // tile, and Delftware is the same object (tin-glazed ceramic) in a different
  // country's colours, not a different *kind* of mark; and `tr` already holds
  // `tulip`, a floral silhouette, so a tulip-book bloom would be the same shape
  // again under a different name. A polder map is neither a tile nor a flower: it
  // is a boundary canal with narrow parallel strip-parcels (`slagenlandschap`)
  // running off it at unequal lengths, the characteristic look of Dutch reclaimed
  // land seen from above. Also named against `bamboo`, the one existing motif built
  // from straight perpendicular lines: bamboo is a symmetric, evenly spaced
  // cross-hatch representing stalks, where a polder's strips are deliberately
  // unequal in length and run off one side only, off a single canal, the way a
  // real polder's parcels do.
  nl: 'polder',
  // `funie` (Romanian for "rope, cord") is the twisted-cable border carved
  // around a Maramures wooden gate-frame, paired here with a chip-carved
  // tree of life at centre. Named against the two neighbours it could be
  // confused with rather than either: `hu` already holds `embroidery`, a
  // thread-and-fabric cross-stitch technique, where a funie is cut into
  // oak with a knife -- a different medium, not just a different pattern
  // on the same one. And `es` already holds `rosette`, a flower set in a
  // diamond frame; a Maramures gate's own carved sun-disc would have been
  // the obvious first reach for a Romanian motif and was rejected for
  // exactly that reason, in favour of the rope border and the tree, which
  // read as neither a flower nor a stitch.
  ro: 'funie',
  ml: 'nettipattam',
  ha: 'askatakwas',
  ne: 'dhaka',
  ms: 'ketupat',
  sv: 'kurbits',
  cs: 'sklo',
  // `phulkari` is the Punjabi flower-work of Malwa and the Sialkot side both --
  // and it is named against `embroidery`, which Hungarian already holds, because
  // the two are only the same craft at the level of "thread through cloth". The
  // difference is the mark. Hungarian's emblem is a **running stitch**: one
  // continuous sewn line that changes direction, drawn there as a zigzag and a
  // flower outline. Phulkari is **darn stitch worked from the reverse of a coarse
  // khaddar ground, on a counted thread grid**, so its unit is not a line at all --
  // it is a solid lozenge filled with long parallel floats, and the neighbouring
  // lozenge runs its floats the other way, which is what makes a real phulkari
  // shimmer as it turns. So this emblem fills an area with directional hatching,
  // and **no other motif in this table hatches an area**: every one of the others
  // is an outline, a silhouette or a set of strokes.
  //
  // Also named against the two others it could be confused with. `kawung` is
  // Javanese batik -- four curved ovals made by wax resist, a dyed shape rather
  // than a counted stitch. And `wycinanki` is a folded-paper silhouette cut all
  // the way through a flat sheet, so it reads by its outline where a phulkari
  // lozenge reads by the direction of its fill and has no meaningful outline at
  // all. `bagh`, the fully covered phulkari, was the alternative name and was
  // refused because it means "garden" and would read as a botanical motif next to
  // `lotus`, `cypress` and `iris`, which is exactly what it is not.
  pa: 'phulkari',
  // `banig` is the woven sleeping-mat pattern of pandan or buri palm strips
  // (Basey, Samar; Badjao and Sama weaving), and it is named against the two
  // neighbours it could most easily be confused with. `kawung` (id) is a
  // DYED pattern -- four wax-resist ovals drawn and repeated onto cloth that
  // already exists -- where a banig's checker/diamond lattice is not applied
  // to a base material at all; it IS the material's own construction, the
  // over-under interlacing of two sets of strips. And `sail` (sw) is one
  // large fluid curved form; a banig mark is the opposite formal quality,
  // a small rigid unit repeated evenly across a hard-edged grid. (It is also
  // not `phulkari`'s counted-thread hatching, which fills a separate base
  // cloth with angled floats of thread from the reverse side -- a banig has
  // no base cloth and no thread; the strips are the whole object.)
  fil: 'banig',
  // `bandhani` is the tie-dye of Kutch and Saurashtra -- the odhani a Gujarati bride
  // wears -- and it is named against the three neighbours it could be confused with,
  // on the mark rather than on the craft.
  //
  // `kawung` (id) is the closest and is also a resist-dye, which is exactly why the
  // distinction has to be drawn on the mark: kawung is **wax** resist, four large
  // ovals *drawn* onto finished cloth with a canting, so its unit is a deliberate
  // curve of a size the hand chooses. Bandhani is **tie** resist: the cloth is
  // pinched into thousands of points and each is bound with thread before dyeing, so
  // its unit is a *knot* -- a small ring of undyed cloth with a dyed centre -- whose
  // size is fixed by the thread and which can never overlap its neighbour, because
  // two knots cannot occupy one pinch. So this emblem is a **field of small rings on
  // a diagonal lattice**, and no other motif in this table is a field of rings at
  // all: `petal` is one large circle around a flower, `berry` is three fruit on a
  // stem, `kalamkari` is one drawn-and-filled flower head, and `seigaiha` is nested
  // *arcs* that overlap into scales -- overlapping being the one thing a bandhani dot
  // cannot do.
  //
  // The lattice runs on the diagonal rather than square, and the count is the
  // pattern's own name -- ekdali one dot, trikunti three, chaubundi four, satbandi
  // seven -- so the emblem draws a chaubundi cluster (four points around a fifth)
  // with the lattice continuing on the axes. `patola`, the Patan double-ikat, was the
  // alternative and was refused because its distinguishing mark is the *stepped,
  // feathered diagonal* that resist-dyed yarn forces on a woven figure, which is a
  // weave artefact and would have had to be named against `banig` (fil) rather than
  // against a dye. And `sathiya`, Gujarat's doorstep rangoli, was refused outright
  // for the reason Telugu's `muggu` was: `kolam` (ta) and `alpona` (bn) already hold
  // floor drawing, and the house rule is to name a motif against the neighbour it
  // could be confused with rather than to ship a third name for one art.
  gu: 'bandhani',
  // `telsem` is the interlaced cross of Ethiopian handweaving -- the ጥልፍ border
  // figure worked into the edge of a shamma and a netela, the same cross cut into the
  // rock-hewn churches at Lalibela and drawn into a manuscript's harag. Named against
  // the two motifs it could be confused with, and on the *mark* rather than on the
  // craft, which is this table's house rule.
  //
  // `banig` (fil) is the other weave here and is the closest: it is a plain plaited
  // check, the over-under of two sets of palm strips with no figure in it, so its
  // unit is a *facet* of the ground itself. A telsem is a discrete figure standing
  // *in* a woven ground -- four bands crossing at right angles, each passing over one
  // neighbour and under the other, with the small square the weaver leaves at the
  // crossing -- so this emblem draws one cross with its ground left plain, where
  // banig continues the check to the edges of its box. And `interlace` (ar) is
  // continuous strapwork whose lines never terminate; a telsem's four arms *end*,
  // which is why it is drawn with capped arms and banig and interlace are not.
  //
  // `meskel`, the processional cross itself, was the alternative and was refused for
  // the reason Telugu's `muggu` and Gujarati's `sathiya` were: it is a religious
  // object rather than an art direction, and this table's own preface says these are
  // imaginative interpretations and not national or religious emblems. The woven
  // border is the same geometry arrived at through cloth.
  am: 'telsem',
  // `kasuti` is Karnataka's counted-thread embroidery -- the GI-tagged ಕಸೂತಿ of north
  // Karnataka -- and its emblem is the **gopura**, the stepped temple tower a Kasuti
  // sampler is counted out around.
  //
  // Named against the three neighbours it could be confused with, on the mark rather
  // than on the craft. `meander` (el) is the closest and is the only other motif here
  // built entirely of right angles, which is exactly why the distinction has to be
  // drawn on the figure: a Greek key is a spiral that **turns back into itself**, and
  // a gopura is **bilaterally symmetric** and never reverses. `kolam` (ta) is the
  // other motif with a counted dot grid, and there the difference is what the line
  // does with the dots: a kolam line **loops around** its pulli and curves, while a
  // Kasuti gavanti stitch lands **on** the counted intersections, so every corner of
  // this outline sits on a dot and every segment is orthogonal. And `phulkari` (pa)
  // is the other Indian embroidery: its darn-stitch blocks are read off the
  // *direction of their floats*, a fill, where Kasuti's gavanti is a double-running
  // **outline** and never fills anything -- which is also what separates it from
  // `dhaka` (ne), whose units are solid woven diamonds.
  //
  // Two alternatives were refused. **`bidri`**, the silver-inlaid blackened zinc of
  // Bidar, because its distinguishing mark is a bright line *inlaid into a dark
  // ground* and these ornaments print as strokes on white paper, so the one thing
  // that makes it bidriware could not survive the medium. And **`rangoli`**,
  // Karnataka's floor drawing, outright, for the reason Telugu's `muggu` and
  // Gujarati's `sathiya` were refused: `kolam` (ta) and `alpona` (bn) already hold
  // floor drawing, and the house rule is to name a motif against the neighbour it
  // could be confused with rather than to ship a fourth name for one art.
  kn: 'kasuti',
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
  kalamkari(p) {
    // The creeper border of a kalamkari panel: an S-curving vine with paired leaves
    // and one flower head, and the head is drawn twice -- outer contour, then the
    // inner one the dye is laid between. That doubling is the signature of a
    // pen-drawn-and-filled cloth and is what separates it from `lotus`, which is a
    // single face-on bloom, and from `cypress`, which has no vine.
    p.m(8, 88); p.c(30, 78, 22, 54, 44, 44);
    for (const [x, y, dx, dy] of [[24, 79, -14, 8], [24, 79, -8, -12],
      [32, 62, -14, 5], [32, 62, -7, -11]]) leaf(p, x, y, dx, dy, 6);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI * 2 / 6 - Math.PI / 2;
      leaf(p, 62 + Math.cos(a) * 7, 32 + Math.sin(a) * 7,
        Math.cos(a) * 21, Math.sin(a) * 21, 10);
    }
    oval(p, 62, 32, 9, 9);
    oval(p, 62, 32, 4.5, 4.5);
  },
  warli(p) {
    // The Warli dancer: a circle head over two triangles meeting point-to-point at
    // the waist, with straight limb strokes flung wide -- the same figure repeated
    // in a ring around the tarpa player on an actual Warli mural. Triangles rather
    // than a filled torso because a Warli figure is built from the three shapes
    // (circle, triangle, line) and nothing else; no other motif here uses a human
    // figure at all, so it needs no disambiguation against a neighbour.
    oval(p, 50, 16, 9, 9);
    p.m(35, 26); p.l(65, 26); p.l(50, 42); p.close();
    p.m(50, 42); p.l(65, 58); p.l(35, 58); p.close();
    p.m(38, 30); p.l(15, 15); p.m(62, 30); p.l(85, 15);
    p.m(42, 58); p.l(20, 92); p.m(58, 58); p.l(80, 92);
  },
  polder(p) {
    // A boundary canal along the bottom with narrow strip-parcels running off it
    // at unequal lengths -- the `slagenlandschap` pattern a Dutch reclaimed
    // polder actually shows from above, rather than a symmetric lattice. Unequal
    // lengths are the whole point: a regular grid is `bamboo`'s cross-hatch of
    // stalks, and a polder's strips are surveyed, not woven.
    p.m(5, 85); p.l(95, 85);
    p.m(15, 85); p.l(15, 22); p.m(30, 85); p.l(30, 38);
    p.m(45, 85); p.l(45, 14); p.m(60, 85); p.l(60, 32);
    p.m(75, 85); p.l(75, 10); p.m(90, 85); p.l(90, 26);
  },
  sklo(p) {
    // Bohemian cut crystal's star-cut: straight facets ground from a centre point out
    // to a faceted octagon, crossed by a second octagon at half the radius -- the
    // pattern on the base of an ordinary Czech crystal bowl. Straight lines meeting at
    // one point is what separates it from `hu`'s `embroidery`, a curved sewn line, and
    // from `pl`'s `wycinanki`, an outline cut through folded paper: a different medium
    // rather than a different pattern on the same one, and the only design in this
    // table with no curve in it at all.
    const octagon = (/** @type {number} */ r) => {
      for (let i = 0; i <= 8; i++) {
        const a = i * Math.PI / 4 + Math.PI / 8;
        const x = 50 + Math.cos(a) * r, y = 50 + Math.sin(a) * r;
        if (i === 0) p.m(x, y); else p.l(x, y);
      }
      p.close();
    };
    octagon(43); octagon(21);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8;
      p.m(50, 50); p.l(50 + Math.cos(a) * 43, 50 + Math.sin(a) * 43);
    }
  },
  kurbits(p) {
    // The vase: kurbits (Dalarna's flower-painting tradition, the kind that
    // decorates a Dala horse) is always painted growing FROM a container,
    // which is what separates its composition from every other floral mark
    // in this table -- iris, tulip, lotus and cypress are all rootless
    // silhouettes with no base object at all.
    p.m(38, 92); p.l(35, 80); p.q(35, 75, 41, 75); p.l(59, 75); p.q(65, 75, 65, 80); p.l(62, 92); p.close();
    // The stem: one continuous asymmetric S-curve, not a symmetric radial
    // base (iris, lotus) or a straight trunk (funie's tree of life) -- a
    // real kurbits stem is drawn as a single sweeping gesture with the
    // flowers hung off alternating sides of it.
    p.m(50, 75); p.q(30, 60, 40, 45); p.q(50, 30, 62, 15);
    // Three bell-flowers alternating off the stem, each a single bulbous
    // shape rather than a multi-petal fan: the bell is kurbits' own unit,
    // not assembled from several petals the way iris/lotus are.
    leaf(p, 40, 45, -22, -8, 9);
    leaf(p, 62, 15, 20, -6, 8);
    leaf(p, 47, 58, -16, 10, 6);
    // Small round buds beside two of the flowers, and two small pointed
    // leaves directly on the stem -- a real kurbits panel is never just the
    // one flower, it is a stem carrying flowers, buds and leaves together.
    oval(p, 22, 33, 5, 5);
    oval(p, 78, 12, 4, 4);
    leaf(p, 44, 60, -14, 8, 5);
    leaf(p, 55, 32, 14, 6, 5);
  },
  ketupat(p) {
    // The ketupat's own shape: a faceted, elongated diamond pouch plaited
    // from a single strip of coconut-palm leaf (janur) around a rice
    // filling -- pointed top and bottom where the strip's ends tuck in,
    // faceted rather than round because the leaf is folded, not curved.
    p.m(50, 6); p.l(74, 22); p.l(84, 50); p.l(74, 78); p.l(50, 94);
    p.l(26, 78); p.l(16, 50); p.l(26, 22); p.close();
    // The plait: two diagonal strip directions crossing, plus the inner
    // diamond their crossings trace along the pouch's own sides -- the
    // lattice a woven ketupat actually shows, rather than banig's (fil)
    // tiled grid of separate mat facets: here the whole pouch is one
    // continuous strip, so the weave is read off one shape's own
    // diagonals, not off repeated units.
    p.m(24, 32); p.l(76, 68); p.m(76, 32); p.l(24, 68);
    p.m(32, 24); p.l(68, 76); p.m(68, 24); p.l(32, 76);
    p.m(50, 16); p.l(84, 50); p.l(50, 84); p.l(16, 50); p.close();
  },
  dhaka(p) {
    // Four nested diamonds telescoping to one centre -- the "ankhi jhyal"
    // (eye-window) unit a discontinuous supplementary weft actually produces,
    // not a single frame (rosette) or a flat grid of same-size facets (banig).
    for (const r of [43, 31, 19, 7]) diamond(p, 50, 50, r, r);
    // The zigzag selvedge either side: the stepped edge left where the
    // pattern thread turns back on itself, which is what a discontinuous
    // weft does and a phulkari float (edge to edge, never turning back) does
    // not.
    for (const side of [-1, 1]) {
      const x0 = 50 + side * 40;
      p.m(x0, 8);
      for (let i = 0; i < 5; i++) {
        const y0 = 8 + i * 16.8, y1 = y0 + 8.4, y2 = y0 + 16.8;
        p.l(x0 + side * 9, y1); p.l(x0, y2);
      }
    }
  },
  askatakwas(p) {
    // Eight blades radiating from the gown's own neck-opening, drawn with straight
    // lines rather than flower()'s curves -- a knife has a wide base and a point,
    // not a leaf's curved margin. Each blade widens at 35% of its own length (the
    // hilt end, near the collar) and tapers to a sharp point at full length.
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const x = 50 + Math.cos(a) * 6, y = 50 + Math.sin(a) * 6;
      const dx = Math.cos(a) * 38, dy = Math.sin(a) * 38;
      const len = Math.hypot(dx, dy), nx = (-dy / len) * 6, ny = (dx / len) * 6;
      const mx = x + dx * 0.35, my = y + dy * 0.35;
      p.m(x, y); p.l(mx + nx, my + ny); p.l(x + dx, y + dy); p.l(mx - nx, my - ny); p.close();
    }
    oval(p, 50, 50, 5, 5); // the collar roundel the eight blades radiate from
  },
    nettipattam(p) {
      // The panel: a broad top edge with its corners cut, tapering downward. Three
      // graded registers of bosses, and the *grading* is the mark -- each row is
      // shorter and its bosses smaller than the one above, because the panel narrows
      // -- which is what makes this a register rather than `bandhani`'s even lattice.
      p.m(8, 26); p.l(11, 22); p.l(89, 22); p.l(92, 26);
      p.l(77, 70); p.l(23, 70); p.close();
      for (const [y, n, r, half] of [[33, 5, 6.8, 32], [48, 4, 5.2, 24], [61, 3, 3.8, 14]]) {
        for (let i = 0; i < n; i += 1) {
          oval(p, 50 + (i - (n - 1) / 2) * (2 * half / (n - 1)), y, r, r);
        }
      }
      // Five scallops and five bells. They hang side by side and each carries its own
      // pendant, where `seigaiha`'s arcs nest inside one another.
      for (let i = 0; i < 5; i += 1) {
        const x = 23 + i * 10.8;
        p.m(x, 70); p.q(x + 5.4, 81, x + 10.8, 70);
        oval(p, x + 5.4, 86, 1.9, 1.9);
      }
    },
  funie(p) {
    // The rope twist (funie), top and bottom: an alternating S-curve rather
    // than a straight or single-curve edge, which is what makes it read as
    // a twisted cable rather than a plain border -- the carved detail that
    // runs around a Maramures gate-frame.
    for (const y of [10, 90]) {
      for (let i = 0; i < 4; i++) {
        const x0 = 10 + i * 20, x1 = x0 + 20, mid = (x0 + x1) / 2, dy = i % 2 ? 6 : -6;
        p.m(x0, y); p.q(mid, y + dy, x1, y);
      }
    }
    p.m(10, 10); p.l(10, 90); p.m(90, 10); p.l(90, 90);
    // The tree of life at centre: straight-line chip-carved boughs, not
    // acanthus's curved flanking leaves.
    p.m(50, 78); p.l(50, 24);
    for (const y of [32, 48, 64]) { p.m(50, y); p.l(39, y + 10); p.l(50, y + 4); p.l(61, y + 10); p.close(); }
  },
  phulkari(p) {
    // Four lozenges of darn stitch, each filled with long parallel floats, and the
    // floats running *across* in two of them and *down* in the other two. That
    // alternation is what a real phulkari is: the same thread laid one way and then
    // the other catches the light differently, and the pattern is read off the
    // direction of the fill rather than off an outline. The floats are clipped to
    // the lozenge -- at a distance `d` from the centre a lozenge is `r - |d|` wide --
    // because a darn stitch stops at the counted edge of its block and does not
    // overrun it.
    const r = 17, gap = 4.25;
    const blocks = /** @type {[number, number, boolean][]} */ ([
      [27, 27, true], [73, 27, false], [27, 73, false], [73, 73, true]]);
    for (const [cx, cy, across] of blocks) {
      diamond(p, cx, cy, r, r);
      for (let d = -r + gap; d < r - gap / 2; d += gap) {
        const half = r - Math.abs(d);
        if (across) { p.m(cx - half, cy + d); p.l(cx + half, cy + d); }
        else { p.m(cx + d, cy - half); p.l(cx + d, cy + half); }
      }
    }
  },
  banig(p) {
    // A woven mat's own structure, not a pattern applied to a surface -- the
    // distinction that separates it from both neighbours it could be confused
    // with. `kawung` (id) is a DYED pattern, four wax-resist ovals drawn and
    // repeated onto cloth that already exists; a banig has no base material
    // at all, since the checker itself IS the object, the over-under
    // interlacing of two sets of pandan or buri-palm strips. And `sail` (sw)
    // is one large fluid curved form, where a banig mark is the opposite
    // formal quality: a small rigid unit, repeated evenly across a
    // hard-edged grid. (It is also not `phulkari`'s directional thread-float
    // fill on a separate counted-thread base cloth, just above -- a banig
    // strip has no base cloth and no thread; the flattened facets below are
    // the strips themselves.) The short bar through half the facets is the
    // alternation a real weave shows: the same strip's face reads
    // differently depending on whether it passes over or under its
    // neighbour at that crossing.
    const n = 4, margin = 8, cell = (100 - margin * 2) / n, r = cell * 0.44;
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const cx = margin + cell * (col + 0.5), cy = margin + cell * (row + 0.5);
        diamond(p, cx, cy, r, r * 0.6);
        if ((row + col) % 2 === 0) { p.m(cx - r * 0.5, cy); p.l(cx + r * 0.5, cy); }
      }
    }
  },
  telsem(p) {
    // Four bands crossing at right angles, and the *interlacing* is the whole of the
    // mark: the horizontal band is drawn straight through, so it reads as passing
    // over, and the vertical band's edges stop short of the crossing and resume past
    // it, so it reads as passing under. That over-under is what separates a woven
    // cross from a drawn one, and it is what `interlace` (ar) never resolves --
    // strapwork whose lines never terminate -- while these four arms are capped and
    // end.
    p.m(6, 40); p.l(94, 40); p.m(6, 60); p.l(94, 60);
    p.m(6, 40); p.l(6, 60); p.m(94, 40); p.l(94, 60);
    p.m(40, 6); p.l(40, 40); p.m(60, 6); p.l(60, 40);
    p.m(40, 60); p.l(40, 94); p.m(60, 60); p.l(60, 94);
    p.m(40, 6); p.l(60, 6); p.m(40, 94); p.l(60, 94);
    // The small square the weaver leaves where the bands meet. It is also what keeps
    // the centre from reading as a solid blot at emblem size, which is the failure
    // `banig`'s short alternation bar avoids in the other direction.
    p.m(45, 45); p.l(55, 45); p.l(55, 55); p.l(45, 55); p.close();
  },
  bandhani(p) {
    // A chaubundi -- four tied points around a fifth, which is what the pattern is
    // counted and named by. The rings are drawn just clear of each other because two
    // pinches of cloth cannot share a knot; that near-touching density is what a real
    // bandhani field looks like and is why this reads as tie-dye rather than as
    // polka dots.
    for (const [x, y] of [[50, 50], [37, 37], [63, 37], [37, 63], [63, 63]]) {
      oval(p, x, y, 9, 9); oval(p, x, y, 2.4, 2.4);
    }
    // The lattice continues on the *axes*, not the corners: the cloth is folded
    // before it is tied, so the points come out in diagonal rows. These four carry no
    // centre dot, which is what says "this field goes on" rather than "there are nine
    // of them".
    for (const [x, y] of [[50, 14], [14, 50], [86, 50], [50, 86]]) oval(p, x, y, 7, 7);
  },
  kasuti(p) {
    // The gopura, drawn as one continuous right-angled line: three courses rising on
    // the left, a plateau, the mirror of them on the right, closed along the plinth,
    // with a kalasha finial above. Right angles only, because a counted-thread stitch
    // spans a whole number of threads and can go nowhere else.
    p.m(12, 88); p.l(12, 72); p.l(27, 72); p.l(27, 56); p.l(38, 56); p.l(38, 40);
    p.l(62, 40); p.l(62, 56); p.l(73, 56); p.l(73, 72); p.l(88, 72); p.l(88, 88);
    p.close();
    // The kalasha: a shaft and a bar, orthogonal like everything else.
    p.m(50, 40); p.l(50, 24); p.m(41, 24); p.l(59, 24);
    // The counted ground, and the whole difference from `kolam`: the dots are the
    // cloth's own thread intersections and the line lands *on* them rather than
    // looping around them, so each one sits at a corner of the outline.
    for (const [x, y] of [[12, 88], [27, 72], [38, 56], [62, 56], [73, 72], [88, 88]]) {
      oval(p, x, y, 2.4, 2.4);
    }
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
  warli(p) { oval(p, 50, 20, 10, 10); p.m(32, 33); p.l(68, 33); p.l(50, 56); p.close(); p.m(50, 56); p.l(68, 80); p.l(32, 80); p.close(); },
  kalamkari(p) { p.m(8, 90); p.q(34, 70, 44, 46); oval(p, 62, 34, 25, 25); oval(p, 62, 34, 11, 11); },
  polder(p) { p.m(5, 85); p.l(95, 85); p.m(30, 85); p.l(30, 30); p.m(55, 85); p.l(55, 15); p.m(80, 85); p.l(80, 40); },
  sklo(p) { p.m(50, 7); p.l(93, 50); p.l(50, 93); p.l(7, 50); p.close(); p.m(50, 7); p.l(50, 93); p.m(7, 50); p.l(93, 50); },
  kurbits(p) { p.m(50, 92); p.q(28, 65, 42, 42); p.q(56, 19, 70, 6); leaf(p, 42, 42, -24, -10, 11); },
  ketupat(p) {
    p.m(50, 8); p.l(76, 24); p.l(88, 50); p.l(76, 76); p.l(50, 92);
    p.l(24, 76); p.l(12, 50); p.l(24, 24); p.close();
    p.m(50, 8); p.l(88, 50); p.l(50, 92); p.l(12, 50); p.close();
  },
  dhaka(p) { for (const r of [40, 24, 10]) diamond(p, 50, 50, r, r); },
  askatakwas(p) {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const x = 50 + Math.cos(a) * 4, y = 50 + Math.sin(a) * 4;
      const dx = Math.cos(a) * 44, dy = Math.sin(a) * 44;
      const len = Math.hypot(dx, dy), nx = (-dy / len) * 4, ny = (dx / len) * 4;
      const mx = x + dx * 0.35, my = y + dy * 0.35;
      p.m(x, y); p.l(mx + nx, my + ny); p.l(x + dx, y + dy); p.l(mx - nx, my - ny); p.close();
    }
  },
    nettipattam(p) {
      // The panel's silhouette and its hem, with the bosses dropped for the reason
      // this whole table drops interior detail at divider height: three registers of
      // rings close into a blot at 3pt. Nothing else in this table is a tapering
      // four-sided panel, so the outline alone still names it -- and the scallops are
      // kept because they are what separate it from a plain trapezoid.
      p.m(6, 16); p.l(10, 10); p.l(90, 10); p.l(94, 16);
      p.l(78, 74); p.l(22, 74); p.close();
      for (let i = 0; i < 4; i += 1) {
        const x = 22 + i * 14;
        p.m(x, 74); p.q(x + 7, 88, x + 14, 74);
      }
    },
  funie(p) { p.m(6, 50); p.q(28, 30, 50, 50); p.q(72, 70, 94, 50); },
  phulkari(p) { diamond(p, 30, 50, 22, 42); diamond(p, 70, 50, 22, 42); p.m(12, 88); p.l(48, 12); p.m(52, 88); p.l(88, 12); },
  banig(p) { diamond(p, 30, 30, 17, 11); diamond(p, 70, 30, 17, 11); diamond(p, 30, 70, 17, 11); diamond(p, 70, 70, 17, 11); },
  telsem(p) {
    // The cross's own silhouette, with the interlacing dropped for the reason this
    // whole table drops interior detail at divider height. The outline is what keeps
    // it apart from `banig`, whose tracery is four *separate* facets, and from
    // `interlace`, whose tracery is two overlapping diamonds: a Greek cross is one
    // closed contour and reads as one figure at any size.
    p.m(36, 8); p.l(64, 8); p.l(64, 36); p.l(92, 36); p.l(92, 64); p.l(64, 64);
    p.l(64, 92); p.l(36, 92); p.l(36, 64); p.l(8, 64); p.l(8, 36); p.l(36, 36);
    p.close();
  },
  bandhani(p) {
    // Three tied points on the diagonal, which is the lattice's own direction. Drawn
    // on the diagonal rather than side by side so that at tracery height it cannot be
    // read as `kalamkari`'s concentric flower head, which is the one other mark in
    // this table built from a ring inside a ring.
    for (const [x, y] of [[19, 74], [50, 50], [81, 26]]) {
      oval(p, x, y, 14, 14); oval(p, x, y, 3.6, 3.6);
    }
  },
  kasuti(p) {
    // Three courses rather than two, and that was decided by rendering both: at two
    // courses the figure reads as a plinth with a block on it rather than as a
    // stepped tower. No dots at tracery height -- they close up against the line.
    p.m(12, 88); p.l(12, 68); p.l(30, 68); p.l(30, 48); p.l(44, 48); p.l(44, 28);
    p.l(56, 28); p.l(56, 48); p.l(70, 48); p.l(70, 68); p.l(88, 68); p.l(88, 88);
    p.close();
  },
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
  // `telsem` joins this list where `bandhani` deliberately did not: the treatment is
  // for motifs built from straight *borders*, and a telsem is four straight bands
  // meeting at right angles where a field of tie-dye rings is the opposite.
  const angular = ['rosette', 'interlace', 'compass', 'azulejo', 'kawung', 'meander',
    'embroidery', 'polder', 'telsem', 'kasuti'].includes(motif);
  if (angular) {
    p.m(7, 93); p.l(7, 7); p.l(93, 7);
    p.m(14, 65); p.l(14, 14); p.l(65, 14);
  } else {
    p.m(7, 93); p.c(25, 72, 0, 24, 24, 12); p.c(43, 2, 75, 23, 93, 7);
    p.m(15, 85); p.c(31, 66, 12, 34, 33, 22); p.c(52, 11, 75, 33, 87, 16);
  }
  emblems[motif](frame(p, 27, 27, 64, 64));
}
