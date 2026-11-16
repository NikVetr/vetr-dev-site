import { analyze, simulateInBrowser } from './core/explorer-browser.js';
import { expressionText, expressionVariables } from './core/expressions.js';
import { exportLatex, exportPython } from './core/exports.js';

const NS = 'http://www.w3.org/2000/svg';
/** @param {string} name @param {Record<string,string|number>} [attrs] @param {string} [text] */
function svgElement(name, attrs = {}, text = '') {
  const el = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  el.textContent = text; return el;
}
/** @param {string} text @param {string} name @param {string} [type] */
function save(text, name, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** @typedef {import('./core/model.js').Model} Model */
/** @typedef {ReturnType<typeof import('./core/simulation.js').simulate>} Result */
/** @typedef {{model:Model|null,builtSource:string,builtData:string,overrides:Record<string,{fixed?:number|number[],args?:Record<string,number>}>,positions:Record<string,{x:number,y:number}>,selected:string,draws:number,seed:number,view:string}} Snapshot */
/** @param {{root:HTMLElement,readSource:()=>string,readData:()=>string,checkpoint:()=>void,refresh:()=>void}} options */
export function mountExplorer({ root, readSource, readData, checkpoint, refresh }) {
  root.innerHTML = `
    <div class="panel-head"><h2>Model explorer</h2><button type="button" id="build-model" class="primary">Build &amp; simulate</button></div>
    <div class="explore-settings">
      <label>View <select id="graph-view"><option value="flow">Dependency flow</option><option value="plate">Plate diagram</option></select></label>
      <label>Draws <select id="simulation-draws"><option>500</option><option selected>1000</option><option>4000</option></select></label>
      <label>Seed <input id="simulation-seed" type="number" min="0" max="4294967295" value="12345"></label>
      <button type="button" id="reset-layout">Arrange</button>
    </div>
    <p id="explore-status" role="status">Build a graph to explore priors and their predictions.</p>
    <p id="explore-error" role="alert" hidden></p>
    <p id="explore-stale" hidden>Source or data changed. Build again to update the graph and predictions.</p>
    <div class="graph-scroll"><svg id="model-graph" viewBox="0 0 800 320" aria-label="Model dependencies" role="group"></svg></div>
    <div class="graph-key"><span class="key-input">● Input</span><span class="key-stochastic">○ Parameter</span><span class="key-deterministic">◇ Transform</span><span class="key-observed">● Predicted data</span><span>Drag nodes · arrow keys move a focused node · scroll across larger graphs</span></div>
    <fieldset id="node-controls"><legend>Select a node to explore it</legend></fieldset>
    <div class="scenario-line"><span id="scenario-label">Original model</span><button type="button" id="reset-scenario" disabled>Reset changes</button></div>
    <div id="marginals" class="marginals" aria-label="Prior predictive marginal distributions"></div>
    <p id="comparison-key" class="hint" hidden><span class="reference-mark"></span> Original model · colored bars show your changes on the same scale.</p>
    <p class="hint">Independent Monte Carlo draws, not a posterior fit. Vector histograms show one element at a time. Inputs stay fixed; sampled data nodes are generated anew.</p>
    <details class="export-panel"><summary>Export this model</summary>
      <div class="toolbar"><label for="explore-format">Format</label><select id="explore-format"><option value="latex">LaTeX equations</option><option value="python">Python · NumPy simulation</option><option value="graph">Graph JSON</option></select><button type="button" id="export-model">Generate</button><button type="button" id="download-exploration" disabled>Download</button></div>
      <textarea id="explore-output" rows="8" readonly spellcheck="false" aria-label="Exported model"></textarea>
    </details>`;
  /** @template {HTMLElement} T @param {string} id @returns {T} */
  const get = id => /** @type {T} */ (root.querySelector(`#${id}`));
  const graph = /** @type {SVGSVGElement} */ (root.querySelector('#model-graph'));
  const build = /** @type {HTMLButtonElement} */ (get('build-model'));
  const controls = /** @type {HTMLFieldSetElement} */ (get('node-controls'));
  const view = /** @type {HTMLSelectElement} */ (get('graph-view'));
  const draws = /** @type {HTMLSelectElement} */ (get('simulation-draws'));
  const seed = /** @type {HTMLInputElement} */ (get('simulation-seed'));
  const format = /** @type {HTMLSelectElement} */ (get('explore-format'));
  const output = /** @type {HTMLTextAreaElement} */ (get('explore-output'));
  /** @type {Snapshot} */
  let state = { model: null, builtSource: '', builtData: '', overrides: {}, positions: {}, selected: '', draws: 1000, seed: 12345, view: 'flow' };
  /** @type {Result|null} */
  let result = null;
  /** @type {Result|null} */
  let baseline = null;
  let baselineKey = '';
  let revision = 0, running = false, queued = false;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  /** @type {Record<string,number>} */
  const components = {};
  /** @type {{id:string,startX:number,startY:number,x:number,y:number,moved:boolean}|null} */
  let drag = null;
  let exportFilename = '';
  const isStale = () => state.builtSource !== readSource() || state.builtData !== readData();
  const selectedNode = () => state.model?.nodes.find(node => node.id === state.selected);
  /** @param {unknown} error */
  function showError(error) {
    get('explore-error').hidden = false;
    get('explore-error').textContent = error instanceof Error ? error.message : String(error);
    get('explore-status').textContent = 'Could not simulate this model.';
  }
  function invalidateExport() {
    output.value = ''; exportFilename = '';
    /** @type {HTMLButtonElement} */ (get('download-exploration')).disabled = true;
  }
  function inputChanged() {
    const stale = !!state.model && isStale();
    if(stale){revision++;invalidateExport();}
    get('explore-stale').hidden = !stale;
    controls.disabled = stale;
    get('marginals').classList.toggle('is-stale', stale);
  }
  function arrange() {
    if (!state.model) return;
    /** @type {Map<string,number>} */ const levels = new Map();
    for (const id of state.model.order) {
      const node = state.model.nodes.find(n => n.id === id);
      levels.set(id, Math.max(0, ...(node?.parents.map(p => (levels.get(p) ?? 0) + 1) ?? [])));
    }
    state.positions = {};
    const width=Math.max(800,Math.max(...[...levels.values()].map(level=>[...levels.values()].filter(d=>d===level).length))*190);
    for (const [id, level] of levels) {
      const peers = [...levels].filter(([,depth]) => depth === level).map(([name]) => name);
      state.positions[id] = { x: (peers.indexOf(id) + 1) * width / (peers.length + 1), y: 62 + level * 112 };
    }
  }
  function drawGraph() {
    graph.replaceChildren();
    if (!state.model) return;
    const height = Math.max(240, ...Object.values(state.positions).map(p => p.y + 62));
    const width = Math.max(800, ...Object.values(state.positions).map(p => p.x + 95));
    graph.setAttribute('viewBox', `0 0 ${width} ${height}`);
    graph.style.minWidth=`${Math.max(600,width*.7)}px`;
    const defs = svgElement('defs');
    const marker = svgElement('marker', { id: 'dependency-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 Z', fill: 'currentColor' })); defs.append(marker); graph.append(defs);
    for (const edge of state.model.edges) {
      const target=state.model.nodes.find(n=>n.id===edge.to);
      if(target && state.overrides[target.id]?.fixed!==undefined &&
        ![...target.dimensions,...Object.values(target.bounds)].some(e=>expressionVariables(e).includes(edge.from)))continue;
      const a = state.positions[edge.from], b = state.positions[edge.to]; if (!a || !b) continue;
      const dx = b.x-a.x, dy = b.y-a.y, distance = Math.hypot(dx,dy);
      if(distance<1)continue;
      const boundary = state.view==='plate' ? 1/Math.sqrt((dx/70)**2+(dy/32)**2) : Math.min(78/Math.abs(dx),30/Math.abs(dy));
      const start = { x:a.x+dx*(boundary+2/distance), y:a.y+dy*(boundary+2/distance) }, end = { x:b.x-dx*(boundary+6/distance), y:b.y-dy*(boundary+6/distance) };
      const path = svgElement('path', { d:`M${start.x},${start.y} L${end.x},${end.y}`, class:'dependency-edge', 'marker-end':'url(#dependency-arrow)' });
      path.append(svgElement('title', {}, `${edge.from} → ${edge.to}`)); graph.append(path);
    }
    for (const node of state.model.nodes) {
      const p = state.positions[node.id]; if (!p) continue;
      const g = svgElement('g', { transform:`translate(${p.x},${p.y})`, class:`model-node node-${node.kind}${state.selected === node.id ? ' selected' : ''}`, 'data-node':node.id, tabindex:0, role:'button', 'aria-label':`${node.id}, ${node.kind}. Select to edit; arrow keys move.`, 'aria-pressed':String(state.selected===node.id) });
      if (state.view === 'plate' && node.dimensions.length) {
        g.append(svgElement('rect', { x:-88,y:-49,width:176,height:104,rx:4,class:'plate-outline' }));
        g.append(svgElement('text', {x:80,y:48,'text-anchor':'end',class:'plate-label'}, node.dimensions.map(d => `1…${expressionText(d)}`).join(' × ')));
      }
      g.append(svgElement(state.view==='plate' ? 'ellipse' : 'rect', state.view==='plate' ? {cx:0,cy:0,rx:70,ry:32,class:'node-shape'} : {x:-78,y:-30,width:156,height:60,rx:node.kind==='deterministic'?2:12,class:'node-shape'}));
      g.append(svgElement('text', { y:-3,'text-anchor':'middle',class:'node-name' }, node.id));
      const caption = state.overrides[node.id]?.fixed !== undefined ? 'fixed scenario' : node.distribution?.name || (node.expression ? 'transform' : 'input');
      g.append(svgElement('text', { y:15,'text-anchor':'middle',class:'node-caption' }, caption));
      g.addEventListener('click', () => { if (drag?.moved) return; state.selected=node.id; renderSelection(); });
      g.addEventListener('keydown', raw => {
        const e=/** @type {KeyboardEvent} */(raw);
        if (e.key==='Enter' || e.key===' ') { e.preventDefault(); state.selected=node.id; renderSelection(); return; }
        const delta = /** @type {Record<string,number[]>} */ ({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]})[e.key];
        if (!delta) return; e.preventDefault(); checkpoint();
        state.positions = {...state.positions,[node.id]:{x:Math.max(90,Math.min(width-90,p.x+delta[0]*(e.shiftKey?20:5))),y:Math.max(55,p.y+delta[1]*(e.shiftKey?20:5))}};
        drawGraph();
        /** @type {SVGElement|null} */ (graph.querySelector(`[data-node="${node.id}"]`))?.focus(); checkpoint();
      });
      g.addEventListener('pointerdown', raw => {
        const e=/** @type {PointerEvent} */(raw); if(e.button!==0) return;
        checkpoint(); const point=graphPoint(e);
        drag={id:node.id,startX:point.x,startY:point.y,x:p.x,y:p.y,moved:false}; graph.setPointerCapture(e.pointerId);
      }); graph.append(g);
    }
  }
  /** @param {PointerEvent} event */
  function graphPoint(event) { const point=graph.createSVGPoint();point.x=event.clientX;point.y=event.clientY;return point.matrixTransform(graph.getScreenCTM()?.inverse()); }
  graph.addEventListener('pointermove', event => {
    if(!drag) return; const p=graphPoint(event); if(Math.hypot(p.x-drag.startX,p.y-drag.startY)<3) return;
    drag.moved=true;
    state.positions={...state.positions,[drag.id]:{x:Math.max(90,Math.min(graph.viewBox.baseVal.width-90,drag.x+p.x-drag.startX)),y:Math.max(55,drag.y+p.y-drag.startY)}}; drawGraph();
  });
  graph.addEventListener('pointerup', event => {
    if(!drag) return;
    const id=drag.id; if(graph.hasPointerCapture(event.pointerId)) graph.releasePointerCapture(event.pointerId);
    state.selected=id; drag=null; renderSelection(); checkpoint();
  });
  graph.addEventListener('pointercancel', () => {drag=null;checkpoint();});
  function renderSelection() {
    const focused=graph.contains(document.activeElement)?document.activeElement?.getAttribute('data-node'):null;
    drawGraph(); renderControls();
    if(focused)/** @type {SVGElement|null} */(graph.querySelector(`[data-node="${focused}"]`))?.focus();
  }
  /** @param {string} id @param {{fixed?:number|number[],args?:Record<string,number>}} change */
  function setOverride(id, change) {
    state.overrides={...state.overrides};
    if(change.fixed===undefined && !Object.keys(change.args??{}).length)delete state.overrides[id];else state.overrides[id]=change;
    invalidateExport(); updateScenario(); schedule(); refresh();
  }
  function updateScenario() {
    const changed=Object.keys(state.overrides).length;
    get('scenario-label').textContent=changed ? 'Exploration changes · original Stan source unchanged' : 'Original model';
    /** @type {HTMLButtonElement} */(get('reset-scenario')).disabled=!changed;
    const node=selectedNode(),equation=controls.querySelector('.node-equation');
    if(node?.distribution && equation) {
      const current=state.overrides[node.id];
      equation.textContent=current?.fixed!==undefined?`${node.id} := ${Array.isArray(current.fixed)?current.fixed.join(', '):current.fixed} (fixed)`:
        `${node.id} ~ ${node.distribution.name}(${node.distribution.args.map((arg,index)=>current?.args?.[index]??expressionText(arg)).join(', ')})`;
    }
  }
  function renderControls() {
    controls.replaceChildren(); controls.disabled=isStale();
    const legend=document.createElement('legend'); const node=selectedNode();
    legend.textContent=node ? `${node.id} · ${node.block}` : 'Select a node to explore it'; controls.append(legend);
    if(!node) return;
    const equation=document.createElement('p'); equation.className='node-equation';
    equation.textContent=node.distribution ? `${node.id} ~ ${node.distribution.name}(${node.distribution.args.map(expressionText).join(', ')})` : node.expression ? `${node.id} = ${expressionText(node.expression)}` : 'Fixed input from Data JSON.';
    controls.append(equation);updateScenario();
    if(!node.distribution || node.kind==='observed') {
      const note=document.createElement('span');note.className='hint';note.textContent=node.kind==='observed'?'Predicted from its parents. Select a parameter above to change its prior.':'Edit the Stan source or Data JSON, then build again.';controls.append(note);return;
    }
    const current=state.overrides[node.id]||{};
    const fixLabel=document.createElement('label');fixLabel.className='fixed-choice';
    const fix=document.createElement('input');fix.type='checkbox';fix.checked=current.fixed!==undefined;fix.setAttribute('aria-label',`Fix ${node.id}`);
    fixLabel.append(fix,' Fix value (intervention)');controls.append(fixLabel);
    const fixed=document.createElement('input');fixed.type='number';fixed.step='any';fixed.className='fixed-value';fixed.setAttribute('aria-label',`Fixed value for ${node.id}`);
    const location=node.distribution.name==='normal' && node.distribution.args[0].kind==='number' ? node.distribution.args[0].value : 0;
    fixed.value=String(current.fixed ?? current.args?.[0] ?? location);fixed.hidden=!fix.checked;controls.append(fixed);
    fix.onchange=()=>{checkpoint();setOverride(node.id,fix.checked?{fixed:Number(fixed.value)}:{});renderSelection();checkpoint();};
    fixed.oninput=()=>{if(fixed.value.trim()&&Number.isFinite(fixed.valueAsNumber)) setOverride(node.id,{fixed:fixed.valueAsNumber});};fixed.onchange=()=>checkpoint();
    const argNames=/** @type {Record<string,string[]>} */({normal:['Location','SD'],lognormal:['Log location','Log SD'],student_t:['Degrees of freedom','Location','Scale'],beta:['Alpha','Beta'],gamma:['Shape','Rate'],exponential:['Rate'],uniform:['Lower','Upper'],cauchy:['Location','Scale'],bernoulli:['Probability'],binomial:['Trials','Probability'],poisson:['Rate']});
    node.distribution.args.forEach((arg,index)=>{
      const label=document.createElement('label');label.className='prior-argument';
      const title=document.createElement('span');title.textContent=argNames[node.distribution?.name||'']?.[index] || `Argument ${index+1}`;label.append(title);
      const initial=arg.kind==='number'?arg.value:arg.kind==='unary'&&arg.op==='-'&&arg.arg.kind==='number'?-arg.arg.value:undefined;
      if(initial===undefined) {const link=document.createElement('code');link.textContent=expressionText(arg);label.append(link);controls.append(label);return;}
      const value=current.args?.[index]??initial;
      const positive=/SD|Scale|Rate|Shape|Alpha|Beta|Degrees/.test(title.textContent);
      const probability=title.textContent==='Probability';
      const slider=document.createElement('input');slider.type='range';slider.min=String(probability?0:positive?0.01:Math.min(-5,initial*3));slider.max=String(probability?1:Math.max(5,Math.abs(initial)*3,value*1.2));slider.step=String(title.textContent==='Trials'?1:0.01);slider.value=String(value);slider.disabled=fix.checked;slider.setAttribute('aria-label',`${node.id} ${title.textContent}`);
      const number=document.createElement('input');number.type='number';number.step=slider.step;number.value=String(value);number.disabled=fix.checked;number.setAttribute('aria-label',`${node.id} ${title.textContent} value`);
      const change=(/** @type {HTMLInputElement} */ from)=>{
        if(!from.value.trim()||!Number.isFinite(from.valueAsNumber)) return;
        slider.value=number.value=from.value;
        setOverride(node.id,{args:{...state.overrides[node.id]?.args,[index]:from.valueAsNumber}});
      };
      slider.oninput=()=>change(slider);number.oninput=()=>change(number);slider.onchange=number.onchange=()=>checkpoint();
      label.append(slider,number);controls.append(label);
    });
    const note=document.createElement('p');note.className='hint';note.textContent='To collapse a prior to zero variance, use Fix value. This changes the generative scenario; it does not condition a posterior.';controls.append(note);
  }
  function drawMarginals() {
    const holder=get('marginals');holder.replaceChildren();
    const comparing=!!baseline&&!!Object.keys(state.overrides).length;
    get('comparison-key').hidden=!comparing||!result;
    if(!result||!state.model) return;
    holder.classList.remove('is-stale');
    for(const id of state.model.order) {
      const node=state.model.nodes.find(n=>n.id===id);
      if(!node||node.kind==='input'||node.block==='transformed data')continue;
      const rows=result.samples[node.id];if(!rows?.length) continue;
      const panel=document.createElement('section');panel.className=`marginal node-${node.kind}`;panel.dataset.marginal=node.id;
      const head=document.createElement('div');head.className='marginal-head';const title=document.createElement('button');title.type='button';title.textContent=node.id;title.onclick=()=>{state.selected=node.id;renderSelection();};head.append(title);
      const index=Math.min(components[node.id]??0,rows[0].length-1);
      if(rows[0].length>1) {const select=document.createElement('select');select.setAttribute('aria-label',`${node.id} element`);for(let i=0;i<rows[0].length;i++){const o=document.createElement('option');o.value=String(i);o.textContent=`[${i+1}]`;select.append(o);}select.value=String(index);select.onchange=()=>{components[node.id]=Number(select.value);drawMarginals();};head.append(select);}
      panel.append(head);
      if(!rows[0].length){const empty=document.createElement('p');empty.textContent='Empty vector · 0 elements';panel.append(empty);holder.append(panel);continue;}
      const values=rows.map(row=>row[index]);
      const mean=values.reduce((a,b)=>a+b,0)/values.length,sd=Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,values.length-1));
      const original=comparing?baseline?.samples[node.id]?.map(row=>row[index])??[]:[];
      let lo=Math.min(...values,...original),hi=Math.max(...values,...original);if(lo===hi){lo-=.5;hi+=.5;}
      const counts=Array(24).fill(0);for(const x of values) counts[Math.min(23,Math.floor((x-lo)/(hi-lo)*24))]++;
      const reference=Array(24).fill(0);for(const x of original)reference[Math.min(23,Math.floor((x-lo)/(hi-lo)*24))]++;
      const peak=Math.max(...counts,...reference),svg=svgElement('svg',{viewBox:'0 0 260 122',role:'img','aria-label':`${node.id}${rows[0].length>1?` element ${index+1}`:''}: mean ${mean.toPrecision(3)}, standard deviation ${sd.toPrecision(3)}. Histogram of ${values.length} draws.${comparing?' Gray outline: original model.':''}`});
      svg.append(svgElement('text',{x:4,y:12,class:'hist-count'},`${peak} draws`));
      counts.forEach((count,i)=>svg.append(svgElement('rect',{x:8+i*10,y:90-count/peak*68,width:9,height:count/peak*68,class:'hist-bar'})));
      if(comparing)svg.append(svgElement('path',{d:reference.map((count,i)=>`${i?'L':'M'}${8+i*10},${90-count/peak*68} H${18+i*10}`).join(' '),class:'hist-reference'}));
      svg.append(svgElement('line',{x1:8,y1:91,x2:248,y2:91,class:'hist-axis'}),svgElement('text',{x:8,y:108,class:'hist-tick'},lo.toPrecision(3)),svgElement('text',{x:248,y:108,'text-anchor':'end',class:'hist-tick'},hi.toPrecision(3)));
      panel.append(svg);const stats=document.createElement('p');stats.textContent=`Mean ${mean.toPrecision(3)} · SD ${sd.toPrecision(3)}`;panel.append(stats);holder.append(panel);
    }
  }
  function schedule() {revision++;if(timer)clearTimeout(timer);timer=setTimeout(()=>{timer=undefined;run();},100);}
  async function run() {
    if(!state.model||isStale())return;
    if(running){queued=true;return;}
    const version=revision;running=true;queued=false;
    get('explore-error').hidden=true;get('explore-status').textContent='Simulating…';get('marginals').classList.add('is-stale');
    try {
      const data=state.builtData.trim()?JSON.parse(state.builtData):{};
      const key=JSON.stringify([state.builtSource,state.builtData,state.draws,state.seed]);
      if(baselineKey!==key || !baseline){
        const original=await simulateInBrowser(state.model,{data,draws:state.draws,seed:state.seed});
        if(version!==revision)return;
        baseline=original;baselineKey=key;
      }
      const next=Object.keys(state.overrides).length ? await simulateInBrowser(state.model,{data,draws:state.draws,seed:state.seed,overrides:state.overrides}) : baseline;
      if(version!==revision)return;
      result=next;get('explore-status').textContent=`${next.draws.toLocaleString()} draws · seed ${next.seed}${next.warnings.length ? ` · ${next.warnings.join(' ')}` : ''}`;
      drawMarginals();updateScenario();
    }catch(error){if(version===revision){result=null;get('marginals').replaceChildren();showError(error);}}
    finally{running=false;if(queued){queued=false;run();}}
  }
  async function buildModel() {
    checkpoint();build.disabled=true;controls.disabled=true;invalidateExport();get('marginals').classList.add('is-stale');get('explore-error').hidden=true;get('explore-status').textContent='Checking Stan and building dependencies…';
    const source=readSource(),data=readData();revision++;
    try {
      const model=await analyze(source);
      if(source!==readSource()||data!==readData()){get('explore-status').textContent='Inputs changed; build again.';inputChanged();return;}
      state={...state,model,builtSource:source,builtData:data,overrides:{},selected:model.nodes.find(n=>n.kind==='stochastic')?.id||model.nodes[0]?.id||''};
      arrange();result=null;inputChanged();renderSelection();drawMarginals();updateScenario();checkpoint();await run();
    }catch(error){state.model=null;result=null;drawGraph();drawMarginals();renderControls();showError(error);}
    finally{build.disabled=false;}
  }
  build.onclick=buildModel;
  get('reset-layout').onclick=()=>{checkpoint();arrange();drawGraph();checkpoint();};
  get('reset-scenario').onclick=()=>{checkpoint();state.overrides={};renderSelection();updateScenario();invalidateExport();schedule();checkpoint();};
  view.onchange=()=>{checkpoint();state.view=view.value;drawGraph();checkpoint();};
  draws.onchange=()=>{checkpoint();state.draws=Number(draws.value);invalidateExport();schedule();checkpoint();};
  seed.onchange=()=>{checkpoint();state.seed=Number(seed.value);invalidateExport();schedule();checkpoint();};
  get('export-model').onclick=()=>{
    if(!state.model||isStale()){showError(new Error('Build the current model before exporting.'));return;}
    try {
      const options={data:state.builtData.trim()?JSON.parse(state.builtData):{},draws:state.draws,seed:state.seed,overrides:state.overrides};
      output.value=format.value==='latex'?exportLatex(state.model,options):format.value==='python'?exportPython(state.model,options):JSON.stringify({model:state.model,overrides:state.overrides},null,2);
      exportFilename=`model.${format.value==='latex'?'tex':format.value==='python'?'py':'json'}`;
      /** @type {HTMLButtonElement} */(get('download-exploration')).disabled=false;
    }catch(error){showError(error);}
  };
  format.onchange=invalidateExport;
  get('download-exploration').onclick=()=>{if(exportFilename)save(output.value,exportFilename);};
  return {
    build:buildModel,inputChanged,
    capture:()=>({...state,overrides:structuredClone(state.overrides),positions:structuredClone(state.positions)}),
    /** @param {Snapshot|null} snapshot */
    restore(snapshot){
      if(!snapshot)return;
      const resim=!result||snapshot.model!==state.model||snapshot.builtData!==state.builtData||snapshot.draws!==state.draws||snapshot.seed!==state.seed||JSON.stringify(snapshot.overrides)!==JSON.stringify(state.overrides);
      revision++;state={...snapshot,overrides:structuredClone(snapshot.overrides),positions:structuredClone(snapshot.positions)};
      view.value=state.view;draws.value=String(state.draws);seed.value=String(state.seed);invalidateExport();
      if(resim)result=null;
      inputChanged();renderSelection();drawMarginals();updateScenario();if(resim)schedule();
    },
  };
}
