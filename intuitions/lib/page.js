// Browser helpers shared by the gallery's pages: the theme toggle, slider-and-number
// controls, width-aware redraws, dragging marks in a figure, and window.Intuitions.

import { ENTRIES, IntuitionsError, submit } from '../api.js';

const THEME_KEY = 'intuitions:theme';

/**
 * Wires the theme button. The page's head script has already set data-theme.
 * @param {HTMLButtonElement} button
 * @param {() => void} [onChange]
 */
export function initTheme(button, onChange) {
  const show = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    button.textContent = dark ? '☾ Dark' : '☀ Light';
    button.setAttribute('aria-pressed', String(dark));
    button.title = dark ? 'Switch to the light theme' : 'Switch to the dark theme';
  };
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable: the choice lasts for this page only */ }
    show();
    onChange?.();
  });
  show();
}

/**
 * Keeps a range input and a number input in step. The number input accepts exact
 * values within its min and max (marked invalid otherwise, and not applied); the
 * range may be on a transformed scale (for example log) via toRange / fromRange.
 * @param {{ range: HTMLInputElement, number: HTMLInputElement, onInput: (value: number) => void,
 *   toRange?: (value: number) => number, fromRange?: (position: number) => number, decimals?: number }} options
 */
export function bindPair({ range, number, onInput, toRange = (v) => v, fromRange = (p) => p, decimals = 2 }) {
  const min = Number(number.min);
  const max = Number(number.max);
  range.addEventListener('input', () => {
    const value = Number(fromRange(Number(range.value)).toFixed(decimals));
    number.value = String(value);
    number.removeAttribute('aria-invalid');
    onInput(value);
  });
  number.addEventListener('input', () => {
    const value = Number(number.value);
    const ok = number.value.trim() !== '' && Number.isFinite(value) && value >= min && value <= max;
    if (!ok) {
      number.setAttribute('aria-invalid', 'true');
      return;
    }
    number.removeAttribute('aria-invalid');
    range.value = String(toRange(value));
    onInput(value);
  });
  return {
    /** @param {number} value */
    set(value) {
      number.value = String(Number(value.toFixed(decimals)));
      number.removeAttribute('aria-invalid');
      range.value = String(toRange(value));
    },
  };
}

/**
 * Calls render(width) now and whenever the element's content width changes.
 * @param {HTMLElement} element
 * @param {(width: number) => void} render
 */
export function onWidth(element, render) {
  let last = -1;
  const run = () => {
    const width = Math.floor(element.clientWidth);
    if (width > 0 && width !== last) {
      last = width;
      render(width);
    }
  };
  new ResizeObserver(run).observe(element);
  run();
  return () => render(Math.floor(element.clientWidth));
}

/**
 * Dragging within a figure. Pointer capture goes to the persistent container, so the
 * figure can be redrawn on every move. onStart decides from the pressed element and
 * point whether a drag begins (return a truthy key), and onMove receives that key and
 * the pointer position in the container's pixels.
 * @param {HTMLElement} container
 * @param {{ onStart: (target: Element, x: number, y: number) => string | null, onMove: (key: string, x: number, y: number) => void, onEnd?: () => void }} handlers
 */
export function draggable(container, { onStart, onMove, onEnd }) {
  /** @type {string | null} */
  let key = null;
  const point = (/** @type {PointerEvent} */ event) => {
    const box = container.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  container.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const [x, y] = point(event);
    key = onStart(event.target, x, y);
    if (!key) return;
    event.preventDefault();
    container.setPointerCapture(event.pointerId);
    onMove(key, x, y);
  });
  container.addEventListener('pointermove', (event) => {
    if (!key) return;
    const [x, y] = point(event);
    onMove(key, x, y);
  });
  const end = () => {
    if (!key) return;
    key = null;
    onEnd?.();
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
}

/**
 * Installs window.Intuitions for a page. submit() is the shared entry point; when the
 * request is for this page's entry, the page also shows it (an invalid request
 * throws and leaves the page as it was).
 * @param {{ entry?: string, load?: (params: any) => void, getParams?: () => unknown, getResult?: () => unknown }} page
 */
export function installApi(page) {
  const api = {
    entries: Object.keys(ENTRIES),
    IntuitionsError,
    /** @param {unknown} request */
    submit(request) {
      const response = submit(request);
      if (page.entry && response.entry === page.entry) page.load?.(response.params);
      return response;
    },
    getRequest: () => (page.entry ? { entry: page.entry, params: page.getParams?.() } : null),
    getResult: () => (page.entry ? submit({ entry: page.entry, params: page.getParams?.() }) : null),
  };
  Object.assign(window, { Intuitions: api });
  document.documentElement.dataset.ready = 'true';
  return api;
}
