// Browser helpers shared by the gallery's pages: slider-and-number controls,
// width-aware redraws, dragging marks in a figure, Monte Carlo in a Web Worker, playback
// controls, and window.Intuitions. The theme and its toggle are the site's, from shared/theme.js.

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
  // A responsive SVG can change its container's height. Draw after the observer
  // delivery finishes, so that height change is measured on the next frame.
  let pending = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(run);
  }).observe(element);
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
 * A Play/Pause button, a restart button, a position slider and a speed choice in
 * `#<id>-playback`. `max()` is the end; `discrete` plays whole steps of 1. Nothing moves
 * until Play is pressed. With reduced motion asked for, playback jumps a tenth of the way
 * at a time instead of moving continuously. `seconds` is the whole run at speed 1 (a number,
 * or a function for a run whose length changes), and
 * `speeds` the choices, as [value, label] with the default marked by a third entry true.
 * @param {string} id
 * @param {{ max: () => number, seconds: number | (() => number), discrete?: boolean, label: string, format: (t: number, max: number) => string, onTime: (t: number) => void,
 *   speeds?: [number, string, boolean?][], speedLabel?: string }} options
 */
export function playback(id, { max, seconds, discrete = false, label, format, onTime, speeds = [[0.5, '½×'], [1, '1×', true], [2, '2×']], speedLabel = 'Speed' }) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const box = /** @type {HTMLElement} */ (document.getElementById(`${id}-playback`));
  box.innerHTML = `
    <button type="button" class="play" id="${id}-play" aria-pressed="false"><span class="glyph" aria-hidden="true">▶</span> <span class="play-text">Play</span></button>
    <button type="button" id="${id}-restart">Back to the start</button>
    <label class="time-field" for="${id}-time">${label} <output id="${id}-time-out" for="${id}-time"></output></label>
    <input type="range" id="${id}-time" min="0" max="1" step="any">
    <label class="speed-field" for="${id}-speed">${speedLabel} <select id="${id}-speed">${speeds.map(([v, l, on]) => `<option value="${v}"${on ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <p class="hint reduced-note" id="${id}-reduced" hidden>Your system asks for reduced motion, so playback moves in steps.</p>`;
  const get = (/** @type {string} */ suffix) => /** @type {HTMLElement} */ (document.getElementById(`${id}-${suffix}`));
  const play = /** @type {HTMLButtonElement} */ (get('play'));
  const slider = /** @type {HTMLInputElement} */ (get('time'));
  const speed = /** @type {HTMLSelectElement} */ (get('speed'));
  const out = /** @type {HTMLOutputElement} */ (get('time-out'));
  let t = 0;
  let playing = false;
  let frame = 0;
  let timer = 0;
  const show = () => {
    const m = max();
    slider.max = String(m);
    slider.step = discrete ? '1' : String(m / 500);
    slider.value = String(t);
    out.textContent = format(t, m);
    play.setAttribute('aria-pressed', String(playing));
    /** @type {HTMLElement} */ (play.querySelector('.glyph')).textContent = playing ? '⏸' : '▶';
    /** @type {HTMLElement} */ (play.querySelector('.play-text')).textContent = playing ? 'Pause' : 'Play';
    get('reduced').hidden = !reducedMotion.matches;
  };
  const set = (/** @type {number} */ value) => {
    t = Math.max(0, Math.min(max(), value));
    show();
    onTime(t);
  };
  const stop = () => {
    playing = false;
    cancelAnimationFrame(frame);
    clearTimeout(timer);
    show();
  };
  const start = () => {
    const m = max();
    if (t >= m - 1e-9) set(0);
    playing = true;
    show();
    if (discrete || reducedMotion.matches) {
      const jump = discrete ? 1 : m / 10;
      const tick = () => {
        if (!playing) return;
        set(Math.min(m, discrete ? Math.floor(t + jump) : t + jump));
        if (t >= m - 1e-9) stop();
        else timer = window.setTimeout(tick, discrete ? 900 / Number(speed.value) : Math.max(450, 900 / Number(speed.value)));
      };
      timer = window.setTimeout(tick, discrete ? 600 / Number(speed.value) : 400);
      return;
    }
    let last = performance.now();
    const step = (/** @type {number} */ now) => {
      if (!playing) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      set(t + (dt * m * Number(speed.value)) / (typeof seconds === 'function' ? seconds() : seconds));
      if (t >= m - 1e-9) stop();
      else frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  play.addEventListener('click', () => (playing ? stop() : start()));
  get('restart').addEventListener('click', () => { stop(); set(0); });
  slider.addEventListener('input', () => {
    const value = Number(slider.value); // stop() redraws the slider, so read it first
    stop();
    set(value);
  });
  reducedMotion.addEventListener('change', show);
  return {
    get time() { return t; },
    /** After a new result: stop, and show the whole run. */
    reset() { stop(); t = max(); show(); },
    show,
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
