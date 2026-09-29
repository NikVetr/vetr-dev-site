// The context list's watermarks, drawn for it in the logo's own manner.
//
// The topics wore the printed sheet's section icons -- Lucide outlines, stroked thin
// and set small -- beside a Reply mark that is two filled bubbles, the front one
// cutting a gap out of the one behind. Next to that the outlines read as clip art.
// So each topic has a silhouette of the one object that says it best, drawn the way
// the bubbles are: filled shapes in a 256 x 208 box, and where two overlap, the
// front one knocks a clean gap out of the back one, because at a tenth of full
// strength behind a word there is no tonal difference to separate them, only space.
//
// `back` and `front` are SVG path elements; `front` is painted over `back` and cut
// out of it with a margin. `cut` is cut out of `back` and not painted at all: the
// clock's hands are the face's own absence, the one mark here that is read by what
// is missing from it. Strokes (the rays, the handle, the hands) are strokes.

const R = 'stroke-linecap="round" stroke-linejoin="round"';
/** The clean space a front shape keeps around itself, in the drawing's units. */
const GAP = 16;
/** @param {string} d @param {number} w */
const stroke = (d, w) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" ${R}/>`;
/** @param {string} d */
const fill = (d) => `<path d="${d}" fill="currentColor" fill-rule="evenodd"/>`;
/** A filled shape with its corners rounded by a stroke of its own colour. @param {string} d @param {number} [r] */
const soft = (d, r = 10) => `<path d="${d}" fill="currentColor" stroke="currentColor" stroke-width="${r}" ${R}/>`;

// A plate between the fork and the utensil the reader's part of the world lays
// beside it, apart from both: touching, the three read as one blot.
const PLATE = fill('M128 42a62 62 0 1 1 0 124a62 62 0 1 1 0-124Zm0 22a40 40 0 1 0 0 80a40 40 0 1 0 0-80Z');
const FORK = stroke('M17 22v50M31.5 22v50M46 22v50', 8)
  + soft('M13 70h37v8c0 14-8 24-18.5 24S13 92 13 78Z', 8) + soft('M26 100h11v90H26Z', 10);

/** @type {Record<string, {back?: string, front: string, cut?: string}>} */
export const TOPIC_MARKS = {
  // A siren: the dome, its base, and the light it throws.
  siren: {
    back: fill('M76 150V116a52 52 0 0 1 104 0v34Z')
      + stroke('M128 18v22M58 46l15 15M198 46l-15 15M26 112h20M230 112h-20', 14),
    front: soft('M54 160h148v30H54Z', 12),
  },
  // Two people meeting: the nearer one cuts into the other.
  people: {
    back: fill('M92 42a30 30 0 1 1 0 60a30 30 0 1 1 0-60ZM34 176c0-44 26-66 58-66s58 22 58 66Z'),
    front: fill('M166 60a32 32 0 1 1 0 64a32 32 0 1 1 0-64ZM104 200c0-48 28-70 62-70s62 22 62 70Z'),
  },
  // A signpost: two boards pointing opposite ways across the post, far enough apart
  // that the post between them reads as a post.
  signpost: {
    back: soft('M120 36h16v160h-16Z', 8),
    front: soft('M52 26h118l24 23l-24 23H52Z') + soft('M204 128H86l-24 23l24 23h118Z'),
  },
  // A bus from the front: windscreen, lamps, wheels and mirrors.
  bus: {
    back: soft('M68 168h30v22H68ZM158 168h30v22h-30Z', 10) + soft('M40 58h10v28H40ZM206 58h10v28h-10Z', 8),
    front: fill('M78 22h100a22 22 0 0 1 22 22v108a18 18 0 0 1-18 18H74a18 18 0 0 1-18-18V44a22 22 0 0 1 22-22Z'
      + 'M80 44h96a8 8 0 0 1 8 8v48a8 8 0 0 1-8 8H80a8 8 0 0 1-8-8V52a8 8 0 0 1 8-8Z'
      + 'M86 128a11 11 0 1 1 0 22a11 11 0 1 1 0-22ZM170 128a11 11 0 1 1 0 22a11 11 0 1 1 0-22Z'),
  },
  // A plate, with the fork and the knife laid either side of it -- the international
  // restaurant sign.
  cutlery: {
    back: PLATE,
    front: FORK + soft('M206 116V36c0-6 6-10 12-6c16 11 20 52 8 88Z', 8) + soft('M206 112h14v78h-14Z', 10),
  },
  // Fork and spoon, as most of Southeast Asia eats.
  spoon: {
    back: PLATE,
    front: FORK + fill('M218 26c11 0 19 17 19 38s-8 36-19 36s-19-15-19-36s8-38 19-38Z')
      + soft('M212 96h12v94h-12Z', 10),
  },
  // A bowl, and chopsticks lifting from it -- slanted, never standing upright in it,
  // which is how they are left for the dead.
  chopsticks: {
    back: stroke('M210 14l-82 82M240 32l-96 70', 13),
    front: fill('M18 96h192c0 54-43 94-96 94S18 150 18 96Z') + fill('M82 182h64l-4 14H86Z'),
  },
  // A shopping bag and its handle.
  bag: {
    back: stroke('M92 82V64c0-22 16-38 36-38s36 16 36 38v18', 14),
    front: fill('M54 78h148l-8 110c-.5 7-6 12-13 12H75c-7 0-12.5-5-13-12Z'
      + 'M92 94a8 8 0 1 1 0 16a8 8 0 1 1 0-16ZM164 94a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z'),
  },
  // A clock: its hands and the four quarters are cut out of its face.
  clock: {
    back: fill('M128 12a92 92 0 1 1 0 184a92 92 0 1 1 0-184Z'),
    front: '',
    cut: stroke('M128 104V56M128 104l33 19', 18) + stroke('M128 24v10M208 104h-10M128 184v-10M48 104h10', 10),
  },
  // A lotus: the middle petal and the low outer ones in front of the two beside it.
  lotus: {
    back: fill('M128 150c-38-2-70-30-80-74c36 6 64 30 80 74ZM128 150c38-2 70-30 80-74c-36 6-64 30-80 74Z'),
    front: fill('M128 22c26 30 34 72 0 126c-34-54-26-96 0-126Z')
      + fill('M128 162c-42 8-88-4-114-34c42-8 84 4 114 34ZM128 162c42 8 88-4 114-34c-42-8-84 4-114 34Z'),
  },
  // A bed: the frame, and the pillow on it.
  bed: {
    back: soft('M26 40h22v112h160v-44h22v88h-22v-18H48v18H26Z', 8) + soft('M48 124h160v28H48Z', 8),
    front: soft('M68 96h50v20H68Z', 12) + soft('M128 94h80v26h-80Z', 10),
  },
  // A camera: body, viewfinder hump and flash, the lens standing out of it.
  camera: {
    back: fill('M48 64h40l14-26h52l14 26h40a20 20 0 0 1 20 20v88a20 20 0 0 1-20 20H48a20 20 0 0 1-20-20V84a20 20 0 0 1 20-20Z'
      + 'M128 78a50 50 0 1 1 0 100a50 50 0 1 1 0-100Z' + 'M186 80h20v12h-20Z'),
    front: fill('M128 92a36 36 0 1 1 0 72a36 36 0 1 1 0-72Z'),
  },
  // Two peaks, the nearer one in front, and snow on the higher.
  mountain: {
    back: soft('M162 30L248 188H76Z', 10),
    front: soft('M84 88L150 188H18Z', 10) + soft('M162 30L188 78L176 70L165 82L153 70L136 78Z', 6),
  },
  // A capsule in two halves, and a scored tablet beside it.
  capsule: {
    back: `<g transform="rotate(-38 118 104)">${fill('M112 70H70a34 34 0 0 0 0 68h42Z')}</g>`
      + fill('M196 132a26 26 0 1 1 0 52a26 26 0 1 1 0-52ZM176 154h40v8h-40Z'),
    front: `<g transform="rotate(-38 118 104)">${fill('M124 70h42a34 34 0 0 1 0 68h-42Z')}</g>`,
  },
};

/**
 * **The object the reader eats with**, where it is not the knife and fork: the mark
 * is for the owner finding a topic in their own language, so it is keyed to that
 * language rather than the one the board speaks. Chopsticks in China, Japan, Korea
 * and Vietnam; fork and spoon across mainland and island Southeast Asia.
 * @type {Record<string, Record<string, string>>}
 */
const LOCAL = {
  cutlery: {
    'zh-Hans': 'chopsticks', ja: 'chopsticks', ko: 'chopsticks', vi: 'chopsticks',
    th: 'spoon', lo: 'spoon', km: 'spoon', fil: 'spoon', id: 'spoon', ms: 'spoon', jv: 'spoon',
  },
};

/**
 * One topic's watermark as an SVG element. The front shapes are drawn twice: once in
 * black into a mask that cuts the gap out of the back ones, once for real.
 * @param {string} name  a key of TOPIC_MARKS
 * @param {string} id    unique on the page, for the mask
 * @param {string} lang  the language the reader reads the topics in
 */
export function topicMark(name, id, lang) {
  const mark = TOPIC_MARKS[LOCAL[name]?.[lang] ?? name];
  if (!mark) throw new Error(`no topic mark named "${name}"`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 256 208');
  svg.setAttribute('class', 'board-cell-mark board-cell-topic');
  svg.setAttribute('aria-hidden', 'true');
  // A shape's own stroke width outranks the group's, so it is widened here -- or a
  // stroked shape keeps no gap at all and merges into what is behind it.
  const black = (/** @type {string} */ d) => d.replaceAll('currentColor', 'black');
  const cut = black(mark.front).replace(/stroke-width="(\d+)"/g, (_, w) => `stroke-width="${Number(w) + GAP}"`);
  svg.innerHTML = mark.back
    ? `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="208">`
      + `<rect width="256" height="208" fill="white"/><g stroke="black" stroke-width="${GAP}" ${R}>${cut}</g>`
      + `${black(mark.cut ?? '')}</mask></defs>`
      + `<g class="topic-ink"><g mask="url(#${id})">${mark.back}</g>${mark.front}</g>`
    : `<g class="topic-ink">${mark.front}</g>`;
  return svg;
}

/** The margin round a mark's ink, as a share of its height: the same above and below
 * every mark, so a short drawing is drawn as tall as a tall one. */
const MARGIN = 0.07;

/**
 * **A mark fitted to its ink, not to its box.** The drawings sit where they were drawn
 * in a shared box, so the chopsticks' bowl sat off the button's middle and a short
 * drawing -- the lotus, the capsule, the two people -- had more room above and below
 * it than the rest. The box is its ink with the same margin all round, so every mark is
 * centred and, where the button's height is what binds, stands as tall as the others.
 * Measured, so it needs the mark in the document.
 * @param {SVGSVGElement} svg  a mark from `topicMark`, attached
 */
export function centreMark(svg) {
  const ink = /** @type {SVGGraphicsElement} */ (svg.querySelector('.topic-ink')).getBBox();
  const m = ink.height * MARGIN;
  svg.setAttribute('viewBox', `${ink.x - m} ${ink.y - m} ${ink.width + 2 * m} ${ink.height + 2 * m}`);
}
