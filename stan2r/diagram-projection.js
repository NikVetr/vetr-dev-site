import { expressionText, expressionVariables } from './core/expressions.js';

/** @typedef {import('./core/model.js').Model} Model */
/** @typedef {import('./core/model.js').ModelNode} Node */
/** @typedef {import('./core/expressions.js').Expr} Expr */
/** @typedef {NonNullable<import('./core/simulation.js').SimulationOptions['overrides']>} Overrides */
/** @typedef {{from:string,to:string,kind:'value'|'dimension',label?:string,elementwise:boolean}} DiagramEdge */

/** @param {Node} node */
const dimension = node => node.dimensions.length === 1 ? expressionText(node.dimensions[0]) : '';

/** Presentation only: gather direct dependencies and retain their indexing meaning.
 * @param {Expr} expr @param {Node} target @param {Map<string,Node>} nodes
 * @param {Map<string,{elementwise:boolean,structural:boolean,labels:Set<string>}>} usage
 * @param {string} [context] */
function dependencies(expr, target, nodes, usage, context = '') {
  if (expr.kind === 'number') return;
  if (expr.kind === 'variable') {
    const parent = nodes.get(expr.name); if (!parent) return;
    const vector = !!dimension(parent);
    const elementwise = !vector || (!context && dimension(parent) === dimension(target));
    const entry = usage.get(parent.id) ?? {elementwise:true,structural:true,labels:new Set()};
    entry.elementwise &&= context === 'size' || elementwise;
    entry.structural &&= context === 'size';
    if (vector && context && context !== 'size') entry.labels.add(context);
    if (vector && !context && !dimension(target)) entry.labels.add('all elements');
    usage.set(parent.id,entry); return;
  }
  const visit = (/** @type {Expr} */ child, childContext = context) => dependencies(child,target,nodes,usage,childContext);
  if (expr.kind === 'index') {
    visit(expr.arg, context === 'size' ? context : `${expr.gather ? 'indexed by ' : 'element '}${expr.indices.map(expressionText).join(', ')}`);
    expr.indices.forEach(child => visit(child)); return;
  }
  if (expr.kind === 'call') {
    const aggregate = ['sum','mean','min','max'].includes(expr.name);
    expr.args.forEach((child,index) => visit(child,context === 'size' ? context : aggregate ? expr.name : ['rep_vector','rep_row_vector','rep_array'].includes(expr.name) && index === 1 ? 'size' : context)); return;
  }
  if (expr.kind === 'array') { expr.items.forEach(child => visit(child,context === 'size' ? context : 'selected elements')); return; }
  if (expr.kind === 'binary') { visit(expr.left); visit(expr.right); return; }
  visit(expr.arg);
}

/** Project the checked generative graph into a legible diagram without changing the model.
 * Equal vector lengths alone do not establish matching elementwise dependencies.
 * Shared plates only combine matching symbolic dimensions when every connecting
 * path preserves that index; reductions, gathers and scalar indexing split them.
 * @param {Model} model @param {Overrides} [overrides]
 * @param {{showStructure?:boolean}} [options] */
export function diagramProjection(model, overrides = {}, {showStructure = false} = {}) {
  const byId = new Map(model.nodes.map(node => [node.id,node]));
  /** @type {DiagramEdge[]} */ const edges = [];
  for (const node of model.nodes) {
    /** @type {Map<string,{elementwise:boolean,structural:boolean,labels:Set<string>}>} */ const usage = new Map();
    const override = overrides[node.id];
    // Parameter bounds constrain generated values; declared data bounds only
    // validate supplied inputs (they do not truncate prior predictions).
    const dataBounds = node.kind === 'input' || node.kind === 'observed';
    const expressions = dataBounds ? [] : Object.values(node.bounds);
    if (dataBounds) for (const expr of Object.values(node.bounds)) dependencies(expr,node,byId,usage,'size');
    if (override?.fixed === undefined) {
      if (node.expression) expressions.push(node.expression);
      if (node.distribution) {
        expressions.push(...node.distribution.args.filter((_,i) => override?.args?.[i] === undefined));
        if (node.distribution.lower) expressions.push(node.distribution.lower);
        if (node.distribution.upper) expressions.push(node.distribution.upper);
      }
    }
    expressions.forEach(expr => dependencies(expr,node,byId,usage));
    if (dataBounds) for (const from of Object.values(node.bounds).flatMap(expressionVariables)) {
      const entry = usage.get(from);
      if (entry?.structural) {entry.labels.clear();entry.labels.add('data bound');}
    }
    for (const [from,entry] of usage) edges.push({from,to:node.id,kind:entry.structural ? 'dimension' : 'value',elementwise:entry.elementwise,...(entry.labels.size ? {label:[...entry.labels].join('; ')} : {})});
    for (const from of new Set(node.dimensions.flatMap(expressionVariables))) if (!usage.has(from)) edges.push({from,to:node.id,kind:'dimension',elementwise:false});
  }
  const valueEdges = edges.filter(edge => edge.kind === 'value');
  const used = new Set(valueEdges.flatMap(edge => [edge.from,edge.to]));
  const nodes = showStructure ? model.nodes : model.nodes.filter(node => node.kind !== 'input' || used.has(node.id));
  const visible = new Set(nodes.map(node => node.id));
  const vectorNodes = nodes.filter(node => !!dimension(node));
  const conflicts = new Set();
  for (const origin of vectorNodes) {
    /** @type {{id:string,nonlocal:boolean}[]} */ const queue = [{id:origin.id,nonlocal:false}];
    const visited = new Set();
    for (let i=0;i<queue.length;i++) {
      const current = queue[i], key = `${current.id}:${current.nonlocal}`;
      if (visited.has(key)) continue; visited.add(key);
      for (const edge of valueEdges.filter(edge => edge.from === current.id)) {
        const next = byId.get(edge.to); if (!next) continue;
        const nonlocal = current.nonlocal || !edge.elementwise || dimension(next) !== dimension(origin);
        if (nonlocal && dimension(next) === dimension(origin)) conflicts.add([origin.id,next.id].sort().join('\0'));
        queue.push({id:next.id,nonlocal});
      }
    }
  }
  // Prefer same-index relationships over arbitrary declaration order. A data
  // selector perm[i] belongs beside its target y[i], not its gathered source z[j].
  const groups = vectorNodes.map(node => ({dimension:dimension(node),members:[node.id]}));
  /** @param {typeof groups[number]} a @param {typeof groups[number]} b */
  const compatible = (a,b) => a.dimension === b.dimension && a.members.every(x => b.members.every(y => !conflicts.has([x,y].sort().join('\0'))));
  for (const edge of valueEdges.filter(edge => edge.elementwise)) {
    const a = groups.find(group => group.members.includes(edge.from)), b = groups.find(group => group.members.includes(edge.to));
    if (a && b && a !== b && compatible(a,b)) { a.members.push(...b.members); groups.splice(groups.indexOf(b),1); }
  }
  for (let i=0;i<groups.length;i++) for (let j=i+1;j<groups.length;) {
    if (compatible(groups[i],groups[j])) {groups[i].members.push(...groups[j].members);groups.splice(j,1);} else j++;
  }
  const plates = groups.map((group,index) => ({...group,id:`plate-${index}`,label:`${['i','j','k','l','m'][index] ?? `i${index+1}`} = 1…${group.dimension}`}));
  for (const edge of valueEdges) {
    const a = plates.find(group=>group.members.includes(edge.from)), b = plates.find(group=>group.members.includes(edge.to));
    if (edge.elementwise && a && b && a !== b) edge.label = [edge.label,'matching index'].filter(Boolean).join('; ');
  }
  return {
    nodes,
    edges:edges.filter(edge => visible.has(edge.from) && visible.has(edge.to) && (showStructure || edge.kind === 'value')),
    plates,
    notes:[
      'Plates group repeated elements; shared scalar parents remain outside.',
      ...(conflicts.size ? ['Non-elementwise dependencies use separate plates, even when dimensions match.'] : []),
      ...(!showStructure && edges.some(edge => edge.kind === 'dimension') ? ['Size and declared data-bound arrows are hidden; plate labels retain sizes.'] : []),
    ],
  };
}
