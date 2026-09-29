// A dialog's header, the one every modal in the app opens with.
//
// Its name, then -- in a settings dialog -- the dark-mode switch, then the cross that
// closes it, in one row held at the top while the body scrolls under it: what this
// is and the way out of it stay in view however long the form below them is. Its own
// module because every dialog needs it and the modules that draw dialogs load in
// places a page's chrome does not -- the drills' tests read the settings module, and
// `ui/site-menu.js` registers its listeners on the document as it loads.

import { themeControl } from './theme.js';

/**
 * @param {object} config
 * @param {string} config.title  the dialog's name, also its accessible name
 * @param {string} config.close  the cross's accessible name
 * @param {() => void} config.onClose
 * @param {boolean} [config.theme]  a settings dialog: the dark-mode switch beside the cross
 * @returns {HTMLElement}
 */
export function dialogHead({ title, close, onClose, theme = false }) {
  const head = document.createElement('header');
  head.className = 'dialog-head';
  const name = document.createElement('h2');
  name.className = 'dialog-title';
  name.textContent = title;
  const cross = document.createElement('button');
  cross.type = 'button';
  cross.className = 'speaker-close';
  cross.setAttribute('aria-label', close);
  cross.addEventListener('click', onClose);
  head.append(name, ...(theme ? [themeControl()] : []), cross);
  // Its height, for whatever else in the dialog sticks under it (the keyboard of
  // sounds' tiles): the title can wrap, so it is measured rather than assumed.
  new ResizeObserver(() => {
    head.parentElement?.style.setProperty('--dialog-head', `${head.offsetHeight}px`);
  }).observe(head);
  return head;
}
