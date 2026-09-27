// Light or dark, and whose choice it is.
//
// The palette lives in style.css as `light-dark()` pairs and follows the device's
// scheme by default. A reader who wants otherwise says so once, in a settings
// dialog, and the choice is written to the root as `data-theme` -- from a script in
// each page's head before the first paint, so a dark reader never sees a white
// flash, and from here whenever it changes.

import * as store from './platform/store.js';
import { t } from './i18n.js';

const KEY = 'plg.theme';
/** `system` is no choice at all: nothing stored, and the device decides.
 * @typedef {'system'|'light'|'dark'} Theme */
const THEMES = /** @type {Theme[]} */ (['system', 'light', 'dark']);

/** @returns {Theme} */
export function readTheme() {
  const held = store.get(KEY);
  return THEMES.includes(/** @type {Theme} */ (held)) ? /** @type {Theme} */ (held) : 'system';
}

/** @param {Theme} theme */
export function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** @param {Theme} theme */
export function writeTheme(theme) {
  if (theme === 'system') store.remove(KEY); else store.set(KEY, theme);
  applyTheme(theme);
}

/** Whether the page is dark now: the reader's choice if they made one, else the device's. */
function isDark() {
  const held = readTheme();
  return held === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : held === 'dark';
}

const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor"/>'
  + '<path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"'
  + ' stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 14.6A8.5 8.5 0 0 1 9.4 3.8a8.5 8.5 0 1 0 10.8 10.8Z"'
  + ' fill="currentColor"/></svg>';

/**
 * The control: a light switch, light one way and dark the other.
 *
 * **No "match the device" position.** Until it is flipped the page follows the device
 * and the switch shows where the device has it; the first flip is a choice, kept from
 * then on. A three-way menu asked every reader to understand a setting most never
 * need. One element, so the dialogs and the studio's panel can each place it.
 */
export function themeControl() {
  return lightSwitch({
    label: t('theme.dark'),
    dark: isDark,
    flip: () => writeTheme(isDark() ? 'light' : 'dark'),
  }).button;
}

/**
 * The switch itself, for whatever it turns dark: the app here, a card in the studio.
 * `show` re-reads `dark` when something else has changed it.
 * @param {{label:string, dark:() => boolean, flip:() => void}} config
 */
export function lightSwitch({ label, dark, flip }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-switch';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', label);
  button.innerHTML = `${SUN}<span class="theme-switch-track"><span class="theme-switch-knob"></span></span>${MOON}`;
  const show = () => button.setAttribute('aria-checked', String(dark()));
  button.addEventListener('click', () => { flip(); show(); });
  show();
  return { button, show };
}

/** The board dialog's section: a heading and the control. */
export function themeSection() {
  const box = document.createElement('section');
  box.className = 'display-section';
  const heading = document.createElement('h3');
  heading.textContent = t('display.theme');
  box.append(heading, themeControl());
  return box;
}
