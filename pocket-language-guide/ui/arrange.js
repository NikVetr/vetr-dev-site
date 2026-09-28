// A screen's buttons in the reader's own order, put there by dragging them.
//
// The board's order is its author's, and someone who keeps "no peanuts" in the top
// corner should find it there -- so the order is theirs to set, by the most direct
// means there is: picking a button up and putting it where it goes. The others move
// aside to show where it will land, which is the one place motion here is the
// feature; with reduced motion asked for, they jump. The arrow keys do the same for
// a keyboard, one place at a time. A button dropped on the bin in the bar, or given
// Delete, is taken off the screen.

/** @param {string} tag @param {Record<string,string>} attrs */
function el(tag, attrs = {}) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  return node;
}

/**
 * Where a cell sits in the grid's layout, whatever slide it is in the middle of: a
 * target found where the cells were drawn flickered between two as they moved.
 * @param {HTMLElement} cell
 */
function slot(cell) {
  const parent = /** @type {HTMLElement} */ (cell.offsetParent);
  const box = parent.getBoundingClientRect();
  const left = box.left + parent.clientLeft - parent.scrollLeft + cell.offsetLeft;
  const top = box.top + parent.clientTop - parent.scrollTop + cell.offsetTop;
  return { left, top, right: left + cell.offsetWidth, bottom: top + cell.offsetHeight };
}

/** Earlier or later in the grid, by key; the grid's own direction does not change it. */
const STEP = /** @type {Record<string, number>} */ ({ ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 });

/**
 * Let the reader rearrange a grid's buttons until they press Done, or Escape to leave it
 * as it was. The cell that makes something new is not moved and stays last. While
 * rearranging, a press only picks a button up: nothing is said, and a hold clears no
 * detail. The bar holds the bin and Done, and the status line says what to do. A
 * button taken off is gone from the grid at once and from the screen on Done --
 * Escape brings it back with the order -- once `onRemove` has agreed to it.
 * @param {HTMLElement} grid  its cells carry `data-button`
 * @param {{bar: HTMLElement, status: HTMLElement, done: string, hint: string, bin: string,
 *   onRemove: (cell: HTMLElement) => Promise<boolean>,
 *   onDone: (ids: string[], removed: string[]) => void, onCancel: () => void}} config
 */
export function arrange(grid, { bar, status, done, hint, bin, onRemove, onDone, onCancel }) {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cells = () => /** @type {HTMLElement[]} */ ([...grid.querySelectorAll('[data-button]:not(.board-cell-add)')]);
  const maker = grid.querySelector('.board-cell-add');
  const said = status.textContent;
  status.textContent = hint;
  grid.classList.add('board-grid-arranging');
  bar.classList.add('board-bar-arranging');
  const trash = el('div', { class: 'board-arrange-bin' });
  trash.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  trash.append(el('span', { text: bin }));
  const finish = el('button', { type: 'button', class: 'btn primary board-arrange-done', text: done });
  bar.append(trash, finish);
  /** @type {string[]} */ const removed = [];
  /** @param {PointerEvent} event */
  const onBin = (event) => {
    const r = trash.getBoundingClientRect();
    return event.clientX >= r.left && event.clientX < r.right && event.clientY >= r.top && event.clientY < r.bottom;
  };
  /** Off the grid if `onRemove` agrees, and whether it went. @param {HTMLElement} cell */
  const take = async (cell) => {
    if (!(await onRemove(cell))) return false;
    removed.push(/** @type {string} */ (cell.dataset.button));
    cell.remove();
    return true;
  };

  /**
   * Put `cell` before `before` -- or last among the movable ones -- and let the others
   * slide from where they were to where they are now.
   * @param {HTMLElement} cell @param {Element|null} before
   */
  const place = (cell, before) => {
    const others = cells().filter((c) => c !== cell);
    const was = new Map(others.map((c) => [c, c.getBoundingClientRect()]));
    grid.insertBefore(cell, before ?? maker);
    if (calm) return;
    for (const c of others) {
      const from = /** @type {DOMRect} */ (was.get(c));
      const to = c.getBoundingClientRect();
      if (from.left === to.left && from.top === to.top) continue;
      c.style.transition = 'none';
      c.style.translate = `${from.left - to.left}px ${from.top - to.top}px`;
      requestAnimationFrame(() => {
        c.style.transition = 'translate 160ms ease-out';
        c.style.translate = '';
      });
    }
  };

  /** @type {{cell: HTMLElement, x: number, y: number}|null} */ let held = null;

  /** @param {PointerEvent} event */
  const down = (event) => {
    // Captured before the cell's own handlers, so a press here starts no hold.
    event.stopPropagation();
    const cell = /** @type {HTMLElement|null} */ ((/** @type {Element} */ (event.target)).closest('[data-button]'));
    if (!cell || cell === maker || event.button !== 0) return;
    event.preventDefault();
    const box = cell.getBoundingClientRect();
    held = { cell, x: event.clientX - box.left, y: event.clientY - box.top };
    cell.setPointerCapture(event.pointerId);
    cell.classList.add('board-cell-lifted');
  };
  /** @param {PointerEvent} event */
  const move = (event) => {
    if (!held) return;
    const { cell } = held;
    // Measured where the grid puts it, so it stays under the finger as it changes place.
    cell.style.transition = 'none';
    cell.style.translate = '';
    const list = cells();
    const under = list.find((c) => {
      const s = slot(c);
      return c !== cell && event.clientX >= s.left && event.clientX < s.right
        && event.clientY >= s.top && event.clientY < s.bottom;
    });
    if (under) place(cell, list.indexOf(under) > list.indexOf(cell) ? under.nextElementSibling : under);
    const home = cell.getBoundingClientRect();
    cell.style.translate = `${event.clientX - held.x - home.left}px ${event.clientY - held.y - home.top}px`;
    trash.classList.toggle('board-arrange-bin-over', onBin(event));
  };
  /** @param {PointerEvent} [event] */
  const up = async (event) => {
    if (!held) return;
    const { cell } = held;
    held = null;
    trash.classList.remove('board-arrange-bin-over');
    cell.classList.remove('board-cell-lifted');
    if (event && onBin(event) && await take(cell)) return;
    cell.style.transition = calm ? 'none' : 'translate 160ms ease-out';
    cell.style.translate = '';
  };
  /** @param {KeyboardEvent} event */
  const key = (event) => {
    // A question about removing a button is answered in its own dialog, Escape included.
    if (document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); end(false); return; }
    const cell = /** @type {HTMLElement|null} */ ((/** @type {Element} */ (event.target)).closest?.('[data-button]'));
    if (cell && cell !== maker && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      const next = /** @type {HTMLElement|null} */ (cell.nextElementSibling ?? cell.previousElementSibling);
      take(cell).then((gone) => { if (gone) next?.focus(); else cell.focus(); });
      return;
    }
    const step = STEP[event.key];
    if (!cell || cell === maker || !step) return;
    event.preventDefault();
    const list = cells();
    const to = list.indexOf(cell) + step;
    if (to < 0 || to >= list.length) return;
    place(cell, step < 0 ? list[to] : list[to].nextElementSibling);
    cell.focus();
  };
  /** A press only picks a button up here: nothing is said. @param {Event} event */
  const swallow = (event) => { event.stopPropagation(); event.preventDefault(); };

  const cancel = () => up();
  grid.addEventListener('pointerdown', down, true);
  grid.addEventListener('pointermove', move);
  grid.addEventListener('pointerup', up);
  grid.addEventListener('pointercancel', cancel);
  grid.addEventListener('click', swallow, true);
  grid.addEventListener('contextmenu', swallow, true);
  document.addEventListener('keydown', key, true);

  /** @param {boolean} keep */
  function end(keep) {
    grid.removeEventListener('pointerdown', down, true);
    grid.removeEventListener('pointermove', move);
    grid.removeEventListener('pointerup', up);
    grid.removeEventListener('pointercancel', cancel);
    grid.removeEventListener('click', swallow, true);
    grid.removeEventListener('contextmenu', swallow, true);
    document.removeEventListener('keydown', key, true);
    grid.classList.remove('board-grid-arranging');
    bar.classList.remove('board-bar-arranging');
    finish.remove();
    trash.remove();
    status.textContent = said;
    const ids = cells().map((c) => /** @type {string} */ (c.dataset.button));
    if (keep) onDone(ids, removed);
    else onCancel();
  }
  finish.addEventListener('click', () => end(true));
  cells()[0]?.focus();
}
