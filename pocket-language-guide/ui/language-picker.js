// The "I speak" control in the header.
//
// A native `<select>` shows the selected option's own text when closed, so it
// cannot say "English" collapsed and "English · English" in the list -- and it
// cannot align or colour half of an option either. Both are worth having: the
// endonym is what you recognise at a glance, and the name in your own language is
// what you need only while choosing. So this is a listbox rather than a select.
//
// It keeps the keyboard contract the rest of the app uses (see `ui/keys.js`), so
// arrows, Home, End, Enter and Escape all behave the way they do in the settings
// panels and on the page canvas.

import { nextIndex } from './keys.js';

/**
 * @typedef {Object} PickerOption
 * @property {string} value
 * @property {string} name    the language's own name, shown collapsed and in the list
 * @property {string} aside   the name in the reader's language, shown only in the list
 */

/**
 * @param {Object} config
 * @param {HTMLElement} config.mount    replaced by the control
 * @param {PickerOption[]} config.options
 * @param {string} config.value
 * @param {string} config.label         accessible name for the control
 * @param {(value:string)=>void} config.onChange
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

  const paint = () => {
    const chosen = options.find((o) => o.value === current) ?? options[0];
    button.textContent = chosen ? chosen.name : '';
    items.forEach((li, i) => {
      const on = options[i].value === current;
      li.setAttribute('aria-selected', String(on));
      li.classList.toggle('current', on);
    });
  };

  options.forEach((option, i) => {
    const li = document.createElement('li');
    li.className = 'lang-picker-option';
    li.setAttribute('role', 'option');
    li.id = `lang-opt-${i}`;
    li.tabIndex = -1;
    const name = document.createElement('span');
    name.className = 'lang-picker-name';
    name.textContent = option.name;
    const aside = document.createElement('span');
    aside.className = 'lang-picker-aside';
    aside.textContent = option.aside;
    li.append(name, aside);
    li.addEventListener('click', () => {
      current = option.value;
      paint();
      close(true);
      onChange(option.value);
    });
    items.push(li);
    list.append(li);
  });

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
    const at = Math.max(0, options.findIndex((o) => o.value === current));
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

  // Anywhere else on the page dismisses it, which is what a dropdown does.
  document.addEventListener('pointerdown', (event) => {
    if (!wrap.contains(/** @type {Node} */ (event.target))) close(false);
  });

  paint();
  wrap.append(button, list);
  mount.replaceWith(wrap);
  return { element: wrap };
}
