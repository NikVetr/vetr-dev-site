// The owner's menu, behind three bars.
//
// Two named buttons in the board's bar cost a whole row on a phone, and the row they
// cost was the one the topic needed. So they live behind an icon — which is worth
// doing only because there are exactly two of them and neither is used mid-
// conversation: a menu that hides something urgent would be a worse trade.
//
// A `<dialog>`, like every other modal here, so Escape closes it, the Android Back
// press closes it before the page sees it, and a waiting service-worker update holds
// off while it is open. All three of those come free from the element and would each
// have to be written by hand for a bare `<div>` pretending to be a popup.

/** @param {string} tag @param {Record<string,string>} attrs @param {(Node|string)[]} kids */
function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...kids);
  return node;
}

/**
 * Open the menu under the control that asked for it.
 *
 * @param {HTMLElement} anchor  the button pressed, so focus can go back to it
 * @param {{label:string, run:()=>void, current?:boolean}[]} items  `current` marks the
 *   one in force, which is drawn as such and takes focus instead of the first
 * @param {{title:string, items:{label:string, run:()=>void, current?:boolean}[]}} [aside]
 *   a second column beside the first, under its own heading
 */
export function openBoardMenu(anchor, items, aside) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'board-menu-panel' }));
  /** @param {{label:string, run:()=>void, current?:boolean}} item */
  const entry = (item) => {
    const button = el('button', { type: 'button', class: 'board-menu-item', text: item.label });
    if (item.current) {
      button.classList.add('board-menu-current');
      button.setAttribute('aria-current', 'true');
    }
    button.addEventListener('click', () => {
      // Closed before the action runs, so the action's own dialog is not opening
      // underneath this one -- two modals in the top layer at once is a stack the
      // reader did not ask for and cannot see out of.
      panel.close();
      item.run();
    });
    return button;
  };
  if (aside) {
    panel.classList.add('board-menu-columns');
    panel.append(
      el('div', { class: 'board-menu-column' }, items.map(entry)),
      el('div', { class: 'board-menu-column' }, [
        el('p', { class: 'board-menu-title', text: aside.title }), ...aside.items.map(entry),
      ]),
    );
  } else {
    panel.append(...items.map(entry));
  }
  document.body.append(panel);
  // The aside opens on the voice in use rather than at the top of five hundred: the
  // current item is brought to the middle of its own column, and the page stays put.
  const column = /** @type {HTMLElement|null} */ (panel.querySelector('.board-menu-column:last-child'));
  const current = /** @type {HTMLElement|null} */ (column?.querySelector('.board-menu-current') ?? null);
  if (column && current) column.scrollTop = current.offsetTop - column.clientHeight / 2 + current.offsetHeight / 2;
  panel.addEventListener('close', () => {
    panel.remove();
    // Back to the button that opened it, for whoever is not using a finger.
    anchor.focus();
  });
  // Clicking the backdrop is the ordinary way out of a menu, and on a `<dialog>` the
  // backdrop is the element itself -- a press that lands on the dialog rather than
  // on one of its children came from outside the panel.
  panel.addEventListener('click', (event) => { if (event.target === panel) panel.close(); });
  panel.showModal();
  // **Against the control that opened it.** The stylesheet's default hangs the panel
  // under the header's own corner, which is right for the menu behind the three
  // bars and wrong for everything else that now opens one -- the speed control at
  // the foot of the screen got its list at the top, a screen away from the thumb
  // that asked. So: above the anchor when it sits in the lower half, below it
  // otherwise, its near edge on the anchor's, kept inside the viewport.
  //
  // **The layout viewport, not `innerWidth`.** A fixed panel is placed in layout
  // coordinates, and so is the anchor's rect; `innerHeight` is the *visual* viewport,
  // which shrinks when a phone is pinch-zoomed -- so the clamp put the list a screen
  // above the button for anyone zoomed in.
  const at = anchor.getBoundingClientRect();
  const me = panel.getBoundingClientRect();
  const view = document.documentElement;
  const gap = 6;
  const above = at.top > view.clientHeight / 2;
  const top = above
    ? Math.max(gap, at.top - gap - me.height)
    : Math.min(view.clientHeight - me.height - gap, at.bottom + gap);
  const start = view.dir === 'rtl' ? at.right - me.width : at.left;
  const left = Math.max(gap, Math.min(view.clientWidth - me.width - gap, start));
  panel.style.margin = '0';
  panel.style.inset = `${Math.round(top)}px auto auto ${Math.round(left)}px`;
  /** @type {HTMLElement|null} */ (panel.querySelector('.board-menu-current') ?? panel.querySelector('button'))?.focus();
  return panel;
}

/**
 * Ask for one line of text in a dialog of its own, and hand it back on Save.
 *
 * Saved by Save (or Enter) only: closing the dialog -- its corner, Escape, a press
 * outside it -- is changing one's mind, and keeps nothing that was typed.
 * @param {object} config
 * @param {string} config.label  what the field is, above it
 * @param {string} config.save   the button's word
 * @param {string} config.close  the corner control's accessible name
 * @param {(value:string) => void} config.onSave  given the text, trimmed
 * @param {string} [config.value]  what is in the field to begin with
 * @param {string} [config.hint]   a line under the field
 * @param {string} [config.autocomplete]
 * @param {string} [config.kind]   a class for the dialog, for tests and styles
 */
export function askText({ label, save, close, onSave, value = '', hint, autocomplete, kind = '' }) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: `speaker-settings ${kind}` }));
  const corner = el('button', { type: 'button', class: 'speaker-close', 'aria-label': close });
  corner.addEventListener('click', () => panel.close());
  const input = /** @type {HTMLInputElement} */ (el('input', { type: 'text' }));
  input.value = value;
  if (autocomplete) input.setAttribute('autocomplete', autocomplete);
  const form = el('form', {}, [
    el('label', { class: 'about-field' }, [el('span', { text: label }), input]),
    ...(hint ? [el('p', { class: 'speaker-why', text: hint })] : []),
    el('button', { class: 'btn primary', text: save }),
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSave(input.value.trim());
    panel.close();
  });
  panel.append(corner, form);
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();
  input.focus();
}

/**
 * Ask which of several things apply, as checkboxes in a dialog of their own, and hand
 * back the ones ticked on Save. As `askText`, closing it any other way keeps nothing.
 * @param {object} config
 * @param {string} config.label  what is being asked, above the boxes
 * @param {{value:string, label:string}[]} config.options
 * @param {string[]} config.chosen  ticked to begin with
 * @param {string} config.save  @param {string} config.close
 * @param {(values:string[]) => void} config.onSave
 * @param {string} [config.hint]  @param {string} [config.kind]
 */
export function askChoices({ label, options, chosen, save, close, onSave, hint, kind = '' }) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: `speaker-settings ${kind}` }));
  const corner = el('button', { type: 'button', class: 'speaker-close', 'aria-label': close });
  corner.addEventListener('click', () => panel.close());
  const boxes = options.map((option) => {
    const box = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', value: option.value }));
    box.checked = chosen.includes(option.value);
    return { box, row: el('label', { class: 'speaker-option' }, [box, option.label]) };
  });
  const form = el('form', {}, [
    el('fieldset', { class: 'speaker-block' }, [el('legend', { text: label }), ...boxes.map((b) => b.row)]),
    ...(hint ? [el('p', { class: 'speaker-why', text: hint })] : []),
    el('button', { class: 'btn primary', text: save }),
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSave(boxes.filter((b) => b.box.checked).map((b) => b.box.value));
    panel.close();
  });
  panel.append(corner, form);
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();
  /** @type {HTMLElement|undefined} */ (boxes[0]?.box)?.focus();
}
