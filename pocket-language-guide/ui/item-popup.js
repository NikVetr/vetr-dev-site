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

import { chipToggle, swatchRow } from './chips.js';
import { itemEditForm } from './content-tree.js';
import { t } from './i18n.js';
import { dialogHead } from './dialog.js';

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
 * @param {string} config.role               the section's current colour role
 * @param {{key:string, hex:string, label:string}[]} config.colours  the palette
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

  // Which row this is, before what to do with it: its own words as the header, what
  // they mean under them, and the section it belongs to beside a dot of its colour.
  const head = dialogHead({ title: config.title, close: t('gallery.previewClose'), onClose: closeItemPopup });
  const name = /** @type {HTMLElement} */ (head.querySelector('.dialog-title'));
  name.classList.add('item-popup-title');
  name.lang = config.target;
  const about = document.createElement('div');
  about.className = 'item-popup-about';
  if (config.values.gloss && config.values.gloss !== config.title) {
    const meaning = document.createElement('p');
    meaning.className = 'item-popup-meaning';
    meaning.lang = config.source;
    meaning.textContent = config.values.gloss;
    about.append(meaning);
  }
  const section = document.createElement('p');
  section.className = 'item-popup-section';
  const dot = document.createElement('span');
  dot.className = 'item-popup-dot';
  dot.style.background = config.colours.find((c) => c.key === config.role)?.hex ?? 'var(--line)';
  section.append(dot, config.sectionTitle);
  about.append(section);

  /** A labelled toggle, as a row. @param {string} label @param {boolean} on
   * @param {(value:boolean)=>void} set */
  const toggle = (label, on, set) => {
    const chip = chipToggle({ label, checked: on, onChange: set, title: label });
    chip.label.classList.add('item-popup-toggle');
    return chip.label;
  };

  // Two rows of one group, each with its box at the end, rather than two chips that
  // wrapped wherever the section's name ran long: "is this row on the sheet" is the
  // question this panel is opened for, and it should read as one at arm's length.
  const rows = document.createElement('div');
  rows.className = 'item-popup-rows';
  rows.append(
    toggle(t('popup.showRow'), config.itemOn,
      (on) => config.onToggle({ items: { [config.conceptId]: on } })),
    toggle(t('popup.showSection', { section: config.sectionTitle }), config.sectionOn,
      (on) => config.onToggle({ sections: { [config.sectionId]: on } })),
  );

  // The section's colour, as the five swatches rather than a cycling button: the
  // colour is the sheet's whole category encoding, so the choice should be in front
  // of you. The same row the format panel's band uses, from `chips.js`.
  const colour = document.createElement('div');
  colour.className = 'item-popup-colour';
  if (config.colours.length) {
    const said = t('tree.recolour', { section: config.sectionTitle });
    const palette = swatchRow({
      colours: config.colours,
      label: said,
      onPick: (key) => {
        config.onToggle({ sectionColors: { [config.sectionId]: key } });
        closeItemPopup();
      },
    });
    palette.paint(config.role);
    const caption = document.createElement('p');
    caption.textContent = said;
    colour.append(caption, palette.row);
  }

  const actions = document.createElement('div');
  actions.className = 'item-popup-actions';
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'primary';
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

  panel.append(head, about, rows, ...(config.colours.length ? [colour] : []), actions);
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
