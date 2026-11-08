// The page: photos and a target read in this browser, a request for the core's submit(), which
// runs in a Web Worker (worker.js), and the mosaic drawn on a canvas from its result.
// window.Photomosaic exposes the same submit() to scripts and agents running in the page.

import { PhotomosaicError, SUMMARY_WIDTH, gridFor, layoutMosaic, summarisePhoto } from './core/index.js';
import { createHistory, bindHistoryShortcuts, bindFormHistory, captureForm, restoreForm } from '../shared/history.js';

/**
 * @typedef {import('./core/index.js').Result} Result
 * @typedef {import('./core/layout.js').Layout} Layout
 * @typedef {import('./core/layout.js').Tile} Tile
 * @typedef {import('./core/layout.js').Fit} Fit
 * @typedef {import('./core/request.js').Issue} Issue
 * @typedef {{ name: string, file: Blob, width: number, height: number, mean: number[], thumb: ImageBitmap }} Photo
 * @typedef {{ name: string, width: number, height: number, data: string }} Target
 * @typedef {{ tileWidth?: number, fit?: Fit, tint?: number }} DrawOptions
 */

/** Photos are halved in the browser until no wider than this, then summarised as in R. */
const SUMMARY_SOURCE_WIDTH = 2 * SUMMARY_WIDTH;
/** The longer side of the thumbnails the page draws the mosaic from. */
const THUMB = 128;
/** Targets are halved until neither side is longer than this. */
const TARGET_SIDE = 1600;
const METRIC_LABELS = /** @type {Record<string, string>} */ ({ 'hsl-r': 'HSL (hue first)', lab: 'CIELAB' });

const byId = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
/** @type {Record<string, any>} */
const el = {
  photoFiles: byId('photo-files'), photoFolder: byId('photo-folder'), folderButton: byId('folder-button'),
  photoCount: byId('photo-count'), photoProgress: byId('photo-progress'), photoStatus: byId('photo-status'),
  photoIssues: byId('photo-issues'), photoPreview: byId('photo-preview'), contactScroll: byId('contact-scroll'), contactSheet: byId('contact-sheet'), contactKey: byId('contact-key'),
  targetFile: byId('target-file'), targetPreview: byId('target-preview'), targetStatus: byId('target-status'),
  generate: byId('generate'), stop: byId('stop'), status: byId('status'), runProgress: byId('run-progress'), runIssues: byId('run-issues'),
  noResult: byId('no-result'), result: byId('result'), stale: byId('stale'),
  mosaic: byId('mosaic'), marker: byId('marker'), fit: byId('fit'), tint: byId('tint'), tintValue: byId('tint-value'),
  detail: byId('detail'), detailCaption: byId('detail-caption'), detailSize: byId('detail-size'),
  swatchCell: byId('swatch-cell'), swatchPhoto: byId('swatch-photo'), cellRgb: byId('cell-rgb'), photoRgb: byId('photo-rgb'),
  summary: byId('summary'), tileWidth: byId('tile-width'), exportSize: byId('export-size'),
  gridRule: byId('grid-rule'), columns: byId('columns'), maxUses: byId('max-uses'), metric: byId('metric'), seed: byId('seed'), gridNote: byId('grid-note'),
};

/** @type {Photo[]} */
let photos = [];
let photosVersion = 0;
/** @type {Target | null} */
let target = null;
let targetVersion = 0;
/** @type {Result | null} */
let result = null;
/** @type {object | null} */
let resultRequest = null;
/** The photos the result on view refers to. @type {Photo[]} */
let resultPhotos = [];
/** @type {ReturnType<typeof pageInputs> | null} */
let resultInputs = null;
let failed = false;
let selected = 0;
/** @type {Layout | null} */
let mosaicLayout = null;
/** @type {Worker | null} */
let worker = null;
/** @type {((error: Error) => void) | null} */
let cancelRun = null;
let revision = 0;
let photoLoad = 0;
let targetLoad = 0;
let selectionRevision = 0;
let historyReady = false;
let historyBatch = 0;
/** @type {Issue[]} */
let activeIssues = [];
const form = /** @type {HTMLElement} */ (document.querySelector('main'));

// ---------- reading pictures ----------

/** @param {CanvasImageSource} source @param {number} w @param {number} h */
function drawn(source, w, h) {
  const canvas = new OffscreenCanvas(w, h);
  // read back from, so kept in memory rather than on the GPU
  const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

/**
 * Halves a picture while `tooBig(width, height)`; returns it on a canvas.
 * @param {ImageBitmap | OffscreenCanvas} source @param {(w: number, h: number) => boolean} tooBig
 */
function halved(source, tooBig) {
  let canvas = source;
  let { width: w, height: h } = source;
  while (tooBig(w, h)) {
    w = Math.max(1, Math.round(w / 2));
    h = Math.max(1, Math.round(h / 2));
    canvas = drawn(canvas, w, h);
  }
  return canvas instanceof OffscreenCanvas ? canvas : drawn(canvas, w, h);
}

/** @param {OffscreenCanvas} canvas */
const pixelsOf = (canvas) => /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d')).getImageData(0, 0, canvas.width, canvas.height).data;

/** Reads a photo: its size, its summary as R takes it, and a thumbnail. @param {Blob} file @param {string} name @returns {Promise<Photo>} */
async function readPhoto(file, name) {
  const bitmap = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  try {
    const small = halved(bitmap, (w) => w > SUMMARY_SOURCE_WIDTH);
    const mean = summarisePhoto({ width: small.width, height: small.height, data: pixelsOf(small) });
    const nearThumb = halved(small, (w, h) => Math.max(w, h) > 2 * THUMB);
    const k = Math.min(1, THUMB / Math.max(nearThumb.width, nearThumb.height));
    const thumb = drawn(nearThumb, Math.max(1, Math.round(nearThumb.width * k)), Math.max(1, Math.round(nearThumb.height * k))).transferToImageBitmap();
    return { name, file, width: bitmap.width, height: bitmap.height, mean, thumb };
  } finally {
    bitmap.close();
  }
}

/**
 * Reads photos four at a time, showing progress; resolves with those read, in name order, and
 * the names of those that could not be.
 * @param {{ name: string, load: () => Promise<Blob> }[]} items
 * @param {()=>boolean} current
 */
async function readPhotos(items, current) {
  const sorted = [...items].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  /** @type {(Photo | null)[]} */
  const read = new Array(sorted.length).fill(null);
  /** @type {string[]} */
  const unreadable = [];
  let next = 0;
  let done = 0;
  el.photoProgress.hidden = false;
  el.photoProgress.max = sorted.length;
  const show = () => {
    if (!current()) return;
    el.photoProgress.value = done;
    el.photoStatus.textContent = `Reading photos: ${done} of ${sorted.length}`;
  };
  show();
  const lane = async () => {
    while (current() && next < sorted.length) {
      const i = next++;
      try {
        read[i] = await readPhoto(await sorted[i].load(), sorted[i].name);
      } catch {
        unreadable.push(sorted[i].name);
      }
      done++;
      show();
    }
  };
  await Promise.all([lane(), lane(), lane(), lane()]);
  if (current()) el.photoProgress.hidden = true;
  return { read: /** @type {Photo[]} */ (read.filter(Boolean)), unreadable };
}

/** @param {{ name: string, load: () => Promise<Blob> }[]} items @param {string} label @param {number} [version] */
async function setPhotosFrom(items, label, version = revision) {
  if (!items.length) return;
  if (version !== revision) return;
  const load = ++photoLoad;
  const current = () => version === revision && load === photoLoad;
  el.photoIssues.hidden = true;
  const { read, unreadable } = await readPhotos(items, current);
  if (!current()) { for (const photo of read) photo.thumb.close(); return; }
  if (read.length) { photos = read; photosVersion++; }
  el.photoStatus.textContent = `${label}: ${read.length.toLocaleString('en-US')} photo${read.length === 1 ? '' : 's'} read.`;
  if (unreadable.length) {
    const list = document.createElement('ul');
    list.append(Object.assign(document.createElement('li'), {
      textContent: `${unreadable.length} file${unreadable.length === 1 ? '' : 's'} could not be read as ${unreadable.length === 1 ? 'an image' : 'images'} by this browser and ${unreadable.length === 1 ? 'was' : 'were'} left out: ${unreadable.join(', ')}`,
    }));
    el.photoIssues.replaceChildren(list);
    el.photoIssues.hidden = false;
  }
  showPhotos();
  showStale();
  checkpoint();
}

const IMAGE_NAME = /\.(jpe?g|png|gif|bmp|webp|avif|heic|heif|tiff?)$/i;
/** @param {FileList} list */
const fileItems = (list) => [...list]
  .filter((f) => f.type.startsWith('image/') || IMAGE_NAME.test(f.name))
  .map((f) => ({ name: f.webkitRelativePath || f.name, load: async () => f }));

el.photoFiles.addEventListener('change', async () => {
  await setPhotosFrom(fileItems(el.photoFiles.files), 'Chosen photos');
  el.photoFiles.value = '';
});
if ('webkitdirectory' in el.photoFolder) {
  el.folderButton.hidden = false;
  el.photoFolder.addEventListener('change', async () => {
    const items = fileItems(el.photoFolder.files);
    if (!items.length) el.photoStatus.textContent = 'That folder has no pictures in it.';
    await setPhotosFrom(items, 'Chosen folder');
    el.photoFolder.value = '';
  });
}

/** Reads a target picture, halved if large, for the request and the preview. @param {Blob} file @param {string} name @param {number} [version] @param {number} [loadId] */
async function readTarget(file, name, version = revision, loadId) {
  if (version !== revision) return;
  const load = loadId ?? ++targetLoad;
  if (load !== targetLoad) return;
  const bitmap = await createImageBitmap(file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  try {
    if (version !== revision || load !== targetLoad) return;
    const canvas = halved(bitmap, (w, h) => Math.max(w, h) > TARGET_SIDE);
    const pixels = pixelsOf(canvas);
    let binary = '';
    for (let i = 0; i < pixels.length; i += 0x8000) binary += String.fromCharCode(...pixels.subarray(i, i + 0x8000));
    target = { name, width: canvas.width, height: canvas.height, data: btoa(binary) };
    targetVersion++;
    const preview = el.targetPreview;
    const width = Math.min(480, canvas.width);
    preview.width = width;
    preview.height = Math.max(1, Math.round((width * canvas.height) / canvas.width));
    const ctx = preview.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, preview.width, preview.height);
    preview.style.width = `${Math.min(240, width)}px`;
    const halvedNote = canvas.width !== bitmap.width ? ` (halved from ${bitmap.width} × ${bitmap.height})` : '';
    el.targetStatus.textContent = `${name}: ${canvas.width} × ${canvas.height} pixels${halvedNote}.`;
  } finally {
    bitmap.close();
  }
  showGridNote();
  showStale();
  checkpoint();
}

el.targetFile.addEventListener('change', async () => {
  const version = revision;
  const file = el.targetFile.files?.[0];
  el.targetFile.value = '';
  if (!file) return;
  try {
    await readTarget(file, file.name);
  } catch {
    if (version !== revision) return;
    el.targetStatus.textContent = `${file.name} could not be read as an image by this browser; the target is unchanged.`;
  }
});

// ---------- the example ----------

/** @type {{ target: string, photos: string[] } | null} */
let manifest = null;
/** @returns {Promise<{ target: string, photos: string[] }>} */
const getManifest = async () => (manifest ??= await (await fetch('examples/manifest.json')).json());
const fetchBlob = async (/** @type {string} */ path) => {
  const response = await fetch(`examples/${path}`);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.blob();
};

async function examplePhotos() {
  const version = revision;
  const m = await getManifest();
  await setPhotosFrom(m.photos.map((path) => ({ name: path.replace(/^photos\//, ''), load: () => fetchBlob(path) })), 'Example photos', version);
}
async function exampleTarget() {
  const version = revision;
  const load = ++targetLoad;
  const m = await getManifest();
  await readTarget(await fetchBlob(m.target), 'Example: Hokusai, Red Fuji', version, load);
}
byId('photos-example').addEventListener('click', examplePhotos);
byId('target-example').addEventListener('click', exampleTarget);
byId('sunflower-example').addEventListener('click', async () => {
  const version = revision;
  const load = ++targetLoad;
  historyBatch++;
  const button = byId('sunflower-example');
  button.disabled = true;
  try {
    await Promise.all([examplePhotos(), readTarget(await fetchBlob('sunflower.jpg'), 'Example: Sunflower', version, load)]);
    if (version !== revision) return;
    el.gridRule.value = 'columns';
    el.columns.value = '40';
    el.maxUses.value = '3';
    el.metric.value = 'hsl-r';
    el.seed.value = '1';
    el.fit.value = 'keep';
    el.tint.value = '45';
    el.tint.dispatchEvent(new Event('input'));
    showGridNote();
    showStale();
    await generate();
  } catch (error) {
    if (version !== revision) return;
    el.targetStatus.textContent = `Sunflower example failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    if (version === revision) { historyBatch--; checkpoint(); button.disabled = false; }
  }
});

// ---------- request <-> page ----------

function settings() {
  return {
    columns: el.gridRule.value === 'auto' ? null : el.columns.valueAsNumber,
    maxUses: el.maxUses.valueAsNumber,
    metric: el.metric.value,
    seed: el.seed.valueAsNumber,
  };
}

/** The request the page's photos, target and settings describe (see api.md). */
function currentRequest() {
  return {
    ...(target && { target: { width: target.width, height: target.height, data: target.data } }),
    photos: photos.map((p) => ({ name: p.name, mean: p.mean })),
    ...settings(),
  };
}

function pageInputs() {
  return { photosVersion, targetVersion, settings: JSON.stringify(settings()) };
}

/** Says whether, and why, the mosaic on view no longer matches the inputs. */
function showStale() {
  const now = pageInputs();
  const parts = !result || !resultInputs ? [] : [
    now.photosVersion !== resultInputs.photosVersion && 'photos',
    now.targetVersion !== resultInputs.targetVersion && 'target',
    now.settings !== resultInputs.settings && 'matching settings',
  ].filter(Boolean);
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  const reason = failed
    ? 'the last run failed (see the problems above). This is the mosaic made before it.'
    : what ? `the ${what} changed since this mosaic was made; press Generate to update it.` : '';
  el.stale.hidden = !reason;
  el.stale.textContent = reason ? `Out of date: ${reason}` : '';
  el.result.toggleAttribute('data-stale', Boolean(reason));
  drawContactSheet();
}

/** The grid the settings give, or why there is none, under the settings. */
function showGridNote() {
  el.columns.disabled = el.gridRule.value === 'auto';
  const s = settings();
  el.gridNote.classList.remove('problem');
  if (!target || !photos.length) {
    el.gridNote.textContent = 'Choose photos and a target to see the grid.';
    return;
  }
  if (!Number.isInteger(s.maxUses) || s.maxUses < 1 || (s.columns !== null && (!Number.isInteger(s.columns) || s.columns < 1))) {
    el.gridNote.textContent = 'Columns and uses per photo are whole numbers from 1.';
    el.gridNote.classList.add('problem');
    return;
  }
  try {
    const grid = gridFor({ count: photos.length, width: target.width, height: target.height, columns: s.columns, maxUses: s.maxUses });
    const cells = grid.rows * grid.columns;
    const left = photos.length * s.maxUses - cells;
    const rest = s.maxUses === 1
      ? `${left.toLocaleString('en-US')} left out`
      : `each used at most ${s.maxUses} times`;
    el.gridNote.textContent = `${grid.columns} columns × ${grid.rows} rows = ${cells.toLocaleString('en-US')} cells for ${photos.length.toLocaleString('en-US')} photos (${rest}).`;
  } catch (error) {
    if (!(error instanceof PhotomosaicError)) throw error;
    el.gridNote.textContent = error.issues[0].message.replace(/^./, (c) => c.toUpperCase());
    el.gridNote.classList.add('problem');
  }
}

byId('settings-card').addEventListener('input', () => {
  showGridNote();
  showStale();
});

// ---------- running ----------

/**
 * Runs a request in the worker. Resolves with the result; rejects with a PhotomosaicError, or
 * an Error if stopped.
 * @param {object} request
 * @returns {Promise<Result>}
 */
function run(request) {
  stopRun();
  const started = performance.now();
  const w = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
  worker = w;
  setRunning(true);
  el.status.textContent = 'Matching…';
  el.runProgress.value = 0;
  el.runProgress.hidden = false;
  return new Promise((resolve, reject) => {
    const finish = () => {
      w.terminate();
      if (worker === w) {
        worker = null;
        cancelRun = null;
        setRunning(false);
        el.runProgress.hidden = true;
      }
    };
    cancelRun = (error) => {
      finish();
      el.status.textContent = 'Stopped';
      reject(error);
    };
    w.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        el.runProgress.max = data.progress.rows;
        el.runProgress.value = data.progress.rowsDone;
        el.status.textContent = `Matching: ${data.progress.rowsDone.toLocaleString('en-US')} of ${data.progress.rows.toLocaleString('en-US')} cells placed`;
      } else if (data.type === 'result') {
        finish();
        el.status.textContent = `Done in ${((performance.now() - started) / 1000).toFixed(1)} s`;
        resolve(data.result);
      } else {
        finish();
        el.status.textContent = 'Not run';
        reject(new PhotomosaicError(data.error.code, data.error.message, data.error.issues));
      }
    };
    w.onerror = (event) => {
      finish();
      el.status.textContent = 'Failed';
      reject(new Error(`the worker failed: ${event.message}`));
    };
    w.postMessage({ request });
  });
}

function stopRun() {
  cancelRun?.(new Error('stopped'));
}

/** @param {boolean} running */
function setRunning(running) {
  el.generate.disabled = running;
  el.stop.disabled = !running;
}

/** Runs the page's own request and shows its mosaic; a failure is listed and leaves the last mosaic on view. */
async function generate() {
  const version = revision;
  const request = currentRequest();
  const inputs = pageInputs();
  const runPhotos = photos;
  el.runIssues.hidden = true;
  activeIssues = [];
  markFields([]);
  try {
    const next = await run(request);
    if (version !== revision) throw new Error('stopped');
    showResult(next, request, inputs, runPhotos);
    checkpoint();
    return next;
  } catch (error) {
    if (version === revision && error instanceof PhotomosaicError) {
      showIssues(error);
      failed = true;
      showStale();
    }
    throw error;
  }
}

el.generate.addEventListener('click', () => generate().catch(() => {}));
el.stop.addEventListener('click', stopRun);

// ---------- issues ----------

const FIELDS = /** @type {Record<string, HTMLInputElement>} */ ({ columns: el.columns, maxUses: el.maxUses, metric: el.metric, seed: el.seed });

/** Where a problem is, in the page's words. @param {Issue} issue */
function describe(issue) {
  if (issue.path === 'target' || issue.path.startsWith('target.')) return `Target picture: ${issue.code === 'missing_field' ? 'choose one' : issue.message}`;
  const photo = /^photos\[(\d+)\]/.exec(issue.path);
  if (photo) return `Photo ${photos[Number(photo[1])]?.name ?? Number(photo[1]) + 1}: ${issue.message}`;
  if (issue.path === 'photos') return `Photos: ${issue.code === 'wrong_type' ? 'choose some' : issue.message}`;
  const field = FIELDS[issue.path];
  if (field) return `${/** @type {HTMLLabelElement} */ (field.closest('label')).firstChild?.textContent?.trim()}: ${issue.message}`;
  return issue.message;
}

/** @param {PhotomosaicError} error */
function showIssues(error) {
  const issues = error.issues.length ? error.issues : [{ code: error.code, path: '', message: error.message }];
  activeIssues = issues.map(issue => ({ ...issue }));
  markFields(issues);
  const list = document.createElement('ul');
  list.replaceChildren(...issues.map((issue) => Object.assign(document.createElement('li'), { textContent: describe(issue) })));
  el.runIssues.replaceChildren(list);
  el.runIssues.hidden = false;
}

/** @param {Issue[]} issues */
function markFields(issues) {
  for (const [path, field] of Object.entries(FIELDS)) {
    if (issues.some((issue) => issue.path === path)) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }
}

// ---------- the result ----------

/** @param {Result} next @param {object} request @param {ReturnType<typeof pageInputs>} inputs @param {Photo[]} runPhotos */
function showResult(next, request, inputs, runPhotos) {
  // the middle cell at first, so the close up starts inside the picture
  if (!result || selected >= next.grid.cells) selected = Math.floor(next.grid.rows / 2) * next.grid.columns + Math.floor(next.grid.columns / 2);
  result = next;
  resultRequest = request;
  resultInputs = inputs;
  resultPhotos = runPhotos;
  failed = false;
  el.noResult.hidden = true;
  el.result.hidden = false;
  showSummary();
  drawAll();
  showStale();
  document.documentElement.dataset.ready = 'true';
}

function showSummary() {
  if (!result) return;
  const { grid, photos: used, settings: s, cost, timings } = result;
  const number = (/** @type {number} */ x) => x.toLocaleString('en-US', { maximumSignificantDigits: 6 });
  const rows = [
    ['Grid', `${grid.columns} columns × ${grid.rows} rows = ${grid.cells.toLocaleString('en-US')} cells (${grid.rule === 'auto' ? 'automatic grid' : 'columns set'})`],
    ['Photos used', `${used.used.toLocaleString('en-US')} of ${used.count.toLocaleString('en-US')}, ${s.maxUses === 1 ? 'each once' : `each at most ${s.maxUses} times`}`],
    ['Colour match', METRIC_LABELS[s.metric]],
    ['Total cost', number(cost.total)],
    ['Mean cost per cell', number(cost.mean)],
    ['Time', `${(timings.totalMs / 1000).toFixed(2)} s`],
  ];
  el.summary.replaceChildren(...rows.map(([k, v]) => {
    const tr = document.createElement('tr');
    tr.append(Object.assign(document.createElement('th'), { scope: 'row', textContent: k }), Object.assign(document.createElement('td'), { textContent: v }));
    return tr;
  }));
}

/** The drawing options on the page. @returns {{ fit: Fit, tint: number }} */
const drawOptions = () => ({ fit: el.fit.value, tint: el.tint.valueAsNumber / 100 });
const view = () => /** @type {HTMLInputElement} */ (document.querySelector('input[name="view"]:checked')).value;
/** @param {ArrayLike<number>} c */
const rgb = (c) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;

/**
 * Draws one tile at (tile.x - dx, tile.y - dy): its photo, then the tint; or, in the cells
 * view, the cell's colour.
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx @param {Tile} tile
 * @param {CanvasImageSource & { width: number }} image the photo, or a smaller copy of it
 * @param {{ tint: number, cells?: boolean, result?: Result|null, photos?: Photo[] }} options @param {number} [dx] @param {number} [dy]
 */
function drawTile(ctx, tile, image, { tint, cells = false, result: painted = result, photos: assets = resultPhotos }, dx = 0, dy = 0) {
  const r = /** @type {Result} */ (painted);
  const cell = r.cells[tile.cell];
  if (cells) {
    ctx.fillStyle = rgb(cell);
    ctx.fillRect(tile.x - dx, tile.y - dy, tile.width, tile.height);
    return;
  }
  const k = image.width / assets[tile.photo].width;
  const [sx, sy, sw, sh] = tile.source;
  ctx.drawImage(image, sx * k, sy * k, sw * k, sh * k, tile.x - dx, tile.y - dy, tile.width, tile.height);
  if (tint > 0) {
    ctx.globalAlpha = tint;
    ctx.fillStyle = rgb(cell);
    ctx.fillRect(tile.x - dx, tile.y - dy, tile.width, tile.height);
    ctx.globalAlpha = 1;
  }
}

function drawMosaic() {
  if (!result) return;
  const dpr = window.devicePixelRatio || 1;
  const width = el.mosaic.parentElement.clientWidth;
  const tileWidth = Math.max(1, Math.floor((width * dpr) / result.grid.columns));
  const { fit, tint } = drawOptions();
  const layout = layoutMosaic(result.grid, result.assignment, resultPhotos, { tileWidth, fit });
  el.mosaic.width = layout.width;
  el.mosaic.height = layout.height;
  el.mosaic.style.width = `${layout.width / dpr}px`;
  const ctx = el.mosaic.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, layout.width, layout.height);
  const cells = view() === 'cells';
  for (const tile of layout.tiles) drawTile(ctx, tile, resultPhotos[tile.photo].thumb, { tint, cells });
  mosaicLayout = layout;
  el.mosaic.setAttribute('aria-label', `${cells ? 'The target at one colour per cell' : 'The mosaic'}: ${result.grid.columns} columns by ${result.grid.rows} rows`);
  placeMarker();
}

function placeMarker() {
  if (!mosaicLayout) return;
  const tile = mosaicLayout.tiles[selected];
  const { width, height } = mosaicLayout;
  Object.assign(el.marker.style, {
    left: `${(100 * tile.x) / width}%`, top: `${(100 * tile.y) / height}%`,
    width: `${(100 * tile.width) / width}%`, height: `${(100 * tile.height) / height}%`,
  });
}

/** The cells around the selected one, larger, and what was matched there. */
function drawDetail() {
  if (!result) return;
  const { rows, columns } = result.grid;
  const k = Number(el.detailSize.value);
  const row = Math.floor(selected / columns);
  const column = selected % columns;
  const r0 = Math.max(0, Math.min(rows - k, row - Math.floor(k / 2)));
  const c0 = Math.max(0, Math.min(columns - k, column - Math.floor(k / 2)));
  const r1 = Math.min(rows, r0 + k);
  const c1 = Math.min(columns, c0 + k);
  const dpr = window.devicePixelRatio || 1;
  const tileWidth = Math.max(1, Math.floor(((el.detail.clientWidth || 320) * dpr) / (c1 - c0)));
  const { fit, tint } = drawOptions();
  const layout = layoutMosaic(result.grid, result.assignment, resultPhotos, { tileWidth, fit });
  const top = layout.rowTops[r0];
  el.detail.width = tileWidth * (c1 - c0);
  el.detail.height = layout.rowTops[r1] - top;
  const ctx = el.detail.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, el.detail.width, el.detail.height);
  const cells = view() === 'cells';
  for (const tile of layout.tiles) {
    const r = Math.floor(tile.cell / columns);
    const c = tile.cell % columns;
    if (r >= r0 && r < r1 && c >= c0 && c < c1) drawTile(ctx, tile, resultPhotos[tile.photo].thumb, { tint, cells }, c0 * tileWidth, top);
  }
  const tile = layout.tiles[selected];
  const ring = Math.max(2, Math.round(dpr * 2));
  ctx.lineWidth = ring;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(tile.x - c0 * tileWidth + ring / 2, tile.y - top + ring / 2, tile.width - ring, tile.height - ring);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(tile.x - c0 * tileWidth + 1.5 * ring, tile.y - top + 1.5 * ring, tile.width - 3 * ring, tile.height - 3 * ring);

  const photo = resultPhotos[result.assignment[selected]];
  const cell = result.cells[selected];
  el.detailCaption.textContent = `Row ${row + 1}, column ${column + 1}: ${photo.name}, cost ${result.cost.perCell[selected].toLocaleString('en-US', { maximumSignificantDigits: 5 })}.`;
  el.swatchCell.style.background = rgb(cell);
  el.swatchPhoto.style.background = rgb(photo.mean);
  el.cellRgb.textContent = `rgb ${cell.slice(0, 3).join(', ')}`;
  el.photoRgb.textContent = `rgb ${photo.mean.slice(0, 3).map((v) => v.toFixed(1)).join(', ')} (mean)`;
}

/** The photos, small, with those the mosaic on view leaves out faded and struck through. */
function drawContactSheet() {
  el.photoPreview.hidden = !photos.length;
  el.contactScroll.hidden = !photos.length;
  if (!photos.length || !el.photoPreview.open) return;
  const dpr = window.devicePixelRatio || 1;
  const size = 30;
  const perRow = Math.max(1, Math.floor(el.contactScroll.clientWidth / size));
  const canvas = el.contactSheet;
  canvas.width = perRow * size * dpr;
  canvas.height = Math.ceil(photos.length / perRow) * size * dpr;
  canvas.style.width = `${perRow * size}px`;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  const uses = result && resultPhotos === photos && el.stale.hidden ? result.uses : null;
  let unused = 0;
  photos.forEach((p, i) => {
    const x = (i % perRow) * size * dpr;
    const y = Math.floor(i / perRow) * size * dpr;
    const side = Math.min(p.thumb.width, p.thumb.height);
    const inner = (size - 2) * dpr;
    const left = uses?.[i] === 0;
    if (left) unused++;
    ctx.globalAlpha = left ? 0.3 : 1;
    ctx.drawImage(p.thumb, (p.thumb.width - side) / 2, (p.thumb.height - side) / 2, side, side, x + dpr, y + dpr, inner, inner);
    ctx.globalAlpha = 1;
    if (left) {
      ctx.strokeStyle = getComputedStyle(document.body).color;
      ctx.lineWidth = 2 * dpr;
      ctx.beginPath();
      ctx.moveTo(x + dpr, y + dpr + inner);
      ctx.lineTo(x + dpr + inner, y + dpr);
      ctx.stroke();
    }
  });
  el.contactKey.hidden = !unused;
  canvas.setAttribute('aria-label', `${photos.length} photos${unused ? `, ${unused} of them not used in the mosaic on view` : ''}`);
}

function showPhotos() {
  el.photoCount.textContent = photos.length ? `${photos.length.toLocaleString('en-US')} photos` : '';
  drawContactSheet();
  showGridNote();
}

function showExportSize() {
  if (!result) return;
  const tileWidth = el.tileWidth.valueAsNumber;
  if (!Number.isInteger(tileWidth) || tileWidth < 1) {
    el.exportSize.textContent = 'a whole number of pixels';
    return;
  }
  const layout = layoutMosaic(result.grid, result.assignment, resultPhotos, { tileWidth, fit: drawOptions().fit });
  el.exportSize.textContent = `→ ${layout.width.toLocaleString('en-US')} × ${layout.height.toLocaleString('en-US')} pixels`;
}

function drawAll() {
  drawMosaic();
  drawDetail();
  showExportSize();
}

// ---------- pointing, keys and display options ----------

/** @param {PointerEvent} event */
function cellAt(event) {
  const layout = /** @type {Layout} */ (mosaicLayout);
  const box = el.mosaic.getBoundingClientRect();
  const x = ((event.clientX - box.left) / box.width) * layout.width;
  const y = ((event.clientY - box.top) / box.height) * layout.height;
  const { rows, columns } = /** @type {Result} */ (result).grid;
  const c = Math.max(0, Math.min(columns - 1, Math.floor(x / layout.tileWidth)));
  let r = 0;
  while (r < rows - 1 && y >= layout.rowTops[r + 1]) r++;
  return r * columns + c;
}

/** @param {number} cell @param {boolean} [remember] */
function select(cell, remember = false) {
  if (remember) selectionRevision++;
  if (cell === selected) { if (remember) checkpoint(); return; }
  selected = cell;
  placeMarker();
  drawDetail();
  if (remember) checkpoint();
}

el.mosaic.addEventListener('pointermove', (/** @type {PointerEvent} */ e) => { if (e.pointerType === 'mouse' && mosaicLayout) select(cellAt(e)); });
el.mosaic.addEventListener('pointerdown', (/** @type {PointerEvent} */ e) => { if (mosaicLayout) select(cellAt(e), true); });
el.mosaic.addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
  if (!result) return;
  const { rows, columns } = result.grid;
  const r = Math.floor(selected / columns);
  const c = selected % columns;
  const moves = /** @type {Record<string, [number, number]>} */ ({ ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] });
  const move = moves[e.key];
  if (!move) return;
  e.preventDefault();
  select(Math.max(0, Math.min(rows - 1, r + move[0])) * columns + Math.max(0, Math.min(columns - 1, c + move[1])), true);
});

el.fit.addEventListener('change', drawAll);
el.tint.addEventListener('input', () => {
  const v = el.tint.valueAsNumber;
  el.tintValue.textContent = `${v}%`;
  drawMosaic();
  drawDetail();
});
el.detailSize.addEventListener('change', drawDetail);
el.photoPreview.addEventListener('toggle', drawContactSheet);
for (const input of document.querySelectorAll('input[name="view"]')) input.addEventListener('change', drawAll);
el.tileWidth.addEventListener('input', showExportSize);
let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    drawAll();
    drawContactSheet();
  });
});

// ---------- exports ----------

/**
 * The mosaic as a PNG: each photo drawn from its file at the tile width (from its thumbnail
 * when that is large enough), as the page draws it.
 * @param {DrawOptions} [options] the page's settings by default
 * @returns {Promise<Blob>}
 */
async function exportPngBlob({ tileWidth = el.tileWidth.valueAsNumber, fit = drawOptions().fit, tint = drawOptions().tint } = {}) {
  if (!result) throw new Error('there is no mosaic yet');
  const version = revision;
  const painted = result;
  const assets = resultPhotos;
  if (!Number.isInteger(tileWidth) || tileWidth < 1) throw new Error('the tile width must be a whole number of pixels from 1');
  const layout = layoutMosaic(painted.grid, painted.assignment, assets, { tileWidth, fit });
  if (layout.width > 16384 || layout.height > 16384 || layout.width * layout.height > 120e6) {
    throw new Error(`a ${layout.width} × ${layout.height} pixel picture is larger than browsers can draw; choose a smaller tile width`);
  }
  const canvas = new OffscreenCanvas(layout.width, layout.height);
  const ctx = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, layout.width, layout.height);
  let done = 0;
  for (const tile of layout.tiles) {
    const photo = assets[tile.photo];
    if (tile.width <= photo.thumb.width) {
      drawTile(ctx, tile, photo.thumb, { tint, result: painted, photos: assets });
    } else {
      const full = await createImageBitmap(photo.file, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      drawTile(ctx, tile, full, { tint, result: painted, photos: assets });
      full.close();
    }
    if (++done % 25 === 0 && version === revision) el.status.textContent = `Drawing the PNG: ${done} of ${layout.tiles.length} tiles`;
  }
  if (version === revision) el.status.textContent = 'PNG drawn';
  return canvas.convertToBlob({ type: 'image/png' });
}

/** @param {string} name @param {Blob} blob */
function download(name, blob) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const json = (/** @type {unknown} */ x) => new Blob([JSON.stringify(x, null, 1)], { type: 'application/json' });
byId('export-png').addEventListener('click', async () => {
  try {
    download('photomosaic.png', await exportPngBlob());
  } catch (error) {
    el.status.textContent = `No PNG: ${/** @type {Error} */ (error).message}`;
  }
});
byId('export-result').addEventListener('click', () => download('photomosaic-result.json', json(result)));
byId('export-request').addEventListener('click', () => download('photomosaic-request.json', json(resultRequest)));

// Assets and completed matches are immutable; snapshots only copy small UI metadata.
function snapshotWork() {
  return { photos, photosVersion, target, targetVersion, result, resultRequest, resultInputs, resultPhotos,
    selected, selectionRevision, failed, form: captureForm(form), photoPreview: el.photoPreview.open,
    status: worker ? 'Stopped' : el.status.textContent, photoStatus: el.photoStatus.textContent, targetStatus: el.targetStatus.textContent,
    issues: activeIssues.slice(), photoIssues: [...el.photoIssues.childNodes].map(node => node.cloneNode(true)), photoIssuesHidden: el.photoIssues.hidden };
}
/** @param {ReturnType<typeof snapshotWork>} saved */
function restoreWork(saved) {
  revision++;
  historyBatch = 0;
  byId('sunflower-example').disabled = false;
  photoLoad++;
  targetLoad++;
  stopRun();
  photos = saved.photos; photosVersion = saved.photosVersion;
  target = saved.target; targetVersion = saved.targetVersion;
  result = saved.result; resultRequest = saved.resultRequest; resultInputs = saved.resultInputs; resultPhotos = saved.resultPhotos;
  selected = saved.selected; selectionRevision = saved.selectionRevision; failed = saved.failed;
  restoreForm(form, saved.form);
  for (const input of [el.photoFiles, el.photoFolder, el.targetFile]) input.value = '';
  el.photoPreview.open = saved.photoPreview;
  el.tintValue.textContent = `${el.tint.value}%`;
  el.photoProgress.hidden = true;
  el.photoStatus.textContent = saved.photoStatus;
  el.targetStatus.textContent = saved.targetStatus;
  el.photoIssues.replaceChildren(...saved.photoIssues.map(node => node.cloneNode(true)));
  el.photoIssues.hidden = saved.photoIssuesHidden;
  const preview = el.targetPreview;
  if (target) {
    const bytes = Uint8ClampedArray.from(atob(target.data), character => character.charCodeAt(0));
    const source = new OffscreenCanvas(target.width, target.height);
    source.getContext('2d').putImageData(new ImageData(bytes, target.width, target.height), 0, 0);
    preview.width = Math.min(480, target.width);
    preview.height = Math.max(1, Math.round(preview.width * target.height / target.width));
    preview.getContext('2d').drawImage(source, 0, 0, preview.width, preview.height);
    preview.style.width = `${Math.min(240, preview.width)}px`;
  } else preview.getContext('2d').clearRect(0, 0, preview.width, preview.height);
  showPhotos();
  el.result.hidden = !result;
  el.noResult.hidden = !!result;
  if (result) { showSummary(); drawAll(); }
  else mosaicLayout = null;
  activeIssues = saved.issues.slice();
  markFields(activeIssues);
  if (activeIssues.length) showIssues(new PhotomosaicError('invalid_request', '', activeIssues));
  else { el.runIssues.replaceChildren(); el.runIssues.hidden = true; }
  showStale();
  el.status.textContent = saved.status;
}
const history = createHistory({ capture: snapshotWork, restore: restoreWork, limit: 20,
  equal: (a, b) => a.photos === b.photos && a.target === b.target && a.result === b.result
    && a.selectionRevision === b.selectionRevision && JSON.stringify(a.form) === JSON.stringify(b.form),
  onChange: (h) => { byId('undo').disabled = !h.canUndo; byId('redo').disabled = !h.canRedo; },
});
function checkpoint() { if (historyReady && !historyBatch) history.commit(); }
byId('undo').addEventListener('click', () => history.undo());
byId('redo').addEventListener('click', () => history.redo());
bindHistoryShortcuts(history, { filter: () => historyReady });
bindFormHistory(history, { root: form, filter: () => historyReady && !historyBatch });

// ---------- API for scripts in the page ----------

/** @type {any} */ (window).Photomosaic = {
  /**
   * Runs a request (see api.md) in the worker and resolves with its result; the page is not
   * changed. An invalid request rejects with a PhotomosaicError.
   * @param {object} request
   */
  submit: (request) => run(request),
  /** Runs the page's own photos, target and settings and shows the mosaic. */
  generate,
  getRequest: currentRequest,
  getResult: () => result,
  exportPngBlob,
  stop: stopRun,
  undo: () => history.undo(), redo: () => history.redo(),
};

showGridNote();
await Promise.all([examplePhotos(), exampleTarget()]);
await generate().catch(() => {});
historyReady = true;
history.reset();
