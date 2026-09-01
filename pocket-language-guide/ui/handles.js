// Drag bars on the edges of the focused face, for setting margins and the column
// gap by eye rather than by typing points.
//
// Dragging shows a live guide and a readout but does not re-solve: a full solve
// takes a few hundred milliseconds, so doing it per pointer event would feel
// broken. The geometry is committed on release, which is also when it can be
// clamped against the printer's safe area.
//
// Every column is the same width, so the only thing a gutter can be dragged to
// change is the gutter itself -- and because the content box is fixed, widening a
// gutter narrows every column. The readout says so, since "column gap 6pt" alone
// does not make it obvious that the text is being reflowed.

import { contentBox } from '../core/solve/index.js';
import { t } from './i18n.js';

/** Smallest margin worth offering; the printer's own limit is applied on top. */
const MIN_MARGIN_PT = 2;
const MIN_GAP_PT = 0;
const MAX_GAP_PT = 24;

/** @typedef {'marginLeft'|'marginRight'|'marginTop'|'marginBottom'|'columnGap'} HandleKind */

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
  const g = spec.geometry;
  const layer = document.createElement('div');
  layer.className = 'handle-layer';

  const readout = document.createElement('div');
  readout.className = 'handle-readout';
  readout.hidden = true;
  layer.append(readout);

  /** Points per rendered pixel, so a drag in screen space lands in page space. */
  const ptPerPx = () => g.pageW / (face.getBoundingClientRect().width || 1);

  /** Content box for a candidate geometry, so handle positions follow the value. */
  const boxFor = (/** @type {Partial<import('../core/types.js').Geometry>} */ over) => contentBox(
    { ...g, ...over }, spec.paper,
  );

  /**
   * Where a handle sits, in points along its axis, for a given value.
   * @param {HandleKind} kind @param {number} value @param {number} gutter
   */
  function offsetFor(kind, value, gutter = 0) {
    if (kind === 'marginLeft') return boxFor({ marginLeft: value }).left;
    if (kind === 'marginRight') return g.pageW - value;
    if (kind === 'marginTop') return boxFor({ marginTop: value }).top;
    if (kind === 'marginBottom') return g.pageH - value;
    // Centre of the nth gutter, which moves as the gap changes because the
    // columns either side of it narrow.
    const box = boxFor({ columnGap: value });
    return box.left + (gutter + 1) * box.colWidth + gutter * value + value / 2;
  }

  // Snap every handle back to the committed geometry, and -- for the gutters --
  // move them together while one of them is being dragged, since they all show the
  // same single gap value.
  /** @type {(()=>void)[]} */ const refreshers = [];
  /** @type {((value:number)=>void)[]} */ const gutterPlacers = [];

  /**
   * @param {HandleKind} kind @param {string} title
   * @param {number} [gutter] which gutter this handle sits in, for columnGap
   */
  function add(kind, title, gutter = 0) {
    const grip = document.createElement('div');
    const vertical = kind === 'marginTop' || kind === 'marginBottom';
    grip.className = `handle ${vertical ? 'horizontal' : 'vertical'}`;
    grip.title = title;
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-label', title);
    layer.append(grip);

    const current = () => (kind === 'columnGap' ? g.columnGap : g[kind]);
    /** @param {number} value */
    const place = (value) => {
      const offset = offsetFor(kind, value, gutter);
      if (vertical) grip.style.top = `${(offset / g.pageH) * 100}%`;
      else grip.style.left = `${(offset / g.pageW) * 100}%`;
    };
    place(current());
    refreshers.push(() => place(current()));
    if (kind === 'columnGap') gutterPlacers.push(place);

    grip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      grip.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const start = current();
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
        const max = vertical ? g.pageH / 3 : g.pageW / 3;
        value = kind === 'columnGap'
          ? Math.min(MAX_GAP_PT, Math.max(MIN_GAP_PT, start + delta))
          : Math.min(max, Math.max(MIN_MARGIN_PT, start + delta));

        grip.classList.add('dragging');
        readout.hidden = false;
        readout.textContent = kind === 'columnGap'
          // What the reader cares about is not the gutter but what it does to the
          // columns, so say both.
          ? t('handles.gapReadout', {
            gap: value.toFixed(1),
            width: boxFor({ columnGap: value }).colWidth.toFixed(1),
          })
          : t('handles.marginReadout', {
            name: title, inches: (value / 72).toFixed(3), points: value.toFixed(1),
          });
        if (kind === 'columnGap') {
          for (const placeGutter of gutterPlacers) placeGutter(value);
        } else {
          place(value);
        }
      };

      const onUp = () => {
        grip.removeEventListener('pointermove', onMove);
        grip.classList.remove('dragging');
        readout.hidden = true;
        if (Math.abs(value - start) > 0.05) {
          onCommit({ ...g, [kind]: Number(value.toFixed(2)) });
        } else {
          for (const refresh of refreshers) refresh();
        }
      };

      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', onUp, { once: true });
      grip.addEventListener('pointercancel', onUp, { once: true });
    });

    return grip;
  }

  add('marginLeft', t('handles.marginLeft'));
  add('marginRight', t('handles.marginRight'));
  add('marginTop', t('handles.marginTop'));
  add('marginBottom', t('handles.marginBottom'));
  // One bar per gutter, because a single bar at the first gutter reads as an
  // arbitrary line rather than as the thing that sets every gutter.
  for (let i = 0; i < g.columns - 1; i += 1) add('columnGap', t('handles.columnGap'), i);

  face.append(layer);
  return () => layer.remove();
}
