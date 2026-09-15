// Edit one row without leaving the card.
//
// The studio is three panels, and on a phone they stack: the card first, then the
// format controls, then the content list. So the bidirectional link that is the
// point of the studio on a desktop -- tap a row on the card and the list scrolls to
// it -- became a gesture that threw the reader a screen and a half away from the
// thing they were looking at, to a checkbox they then had to find. The card is the
// only pane that fits on a phone, so the editing has to happen over the card.
//
// It offers the four things the content list offers for a row, and nothing else: is
// this row on the sheet, is its whole section on, what colour is that section, and
// what does the row say. The editor itself is `itemEditForm` from the tree rather
// than a copy of it -- a second editor would drift from the first, and this one
// already writes to `edits.overrides`, the same layer the CSV import uses.
//
// Anchored to the row rather than docked to the bottom, because which row you are
// editing is the one thing a bottom sheet cannot tell you. Clamped into the viewport
// so a row in a corner does not open a panel half off the screen.

import { itemEditForm } from './content-tree.js';
import { t } from './i18n.js';

/** Margin kept between the popup and the edge of the viewport, in px. */
const EDGE = 8;

/** @type {HTMLElement|null} */ let open = null;
/** @type {(() => void)|null} */ let detach = null;

/** Close whatever is open. Safe to call when nothing is. */
export function closeItemPopup() {
  detach?.();
  detach = null;
  open?.remove();
  open = null;
}

/**
 * Put `panel` beside `anchor`, kept inside the viewport.
 *
 * Measured after insertion rather than guessed: the panel's height depends on how
 * many columns the sheet shows, which is a reader's choice, so there is no constant
 * to place it by.
 * @param {HTMLElement} panel @param {DOMRect} anchor
 */
function place(panel, anchor) {
  const { width, height } = panel.getBoundingClientRect();
  // Below the row if it fits, above if it does not, and pinned to the bottom edge
  // if neither does -- which happens on a short screen with every column shown.
  const below = anchor.bottom + EDGE;
  const above = anchor.top - height - EDGE;
  const top = below + height + EDGE <= innerHeight ? below
    : above >= EDGE ? above
      : Math.max(EDGE, innerHeight - height - EDGE);
  // Centred on the row, then pulled back inside whichever edge it crossed.
  const wanted = anchor.left + anchor.width / 2 - width / 2;
  const left = Math.min(Math.max(EDGE, wanted), Math.max(EDGE, innerWidth - width - EDGE));
  panel.style.top = `${Math.round(top)}px`;
  panel.style.left = `${Math.round(left)}px`;
}

/**
 * @param {object} config
 * @param {string} config.conceptId
 * @param {HTMLElement} config.anchor        the hit box that was tapped
 * @param {string} config.title              what the row says, to name it
 * @param {string} config.sectionId
 * @param {string} config.sectionTitle
 * @param {boolean} config.itemOn
 * @param {boolean} config.sectionOn
 * @param {string} config.colour             the section's current role colour
 * @param {{role:string, hex:string}[]} config.colours  the palette to choose from
 * @param {Record<string,string>} config.values  the row's text per shown column
 * @param {string} config.target @param {string} config.source
 * @param {(patch:{sections?:Record<string,boolean>, items?:Record<string,boolean>,
 *   sectionColors?:Record<string,string>})=>void} config.onToggle
 * @param {(conceptId:string, values:Record<string,string>)=>void} config.onEdit
 * @param {(conceptId:string)=>void} config.onReveal  the desktop behaviour, kept as
 *   an escape hatch: the list can do things this cannot, like reordering.
 */
export function openItemPopup(config) {
  closeItemPopup();

  const panel = document.createElement('div');
  panel.className = 'item-popup';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', t('popup.editing', { row: config.title }));

  const head = document.createElement('p');
  head.className = 'item-popup-title';
  head.textContent = config.title;
  head.lang = config.target;

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'item-popup-close';
  close.setAttribute('aria-label', t('quiz.cancel'));
  close.textContent = '×';
  close.addEventListener('click', closeItemPopup);

  /** A labelled checkbox. @param {string} label @param {boolean} on
   * @param {(value:boolean)=>void} set */
  const toggle = (label, on, set) => {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = on;
    box.addEventListener('change', () => set(box.checked));
    const wrap = document.createElement('label');
    wrap.className = 'item-popup-toggle';
    wrap.append(box, Object.assign(document.createElement('span'), { textContent: label }));
    return wrap;
  };

  const rows = document.createElement('div');
  rows.className = 'item-popup-rows';
  rows.append(
    toggle(t('popup.showRow'), config.itemOn,
      (on) => config.onToggle({ items: { [config.conceptId]: on } })),
    toggle(t('popup.showSection', { section: config.sectionTitle }), config.sectionOn,
      (on) => config.onToggle({ sections: { [config.sectionId]: on } })),
  );

  // The section's colour, as the five chips rather than a cycling button: the
  // colour is the sheet's whole category encoding, so the choice should be in front
  // of you. Same argument the tree's own swatch menu makes.
  if (config.colours.length) {
    const palette = document.createElement('div');
    palette.className = 'item-popup-palette';
    palette.setAttribute('role', 'group');
    palette.setAttribute('aria-label', t('tree.recolour', { section: config.sectionTitle }));
    for (const { role, hex } of config.colours) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'item-popup-chip';
      chip.style.background = hex;
      chip.title = role;
      chip.setAttribute('aria-label', role);
      if (hex.toLowerCase() === config.colour.toLowerCase()) {
        chip.setAttribute('aria-current', 'true');
      }
      chip.addEventListener('click', () => {
        config.onToggle({ sectionColors: { [config.sectionId]: role } });
        closeItemPopup();
      });
      palette.append(chip);
    }
    rows.append(palette);
  }

  const actions = document.createElement('div');
  actions.className = 'row';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.textContent = t('popup.editText');
  edit.addEventListener('click', () => {
    if (panel.querySelector('.item-edit')) return;
    edit.disabled = true;
    const form = itemEditForm({
      conceptId: config.conceptId,
      values: config.values,
      target: config.target,
      source: config.source,
      onSave: (values) => { config.onEdit(config.conceptId, values); closeItemPopup(); },
      onClose: () => { edit.disabled = false; place(panel, config.anchor.getBoundingClientRect()); },
    });
    panel.append(form);
    // The panel just grew, so where it sits has to be decided again.
    place(panel, config.anchor.getBoundingClientRect());
    /** @type {HTMLElement} */ (form.querySelector('input'))?.focus();
  });
  const list = document.createElement('button');
  list.type = 'button';
  list.className = 'ghost';
  list.textContent = t('popup.showInList');
  list.addEventListener('click', () => {
    closeItemPopup();
    config.onReveal(config.conceptId);
  });
  actions.append(edit, list);

  panel.append(close, head, rows, actions);
  document.body.append(panel);
  open = panel;
  place(panel, config.anchor.getBoundingClientRect());

  // Dismissal. A pointer outside it, Escape, or the page moving under it -- the
  // last because the panel is positioned against the viewport and a scroll would
  // otherwise leave it pointing at a row that has moved.
  const onDown = (/** @type {Event} */ event) => {
    if (!panel.contains(/** @type {Node} */ (event.target))) closeItemPopup();
  };
  const onKey = (/** @type {KeyboardEvent} */ event) => {
    if (event.key === 'Escape') closeItemPopup();
  };
  // `capture`, so a tap that lands on another hit box closes this one before that
  // box opens its own -- otherwise two panels are briefly alive at once.
  addEventListener('pointerdown', onDown, true);
  addEventListener('keydown', onKey);
  addEventListener('scroll', closeItemPopup, { passive: true });
  addEventListener('resize', closeItemPopup);
  detach = () => {
    removeEventListener('pointerdown', onDown, true);
    removeEventListener('keydown', onKey);
    removeEventListener('scroll', closeItemPopup);
    removeEventListener('resize', closeItemPopup);
  };
  /** @type {HTMLElement} */ (panel.querySelector('input, button'))?.focus();
}
