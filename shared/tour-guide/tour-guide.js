// What the site's guided demo tours share (Agent Bar's Biscuit, ROTA's Pip): the tour panel and the guide character.
//
// The panel is the card of text with Back and Next. It glides from one step's place to the next (the motion shows
// where the tour went; under reduced motion it is placed at once), eases in when the tour starts and out when it
// ends. The visitor can drag it by its header, with a mouse, pen or finger, or focus the grip and use the arrow
// keys (Shift for bigger steps); once moved, it stays where they put it for the following steps until Snap back.
//
// The character is one image per pose, listed in the demo's guide/manifest.js; the poses and the canvas they share
// are described in shared/tour-guide/POSES.md. A pose the manifest leaves out shows `idle`.

const GAP = 8;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

/**
 * @param {HTMLElement} panel an empty element, absolutely positioned in its container (or fixed in the viewport)
 * @param {{area: () => {width: number, height: number}, label?: string,
 *   onBack: () => void, onNext: () => void, onEnd: () => void, onReplay: () => void}} options
 *   area: the box the panel stays inside, in the panel's own coordinates
 */
export function createTourPanel(panel, { area, label = 'Tour', onBack, onNext, onEnd, onReplay }) {
  panel.classList.add('tour-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', label);
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.innerHTML = `<div class="tour-panel-head">
  <button type="button" class="tour-grip" aria-label="Move the tour panel" aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" title="Drag to move this panel, or use the arrow keys here"><span aria-hidden="true">⠿</span></button>
  <p class="tour-panel-step"></p>
  <button type="button" class="tour-snap" hidden title="Put the panel back beside the guide"><span aria-hidden="true">↩</span> Snap back</button>
</div>
<div class="tour-panel-body" aria-live="polite"></div>
<div class="tour-panel-nav">
  <button type="button" data-tour="back">← Back</button>
  <button type="button" data-tour="next">Next →</button>
  <span class="tour-panel-gap"></span>
  <button type="button" data-tour="replay" hidden>↺ Replay</button>
  <button type="button" data-tour="end">End tour</button>
</div>`;
  const $ = (/** @type {string} */ s) => /** @type {HTMLElement} */ (panel.querySelector(s));
  const head = $('.tour-panel-head'), grip = $('.tour-grip'), snap = $('.tour-snap'), stepLabel = $('.tour-panel-step');
  const back = /** @type {HTMLButtonElement} */ ($('[data-tour="back"]')), next = /** @type {HTMLButtonElement} */ ($('[data-tour="next"]'));
  const replay = $('[data-tour="replay"]'), end = $('[data-tour="end"]');

  let at = { x: GAP, y: GAP };              // where the panel is
  let home = { x: GAP, y: GAP };            // where the tour puts it for this step
  let pinned = /** @type {{x: number, y: number}|null} */ (null); // where the visitor put it
  let fresh = true;                         // just shown: the first placement does not glide

  /** Inside the area, whole pixels. */
  function clamp({ x, y }) {
    const { width, height } = area();
    return { x: Math.round(Math.max(GAP, Math.min(width - panel.offsetWidth - GAP, x))), y: Math.round(Math.max(GAP, Math.min(height - panel.offsetHeight - GAP, y))) };
  }
  function put(p, glide) {
    at = clamp(p);
    if (!glide) panel.classList.add('tour-panel-still');
    panel.style.transform = `translate(${at.x}px, ${at.y}px)`;
    if (!glide) {
      void panel.offsetWidth; // apply the jump before gliding is allowed again
      panel.classList.remove('tour-panel-still');
    }
  }
  function pin(p) {
    pinned = clamp(p);
    put(pinned, false);
    snap.hidden = false;
    panel.classList.add('tour-panel-pinned');
  }

  // Dragging by the header; buttons in it other than the grip keep their clicks.
  head.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || /** @type {HTMLElement} */ (event.target).closest('button:not(.tour-grip), a')) return;
    event.preventDefault();
    head.setPointerCapture(event.pointerId);
    const from = { x: event.clientX - at.x, y: event.clientY - at.y, cx: event.clientX, cy: event.clientY };
    let moved = false;
    const move = (/** @type {PointerEvent} */ e) => {
      if (!moved && Math.hypot(e.clientX - from.cx, e.clientY - from.cy) < 3) return;
      moved = true;
      panel.classList.add('tour-panel-dragging');
      pin({ x: e.clientX - from.x, y: e.clientY - from.y });
    };
    const done = () => {
      panel.classList.remove('tour-panel-dragging');
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
    panel.classList.remove('tour-panel-pinned');
    put(home, !reduced.matches);
    grip.focus({ preventScroll: true });
  });
  back.addEventListener('click', onBack);
  next.addEventListener('click', onNext);
  end.addEventListener('click', onEnd);
  replay.addEventListener('click', onReplay);

  let leaving = /** @type {Animation|null} */ (null);
  return {
    panel,
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
    /** Where the tour would put the panel now; while the visitor has it pinned, it only stays inside the area. */
    place(x, y, { glide = true } = {}) {
      home = { x, y };
      put(pinned ?? home, glide && !fresh && !reduced.matches);
      fresh = false;
    },
    /** Eases in (at once under reduced motion). */
    show() {
      leaving?.cancel();
      leaving = null;
      if (!panel.hidden) return;
      panel.hidden = false;
      fresh = true;
      if (!reduced.matches) panel.animate([{ opacity: 0, scale: '0.96' }, { opacity: 1, scale: '1' }], { duration: 220, easing: 'cubic-bezier(.2, 0, .2, 1)' });
    },
    /** Eases out, then hides (at once under reduced motion); resolves when done, or when shown again first. */
    hide() {
      if (panel.hidden || leaving) return leaving?.finished.then(() => {}, () => {}) ?? Promise.resolve();
      if (reduced.matches) { panel.hidden = true; return Promise.resolve(); }
      const fade = leaving = panel.animate([{ opacity: 1, scale: '1' }, { opacity: 0, scale: '0.96' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
      return fade.finished.then(() => {
        panel.hidden = true;
        fade.cancel();
        leaving = null;
      }, () => {});
    },
    get pinned() { return !!pinned; },
  };
}

/** Which pose a moment of the tour calls for: travelling, the visitor has done the step, hello and goodbye, a step
 * waiting for the visitor, or nothing to do. */
export function poseFor({ moving = false, done = false, first = false, last = false, task = false }) {
  if (moving) return 'leap';
  if (done) return 'happy';
  if (first || last) return 'wave';
  return task ? 'point' : 'idle';
}

/**
 * The guide's poses as images in `el`, one shown at a time.
 * @param {HTMLElement} el @param {{poses: Record<string, string>}} art a guide/manifest.js
 */
export function createCharacter(el, art) {
  el.insertAdjacentHTML('afterbegin', Object.entries(art.poses).map(([pose, src]) =>
    `<img class="tour-pose" data-pose="${pose}" src="${src}" alt="" draggable="false"${pose === 'idle' ? '' : ' hidden'}>`).join(''));
  const images = /** @type {HTMLImageElement[]} */ ([...el.querySelectorAll('img.tour-pose')]);
  let current = 'idle';
  return {
    /** @param {string} pose */
    set(pose) {
      current = pose;
      const shown = pose in art.poses ? pose : 'idle';
      for (const img of images) img.hidden = img.dataset.pose !== shown;
    },
    get pose() { return current; },
  };
}
