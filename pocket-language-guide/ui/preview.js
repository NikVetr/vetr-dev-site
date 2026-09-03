// The canvas panel: faces as SVG, with a transparent hit layer over them.
//
// The preview renders through render/svg.js -- the same code the export uses -- so
// what you see and what you download cannot drift. Interaction rides on top as
// absolutely positioned hit boxes taken from the plan, which means clicking a row
// needs no knowledge of how that row was laid out.
//
// Both interactions work from the keyboard without spending the tab order on it: a
// face carries ninety rows, and ninety tab stops wedged between the format panel and
// the content list would be worse for everyone than the mouse-only version was. So
// the strip is one stop and the hit layer is one stop, each walked with the arrow
// keys -- the same contract the settings panels use, hence the shared key handling.

import { t } from './i18n.js';
import { nextIndex } from './keys.js';

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
  const resume = focusMark(root);
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
    const faces = svgs.map((svg, i) => faceNode(input, svg, i, false));
    grid.append(...faces);
    faceChooser(grid, faces, 0);
    root.append(grid);
    refocus(root, resume);
    return;
  }

  root.append(faceNode(input, svgs[focused], focused, true));

  if (svgs.length > 1) {
    const strip = document.createElement('div');
    strip.className = 'face-strip';
    const faces = svgs.map((svg, i) => {
      const node = faceNode(input, svg, i, false);
      if (i === focused) {
        node.classList.add('current');
        // .current is a colour-only cue, so state it for assistive tech too.
        node.setAttribute('aria-current', 'true');
      }
      return node;
    });
    strip.append(...faces);
    faceChooser(strip, faces, focused);
    root.append(strip);
  }
  refocus(root, resume);
}

/**
 * Make a set of elements one tab stop: arrows and Home/End move focus inside it,
 * Enter and Space activate through the same click handler the mouse uses.
 * @param {HTMLElement} container @param {HTMLElement[]} items
 * @param {number} active  which item holds the stop to begin with
 */
function roving(container, items, active) {
  items.forEach((item, i) => { item.tabIndex = i === active ? 0 : -1; });
  // Whichever item was reached last keeps the stop, so tabbing away and back
  // returns to the row you were reading rather than to the top of the face.
  container.addEventListener('focusin', ({ target }) => {
    for (const item of items) item.tabIndex = item === target ? 0 : -1;
  });
  container.addEventListener('keydown', (event) => {
    const from = items.indexOf(/** @type {HTMLElement} */ (event.target));
    if (from < 0) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      items[from].click();
      return;
    }
    const to = nextIndex(event.key, from, items.length);
    if (to < 0) return;
    event.preventDefault();
    items[to].focus();
  });
}

/** The strip and the grid are the same question -- which face? -- so both behave
 * as one toolbar of face buttons however many faces there are.
 * @param {HTMLElement} container @param {HTMLElement[]} faces @param {number} active */
function faceChooser(container, faces, active) {
  container.setAttribute('role', 'toolbar');
  container.setAttribute('aria-label', t('preview.faces'));
  roving(container, faces, active);
}

/** @typedef {{kind:'hit', at:number}|{kind:'face'}} FocusMark */

/**
 * What in the canvas holds focus, in terms that survive the rebuild. Every node
 * here is replaced on each render, so without this a keyboard reader is dropped
 * back to the top of the document the moment they choose a face.
 * @param {HTMLElement} root @returns {FocusMark|null}
 */
function focusMark(root) {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !root.contains(active)) return null;
  const at = [...root.querySelectorAll('.hit')].indexOf(active);
  if (at >= 0) return { kind: 'hit', at };
  return active.closest('.face') ? { kind: 'face' } : null;
}

/** @param {HTMLElement} root @param {FocusMark|null} mark */
function refocus(root, mark) {
  if (!mark) return;
  const hits = root.querySelectorAll('.hit');
  const target = mark.kind === 'hit'
    ? hits[Math.min(mark.at, hits.length - 1)]
    // Land on the face that is now current, so activating a thumbnail leaves
    // focus on the choice that was just made.
    : root.querySelector('.face-strip .face.current') ?? root.querySelector('.face');
  if (target instanceof HTMLElement) target.focus();
}

/**
 * The words a hit box covers, so a row announces itself instead of its id. Runs
 * and hits come out of the same plan in the same page coordinates, and a run's
 * baseline sits inside the row it belongs to.
 * @param {import('../core/types.js').Face} face
 * @param {import('../core/types.js').HitBox} hit
 */
function rowText(face, hit) {
  // Justification split each line into word fragments that carry their own
  // spacing, so a line is reassembled before the lines are joined -- otherwise a
  // Chinese row comes out one character at a time.
  /** @type {Map<number,string>} */ const lines = new Map();
  for (const run of face.runs) {
    if (run.y <= hit.y || run.y > hit.y + hit.h) continue;
    if (run.x < hit.x - 1 || run.x >= hit.x + hit.w) continue;
    const baseline = Math.round(run.y * 100);
    lines.set(baseline, (lines.get(baseline) ?? '') + run.text);
  }
  return [...lines.values()].map((line) => line.trim()).filter(Boolean).join(' ');
}

/**
 * @param {PreviewInput} input @param {string} svg @param {number} index
 * @param {boolean} interactive
 */
function faceNode(input, svg, index, interactive) {
  const node = document.createElement('div');
  node.className = interactive ? 'face focused' : 'face';
  node.innerHTML = svg;
  const name = t('preview.faceOf', { n: index + 1, total: input.svgs.length });

  if (!interactive) {
    // A bare div takes no accessible name and cannot be operated; as a button the
    // thumbnail is announced, and its own click serves mouse and keyboard alike.
    node.setAttribute('role', 'button');
    node.setAttribute('aria-label', name);
    node.addEventListener('click', () => input.onFocus(index));
    return node;
  }

  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', name);
  // **The face div has to be exactly the drawn page, not the panel.** Both overlays
  // -- the row hit boxes and the drag handles -- place themselves as percentages of
  // the page's own units against this div, so any difference between the two boxes
  // is a systematic offset. The div was block-level at the panel's full width while
  // the SVG sat at its intrinsic 672px and was centred inside it, which on a wide
  // window put every hit box and every margin bar about 1.16x too wide and 54px too
  // far right, and made the drag arithmetic move the margin 14% less than the
  // pointer. Giving the div the page's aspect and letting the SVG fill it makes the
  // two boxes the same box -- which also closes the whitespace, since the card now
  // takes the width the panel offers instead of a fixed 672px.
  node.style.setProperty('--face-aspect', String(input.plan.pageW / input.plan.pageH));

  // The rows of a face are a list you pick one of, so focus doubles as the hover
  // highlight and activating a row is what reveals it in the content list.
  const layer = document.createElement('div');
  layer.className = 'hit-layer';
  layer.setAttribute('role', 'listbox');
  layer.setAttribute('aria-label', t('preview.rowsOnFace'));
  const face = input.plan.faces[index];
  const { pageW, pageH } = input.plan;
  /** @type {HTMLElement[]} */ const boxes = [];
  for (const hit of face.hits) {
    if (!hit.conceptId) continue;
    const conceptId = hit.conceptId;
    // Percentage geometry so hit boxes track the SVG at any rendered size.
    const box = document.createElement('div');
    box.className = 'hit';
    box.dataset.concept = conceptId;
    box.setAttribute('role', 'option');
    box.setAttribute('aria-selected', 'false');
    box.setAttribute('aria-label', rowText(face, hit) || conceptId);
    box.style.left = `${(hit.x / pageW) * 100}%`;
    box.style.top = `${(hit.y / pageH) * 100}%`;
    box.style.width = `${(hit.w / pageW) * 100}%`;
    box.style.height = `${(hit.h / pageH) * 100}%`;
    box.title = t('preview.showInList');
    box.addEventListener('click', () => input.onPick(conceptId));
    box.addEventListener('mouseenter', () => input.onHover(conceptId));
    box.addEventListener('mouseleave', () => input.onHover(null));
    box.addEventListener('focus', () => {
      box.setAttribute('aria-selected', 'true');
      input.onHover(conceptId);
    });
    box.addEventListener('blur', () => {
      box.setAttribute('aria-selected', 'false');
      input.onHover(null);
    });
    boxes.push(box);
    layer.append(box);
  }
  roving(layer, boxes, 0);
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
  note.textContent = t('preview.duplexNote');
  wrap.append(note);

  const grid = document.createElement('div');
  grid.className = 'duplex-grid';
  for (let i = 0; i + 1 < sides.length; i += 2) {
    const card = document.createElement('div');
    card.className = 'duplex-card';
    card.setAttribute('aria-label', t('preview.cardPair', { n: i / 2 + 1 }));
    const front = document.createElement('div');
    front.className = 'duplex-side front';
    front.innerHTML = sides[i];
    const back = document.createElement('div');
    back.className = 'duplex-side back';
    back.innerHTML = sides[i + 1];
    const label = document.createElement('span');
    label.className = 'duplex-label';
    label.textContent = t('preview.cardLabel', { n: i / 2 + 1 });
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
