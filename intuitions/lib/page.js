// Browser helpers shared by the gallery's pages: slider-and-number controls,
// width-aware redraws, dragging marks in a figure, Monte Carlo in a Web Worker, and
// window.Intuitions. The theme and its toggle are the site's, from shared/theme.js.

import { ENTRIES, IntuitionsError, submit } from '../api.js';

/**
 * Marks a field as invalid (aria-invalid="true", which also draws the red field style) or
 * clears the mark. The attribute is removed rather than left empty, since an empty
 * aria-invalid means false.
 * @param {HTMLElement} field
 * @param {boolean} invalid
 */
export function setInvalid(field, invalid) {
  if (invalid) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
}

/**
 * Keeps a range input and a number input in step. The number input accepts exact
 * values within its min and max (whole numbers only with `integer`; marked invalid
 * otherwise, and not applied); the range may be on a transformed scale (for example
 * log) via toRange / fromRange.
 * @param {{ range: HTMLInputElement, number: HTMLInputElement, onInput: (value: number) => void,
 *   toRange?: (value: number) => number, fromRange?: (position: number) => number, decimals?: number, integer?: boolean }} options
 */
export function bindPair({ range, number, onInput, toRange = (v) => v, fromRange = (p) => p, decimals = 2, integer = false }) {
  const min = Number(number.min);
  const max = Number(number.max);
  range.addEventListener('input', () => {
    const value = Number(fromRange(Number(range.value)).toFixed(decimals));
    number.value = String(value);
    setInvalid(number, false);
    onInput(value);
  });
  number.addEventListener('input', () => {
    const value = Number(number.value);
    const ok = number.value.trim() !== '' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value));
    setInvalid(number, !ok);
    if (!ok) return;
    range.value = String(toRange(value));
    onInput(value);
  });
  return {
    /** @param {number} value */
    set(value) {
      number.value = String(Number(value.toFixed(decimals)));
      setInvalid(number, false);
      range.value = String(toRange(value));
    },
  };
}

/**
 * Applies a whole-number field when it is within its min and max; marks it invalid
 * otherwise.
 * @param {HTMLInputElement} field
 * @param {(value: number) => void} apply
 */
export function integerField(field, apply) {
  field.addEventListener('input', () => {
    const v = Number(field.value);
    const ok = field.value.trim() !== '' && Number.isInteger(v) && v >= Number(field.min) && v <= Number(field.max);
    setInvalid(field, !ok);
    if (ok) apply(v);
  });
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
 * Runs requests through submit() in a Web Worker (lib/worker.js), so that Monte Carlo
 * does not freeze the page. Only the latest request counts: a new one ends the worker
 * if it is still busy and starts a fresh one, and the superseded promise never
 * settles, so a slider can be dragged freely.
 */
export function workerRunner() {
  /** @type {Worker | null} */
  let worker = null;
  let busy = false;
  return {
    /** @param {unknown} request @returns {Promise<{ entry: string, params: any, result: any }>} */
    run(request) {
      if (busy && worker) {
        worker.terminate();
        worker = null;
      }
      if (!worker) worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      const current = worker;
      busy = true;
      return new Promise((resolve, reject) => {
        current.onmessage = (event) => {
          busy = false;
          const { response, error } = event.data;
          if (error) reject(new IntuitionsError(error.code, error.message, error.issues));
          else resolve(response);
        };
        current.onerror = (event) => {
          busy = false;
          reject(new Error(event.message));
        };
        current.postMessage(request);
      });
    },
  };
}

/**
 * Installs window.Intuitions for a page. submit() is the shared entry point; when the
 * request is for this page's entry, the page also shows it, given the response's
 * params and result (an invalid request throws and leaves the page as it was).
 * @param {{ entry?: string, load?: (params: any, result: any) => void, getParams?: () => unknown }} page
 */
export function installApi(page) {
  const api = {
    entries: Object.keys(ENTRIES),
    IntuitionsError,
    /** @param {unknown} request */
    submit(request) {
      const response = submit(request);
      if (page.entry && response.entry === page.entry) page.load?.(response.params, response.result);
      return response;
    },
    getRequest: () => (page.entry ? { entry: page.entry, params: page.getParams?.() } : null),
    getResult: () => (page.entry ? submit({ entry: page.entry, params: page.getParams?.() }) : null),
  };
  Object.assign(window, { Intuitions: api });
  document.documentElement.dataset.ready = 'true';
  return api;
}
