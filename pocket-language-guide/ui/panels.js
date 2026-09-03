// Drag the seams between the studio's three panels.
//
// The widths were a fixed 1 : 2.5 : 1.5 grid, which is a reasonable guess and
// wrong for anyone whose work is mostly in one panel: someone working down the
// content list wants it wide, someone dragging margins wants the canvas wide. The
// grid keeps its ratios as the default and a drag replaces one side column's track
// with an explicit width, so the canvas still absorbs the remainder.
//
// Persisted, because a width you have to set on every visit is worse than a width
// you cannot set.

const KEY = 'plg.studio-cols';
/** Below this the panel is too narrow for its own controls -- see `style.css`. */
const MIN = 250;
/** Leave the canvas at least this much, or the sheet becomes unreadable. */
const CANVAS_MIN = 320;

/**
 * @param {HTMLElement} studio
 * @param {{ handle: HTMLElement, panel: HTMLElement, prop: string, sign: 1|-1 }[]} seams
 */
function attach(studio, seams) {
  /** @type {Record<string, number>} */
  let held = {};
  try {
    held = JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    // A corrupt value is the same as none: fall back to the CSS ratios.
  }
  for (const seam of seams) {
    if (held[seam.prop]) studio.style.setProperty(seam.prop, `${held[seam.prop]}px`);
  }

  const save = () => localStorage.setItem(KEY, JSON.stringify(held));

  for (const seam of seams) {
    /** @param {number} width */
    const set = (width) => {
      const others = seams
        .filter((s) => s !== seam)
        .reduce((sum, s) => sum + s.panel.getBoundingClientRect().width, 0);
      const room = studio.getBoundingClientRect().width - others - CANVAS_MIN;
      const next = Math.round(Math.min(Math.max(width, MIN), Math.max(MIN, room)));
      held[seam.prop] = next;
      studio.style.setProperty(seam.prop, `${next}px`);
    };

    seam.handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      seam.handle.setPointerCapture(event.pointerId);
      seam.handle.classList.add('dragging');
      const startX = event.clientX;
      const startW = seam.panel.getBoundingClientRect().width;

      /** @param {PointerEvent} move */
      const onMove = (move) => set(startW + (move.clientX - startX) * seam.sign);
      const onUp = () => {
        seam.handle.classList.remove('dragging');
        seam.handle.removeEventListener('pointermove', onMove);
        seam.handle.removeEventListener('pointerup', onUp);
        save();
      };
      seam.handle.addEventListener('pointermove', onMove);
      seam.handle.addEventListener('pointerup', onUp);
    });

    // A seam is a separator, so the arrow keys are its documented control.
    seam.handle.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0;
      if (!step) return;
      event.preventDefault();
      set(seam.panel.getBoundingClientRect().width + step * seam.sign);
      save();
    });
  }
}

/** @param {HTMLElement} studio */
export function attachPanelResizers(studio) {
  const sections = [...studio.querySelectorAll(':scope > section')];
  const format = /** @type {HTMLElement|null} */ (sections[0]);
  const content = /** @type {HTMLElement|null} */ (sections[sections.length - 1]);
  const left = /** @type {HTMLElement|null} */ (document.getElementById('resize-format'));
  const right = /** @type {HTMLElement|null} */ (document.getElementById('resize-content'));
  if (!format || !content || !left || !right) return;
  attach(studio, [
    { handle: left, panel: format, prop: '--col-format', sign: 1 },
    { handle: right, panel: content, prop: '--col-content', sign: -1 },
  ]);
}
