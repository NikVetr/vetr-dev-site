// The page: plays a precomputed plan on a canvas, with transport, a stage timeline,
// the cube and face settings, a turnable 3-D view and exports. Every frame comes from
// the core's drawFrame, the same function submit() uses, so the screen, the PNG, the
// SVG and the API agree. window.Hypercube exposes submit() to scripts in the page.

import { attachRotation } from '../intuitions/lib/geom3d.js';
import {
  captionLayout, decodePlan, DEFAULT_CAMERA, drawFrame, FONT_FAMILY, HypercubeError, isDefaultCamera, normalizeRequest,
  NUMERAL_TEXTURE, SHIPPED_K, stageAt, stageLabel, STAGE_NAMES, submit,
} from './core/index.js';

/** @typedef {import('./core/plan.js').Plan} Plan */
/** @typedef {import('./core/draw.js').DrawList} DrawList */
/** @typedef {import('./core/geometry.js').Quat} Quat */

const $ = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
const canvas = /** @type {HTMLCanvasElement} */ ($('view'));
const context = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ALPHA_MIN = 0.001;

const state = {
  k: 9,
  /** @type {Plan | null} */
  plan: null,
  /** 1-based frame on show. */
  frame: 1,
  /** Playback position in frames from the loop start (fractional while playing). */
  position: 0,
  playing: false,
  speed: 1,
  /** @type {'translucent' | 'opaque'} */
  style: 'translucent',
  /** Face opacity, or null for the plan's (R's) default. @type {number | null} */
  faceAlpha: null,
  numerals: true,
  /** @type {Quat} */
  camera: [...DEFAULT_CAMERA],
  /** Bumped by every k change, so a slow plan load cannot overwrite a newer choice. */
  loadToken: 0,
};

// ---------- plans ----------

/** @type {Map<number, Promise<Plan>>} */
const planCache = new Map();
/** @param {number} k */
function loadPlan(k) {
  let pending = planCache.get(k);
  if (!pending) {
    pending = fetch(`plans/k${k}.json`)
      .then((response) => {
        if (!response.ok) throw new HypercubeError('plan_unavailable', `The k = ${k} plan could not be loaded (HTTP ${response.status})`);
        return response.text();
      })
      .then(decodePlan);
    pending.catch(() => planCache.delete(k));
    planCache.set(k, pending);
  }
  return pending;
}

// ---------- drawing ----------

const theme = () => /** @type {'light' | 'dark'} */ (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
const faceAlpha = () => state.faceAlpha ?? /** @type {Plan} */ (state.plan).colors.faceAlpha;

/** @param {number} size @param {number} frame */
function frameList(size, frame) {
  return drawFrame(/** @type {Plan} */ (state.plan), frame, {
    style: state.style, faceAlpha: faceAlpha(), numerals: state.numerals, theme: theme(), size, camera: state.camera,
  });
}

/**
 * Paints a draw list: faces in order (each numeral right after its face, as RGL's
 * texture is part of the face), then every edge in one stroke.
 * @param {CanvasRenderingContext2D} ctx @param {DrawList} list
 * @param {{ minEdge?: number, caption?: string }} [options]
 */
function paint(ctx, list, { minEdge = 0, caption } = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = list.background;
  ctx.fillRect(0, 0, list.size, list.size);
  const font = `${NUMERAL_TEXTURE.fontSize}px ${FONT_FAMILY}`;
  // Setting a style parses it, so set each only when it changes (translucent faces share one).
  let fill = '';
  let opacity = -1;
  for (const face of list.faces) {
    const p = face.points;
    if (face.opacity !== opacity) ctx.globalAlpha = opacity = face.opacity;
    if (face.fill !== fill) ctx.fillStyle = fill = face.fill;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(p[2], p[3]);
    ctx.lineTo(p[4], p[5]);
    ctx.lineTo(p[6], p[7]);
    ctx.closePath();
    ctx.fill();
    if (face.numeral) {
      const [a, b, c, d, e, f] = face.numeral.matrix;
      ctx.setTransform(a, b, c, d, e, f);
      ctx.fillStyle = fill = face.numeral.fill;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(face.numeral.text, NUMERAL_TEXTURE.size / 2, NUMERAL_TEXTURE.baseline);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  const s = list.edges.segments;
  ctx.globalAlpha = 1;
  if (s.length) {
    ctx.strokeStyle = list.edges.color;
    ctx.lineWidth = Math.max(list.edges.width, minEdge);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < s.length; i += 4) {
      ctx.moveTo(s[i], s[i + 1]);
      ctx.lineTo(s[i + 2], s[i + 3]);
    }
    ctx.stroke();
  }
  if (caption) {
    const c = captionLayout(list);
    ctx.font = `${c.fontSize}px ${FONT_FAMILY}`;
    ctx.fillStyle = c.fill;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(caption, c.x, c.y);
  }
}

function draw() {
  if (!state.plan || !canvas.width) return;
  const dpr = canvas.width / Math.max(1, canvas.clientWidth);
  // On screen, edges stay at least one CSS pixel wide however small the canvas.
  paint(context, frameList(canvas.width, state.frame), { minEdge: dpr });
  showFrame();
}

new ResizeObserver(() => {
  const size = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1));
  if (size > 0 && size !== canvas.width) {
    canvas.width = size;
    canvas.height = size;
    draw();
  }
  drawStages();
}).observe(/** @type {HTMLElement} */ (canvas.parentElement));

// ---------- stage heading, clock and timeline ----------

let shownStage = -1;
function showFrame() {
  const plan = /** @type {Plan} */ (state.plan);
  const stage = stageAt(plan, state.frame);
  if (stage.index !== shownStage) {
    shownStage = stage.index;
    $('stage-name').textContent = stageLabel(stage.dimension);
    $('stage-detail').textContent = stage.phase === 'full'
      ? `all ${plan.k} dimensions turning`
      : `${stage.dimension} of ${plan.k} dimensions · ${stage.phase === 'unfolding' ? '↑ unfolding' : '↓ folding'}`;
    for (const node of $('stages').querySelectorAll('[data-stage]')) {
      node.classList.toggle('now', Number(node.dataset.stage) === stage.index);
    }
    const outline = $('stages').querySelector('.stage-outline');
    const rect = $('stages').querySelector(`rect[data-stage="${stage.index}"]`);
    if (outline && rect) for (const key of ['x', 'y', 'width', 'height']) outline.setAttribute(key, rect.getAttribute(key));
  }
  const seconds = (state.frame - 1) / plan.stepsPerSecond;
  $('clock-frame').textContent = `frame ${state.frame} of ${plan.frames}`;
  $('clock-time').textContent = `· ${seconds.toFixed(2)} s of ${(plan.frames / plan.stepsPerSecond).toFixed(1)} s`;
  const timeline = $('timeline');
  if (Number(timeline.value) !== state.frame) timeline.value = String(state.frame);
  timeline.setAttribute('aria-valuetext', `frame ${state.frame} of ${plan.frames}, ${stageLabel(stage.dimension)}`);
}

/** The stage bar: one block per stage, as wide as it lasts and as tall as its dimension. */
function drawStages() {
  const plan = state.plan;
  const svg = $('stages');
  const width = svg.clientWidth;
  const height = svg.clientHeight;
  if (!plan || width <= 0) return;
  // The range thumb (6 px) travels between its half-widths, so the blocks do too.
  const inset = 3;
  const x = (/** @type {number} */ frame) => inset + ((frame - 1) / (plan.frames - 1)) * (width - 2 * inset);
  // Heights rise with the dimension, from one that holds its numeral.
  const top = 3;
  const lowest = 16;
  const parts = [];
  for (const stage of plan.stages) {
    const x0 = x(stage.start - 0.5 < 1 ? 1 : stage.start - 0.5);
    const x1 = x(Math.min(plan.frames, stage.start + stage.length - 0.5));
    const h = lowest + ((height - top - lowest) * (stage.dimension - 1)) / (plan.k - 1);
    const w = Math.max(0.5, x1 - x0);
    parts.push(`<rect class="stage" data-stage="${stage.index}" x="${x0.toFixed(2)}" y="${(height - h).toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}"/>`);
    // A narrow block gets a smaller numeral rather than none.
    const size = Math.min(11, (w - 1) / 0.6);
    if (size >= 5) {
      parts.push(`<text class="stage-number" data-stage="${stage.index}" x="${(x0 + w / 2).toFixed(2)}" y="${(height - 4).toFixed(2)}" style="font-size:${size.toFixed(1)}px">${stage.dimension}</text>`);
    }
  }
  parts.push('<rect class="stage-outline"/>');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = parts.join('');
  shownStage = -1;
  showFrame();
}

// ---------- playback ----------

/** @type {number | null} */
let lastTime = null;
/** @param {number} now */
function tick(now) {
  if (!state.playing || !state.plan) return;
  if (lastTime !== null) {
    // A long gap (a hidden tab) does not jump the loop ahead.
    const seconds = Math.min(0.25, (now - lastTime) / 1000);
    state.position = (state.position + seconds * state.plan.stepsPerSecond * state.speed) % state.plan.frames;
  }
  lastTime = now;
  const frame = Math.floor(state.position) + 1;
  if (frame !== state.frame) {
    state.frame = frame;
    draw();
  }
  requestAnimationFrame(tick);
}

function play() {
  if (state.playing || !state.plan) return;
  state.playing = true;
  state.position = state.frame - 1;
  lastTime = null;
  showPlaying();
  requestAnimationFrame(tick);
}

function pause() {
  state.playing = false;
  showPlaying();
}

function showPlaying() {
  const button = $('play');
  button.textContent = state.playing ? '❚❚ Pause' : '▶︎ Play';
  button.setAttribute('aria-pressed', String(state.playing));
}

/** @param {number} frame any integer; wraps around the loop */
function goTo(frame) {
  const plan = /** @type {Plan} */ (state.plan);
  state.frame = ((((frame - 1) % plan.frames) + plan.frames) % plan.frames) + 1;
  state.position = state.frame - 1;
  draw();
}

/** @param {number} by */
function step(by) {
  if (!state.plan) return;
  pause();
  goTo(state.frame + by);
}

$('play').addEventListener('click', () => (state.playing ? pause() : play()));
$('step-back').addEventListener('click', () => step(-1));
$('step-forward').addEventListener('click', () => step(1));
$('speed').addEventListener('change', () => { state.speed = Number($('speed').value); });
$('timeline').addEventListener('input', () => { if (state.plan) goTo(Number($('timeline').value)); });
document.addEventListener('keydown', (event) => {
  const target = /** @type {HTMLElement} */ (event.target);
  if (event.altKey || event.ctrlKey || event.metaKey || target.closest('input, select, textarea, button, summary, a')) return;
  if (event.key === ' ') {
    event.preventDefault();
    if (state.playing) pause(); else play();
  } else if (event.key === ',' || event.key === '.') {
    event.preventDefault();
    step(event.key === ',' ? -1 : 1);
  }
});

// ---------- cube, faces and view ----------

$('k').innerHTML = SHIPPED_K.map((k) => `<option value="${k}">${k} · ${STAGE_NAMES[k - 1]}</option>`).join('');

/** @param {number} k @param {{ fraction?: number, frame?: number }} [at] where to land in the new loop */
async function setK(k, at = {}) {
  const token = ++state.loadToken;
  state.k = k;
  $('k').value = String(k);
  const wasPlaying = state.playing;
  pause();
  $('loading').hidden = false;
  $('loading').textContent = `Loading the ${k}-dimensional plan…`;
  $('load-issues').hidden = true;
  let plan;
  try {
    plan = await loadPlan(k);
  } catch (error) {
    if (token !== state.loadToken) return;
    $('loading').hidden = true;
    listProblem($('load-issues'), `${/** @type {Error} */ (error).message}. Choose the dimensions again to retry.`);
    return;
  }
  if (token !== state.loadToken) return;
  state.plan = plan;
  $('loading').hidden = true;
  $('timeline').max = String(plan.frames);
  const frame = at.frame ?? Math.round((at.fraction ?? 0) * (plan.frames - 1)) + 1;
  state.frame = Math.min(plan.frames, Math.max(1, frame));
  state.position = state.frame - 1;
  showAlpha();
  drawStages();
  draw();
  if (wasPlaying) play();
}

$('k').addEventListener('change', () => {
  const fraction = state.plan ? (state.frame - 1) / (state.plan.frames - 1) : 0;
  setK(Number($('k').value), { fraction });
});

const styleRadios = /** @type {HTMLInputElement[]} */ ([...document.querySelectorAll('input[name="style"]')]);
/** @param {'translucent' | 'opaque'} style */
function setStyle(style) {
  state.style = style;
  for (const radio of styleRadios) radio.checked = radio.value === style;
  $('alpha-field').hidden = style !== 'translucent';
  $('numerals-field').hidden = style !== 'opaque';
  showView();
  draw();
}
for (const radio of styleRadios) radio.addEventListener('change', () => setStyle(/** @type {'translucent' | 'opaque'} */ (radio.value)));

// Opacity runs on a log scale from 0.001 to 1, so the faint values R suggests for many layers are reachable.
const alphaToSlider = (/** @type {number} */ a) => String(Math.log10(Math.max(ALPHA_MIN, a)) / 3 + 1);
const sliderToAlpha = (/** @type {number} */ v) => Number((10 ** (3 * (v - 1))).toPrecision(3));
$('alpha').min = '0';
$('alpha').max = '1';
$('alpha').step = '0.001';
function showAlpha() {
  if (!state.plan) return;
  const a = faceAlpha();
  $('alpha').value = alphaToSlider(a);
  $('alpha-value').textContent = a.toFixed(a < 0.01 ? 4 : 3);
  const base = state.plan.colors.faceAlpha;
  $('alpha-note').innerHTML = state.faceAlpha === null
    ? `R's default for ${state.plan.k} dimensions: 1/1.25<sup>${state.plan.k}</sup>.`
    : `R's default here is ${base.toFixed(3)}. <button type="button" id="alpha-reset">Use it</button>`;
  $('alpha-reset')?.addEventListener('click', () => { state.faceAlpha = null; showAlpha(); draw(); });
}
$('alpha').addEventListener('input', () => {
  state.faceAlpha = sliderToAlpha(Number($('alpha').value));
  showAlpha();
  draw();
});
$('numerals').addEventListener('change', () => { state.numerals = $('numerals').checked; showView(); draw(); });

const rotation = attachRotation(canvas, { get: () => state.camera, set: (q) => { state.camera = q; showView(); draw(); } });
for (const button of document.querySelectorAll('[data-turn]')) {
  button.addEventListener('click', () => rotation.turnBy(/** @type {any} */ (button).dataset.turn));
}
$('reset-view').addEventListener('click', () => { state.camera = [...DEFAULT_CAMERA]; showView(); draw(); });

function showView() {
  const turned = !isDefaultCamera(state.camera);
  const note = $('view-note');
  note.classList.toggle('turned', turned);
  $('reset-view').disabled = !turned;
  if (!turned) note.textContent = 'Default view: R\'s camera, looking straight down the depth axis. Drag the picture, or focus it and use the arrow keys, to turn it.';
  else if (state.style === 'opaque' && state.numerals) note.textContent = 'Turned view: numerals are hidden, as their changes were planned for the default view. Reset view brings them back.';
  else note.textContent = 'Turned view: the camera has moved around the 3-D shadow. Reset view returns to R\'s camera.';
}

// ---------- exports ----------

function exportSize() {
  const size = $('export-size').valueAsNumber;
  if (!Number.isInteger(size) || size < 16 || size > 4096) throw new HypercubeError('invalid_request', 'The export size must be a whole number of pixels from 16 to 4096', [{ code: 'out_of_range', path: 'size', message: 'must be from 16 to 4096' }]);
  return size;
}
const captionText = () => ($('export-caption').checked ? stageLabel(stageAt(/** @type {Plan} */ (state.plan), state.frame).dimension) : undefined);
const fileName = (/** @type {string} */ ext) => `hypercube-k${state.k}-frame${String(state.frame).padStart(4, '0')}.${ext}`;

/** The request the page's view describes (see api.md). */
function currentRequest() {
  return {
    k: state.k, frame: state.frame, style: state.style,
    ...(state.style === 'translucent' ? { faceAlpha: faceAlpha() } : { numerals: state.numerals }),
    theme: theme(), camera: [...state.camera],
  };
}

function exportSvgText() {
  if (!state.plan) throw new Error('The plan has not loaded yet.');
  const caption = $('export-caption').checked;
  return /** @type {{ svg: string }} */ (submit({ ...currentRequest(), render: 'svg', size: exportSize(), caption }, state.plan)).svg;
}

/** @returns {Promise<Blob>} */
function exportPngBlob() {
  if (!state.plan) return Promise.reject(new Error('The plan has not loaded yet.'));
  const size = exportSize();
  const offscreen = document.createElement('canvas');
  offscreen.width = size;
  offscreen.height = size;
  paint(/** @type {CanvasRenderingContext2D} */ (offscreen.getContext('2d')), frameList(size, state.frame), { caption: captionText() });
  return new Promise((resolve, reject) => offscreen.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'));
}

const WEBM_TYPE = typeof MediaRecorder === 'undefined' ? undefined
  : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
/** @type {AbortController | null} */
let recording = null;

/**
 * Records one loop as WebM at R's video rate (every `thin`-th frame, 30 fps), in real
 * time: each frame is painted on an offscreen canvas and handed to MediaRecorder on
 * schedule. A hidden tab would stretch the timing, so recording stops if the tab hides.
 * @param {{ signal?: AbortSignal, onProgress?: (done: number, total: number) => void, frames?: number }} [options]
 *   frames: record only the first n video frames (for tests)
 * @returns {Promise<Blob>}
 */
async function exportWebmBlob({ signal, onProgress, frames } = {}) {
  if (!state.plan) throw new Error('The plan has not loaded yet.');
  if (!WEBM_TYPE) throw new Error('This browser cannot record WebM video.');
  const plan = state.plan;
  const size = exportSize() - (exportSize() % 2);
  const offscreen = document.createElement('canvas');
  offscreen.width = size;
  offscreen.height = size;
  const ctx = /** @type {CanvasRenderingContext2D} */ (offscreen.getContext('2d'));
  const stream = offscreen.captureStream(0);
  const track = /** @type {CanvasCaptureMediaStreamTrack} */ (stream.getVideoTracks()[0]);
  const recorder = new MediaRecorder(stream, { mimeType: WEBM_TYPE, videoBitsPerSecond: 8_000_000 });
  /** @type {Blob[]} */
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  const total = Math.min(frames ?? Infinity, Math.ceil(plan.frames / plan.thin));
  const interval = (1000 * plan.thin) / plan.stepsPerSecond;
  const caption = $('export-caption').checked;
  recorder.start();
  const started = performance.now();
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new DOMException('Recording stopped.', 'AbortError');
      if (document.hidden) throw new Error('Recording stopped: the tab was hidden, which would have upset the timing.');
      const frame = 1 + i * plan.thin;
      paint(ctx, frameList(size, frame), { caption: caption ? stageLabel(stageAt(plan, frame).dimension) : undefined });
      track.requestFrame();
      onProgress?.(i + 1, total);
      const wait = started + (i + 1) * interval - performance.now();
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, wait)));
    }
  } finally {
    recorder.stop();
    await stopped;
    for (const t of stream.getTracks()) t.stop();
  }
  return new Blob(chunks, { type: 'video/webm' });
}

/** @param {string} name @param {Blob} blob */
function download(name, blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Shows one problem in an .issues box, as the shared list with its ⚠ marker. @param {HTMLElement} box @param {string} text */
function listProblem(box, text) {
  const list = document.createElement('ul');
  const item = document.createElement('li');
  item.textContent = text;
  list.append(item);
  box.replaceChildren(list);
  box.hidden = false;
}
/** @param {unknown} error */
const showExportProblem = (error) => listProblem($('export-issues'), /** @type {Error} */ (error).message);
const clearExportProblem = () => { $('export-issues').hidden = true; };

$('export-svg').addEventListener('click', () => {
  try {
    download(fileName('svg'), new Blob([exportSvgText()], { type: 'image/svg+xml' }));
    clearExportProblem();
  } catch (error) { showExportProblem(error); }
});
$('export-png').addEventListener('click', async () => {
  try {
    download(fileName('png'), await exportPngBlob());
    clearExportProblem();
  } catch (error) { showExportProblem(error); }
});
const webmButton = $('export-webm');
if (!WEBM_TYPE) {
  webmButton.disabled = true;
  $('export-status').textContent = 'This browser cannot record WebM video.';
}
webmButton.addEventListener('click', async () => {
  if (recording) {
    recording.abort();
    return;
  }
  const status = $('export-status');
  recording = new AbortController();
  webmButton.textContent = 'Stop recording';
  webmButton.setAttribute('aria-pressed', 'true');
  clearExportProblem();
  const k = state.k;
  try {
    const seconds = Math.round(/** @type {Plan} */ (state.plan).frames / /** @type {Plan} */ (state.plan).stepsPerSecond);
    const blob = await exportWebmBlob({ signal: recording.signal, onProgress: (done, total) => { status.textContent = `Recording in real time (${seconds} s): frame ${done} of ${total}.`; } });
    download(`hypercube-k${k}.webm`, blob);
    status.textContent = `Recorded one loop of the ${k}-dimensional cube.`;
  } catch (error) {
    // Stopping is the user's choice, not a problem.
    if (error instanceof DOMException && error.name === 'AbortError') status.textContent = 'Recording stopped; nothing was saved.';
    else {
      status.textContent = '';
      showExportProblem(error);
    }
  } finally {
    recording = null;
    webmButton.textContent = 'WebM of the loop';
    webmButton.removeAttribute('aria-pressed');
  }
});

// The theme toggle is /shared/theme.js's; the frame is drawn in theme colours.
document.addEventListener('themechange', draw);

// ---------- programmatic access ----------

Object.assign(window, { Hypercube: {
  /**
   * Runs a request (see api.md) and returns its result; also shows that frame on the
   * page, paused, with the request's k, style and camera. An invalid request rejects
   * with a HypercubeError and leaves the page as it was.
   * @param {Record<string, any>} request
   */
  async submit(request) {
    const settings = normalizeRequest(request);
    const plan = await loadPlan(settings.k);
    const result = submit(request, plan);
    pause();
    state.camera = settings.camera;
    state.faceAlpha = settings.faceAlpha;
    state.numerals = settings.numerals;
    $('numerals').checked = settings.numerals;
    state.style = settings.style;
    await setK(settings.k, { frame: result.frame });
    setStyle(settings.style);
    return result;
  },
  getRequest: currentRequest,
  isPlaying: () => state.playing,
  play,
  pause,
  /** @param {number} by frames, may be negative */
  step,
  exportSvgText,
  exportPngBlob,
  exportWebmBlob,
} });

// ---------- start ----------

showPlaying();
showView();
setStyle('translucent');
await setK(state.k);
if (state.plan) {
  if (reducedMotion) {
    // No autoplay: start paused at the middle of the full-dimensional stage, a still worth seeing.
    const full = /** @type {import('./core/plan.js').Stage} */ (state.plan.stages.find((s) => s.dimension === state.plan?.k));
    goTo(full.start + Math.floor(full.length / 2));
  } else play();
}
document.documentElement.dataset.ready = 'true';
