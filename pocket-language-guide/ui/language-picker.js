// The "I speak" control in the header.
//
// A native `<select>` shows the selected option's own text when closed, so it
// cannot say "Deutsch" collapsed and "German · Deutsch" in the list -- and it
// cannot align or colour half of an option either. Both are worth having: the
// endonym is what you recognise at a glance, and the name in your own language is
// what you need only while choosing. So this is a listbox rather than a select.
//
// **Its rows are the board's language menu's rows**: the reader's word for the
// language at the start, and the language's own name at the end in the second colour
// and face -- one rule in `style.css` draws both menus, so the two cannot drift.
//
// It keeps the keyboard contract the rest of the app uses (see `ui/keys.js`), so
// arrows, Home, End, Enter and Escape all behave the way they do in the settings
// panels and on the page canvas.

import { nextIndex } from './keys.js';

/**
 * @typedef {Object} PickerOption
 * @property {string} value   the language's code
 * @property {string} label   its name in the reader's language, leading its row in the list
 * @property {string} own     its own name: the closed control's text, and the end of its row
 */

/**
 * @param {Object} config
 * @param {HTMLElement} config.mount    replaced by the control
 * @param {PickerOption[]} config.options
 * @param {string} config.value
 * @param {string} config.label         accessible name for the control
 * @param {(value:string)=>void} config.onChange
 * @returns {{element:HTMLElement, select:(value:string)=>void, destroy:()=>void,
 *   relabel:(next:{label:string, options:PickerOption[]})=>void}}
 */
export function languagePicker({ mount, options, value, label, onChange }) {
  const wrap = document.createElement('div');
  wrap.className = 'lang-picker';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lang-picker-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', label);

  const list = document.createElement('ul');
  list.className = 'lang-picker-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', label);
  list.hidden = true;

  /** @type {HTMLLIElement[]} */ const items = [];
  let current = value;
  let shown = options;

  const paint = () => {
    const chosen = shown.find((o) => o.value === current) ?? shown[0];
    button.textContent = chosen ? chosen.own : '';
    items.forEach((li, i) => {
      const on = options[i].value === current;
      li.setAttribute('aria-selected', String(on));
      li.classList.toggle('current', on);
    });
  };

  /**
   * Build the list. Separate from the constructor because every option's `label`
   * is a language name *in the reader's language*, so changing the reader changes
   * all of them -- and the reader can be changed from a control that sits next to
   * this one.
   * @param {PickerOption[]} next
   */
  function fill(next) {
    shown = next;
    items.length = 0;
    list.replaceChildren();
    next.forEach((option, i) => {
    const li = document.createElement('li');
    li.className = 'lang-picker-option';
    li.setAttribute('role', 'option');
    li.id = `lang-opt-${i}`;
    li.tabIndex = -1;
    const name = document.createElement('span');
    name.className = 'lang-picker-name';
    name.textContent = option.label;
    const own = document.createElement('span');
    own.className = 'lang-picker-own';
    own.lang = option.value;
    own.textContent = option.own;
    li.append(name, own);
    li.addEventListener('click', () => {
      current = option.value;
      paint();
      close(true);
      onChange(option.value);
    });
    items.push(li);
    list.append(li);
    });
  }
  fill(options);

  /** @param {boolean} refocus */
  function close(refocus) {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  }

  function open() {
    if (!list.hidden) return;
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const at = Math.max(0, shown.findIndex((o) => o.value === current));
    items[at]?.focus();
  }

  button.addEventListener('click', () => (list.hidden ? open() : close(true)));
  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter'
      || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });

  list.addEventListener('keydown', (event) => {
    const from = items.indexOf(/** @type {HTMLLIElement} */ (document.activeElement));
    if (event.key === 'Escape' || event.key === 'Tab') {
      close(event.key === 'Escape');
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      items[from]?.click();
      return;
    }
    const to = nextIndex(event.key, from, items.length);
    if (to < 0) return;
    event.preventDefault();
    items[to].focus();
  });

  // Anywhere else on the page dismisses it, which is what a dropdown does. The
  // listener is on the document, so it outlives the control unless something takes
  // it down -- which matters because the gallery lightbox builds two of these
  // every time it opens.
  const dismiss = new AbortController();
  document.addEventListener('pointerdown', (event) => {
    if (!wrap.contains(/** @type {Node} */ (event.target))) close(false);
  }, { signal: dismiss.signal });

  paint();
  wrap.append(button, list);
  // The control stands in for the mount, so it takes the mount's id with it --
  // otherwise replacing the node quietly removes the handle everything else uses
  // to find this control on the page.
  if (mount.id) wrap.id = mount.id;
  mount.replaceWith(wrap);
  return {
    element: wrap,
    /** Show a different option as chosen, without announcing a change. */
    select(/** @type {string} */ next) {
      current = next;
      paint();
    },
    /**
     * Re-set the accessible name and the option list after the interface language
     * has changed. Rebuilding the control instead would drop the document
     * listener and the element's id, both of which other code holds.
     * @param {{label:string, options:PickerOption[]}} next
     */
    relabel(next) {
      button.setAttribute('aria-label', next.label);
      list.setAttribute('aria-label', next.label);
      fill(next.options);
      paint();
    },
    /** Give up the document listener. */
    destroy() {
      dismiss.abort();
      wrap.remove();
    },
  };
}
