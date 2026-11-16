import { Stan2RError } from './request.js';
import { validateSimulation, validateDataValues } from './simulation.js';
import { expressionVariables } from './expressions.js';
import { naturalBounds } from './model.js';
import { distributionArgs, pythonExpression, pythonNumericHelpers } from './exports.js';

/** @typedef {import('./model.js').Model} Model */
/** @typedef {import('./model.js').ModelNode} ModelNode */
/** @typedef {import('./expressions.js').Expr} Expr */
/** @typedef {import('./simulation.js').SimulationOptions} SimulationOptions */
export const PYMC_VERSION = '6.4.0';
/** @param {string} message @returns {never} */
const fail = message => { throw new Stan2RError('EXPORT_ERROR', message); };

/** @param {string} name @param {string[]} args @returns {[string,string]} */
function family(name, args) {
  const [a,b,c] = args;
  switch(name) {
    case 'normal': return ['Normal', `mu=${a}, sigma=${b}`];
    case 'lognormal': return ['LogNormal', `mu=${a}, sigma=${b}`];
    case 'exponential': return ['Exponential', `lam=${a}`];
    case 'gamma': return ['Gamma', `alpha=${a}, beta=${b}`];
    case 'beta': return ['Beta', `alpha=${a}, beta=${b}`];
    case 'uniform': return ['Uniform', `lower=${a}, upper=${b}`];
    case 'student_t': return ['StudentT', `nu=${a}, mu=${b}, sigma=${c}`];
    case 'cauchy': return ['Cauchy', `alpha=${a}, beta=${b}`];
    case 'bernoulli': return ['Bernoulli', `p=${a}`];
    case 'bernoulli_logit': return ['Bernoulli', `logit_p=${a}`];
    case 'binomial': return ['Binomial', `n=${a}, p=${b}`];
    case 'beta_binomial': return ['BetaBinomial', `n=${a}, alpha=${b}, beta=${c}`];
    case 'poisson': return ['Poisson', `mu=${a}`];
    case 'poisson_log': return ['Poisson', `mu=pt.exp(${a})`];
    default: return fail(`PyMC export does not support ${name}.`);
  }
}

/** PyMC fitting model for the supported Stan graph. Observed values are required.
 * @param {Model} model @param {SimulationOptions} [options]
 */
export function exportPyMC(model, options = {}) {
  const {data,draws,seed,overrides} = validateSimulation(model,options);
  validateDataValues(model,data);
  for(const node of model.nodes) if(node.kind==='observed'&&!Object.hasOwn(data,node.id)) fail(`PyMC fitting export needs observed data for ${node.id}.`);
  const byName=new Map(model.nodes.map(n=>[n.id,n]));
  /** @param {string} id @returns {boolean} */
  function randomAncestor(id) {
    const n=byName.get(id); if(!n)return fail(`Unknown dependency ${id}.`);
    return n.kind==='stochastic'||n.kind==='observed'||n.parents.some(randomAncestor);
  }
  /** Numeric-only helpers must never receive a random symbolic selector or size. @param {Expr} expr */
  function checkStaticHelpers(expr) {
    const numericArgs=expr.kind==='index'?expr.indices:expr.kind==='call'&&['rep_vector','rep_row_vector','rep_array'].includes(expr.name)?[expr.args[1]]:[];
    if(numericArgs.some(arg=>expressionVariables(arg).some(randomAncestor)))fail('PyMC export requires data-only index selectors and replication counts.');
    const children=expr.kind==='binary'?[expr.left,expr.right]:expr.kind==='unary'?[expr.arg]:expr.kind==='call'?expr.args:expr.kind==='array'?expr.items:expr.kind==='index'?[expr.arg,...expr.indices]:[];
    for(const child of children)checkStaticHelpers(child);
  }
  for(const node of model.nodes)for(const expr of [...node.dimensions,...Object.values(node.bounds),...(node.expression?[node.expression]:[]),...(node.distribution?[...node.distribution.args,...[node.distribution.lower,node.distribution.upper].filter(x=>x!==undefined)]:[])])checkStaticHelpers(expr);
  const numeric=(/** @type {Expr} */ expr)=>pythonExpression(expr);
  const symbolic=(/** @type {Expr} */ expr)=>pythonExpression(expr,true);
  const prelude=[];
  for(const node of model.nodes.filter(n=>n.block==='data')) {
    const name=JSON.stringify(node.id);
    const dimensions=node.dimensions.map(d=>`_dimension(${numeric(d)})`);
    prelude.push(`    if ${name} not in dat:`, `        raise ValueError(${JSON.stringify(`Missing required data: ${node.id}`)})`, `    shape = (${dimensions.join(', ')}${dimensions.length===1?',':''})`, `    v[${name}] = _checked(dat[${name}], shape, ${name}, integer=${node.type==='int'?'True':'False'}, lower=${node.bounds.lower?numeric(node.bounds.lower):'None'}, upper=${node.bounds.upper?numeric(node.bounds.upper):'None'})`);
  }
  for(const id of model.order) {
    const node=byName.get(id); if(!node)return fail(`Unknown node ${id}.`);
    if(node.block!=='transformed data')continue;
    if(!node.expression)return fail(`Missing expression for ${id}.`);
    const name=JSON.stringify(id),dimensions=node.dimensions.map(d=>`_dimension(${numeric(d)})`);
    prelude.push(`    shape = (${dimensions.join(', ')}${dimensions.length===1?',':''})`, `    v[${name}] = _checked(${numeric(node.expression)}, shape, ${name}, integer=${node.type==='int'?'True':'False'}, lower=${node.bounds.lower?numeric(node.bounds.lower):'None'}, upper=${node.bounds.upper?numeric(node.bounds.upper):'None'})`);
  }
  for(const node of model.nodes) {
    const name=JSON.stringify(node.id),dimensions=node.dimensions.map(d=>`_dimension(${numeric(d)})`);
    prelude.push(`    shapes[${name}] = (${dimensions.join(', ')}${dimensions.length===1?',':''})`);
    if(node.dimensions.length) {
      let coordinate=`${node.id}_element`; while(byName.has(coordinate))coordinate=`_${coordinate}`;
      prelude.push(`    dims[${name}] = (${JSON.stringify(coordinate)},)`, `    coords[${JSON.stringify(coordinate)}] = np.arange(1, shapes[${name}][0] + 1)`);
      if(['stochastic','observed'].includes(node.kind))prelude.push(`    if shapes[${name}][0] == 0:`, `        raise ValueError(${JSON.stringify(`${node.id}: zero-length sampled variables are not supported`)})`);
    } else prelude.push(`    dims[${name}] = ()`);
  }
  const lines=[];
  for(const id of model.order) {
    const node=byName.get(id);if(!node)return fail(`Unknown node ${id}.`);
    if(node.kind==='input'||node.block==='transformed data')continue;
    const name=JSON.stringify(id);
    lines.push(`        # ${node.block}: ${id}`);
    const fixed=overrides[id]?.fixed;
    if(fixed!==undefined) {
      if(Object.values(node.bounds).some(expr=>expressionVariables(expr).some(randomAncestor)))fail(`Cannot fix ${id}: its declared bounds depend on random variables. Edit the Stan model to specify that intervention explicitly.`);
      lines.push(`        fixed = _checked(${JSON.stringify(fixed)}, shapes[${name}], ${name}, lower=${node.bounds.lower?numeric(node.bounds.lower):'None'}, upper=${node.bounds.upper?numeric(node.bounds.upper):'None'}, broadcast=True)`, `        v[${name}] = pm.Deterministic(${name}, pt.as_tensor_variable(fixed), dims=dims[${name}])`);
    } else if(node.distribution) {
      const [distribution,params]=family(node.distribution.name,distributionArgs(node,overrides).map(symbolic));
      /** @type {import('./model.js').Bounds} */
      const declared = node.kind==='stochastic' && !naturalBounds(node) ? node.bounds : {};
      const explicitBounds = {lower:node.distribution.lower, upper:node.distribution.upper};
      /** @type {import('./model.js').Bounds} */
      const explicit = naturalBounds({...node,bounds:explicitBounds}) ? {} : explicitBounds;
      const lower=[declared.lower,explicit.lower].filter(x=>x!==undefined);
      const upper=[declared.upper,explicit.upper].filter(x=>x!==undefined);
      const lo=lower.map(symbolic),hi=upper.map(symbolic);
      const observed=node.kind==='observed'?`, observed=dat[${name}]`:'';
      if(lo.length||hi.length) {
        const lowerCode=lo.length>1?`pt.maximum(${lo.join(', ')})`:lo[0]??'None';
        const upperCode=hi.length>1?`pt.minimum(${hi.join(', ')})`:hi[0]??'None';
        lines.push(`        base = pm.${distribution}.dist(${params}, shape=shapes[${name}])`, `        v[${name}] = pm.Truncated(${name}, base, lower=${lowerCode}, upper=${upperCode}, dims=dims[${name}]${observed})`);
      } else lines.push(`        v[${name}] = pm.${distribution}(${name}, ${params}, shape=shapes[${name}], dims=dims[${name}]${observed})`);
    } else if(node.expression) {
      lines.push(`        v[${name}] = pm.Deterministic(${name}, pt.specify_shape(${symbolic(node.expression)}, shapes[${name}]), dims=dims[${name}])`);
    } else return fail(`No PyMC expression for ${id}.`);
  }
  return `# Generated by stan-the-explorer: a PyMC fitting model. Tested with pymc==${PYMC_VERSION}.\n# Install in an isolated environment: python -m pip install pymc==${PYMC_VERSION}\n# Bounds are normalized only where the supported Stan graph establishes equivalence.\n# Log densities may differ from Stan by a parameter-independent constant.\n${Object.keys(overrides).length?'# EXPLORATORY OVERRIDES change the original model. Fixed interventions remove their prior factor;\n# this is not conditioning the original posterior on those values.\n':''}import json\nimport numpy as np\nimport pymc as pm\nimport pytensor.tensor as pt\n\nDEFAULT_DATA = json.loads(${JSON.stringify(JSON.stringify(data))})\nDEFAULT_SEED = ${seed}\n${pythonNumericHelpers}\n\ndef build_model(dat=DEFAULT_DATA):\n    """Build the model with observed data. Rebuild after changing input data."""\n    v = {name: _numeric(value) for name, value in dat.items()}\n    shapes, dims, coords = {}, {}, {}\n${prelude.join('\n')}\n    with pm.Model(coords=coords) as model:\n${lines.length?lines.join('\n'):'        pass'}\n    return model\n\n\nif __name__ == "__main__":\n    model = build_model()\n    print(model)\n    # with model:\n    #     prior = pm.sample_prior_predictive(draws=${draws}, random_seed=DEFAULT_SEED)\n    # Fit when ready; choose draws/tuning appropriate for your analysis and inspect diagnostics.\n    # with model:\n    #     posterior = pm.sample(draws=1000, tune=1000, chains=4, cores=2, random_seed=DEFAULT_SEED)\n    #     predictions = pm.sample_posterior_predictive(posterior, random_seed=DEFAULT_SEED)\n`;
}
