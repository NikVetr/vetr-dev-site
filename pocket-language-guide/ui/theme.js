// Light or dark, and whose choice it is.
//
// The palette lives in style.css as `light-dark()` pairs and follows the device's
// scheme by default. A reader who wants otherwise says so once, in a settings
// dialog, and the choice is written to the root as `data-theme` -- from a script in
// each page's head before the first paint, so a dark reader never sees a white
// flash, and from here whenever it changes.

import * as store from './platform/store.js';
import { t } from './i18n.js';
import { lightSwitch } from './light-switch.js';

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

/**
 * The control: a light switch, light one way and dark the other.
 *
 * **No "match the device" position.** Until it is flipped the page follows the device
 * and the switch shows where the device has it; the first flip is a choice, kept from
 * then on. A three-way menu asked every reader to understand a setting most never
 * need. One element, so the dialogs and the studio's phone menu can each place it.
 */
export function themeControl() {
  return lightSwitch({
    label: t('theme.dark'),
    dark: isDark,
    flip: () => writeTheme(isDark() ? 'light' : 'dark'),
  }).button;
}

/** The board dialog's section: a heading and the control. */
export function themeSection() {
  // No heading: one switch, sun on one side and moon on the other, says what it is.
  const box = document.createElement('section');
  box.className = 'display-section';
  box.append(themeControl());
  return box;
}
