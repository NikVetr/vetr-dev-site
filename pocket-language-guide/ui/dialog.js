// A dialog's header, the one every modal in the app opens with.
//
// Its name, then -- in a settings dialog -- the dark-mode switch, then the cross that
// closes it, in one row held at the top while the body scrolls under it: what this
// is and the way out of it stay in view however long the form below them is. Its own
// module because every dialog needs it and the modules that draw dialogs load in
// places a page's chrome does not -- the drills' tests read the settings module, and
// `ui/site-menu.js` registers its listeners on the document as it loads.

import { themeControl } from './theme.js';
import { t } from './i18n.js';

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
  // **Opened on its name, not on a control.** A modal dialog focuses its first
  // focusable element, which in a settings dialog is the light switch -- drawn with a
  // focus ring as the dialog opened, as if it had been chosen. The title takes the
  // focus instead: a screen reader says what opened, nothing looks selected, and Tab
  // goes on to the controls.
  name.tabIndex = -1;
  name.autofocus = true;
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

let tips = 0;

/**
 * A (?) for the end of a heading, and the explanation it opens under that heading.
 *
 * Settings used to explain themselves in a paragraph under every heading, and a dialog
 * of them read as a manual; behind a (?) the form is the form and the why is one tap
 * away. Inline rather than floating, so it is never cut off by the dialog's edge and
 * never covers the control it explains -- and open is filled as well as announced,
 * two cues rather than one.
 * @param {...string} texts  the explanation, a paragraph each
 * @returns {{button: HTMLButtonElement, tip: HTMLElement}}
 */
export function helpTip(...texts) {
  const tip = document.createElement('div');
  tip.className = 'help-tip';
  tip.id = `help-tip-${tips += 1}`;
  tip.hidden = true;
  for (const text of texts) {
    const p = document.createElement('p');
    p.textContent = text;
    tip.append(p);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'help-toggle';
  button.textContent = '?';
  button.setAttribute('aria-label', t('settings.why'));
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', tip.id);
  button.addEventListener('click', () => {
    tip.hidden = !tip.hidden;
    button.setAttribute('aria-expanded', String(!tip.hidden));
  });
  return { button, tip };
}

/**
 * One choice of a few, as a row of pills: `Count over past ( week | month | year | all )`.
 *
 * A list of radio buttons spent a line on every option and read as a questionnaire.
 * The radios are still there, laid invisibly over the pills, so the platform's keyboard
 * and screen reader handling of a one-of-many choice comes with them, and the radio is
 * what a press lands on. The chosen pill is filled
 * and bold; each reserves its bold width, so choosing one does not widen the row.
 * Nothing is chosen where `value` matches no option, which is how a question nobody
 * has answered yet stays unanswered.
 * @param {{name: string, label: string, options: {value: string, label: string}[],
 *   value: string|undefined, onChange: (value: string) => void}} config
 */
export function pills({ name, label, options, value, onChange }) {
  const row = document.createElement('div');
  row.className = 'pill-row';
  const title = document.createElement('span');
  title.className = 'pill-name';
  title.textContent = label;
  const group = document.createElement('div');
  group.className = 'pills';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  for (const option of options) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = option.value;
    input.checked = option.value === value;
    input.className = 'pill-input';
    input.addEventListener('change', () => onChange(option.value));
    const text = document.createElement('span');
    text.textContent = option.label;
    text.dataset.label = option.label;
    const pill = document.createElement('label');
    pill.className = 'pill';
    pill.append(input, text);
    group.append(pill);
  }
  row.append(title, group);
  return row;
}
