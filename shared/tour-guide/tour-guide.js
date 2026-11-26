// What the site's guided demo tours share (Agent Bar's Pipsqueak, ROTA's Monte): the guide character and its panel, the
// card of text with Back and Next, which travel as one unit.
//
// The tour says where the character should stand for each step; the panel hangs beside it at a fixed offset, on the
// same side for as long as it fits, and changes side only when it would leave the visible area. Moving to a step,
// the whole unit glides along one eased path (the motion shows where the tour went) while the character shows its
// `leap` pose; under reduced motion it is placed at once. The visitor can drag the unit by the panel's header, with a
// mouse, pen or finger, or focus the grip and use the arrow keys (Shift for bigger steps); once moved, it stays at
// that place on screen for the following steps until Snap back returns it to the tour's place.
//
// The character is one image per pose, listed in the demo's guide/manifest.js; the poses and the canvas they share
// are described in shared/tour-guide/POSES.md. A pose the manifest leaves out shows `idle`.

const GAP = 8;
const EASE = 'cubic-bezier(0.45, 0, 0.25, 1)';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

/** @typedef {{left: number, top: number, width: number, height: number}} Area */
/** @typedef {{x: number, y: number}} Point */

const translate = (/** @type {Point} */ p) => `translate(${p.x}px, ${p.y}px)`;
/** Where an element's transform has it now, mid-animation included. */
function shown(/** @type {HTMLElement} */ el) {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return { x: 0, y: 0 };
  const m = new DOMMatrixReadOnly(t);
  return { x: m.m41, y: m.m42 };
}
const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) => Math.max(lo, Math.min(Math.max(lo, hi), v));

/**
 * @param {HTMLElement} unit an empty, absolutely positioned element holding `character` and `panel`
 * @param {{character: HTMLElement, panel: HTMLElement, art: {poses: Record<string, string>}, area: () => Area,
 *   sides?: string[] | (() => string[]), label?: string, onBack: () => void, onNext: () => void, onEnd: () => void, onReplay: () => void}} options
 *   area: the visible box the unit stays inside, in the unit's own coordinates; sides: where the panel may hang
 *   from the character, in order of preference ('below', 'above', 'right', 'left')
 */
export function createTourGuide(unit, { character, panel, art, area, sides = ['below', 'above', 'right', 'left'], label = 'Tour', onBack, onNext, onEnd, onReplay }) {
  unit.classList.add('tour-unit');
  unit.hidden = true;
  character.classList.add('tour-character');
  character.insertAdjacentHTML('afterbegin', Object.entries(art.poses).map(([pose, src]) =>
    `<img class="tour-pose" data-pose="${pose}" src="${src}" alt="" draggable="false"${pose === 'idle' ? '' : ' hidden'}>`).join(''));
  const images = /** @type {HTMLImageElement[]} */ ([...character.querySelectorAll('img.tour-pose')]);
  panel.classList.add('tour-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', label);
  panel.tabIndex = -1;
  panel.innerHTML = `<div class="tour-panel-head">
  <button type="button" class="tour-grip" aria-label="Move the tour guide" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" title="Drag to move the guide and this panel, or use the arrow keys here"><span aria-hidden="true">⠿</span></button>
  <p class="tour-panel-step"></p>
  <button type="button" class="tour-snap" hidden title="Put the guide back beside what the tour is showing"><span aria-hidden="true">↩</span> Snap back</button>
</div>
<div class="tour-panel-body" aria-live="polite"></div>
<div class="tour-panel-nav">
  <span class="tour-panel-pair"><button type="button" data-tour="back">← Back</button><button type="button" data-tour="next">Next →</button></span>
  <span class="tour-panel-pair tour-panel-ends"><button type="button" data-tour="replay" hidden>↺ Replay</button><button type="button" data-tour="end">End tour</button></span>
</div>`;
  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (panel.querySelector(s));
  const head = $('.tour-panel-head'), grip = $('.tour-grip'), snap = $('.tour-snap'), stepLabel = $('.tour-panel-step');
  const back = /** @type {HTMLButtonElement} */ ($('[data-tour="back"]')), next = /** @type {HTMLButtonElement} */ ($('[data-tour="next"]'));
  const replay = $('[data-tour="replay"]'), end = $('[data-tour="end"]');

  let at = { x: 0, y: 0 };       // where the unit is going (or is)
  let off = { x: 0, y: 0 };      // the panel's offset from the character
  const sidesNow = () => (typeof sides === 'function' ? sides() : sides);
  let side = sidesNow()[0];
  /** @type {{x: number, y: number, area?: Area, avoid?: DOMRect|null}|null} */
  let home = null;               // the tour's place for the character, and how it was asked for
  let pinned = /** @type {Point|null} */ (null); // where the visitor put the unit, from the area's corner
  let fresh = true;              // just shown: the first placement does not glide
  let moving = /** @type {Animation|null} */ (null), sliding = /** @type {Animation|null} */ (null);
  let rest = 'idle', pose = 'idle';

  function showPose(/** @type {string} */ name) {
    pose = name;
    const file = name in art.poses ? name : 'idle';
    for (const img of images) img.hidden = img.dataset.pose !== file;
  }
  const size = () => ({ w: character.offsetWidth, h: character.offsetHeight });
  /** The panel's offset from the character on a side. */
  function offsetOn(/** @type {string} */ s) {
    const c = size(), w = panel.offsetWidth, h = panel.offsetHeight;
    return { below: { x: c.w / 2 - w / 2, y: c.h + 4 }, above: { x: c.w / 2 - w / 2, y: -h - 4 },
      right: { x: c.w - 6, y: c.h * 0.5 }, left: { x: 6 - w, y: c.h * 0.5 } }[s];
  }
  /** The panel's offset for a unit at `p`: the current side while the panel fits the area there, else the first
   * side that fits and keeps clear of `avoid` (the target), else the first that fits; slid along that side to stay in. */
  function layout(/** @type {Point} */ p, /** @type {Area} */ a, /** @type {DOMRect|null|undefined} */ avoid) {
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const box = (/** @type {string} */ s) => { const o = offsetOn(s); return { x: p.x + o.x, y: p.y + o.y }; };
    // A panel below or above fits if there is the height for it, beside if there is the width: along its edge it slides.
    const fits = (/** @type {string} */ s) => {
      const b = box(s);
      return s === 'below' || s === 'above' ? b.y >= a.top + GAP && b.y + h <= a.top + a.height - GAP : b.x >= a.left + GAP && b.x + w <= a.left + a.width - GAP;
    };
    const clear = (/** @type {string} */ s) => { const b = box(s); return !avoid || b.x >= avoid.right || b.x + w <= avoid.left || b.y >= avoid.bottom || b.y + h <= avoid.top; };
    const order = sidesNow();
    if (fresh || !order.includes(side) || !fits(side)) side = order.find((s) => fits(s) && clear(s)) ?? order.find(fits) ?? order[0];
    const b = box(side);
    return { x: clamp(b.x, a.left + GAP, a.left + a.width - GAP - w) - p.x, y: clamp(b.y, a.top + GAP, a.top + a.height - GAP - h) - p.y };
  }
  /** Keeps the whole unit, character and panel, inside the area. */
  function within(/** @type {Point} */ p, /** @type {Area} */ a) {
    const c = size(), w = panel.offsetWidth, h = panel.offsetHeight;
    const x0 = Math.min(0, off.x), x1 = Math.max(c.w, off.x + w), y0 = Math.min(0, off.y), y1 = Math.max(c.h, off.y + h);
    return { x: clamp(p.x, a.left + GAP - x0, a.left + a.width - GAP - x1), y: clamp(p.y, a.top + GAP - y0, a.top + a.height - GAP - y1) };
  }
  /** Moves the unit to `p` with the panel at offset `o`, gliding both along one eased path unless told not to. */
  function go(/** @type {Point} */ p, /** @type {Point} */ o, /** @type {boolean} */ glide) {
    p = { x: Math.round(p.x), y: Math.round(p.y) };
    o = { x: Math.round(o.x), y: Math.round(o.y) };
    if (p.x === at.x && p.y === at.y && o.x === off.x && o.y === off.y) return;
    const from = shown(unit), fromOff = shown(panel);
    moving?.cancel();
    sliding?.cancel();
    moving = sliding = null;
    at = p;
    off = o;
    unit.style.transform = translate(p);
    panel.style.transform = translate(o);
    const d = Math.hypot(p.x - from.x, p.y - from.y), dOff = Math.hypot(o.x - fromOff.x, o.y - fromOff.y);
    if (!glide || reduced.matches || (d < 1 && dOff < 1)) { showPose(rest); return; }
    const timing = { duration: Math.min(900, 350 + 0.45 * Math.max(d, dOff)), easing: EASE };
    if (dOff >= 1) sliding = panel.animate([{ transform: translate(fromOff) }, { transform: translate(o) }], timing);
    if (d >= 1) {
      const run = moving = unit.animate([{ transform: translate(from) }, { transform: translate(p) }], timing);
      if (d > 24) showPose('leap');
      run.finished.then(() => { if (moving === run) { moving = null; showPose(rest); } }, () => {});
    }
  }
  function pin(/** @type {Point} */ p) {
    const a = area();
    const q = within(p, a);
    pinned = { x: q.x - a.left, y: q.y - a.top };
    go(q, off, false);
    snap.hidden = false;
    unit.classList.add('tour-pinned');
  }

  // Dragging by the panel's header moves the whole unit; buttons in it other than the grip keep their clicks.
  head.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || /** @type {HTMLElement} */ (event.target).closest('button:not(.tour-grip), a')) return;
    event.preventDefault();
    head.setPointerCapture(event.pointerId);
    const start = { x: event.clientX, y: event.clientY, at: shown(unit) };
    let moved = false;
    const move = (/** @type {PointerEvent} */ e) => {
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 3) return;
      moved = true;
      unit.classList.add('tour-dragging');
      pin({ x: start.at.x + e.clientX - start.x, y: start.at.y + e.clientY - start.y });
    };
    const done = () => {
      unit.classList.remove('tour-dragging');
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', done);
      head.removeEventListener('pointercancel', done);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', done);
    head.addEventListener('pointercancel', done);
  });
  // The keyboard's way to move it: arrows on the grip (the tour's own arrow keys do not see these).
  grip.addEventListener('keydown', (event) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!d) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 64 : 16;
    pin({ x: at.x + d[0] * step, y: at.y + d[1] * step });
  });
  snap.addEventListener('click', () => {
    pinned = null;
    snap.hidden = true;
    unit.classList.remove('tour-pinned');
    if (home) guide.moveTo(home.x, home.y, { area: home.area, avoid: home.avoid });
    grip.focus({ preventScroll: true });
  });
  back.addEventListener('click', onBack);
  next.addEventListener('click', onNext);
  end.addEventListener('click', onEnd);
  replay.addEventListener('click', onReplay);

  let leaving = /** @type {Animation|null} */ (null);
  const guide = {
    unit, character, panel,
    /** The step's content goes here. */
    body: $('.tour-panel-body'),
    /** For a demo's own header controls. */
    head,
    /** Step label and buttons: Back off on the first step, Next off on the last, which offers Replay and Done instead
     * of End tour. Next is the primary button once the step is done or asks for nothing. */
    update({ index, total, ready }) {
      const last = index === total - 1;
      stepLabel.textContent = `Step ${index + 1} of ${total}`;
      back.disabled = index === 0;
      next.disabled = last;
      next.classList.toggle('primary', ready && !last);
      replay.hidden = !last;
      end.textContent = last ? 'Done' : 'End tour';
      end.classList.toggle('primary', last);
    },
    /**
     * Where the character should stand (its box's top-left corner); the panel hangs beside it. While the visitor has
     * the unit pinned, it stays at their place on screen instead.
     * @param {number} x @param {number} y
     * @param {{area?: Area, avoid?: DOMRect|null, glide?: boolean}} [options] area: the visible box (default
     *   `area()`); avoid: the target, which the panel keeps clear of when it changes side
     */
    moveTo(x, y, { area: a = area(), avoid = null, glide = true } = {}) {
      home = { x, y, area: a, avoid };
      const p = pinned ? within({ x: a.left + pinned.x, y: a.top + pinned.y }, a) : { x, y };
      go(p, layout(p, a, avoid), glide && !fresh);
      fresh = false;
    },
    /** The pose between moves (see poseFor). */
    pose(/** @type {string} */ name) {
      rest = name;
      if (!moving) showPose(name);
    },
    /** Eases in (at once under reduced motion). */
    show() {
      leaving?.cancel();
      leaving = null;
      if (!unit.hidden) return;
      unit.hidden = false;
      fresh = true;
      if (!reduced.matches) unit.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    },
    /** Eases out, then hides (at once under reduced motion); resolves when done, or when shown again first. */
    hide() {
      moving?.cancel();
      sliding?.cancel();
      if (unit.hidden || leaving) return leaving?.finished.then(() => {}, () => {}) ?? Promise.resolve();
      if (reduced.matches) { unit.hidden = true; return Promise.resolve(); }
      const fade = leaving = unit.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
      return fade.finished.then(() => {
        unit.hidden = true;
        fade.cancel();
        leaving = null;
      }, () => {});
    },
    get pinned() { return !!pinned; },
    get currentPose() { return pose; },
    get side() { return side; },
  };
  return guide;
}

/** Which pose a moment of the tour calls for between moves: the visitor has done the step, hello and goodbye, a step
 * waiting for the visitor, or nothing to do. (While the guide travels, it shows `leap`.) */
export function poseFor({ done = false, first = false, last = false, task = false }) {
  if (done) return 'happy';
  if (first || last) return 'wave';
  return task ? 'point' : 'idle';
}
