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

/** Google Translate's own codes where they differ from ours. */
const GOOGLE = /** @type {Record<string,string>} */ ({ 'zh-Hans': 'zh-CN', fil: 'tl', jv: 'jw' });

/**
 * A link that opens Google Translate set from one language to the other.
 *
 * A web address, on purpose: on a phone with the app installed the system hands it
 * to the app, and everywhere else it is the site -- one link that does the right
 * thing on each platform without asking which it is on. Apple's Translate publishes
 * no address a page can open, so there is no second link; the share sheet on an
 * iPhone offers it for any text the reader copies.
 * @param {string} from @param {string} to @param {string} label
 */
export function translatorLinks(from, to, label) {
  const p = document.createElement('p');
  p.className = 'board-links';
  const a = document.createElement('a');
  a.className = 'btn';
  a.href = `https://translate.google.com/?sl=${GOOGLE[from] ?? from}&tl=${GOOGLE[to] ?? to}&op=translate`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = `${label} \u2197`;
  p.append(a);
  return p;
}
