import { FUNCTIONS, modelError, expressionVariables, expressionText } from './expressions.js';
import { validateTransformedSupports } from './support.js';
import { declarationLines } from './source-lines.js';
/** @typedef {import('./expressions.js').Expr} Expr */
/** @typedef {{lower?:Expr,upper?:Expr}} Bounds */
/** @typedef {{id:string,block:string,kind:'input'|'stochastic'|'deterministic'|'observed',type:string,dimensions:Expr[],bounds:Bounds,expression?:Expr,distribution?:{name:string,args:Expr[],lower?:Expr,upper?:Expr},parents:string[],line:number}} ModelNode */
/** @typedef {ModelNode} Node */
/** @typedef {{nodes:ModelNode[],edges:{from:string,to:string}[],order:string[],warnings:string[],syntax?:import('./compilation.js').SyntaxInfo}} Model */
export const DISTRIBUTIONS = {normal:2,lognormal:2,exponential:1,gamma:2,beta:2,uniform:2,student_t:3,cauchy:2,bernoulli:1,bernoulli_logit:1,binomial:2,beta_binomial:3,poisson:1,poisson_log:1};

/** Read stanc's s-expression format, not Stan source. @param {string} text @returns {any} */
function readSexp(text) {
  const tokens=text.match(/\(|\)|"(?:[^"\\]|\\.)*"|[^\s()"]+/g) || [];
  /** @type {any[][]} */ const stack=[]; let root;
  for (const token of tokens) {
    if (token==='(') {
      /** @type {any[]} */
      const list=[]; if (stack.length) stack[stack.length-1].push(list); else if(root!==undefined) modelError('Multiple compiler syntax trees.'); else root=list; stack.push(list); }
    else if(token===')') { if(!stack.length) modelError('Malformed compiler syntax tree.'); stack.pop(); }
    else { if(!stack.length) modelError('Malformed compiler syntax tree.'); stack[stack.length-1].push(token[0]==='"'?token.slice(1,-1).replace(/\\(.)/g,(_,c)=>(/** @type {Record<string,string>} */({n:'\n',t:'\t',r:'\r'})[c]??c)):token); }
  }
  if(stack.length || !root) modelError('Malformed compiler syntax tree.'); return root;
}
/** @param {any} x @returns {Record<string,any>} */
const record=x=>Object.fromEntries(x.map((/** @type {any[]} */ field)=>[field[0],field[1]]));
/** @param {any} x @returns {string} */
const identifier=x=>record(x).name;
const operators=/** @type {Record<string,string>} */({Plus:'+',Minus:'-',Times:'*',Divide:'/',EltTimes:'.*',EltDivide:'./',Pow:'^',EltPow:'.^',PPlus:'+',PMinus:'-'});
/** @param {any} x @returns {Expr} */
function expression(x) {
  const fields=record(x), e=fields.expr;
  switch(e[0]) {
    case 'Variable': return {kind:'variable',name:identifier(e[1])};
    case 'IntNumeral': case 'RealNumeral': return {kind:'number',value:Number(e[1])};
    case 'Promotion': case 'Paren': return expression(e[1]);
    case 'BinOp': {
      const op=operators[e[2]]; if(!op) modelError(`Explorer does not support operator ${e[2]}.`);
      const lhs=record(record(e[1]).emeta).type_,rhs=record(record(e[3]).emeta).type_;
      if(op==='/' && lhs==='UInt' && rhs==='UInt') modelError('Explorer does not yet support Stan integer division.');
      if(op==='*' && !['UInt','UReal'].includes(lhs) && !['UInt','UReal'].includes(rhs)) modelError('Explorer does not support matrix or vector products. Use elementwise operations or explicit scalar terms.');
      return {kind:'binary',op,left:expression(e[1]),right:expression(e[3])};
    }
    case 'PrefixOp': { const op=operators[e[1]]; if(!['+','-'].includes(op)) modelError(`Unsupported unary operator ${e[1]}.`); return {kind:'unary',op,arg:expression(e[2])}; }
    case 'FunApp': {
      const name=identifier(e[2]);
      if(e[1][0]!=='StanLib'||!FUNCTIONS.includes(name)) modelError(`Explorer does not support function ${name}.`);
      const args=e[3].map(expression);
      if(['rep_array','rep_vector','rep_row_vector'].includes(name)&&args.length!==2) modelError('Explorer supports only one-dimensional replication.');
      return {kind:'call',name,args};
    }
    case 'Indexed': {
      if(e[2].length!==1||e[2][0][0]!=='Single')modelError('Explorer supports one scalar or integer-array index, not slices or multidimensional indexing.');
      const rawIndex=e[2][0][1],type=record(record(rawIndex).emeta).type_;
      const gather=Array.isArray(type)&&type[0]==='UArray'&&type[1]==='UInt';
      if(type!=='UInt'&&!gather)modelError('An index must be an integer or a one-dimensional integer array.');
      return {kind:'index',arg:expression(e[1]),indices:[expression(rawIndex)],...(gather?{gather:true}:{})};
    }
    case 'ArrayExpr': case 'RowVectorExpr': return {kind:'array',items:e[1].map(expression)};
    default: return modelError(`Explorer does not support expression ${e[0]}.`);
  }
}
/** @param {any} value @returns {{type:string,dimensions:Expr[]}} */
function sizedType(value) {
  if(value==='SInt'||value==='SReal') return {type:value==='SInt'?'int':'real',dimensions:[]};
  if(value[0]==='SArray') {
    const element=sizedType(value[1]); if(element.dimensions.length) modelError('Explorer supports one-dimensional arrays, not nested arrays.');
    return {type:element.type,dimensions:[expression(value[2])]};
  }
  if(value[0]==='SVector'||value[0]==='SRowVector') return {type:value[0]==='SVector'?'vector':'row_vector',dimensions:[expression(value[2])]};
  return modelError(`Explorer does not support declared type ${Array.isArray(value)?value[0]:value}.`);
}
/** @param {any} value @returns {Bounds} */
function bounds(value) {
  if(value==='Identity'||value==='NoTruncate') return {};
  const type=value[0];
  if(['Lower','TruncateUpFrom'].includes(type)) return {lower:expression(value[1])};
  if(['Upper','TruncateDownFrom'].includes(type)) return {upper:expression(value[1])};
  if(['LowerUpper','TruncateBetween'].includes(type)) return {lower:expression(value[1]),upper:expression(value[2])};
  return modelError(`Explorer does not support constraint ${type}.`);
}
/** @param {Bounds} b @returns {Expr[]} */
const boundExpressions=b=>Object.values(b);
/** @param {Expr|undefined} x @param {Expr|undefined} y */
const sameExpression=(x,y)=>x===undefined?y===undefined:y!==undefined&&expressionText(x)===expressionText(y);
/** A declaration whose bound only states the distribution's natural support adds no normalizer. @param {ModelNode} node */
export function naturalBounds(node) {
  const d=node.distribution; if(!d) return false;
  const lo=node.bounds.lower,hi=node.bounds.upper;
  const lowerSafe=lo===undefined||(lo.kind==='number'&&lo.value<=0&&['gamma','exponential','lognormal','beta','poisson','poisson_log','bernoulli','bernoulli_logit','binomial'].includes(d.name));
  const upperSafe=hi===undefined||(hi.kind==='number'&&hi.value>=1&&['beta','bernoulli','bernoulli_logit'].includes(d.name));
  return lowerSafe&&upperSafe;
}
/** Lift only independent full-range scalar element expressions, preserving Stan's elementwise meaning. @param {Expr} expr @param {string} index @returns {Expr} */
function liftLoopExpression(expr,index) {
  if(expr.kind==='variable') {if(expr.name===index)modelError('Direct use of a loop counter is not yet supported by the explorer.');return expr;}
  if(expr.kind==='number')return expr;
  if(expr.kind==='index') {
    if(expr.indices.length===1&&expr.indices[0].kind==='variable'&&expr.indices[0].name===index&&expr.arg.kind==='variable')return expr.arg;
    const selector=expr.indices[0];
    if(expr.indices.length===1&&expr.arg.kind==='variable'&&selector.kind==='index'&&selector.arg.kind==='variable'&&selector.indices.length===1&&selector.indices[0].kind==='variable'&&selector.indices[0].name===index) {
      return {...expr,indices:[selector.arg],gather:true};
    }
    if(expressionVariables(expr).includes(index))modelError('Explorer supports matching loop indices or static group[index] gathers, not recurrences or arbitrary index arithmetic.');
    return expr;
  }
  if(expr.kind==='binary')return {...expr,op:expr.op==='*'?'.*':expr.op==='/'?'./':expr.op,left:liftLoopExpression(expr.left,index),right:liftLoopExpression(expr.right,index)};
  if(expr.kind==='unary')return {...expr,arg:liftLoopExpression(expr.arg,index)};
  if(expr.kind==='call') {
    if(['sum','mean','min','max','to_vector','rep_array','rep_vector','rep_row_vector'].includes(expr.name)&&expressionVariables(expr).includes(index))modelError('Explorer cannot lift reductions or container construction across a sampling loop.');
    return {...expr,args:expr.args.map(x=>liftLoopExpression(x,index))};
  }
  return modelError('Array expressions inside sampling loops are not supported.');
}

/** Gather indices must remain fixed data, not a sampled variable masquerading as metadata. @param {Expr} expr @param {(id:string)=>boolean} randomAncestor */
function validateGatherSelectors(expr,randomAncestor) {
  if(expr.kind==='number'||expr.kind==='variable')return;
  if(expr.kind==='index'&&expr.gather&&expr.indices.some(selector=>expressionVariables(selector).some(randomAncestor)))modelError('Explorer gather indices must depend only on fixed data, not on sampled variables.');
  const children=expr.kind==='binary'?[expr.left,expr.right]:expr.kind==='call'?expr.args:expr.kind==='array'?expr.items:expr.kind==='index'?[expr.arg,...expr.indices]:[expr.arg];
  for(const child of children)validateGatherSelectors(child,randomAncestor);
}
/** Normal(0, scale) puts exactly half its mass on either half-line for every valid scale. @param {ModelNode} node */
function symmetricNormalBounds(node) {
  const d=node.distribution;if(!d||d.name!=='normal'||d.lower||d.upper)return false;
  if(d.args[0]?.kind!=='number'||d.args[0].value!==0)return false;
  const lo=node.bounds.lower,hi=node.bounds.upper;
  return (!hi&&lo?.kind==='number'&&lo.value===0)||(!lo&&hi?.kind==='number'&&hi.value===0);
}
/** Recheck conditional normalization when scenario edits change the model. @param {Model} model @param {Record<string,{fixed?:unknown,args?:Record<string,number>}>} [overrides] */
export function validateModelNormalization(model,overrides={}) {
  const byName=new Map(model.nodes.map(n=>[n.id,n]));
  /** @param {string} id @returns {boolean} */
  function randomAncestor(id) {
    if(Object.hasOwn(overrides[id]??{},'fixed'))return false;
    const n=byName.get(id);if(!n)modelError(`Unknown declared variable ${id}.`);
    return n.kind==='stochastic'||n.kind==='observed'||n.parents.some(randomAncestor);
  }
  for(const original of model.nodes) {
    if(original.kind!=='stochastic'||!original.distribution||!Object.keys(original.bounds).length||Object.hasOwn(overrides[original.id]??{},'fixed'))continue;
    const edits=overrides[original.id]?.args;
    const distribution={...original.distribution,args:original.distribution.args.map((x,i)=>edits?.[i]===undefined?x:/** @type {Expr} */({kind:'number',value:edits[i]}))};
    const node={...original,distribution};
    if(naturalBounds(node)||symmetricNormalBounds(node))continue;
    const explicit=sameExpression(node.bounds.lower,distribution.lower)&&sameExpression(node.bounds.upper,distribution.upper);
    if(!explicit&&[...distribution.args,...boundExpressions(node.bounds)].some(x=>expressionVariables(x).some(randomAncestor)))modelError(`Declared bounds for ${node.id} have a parameter-dependent normalizing constant. Use matching explicit T[lower, upper] truncation to specify a normalized conditional prior, or use the R converter's documented approximation.`);
  }
}

/**
 * Lower the compiler's typed AST to a supported, directed generative model.
 * Unsupported syntax is rejected; no model block statement is silently skipped.
 * @param {string} ast @param {string} [source] @returns {Model}
 */
export function buildModel(ast,source='') {
  if(typeof ast!=='string'||!ast.startsWith('((functionblock')) modelError('Expected a typed syntax tree from stanc 2.38.');
  const program=record(readSexp(ast));
  const sourceLines=declarationLines(source);
  /** @type {ModelNode[]} */ const nodes=[];
  /** @type {Map<string,ModelNode>} */ const byName=new Map();
  /** @param {string} name */ const get=name=>{const n=byName.get(name); if(!n) modelError(`Unknown declared variable ${name}.`); return n;};
  const blockNames=/** @type {Record<string,string>} */({datablock:'data',transformeddatablock:'transformed data',parametersblock:'parameters',transformedparametersblock:'transformed parameters',modelblock:'model'});
  if(program.functionblock?.length) modelError('User-defined functions are not yet supported by the explorer; R conversion remains available.');
  if(program.generatedquantitiesblock?.length) modelError('Generated quantities are not yet supported by the explorer; R conversion remains available.');
  /** @param {any} raw @param {string} block @param {{index:string,upper:Expr}|undefined} [loop] */
  function statement(raw,block,loop) {
    const s=record(raw).stmt, tag=typeof s==='string'?s:s[0];
    if(tag==='Skip') return;
    if(tag==='Block') {for(const child of s[1]) statement(child,block,loop);return;}
    const fields=record(s.slice(1));
    if(tag==='For') {
      if(block!=='model'||loop)modelError('Explorer supports only one level of independent sampling loops in the model block.');
      const lower=expression(fields.lower_bound);
      if(lower.kind!=='number'||lower.value!==1)modelError('Explorer sampling loops must cover every element, starting at 1.');
      statement(fields.loop_body,block,{index:identifier(fields.loop_variable),upper:expression(fields.upper_bound)});return;
    }
    if(loop&&tag!=='Tilde')modelError('Explorer sampling loops may contain only independent sampling statements.');
    if(tag==='VarDecl') {
      if(block==='model'||fields.is_global!=='true') modelError('Local declarations are not yet supported by the explorer.');
      const shape=sizedType(fields.decl_type), constraint=bounds(fields.transformation);
      for(const rawVariable of fields.variables) {
        const variable=record(rawVariable),id=identifier(variable.identifier);
        if(byName.has(id)) modelError(`Repeated declaration ${id}.`);
        /** @type {ModelNode} */ const node={id,block,kind:block==='data'?'input':block==='parameters'?'stochastic':'deterministic',...shape,bounds:constraint,parents:[],line:sourceLines.get(id)??0};
        if(variable.initial_value.length) node.expression=expression(variable.initial_value[0]);
        nodes.push(node);byName.set(id,node);
      }
      return;
    }
    if(tag==='Assignment') {
      if(!['transformed data','transformed parameters'].includes(block)||fields.assign_op!=='Assign') modelError('Explorer supports only direct assignments in transformed blocks.');
      const lhs=fields.assign_lhs;
      if(lhs[0]!=='LValue'||record(lhs[1]).lval[0]!=='LVariable') modelError('Indexed assignments are not yet supported by the explorer.');
      const n=get(identifier(record(lhs[1]).lval[1]));
      if(n.block!==block||n.expression) modelError(`Variable ${n.id} needs a single defining assignment.`);
      n.expression=expression(fields.assign_rhs);return;
    }
    if(tag==='Tilde') {
      if(block!=='model') modelError('Sampling statements must be in the model block.');
      const arg=expression(fields.arg);
      let nameOfVariable;
      if(loop) {
        if(arg.kind!=='index'||arg.arg.kind!=='variable'||arg.indices.length!==1||arg.indices[0].kind!=='variable'||arg.indices[0].name!==loop.index)modelError('A sampling loop must assign the current index of one declared variable.');
        nameOfVariable=arg.arg.name;
      } else {
        if(arg.kind!=='variable') modelError('Explorer needs a whole-variable sampling statement or a complete independent element loop.');
        nameOfVariable=arg.name;
      }
      const n=get(nameOfVariable);
      if(loop&&(n.dimensions.length!==1||!sameExpression(n.dimensions[0],loop.upper)))modelError(`Loop for ${n.id} must cover exactly its declared dimension.`);
      if(loop&&fields.args.some((/** @type {any} */ x)=>!['UInt','UReal'].includes(record(record(x).emeta).type_)))modelError('Sampling-loop arguments must be scalars; a vector argument would add multiple density factors per element.');
      if(!['data','parameters'].includes(n.block)) modelError(`Sampling statements on ${n.block} variables need inverse transforms/Jacobians and are not supported.`);
      if(n.distribution) modelError(`Multiple density factors for ${n.id} cannot be treated as independent draws.`);
      const originalName=identifier(fields.distribution),name=originalName==='std_normal'?'normal':originalName;
      if(!Object.hasOwn(DISTRIBUTIONS,name)||fields.kind[0]!=='StanLib') modelError(`Explorer does not support distribution ${originalName}.`);
      const distribution={name,args:originalName==='std_normal'?[{kind:'number',value:0},{kind:'number',value:1}]:fields.args.map(expression),...bounds(fields.truncation)};
      if(loop) {
        distribution.args=distribution.args.map((/** @type {Expr} */ x)=>liftLoopExpression(x,loop.index));
        if(distribution.lower)distribution.lower=liftLoopExpression(distribution.lower,loop.index);
        if(distribution.upper)distribution.upper=liftLoopExpression(distribution.upper,loop.index);
      }
      n.distribution=distribution;
      n.kind=n.block==='data'?'observed':'stochastic';return;
    }
    modelError(`Explorer does not support ${tag} statements. The original R converter supports a wider range of Stan syntax.`);
  }
  for(const [key,block] of Object.entries(blockNames)) {
    if(!Object.hasOwn(program,key)) modelError(`Compiler syntax tree is missing ${key}.`);
    if(program[key].length) for(const raw of record(program[key][0]).stmts) statement(raw,block);
  }
  if(nodes.length>64) modelError('Explorer supports at most 64 declared variables.');
  for(const n of nodes) {
    if(n.kind==='deterministic'&&!n.expression) modelError(`Transformed variable ${n.id} has no defining expression.`);
    if(n.kind==='stochastic'&&!n.distribution) {
      if(n.type==='real'&&n.bounds.lower&&n.bounds.upper) n.distribution={name:'uniform',args:[n.bounds.lower,n.bounds.upper]};
      else modelError(`Parameter ${n.id} has no supported proper prior.`);
    }
    const expressions=[...n.dimensions,...boundExpressions(n.bounds),...(n.expression?[n.expression]:[]),...(n.distribution?[...n.distribution.args,...boundExpressions({lower:n.distribution.lower,upper:n.distribution.upper})].filter(Boolean):[])];
    n.parents=[...new Set(expressions.flatMap(expressionVariables))];
    for(const parent of n.parents) get(parent);
  }
  /** @type {string[]} */ const order=[];const visiting=new Set(),visited=new Set();
  /** @param {ModelNode} n */
  function visit(n) {if(visiting.has(n.id)) modelError(`Circular dependency involving ${n.id}.`);if(visited.has(n.id))return;visiting.add(n.id);for(const name of n.parents)visit(get(name));visiting.delete(n.id);visited.add(n.id);order.push(n.id);}
  for(const n of nodes)visit(n);
  /** @param {string} id @returns {boolean} */
  function randomAncestor(id) {const n=get(id);return n.kind==='stochastic'||n.kind==='observed'||n.parents.some(randomAncestor);}
  for(const n of nodes) {
    if(n.block==='transformed data'&&n.parents.some(randomAncestor)) modelError(`Transformed data ${n.id} depends on a sampled outcome. The explorer cannot infer whether outcome-dependent preprocessing should be fixed or recomputed for prediction.`);
    if(n.dimensions.some(x=>expressionVariables(x).some(randomAncestor))) modelError(`The size of ${n.id} depends on a random variable.`);
    const expressions=[...n.dimensions,...boundExpressions(n.bounds),...(n.expression?[n.expression]:[]),...(n.distribution?[...n.distribution.args,...boundExpressions({lower:n.distribution.lower,upper:n.distribution.upper})].filter(Boolean):[])];
    for(const expr of expressions)validateGatherSelectors(expr,randomAncestor);

  }
  const model={nodes,edges:nodes.flatMap(n=>n.parents.map(from=>({from,to:n.id}))),order,warnings:[]};
  validateModelNormalization(model);
  validateTransformedSupports(model);
  return model;
}
