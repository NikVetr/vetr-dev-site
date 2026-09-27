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
// out of it with a margin. Strokes (the rays, the handle, the hands) are strokes.

const R = 'stroke-linecap="round" stroke-linejoin="round"';
/** @param {string} d @param {number} w */
const stroke = (d, w) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" ${R}/>`;
/** @param {string} d */
const fill = (d) => `<path d="${d}" fill="currentColor" fill-rule="evenodd"/>`;
/** A filled shape with its corners rounded by a stroke of its own colour. @param {string} d @param {number} [r] */
const soft = (d, r = 10) => `<path d="${d}" fill="currentColor" stroke="currentColor" stroke-width="${r}" ${R}/>`;

/** @type {Record<string, {back?: string, front: string}>} */
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
  // A signpost: two boards pointing opposite ways across the post.
  signpost: {
    back: soft('M122 30h12v168h-12Z', 8),
    front: soft('M58 48h118l24 22l-24 22H58Z') + soft('M198 108H80l-24 22l24 22h118Z'),
  },
  // A bus from the front: windscreen, lamps, wheels and mirrors.
  bus: {
    back: soft('M68 168h30v22H68ZM158 168h30v22h-30Z', 10) + soft('M40 58h10v28H40ZM206 58h10v28h-10Z', 8),
    front: fill('M78 22h100a22 22 0 0 1 22 22v108a18 18 0 0 1-18 18H74a18 18 0 0 1-18-18V44a22 22 0 0 1 22-22Z'
      + 'M80 44h96a8 8 0 0 1 8 8v48a8 8 0 0 1-8 8H80a8 8 0 0 1-8-8V52a8 8 0 0 1 8-8Z'
      + 'M86 128a11 11 0 1 1 0 22a11 11 0 1 1 0-22ZM170 128a11 11 0 1 1 0 22a11 11 0 1 1 0-22Z'),
  },
  // A plate, with the fork and the knife laid either side of it.
  cutlery: {
    back: fill('M128 30a76 76 0 1 1 0 152a76 76 0 1 1 0-152Zm0 26a50 50 0 1 0 0 100a50 50 0 1 0 0-100Z'),
    front: soft('M30 24h8v58h-8ZM48 24h8v58h-8ZM66 24h8v58h-8Z', 6)
      + soft('M28 78h48v8c0 14-10 24-24 24s-24-10-24-24Z', 8) + soft('M46 104h12v86H46Z', 10)
      + soft('M198 118V36c0-6 6-10 12-6c16 11 20 52 8 88Z', 8) + soft('M198 114h14v76h-14Z', 10),
  },
  // A shopping bag and its handle.
  bag: {
    back: stroke('M92 82V64c0-22 16-38 36-38s36 16 36 38v18', 14),
    front: fill('M54 78h148l-8 110c-.5 7-6 12-13 12H75c-7 0-12.5-5-13-12Z'
      + 'M92 94a8 8 0 1 1 0 16a8 8 0 1 1 0-16ZM164 94a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z'),
  },
  // A clock, its hands cut out of its face.
  clock: {
    back: fill('M128 16a88 88 0 1 1 0 176a88 88 0 1 1 0-176Z'),
    front: stroke('M128 104V48M128 104l38 24', 14) + fill('M128 94a10 10 0 1 1 0 20a10 10 0 1 1 0-20Z'),
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
    front: soft('M62 96h54v20H62Z', 12) + soft('M126 94h82v26h-82Z', 10),
  },
  // A camera: body, viewfinder hump and flash, the lens standing out of it.
  camera: {
    back: fill('M48 64h40l14-26h52l14 26h40a20 20 0 0 1 20 20v88a20 20 0 0 1-20 20H48a20 20 0 0 1-20-20V84a20 20 0 0 1 20-20Z'
      + 'M128 78a50 50 0 1 1 0 100a50 50 0 1 1 0-100Z' + 'M186 80h20v12h-20Z'),
    front: fill('M128 92a36 36 0 1 1 0 72a36 36 0 1 1 0-72Z'),
  },
  // A capsule in two halves, and a scored tablet beside it.
  capsule: {
    back: `<g transform="rotate(-38 118 104)">${fill('M112 70H70a34 34 0 0 0 0 68h42Z')}</g>`
      + fill('M196 132a26 26 0 1 1 0 52a26 26 0 1 1 0-52ZM176 154h40v8h-40Z'),
    front: `<g transform="rotate(-38 118 104)">${fill('M124 70h42a34 34 0 0 1 0 68h-42Z')}</g>`,
  },
};

/**
 * One topic's watermark as an SVG element. The front shapes are drawn twice: once in
 * black into a mask that cuts the gap out of the back ones, once for real.
 * @param {string} name  a key of TOPIC_MARKS
 * @param {string} id    unique on the page, for the mask
 */
export function topicMark(name, id) {
  const mark = TOPIC_MARKS[name];
  if (!mark) throw new Error(`no topic mark named "${name}"`);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 256 208');
  svg.setAttribute('class', 'board-cell-mark board-cell-topic');
  svg.setAttribute('aria-hidden', 'true');
  const cut = mark.front.replaceAll('currentColor', 'black');
  svg.innerHTML = mark.back
    ? `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="208">`
      + `<rect width="256" height="208" fill="white"/><g stroke="black" stroke-width="16" ${R}>${cut}</g></mask></defs>`
      + `<g mask="url(#${id})">${mark.back}</g>${mark.front}`
    : mark.front;
  return svg;
}
