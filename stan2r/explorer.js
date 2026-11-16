import { analyze, simulateInBrowser } from './core/explorer-browser.js';
import { expressionText, expressionVariables } from './core/expressions.js';

const NS = 'http://www.w3.org/2000/svg';
/** @param {string} name @param {Record<string,string|number>} [attrs] @param {string} [text] */
function svgElement(name, attrs = {}, text = '') {
  const el = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  el.textContent = text; return el;
}
/** @typedef {import('./core/model.js').Model} Model */
/** @typedef {ReturnType<typeof import('./core/simulation.js').simulate>} Result */
/** @typedef {{model:Model|null,builtSource:string,builtData:string,overrides:Record<string,{fixed?:number|number[],args?:Record<string,number>}>,positions:Record<string,{x:number,y:number}>,selected:string,expanded:string[],draws:number,seed:number,view:string}} Snapshot */
/** @param {{root:HTMLElement,readSource:()=>string,readData:()=>string,checkpoint:()=>void,refresh:()=>void,onChange?:(snapshot:Snapshot,stale:boolean)=>void}} options */
export function mountExplorer({ root, readSource, readData, checkpoint, refresh, onChange = () => {} }) {
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
    <div class="graph-key"><span class="key-input">● Input</span><span class="key-stochastic">○ Parameter</span><span class="key-deterministic">◇ Transform</span><span class="key-observed">● Predicted data</span><span>Click nodes to expand · drag headers to move · arrow keys move a focused node</span></div>
    <div class="scenario-line"><span id="scenario-label">Original model</span><button type="button" id="reset-scenario" disabled>Reset changes</button></div>
    <div id="marginals" class="marginals" aria-label="Prior predictive marginal distributions"></div>
    <p id="comparison-key" class="hint" hidden><span class="reference-mark"></span> Original model · colored bars show your changes on the same scale.</p>
    <p class="hint">Independent Monte Carlo draws, not a posterior fit. Vector histograms show one element at a time. Inputs stay fixed; sampled data nodes are generated anew. Fix value replaces a prior with a constant; it does not condition a posterior.</p>
`;
  /** @template {HTMLElement} T @param {string} id @returns {T} */
  const get = id => /** @type {T} */ (root.querySelector(`#${id}`));
  const graph = /** @type {SVGSVGElement} */ (root.querySelector('#model-graph'));
  const build = /** @type {HTMLButtonElement} */ (get('build-model'));
  const view = /** @type {HTMLSelectElement} */ (get('graph-view'));
  const draws = /** @type {HTMLSelectElement} */ (get('simulation-draws'));
  const seed = /** @type {HTMLInputElement} */ (get('simulation-seed'));
  /** @type {Snapshot} */
  let state = { model: null, builtSource: '', builtData: '', overrides: {}, positions: {}, selected: '', expanded: [], draws: 1000, seed: 12345, view: 'flow' };
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
  /** @type {Map<string, HTMLFieldSetElement>} */
  const nodeControls = new Map();
  /** @type {Record<string,{x:number,y:number}>} */
  let displayedPositions = {};
  const notify = () => onChange(state, isStale());
  const isStale = () => state.builtSource !== readSource() || state.builtData !== readData();
  /** Keep keyboard focus on its logical control when a view is redrawn. @param {Element} container */
  function retainFocus(container) {
    const active = document.activeElement;
    if (!(active instanceof Element) || !container.contains(active)) return () => {};
    const attributes = ['data-toggle-node', 'data-node', 'aria-label', 'data-select-node'];
    const key = attributes.find(name => active.hasAttribute(name));
    const value = key && active.getAttribute(key);
    return () => {
      if (!key || value === null) return;
      const replacement = [...container.querySelectorAll(`[${key}]`)].find(el => el.getAttribute(key) === value);
      if (replacement instanceof HTMLElement || replacement instanceof SVGElement) replacement.focus({ preventScroll: true });
    };
  }
  /** @param {import('./core/model.js').ModelNode} node */
  function activeParents(node) {
    const override = state.overrides[node.id];
    const expressions = [...node.dimensions, ...Object.values(node.bounds)];
    if (override?.fixed === undefined) {
      if (node.expression) expressions.push(node.expression);
      if (node.distribution) {
        expressions.push(...node.distribution.args.filter((_, index) => override?.args?.[index] === undefined));
        if (node.distribution.lower) expressions.push(node.distribution.lower);
        if (node.distribution.upper) expressions.push(node.distribution.upper);
      }
    }
    return new Set(expressions.flatMap(expressionVariables));
  }
  function highlightSelection() {
    for (const node of graph.querySelectorAll('[data-node]')) {
      const selected = node.getAttribute('data-node') === state.selected;
      node.classList.toggle('selected', selected); node.setAttribute('aria-pressed', String(selected));
    }
    for (const panel of root.querySelectorAll('[data-marginal]')) {
      const selected = panel.getAttribute('data-marginal') === state.selected;
      panel.classList.toggle('selected', selected);
      panel.querySelector('[data-select-node]')?.setAttribute('aria-pressed', String(selected));
    }
  }
  /** @param {unknown} error */
  function showError(error) {
    get('explore-error').hidden = false;
    get('explore-error').textContent = error instanceof Error ? error.message : String(error);
    get('explore-status').textContent = 'Could not simulate this model.';
  }
  function inputChanged() {
    const stale = !!state.model && isStale();
    if(stale){revision++;notify();}
    get('explore-stale').hidden = !stale;
    for (const controls of nodeControls.values()) controls.disabled = stale;
    notify();
    get('marginals').classList.toggle('is-stale', stale);
  }
  function dependencyLevels() {
    /** @type {Map<string,number>} */ const levels = new Map();
    for (const id of state.model?.order??[]) {
      const node = state.model?.nodes.find(n => n.id === id);
      levels.set(id, Math.max(0, ...(node?.parents.map(p => (levels.get(p) ?? 0) + 1) ?? [])));
    }
    return levels;
  }
  function arrange() {
    if(!state.model)return;
    const levels=dependencyLevels();
    state.positions = {};
    const width=Math.max(560,(Math.max(...[...levels.values()].map(level=>[...levels.values()].filter(d=>d===level).length))+1)*280);
    for (const [id, level] of levels) {
      const peers = [...levels].filter(([,depth]) => depth === level).map(([name]) => name);
      state.positions[id] = { x: (peers.indexOf(id) + 1) * width / (peers.length + 1) - 130, y: 62 + level * 112 };
    }
  }
  /** @param {import('./core/model.js').ModelNode} node */
  function nodeHeight(node) {
    if (!state.expanded.includes(node.id)) return 60;
    const controls = nodeControls.get(node.id);
    return controls ? 66 + Number(controls.dataset.height || 140) : 220;
  }
  function layoutPositions() {
    const positions = {...state.positions};
    // Expansion adds space below each original row without replacing the user's saved positions.
    const levels=dependencyLevels(),rows=[...new Set(levels.values())].sort((a,b)=>a-b);
    let offset=0;
    for (const level of rows) {
      const members=state.model?.nodes.filter(n => levels.get(n.id)===level) ?? [];
      for (const node of members) positions[node.id]={...state.positions[node.id], y:state.positions[node.id].y+offset};
      offset += Math.max(0,...members.map(n => nodeHeight(n)-60));
    }
    return positions;
  }
  function drawEdges() {
    const layer=graph.querySelector('.dependency-edges'); if(!layer||!state.model)return;
    layer.replaceChildren();const levels=dependencyLevels();
    for (const edge of state.model.edges) {
      const target=state.model.nodes.find(n=>n.id===edge.to),source=state.model.nodes.find(n=>n.id===edge.from);
      if(!target||!source||!activeParents(target).has(edge.from))continue;
      const a=displayedPositions[edge.from],b=displayedPositions[edge.to];if(!a||!b)continue;
      const ah=nodeHeight(source),bh=nodeHeight(target),aw=state.expanded.includes(source.id)?130:78,bw=state.expanded.includes(target.id)?130:78;
      const ac={x:a.x,y:a.y+(ah-60)/2},bc={x:b.x,y:b.y+(bh-60)/2};
      const dx=bc.x-ac.x,dy=bc.y-ac.y,distance=Math.hypot(dx,dy);if(distance<1)continue;
      const startBoundary=Math.min(aw/Math.abs(dx),(ah/2)/Math.abs(dy));
      const endBoundary=Math.min(bw/Math.abs(dx),(bh/2)/Math.abs(dy));
      let pathData=`M${ac.x+dx*(startBoundary+2/distance)},${ac.y+dy*(startBoundary+2/distance)} L${bc.x-dx*(endBoundary+6/distance)},${bc.y-dy*(endBoundary+6/distance)}`;
      const sourceRow=levels.get(source.id);
      const rowBottom=Math.max(...state.model.nodes.filter(n=>levels.get(n.id)===sourceRow).map(n=>displayedPositions[n.id].y+nodeHeight(n)-30));
      if(b.y-30>rowBottom+12) {
        // Route through the gap beneath this row, so expanded siblings do not cover incoming edges.
        const lane=(rowBottom+b.y-30)/2;
        pathData=`M${a.x},${a.y+ah-28} V${lane} H${b.x} V${b.y-36}`;
      }
      const path=svgElement('path',{d:pathData,class:'dependency-edge','marker-end':'url(#dependency-arrow)'});
      path.append(svgElement('title',{},`${edge.from} → ${edge.to}`));layer.append(path);
    }
  }
  /** @param {boolean} [force] */
  function drawGraph(force=false) {
    if(!force && document.activeElement instanceof HTMLInputElement && graph.contains(document.activeElement)){drawEdges();return;}

    const restoreFocus = retainFocus(graph);
    graph.replaceChildren();
    if (!state.model) return;
    displayedPositions=layoutPositions();
    const height = Math.max(240, ...state.model.nodes.map(n => (displayedPositions[n.id]?.y??0) + nodeHeight(n) + 10));
    const width = Math.max(560, ...Object.values(displayedPositions).map(p => p.x + 150));
    graph.setAttribute('viewBox', `0 0 ${width} ${height}`);
    graph.style.width=`${width}px`;graph.style.minWidth=`${width}px`;
    const defs = svgElement('defs');
    const marker = svgElement('marker', { id: 'dependency-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 Z', fill: 'currentColor' })); defs.append(marker); graph.append(defs);
    graph.append(svgElement('g',{class:'dependency-edges'}));drawEdges();
    for (const node of state.model.nodes) {
      const p = displayedPositions[node.id]; if (!p) continue;
      const expanded=state.expanded.includes(node.id),height=nodeHeight(node);
      const g = svgElement('g', { transform:`translate(${p.x},${p.y})`, class:`model-node node-${node.kind}${state.selected === node.id ? ' selected' : ''}`, 'data-node':node.id, tabindex:-1, role:'group', 'aria-label':`${node.id}, ${node.kind}. ${expanded?'Collapse':'Expand'} controls; arrow keys move.`, 'aria-expanded':String(expanded), 'aria-pressed':String(state.selected===node.id) });
      if (state.view === 'plate' && node.dimensions.length) {
        const element = node.kind !== 'input' && node.block !== 'transformed data' && result?.samples[node.id]?.[0]?.length ? ` · [${(components[node.id] ?? 0) + 1}]` : '';
        g.append(svgElement('rect', { x:expanded?-140:-88,y:-49,width:expanded?280:176,height:height+44,rx:4,class:'plate-outline' }));
        g.append(svgElement('text', {x:expanded?130:80,y:height+18,'text-anchor':'end',class:'plate-label'}, node.dimensions.map(d => `1…${expressionText(d)}`).join(' × ') + element));
      }
      g.append(svgElement('title', {}, node.dimensions.length ? `${node.id}: dimensions ${node.dimensions.map(expressionText).join(' × ')}. The bracketed index identifies the displayed marginal element.` : `${node.id}: ${node.block}`));
      g.append(svgElement(state.view==='plate'&&!expanded ? 'ellipse' : 'rect', state.view==='plate'&&!expanded ? {cx:0,cy:0,rx:70,ry:32,class:'node-shape'} : {x:expanded?-130:-78,y:-30,width:expanded?260:156,height,rx:node.kind==='deterministic'?2:12,class:'node-shape'}));
      const labelSize=Math.min(17,(expanded?218:108)/(node.id.length*.62));
      const header=svgElement('g',{tabindex:0,role:'button','data-toggle-node':node.id,'aria-expanded':String(expanded),'aria-label':`${expanded?'Collapse':'Expand'} ${node.id}`});
      header.append(svgElement('rect',{x:expanded?-130:-78,y:-30,width:expanded?260:156,height:56,fill:'transparent'}));
      header.append(svgElement('title', {}, node.id));
      header.append(svgElement('text', { x:-6,y:-3,'text-anchor':'middle',class:'node-name',style:`font-size:${labelSize}px` }, node.id));
      const caption = state.overrides[node.id]?.fixed !== undefined ? 'fixed scenario' : node.distribution?.name || (node.expression ? 'transform' : 'input');
      header.append(svgElement('text', { y:15,'text-anchor':'middle',class:'node-caption' }, caption));
      header.append(svgElement('text',{x:expanded?115:65,y:-3,'text-anchor':'end',class:'node-caption'},expanded?'−':'+'));
      g.append(header);
      if(expanded) {
        const foreign=svgElement('foreignObject',{x:-130,y:26,width:260,height:height-56});
        const controls=nodeControls.get(node.id);if(controls)foreign.append(controls);
        for(const event of ['pointerdown','click'])foreign.addEventListener(event,e=>e.stopPropagation());
        foreign.addEventListener('keydown',raw=>{const e=/** @type {KeyboardEvent} */(raw);if(!e.ctrlKey&&!e.metaKey)e.stopPropagation();});
        g.append(foreign);
      }
      g.addEventListener('click', () => { if (suppressClick) {suppressClick=false;return;} toggleNode(node.id); });
      g.addEventListener('keydown', raw => {
        const e=/** @type {KeyboardEvent} */(raw);
        if (e.key==='Enter' || e.key===' ') { e.preventDefault(); toggleNode(node.id); return; }
        const delta = /** @type {Record<string,number[]>} */ ({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]})[e.key];
        if (!delta) return; e.preventDefault(); checkpoint();
        state.positions = {...state.positions,[node.id]:{x:Math.max(90,Math.min(width-90,state.positions[node.id].x+delta[0]*(e.shiftKey?20:5))),y:Math.max(55,state.positions[node.id].y+delta[1]*(e.shiftKey?20:5))}};
        drawGraph();
        /** @type {SVGElement|null} */ (graph.querySelector(`[data-node="${node.id}"]`))?.focus(); checkpoint();
      });
      g.addEventListener('pointerdown', raw => {
        const e=/** @type {PointerEvent} */(raw); if(e.button!==0) return;
        const point=graphPoint(e);
        drag={id:node.id,startX:point.x,startY:point.y,x:state.positions[node.id].x,y:state.positions[node.id].y,moved:false}; graph.setPointerCapture(e.pointerId);
      }); graph.append(g);
    }
    restoreFocus();
  }
  let suppressClick=false;
  /** @param {PointerEvent} event */
  function graphPoint(event) { const point=graph.createSVGPoint();point.x=event.clientX;point.y=event.clientY;return point.matrixTransform(graph.getScreenCTM()?.inverse()); }
  graph.addEventListener('pointermove', event => {
    if(!drag) return; const p=graphPoint(event); if(Math.hypot(p.x-drag.startX,p.y-drag.startY)<3) return;
    if (!drag.moved) checkpoint();
    drag.moved=true;
    state.positions={...state.positions,[drag.id]:{x:Math.max(90,Math.min(graph.viewBox.baseVal.width-90,drag.x+p.x-drag.startX)),y:Math.max(55,drag.y+p.y-drag.startY)}}; drawGraph();
  });
  graph.addEventListener('pointerup', event => {
    if(!drag) return;
    const {id,moved}=drag; if(graph.hasPointerCapture(event.pointerId)) graph.releasePointerCapture(event.pointerId);
    state.selected=id;drag=null;suppressClick=true;
    if(moved){renderSelection();checkpoint();}else toggleNode(id);
    setTimeout(()=>{suppressClick=false;},0);
  });
  graph.addEventListener('pointercancel', () => {const moved=drag?.moved;drag=null;if(moved)checkpoint();});
  function renderSelection() {
    const restoreFocus=retainFocus(graph);renderControls();drawGraph(true);highlightSelection();notify();restoreFocus();
  }
  /** Scroll only the diagram viewport, leaving the source/specification in place. @param {string} id */
  function revealNode(id) {
    const node=state.model?.nodes.find(n=>n.id===id),p=displayedPositions[id],holder=graph.parentElement;
    if(!node||!p||!holder)return;
    const graphRect=graph.getBoundingClientRect(),holderRect=holder.getBoundingClientRect();
    const left=graphRect.left-holderRect.left+holder.scrollLeft+p.x-(state.expanded.includes(id)?130:78);
    const right=left+(state.expanded.includes(id)?260:156),top=p.y-36,bottom=top+nodeHeight(node);
    if(left<holder.scrollLeft)holder.scrollLeft=left-8;
    else if(right>holder.scrollLeft+holder.clientWidth)holder.scrollLeft=right-holder.clientWidth+8;
    if(top<holder.scrollTop)holder.scrollTop=top-8;
    else if(bottom>holder.scrollTop+holder.clientHeight)holder.scrollTop=Math.min(top-8,bottom-holder.clientHeight+8);
  }
  /** @param {string} id */
  function selectNode(id) {
    if(!state.model?.nodes.some(node=>node.id===id))return;
    state.selected=id;if(!state.expanded.includes(id))state.expanded=[...state.expanded,id];renderSelection();revealNode(id);
  }
  /** @param {string} id */
  function toggleNode(id) {
    state.selected=id;state.expanded=state.expanded.includes(id)?state.expanded.filter(name=>name!==id):[...state.expanded,id];renderSelection();
  }
  /** @param {string} id @param {{fixed?:number|number[],args?:Record<string,number>}} change */
  function setOverride(id, change) {
    state.overrides={...state.overrides};
    if(change.fixed===undefined && !Object.keys(change.args??{}).length)delete state.overrides[id];else state.overrides[id]=change;
    notify(); updateScenario(); drawEdges(); schedule(); refresh();
  }
  function updateScenario() {
    const changed=Object.keys(state.overrides).length;
    get('scenario-label').textContent=changed ? 'Exploration changes · original Stan source unchanged' : 'Original model';
    /** @type {HTMLButtonElement} */(get('reset-scenario')).disabled=!changed;
    for(const [id,controls] of nodeControls) {
      const node=state.model?.nodes.find(n=>n.id===id),equation=controls.querySelector('.node-equation');
      if(node?.distribution && equation) {
        const current=state.overrides[id];
        equation.textContent=current?.fixed!==undefined?`${id} := ${Array.isArray(current.fixed)?current.fixed.join(', '):current.fixed} (fixed)`:
          `${id} ~ ${node.distribution.name}(${node.distribution.args.map((arg,index)=>current?.args?.[index]??expressionText(arg)).join(', ')})`;
      }
    }
    notify();
  }
  function renderControls() {
    const restoreFocus=retainFocus(graph);
    nodeControls.clear();
    for(const node of state.model?.nodes??[]) {
      if(!state.expanded.includes(node.id))continue;
      const controls=document.createElement('fieldset');controls.className='expanded-node-controls';controls.dataset.controlsFor=node.id;controls.disabled=isStale();
      const legend=document.createElement('legend');legend.textContent=`${node.id} · ${node.block}`;controls.append(legend);
      fillControls(node,controls);nodeControls.set(node.id,controls);
    }
    // Measure HTML controls at their final width before allocating SVG card heights.
    const measure=document.createElement('div');measure.className='node-measure';root.append(measure);
    for(const controls of nodeControls.values())measure.append(controls);
    for(const controls of nodeControls.values())controls.dataset.height=String(Math.ceil(controls.getBoundingClientRect().height));
    measure.remove();updateScenario();restoreFocus();
  }
  /** @param {import('./core/model.js').ModelNode} node @param {HTMLFieldSetElement} controls */
  function fillControls(node,controls) {
    const equation=document.createElement('p'); equation.className='node-equation';
    equation.textContent=node.distribution ? `${node.id} ~ ${node.distribution.name}(${node.distribution.args.map(expressionText).join(', ')})` : node.expression ? `${node.id} = ${expressionText(node.expression)}` : 'Fixed input from Data JSON.';
    controls.append(equation);
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
      const label=document.createElement('div');label.className='prior-argument';
      const title=document.createElement('span');title.textContent=argNames[node.distribution?.name||'']?.[index] || `Argument ${index+1}`;label.append(title);
      const initial=arg.kind==='number'?arg.value:arg.kind==='unary'&&arg.op==='-'&&arg.arg.kind==='number'?-arg.arg.value:undefined;
      const positive=/SD|Scale|Rate|Shape|Alpha|Beta|Degrees/.test(title.textContent);
      const probability=title.textContent==='Probability';
      const value=current.args?.[index]??initial??(positive?1:probability?.5:0);
      if(initial===undefined) {
        const link=document.createElement('code');link.textContent=expressionText(arg);label.append(link);
        const constantLabel=document.createElement('label');constantLabel.className='fixed-choice';
        const constant=document.createElement('input');constant.type='checkbox';constant.checked=current.args?.[index]!==undefined;constant.disabled=fix.checked;
        constant.setAttribute('aria-label',`Use constant for ${node.id} ${title.textContent}`);constantLabel.append(constant,' Use constant');label.append(constantLabel);
        constant.onchange=()=>{
          checkpoint();const args={...state.overrides[node.id]?.args};
          if(constant.checked)args[index]=value;else delete args[index];
          setOverride(node.id,{args});renderSelection();checkpoint();
        };
        if(!constant.checked){controls.append(label);return;}
      }
      const slider=document.createElement('input');slider.type='range';slider.min=String(probability?0:positive?Math.min(.01,value):Math.min(-5,value*3));slider.max=String(probability?1:Math.max(5,Math.abs(initial??value)*3,value*1.2));slider.step=String(title.textContent==='Trials'?1:0.01);slider.value=String(value);slider.disabled=fix.checked;slider.setAttribute('aria-label',`${node.id} ${title.textContent}`);
      const number=document.createElement('input');number.type='number';number.step=slider.step;number.value=String(value);number.disabled=fix.checked;number.setAttribute('aria-label',`${node.id} ${title.textContent} value`);
      const change=(/** @type {HTMLInputElement} */ from)=>{
        if(!from.value.trim()||!Number.isFinite(from.valueAsNumber)) return;
        // Numeric entry can extend the slider instead of leaving its thumb clamped
        // to a different value than the one being simulated.
        slider.min=String(Math.min(Number(slider.min),from.valueAsNumber));
        slider.max=String(Math.max(Number(slider.max),from.valueAsNumber));
        if(from===number && title.textContent!=='Trials')slider.step='any';
        slider.value=number.value=from.value;
        setOverride(node.id,{args:{...state.overrides[node.id]?.args,[index]:from.valueAsNumber}});
      };
      slider.oninput=()=>change(slider);number.oninput=()=>change(number);slider.onchange=number.onchange=()=>checkpoint();
      label.append(slider,number);controls.append(label);
    });
  }
  function drawMarginals() {
    const holder=get('marginals'),restoreFocus=retainFocus(holder);holder.replaceChildren();
    const comparing=!!baseline&&!!Object.keys(state.overrides).length;
    get('comparison-key').hidden=!comparing||!result;
    if(!result||!state.model) return;
    holder.classList.toggle('is-stale',isStale());
    for(const id of state.model.order) {
      const node=state.model.nodes.find(n=>n.id===id);
      if(!node||node.kind==='input'||node.block==='transformed data')continue;
      const rows=result.samples[node.id];if(!rows?.length) continue;
      const panel=document.createElement('section');panel.className=`marginal node-${node.kind}`;panel.dataset.marginal=node.id;
      const head=document.createElement('div');head.className='marginal-head';const title=document.createElement('button');title.type='button';title.textContent=node.id;title.dataset.selectNode=node.id;title.onclick=()=>selectNode(node.id);head.append(title);
      const index=Math.min(components[node.id]??0,rows[0].length-1);
      components[node.id]=Math.max(0,index);
      if(rows[0].length>1) {const select=document.createElement('select');select.setAttribute('aria-label',`${node.id} element`);for(let i=0;i<rows[0].length;i++){const o=document.createElement('option');o.value=String(i);o.textContent=`[${i+1}]`;select.append(o);}select.value=String(index);select.onchange=()=>{components[node.id]=Number(select.value);state.selected=node.id;drawMarginals();renderSelection();};head.append(select);}
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
    drawGraph();highlightSelection();restoreFocus();
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
    checkpoint();build.disabled=true;for(const controls of nodeControls.values())controls.disabled=true;notify();get('marginals').classList.add('is-stale');get('explore-error').hidden=true;get('explore-status').textContent='Checking Stan and building dependencies…';
    const source=readSource(),data=readData();revision++;
    try {
      const model=await analyze(source);
      if(source!==readSource()||data!==readData()){get('explore-status').textContent='Inputs changed; build again.';inputChanged();return;}
      state={...state,model,builtSource:source,builtData:data,overrides:{},selected:model.nodes.find(n=>n.kind==='stochastic')?.id||model.nodes[0]?.id||''};
      state.expanded=[state.selected];arrange();result=null;inputChanged();renderSelection();drawMarginals();updateScenario();revealNode(state.selected);checkpoint();await run();
    }catch(error){state.model=null;result=null;drawGraph();drawMarginals();renderControls();showError(error);}
    finally{build.disabled=false;}
  }
  build.onclick=buildModel;
  get('reset-layout').onclick=()=>{checkpoint();arrange();drawGraph();checkpoint();};
  get('reset-scenario').onclick=()=>{checkpoint();state.overrides={};renderSelection();updateScenario();notify();schedule();checkpoint();};
  view.onchange=()=>{checkpoint();state.view=view.value;drawGraph();checkpoint();};
  draws.onchange=()=>{checkpoint();state.draws=Number(draws.value);notify();schedule();checkpoint();};
  seed.onchange=()=>{checkpoint();state.seed=Number(seed.value);notify();schedule();checkpoint();};
  return {
    build:buildModel,inputChanged,selectNode,
    capture:()=>({...state,expanded:[...state.expanded],overrides:structuredClone(state.overrides),positions:structuredClone(state.positions)}),
    /** @param {Snapshot|null} snapshot */
    restore(snapshot){
      if(!snapshot)return;
      const resim=!result||snapshot.model!==state.model||snapshot.builtData!==state.builtData||snapshot.draws!==state.draws||snapshot.seed!==state.seed||JSON.stringify(snapshot.overrides)!==JSON.stringify(state.overrides);
      revision++;state={...snapshot,expanded:[...(snapshot.expanded??[])],overrides:structuredClone(snapshot.overrides),positions:structuredClone(snapshot.positions)};
      view.value=state.view;draws.value=String(state.draws);seed.value=String(state.seed);notify();
      if(resim)result=null;
      inputChanged();renderSelection();drawMarginals();updateScenario();if(resim)schedule();
    },
  };
}
