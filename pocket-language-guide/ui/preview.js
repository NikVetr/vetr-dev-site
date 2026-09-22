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

import { supports } from '../core/quantity.js';
import { t, uiLanguage } from './i18n.js';
import { nextIndex } from './keys.js';

/**
 * @typedef {Object} PreviewInput
 * @property {HTMLElement} root
 * @property {import('../core/types.js').LayoutPlan} plan
 * @property {string[]} svgs
 * @property {number|null} focused        face index, or null for the grid
 * @property {(index:number|null)=>void} onFocus
 * @property {() => void} [onGrid]  back to the grid of every face, from the button
 *   that leads the thumbnail strip
 * @property {(conceptId:string, box:HTMLElement)=>void} onPick  the hit box comes
 *   with it, because a caller may want to put something beside the row rather
 *   than only know which row it was -- see `ui/item-popup.js`.
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

  // The focused face goes in a box of its own, which is the room it has to fit in.
  // The face's aspect is the *page's*, and it can only hold that if something states
  // how much height is available -- `74vh` was a guess at it, and once the panel
  // seams were dragged wide the guess was too large: the flex item was squeezed to
  // the real height, the aspect broke, and the SVG letterboxed inside its own
  // element. That put white bands down both sides of the card and left every hit box
  // -- which is positioned against the face -- offset from the ink it annotates.
  const fit = document.createElement('div');
  fit.className = 'face-fit';
  const face = faceNode(input, svgs[focused], focused, true);
  // Over the card, under the hit boxes: it is a guide, so it must not take a tap
  // meant for a row. `pointer-events: none` on the overlay does the rest.
  const lock = lockScreenPreview(input.plan);
  if (lock) face.prepend(lock);
  fit.append(face);
  root.append(fit);

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
    // "All faces" leads the strip, which is where the other faces already are. It
    // used to sit in a toolbar row above the card, and that row -- one button and a
    // sentence of hint text -- was costing a viewport-height canvas 57px of the card
    // it is there to show. It appears only when a face is focused, which is the only
    // time it does anything.
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'face-all';
    all.textContent = t('studio.allFaces');
    all.title = t('studio.allFaces');
    all.addEventListener('click', () => input.onGrid?.());
    strip.append(all, ...faces);
    faceChooser(strip, faces, focused);
    root.append(strip);
  }
  refocus(root, resume);
}

/**
 * The date and clock on the lock-screen mock, in the interface language's notation.
 *
 * Not a translation. Every locale writes a date in its own order and a clock in its
 * own cycle, and CLDR already knows both -- so asking fifty-two people to hand-write
 * "Monday 15 September" is fifty-two chances to put the month before the day in a
 * language that does not, for no information the platform was not already holding.
 * Same argument the keypad's unit words make, and it reuses their refusal: `supports`
 * is asked first, because `Intl` answers a tag it has never heard of in the runtime's
 * own language rather than admitting it cannot.
 *
 * The catalogue keeps the English as the floor under Klingon and Quenya, which are
 * not locales and never will be. The instant is fixed and formatted in UTC, so the
 * clock reads 9:41 wherever the page is opened.
 */
function lockSample() {
  const locale = uiLanguage();
  if (!supports(locale, 'time')) {
    return { date: t('preview.lockDate'), time: t('preview.lockTime') };
  }
  const when = new Date(Date.UTC(2025, 8, 15, 9, 41));
  const utc = { timeZone: 'UTC' };
  return {
    date: new Intl.DateTimeFormat(locale,
      { ...utc, weekday: 'long', day: 'numeric', month: 'long' }).format(when),
    time: new Intl.DateTimeFormat(locale,
      { ...utc, hour: 'numeric', minute: '2-digit' }).format(when),
  };
}

/**
 * The lock screen's own furniture, drawn over the reserved bands — **preview only**.
 *
 * A phone preset reserves a strip at the top and bottom so no word on the card ends
 * up under the clock or the buttons. Reserved space is invisible, though: the
 * preview showed a card with a wide empty margin and nothing to say why, so the
 * setting looked like it had simply made the sheet smaller. This draws what is going
 * to be there.
 *
 * Everything is dashed and unfilled, which is the whole of how it says "not yours":
 * the sheet's own ink is solid, so an outline in a dashed stroke reads as a guide at
 * a glance and cannot be mistaken for something that will print. It never reaches
 * the export because it is not in the `LayoutPlan` at all — the renderers draw the
 * plan, and this is a DOM overlay the preview adds on top.
 *
 * In page units against the plan's own `pageW`/`pageH`, so it lines up with the
 * reserved bands exactly rather than approximately.
 * @param {import('../core/types.js').LayoutPlan} plan
 * @returns {SVGSVGElement|null} null where nothing is reserved
 */
export function lockScreenPreview(plan) {
  const { reserve } = plan.geometry;
  const top = plan.pageH * (reserve?.top ?? 0);
  const bottom = plan.pageH * (reserve?.bottom ?? 0);
  if (top <= 0 && bottom <= 0) return null;

  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${plan.pageW} ${plan.pageH}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  // Inline rather than a class: this is the only element that needs these three
  // properties, and `style.css` is being edited elsewhere.
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';

  const W = plan.pageW;
  /** Dash length scales with the page so it reads the same on a 180pt phone and a
   * 448pt tablet. @param {SVGElement} node */
  const dashed = (node) => {
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', '#8a97a4');
    node.setAttribute('stroke-width', String(W / 260));
    node.setAttribute('stroke-dasharray', `${W / 90} ${W / 120}`);
    svg.append(node);
    return node;
  };
  /** @param {number} x @param {number} y @param {number} w @param {number} h @param {number} r */
  const box = (x, y, w, h, r) => {
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x)); rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w)); rect.setAttribute('height', String(h));
    rect.setAttribute('rx', String(r));
    return dashed(rect);
  };
  /** Outlined glyphs, not filled ones: the dashes have to read *through* the
   * numerals, and a filled 9:41 would be a solid mark on a sheet whose own marks are
   * solid. @param {string} text @param {number} y @param {number} size */
  const label = (text, y, size) => {
    const node = document.createElementNS(NS, 'text');
    node.setAttribute('x', String(W / 2));
    node.setAttribute('y', String(y));
    node.setAttribute('text-anchor', 'middle');
    node.setAttribute('font-size', String(size));
    node.setAttribute('font-family', 'system-ui, sans-serif');
    node.setAttribute('font-weight', '600');
    node.textContent = text;
    return dashed(node);
  };

  if (top > 0) {
    // The iOS shape, which is also near enough Android's: a small date line, the
    // clock under it at several times the size, then a widget row. Sized off the
    // band rather than off the page, so a bigger reserve draws a bigger clock and
    // the preview keeps telling the truth about how much room it took.
    const dateY = top * 0.26;
    const lock = lockSample();
    label(lock.date, dateY, Math.min(top * 0.13, W / 16));
    label(lock.time, top * 0.66, Math.min(top * 0.42, W / 4));
    // Two widget tiles on the row under the clock, which is where iOS puts them.
    const tileH = top * 0.17;
    const tileW = W * 0.3;
    const tileY = top - tileH - top * 0.06;
    box(W / 2 - tileW - W * 0.02, tileY, tileW, tileH, tileH * 0.28);
    box(W / 2 + W * 0.02, tileY, tileW, tileH, tileH * 0.28);
  }

  if (bottom > 0) {
    // The two corner controls and the home indicator. Round, because both platforms
    // draw them round and a rounded square would read as another widget.
    const y0 = plan.pageH - bottom;
    const r = Math.min(bottom * 0.26, W * 0.07);
    for (const cx of [W * 0.22, W * 0.78]) {
      const circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', String(cx));
      circle.setAttribute('cy', String(y0 + bottom * 0.42));
      circle.setAttribute('r', String(r));
      dashed(circle);
    }
    const barW = W * 0.34;
    const barH = Math.max(bottom * 0.05, W / 160);
    box(W / 2 - barW / 2, plan.pageH - bottom * 0.28, barW, barH, barH / 2);
  }

  return svg;
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
    box.addEventListener('click', () => input.onPick(conceptId, box));
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
