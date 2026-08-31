// Drag bars on the edges of the focused face, for setting margins and the column
// gap by eye rather than by typing points.
//
// Dragging shows a live guide and a readout but does not re-solve: a full solve
// takes a few hundred milliseconds, so doing it per pointer event would feel
// broken. The geometry is committed on release, which is also when it can be
// clamped against the printer's safe area.

import { contentBox } from '../core/solve/index.js';

/** Smallest margin worth offering; the printer's own limit is applied on top. */
const MIN_MARGIN_PT = 2;
const MIN_GAP_PT = 0;
const MAX_GAP_PT = 24;

/**
 * @typedef {Object} HandleInput
 * @property {HTMLElement} face      the focused `.face` element
 * @property {import('../core/types.js').SheetSpec} spec
 * @property {(geometry:import('../core/types.js').Geometry)=>void} onCommit
 */

/**
 * Add margin and column-gap handles to a face. Returns a teardown function.
 * @param {HandleInput} input
 */
export function attachHandles({ face, spec, onCommit }) {
  const box = contentBox(spec.geometry, spec.paper);
  const layer = document.createElement('div');
  layer.className = 'handle-layer';

  const readout = document.createElement('div');
  readout.className = 'handle-readout';
  readout.hidden = true;
  layer.append(readout);

  /** Points per rendered pixel, so a drag in screen space lands in page space. */
  const ptPerPx = () => spec.geometry.pageW / (face.getBoundingClientRect().width || 1);

  /**
   * @param {'marginLeft'|'marginRight'|'marginTop'|'marginBottom'|'columnGap'} kind
   * @param {{left?:number, top?:number, width?:number, height?:number}} style
   * @param {string} title
   */
  function add(kind, style, title) {
    const grip = document.createElement('div');
    const vertical = kind === 'marginTop' || kind === 'marginBottom';
    grip.className = `handle ${vertical ? 'horizontal' : 'vertical'}`;
    grip.title = title;
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-label', title);
    if (style.left !== undefined) grip.style.left = `${(style.left / spec.geometry.pageW) * 100}%`;
    if (style.top !== undefined) grip.style.top = `${(style.top / spec.geometry.pageH) * 100}%`;
    layer.append(grip);

    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const start = kind === 'columnGap' ? spec.geometry.columnGap : spec.geometry[kind];
      let value = start;

      /** @param {PointerEvent} move */
      const onMove = (move) => {
        const scale = ptPerPx();
        const dx = (move.clientX - startX) * scale;
        const dy = (move.clientY - startY) * scale;
        // Right and bottom margins grow as the handle moves inward.
        const delta = kind === 'marginRight' ? -dx
          : kind === 'marginBottom' ? -dy
            : vertical ? dy : dx;
        const max = vertical ? spec.geometry.pageH / 3 : spec.geometry.pageW / 3;
        value = kind === 'columnGap'
          ? Math.min(MAX_GAP_PT, Math.max(MIN_GAP_PT, start + delta))
          : Math.min(max, Math.max(MIN_MARGIN_PT, start + delta));
        grip.classList.add('dragging');
        readout.hidden = false;
        readout.textContent = `${title}: ${(value / 72).toFixed(3)}in (${value.toFixed(1)}pt)`;
        const offset = kind === 'marginRight' ? spec.geometry.pageW - value
          : kind === 'marginBottom' ? spec.geometry.pageH - value
            : value;
        if (vertical) grip.style.top = `${(offset / spec.geometry.pageH) * 100}%`;
        else grip.style.left = `${(offset / spec.geometry.pageW) * 100}%`;
      };

      const onUp = () => {
        grip.removeEventListener('pointermove', onMove);
        grip.classList.remove('dragging');
        readout.hidden = true;
        if (Math.abs(value - start) > 0.05) {
          onCommit({ ...spec.geometry, [kind]: Number(value.toFixed(2)) });
        }
      };

      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', onUp, { once: true });
      grip.addEventListener('pointercancel', onUp, { once: true });
    });
  }

  add('marginLeft', { left: box.left }, 'Left margin');
  add('marginRight', { left: spec.geometry.pageW - spec.geometry.marginRight }, 'Right margin');
  add('marginTop', { top: box.top }, 'Top margin');
  add('marginBottom', { top: spec.geometry.pageH - spec.geometry.marginBottom }, 'Bottom margin');
  if (spec.geometry.columns > 1) {
    add('columnGap', { left: box.left + box.colWidth + spec.geometry.columnGap / 2 }, 'Column gap');
  }

  face.append(layer);
  return () => layer.remove();
}
