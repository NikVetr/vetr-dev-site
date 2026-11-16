import { submit } from './core/browser.js';
import { examples } from './examples.js';
import { createHistory, bindHistoryShortcuts, bindFormHistory } from '../shared/history.js';
import { mountExplorer } from './explorer.js';
import { explore, analyze, simulateInBrowser } from './core/explorer-browser.js';
import { exportLatex, exportPython } from './core/exports.js';
import { exportPyMC } from './core/pymc.js';
import { renderModelSpec } from './model-spec.js';
import { mountWorkspace } from './workspace.js';

/** @param {string} id */
function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing interface element: ${id}`);
  return el;
}
const source = /** @type {HTMLTextAreaElement} */ (byId('source'));
const output = /** @type {HTMLTextAreaElement} */ (byId('explore-output'));
const data = /** @type {HTMLTextAreaElement} */ (byId('data'));
const draws = /** @type {HTMLTextAreaElement} */ (byId('draws'));
const mode = /** @type {HTMLSelectElement} */ (byId('mode'));
const format = /** @type {HTMLSelectElement} */ (byId('explore-format'));
const sampleIndex = /** @type {HTMLInputElement} */ (byId('sample-index'));
const status = byId('status');
const errorBox = byId('error');
const generate = /** @type {HTMLButtonElement} */ (byId('export-model'));
const copy = /** @type {HTMLButtonElement} */ (byId('copy'));
const download = /** @type {HTMLButtonElement} */ (byId('download-exploration'));
const undo = /** @type {HTMLButtonElement} */ (byId('undo'));
const redo = /** @type {HTMLButtonElement} */ (byId('redo'));
/** @type {Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>} */
const fields = { source, data, draws, mode, sampleIndex };
/** @type {ReturnType<typeof mountExplorer>|undefined} */
let explorer;
let exportFilename = '', outputKey = '', specKey = '';
let exportRevision = 0;
const captureInputs = () => Object.fromEntries(Object.entries(fields).map(([key, el]) => [key, el.value]));
const capture = () => ({inputs:captureInputs(),exploration:explorer?.capture()??null});
/** Node selection and expansion are navigation, not edits.
 * @param {ReturnType<typeof capture>} snapshot */
const historyKey = snapshot => JSON.stringify({...snapshot, exploration:snapshot.exploration ? {...snapshot.exploration,selected:'',expanded:[],showStructure:false} : null});
function exportKey() {
  const state = explorer?.capture();
  return JSON.stringify([captureInputs(),format.value,state?.builtSource,state?.builtData,state?.overrides,state?.draws,state?.seed]);
}
function invalidateExport() {
  exportRevision++; output.value = ''; outputKey = ''; exportFilename = '';
  copy.disabled = download.disabled = true; status.textContent = 'Ready to generate';
  byId('warnings').hidden = true;
}
function showStale() { invalidateExport(); explorer?.inputChanged(); }
/** @param {string} key */
function loadExample(key) {
  const example = examples[/** @type {keyof typeof examples} */ (key)];
  source.value = example.source; data.value = JSON.stringify(example.data, null, 2);
  draws.value = JSON.stringify(example.draws, null, 2); sampleIndex.value = '1'; showStale();
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
undo.onclick = () => history.undo(); redo.onclick = () => history.redo();
for (const field of Object.values(fields)) field.addEventListener('input', showStale);
mode.onchange = () => { if (mode.value.startsWith('posterior')) /** @type {HTMLDetailsElement} */ (byId('inputs')).open = true; };
byId('example').onchange = () => { history.commit(); loadExample(/** @type {HTMLSelectElement} */ (byId('example')).value); explorer?.build({checkpointBefore:false}); };
byId('open-file').onclick = () => byId('file').click();
byId('file').onchange = async event => {
  const input = /** @type {HTMLInputElement} */ (event.target), file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 800000) throw new Error('Choose a Stan file smaller than 800 KB.');
    const text = await file.text(); history.commit(); source.value = text; showStale(); status.textContent = `Opened ${file.name}`; explorer?.build({checkpointBefore:false});
  } catch (error) { showError(error); }
  input.value = '';
};
/** @param {unknown} error */
function showError(error) { errorBox.hidden = false; errorBox.textContent = error instanceof Error ? error.message : String(error); status.textContent = 'Could not export'; }
/** @param {string} text @param {string} label */
function parseJSON(text,label) { try { return text.trim() ? JSON.parse(text) : null; } catch { throw new Error(`${label} is not valid JSON.`); } }
function showExportScope() {
  byId('r-options').hidden = format.value !== 'r';
  byId('export-scope').textContent = format.value === 'r'
    ? 'R translates the original Stan source. Graphical prior changes and fixed interventions are not applied. The converter also supports models outside the graphical explorer’s subset.'
    : 'Exports include the current graphical prior changes and fixed interventions.';
}
format.onchange = () => { invalidateExport(); showExportScope(); };
generate.onclick = async () => {
  history.commit(); invalidateExport(); errorBox.hidden = true; generate.disabled = true;
  const revision = exportRevision, key = exportKey(), selectedFormat = format.value;
  status.textContent = selectedFormat === 'r' ? 'Converting… first run loads the R runtime' : 'Generating…';
  try {
    let code, filename;
    /** @type {string[]} */ let warnings = [];
    if (selectedFormat === 'r') {
      const result = await submit({source:source.value,mode:mode.value,data:parseJSON(data.value,'Data'),draws:parseJSON(draws.value,'Posterior draws'),sampleIndex:Number(sampleIndex.value)});
      code = result.code; warnings = result.warnings; filename = 'model.R';
      if (revision === exportRevision && key === exportKey()) showSyntax(result.syntax);
    } else {
      const state = explorer?.capture();
      if (!state?.model || state.builtSource !== source.value || state.builtData !== data.value) throw new Error('Load the current model before exporting.');
      const options = { data:parseJSON(data.value,'Data')??{}, draws:state.draws, seed:state.seed, overrides:state.overrides };
      code = selectedFormat === 'latex' ? exportLatex(state.model,options) : selectedFormat === 'python' ? exportPython(state.model,options) : selectedFormat === 'pymc' ? exportPyMC(state.model,options) : JSON.stringify({model:state.model,overrides:state.overrides},null,2);
      filename = `model.${selectedFormat === 'latex' ? 'tex' : ['python','pymc'].includes(selectedFormat) ? 'py' : 'json'}`;
    }
    if (revision !== exportRevision || key !== exportKey()) { status.textContent = 'Inputs changed. Generate again for the current inputs.'; return; }
    output.value = code; exportFilename = filename; outputKey = key; copy.disabled = download.disabled = false;
    byId('warnings').textContent = warnings.join('\n'); byId('warnings').hidden = !warnings.length; status.textContent = 'Generated';
  } catch(error) { if (revision === exportRevision) showError(error); }
  finally { generate.disabled = false; }
};
copy.onclick = async () => { try { await navigator.clipboard.writeText(output.value); status.textContent = 'Copied'; } catch { output.focus(); output.select(); status.textContent = 'Copy the selected code using your keyboard.'; } };
download.onclick = () => {
  if (!exportFilename) return;
  const url = URL.createObjectURL(new Blob([output.value],{type:'text/plain;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = exportFilename; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
};
/** @param {import('./core/compilation.js').SyntaxInfo|undefined} syntax @param {boolean} [stale] */
function showSyntax(syntax,stale=false) {
  const description = !syntax ? '' : syntax.migrated ? 'Legacy syntax modernized.' : syntax.detected === 'modern' ? 'Array syntax (Stan 2.26+).' : 'No version-specific syntax identified.';
  byId('syntax-status').textContent = syntax ? `${stale ? 'Previous model · ' : ''}${description}` : '';
  byId('syntax-status').title = syntax ? `Checked with ${syntax.compiler}. Exact authoring version is unknown.` : '';
  byId('syntax-migration').hidden = !syntax?.migrated;
  byId('normalized-source').textContent = syntax?.normalizedSource ?? '';
}
/** @param {import('./explorer.js').Snapshot} state @param {boolean} stale */
function changed(state,stale) {
  if (outputKey && outputKey !== exportKey()) invalidateExport();
  const nextKey = JSON.stringify([state.model,state.overrides,state.selected,stale]);
  if (nextKey === specKey) return;
  specKey = nextKey;
  try {
    renderModelSpec(byId('model-spec'),state,stale,id=>{
      explorer?.selectNode(id);
      const node = state.model?.nodes.find(node=>node.id===id);
      if (!node) return;
      if (state.model?.syntax?.migrated) { /** @type {HTMLDetailsElement} */ (byId('syntax-migration')).open = true; return; }
      workspace.show('code');
      const offset = source.value.split('\n').slice(0,node.line-1).reduce((n,line)=>n+line.length+1,0);
      source.setSelectionRange(offset,offset+(source.value.split('\n')[node.line-1]?.length??0));
      source.scrollTop = Math.max(0,(node.line-3)*parseFloat(getComputedStyle(source).lineHeight));
    });
  } catch(error) { byId('model-spec').textContent = `Could not render equations: ${error instanceof Error ? error.message : error}`; }
  showSyntax(state.model?.syntax,stale);
  byId('spec-scenario').textContent = Object.keys(state.overrides).length ? 'Exploratory changes' : 'Original model';
}
explorer = mountExplorer({root:byId('explorer'),buildButton:/** @type {HTMLButtonElement} */(byId('build-model')),readSource:()=>source.value,readData:()=>data.value,checkpoint:()=>history.commit(),refresh:()=>history.refresh(),onChange:changed});
const workspace = mountWorkspace();
history.replace(); showExportScope();
const api = { submit, explore, analyze, simulate:simulateInBrowser, exportLatex, exportPython, exportPyMC };
Object.assign(window, { Stan2R:api, StanTheExplorer:api, StanStudio:api });
explorer.build();
