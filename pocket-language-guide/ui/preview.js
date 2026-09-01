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
 * @property {string[]} [duplex]  card sides, front and back interleaved: when
 *   present the canvas shows the pairs superimposed instead of the faces
 */

/** @param {PreviewInput} input */
export function renderFaces(input) {
  const { root, plan, svgs, focused } = input;
  root.replaceChildren();

  // Which half backs which is only discovered after cutting, so show it before:
  // each card's two sides superimposed, front dark and back red, so a
  // mis-set duplex driver is obvious rather than expensive.
  if (input.duplex) {
    root.append(duplexCheck(input.duplex));
    return;
  }

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
 * Card fronts and backs overlaid in pairs, for checking a duplex setting.
 * @param {string[]} sides  front, back, front, back, ...
 */
function duplexCheck(sides) {
  const wrap = document.createElement('div');
  wrap.className = 'duplex';
  const note = document.createElement('p');
  note.className = 'small muted';
  note.textContent = 'Each card with its own back laid over it in red. If the red '
    + 'words belong on the back of the black ones, the flip setting matches your '
    + 'printer. If they are the same column twice, switch it.';
  wrap.append(note);

  const grid = document.createElement('div');
  grid.className = 'duplex-grid';
  for (let i = 0; i + 1 < sides.length; i += 2) {
    const card = document.createElement('div');
    card.className = 'duplex-card';
    card.setAttribute('aria-label', `Card ${i / 2 + 1}, front and back overlaid`);
    const front = document.createElement('div');
    front.className = 'duplex-side front';
    front.innerHTML = sides[i];
    const back = document.createElement('div');
    back.className = 'duplex-side back';
    back.innerHTML = sides[i + 1];
    const label = document.createElement('span');
    label.className = 'duplex-label';
    label.textContent = `Card ${i / 2 + 1}`;
    card.append(front, back, label);
    grid.append(card);
  }
  wrap.append(grid);
  return wrap;
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
