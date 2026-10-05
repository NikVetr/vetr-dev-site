import * as store from './platform/store.js';
import { themeSection } from './theme.js';
import { resumeSection } from './site-menu.js';
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
 * Fold a panel away, or put it back.
 *
 * Shared, because a panel reaches this state two ways now: its bar can be tapped,
 * and its bar can be dragged down onto itself until there is nothing left but the
 * bar -- which is the same state and must not be a second representation of it.
 * @param {HTMLElement} section @param {boolean} open
 */
function setOpen(section, open) {
  /** @type {HTMLElement|null} */
  (section.querySelector('.panel-toggle'))?.setAttribute('aria-expanded', String(open));
  const body = bodyOf(section);
  if (body) body.hidden = !open;
  section.classList.toggle('collapsed', !open);
}

/** The least the preview may be dragged to. Below this there is nothing to preview. */
const PREVIEW_MIN = 96;
/** A drag this short is a tap: the bar is both a button and a seam. */
const SLOP = 6;
/** Where the reader put the seams, so they are not re-placed on every visit. */
const ROWS_KEY = 'plg.studio-rows';
/** The least of the column a panel opens to from its bar, beside the preview. */
const OPEN_SHARE = 1 / 3;

/**
 * Open a stacked panel without folding the others, at no less than a share of the
 * column. Set while the phone's seams are built, which is the only time a panel can be
 * folded or short.
 * @type {((section: HTMLElement, share: number) => void)|null}
 */
let widen = null;

/**
 * Everything in the header but the way back, the brand, the info line and PNG, in
 * one disclosure.
 *
 * The primary export stays out of it on purpose: it is what the page is for, and a
 * menu in front of the primary action is a real cost where the other three are one
 * tap either way. Dismissal follows `ui/item-popup.js` -- Escape, a pointer outside,
 * and focus handed back rather than left on something that is no longer rendered.
 * @param {() => HTMLElement[]} extra  the page's own settings, after the appearance
 * @returns {() => void} puts the header back
 */
function headerMenu(extra) {
  const toggle = /** @type {HTMLElement|null} */ (document.getElementById('header-more'));
  const menu = /** @type {HTMLElement|null} */ (document.getElementById('header-menu'));
  if (!toggle || !menu) return () => {};

  // Not the way back: it leads the header's own line at every width, because a way
  // out that has to be found in a menu is the thing a reader reported missing.
  const moved = [...document.querySelectorAll(
    '.site-header #banner, .site-header #drill-open, .site-header #pdf',
  )];
  // **PNG is the export that stays out on a phone, and PDF is the one that folds
  // away.** It is the other way round on a desktop and both are right: a PDF is what
  // you print, and printing is a thing you do at a desk. On a phone the export that
  // is any use is the picture -- it goes to the camera roll, and it can be held up to
  // a person. So the two also swap emphasis, or the header's only export would be
  // the one drawn as an afterthought.
  const pdf = document.getElementById('pdf');
  const png = document.getElementById('png');
  pdf?.classList.remove('primary');
  png?.classList.add('primary');
  // A comment left where each one was, so putting them back is exact rather than a
  // second statement of the header's source order that could disagree with the first.
  const marks = moved.map((el) => {
    const mark = new Comment('header menu');
    el.before(mark);
    return mark;
  });
  // Ahead of the warnings, which the markup already parks in here.
  menu.prepend(...moved);
  // **The settings themselves, not a door to them.** The header's own bars beside this
  // menu's three lines were two buttons that looked the same, and moved in here they
  // became an item opening a dialog that held one switch. So the menu carries what that
  // dialog did, and the bars are hidden at this width (`style.css`).
  const settings = document.createElement('div');
  settings.className = 'header-settings';
  settings.append(themeSection(), ...resumeSection(), ...extra());
  menu.append(settings);

  /** @param {boolean} open */
  const show = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    if (!open && menu.contains(document.activeElement)) toggle.focus();
  };
  const onToggle = () => show(menu.hidden);
  /** The toggle is excluded: closing on its own pointerdown would let its click
   * reopen what it just closed. So is a dialog one of its settings opened -- naming a
   * card to save -- which is over the menu, and comes back to it. @param {Event} event */
  const onDown = (event) => {
    const target = /** @type {Element} */ (event.target);
    if (menu.hidden || menu.contains(target) || toggle.contains(target) || target.closest?.('dialog[open]')) return;
    show(false);
  };
  /** @param {KeyboardEvent} event */
  const onKey = (event) => { if (event.key === 'Escape' && !menu.hidden) show(false); };
  /** An item that does something dismisses the menu it was in -- not a setting, which
   * is flipped and looked at where it is. @param {Event} event */
  const onPick = (event) => {
    const target = /** @type {Element} */ (event.target);
    if (target.closest('button, a') && !target.closest('.header-settings')) show(false);
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
    settings.remove();
    png?.classList.remove('primary');
    pdf?.classList.add('primary');
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

  const set = setOpen;

  for (const section of sections) {
    const title = /** @type {HTMLElement} */ (section.querySelector(':scope > .panel-title'));
    const body = /** @type {HTMLElement} */ (bodyOf(section));

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'panel-toggle';
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', body.id);
    // **The title's own children move into the button**, not its text: the name keeps
    // its translation key on its own span, so `applyStatic` rewrites the name and not
    // the button, and the content panel's item count comes along to sit by the caret.
    button.append(...title.childNodes);
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
      title.replaceChildren(...button.childNodes);
    });
  }
  return () => { for (const fn of undo) fn(); };
}

/**
 * Move the seam on top of row `at` by `dy`, pushing through whatever has no room.
 *
 * The rows above the seam take what the rows below give up, and the nearest gives
 * first: dragging a bar down shrinks its own panel, and once that is down to its bar
 * the panel under it -- which is what lets a folded panel's bar be dragged at all. A
 * row stops at its floor, so the seam stops where nothing below or above has room.
 * @param {number[]} heights  each row's height, in screen order
 * @param {number[]} floors   the least each row may be
 * @param {number} at  the row whose top is the seam
 * @param {number} dy  how far it moved, down positive
 */
export function moveSeam(heights, floors, at, dy) {
  const next = [...heights];
  const [giving, taking] = dy > 0
    ? [Array.from({ length: next.length - at }, (_, k) => at + k), at - 1]
    : [Array.from({ length: at }, (_, k) => at - 1 - k), at];
  let left = Math.abs(dy);
  for (const j of giving) {
    const give = Math.min(left, Math.max(0, next[j] - floors[j]));
    next[j] -= give;
    left -= give;
  }
  next[taking] += Math.abs(dy) - left;
  return next;
}

/**
 * Drag a panel's bar to move the seam it sits on.
 *
 * **The bar is the seam.** On a desktop each panel has a visible seam beside it and
 * the pointer has room to find one; on a phone the panels are rows of a column, and
 * the boundary between two rows is exactly where the lower one's bar already is.
 * Adding a second grabbable strip a few pixels tall, under a finger, would be a worse
 * control than the one already there — so the bar does both jobs: a tap folds the
 * panel, and a drag moves the seam it sits on.
 *
 * What a drag means is the physical thing: the bar follows the finger, the row above
 * it grows by what the rows below give up (`moveSeam`), and a panel dragged down to
 * nothing but its bar is folded, and drawn that way -- or opened, dragged up out of
 * it. It used to trade only with its own panel, so a folded panel's bar had nothing
 * to give and could not be dragged at all, and with the list folded too neither bar
 * moved.
 *
 * Each row's height is kept as its share of the column (`style.css`), so the rows
 * always fill it: a folded panel's room goes to the rows still open, in proportion,
 * and a panel opened from its bar gets at least a third of the column back.
 *
 * Tap and drag are told apart by distance, the way the message surface tells a scroll
 * from a tap: under {@link SLOP} pixels the press was a tap and the button's own
 * click stands, over it the click is swallowed.
 * @param {HTMLElement} studio
 * @returns {() => void} puts the heights back
 */
function panelSeams(studio) {
  // **Screen order, which is not source order**: the preview carries `order: -1` so
  // the card is the first thing on a phone. A seam that used the DOM's order would
  // hand the Format panel's room to the panel it is not next to.
  const rows = /** @type {HTMLElement[]} */ ([...studio.querySelectorAll(':scope > section')])
    .sort((a, b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order));

  /** What a row is called in the record: its body's id, or the preview's class, so
   * the record survives a reordering of the markup and a change of language.
   * @param {HTMLElement} row */
  const nameOf = (row) => bodyOf(row)?.id ?? 'canvas';
  /** The least a row may be: a panel keeps its bar, the preview keeps enough to be
   * one. @param {HTMLElement} row */
  const floorOf = (row) => {
    const bar = /** @type {HTMLElement|null} */ (row.querySelector(':scope > .panel-title'));
    return bar ? bar.getBoundingClientRect().height : PREVIEW_MIN;
  };
  const folded = (/** @type {HTMLElement} */ row) => row.classList.contains('collapsed');

  /** Each row's share of the column, in points, for every row or for none: a share
   * means something only beside the others. A folded panel's is what it opens to.
   * @type {Record<string, number>} */
  let held = {};
  try {
    held = JSON.parse(store.get(ROWS_KEY) ?? '{}');
  } catch {
    // A corrupt value is the same as none: fall back to the CSS shares.
  }
  if (!rows.every((row) => held[nameOf(row)] > 0)) held = {};
  /** A row's padding and border, which flex adds a share to rather than counting --
   * so a share is the height less these, or the padded preview took ten points more
   * than it was given each time a bar moved. @param {HTMLElement} row */
  const edges = (row) => {
    const style = getComputedStyle(row);
    return ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth']
      .reduce((sum, key) => sum + parseFloat(style[/** @type {any} */ (key)]), 0);
  };
  const apply = () => {
    for (const row of rows) {
      row.style.flex = `${Math.max(0, held[nameOf(row)] - edges(row))} 1 0px`;
    }
  };
  const save = () => store.set(ROWS_KEY, JSON.stringify(held));
  if (Object.keys(held).length) apply();

  /** Give a row at least `share` of the column beside the rows still open, and keep it.
   * @param {HTMLElement} row @param {number} share */
  const atLeast = (row, share) => {
    const others = rows.filter((r) => r !== row && !folded(r))
      .reduce((sum, r) => sum + held[nameOf(r)], 0);
    held[nameOf(row)] = Math.max(held[nameOf(row)], (others * share) / (1 - share));
    apply();
    save();
  };
  widen = (row, share) => {
    setOpen(row, true);
    // Shares mean something only for every row at once, so the stylesheet's are read
    // off the screen the first time.
    if (!Object.keys(held).length) for (const r of rows) held[nameOf(r)] = r.getBoundingClientRect().height;
    atLeast(row, share);
  };

  /** @type {(() => void)[]} */ const undo = [() => { widen = null; }];
  for (const [i, row] of rows.entries()) {
    const bar = /** @type {HTMLElement|null} */ (row.querySelector(':scope > .panel-title'));
    if (!bar) continue;
    if (i === 0) { bar.classList.add('no-seam'); continue; }

    let dragged = false;
    /** @param {PointerEvent} event */
    const onDown = (event) => {
      if (event.button !== 0) return;
      const startY = event.clientY;
      const start = rows.map((r) => r.getBoundingClientRect().height);
      const floors = rows.map(floorOf);
      const wasOpen = rows.map((r) => !folded(r));
      const total = start.reduce((a, b) => a + b, 0);
      dragged = false;

      /** @param {PointerEvent} move */
      const onMove = (move) => {
        if (!dragged && Math.abs(move.clientY - startY) < SLOP) return;
        if (!dragged) {
          dragged = true;
          bar.classList.add('dragging');
          // **Taken only once this is a drag.** Capturing on the press retargets the
          // click to the bar, which is where the toggle button *is not* -- so every
          // tap stopped folding the panel. Taken here, the capture is wanted: the
          // pointer is about to leave a 30px bar, and the click it eats is one that
          // should not have happened.
          bar.setPointerCapture(move.pointerId);
        }
        const next = moveSeam(start, floors, i, move.clientY - startY);
        rows.forEach((r, j) => {
          // Nothing left of a panel but its bar is a folded panel, and is drawn as
          // one -- a body with no height is not a state anybody asked for. It keeps
          // the height it had before this drag, so opening it again opens it to
          // something.
          const panel = bodyOf(r) !== null;
          const shut = panel && next[j] <= floors[j] + 2;
          if (panel) setOpen(r, !shut);
          if (!shut) held[nameOf(r)] = next[j];
          else if (wasOpen[j]) held[nameOf(r)] = start[j];
          else held[nameOf(r)] ??= total * OPEN_SHARE;
        });
        apply();
      };
      const onUp = () => {
        bar.classList.remove('dragging');
        removeEventListener('pointermove', onMove);
        removeEventListener('pointerup', onUp);
        removeEventListener('pointercancel', onUp);
        if (!dragged) return;
        save();
        // **Cleared a turn later, not here.** The click that has to be swallowed is
        // dispatched after this handler returns, and a drag that ended off the bar
        // produces no click on it at all -- so clearing the flag in the click
        // handler left it set, and the next genuine tap was eaten instead.
        setTimeout(() => { dragged = false; }, 0);
      };
      addEventListener('pointermove', onMove);
      addEventListener('pointerup', onUp);
      addEventListener('pointercancel', onUp);
    };
    /** A press that turned into a drag is not also a press of the button inside the
     * bar. Capture, so it is stopped before the toggle sees it. @param {Event} e */
    const onClick = (e) => {
      if (!dragged) return;
      e.stopPropagation();
      e.preventDefault();
    };
    /** After the button has opened or folded the panel. Opened, it gets at least
     * `OPEN_SHARE` of the column beside the rows still open: its kept share could be
     * a sliver, and an opened panel that stays a sliver looks like a tap that did
     * nothing. Until a bar has been dragged the stylesheet's shares already do this. */
    const onTapped = () => {
      if (folded(row) || !Object.keys(held).length) return;
      atLeast(row, OPEN_SHARE);
    };

    bar.addEventListener('pointerdown', onDown);
    bar.addEventListener('click', onClick, true);
    bar.addEventListener('click', onTapped);
    undo.push(() => {
      bar.removeEventListener('pointerdown', onDown);
      bar.removeEventListener('click', onClick, true);
      bar.removeEventListener('click', onTapped);
      bar.classList.remove('dragging', 'no-seam');
    });
  }
  undo.push(() => { for (const row of rows) row.style.flex = ''; });
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
 * Open the stacked panel `el` is in to at least `share` of the column, leaving the
 * others open: something has just changed in it that the reader should watch while
 * they go on with the panel they are in. A no-op on a desktop, where every panel is a
 * full-height column.
 * @param {Element} el @param {number} share
 */
export function widenPanel(el, share) {
  const section = /** @type {HTMLElement|null} */ (el.closest('.studio > section'));
  if (section) widen?.(section, share);
}

/**
 * Build the phone's chrome, and take it down again above the breakpoint.
 * @param {HTMLElement} studio
 * @param {() => HTMLElement[]} settings  the page's own settings, which the menu carries
 *   because the bars that open them on a desktop are not drawn at this width
 */
export function attachPhoneChrome(studio, settings) {
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
    const parts = [headerMenu(settings), panelBars(studio), panelSeams(studio)];
    undo = () => { for (const part of parts) part(); };
  };
  stacked.addEventListener('change', sync);
  sync();
}
