// The three bars in the site header, on every page.
//
// One control, one place, whatever page the reader is on: the appearance setting
// lived in the board's settings dialog and the studio's format panel, which is two
// places a reader of the gallery or the signal page could not reach it from. The
// header is where every phone puts its menu, so that is where it is. A page with a
// fuller settings dialog of its own -- the board -- passes that dialog in and the
// bars open it instead, so there is never a second settings screen beside the first.

import { t } from './i18n.js';
import { themeSection } from './theme.js';

/** @param {() => void} [open]  what the bars open; the appearance dialog by default */
export function wireSiteMenu(open = openAppearance) {
  const bars = document.getElementById('site-menu');
  if (!bars) return;
  bars.setAttribute('aria-label', t('settings.open'));
  bars.title = t('settings.open');
  bars.addEventListener('click', open);
}

function openAppearance() {
  const panel = document.createElement('dialog');
  panel.className = 'speaker-settings site-settings';
  const head = document.createElement('h2');
  head.className = 'speaker-title';
  head.textContent = t('settings.title');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'speaker-close';
  close.setAttribute('aria-label', t('gallery.previewClose'));
  close.textContent = '×';
  close.addEventListener('click', () => panel.close());
  panel.append(close, head, themeSection());
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();
}
