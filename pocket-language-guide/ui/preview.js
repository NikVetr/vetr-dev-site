// The canvas panel: faces as SVG, with a transparent hit layer over them.
//
// The preview renders through render/svg.js -- the same code the export uses -- so
// what you see and what you download cannot drift. Interaction rides on top as
// absolutely positioned hit boxes taken from the plan, which means clicking a row
// needs no knowledge of how that row was laid out.

/**
 * @typedef {Object} PreviewInput
 * @property {HTMLElement} root
 * @property {import('../core/types.js').LayoutPlan} plan
 * @property {string[]} svgs
 * @property {number|null} focused        face index, or null for the grid
 * @property {(index:number|null)=>void} onFocus
 * @property {(conceptId:string)=>void} onPick
 * @property {(conceptId:string|null)=>void} onHover
 */

/** @param {PreviewInput} input */
export function renderFaces(input) {
  const { root, plan, svgs, focused } = input;
  root.replaceChildren();

  if (focused === null) {
    const grid = document.createElement('div');
    grid.className = 'face-grid';
    svgs.forEach((svg, i) => grid.append(faceNode(input, svg, i, false)));
    root.append(grid);
    return;
  }

  root.append(faceNode(input, svgs[focused], focused, true));

  if (svgs.length > 1) {
    const strip = document.createElement('div');
    strip.className = 'face-strip';
    svgs.forEach((svg, i) => {
      const node = faceNode(input, svg, i, false);
      if (i === focused) node.classList.add('current');
      strip.append(node);
    });
    root.append(strip);
  }
}

/**
 * @param {PreviewInput} input @param {string} svg @param {number} index
 * @param {boolean} interactive
 */
function faceNode(input, svg, index, interactive) {
  const node = document.createElement('div');
  node.className = interactive ? 'face focused' : 'face';
  node.innerHTML = svg;
  node.setAttribute('aria-label', `Face ${index + 1} of ${input.svgs.length}`);

  if (!interactive) {
    node.addEventListener('click', () => input.onFocus(index));
    return node;
  }

  // Percentage geometry so hit boxes track the SVG at any rendered size.
  const layer = document.createElement('div');
  layer.className = 'hit-layer';
  const { pageW, pageH } = input.plan;
  for (const hit of input.plan.faces[index].hits) {
    if (!hit.conceptId) continue;
    const box = document.createElement('div');
    box.className = 'hit';
    box.dataset.concept = hit.conceptId;
    box.style.left = `${(hit.x / pageW) * 100}%`;
    box.style.top = `${(hit.y / pageH) * 100}%`;
    box.style.width = `${(hit.w / pageW) * 100}%`;
    box.style.height = `${(hit.h / pageH) * 100}%`;
    box.title = 'Show in the content list';
    box.addEventListener('click', () => input.onPick(/** @type {string} */ (hit.conceptId)));
    box.addEventListener('mouseenter', () => input.onHover(/** @type {string} */ (hit.conceptId)));
    box.addEventListener('mouseleave', () => input.onHover(null));
    layer.append(box);
  }
  node.append(layer);
  return node;
}

/**
 * Outline every box belonging to one concept, on whichever face it landed on.
 * @param {HTMLElement} root @param {string|null} conceptId
 */
export function highlight(root, conceptId) {
  for (const box of root.querySelectorAll('.hit')) {
    box.classList.remove('lit');
  }
  if (!conceptId) return;
  for (const box of root.querySelectorAll('.hit')) {
    if (box instanceof HTMLElement && box.dataset.concept === conceptId) box.classList.add('lit');
  }
}
