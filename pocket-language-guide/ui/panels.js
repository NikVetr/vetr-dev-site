import * as store from './platform/store.js';
// The studio's panel chrome: the seams between them on a desktop, and on a phone a
// header that fits and a bar on each panel that folds it away.
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
    held = JSON.parse(store.get(KEY) ?? '{}');
  } catch {
    // A corrupt value is the same as none: fall back to the CSS ratios.
  }
  for (const seam of seams) {
    if (held[seam.prop]) studio.style.setProperty(seam.prop, `${held[seam.prop]}px`);
  }

  const save = () => store.set(KEY, JSON.stringify(held));

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
      // Visual keys on a visual control: right always moves the seam right, and
      // `sign` already carries which panel that grows in this direction.
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
  // Which way a drag grows a panel depends on which side of it the seam sits, and
  // for a reader of Arabic the settings panel is the *right* one -- the grid is
  // laid out in logical order, so it mirrors. Without this, dragging a seam moved
  // it away from the pointer.
  const dir = /** @type {1|-1} */ (document.documentElement.dir === 'rtl' ? -1 : 1);
  attach(studio, [
    { handle: left, panel: format, prop: '--col-format', sign: dir },
    { handle: right, panel: content, prop: '--col-content', sign: /** @type {1|-1} */ (-dir) },
  ]);
}

/* --- the phone's chrome -------------------------------------------------- */

// Below 700px the studio is not three panels side by side, it is a page: the card,
// then two long lists that scroll inside themselves. Two things about that width are
// not the desktop's problem, and both are built here rather than in the markup,
// because the markup has to stay the desktop's.
//
// The header was four rows and 156px of an 844pt phone -- permanently, being sticky.
// So everything but the primary action moves into one disclosure, and moves back out
// above the breakpoint. Moved, not duplicated: a second Quiz button would be a second
// thing to wire up and a second thing to forget.
//
// And each of the two panels gets its own title as a bar that folds it away, with a
// fade at its foot while there is more below the cut.

/** @param {Element} section */
const bodyOf = (section) => (
  /** @type {HTMLElement|null} */ (section.querySelector(':scope > .panel-body')));

/**
 * Everything in the header but the brand, the info line and Export PDF, in one
 * disclosure.
 *
 * Export PDF stays out of it on purpose: it is what the page is for, and a menu in
 * front of the primary action is a real cost where the other four are one tap either
 * way. Dismissal follows `ui/item-popup.js` -- Escape, a pointer outside, and focus
 * handed back rather than left on something that is no longer rendered.
 * @returns {() => void} puts the header back
 */
function headerMenu() {
  const toggle = /** @type {HTMLElement|null} */ (document.getElementById('header-more'));
  const menu = /** @type {HTMLElement|null} */ (document.getElementById('header-menu'));
  if (!toggle || !menu) return () => {};

  const moved = [...document.querySelectorAll(
    '.site-header #banner, .site-header #drill-open, .site-header #png, .site-header .back-link',
  )];
  // A comment left where each one was, so putting them back is exact rather than a
  // second statement of the header's source order that could disagree with the first.
  const marks = moved.map((el) => {
    const mark = new Comment('header menu');
    el.before(mark);
    return mark;
  });
  menu.append(...moved);

  /** @param {boolean} open */
  const show = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    if (!open && menu.contains(document.activeElement)) toggle.focus();
  };
  const onToggle = () => show(menu.hidden);
  /** The toggle is excluded: closing on its own pointerdown would let its click
   * reopen what it just closed. @param {Event} event */
  const onDown = (event) => {
    const target = /** @type {Node} */ (event.target);
    if (menu.hidden || menu.contains(target) || toggle.contains(target)) return;
    show(false);
  };
  /** @param {KeyboardEvent} event */
  const onKey = (event) => { if (event.key === 'Escape' && !menu.hidden) show(false); };
  /** An item that does something dismisses the menu it was in. @param {Event} event */
  const onPick = (event) => {
    if (/** @type {Element} */ (event.target).closest('button, a')) show(false);
  };

  toggle.addEventListener('click', onToggle);
  menu.addEventListener('click', onPick);
  // `capture`, for the same reason the row popup uses it: the press that dismisses
  // this should get there before whatever it landed on acts.
  addEventListener('pointerdown', onDown, true);
  addEventListener('keydown', onKey);

  return () => {
    show(false);
    toggle.removeEventListener('click', onToggle);
    menu.removeEventListener('click', onPick);
    removeEventListener('pointerdown', onDown, true);
    removeEventListener('keydown', onKey);
    marks.forEach((mark, i) => mark.replaceWith(moved[i]));
  };
}

/**
 * A bar for each stacked panel that folds it away, and a fade at its foot.
 *
 * The bar is the panel's own `.panel-title` with a button put inside it -- the
 * accordion pattern's heading-plus-button -- rather than a second heading above the
 * one that is already there.
 * @param {HTMLElement} studio
 * @returns {() => void} puts the panels back
 */
function panelBars(studio) {
  const sections = /** @type {HTMLElement[]} */ (
    [...studio.querySelectorAll(':scope > section')].filter(bodyOf));
  /** @type {(() => void)[]} */ const undo = [];

  /** @param {HTMLElement} section @param {boolean} open */
  const set = (section, open) => {
    /** @type {HTMLElement} */ (section.querySelector('.panel-toggle'))
      .setAttribute('aria-expanded', String(open));
    /** @type {HTMLElement} */ (bodyOf(section)).hidden = !open;
    section.classList.toggle('collapsed', !open);
  };

  for (const section of sections) {
    const title = /** @type {HTMLElement} */ (section.querySelector(':scope > .panel-title'));
    const body = /** @type {HTMLElement} */ (bodyOf(section));
    const key = title.dataset.i18n;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'panel-toggle';
    button.textContent = title.textContent;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', body.id);
    // **The translation key moves to the button.** `applyStatic` writes `textContent`
    // on whatever carries `data-i18n`, so leaving the key on the heading would have
    // deleted the button the first time the reader changed the interface language.
    if (key) {
      button.dataset.i18n = key;
      title.removeAttribute('data-i18n');
    }
    title.replaceChildren(button);

    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') === 'false';
      // Where the bar was under the finger that tapped it, kept there. Opening this
      // panel folds the other one, and if that one is above, everything below it
      // moves up by its whole height -- which would leave the reader looking at the
      // middle of a list they had just asked to see the top of.
      const was = title.getBoundingClientRect().top;
      set(section, open);
      if (open) for (const other of sections) if (other !== section) set(other, false);
      scrollBy(0, title.getBoundingClientRect().top - was);
    });

    // Whether the panel is showing its last row, asked of the row rather than
    // computed from heights: the tree's own sections open and close under it, and a
    // fade that goes on being drawn at the bottom of the list is a lie.
    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-end';
    body.append(sentinel);
    const foot = new IntersectionObserver(
      ([entry]) => section.classList.toggle('at-end', entry.isIntersecting),
      { root: section },
    );
    foot.observe(sentinel);

    undo.push(() => {
      foot.disconnect();
      sentinel.remove();
      body.hidden = false;
      section.classList.remove('collapsed', 'at-end');
      // The button's text, not the text it was built from: the reader may have
      // changed the interface language since.
      title.textContent = button.textContent;
      if (key) title.dataset.i18n = key;
    });
  }
  return () => { for (const fn of undo) fn(); };
}

/**
 * Make sure `el` is not inside a panel that is folded away.
 *
 * Two things arrive in the content panel without the reader having asked for them
 * there: the row that "show in list" jumps to, and the images a PNG export saves. In
 * a collapsed panel either would look like nothing having happened. Does the work by
 * pressing the panel's own bar, so there is one implementation of what expanding a
 * panel means. A no-op on a desktop, where nothing is ever collapsed.
 * @param {Element} el
 */
export function revealPanel(el) {
  /** @type {HTMLElement|null} */
  (el.closest('section.collapsed')?.querySelector('.panel-toggle'))?.click();
}

/**
 * Build the phone's chrome, and take it down again above the breakpoint.
 * @param {HTMLElement} studio
 */
export function attachPhoneChrome(studio) {
  // The same 700px the layout uses -- and watched rather than read once, because
  // turning a phone to landscape crosses it, and what belongs at 844px wide is the
  // desktop header and the three-panel grid.
  const stacked = matchMedia('(max-width: 700px)');
  /** @type {(() => void)|null} */ let undo = null;
  const sync = () => {
    if (stacked.matches === !!undo) return;
    if (undo) {
      undo();
      undo = null;
      return;
    }
    const parts = [headerMenu(), panelBars(studio)];
    undo = () => { for (const part of parts) part(); };
  };
  stacked.addEventListener('change', sync);
  sync();
}
