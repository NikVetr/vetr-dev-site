// Before a trip: everything one pair of languages needs, loaded from this device and
// tried the way the boards use it, each ticked as it passes -- so a file that was
// never saved, a script this phone cannot draw or a missing voice is found at home,
// not at a ticket counter with no signal.

import { el } from './board-menu.js';

/**
 * @typedef {{state: 'pass'|'warn'|'fail', detail: string,
 *   action?: {label: string, run: () => Promise<unknown>}}} Outcome
 * @typedef {{label: string, run: () => Promise<Outcome>}} Check
 */

/** What each outcome is drawn with: a glyph as well as a colour, so neither is alone. */
const GLYPH = { running: '…', pass: '✓', warn: '!', fail: '✕' };

/**
 * Run the checks one after another in a dialog, each row marked as it finishes. A
 * check that throws has failed, and its message says why. An outcome with an action
 * offers it as a button, and the checks run again once it is done.
 * @param {{title: string, intro: string, close: string, checks: () => Check[],
 *   words: Record<keyof typeof GLYPH, string>}} config  `words` is what a screen
 *   reader says for each mark
 */
export function openTravelCheck({ title, intro, close, checks, words }) {
  const panel = /** @type {HTMLDialogElement} */ (el('dialog', { class: 'speaker-settings travel-check' }));
  const corner = el('button', { type: 'button', class: 'speaker-close', 'aria-label': close });
  corner.addEventListener('click', () => panel.close());
  const list = el('ol', { class: 'travel-check-list' });
  panel.append(corner, el('h2', { class: 'speaker-title', text: title }), el('p', { class: 'speaker-why', text: intro }), list);
  panel.addEventListener('close', () => panel.remove());
  document.body.append(panel);
  panel.showModal();

  const run = async () => {
    list.replaceChildren();
    for (const check of checks()) {
      const mark = el('span', { class: 'travel-check-mark', 'aria-hidden': 'true', text: GLYPH.running });
      const said = el('span', { class: 'visually-hidden', text: words.running });
      const detail = el('p', { class: 'travel-check-detail' });
      const row = el('li', { class: 'travel-check-row travel-check-running' },
        [mark, el('div', {}, [el('p', { class: 'travel-check-label', text: check.label }), detail]), said]);
      list.append(row);
      /** @type {Outcome} */ let outcome;
      try {
        outcome = await check.run();
      } catch (error) {
        outcome = { state: 'fail', detail: error instanceof Error ? error.message : String(error) };
      }
      row.className = `travel-check-row travel-check-${outcome.state}`;
      mark.textContent = GLYPH[outcome.state];
      said.textContent = words[outcome.state];
      detail.textContent = outcome.detail;
      if (outcome.action) {
        const { label, run: act } = outcome.action;
        const button = el('button', { type: 'button', class: 'btn', text: label });
        button.addEventListener('click', async () => { button.setAttribute('disabled', ''); await act(); run(); });
        row.append(button);
      }
    }
  };
  run();
}

/**
 * The characters this device has no glyph for in `font`. Each is drawn alone and
 * compared with a character no font has, whose drawing is the device's missing-glyph
 * box: a letter drawn exactly as that box is not a letter here. Letters and digits
 * only -- a mark or a joiner alone draws as nearly nothing whether it is supported
 * or not.
 * @param {string[]} chars  @param {string} font  a canvas font, as `32px system-ui`
 */
export function undrawable(chars, font) {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  g.font = font;
  g.textBaseline = 'middle';
  const draw = (/** @type {string} */ c) => {
    g.clearRect(0, 0, 48, 48);
    g.fillText(c, 8, 24);
    return g.getImageData(0, 0, 48, 48).data;
  };
  const box = draw('\u{10FFFD}');
  return chars.filter((c) => draw(c).every((v, i) => v === box[i]));
}
