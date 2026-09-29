// The three bars in the site header, on every page.
//
// One control, one place, whatever page the reader is on: the appearance setting
// lived in the board's settings dialog and the studio's format panel, which is two
// places a reader of the gallery or the signal page could not reach it from. The
// header is where every phone puts its menu, so that is where it is. A page with a
// fuller settings dialog of its own -- the board -- passes that dialog in and the
// bars open it instead, so there is never a second settings screen beside the first.

import { t } from './i18n.js';
import { themeControl } from './theme.js';
import { isNative, readResume, RESUME_DEPTHS, writeResume } from './platform/shell.js';

/**
 * **Outside a dialog is the way out of it**, on every page, which is why it is here: every
 * page loads this module for its header, and no unit test does. A press on the backdrop
 * closes a modal as its close control does -- every modal here is a `<dialog>` -- but
 * only a press that began outside it as well, so a drag that started in a field and
 * ended past the dialog's edge does not throw away what was being typed.
 */
let pressedOutside = false;
/** @param {EventTarget|null} target @param {MouseEvent} event */
const outsideOf = (target, event) => {
  if (!(target instanceof HTMLDialogElement) || !target.open) return false;
  const box = target.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right
    || event.clientY < box.top || event.clientY > box.bottom;
};
document.addEventListener('pointerdown', (event) => { pressedOutside = outsideOf(event.target, event); });
document.addEventListener('click', (event) => {
  if (pressedOutside && outsideOf(event.target, event)) /** @type {HTMLDialogElement} */ (event.target).close();
  pressedOutside = false;
});

/** @param {() => void} [open]  what the bars open; the appearance dialog by default */
export function wireSiteMenu(open = () => openAppearance()) {
  const bars = document.getElementById('site-menu');
  if (!bars) return;
  bars.setAttribute('aria-label', t('settings.open'));
  bars.title = t('settings.open');
  bars.addEventListener('click', open);
  bars.hidden = false;
}

/** The plain settings: appearance, where the app opens, and whatever the page adds.
 * @param {HTMLElement[]} [extra] */
export function openAppearance(extra = []) {
  const panel = document.createElement('dialog');
  panel.className = 'speaker-settings site-settings';
  const head = document.createElement('h2');
  head.className = 'speaker-title';
  head.textContent = t('settings.title');
  panel.append(settingsCorner(panel), head, ...resumeSection(), ...extra);
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();
}

/**
 * A settings dialog's top corner: the dark-mode switch, then the small cross that
 * closes it. The switch is a setting of the whole app, the one every page's settings
 * share, so it sits with the dialog's own chrome rather than as a section of its own.
 * @param {HTMLDialogElement} panel
 */
export function settingsCorner(panel) {
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'speaker-close';
  close.setAttribute('aria-label', t('gallery.previewClose'));
  close.addEventListener('click', () => panel.close());
  const corner = document.createElement('div');
  corner.className = 'speaker-corner';
  corner.append(themeControl(), close);
  return corner;
}

/**
 * Which screen the app opens on again, in the app only: a browser tab restores
 * itself, and a web page that moved the reader somewhere on load would be a bug.
 */
export function resumeSection() {
  if (!isNative()) return [];
  const box = document.createElement('fieldset');
  box.className = 'speaker-block';
  const legend = document.createElement('legend');
  legend.textContent = t('resume.heading');
  box.append(legend);
  const held = readResume();
  for (const depth of RESUME_DEPTHS) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'resume';
    input.checked = depth === held;
    input.addEventListener('change', () => writeResume(depth));
    const label = document.createElement('label');
    label.className = 'speaker-option';
    label.append(input, t(`resume.${depth}`));
    box.append(label);
  }
  return [box];
}
