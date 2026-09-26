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
/** @typedef {'system'|'light'|'dark'} Theme */
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

/**
 * The control: a labelled select with the three choices, applying as it changes.
 * One element, so the board's dialog and the studio's panel can each place it.
 */
export function themeControl(labelled = true) {
  const label = document.createElement('label');
  label.className = 'theme-control';
  const name = document.createElement('span');
  name.textContent = t('display.theme');
  // Under a heading that already says Appearance the word is said once, by the
  // heading; the label still names the control for a screen reader.
  if (!labelled) { name.className = 'visually-hidden'; }
  const select = document.createElement('select');
  for (const theme of THEMES) {
    const option = document.createElement('option');
    option.value = theme;
    option.textContent = t(`theme.${theme}`);
    select.append(option);
  }
  select.value = readTheme();
  select.addEventListener('change', () => writeTheme(/** @type {Theme} */ (select.value)));
  label.append(name, select);
  return label;
}

/** The board dialog's section: a heading and the control. */
export function themeSection() {
  const box = document.createElement('section');
  box.className = 'display-section';
  const heading = document.createElement('h3');
  heading.textContent = t('display.theme');
  box.append(heading, themeControl(false));
  return box;
}
