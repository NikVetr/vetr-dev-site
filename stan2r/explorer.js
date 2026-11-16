import { analyze, simulateInBrowser } from './core/explorer-browser.js';
import { expressionText } from './core/expressions.js';
import { diagramProjection } from './diagram-projection.js';
import { layoutDiagram, movedRoute, bridgePath } from './diagram-layout.js';

const NS = 'http://www.w3.org/2000/svg';
/** @param {string} name @param {Record<string,string|number>} [attrs] @param {string} [text] */
function svgElement(name, attrs = {}, text = '') {
  const el = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  el.textContent = text; return el;
}
/** @typedef {import('./core/model.js').Model} Model */
/** @typedef {ReturnType<typeof import('./core/simulation.js').simulate>} Result */
/** @typedef {{model:Model|null,builtSource:string,builtData:string,overrides:Record<string,{fixed?:number|number[],args?:Record<string,number>}>,positions:Record<string,{x:number,y:number}>,selected:string,expanded:string[],draws:number,seed:number,view:string,showStructure:boolean}} Snapshot */
/** @param {{root:HTMLElement,readSource:()=>string,readData:()=>string,checkpoint:()=>void,refresh:()=>void,onChange?:(snapshot:Snapshot,stale:boolean)=>void}} options */
export function mountExplorer({ root, readSource, readData, checkpoint, refresh, onChange = () => {} }) {
  root.innerHTML = `
    <div class="panel-head"><h2>Model explorer</h2><button type="button" id="build-model" class="primary">Build &amp; simulate</button></div>
    <div class="explore-settings">
      <label>View <select id="graph-view"><option value="plate">Plate diagram</option><option value="flow">Dependency flow</option></select></label>
      <label id="structure-choice"><input type="checkbox" id="show-structure"> Show sizes &amp; data bounds</label>
      <label>Draws <select id="simulation-draws"><option>500</option><option selected>1000</option><option>4000</option></select></label>
      <label>Seed <input id="simulation-seed" type="number" min="0" max="4294967295" value="12345"></label>
      <button type="button" id="reset-layout">Arrange</button>
    </div>
    <p id="explore-status" role="status">Build a graph to explore priors and their predictions.</p>
    <p id="explore-error" role="alert" hidden></p>
    <p id="explore-stale" hidden>Source or data changed. Build again to update the graph and predictions.</p>
    <div class="graph-scroll"><svg id="model-graph" viewBox="0 0 800 320" aria-label="Model dependencies" role="group"></svg></div>
    <p id="diagram-notes" class="hint"></p>
    <div class="graph-key"><span class="key-input">● Fixed input</span><span class="key-stochastic">○ Latent parameter</span><span class="key-deterministic">◇ Deterministic</span><span class="key-observed">● Observed / replicated data</span><span id="dimension-key" hidden>┄ Size / data-bound dependency</span><span>Click nodes to expand · drag headers to move · arrow keys move a focused node</span></div>
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
  const structure = /** @type {HTMLInputElement} */ (get('show-structure'));
  const seed = /** @type {HTMLInputElement} */ (get('simulation-seed'));
  /** @type {Snapshot} */
  let state = { model: null, builtSource: '', builtData: '', overrides: {}, positions: {}, selected: '', expanded: [], draws: 1000, seed: 12345, view: 'plate', showStructure: false };
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
  /** @type {import('./diagram-layout.js').DiagramLayout|null} */let diagram=null;
  /** @type {ReturnType<typeof diagramProjection>|null} */let projection=null;
  let layoutKey='',layoutRevision=0;
  /** @type {Promise<void>|null} */let pendingLayout=null;
  const engine=new window.ELK();
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
  /** @param {import('./core/model.js').ModelNode} node */
  function nodeSize(node) {
    const expanded=state.expanded.includes(node.id),plate=state.view==='plate';
    const controls=nodeControls.get(node.id),content=expanded?Number(controls?.dataset.height||140):0;
    return {width:expanded?260:168,height:(plate?116:60)+(expanded?6+content:0),anchor:plate?36:30,expanded,shape:plate?(node.kind==='deterministic'||state.overrides[node.id]?.fixed!==undefined?'diamond':'circle'):'rect'};
  }
  /** @param {import('./core/model.js').ModelNode} node */
  const nodeHeight=node=>nodeSize(node).height;
  async function updateLayout() {
    if(!state.model){diagram=null;projection=null;layoutKey='';layoutRevision++;return;}
    const next=diagramProjection(state.model,state.overrides,{showStructure:state.view==='flow'||state.showStructure});
    const sizes=Object.fromEntries(next.nodes.map(node=>[node.id,nodeSize(node)]));
    const key=JSON.stringify([next.nodes.map(n=>n.id),next.edges,next.plates,sizes,state.view]);
    projection=next;get('dimension-key').hidden=state.view==='plate'&&!state.showStructure;get('diagram-notes').textContent=state.view==='plate'?next.notes.join(' '):'Complete dependency graph, including shape and bound inputs.';
    if(key===layoutKey){if(pendingLayout)await pendingLayout;return;}
    layoutKey=key;const generation=++layoutRevision;graph.setAttribute('aria-busy','true');
    pendingLayout=(async()=>{
      try {
        const nextDiagram=await layoutDiagram(next,sizes,state.view==='plate',engine);
        if(generation!==layoutRevision)return;
        diagram=nextDiagram;drawGraph(true);
      }catch(error){if(generation===layoutRevision){layoutKey='';showError(error);}}
      finally{if(generation===layoutRevision){pendingLayout=null;graph.setAttribute('aria-busy','false');}}
    })();
    await pendingLayout;
  }
  async function arrange() {
    state.positions={};layoutKey='';await updateLayout();
  }
  function drawEdges() {
    const layer=graph.querySelector('.dependency-edges');if(!layer||!diagram)return;
    layer.replaceChildren();
    /** @type {import('./diagram-layout.js').Point[][]} */const preceding=[];
    /** @type {SVGElement[]} */const labels=[];
    for(const route of diagram.routes) {
      if(!projection?.edges.some(edge=>edge.from===route.from&&edge.to===route.to))continue;
      const moved=movedRoute(route,state.positions),pathData=bridgePath(moved.points,preceding);preceding.push(moved.points);
      layer.append(svgElement('path',{d:pathData,class:'dependency-halo'}));
      const path=svgElement('path',{d:pathData,class:`dependency-edge${route.kind==='dimension'?' dimension-edge':''}`,'marker-end':'url(#dependency-arrow)'});
      path.append(svgElement('title',{},`${route.from} → ${route.to}${route.label?' · '+route.label:''}`));layer.append(path);
      if(route.label) {
        const points=moved.points;let best=0;
        for(let i=1;i<points.length;i++)if(Math.abs(points[i].y-points[i-1].y)<.1&&Math.abs(points[i].x-points[i-1].x)>Math.abs(points[best+1]?.x-points[best]?.x||0))best=i-1;
        const a=points[best],b=points[best+1]??a;
        labels.push(svgElement('text',{x:(a.x+b.x)/2+4,y:(a.y+b.y)/2-6,class:'edge-label'},route.label));
      }
    }
    layer.append(...labels);
  }
  function drawPlates() {
    if(!diagram||state.view!=='plate')return;
    const layer=svgElement('g',{class:'model-plates'});
    for(const plate of diagram.plates) {
      const members=plate.members.map(id=>({node:state.model?.nodes.find(n=>n.id===id),p:displayedPositions[id]})).filter(item=>item.node&&item.p);
      const left=Math.min(plate.x,...members.map(({node,p})=>p.x-nodeSize(/** @type {import('./core/model.js').ModelNode} */(node)).width/2-20));
      const top=Math.min(plate.y,...members.map(({node,p})=>p.y-nodeSize(/** @type {import('./core/model.js').ModelNode} */(node)).anchor-20));
      const right=Math.max(plate.x+plate.width,...members.map(({node,p})=>p.x+nodeSize(/** @type {import('./core/model.js').ModelNode} */(node)).width/2+20));
      const bottom=Math.max(plate.y+plate.height,...members.map(({node,p})=>p.y-nodeSize(/** @type {import('./core/model.js').ModelNode} */(node)).anchor+nodeHeight(/** @type {import('./core/model.js').ModelNode} */(node))+32));
      const group=svgElement('g',{'data-plate':plate.id,'data-members':plate.members.join(' ')});
      group.append(svgElement('rect',{x:left,y:top,width:right-left,height:bottom-top,rx:5,class:'plate-outline'}),svgElement('text',{x:right-12,y:bottom-12,'text-anchor':'end',class:'plate-label'},plate.label));
      layer.append(group);
    }
    graph.append(layer);
  }
  /** @param {boolean} [force] */
  function drawGraph(force=false) {
    if(!force && document.activeElement instanceof HTMLInputElement && graph.contains(document.activeElement)){drawEdges();return;}

    const restoreFocus = retainFocus(graph);
    graph.replaceChildren();
    if (!state.model||!diagram||!projection) return;
    displayedPositions=Object.fromEntries(Object.entries(diagram.positions).map(([id,p])=>[id,{x:p.x+(state.positions[id]?.x??0),y:p.y+(state.positions[id]?.y??0)}]));
    const height = Math.max(240,diagram.height, ...projection.nodes.map(n => (displayedPositions[n.id]?.y??0) + nodeHeight(n) + 50));
    const width = Math.max(360,diagram.width, ...Object.values(displayedPositions).map(p => p.x + 160));
    graph.setAttribute('viewBox', `0 0 ${width} ${height}`);
    graph.style.width=`${width}px`;graph.style.minWidth=`${width}px`;
    const defs = svgElement('defs');
    const marker = svgElement('marker', { id: 'dependency-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
    marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 Z', fill: 'currentColor' })); defs.append(marker); graph.append(defs);
    drawPlates();graph.append(svgElement('g',{class:'dependency-edges'}));drawEdges();
    for (const node of projection.nodes) {
      const p = displayedPositions[node.id]; if (!p) continue;
      const expanded=state.expanded.includes(node.id),size=nodeSize(node),height=size.height,plate=state.view==='plate';
      const g = svgElement('g', { transform:`translate(${p.x},${p.y})`, class:`model-node node-${node.kind}${state.selected === node.id ? ' selected' : ''}`, 'data-node':node.id, tabindex:-1, role:'group', 'aria-label':`${node.id}, ${node.kind}. ${expanded?'Collapse':'Expand'} controls; arrow keys move.`, 'aria-expanded':String(expanded), 'aria-pressed':String(state.selected===node.id) });
      g.append(svgElement('title', {}, node.dimensions.length ? `${node.id}: dimensions ${node.dimensions.map(expressionText).join(' × ')}.` : `${node.id}: ${node.block}`));
      if(plate) {
        if(expanded)g.append(svgElement('rect',{x:-130,y:-36,width:260,height,rx:8,class:'node-card-shape'}));
        const fixed=state.overrides[node.id]?.fixed!==undefined,deterministic=node.kind==='deterministic'||fixed;
        g.append(svgElement(deterministic?'path':'circle',deterministic?{d:'M0,-30 L36,0 L0,30 L-36,0 Z',class:'node-shape'}:{cx:0,cy:0,r:30,class:'node-shape'}));
        if(node.dimensions.length) {
          const element=node.kind!=='input'&&node.block!=='transformed data'&&result?.samples[node.id]?.[0]?.length?` · [${(components[node.id]??0)+1}]`:'';
          g.append(svgElement('text',{x:0,y:72,'text-anchor':'middle',class:'node-element'},`${node.dimensions.map(expressionText).join(' × ')}${element}`));
        }
      } else g.append(svgElement('rect',{x:expanded?-130:-84,y:-30,width:size.width,height,rx:node.kind==='deterministic'?2:12,class:'node-shape'}));
      const labelSize=Math.min(17,(expanded?218:108)/(node.id.length*.62));
      const header=svgElement('g',{tabindex:0,role:'button','data-toggle-node':node.id,'aria-expanded':String(expanded),'aria-label':`${expanded?'Collapse':'Expand'} ${node.id}`});
      header.append(svgElement('rect',{x:-size.width/2,y:-size.anchor,width:size.width,height:plate?116:56,fill:'transparent'}));
      header.append(svgElement('title', {}, node.id));
      header.append(svgElement('text', { x:plate?0:-6,y:plate?46:-3,'text-anchor':'middle',class:'node-name',style:`font-size:${labelSize}px` }, node.id));
      const caption = state.overrides[node.id]?.fixed !== undefined ? 'fixed scenario' : node.distribution?.name || (node.expression ? 'transform' : 'input');
      const symbols=/** @type {Record<string,string>} */({mu:'μ',sigma:'σ',tau:'τ',theta:'θ',alpha:'α',beta:'β',phi:'φ',epsilon:'ε'});
      const stem=node.id.split('_')[0],symbol=symbols[stem]??(stem.length<=8?stem:stem.slice(0,6)+'…');
      header.append(svgElement('text', { y:plate?6:15,'text-anchor':'middle',class:plate?'node-symbol':'node-caption',...(plate?{style:`font-size:${Math.min(20,43/(symbol.length*.55))}px`}:{}) }, plate?symbol:caption));
      header.append(svgElement('text',{x:expanded?115:65,y:plate?-25:-3,'text-anchor':'end',class:'node-caption'},expanded?'−':'+'));
      g.append(header);
      if(expanded) {
        const foreign=svgElement('foreignObject',{x:-130,y:plate?80:26,width:260,height:height-(plate?116:56)});
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
        state.positions = {...state.positions,[node.id]:{x:Math.max(size.width/2+12-(diagram?.positions[node.id].x??0),(state.positions[node.id]?.x??0)+delta[0]*(e.shiftKey?20:5)),y:Math.max(size.anchor+12-(diagram?.positions[node.id].y??0),(state.positions[node.id]?.y??0)+delta[1]*(e.shiftKey?20:5))}};
        drawGraph();
        /** @type {SVGElement|null} */ (graph.querySelector(`[data-node="${node.id}"]`))?.focus(); checkpoint();
      });
      g.addEventListener('pointerdown', raw => {
        const e=/** @type {PointerEvent} */(raw); if(e.button!==0) return;
        const point=graphPoint(e);
        drag={id:node.id,startX:point.x,startY:point.y,x:state.positions[node.id]?.x??0,y:state.positions[node.id]?.y??0,moved:false}; graph.setPointerCapture(e.pointerId);
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
    state.positions={...state.positions,[drag.id]:{x:Math.max(142-(diagram?.positions[drag.id].x??0),drag.x+p.x-drag.startX),y:Math.max(48-(diagram?.positions[drag.id].y??0),drag.y+p.y-drag.startY)}}; drawGraph();
  });
  graph.addEventListener('pointerup', event => {
    if(!drag) return;
    const {id,moved}=drag; if(graph.hasPointerCapture(event.pointerId)) graph.releasePointerCapture(event.pointerId);
    state.selected=id;drag=null;suppressClick=true;
    if(moved){renderSelection();checkpoint();}else toggleNode(id);
    setTimeout(()=>{suppressClick=false;},0);
  });
  graph.addEventListener('pointercancel', () => {const moved=drag?.moved;drag=null;if(moved)checkpoint();});
  async function renderSelection() {
    const restoreFocus=retainFocus(graph);renderControls();notify();await updateLayout();drawGraph(true);highlightSelection();restoreFocus();
  }
  /** Scroll only the diagram viewport, leaving the source/specification in place. @param {string} id */
  function revealNode(id) {
    const node=state.model?.nodes.find(n=>n.id===id),p=displayedPositions[id],holder=graph.parentElement;
    if(!node||!p||!holder)return;
    const graphRect=graph.getBoundingClientRect(),holderRect=holder.getBoundingClientRect();
    const size=nodeSize(node),left=graphRect.left-holderRect.left+holder.scrollLeft+p.x-size.width/2;
    const right=left+size.width,top=p.y-size.anchor,bottom=top+size.height;
    if(left<holder.scrollLeft)holder.scrollLeft=left-8;
    else if(right>holder.scrollLeft+holder.clientWidth)holder.scrollLeft=right-holder.clientWidth+8;
    if(top<holder.scrollTop)holder.scrollTop=top-8;
    else if(bottom>holder.scrollTop+holder.clientHeight)holder.scrollTop=Math.min(top-8,bottom-holder.clientHeight+8);
  }
  /** @param {string} id */
  function selectNode(id) {
    if(!state.model?.nodes.some(node=>node.id===id))return;
    if(state.view==='plate'&&!projection?.nodes.some(node=>node.id===id)){state.showStructure=true;structure.checked=true;}
    state.selected=id;if(!state.expanded.includes(id))state.expanded=[...state.expanded,id];renderSelection().then(()=>revealNode(id));
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
      state.expanded=[state.selected];renderControls();await arrange();result=null;inputChanged();await renderSelection();drawMarginals();updateScenario();revealNode(state.selected);checkpoint();await run();
    }catch(error){state.model=null;result=null;diagram=null;drawGraph();drawMarginals();renderControls();showError(error);}
    finally{build.disabled=false;}
  }
  build.onclick=buildModel;
  get('reset-layout').onclick=async()=>{checkpoint();await arrange();drawGraph();checkpoint();};
  get('reset-scenario').onclick=()=>{checkpoint();state.overrides={};renderSelection();updateScenario();notify();schedule();checkpoint();};
  view.onchange=async()=>{checkpoint();state.view=view.value;get('structure-choice').hidden=state.view!=='plate';renderControls();await updateLayout();drawGraph();revealNode(state.selected);checkpoint();};
  structure.onchange=async()=>{checkpoint();state.showStructure=structure.checked;await updateLayout();drawGraph();checkpoint();};
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
      view.value=state.view;structure.checked=state.showStructure;get('structure-choice').hidden=state.view!=='plate';draws.value=String(state.draws);seed.value=String(state.seed);notify();
      if(resim)result=null;
      inputChanged();renderSelection();drawMarginals();updateScenario();if(resim)schedule();
    },
  };
}
