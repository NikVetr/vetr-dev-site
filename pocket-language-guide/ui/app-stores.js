// The apps' two stores, offered from the web page: a badge for each beside Donate, and
// a smaller button that shows both stores' QR codes, for a reader at a computer who
// wants the app on their phone. Web only: inside an app they would offer the app the
// reader is already using.
//
// **Placeholders until the apps are listed, and `STORES` is all that changes then.**
// A store's `href` makes its badge a link; its `qr` -- a static SVG of the listing's
// code, such as `data/brand/qr-app-store.svg` -- takes the place of the dashed square
// in the dialog. Until then a badge links nowhere and says the app is coming, rather
// than opening a page that does not exist.

import { dialogHead } from './dialog.js';
import { t } from './i18n.js';
import { isNative } from './platform/shell.js';

const SVG = 'http://www.w3.org/2000/svg';

/** @param {string} viewBox @param {Record<string, string>[]} shapes  each a path's attributes */
function drawn(viewBox, shapes) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  for (const attrs of shapes) {
    const path = document.createElementNS(SVG, 'path');
    for (const [name, value] of Object.entries(attrs)) path.setAttribute(name, value);
    svg.append(path);
  }
  return svg;
}

/** The play triangle in its four colours, as flat pieces, the way the mark on the header is drawn. */
const playMark = () => drawn('0 0 24 24', [
  { d: 'M4 2.5 13 12 4 21.5Z', fill: '#2a8cf0' },
  { d: 'M4 2.5 15.6 9.2 13 12Z', fill: '#2fb463' },
  { d: 'M4 21.5 13 12l2.6 2.8Z', fill: '#e8453c' },
  { d: 'M15.6 9.2 20.5 12l-4.9 2.8L13 12Z', fill: '#f9bb15' },
]);

/** The blue tile with its "A" of three strokes. */
const appStoreMark = () => drawn('0 0 24 24', [
  { d: 'M6 1h12a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H6a5 5 0 0 1-5-5V6a5 5 0 0 1 5-5Z', fill: '#1c8ef9' },
  {
    d: 'M10.4 5.4 17 16.8M13.6 5.4 7 16.8M6 14.1h12',
    fill: 'none', stroke: '#fff', 'stroke-width': '1.9', 'stroke-linecap': 'round',
  },
]);

/** A QR code reduced to its idea: a square of four, dark on one diagonal and light on the other. */
const codesMark = () => drawn('0 0 16 16', [
  { d: 'M2.5 1.5h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4' },
  { d: 'M3.5 3.5H8V8H3.5ZM8 8h4.5v4.5H8Z', fill: 'currentColor' },
]);

/**
 * The two stores. `href` is the app's listing and `qr` the path of a static QR code
 * for it; both stay null until there is one.
 * @type {{id: string, name: string, noteKey: string, href: string|null, qr: string|null, mark: () => SVGSVGElement}[]}
 */
const STORES = [
  { id: 'google-play', name: 'Google Play', noteKey: 'gallery.storeAndroid', href: null, qr: null, mark: playMark },
  { id: 'app-store', name: 'App Store', noteKey: 'gallery.storeApple', href: null, qr: null, mark: appStoreMark },
];

/** @param {string} tag @param {string} className @param {(Node|string)[]} [kids] */
function el(tag, className, kids = []) {
  const node = document.createElement(tag);
  node.className = className;
  node.append(...kids);
  return node;
}

/**
 * A store's badge: its mark, and its name under "Coming soon" until it has a link.
 * The caption carries `data-i18n` so a change of reader language re-words it.
 * @param {typeof STORES[number]} store
 */
function badge(store) {
  const link = /** @type {HTMLAnchorElement} */ (el('a', 'store-badge'));
  link.dataset.store = store.id;
  const words = el('span', 'store-badge-words', [el('span', 'store-name', [store.name])]);
  if (store.href) {
    link.href = store.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer external';
  } else {
    const soon = el('span', 'store-soon', [t('gallery.storeSoon')]);
    soon.dataset.i18n = 'gallery.storeSoon';
    words.prepend(soon);
  }
  link.append(store.mark(), words);
  return link;
}

/** A store's QR code, or the dashed square that holds its place. @param {typeof STORES[number]} store */
function codeOf(store) {
  if (!store.qr) return el('div', 'store-code-soon', [t('gallery.storeCodeSoon')]);
  const image = document.createElement('img');
  image.className = 'store-code-image';
  image.src = store.qr;
  image.alt = t('gallery.storeCodeAlt', { store: store.name });
  return image;
}

/** Both stores' QR codes, each under its store's name and what it is for. */
function openCodes() {
  const title = t('gallery.storeCodesTitle');
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', 'speaker-settings store-codes'));
  panel.setAttribute('aria-label', title);
  const codes = STORES.map((store) => {
    const name = el('span', 'store-code-name', [store.mark(), store.name]);
    const figure = el('figure', 'store-code', [
      el('figcaption', '', [name, el('span', 'store-code-note', [t(store.noteKey)])]), codeOf(store),
    ]);
    figure.dataset.store = store.id;
    return figure;
  });
  panel.append(dialogHead({ title, close: t('gallery.previewClose'), onClose: () => panel.close() }),
    el('p', 'store-codes-lede', [t('gallery.storeCodesLede')]), el('div', 'store-codes-grid', codes));
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();
}

/**
 * The badges and the codes button, for the footer beside Donate; nothing inside an app.
 * @returns {HTMLElement[]}
 */
export function storeLinks() {
  if (isNative()) return [];
  const open = /** @type {HTMLButtonElement} */ (el('button', 'store-codes-open', [codesMark()]));
  open.type = 'button';
  open.setAttribute('aria-haspopup', 'dialog');
  open.setAttribute('aria-label', t('gallery.storeCodes'));
  open.title = t('gallery.storeCodes');
  open.dataset.i18nLabel = 'gallery.storeCodes';
  open.dataset.i18nTitle = 'gallery.storeCodes';
  open.addEventListener('click', openCodes);
  return [...STORES.map(badge), open];
}
