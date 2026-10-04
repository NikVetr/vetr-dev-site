// Finding a button by what it says, from anywhere in Converse.
//
// A reader who knows the sentence they want should not have to know which context
// and which screen it was put on. The search looks through every context this pair
// can use, every screen of each and every button on them -- the boards' own, less
// any the reader switched off, and the reader's own among them -- and shows the ones
// whose words contain what was typed, with those letters marked. Pressing one does
// what it would have done on its own screen.

import { placedOn } from './board-store.js';

/**
 * @typedef {import('../core/conversation.js').BoardButton} BoardButton
 * @typedef {{id:string, rootNodeId:string, nodes:Record<string, {buttons: BoardButton[]}>}} SearchBoard
 * @typedef {{board:string, path:string[], button:BoardButton}} Reached
 */

/**
 * A phrase of the reader's own as the button that says it -- or, for a screen of
 * theirs, the button that opens it.
 * @param {import('./board-store.js').CustomPhrase} p
 * @returns {BoardButton}
 */
export function ownButton(p) {
  return p.screen
    ? { id: p.id, kind: 'submenu', nodeId: p.id, colour: 'stay' }
    : { id: p.id, kind: 'message', colour: 'stay',
      phraseRef: p.concept ? { kind: 'corpus', id: p.concept } : { kind: 'custom', id: p.id } };
}

/**
 * Every button a reader can reach on these boards, with the screens that lead to it:
 * each screen's own buttons less the ones switched off there, then the reader's, and
 * down every submenu -- the board's and theirs. Breadth first, so a button reached
 * two ways is found by the shorter.
 * @param {SearchBoard[]} boards
 * @param {import('./board-store.js').BoardPersonal} data
 * @param {string} pair
 * @returns {Reached[]}
 */
export function reachable(boards, data, pair) {
  /** @type {Reached[]} */ const found = [];
  for (const board of boards) {
    const queue = [[board.rootNodeId]];
    const seen = new Set();
    for (let path = queue.shift(); path; path = queue.shift()) {
      const at = `${board.id}/${path.at(-1)}`;
      if (seen.has(at)) continue;
      seen.add(at);
      const hidden = data.hidden?.[at] ?? [];
      const buttons = [
        ...(board.nodes[/** @type {string} */ (path.at(-1))]?.buttons ?? []).filter((b) => !hidden.includes(b.id)),
        ...placedOn(data, at, pair).map(ownButton),
      ];
      for (const button of buttons) {
        found.push({ board: board.id, path, button });
        if (button.kind === 'submenu' && button.nodeId) queue.push([...path, button.nodeId]);
      }
    }
  }
  return found;
}

/**
 * Where `query` first occurs in `text`, as the reader's language compares letters:
 * case and accents aside, and kana as kana. Compared a window at a time, so the range
 * found is in the text as written, ready to mark.
 * @param {string} text @param {string} query @param {Intl.Collator} same
 * @returns {[number, number]|null}
 */
function where(text, query, same) {
  for (let i = 0; i + query.length <= text.length; i += 1) {
    if (same.compare(text.slice(i, i + query.length), query) === 0) return [i, i + query.length];
  }
  return null;
}

/**
 * The entries whose words contain the query, each with where: those that start with
 * it first, then those with a word that does, then the rest, shorter before longer.
 * @template {{label:string}} T
 * @param {T[]} entries @param {string} query @param {string} lang
 * @returns {(T & {at: [number, number]})[]}
 */
export function find(entries, query, lang) {
  const q = query.trim();
  if (!q) return [];
  const same = new Intl.Collator(lang, { usage: 'search', sensitivity: 'base' });
  /** @type {(T & {at: [number, number]})[]} */ const found = [];
  for (const entry of entries) {
    const at = where(entry.label, q, same);
    if (at) found.push({ ...entry, at });
  }
  const rank = (/** @type {T & {at: [number, number]}} */ f) => (f.at[0] === 0 ? 0
    : /[\s\p{P}]/u.test(f.label[f.at[0] - 1]) ? 1 : 2);
  return found.sort((a, b) => rank(a) - rank(b) || a.label.length - b.label.length);
}

/** @param {string} d */
function icon(d) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`;
  return svg;
}

/**
 * A row as a search field until it is closed: the field takes the whole row, and
 * each change of what is typed is handed on for the grid to show. Given a `value`, it
 * opens on that search already made and leaves the keyboard down.
 * @param {{bar: HTMLElement, lang: string, placeholder: string, closeLabel: string,
 *   onQuery: (query: string) => void, onClose: () => void, value?: string}} config
 * @returns {() => void} closes it
 */
export function openSearch({ bar, lang, placeholder, closeLabel, onQuery, onClose, value = '' }) {
  const form = document.createElement('form');
  form.className = 'board-search';
  form.setAttribute('role', 'search');
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'board-search-input';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  input.setAttribute('enterkeyhint', 'search');
  input.lang = lang;
  input.value = value;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'board-turn-bar board-search-close';
  close.setAttribute('aria-label', closeLabel);
  close.title = closeLabel;
  close.append(icon('M6 6l12 12M18 6L6 18'));
  form.append(input, close);
  // **The row keeps its height**, the field fitted inside it: a taller row took its
  // difference from the grid under it, and every button changed size as the search opened.
  const height = bar.style.blockSize;
  bar.style.blockSize = `${bar.getBoundingClientRect().height}px`;
  bar.classList.add('board-searching');
  bar.append(form);

  const end = () => {
    form.remove();
    bar.classList.remove('board-searching');
    bar.style.blockSize = height;
    onClose();
  };
  input.addEventListener('input', () => onQuery(input.value));
  // Enter puts the keyboard away, so the results it was covering can be seen.
  form.addEventListener('submit', (event) => { event.preventDefault(); input.blur(); });
  // Escape closes the search, and only the search: not also a step back out of the screen.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); end(); }
  });
  close.addEventListener('click', end);
  if (value) onQuery(value); else input.focus();
  return end;
}
