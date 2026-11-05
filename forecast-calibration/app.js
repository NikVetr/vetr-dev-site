// The page: an editable table and settings that build a request for the core's
// submit(), and views of its result. window.ForecastCalibration exposes the same
// submit() to scripts and agents running in the page.

import {
  DEFAULTS, ForecastCalibrationError, binsCsv, formatTable, issueLocation, parseProbability, parseTable, renderSvg, submit,
} from './core/index.js';

/**
 * @typedef {ReturnType<typeof submit>} Result
 * @typedef {import('./core/input.js').Issue} Issue
 * @typedef {{ text: string, probability: string, outcome: boolean | null }} Row
 */

const STORAGE_KEY = 'forecast-calibration:v1';
const EXPORT_SIZE = { width: 720, height: 600 };
const SETTING_LABELS = /** @type {Record<string, string>} */ ({
  bins: 'Number of bins', simulations: 'Simulated worlds', plotWorlds: 'Worlds drawn in the plot',
  interval: 'Interval', seed: 'Seed', worldOpacity: 'World line opacity', predictions: 'Predictions',
});

const byId = (/** @type {string} */ id) => /** @type {any} */ (document.getElementById(id));
/** Looks up an element in markup this file has just written, so it is always there. */
const part = (/** @type {Element} */ root, /** @type {string} */ selector) => /** @type {any} */ (root.querySelector(selector));
/** @type {Record<string, any>} */
const el = {
  rows: byId('rows'), rowCount: byId('row-count'), issues: byId('issues'),
  binsMode: byId('bins-mode'), binsCount: byId('bins-count'), binsCountField: byId('bins-count-field'),
  simulations: byId('simulations'), plotWorlds: byId('plot-worlds'), interval: byId('interval'),
  seed: byId('seed'), worldOpacity: byId('world-opacity'),
  status: byId('status'), noResult: byId('no-result'), result: byId('result'), stale: byId('stale'), plot: byId('plot'),
  scores: byId('scores'), bins: byId('bins'), intervalHeading: byId('interval-heading'),
  dialog: byId('table-dialog'), tableText: byId('table-text'), tableIssues: byId('table-issues'),
  undoNote: byId('undo-note'), undoText: byId('undo-text'),
};

/** @type {Row[]} */
let rows = [];
/** @type {Result | null} */
let result = null;
/** @type {object | null} */
let resultRequest = null;
/** The table that Load example or Clear replaced, until the table is next changed. @type {Row[] | null} */
let replaced = null;

// ---------- request <-> page ----------

function currentRequest() {
  return {
    predictions: rows.map((row) => ({
      text: row.text,
      probability: row.probability.trim() === '' ? null : parseProbability(row.probability),
      outcome: row.outcome,
    })),
    bins: el.binsMode.value === 'distinct' ? 'distinct' : el.binsCount.valueAsNumber,
    simulations: el.simulations.valueAsNumber,
    plotWorlds: el.plotWorlds.valueAsNumber,
    interval: el.interval.valueAsNumber,
    seed: el.seed.valueAsNumber,
  };
}

/** @param {{ text?: string, probability: number, outcome: boolean | number }[]} predictions */
function rowsFrom(predictions) {
  return predictions.map((p) => ({ text: p.text ?? '', probability: String(p.probability), outcome: p.outcome === true || p.outcome === 1 }));
}

/** @param {Record<string, any>} settings */
function writeSettings(settings) {
  const s = { ...DEFAULTS, ...settings };
  el.binsMode.value = s.bins === 'distinct' ? 'distinct' : 'width';
  if (s.bins !== 'distinct') el.binsCount.value = String(s.bins);
  el.simulations.value = String(s.simulations);
  el.plotWorlds.value = String(s.plotWorlds);
  el.interval.value = String(s.interval);
  el.seed.value = String(s.seed);
  showBinsCount();
}

function showBinsCount() {
  el.binsCountField.hidden = el.binsMode.value === 'distinct';
}

// ---------- analysis ----------

let timer = 0;
function schedule() {
  clearTimeout(timer);
  timer = window.setTimeout(run, 200);
  save();
}

function run() {
  clearTimeout(timer);
  const request = currentRequest();
  const opacity = el.worldOpacity.valueAsNumber;
  /** @type {Issue[]} */
  const issues = opacity > 0 && opacity <= 1 ? [] : [{ code: 'out_of_range', path: 'worldOpacity', message: 'must be a number greater than 0 and at most 1' }];
  try {
    const next = submit(request);
    if (!issues.length) {
      result = next;
      resultRequest = request;
    }
  } catch (error) {
    if (!(error instanceof ForecastCalibrationError)) throw error;
    issues.push(...error.issues);
  }
  if (!rows.length) {
    // An empty table is where a new one starts, not a problem to report.
    result = null;
    resultRequest = null;
    showIssues(issues.filter((issue) => issue.path !== 'predictions'));
    renderResult();
    return;
  }
  showIssues(issues);
  // A table with problems keeps the last complete result on view, marked out of date.
  renderResult(issues.length);
}

// ---------- predictions table ----------

function renderRows() {
  el.rows.replaceChildren(...rows.map((row, i) => rowElement(row, i)));
  for (const area of el.rows.querySelectorAll('textarea')) fitHeight(area);
  el.rowCount.textContent = `${rows.length} prediction${rows.length === 1 ? '' : 's'}`;
}

/** @param {Row} row @param {number} i */
function rowElement(row, i) {
  const tr = document.createElement('tr');
  tr.dataset.index = String(i);
  tr.innerHTML = `
    <th scope="row" class="index"></th>
    <td class="text-col"><textarea class="text" rows="1"></textarea></td>
    <td class="probability-col"><input class="probability" inputmode="decimal" autocomplete="off"></td>
    <td class="outcome-col"><select class="outcome">
      <option value="">– choose</option><option value="1">✓ yes</option><option value="0">✗ no</option>
    </select></td>
    <td class="remove-col"><button type="button" class="remove">×</button></td>`;
  const n = i + 1;
  part(tr, '.index').textContent = String(n);
  const text = part(tr, 'textarea');
  text.value = row.text;
  text.setAttribute('aria-label', `Prediction ${n}`);
  const probability = part(tr, 'input');
  probability.value = row.probability;
  probability.setAttribute('aria-label', `Probability ${n}`);
  const outcome = part(tr, 'select');
  outcome.value = row.outcome === null ? '' : row.outcome ? '1' : '0';
  outcome.setAttribute('aria-label', `Happened? ${n}`);
  outcome.dataset.state = outcome.value;
  part(tr, '.remove').setAttribute('aria-label', `Remove row ${n}`);
  return tr;
}

/** @param {HTMLTextAreaElement} area */
function fitHeight(area) {
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + 2}px`;
}

el.rows.addEventListener('input', (/** @type {Event} */ event) => {
  dropUndo();
  const target = /** @type {any} */ (event.target);
  const row = rows[Number(target.closest('tr').dataset.index)];
  if (target.classList.contains('text')) {
    row.text = target.value;
    fitHeight(target);
  } else if (target.classList.contains('probability')) {
    row.probability = target.value;
  } else if (target.classList.contains('outcome')) {
    row.outcome = target.value === '' ? null : target.value === '1';
    target.dataset.state = target.value;
  }
  schedule();
});

el.rows.addEventListener('click', (/** @type {Event} */ event) => {
  const button = /** @type {any} */ (event.target).closest('.remove');
  if (!button) return;
  dropUndo();
  rows.splice(Number(button.closest('tr').dataset.index), 1);
  renderRows();
  schedule();
});

byId('add-row').addEventListener('click', () => {
  dropUndo();
  rows.push({ text: '', probability: '', outcome: null });
  renderRows();
  schedule();
  el.rows.lastElementChild.querySelector('textarea').focus();
});

byId('clear-rows').addEventListener('click', () => {
  replaceRows([], `Cleared ${rows.length} prediction${rows.length === 1 ? '' : 's'}.`);
  schedule();
});

byId('load-example').addEventListener('click', loadExample);

async function loadExample() {
  const response = await fetch('examples/synthetic.csv');
  if (!response.ok) throw new Error(`Could not load the example (HTTP ${response.status})`);
  const example = rowsFrom(parseTable(await response.text()));
  replaceRows(example, `Replaced your ${rows.length} prediction${rows.length === 1 ? '' : 's'} with the example.`);
  run();
  save();
}

// Load example and Clear replace the table at once, and offer it back: Undo restores it, until
// the table is next edited.

/** @param {Row[]} next @param {string} note what the replacement did, shown beside Undo */
function replaceRows(next, note) {
  const changed = rows.length > 0 && formatTable(rows) !== formatTable(next);
  replaced = changed ? rows : null;
  el.undoText.textContent = note;
  el.undoNote.hidden = !changed;
  rows = next;
  renderRows();
}

function dropUndo() {
  replaced = null;
  el.undoNote.hidden = true;
}

byId('undo-replace').addEventListener('click', () => {
  if (!replaced) return;
  rows = replaced;
  dropUndo();
  renderRows();
  run();
  save();
});

/** @param {Issue} issue */
function describeIssue(issue) {
  const match = /^predictions\[(\d+)\]\.(\w+)$/.exec(issue.path);
  if (!match) return `${SETTING_LABELS[issue.path] ?? issueLocation(issue)}: ${issue.message}`;
  const row = `Row ${Number(match[1]) + 1}`;
  if (match[2] === 'outcome' && issue.code === 'missing_field') return `${row}: choose whether it happened`;
  if (match[2] === 'probability' && issue.code === 'missing_field') return `${row}: probability is missing`;
  return `${row}: ${match[2]} ${issue.message}`;
}

/** @param {HTMLElement} box @param {string[]} messages */
function listMessages(box, messages) {
  box.hidden = messages.length === 0;
  box.replaceChildren();
  if (!messages.length) return;
  const list = document.createElement('ul');
  for (const message of messages) {
    const item = document.createElement('li');
    item.textContent = message;
    list.append(item);
  }
  box.append(list);
}

/** @param {Issue[]} issues */
function showIssues(issues) {
  listMessages(el.issues, issues.map(describeIssue));
  for (const marked of el.rows.querySelectorAll('[aria-invalid]')) marked.removeAttribute('aria-invalid');
  for (const tr of el.rows.querySelectorAll('tr.has-issue')) tr.classList.remove('has-issue');
  for (const issue of issues) {
    const match = /^predictions\[(\d+)\](?:\.(\w+))?$/.exec(issue.path);
    const tr = match && el.rows.children[Number(match[1])];
    if (!tr) continue;
    tr.classList.add('has-issue');
    const field = tr.querySelector(`.${match[2] ?? 'probability'}`);
    if (field) field.setAttribute('aria-invalid', 'true');
  }
  // aria-invalid="true", not a bare attribute, which counts as false
  const mark = (/** @type {HTMLElement} */ field, /** @type {boolean} */ bad) => (bad ? field.setAttribute('aria-invalid', 'true') : field.removeAttribute('aria-invalid'));
  for (const name of ['simulations', 'plotWorlds', 'interval', 'seed', 'worldOpacity']) mark(el[name], issues.some((issue) => issue.path === name));
  mark(el.binsCount, issues.some((issue) => issue.path === 'bins'));
}

// ---------- results ----------

const number = (/** @type {number} */ x, digits = 3) => x.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const share = (/** @type {number} */ x, digits = 1) => `${Number((x * 100).toFixed(digits))}%`;
const POSITIONS = /** @type {Record<string, string>} */ ({ inside: '●\u00a0inside', above: '▲\u00a0above', below: '▼\u00a0below' });

/** @param {number} p @param {number} simulations */
function pText(p, simulations) {
  const small = (/** @type {number} */ x) => x.toLocaleString('en-US', { maximumSignificantDigits: 2 });
  if (p === 0) return `p < ${small(1 / simulations)}`;
  return p < 0.01 ? `p = ${small(p)}` : `p = ${number(p)}`;
}

/** @param {number} [problems] how many problems keep the shown result from being current */
function renderResult(problems = 0) {
  el.noResult.hidden = Boolean(result);
  el.noResult.textContent = rows.length
    ? 'Results appear here once every row has a probability and an outcome.'
    : 'Add a row, paste a table or load the example to see the calibration.';
  el.result.hidden = !result;
  for (const button of document.querySelectorAll('[id^="export-"]')) /** @type {any} */ (button).disabled = !result;
  el.stale.hidden = !problems;
  el.stale.textContent = problems
    ? `Out of date: ${problems === 1 ? 'a problem' : `${problems} problems`} in the table or settings, listed under Predictions. This is the last complete result.`
    : '';
  el.result.toggleAttribute('data-stale', problems > 0);
  if (!result) {
    el.status.textContent = '';
    return;
  }
  if (problems) return; // the result on view is still the one drawn
  const { settings } = result;
  el.status.textContent = `${result.n} predictions, ${result.bins.length} bins, ${settings.simulations.toLocaleString('en-US')} simulated worlds, seed ${settings.seed}`;
  renderPlot();

  const { logLoss, calibration } = result;
  const S = settings.simulations;
  const worlds = (/** @type {number} */ p, /** @type {string} */ what) => `${pText(p, S)}: ${what} in ${Math.round(p * S).toLocaleString('en-US')} of ${S.toLocaleString('en-US')} simulated worlds.`;
  const scores = [
    ['Log loss', `${number(logLoss.total, 2)}`, `${number(logLoss.mean)} per prediction. A calibrated forecaster at these probabilities expects ${number(logLoss.expected.mean, 2)} ± ${number(logLoss.expected.sd, 2)}; always saying 50% scores ${number(logLoss.coinFlip, 2)}.`, worlds(logLoss.p, 'More loss')],
    ['Weighted calibration error', number(calibration.weighted.statistic, 4), 'Mean squared gap between realized frequency and stated probability, bins weighted by size.', worlds(calibration.weighted.p, 'A larger error')],
    ['Unweighted calibration error', number(calibration.unweighted.statistic, 4), 'The same squared gap, every bin counting equally.', worlds(calibration.unweighted.p, 'A larger error')],
  ];
  el.scores.replaceChildren(...scores.map(([name, value, detail, p]) => {
    const div = document.createElement('div');
    div.innerHTML = '<dt></dt><dd><span class="score-value"></span><span class="score-p"></span><span class="score-detail"></span></dd>';
    part(div, 'dt').textContent = name;
    part(div, '.score-value').textContent = value;
    part(div, '.score-p').textContent = p;
    part(div, '.score-detail').textContent = detail;
    return div;
  }));

  el.intervalHeading.textContent = `Middle ${share(settings.interval)} of worlds`;
  el.bins.replaceChildren(...result.bins.map((bin) => {
    const tr = document.createElement('tr');
    const label = settings.bins === 'distinct' ? bin.label : `${bin.label}, mean ${share(bin.meanProbability)}`;
    const cells = [label, `${bin.hits} of ${bin.n}, ${share(bin.frequency)}`, `${share(bin.interval[0])} to ${share(bin.interval[1])}`, POSITIONS[bin.position]];
    cells.forEach((value, i) => {
      const td = document.createElement('td');
      td.textContent = value;
      if (i === 1 || i === 2) td.className = 'num';
      if (i === 3) td.className = `position ${bin.position}`;
      tr.append(td);
    });
    return tr;
  }));
}

function plotOptions() {
  return { theme: /** @type {'light' | 'dark'} */ (document.documentElement.dataset.theme), worldOpacity: el.worldOpacity.valueAsNumber };
}

function renderPlot() {
  if (!result) return;
  const width = Math.floor(el.plot.clientWidth);
  const height = Math.round(Math.min(640, Math.max(360, width * 0.85)));
  el.plot.innerHTML = renderSvg(result, { width, height, ...plotOptions() });
}

let plotWidth = 0;
new ResizeObserver(() => {
  if (el.plot.clientWidth !== plotWidth) {
    plotWidth = el.plot.clientWidth;
    renderPlot();
  }
}).observe(el.plot);

// Narrower cells wrap prediction text onto more lines, so refit every text box.
let tableWidth = 0;
new ResizeObserver(() => {
  if (el.rows.clientWidth !== tableWidth) {
    tableWidth = el.rows.clientWidth;
    for (const area of el.rows.querySelectorAll('textarea')) fitHeight(area);
  }
}).observe(el.rows);

// ---------- exports ----------

function exportSvgText() {
  if (!result) throw new Error('There is no result to export yet.');
  return renderSvg(result, { ...EXPORT_SIZE, ...plotOptions() });
}

/** PNG of the exported SVG at twice its size. */
async function exportPngBlob() {
  const url = URL.createObjectURL(new Blob([exportSvgText()], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = EXPORT_SIZE.width * 2;
    canvas.height = EXPORT_SIZE.height * 2;
    /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** @param {string} name @param {Blob} blob */
function download(name, blob) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

byId('export-svg').addEventListener('click', () => download('forecast-calibration.svg', new Blob([exportSvgText()], { type: 'image/svg+xml' })));
byId('export-png').addEventListener('click', async () => download('forecast-calibration.png', await exportPngBlob()));
byId('export-csv').addEventListener('click', () => result && download('forecast-calibration-bins.csv', new Blob([binsCsv(result)], { type: 'text/csv' })));
byId('export-result').addEventListener('click', () => download('forecast-calibration-result.json', new Blob([`${JSON.stringify(result)}\n`], { type: 'application/json' })));
byId('export-request').addEventListener('click', () => download('forecast-calibration-request.json', new Blob([`${JSON.stringify(resultRequest, null, 2)}\n`], { type: 'application/json' })));

// ---------- settings, dialog, theme ----------

for (const input of [el.binsMode, el.binsCount, el.simulations, el.plotWorlds, el.interval, el.seed, el.worldOpacity]) {
  input.addEventListener('input', () => {
    showBinsCount();
    schedule();
  });
}
byId('new-seed').addEventListener('click', () => {
  el.seed.value = String(crypto.getRandomValues(new Uint32Array(1))[0]);
  schedule();
});

byId('edit-text').addEventListener('click', () => {
  el.tableText.value = formatTable(rows);
  listMessages(el.tableIssues, []);
  el.dialog.showModal();
});
for (const button of el.dialog.querySelectorAll('.dialog-close')) button.addEventListener('click', () => el.dialog.close());
byId('table-apply').addEventListener('click', () => {
  try {
    rows = rowsFrom(parseTable(el.tableText.value));
  } catch (error) {
    if (!(error instanceof ForecastCalibrationError)) throw error;
    listMessages(el.tableIssues, error.issues.map((issue) => (issue.line ? `Line ${issue.line}: ${issue.message}` : `The table ${issue.message}`)));
    return;
  }
  el.dialog.close();
  dropUndo();
  renderRows();
  run();
  save();
});

// The theme toggle is /shared/theme.js's; the plot is drawn in theme colours.
document.addEventListener('themechange', renderPlot);

// ---------- persistence (this browser only) ----------

function save() {
  const settings = Object.fromEntries(['binsMode', 'binsCount', 'simulations', 'plotWorlds', 'interval', 'seed', 'worldOpacity'].map((name) => [name, el[name].value]));
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows, settings })); } catch { /* not remembered */ }
}

function restore() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); } catch { /* start fresh */ }
  if (!saved) return false;
  rows = saved.rows;
  for (const [name, value] of Object.entries(saved.settings)) el[name].value = value;
  showBinsCount();
  return true;
}

// ---------- programmatic access ----------

Object.assign(window, { ForecastCalibration: {
  /**
   * Runs a request (see api.md), shows it on the page and returns the result.
   * An invalid request throws a ForecastCalibrationError and leaves the page as it was.
   * @param {Record<string, any>} request
   */
  submit(request) {
    const next = submit(request);
    rows = rowsFrom(typeof request.table === 'string' ? parseTable(request.table) : request.predictions);
    dropUndo();
    writeSettings(request);
    renderRows();
    result = next;
    resultRequest = currentRequest();
    showIssues([]);
    renderResult();
    save();
    return next;
  },
  getRequest: currentRequest,
  getResult: () => result,
  exportSvgText,
  exportPngBlob,
  exportBinsCsv: () => {
    if (!result) throw new Error('There is no result to export yet.');
    return binsCsv(result);
  },
} });

// ---------- start ----------

if (restore()) {
  renderRows();
  run();
} else {
  await loadExample();
}
document.documentElement.dataset.ready = 'true';
