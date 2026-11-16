import { submit } from './core/browser.js';
import { examples } from './examples.js';
import { createHistory, bindHistoryShortcuts, bindFormHistory } from '../shared/history.js';
import { mountExplorer } from './explorer.js';
import { explore, analyze, simulateInBrowser } from './core/explorer-browser.js';
import { exportLatex, exportPython } from './core/exports.js';
import { exportPyMC } from './core/pymc.js';

/** @param {string} id */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing interface element: ${id}`);
  return el;
}
const source = /** @type {HTMLTextAreaElement} */ (byId('source'));
const output = /** @type {HTMLTextAreaElement} */ (byId('output'));
const data = /** @type {HTMLTextAreaElement} */ (byId('data'));
const draws = /** @type {HTMLTextAreaElement} */ (byId('draws'));
const mode = /** @type {HTMLSelectElement} */ (byId('mode'));
const sampleIndex = /** @type {HTMLInputElement} */ (byId('sample-index'));
const status = byId('status');
const errorBox = byId('error');
const convert = /** @type {HTMLButtonElement} */ (byId('convert'));
const copy = /** @type {HTMLButtonElement} */ (byId('copy'));
const download = /** @type {HTMLButtonElement} */ (byId('download'));
const undo = /** @type {HTMLButtonElement} */ (byId('undo'));
const redo = /** @type {HTMLButtonElement} */ (byId('redo'));
/** @type {Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>} */
const fields = { source, data, draws, mode, sampleIndex };
let lastInput = '';
/** @type {ReturnType<typeof mountExplorer>|undefined} */
let explorer;

const captureInputs = () => Object.fromEntries(Object.entries(fields).map(([key, el]) => [key, el.value]));
const capture = () => ({inputs:captureInputs(),exploration:explorer?.capture()??null});
/** Node selection is navigation, not an edit to the model or diagram.
 * @param {ReturnType<typeof capture>} snapshot */
const historyKey = snapshot => JSON.stringify({...snapshot, exploration:snapshot.exploration ? {...snapshot.exploration,selected:''} : null});
function showStale() { byId('stale').hidden = !output.value || JSON.stringify(captureInputs()) === lastInput; explorer?.inputChanged(); }
/** @param {string} key */
function loadExample(key) {
  const example = examples[/** @type {keyof typeof examples} */ (key)];
  source.value = example.source;
  data.value = JSON.stringify(example.data, null, 2);
  draws.value = JSON.stringify(example.draws, null, 2);
  sampleIndex.value = '1';
  showStale();
}
loadExample('normal');
const history = createHistory({
  capture,
  equal: (a,b) => historyKey(a) === historyKey(b),
  restore(snapshot) { for (const [key, value] of Object.entries(snapshot.inputs)) fields[key].value = value; explorer?.restore(snapshot.exploration); showStale(); },
  onChange(h) { undo.disabled = !h.canUndo; redo.disabled = !h.canRedo; },
});
history.refresh();
bindHistoryShortcuts(history);
bindFormHistory(history, { filter: el => Object.values(fields).includes(/** @type {any} */ (el)) });
undo.onclick = () => history.undo();
redo.onclick = () => history.redo();
for (const field of Object.values(fields)) field.addEventListener('input', showStale);
mode.onchange = () => {
  if (mode.value.startsWith('posterior')) /** @type {HTMLDetailsElement} */ (byId('inputs')).open = true;
};
byId('load-example').onclick = () => {
  history.commit(); loadExample(/** @type {HTMLSelectElement} */ (byId('example')).value); history.commit();
};
byId('open-file').onclick = () => byId('file').click();
byId('file').onchange = async event => {
  const input = /** @type {HTMLInputElement} */ (event.target);
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 800000) throw new Error('Choose a Stan file smaller than 800 KB.');
    const text = await file.text();
    history.commit(); source.value = text; history.commit(); showStale();
    status.textContent = `Opened ${file.name}`;
  } catch (error) { showError(error); }
  input.value = '';
};
/** @param {any} error */
function showError(error) {
  errorBox.hidden = false;
  errorBox.textContent = error.message;
  status.textContent = 'Could not convert';
}
convert.onclick = async () => {
  showView(false);
  history.commit();
  errorBox.hidden = true;
  byId('warnings').hidden = true;
  convert.disabled = true;
  const snapshot = JSON.stringify(captureInputs());
  status.textContent = 'Converting… first run loads the R runtime';
  try {
    let parsedData, parsedDraws;
    try { parsedData = data.value.trim() ? JSON.parse(data.value) : null; }
    catch { throw new Error('Data is not valid JSON.'); }
    try { parsedDraws = draws.value.trim() ? JSON.parse(draws.value) : null; }
    catch { throw new Error('Posterior draws are not valid JSON.'); }
    const result = await submit({ source: source.value, mode: mode.value, data: parsedData, draws: parsedDraws, sampleIndex: Number(sampleIndex.value) });
    output.value = result.code;
    lastInput = snapshot;
    copy.disabled = download.disabled = false;
    const warnings = byId('warnings');
    warnings.textContent = result.warnings.join('\n'); warnings.hidden = !result.warnings.length;
    status.textContent = 'Converted';
    showStale();
  } catch (error) { showError(error); }
  finally { convert.disabled = false; }
};
copy.onclick = async () => {
  try { await navigator.clipboard.writeText(output.value); status.textContent = 'Copied R code'; }
  catch { status.textContent = 'Select the generated code and copy it using your keyboard.'; output.focus(); output.select(); }
};
download.onclick = () => {
  const url = URL.createObjectURL(new Blob([output.value], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'model.R'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
function showView(exploring = true) {
  byId('explorer').hidden = !exploring;
  byId('r-panel').hidden = exploring;
  /** @type {HTMLElement} */(document.querySelector('.conversion-toolbar')).hidden = exploring;
  document.querySelector('.editors')?.classList.toggle('exploring', exploring);
  byId('show-explorer').setAttribute('aria-pressed', String(exploring));
  byId('show-converter').setAttribute('aria-pressed', String(!exploring));
}
byId('show-explorer').onclick = () => showView(true);
byId('show-converter').onclick = () => showView(false);
explorer = mountExplorer({root:byId('explorer'),readSource:()=>source.value,readData:()=>data.value,checkpoint:()=>history.commit(),refresh:()=>history.refresh()});
history.replace();
Object.assign(window, { Stan2R: { submit, explore, analyze, simulate:simulateInBrowser, exportLatex, exportPython, exportPyMC } });
explorer.build();
