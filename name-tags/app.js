// The page: inputs that build a request for the core's submit(), run in a Web
// Worker (worker.js), and a preview and downloads of the resulting sheets.
// window.NameTags exposes the same submit() to scripts and agents in the page.

// The page imports only the light modules; the fonts load in the worker.
import { parseNamesCsv, parseNamesText } from './core/names.js';
import { DEFAULT_STYLE, NameTagsError } from './core/request.js';
import { TRAY_PRESETS } from './core/tray.js';
import { LAYOUT_PRESETS } from './presets.js';

/**
 * @typedef {import('./core/index.js').Result} Result
 * @typedef {import('./core/request.js').Issue} Issue
 * @typedef {{ names: string, tray: string, design: string }} Inputs
 */

/** Request fields the page's inputs set; any others from a loaded request are kept as they were. */
const PAGE_FIELDS = ['names', 'tray', 'cells', 'font', 'decoration', 'logo', 'style', 'seed'];

const byId = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
/** @type {Record<string, any>} */
const el = {
  names: byId('names'), nameCount: byId('name-count'), namesFile: byId('names-file'),
  trayChoice: byId('tray-choice'), trayFileField: byId('tray-file-field'), trayFile: byId('tray-file'), traySummary: byId('tray-summary'),
  cells: byId('cells'), overlayFile: byId('overlay-file'), overlayStatus: byId('overlay-status'), overlayX: byId('overlay-x'), overlayY: byId('overlay-y'), overlayShow: byId('overlay-show'),
  decoration: byId('decoration'), font: byId('font'), smallcaps: byId('smallcaps'), logoFileField: byId('logo-file-field'), logoFile: byId('logo-file'),
  logoColorsField: byId('logo-colors-field'), logoColors: byId('logo-colors'), logoStatus: byId('logo-status'), restarts: byId('restarts'), seed: byId('seed'),
  generate: byId('generate'), stop: byId('stop'), status: byId('status'), issues: byId('issues'), warnings: byId('warnings'),
  noResult: byId('no-result'), result: byId('result'), stale: byId('stale'), sheetChoice: byId('sheet-choice'), sheetOptions: byId('sheet-options'),
  preview: byId('preview'), downloads: byId('downloads'), undoNote: byId('undo-note'), undoText: byId('undo-text'),
  previewView: byId('preview-view'), previewNote: byId('preview-note'),
};

/** @type {Result | null} */
let result = null;
/** @type {object | null} */
let resultRequest = null;
/** The page's inputs when the sheets on view were requested. @type {Inputs | null} */
let resultInputs = null;
/** Whether the last run since those sheets failed. */
let failed = false;
let shownSheet = 0;
let previewView = 'tags';
/** @type {Record<string, any> | null} */
let customTray = null;
/** @type {string | null} */
let logoUrl = null;
let logoName = '';
let trayName = '';
/** @type {{ url: string, w: number, h: number } | null} */
let overlay = null;
/** Fields of a request loaded through window.NameTags.submit that the inputs do not show. */
/** @type {Record<string, any>} */
let extraFields = {};
/** @type {Worker | null} */
let worker = null;
/** @type {((error: Error) => void) | null} */
let cancelRun = null;

// ---------- request <-> page ----------

/** Cell numbers typed as "1, 2, 5", or null when the field is empty. */
function readCells() {
  const text = el.cells.value.trim();
  if (text === '') return null;
  return text.split(/[\s,]+/).filter(Boolean).map(Number);
}

/** The request the page's inputs describe. */
function currentRequest() {
  const extra = /** @type {Record<string, any>} */ (structuredClone(extraFields));
  const styleExtra = extra.style ?? {};
  delete extra.style;
  /** @type {Record<string, any>} */
  const request = {
    ...extra,
    names: parseNamesText(el.names.value),
    tray: el.trayChoice.value === 'custom' ? (customTray ?? {}) : el.trayChoice.value,
    font: { ...(extra.font ?? {}), family: el.font.value },
    decoration: el.decoration.value,
    style: {
      ...styleExtra,
      smallcaps: el.smallcaps.value !== 'off',
      smallcaps_reference_face: el.smallcaps.value === '1' ? 1 : 2,
      optimizer: { ...(styleExtra.optimizer ?? {}), restarts: el.restarts.valueAsNumber },
    },
    seed: el.seed.valueAsNumber,
  };
  const cells = readCells();
  if (cells) request.cells = cells;
  if (el.decoration.value === 'logo') request.logo = { ...(extra.logo ?? {}), file: logoUrl, use_file_colors: el.logoColors.checked };
  else if (extra.logo) request.logo = extra.logo;
  return request;
}

/** Shows a request in the inputs (window.NameTags.submit). @param {Record<string, any>} request */
function loadRequest(request) {
  extraFields = Object.fromEntries(Object.entries(request).filter(([k]) => !PAGE_FIELDS.includes(k)));
  const style = request.style ?? {};
  const { smallcaps, smallcaps_reference_face: face, optimizer, ...styleRest } = style;
  const { restarts, ...optRest } = optimizer ?? {};
  extraFields.style = { ...styleRest, ...(Object.keys(optRest).length ? { optimizer: optRest } : {}) };
  if (request.font) extraFields.font = Object.fromEntries(Object.entries(request.font).filter(([k]) => k !== 'family'));
  if (request.logo) extraFields.logo = Object.fromEntries(Object.entries(request.logo).filter(([k]) => k !== 'file' && k !== 'use_file_colors'));
  el.names.value = request.names.map((/** @type {any} */ n) => (typeof n === 'string' ? n : n.name)).join('\n');
  if (typeof request.tray === 'object') {
    customTray = request.tray;
    el.trayChoice.value = 'custom';
  } else {
    el.trayChoice.value = request.tray ?? 'keychain_big';
  }
  el.cells.value = request.cells ? request.cells.join(', ') : '';
  el.font.value = request.font?.family ?? 'Inter';
  el.decoration.value = request.decoration ?? 'dna';
  el.smallcaps.value = smallcaps === false ? 'off' : String(face ?? DEFAULT_STYLE.smallcaps_reference_face);
  el.restarts.value = String(restarts ?? DEFAULT_STYLE.optimizer.restarts);
  el.seed.value = String(request.seed ?? 1);
  if (request.logo?.file) {
    logoUrl = request.logo.file;
    logoName = '';
  }
  if (typeof request.tray === 'object') trayName = '';
  el.logoColors.checked = request.logo?.use_file_colors === true;
  showInputs();
}

function showInputs() {
  const style = extraFields.style ?? {};
  byId('line-layout').value = Object.entries(LAYOUT_PRESETS).find(([, preset]) =>
    (style.degree_name_overlap ?? DEFAULT_STYLE.degree_name_overlap) === preset.degree_name_overlap &&
    Object.entries(preset.optimizer).every(([key, value]) => (style.optimizer?.[key] ?? DEFAULT_STYLE.optimizer[/** @type {keyof typeof DEFAULT_STYLE.optimizer} */ (key)]) === value)
  )?.[0] ?? 'custom';
  const names = parseNamesText(el.names.value);
  el.nameCount.textContent = `${names.length} name${names.length === 1 ? '' : 's'}`;
  el.trayFileField.hidden = el.trayChoice.value !== 'custom';
  const tray = el.trayChoice.value === 'custom' ? customTray : /** @type {Record<string, any>} */ (TRAY_PRESETS)[el.trayChoice.value];
  if (!tray) {
    el.traySummary.textContent = 'Choose a tray layout JSON file (see the API description for its fields).';
  } else {
    const cells = tray.centers_in ? tray.centers_in.length : tray.grid[0] * tray.grid[1];
    el.traySummary.textContent = `${el.trayChoice.value === 'custom' && trayName ? `${trayName}: ` : ''}${cells} cells of ${tray.cell_in[0]} × ${tray.cell_in[1]} in on a ${tray.page_in[0]} × ${tray.page_in[1]} in page; ${Math.ceil(Math.max(names.length, 1) / cells)} sheet${Math.ceil(Math.max(names.length, 1) / cells) === 1 ? '' : 's'} for these names (in order).`;
  }
  const logo = el.decoration.value === 'logo';
  el.logoFileField.hidden = !logo;
  el.logoColorsField.hidden = !logo;
  el.logoStatus.hidden = !logo;
  el.logoStatus.textContent = logoUrl ? `Logo loaded: ${logoName || 'from the request'} (${logoUrl.slice(5, logoUrl.search(/[;,]/))}).` : 'No logo loaded yet.';
  showStale();
}

for (const input of [el.names, el.trayChoice, el.cells, el.decoration, el.font, el.smallcaps, el.logoColors, el.restarts, el.seed]) {
  input.addEventListener('input', showInputs);
}

/** The page's inputs, by the card they are on, to tell whether the sheets on view still match them. @returns {Inputs} */
function pageInputs() {
  const { names, tray, cells, ...design } = currentRequest();
  return { names: JSON.stringify(names), tray: JSON.stringify([tray, cells]), design: JSON.stringify(design) };
}

/**
 * Says whether, and why, the sheets on view no longer match the inputs. They stay on view,
 * dimmed, and their downloads say they are out of date.
 */
function showStale() {
  const now = pageInputs();
  const parts = result && resultInputs ? /** @type {(keyof Inputs)[]} */ (['names', 'tray', 'design']).filter((k) => now[k] !== resultInputs?.[k]) : [];
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  const reason = result && failed
    ? 'the last run failed (see the problems above). These are the sheets made before it.'
    : what ? `the ${what} changed since these sheets were made; press Generate to update them.` : '';
  el.stale.hidden = !reason;
  el.stale.textContent = reason ? `Out of date: ${reason}` : '';
  el.result.toggleAttribute('data-stale', Boolean(reason));
  for (const button of el.result.querySelectorAll('button[data-label]')) {
    const label = button.dataset.label;
    button.textContent = reason ? `⚠ Out-of-date ${label}` : label[0].toUpperCase() + label.slice(1);
  }
  for (const svg of el.preview.querySelectorAll('svg')) {
    svg.setAttribute('aria-label', `${svg.dataset.tagLabel ? `${svg.dataset.tagLabel}; ` : ''}${sheetName()}`);
  }
}

// ---------- files ----------

/** @param {File} file @param {'text' | 'dataURL'} as */
function readFile(file, as) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = () => reject(reader.error);
    if (as === 'text') reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

el.namesFile.addEventListener('change', async () => {
  const file = el.namesFile.files[0];
  if (!file) return;
  const text = await readFile(file, 'text');
  if (/\.csv$/i.test(file.name)) {
    const rows = parseNamesCsv(text);
    if (typeof rows === 'string') {
      showIssues([{ code: 'invalid_value', path: 'names', message: `${file.name}: ${rows}` }]);
      return;
    }
    el.names.value = rows.map((r) => r.name).join('\n');
    if (rows.some((r) => r.logo)) showWarnings([`${file.name} names a logo file per row; the page takes one logo for all tags, the command line takes one per name.`]);
  } else {
    el.names.value = parseNamesText(text).join('\n');
  }
  el.namesFile.value = '';
  dropUndo();
  showInputs();
});

el.trayFile.addEventListener('change', async () => {
  const file = el.trayFile.files[0];
  if (!file) return;
  try {
    customTray = JSON.parse(await readFile(file, 'text'));
    trayName = file.name;
    showIssues([]);
  } catch (error) {
    customTray = null;
    showIssues([{ code: 'invalid_json', path: 'tray', message: `${file.name} is not valid JSON: ${/** @type {Error} */ (error).message}` }]);
  }
  showInputs();
});

el.logoFile.addEventListener('change', async () => {
  const file = el.logoFile.files[0];
  if (!file) return;
  logoUrl = await readFile(file, 'dataURL');
  logoName = file.name;
  showInputs();
});

/** A length attribute of an SVG root in inches (unitless = px at 96/in). @param {string | null} v */
function inches(v) {
  const m = /^\s*([\d.]+)\s*(in|mm|cm|pt|pc|px)?\s*$/.exec(v ?? '');
  if (!m) return null;
  const per = /** @type {Record<string, number>} */ ({ in: 1, mm: 1 / 25.4, cm: 1 / 2.54, pt: 1 / 72, pc: 1 / 6, px: 1 / 96 });
  return Number(m[1]) * per[m[2] ?? 'px'];
}

el.overlayFile.addEventListener('change', async () => {
  const file = el.overlayFile.files[0];
  if (!file) return;
  const text = await readFile(file, 'text');
  const root = new DOMParser().parseFromString(text, 'image/svg+xml').documentElement;
  const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const w = inches(root.getAttribute('width')) ?? (vb.length === 4 ? vb[2] / 96 : null);
  const h = inches(root.getAttribute('height')) ?? (vb.length === 4 ? vb[3] / 96 : null);
  if (root.nodeName !== 'svg' || !w || !h) {
    showIssues([{ code: 'invalid_value', path: 'overlay', message: `${file.name}: could not read an SVG size from it` }]);
    return;
  }
  overlay = { url: await readFile(file, 'dataURL'), w, h };
  el.overlayStatus.textContent = `${file.name}: ${+w.toFixed(3)} × ${+h.toFixed(3)} in.`;
  renderSheet();
});
for (const input of [el.overlayX, el.overlayY, el.overlayShow]) input.addEventListener('input', renderSheet);

// ---------- running ----------

/**
 * Runs a request in the worker. Resolves with the result; rejects with a
 * NameTagsError, or an Error if stopped.
 * @param {object} request
 * @returns {Promise<Result>}
 */
function run(request) {
  stopRun();
  const started = performance.now();
  worker = new Worker(new URL('worker.js', import.meta.url), { type: 'module' });
  setRunning(true);
  el.status.textContent = 'Starting…';
  return new Promise((resolve, reject) => {
    const finish = () => {
      worker?.terminate();
      worker = null;
      cancelRun = null;
      setRunning(false);
    };
    cancelRun = (error) => {
      finish();
      el.status.textContent = 'Stopped';
      reject(error);
    };
    /** @type {Worker} */ (worker).onmessage = ({ data }) => {
      if (data.type === 'progress') {
        el.status.textContent = `Tag ${data.progress.done} of ${data.progress.total} done: ${data.progress.name}`;
      } else if (data.type === 'result') {
        finish();
        el.status.textContent = `Done in ${((performance.now() - started) / 1000).toFixed(1)} s`;
        resolve(data.result);
      } else {
        finish();
        el.status.textContent = 'Not run';
        reject(new NameTagsError(data.error.code, data.error.message, data.error.issues));
      }
    };
    /** @type {Worker} */ (worker).onerror = (event) => {
      finish();
      el.status.textContent = 'Failed';
      reject(new Error(`the worker failed: ${event.message}`));
    };
    /** @type {Worker} */ (worker).postMessage({ request });
  });
}

function stopRun() {
  cancelRun?.(new Error('stopped'));
}

/** @param {boolean} running */
function setRunning(running) {
  el.generate.disabled = running;
  el.generate.textContent = running ? 'Generating…' : 'Generate';
  el.stop.disabled = !running;
}

// ---------- problems ----------

/**
 * The field a problem's request path is on, its label on the page and its inputs: the first
 * entry the path starts with. Paths of fields the page has no input for are shown as they are.
 * @type {[string, string, HTMLElement[]][]}
 */
const FIELDS = [
  ['names', 'Names', [el.names]],
  ['tray', 'Tray', [el.trayChoice, el.trayFile]],
  ['cells', 'Cells', [el.cells]],
  ['decoration', 'Decoration', [el.decoration]],
  ['font', 'Font', [el.font]],
  ['style.smallcaps_reference_face', 'Names with descenders (y q p g j) on the top line', [el.smallcaps]],
  ['style.smallcaps', 'Names with descenders (y q p g j) on the top line', [el.smallcaps]],
  ['style.optimizer.restarts', 'Optimizer restarts per tag', [el.restarts]],
  ['seed', 'Seed', [el.seed]],
  ['logo.use_file_colors', "Keep the SVG's colours", [el.logoColors]],
  ['logo', 'Logo', [el.logoFile]],
  ['overlay', 'Tray drawing overlay', [el.overlayFile]],
];
/** @param {string} path */
const fieldOf = (path) => FIELDS.find(([p]) => path !== '' && path.startsWith(p));

/** The names box's line number of each name. */
const nameLines = () => el.names.value.split(/\r?\n/).flatMap((/** @type {string} */ line, /** @type {number} */ i) => (line.trim() === '' ? [] : [i + 1]));

/** Where a problem is, in the page's words. @param {Issue} issue */
function describeIssue(issue) {
  const name = /^names\[(\d+)\]/.exec(issue.path);
  if (name) return `Name ${Number(name[1]) + 1} (line ${nameLines()[Number(name[1])] ?? '?'}): ${issue.message}`;
  const field = fieldOf(issue.path);
  if (!field) return issue.path ? `${issue.path}: ${issue.message}` : issue.message;
  const rest = issue.path.slice(field[0].length).replace(/^\./, '');
  return `${field[1]}${rest ? ` (${rest})` : ''}: ${issue.message}`;
}

/** Lists the problems and marks the fields they are on, pointing each to the list. @param {Issue[]} issues */
function showIssues(issues) {
  el.issues.hidden = issues.length === 0;
  const ul = document.createElement('ul');
  ul.replaceChildren(...issues.map((issue) => Object.assign(document.createElement('li'), { textContent: describeIssue(issue) })));
  el.issues.replaceChildren(ul);
  const bad = new Set(issues.flatMap((issue) => fieldOf(issue.path)?.[2] ?? []));
  for (const input of new Set(FIELDS.flatMap(([, , inputs]) => inputs))) {
    const described = (input.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id !== '' && id !== 'issues');
    // aria-invalid="true", not a bare attribute, which counts as false; shared/base.css draws it red
    if (bad.has(input)) {
      input.setAttribute('aria-invalid', 'true');
      described.push('issues');
    } else {
      input.removeAttribute('aria-invalid');
    }
    if (described.length) input.setAttribute('aria-describedby', described.join(' '));
    else input.removeAttribute('aria-describedby');
  }
}

/** @param {string[]} warnings */
function showWarnings(warnings) {
  el.warnings.hidden = warnings.length === 0;
  el.warnings.textContent = warnings.map((w) => `⚠ ${w}`).join(' ');
}

/** @param {object} request */
async function runFromPage(request) {
  if (el.trayChoice.value === 'custom' && !customTray) {
    showIssues([{ code: 'missing_field', path: 'tray', message: 'choose a tray layout JSON file, or the big keychain tray' }]);
    failed = true;
    showStale();
    return;
  }
  showIssues([]);
  const inputs = pageInputs();
  try {
    showResult(await run(request), request, inputs);
  } catch (error) {
    if (/** @type {Error} */ (error).message === 'stopped') return;
    if (error instanceof NameTagsError) showIssues(error.issues.length ? error.issues : [{ code: error.code, path: '', message: error.message }]);
    else showIssues([{ code: 'internal_error', path: '', message: String(error) }]);
    failed = true;
    showStale();
  }
}

el.generate.addEventListener('click', () => runFromPage(currentRequest()));
el.stop.addEventListener('click', stopRun);

// ---------- result ----------

/** @param {Result} next @param {object} request @param {Inputs} inputs the page's inputs it was made from */
function showResult(next, request, inputs) {
  result = next;
  resultRequest = request;
  resultInputs = inputs;
  failed = false;
  shownSheet = 0;
  showWarnings(next.warnings);
  el.sheetChoice.hidden = next.sheets.length < 2;
  el.sheetOptions.replaceChildren(...next.sheets.map((sheet, i) => {
    const label = document.createElement('label');
    const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'sheet', value: String(i), checked: i === 0 });
    label.append(input, ` ${sheet.sheet}`);
    return label;
  }));
  el.downloads.replaceChildren(...next.sheets.map((sheet, i) => {
    const button = Object.assign(document.createElement('button'), { type: 'button' });
    button.dataset.label = next.sheets.length > 1 ? `sheet ${sheet.sheet} SVG` : 'sheet SVG';
    button.addEventListener('click', () => download(sheet.file, exportSvgText(i + 1), 'image/svg+xml'));
    return button;
  }));
  el.noResult.hidden = true;
  el.result.hidden = false;
  renderSheet();
  showStale();
}

el.sheetOptions.addEventListener('change', (/** @type {Event} */ event) => {
  shownSheet = Number(/** @type {HTMLInputElement} */ (event.target).value);
  renderSheet();
});
el.previewView.addEventListener('change', () => {
  previewView = el.previewView.value;
  renderSheet();
});

/** What the sheet on view is, as its preview is named. */
function sheetName() {
  if (!result) return '';
  return `Sheet ${result.sheets[shownSheet].sheet} of ${result.sheets.length}${el.stale.hidden ? '' : ', out of date'}`;
}

function renderSheet() {
  if (!result) return;
  el.preview.innerHTML = result.sheets[shownSheet].svg.replace(/^<\?xml[^>]*>\s*/, '');
  const svg = el.preview.querySelector('svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', sheetName());
  const showOverlay = overlay && el.overlayShow.checked;
  const view = showOverlay ? 'sheet' : previewView;
  el.previewView.value = view;
  el.previewView.disabled = Boolean(showOverlay);
  el.preview.dataset.view = view;
  el.previewNote.textContent = showOverlay
    ? 'Full sheet shown for tray alignment. Hide the overlay to inspect individual tags.'
    : view === 'tags'
      ? 'Individual tags for inspection; downloads keep their full-sheet positions.'
      : `${result.tray.page_in.join(' × ')} in — exact sheet size and tag positions.`;
  if (overlay && showOverlay) {
    const image = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    const x = Number.isFinite(el.overlayX.valueAsNumber) ? el.overlayX.valueAsNumber : 0;
    const y = Number.isFinite(el.overlayY.valueAsNumber) ? el.overlayY.valueAsNumber : 0;
    for (const [k, v] of Object.entries({ href: overlay.url, x: x * 96, y: y * 96, width: overlay.w * 96, height: overlay.h * 96, opacity: 0.45 })) image.setAttribute(k, String(v));
    svg.querySelector('rect')?.after(image);
  } else if (view === 'tags') {
    inspectTags(svg);
  }
}

/** Reframe the sheet's own drawing nodes, leaving result/export SVGs untouched.
 * Each registration outline begins one cell in core/svg.js's sheet format.
 * @param {SVGSVGElement} sheet
 */
function inspectTags(sheet) {
  if (!result) return;
  /** @type {SVGGraphicsElement[][]} */
  const cells = [];
  for (const child of sheet.children) {
    if (child.matches('path[fill="none"][stroke="#333333"]')) cells.push([]);
    if (cells.length) cells.at(-1)?.push(/** @type {SVGGraphicsElement} */ (child));
  }
  const tags = result.tags.filter(tag => tag.sheet === result?.sheets[shownSheet].sheet);
  if (cells.length !== tags.length) throw new Error('The sheet drawings do not match its tag list.');
  const previews = cells.map((nodes, i) => {
    const boxes = nodes.map(node => node.getBBox());
    const left = Math.min(...boxes.map(b => b.x)), top = Math.min(...boxes.map(b => b.y));
    const right = Math.max(...boxes.map(b => b.x + b.width)), bottom = Math.max(...boxes.map(b => b.y + b.height));
    // Include registration strokes, glyph overshoots, and a little inspection margin.
    const padding = Math.max(3, Math.min(right - left, bottom - top) * 0.045);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `${left - padding} ${top - padding} ${right - left + padding * 2} ${bottom - top + padding * 2}`);
    svg.setAttribute('role', 'img');
    svg.dataset.tagLabel = `Cell ${tags[i].cell}: ${tags[i].name}`;
    svg.setAttribute('aria-label', `${svg.dataset.tagLabel}; ${sheetName()}`);
    svg.append(...nodes.map(node => node.cloneNode(true)));
    const caption = Object.assign(document.createElement('p'), { className: 'tag-caption', textContent: `Cell ${tags[i].cell} · ${tags[i].name}` });
    const preview = Object.assign(document.createElement('div'), { className: 'tag-preview' });
    preview.append(svg, caption);
    return preview;
  });
  el.preview.replaceChildren(...previews);
}

/** A sheet's SVG text. @param {number} [sheet] 1-based; the sheet on display by default */
function exportSvgText(sheet = shownSheet + 1) {
  if (!result) throw new Error('no result yet');
  const s = result.sheets[sheet - 1];
  if (!s) throw new Error(`no sheet ${sheet}; there ${result.sheets.length === 1 ? 'is 1 sheet' : `are ${result.sheets.length} sheets`}`);
  return s.svg;
}

/** @param {string} name @param {string} text @param {string} type */
function download(name, text, type) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

byId('export-result').addEventListener('click', () => {
  if (!result) return;
  download('nametags-result.json', JSON.stringify({ ...result, sheets: result.sheets.map(({ svg, ...rest }) => rest) }, null, 2), 'application/json');
});
byId('export-request').addEventListener('click', () => {
  if (resultRequest) download('nametags-request.json', JSON.stringify(resultRequest, null, 2), 'application/json');
});

// ---------- example ----------

async function loadExample() {
  const response = await fetch('examples/historical-figures.txt');
  if (!response.ok) throw new Error(`Could not load the example (HTTP ${response.status})`);
  const n = parseNamesText(el.names.value).length;
  replaceNames(parseNamesText(await response.text()).join('\n'), { style: structuredClone(LAYOUT_PRESETS.balanced) }, `Replaced your ${n} name${n === 1 ? '' : 's'} with the example.`);
}
byId('load-example').addEventListener('click', loadExample);
byId('line-layout').addEventListener('change', () => {
  const preset = LAYOUT_PRESETS[byId('line-layout').value];
  if (!preset) throw new Error('Unknown name layout');
  const previous = extraFields.style ?? {};
  extraFields.style = { ...previous, degree_name_overlap: preset.degree_name_overlap,
    optimizer: { ...previous.optimizer, ...preset.optimizer } };
  showInputs();
});
byId('clear-names').addEventListener('click', () => {
  const n = parseNamesText(el.names.value).length;
  replaceNames('', extraFields, `Cleared ${n} name${n === 1 ? '' : 's'}.`);
});

// Load example and Clear replace the names at once, and offer them back: Undo restores them,
// until the names are next changed.

/** The names (and request fields the inputs do not show) that Load example or Clear replaced. @type {{ names: string, extraFields: Record<string, any> } | null} */
let replaced = null;

/**
 * @param {string} names the names text to show
 * @param {Record<string, any>} extra the request fields the inputs do not show, from then on
 * @param {string} note what the replacement did, shown beside Undo
 */
function replaceNames(names, extra, note) {
  const changed = el.names.value.trim() !== '' && el.names.value !== names;
  replaced = changed ? { names: el.names.value, extraFields } : null;
  el.undoText.textContent = note;
  el.undoNote.hidden = !changed;
  el.names.value = names;
  extraFields = extra;
  showInputs();
}

function dropUndo() {
  replaced = null;
  el.undoNote.hidden = true;
}
el.names.addEventListener('input', dropUndo);

byId('undo-replace').addEventListener('click', () => {
  if (!replaced) return;
  el.names.value = replaced.names;
  extraFields = replaced.extraFields;
  dropUndo();
  showInputs();
});

// ---------- API for scripts in the page ----------

/** @type {any} */ (window).NameTags = {
  /**
   * Runs a request (see api.md) in the worker, loads it into the page and
   * shows the result. An invalid request rejects with a NameTagsError and
   * leaves the page as it was.
   * @param {Record<string, any>} request
   */
  async submit(request) {
    const next = await run(request);
    loadRequest(request);
    dropUndo();
    showResult(next, request, pageInputs());
    return next;
  },
  getRequest: currentRequest,
  getResult: () => result,
  exportSvgText,
  stop: stopRun,
};

await loadExample();
await runFromPage(currentRequest());

document.documentElement.dataset.ready = 'true';
