import { modelError } from './expressions.js';
/** @typedef {import('./expressions.js').Expr} Expr */
/** @typedef {[number,number]} Interval Closed enclosure of every finite valid result. */
/** @type {Interval} */
const UNKNOWN=[-Infinity,Infinity];
/** @param {number} lo @param {number} hi @returns {Interval} */
const interval=(lo,hi)=>Number.isNaN(lo)||Number.isNaN(hi)||lo>hi?UNKNOWN:[lo,hi];
/** Extended-real multiplication of interval endpoints; zero times any finite member is zero.
 * @param {number} a @param {number} b */
const product=(a,b)=>a===0||b===0?0:a*b;
/** @param {Interval} a @param {Interval} b @returns {Interval} */
function multiply(a,b){const xs=[product(a[0],b[0]),product(a[0],b[1]),product(a[1],b[0]),product(a[1],b[1])];return interval(Math.min(...xs),Math.max(...xs));}
/** Conservative value enclosure, not a change to execution or sampling.
 * Unknown expressions stay unbounded and therefore cannot discharge a constraint.
 * @param {Expr} expr @param {Map<string,Interval>} env @returns {Interval}
 */
export function expressionSupport(expr,env) {
  if(expr.kind==='number')return [expr.value,expr.value];
  if(expr.kind==='variable')return env.get(expr.name)??UNKNOWN;
  if(expr.kind==='index')return expressionSupport(expr.arg,env);
  if(expr.kind==='array') {
    const xs=expr.items.map(x=>expressionSupport(x,env));
    return xs.length?interval(Math.min(...xs.map(x=>x[0])),Math.max(...xs.map(x=>x[1]))):UNKNOWN;
  }
  if(expr.kind==='unary') {const a=expressionSupport(expr.arg,env);return expr.op==='-'?[-a[1],-a[0]]:a;}
  if(expr.kind==='binary') {
    const a=expressionSupport(expr.left,env),b=expressionSupport(expr.right,env);
    if(expr.op==='+')return interval(a[0]+b[0],a[1]+b[1]);
    if(expr.op==='-')return interval(a[0]-b[1],a[1]-b[0]);
    if(['*','.*'].includes(expr.op))return multiply(a,b);
    if(['/','./'].includes(expr.op)) {
      if(b[0]>=0&&b[1]>0)return multiply(a,[1/b[1],b[0]===0?Infinity:1/b[0]]);
      if(b[0]<0&&b[1]<=0)return multiply(a,[b[1]===0?-Infinity:1/b[1],1/b[0]]);
    }
    return UNKNOWN;
  }
  const args=expr.args.map(x=>expressionSupport(x,env)),a=args[0];
  switch(expr.name) {
    case 'inv_logit':return [0,1];
    case 'exp':return interval(Math.exp(a[0]),Math.exp(a[1]));
    case 'expm1':return interval(Math.expm1(a[0]),Math.expm1(a[1]));
    case 'sqrt':return a[1]<0?UNKNOWN:interval(Math.sqrt(Math.max(0,a[0])),Math.sqrt(a[1]));
    case 'square':return interval(a[0]<=0&&a[1]>=0?0:Math.min(a[0]**2,a[1]**2),Math.max(a[0]**2,a[1]**2));
    case 'fabs':case 'abs':return interval(a[0]<=0&&a[1]>=0?0:Math.min(Math.abs(a[0]),Math.abs(a[1])),Math.max(Math.abs(a[0]),Math.abs(a[1])));
    case 'rep_vector':case 'rep_row_vector':case 'rep_array':case 'to_vector':case 'min':case 'max':case 'mean':return a;
    case 'sum':return a[0]>=0?[0,Infinity]:a[1]<=0?[-Infinity,0]:UNKNOWN;
    case 'fmin':return interval(Math.min(a[0],args[1][0]),Math.min(a[1],args[1][1]));
    case 'fmax':return interval(Math.max(a[0],args[1][0]),Math.max(a[1],args[1][1]));
    default:return UNKNOWN;
  }
}
/** Numeric bounds only: a range for a bound is not the same as its value.
 * @param {Expr|undefined} expr @returns {number|undefined} */
function constant(expr){if(!expr)return undefined;const [lo,hi]=expressionSupport(expr,new Map());return lo===hi&&Number.isFinite(lo)?lo:undefined;}
/** @param {Interval} range @param {import('./model.js').Bounds} bounds @returns {Interval} */
function declared(range,bounds){return interval(Math.max(range[0],constant(bounds.lower)??-Infinity),Math.min(range[1],constant(bounds.upper)??Infinity));}
/** Prove that transformed parameter constraints do not reject any possible prior draw.
 * Scenarios are rechecked: fixing an otherwise positive random variable to a negative
 * value must not preserve an obsolete proof about a downstream transformation.
 * @param {import('./model.js').Model} model
 * @param {Record<string,import('./simulation.js').Override>} [overrides]
 */
export function validateTransformedSupports(model,overrides={}) {
  if(!model.nodes.some(n=>n.block==='transformed parameters'&&Object.keys(n.bounds).length))return;
  /** @type {Map<string,Interval>} */const env=new Map();
  const nodes=new Map(model.nodes.map(n=>[n.id,n]));
  for(const id of model.order) {
    const node=nodes.get(id);if(!node)modelError(`Unknown variable ${id} in support proof.`);
    const override=overrides[id];
    /** @type {Interval} */let range=UNKNOWN;
    if(override?.fixed!==undefined) {
      const xs=Array.isArray(override.fixed)?override.fixed:[override.fixed];
      range=xs.length?interval(Math.min(...xs),Math.max(...xs)):UNKNOWN;
    } else if(node.expression)range=expressionSupport(node.expression,env);
    else if(node.distribution) {
      const d=node.distribution;
      const args=d.args.map((x,i)=>override?.args?.[i]===undefined?expressionSupport(x,env):/** @type {Interval} */([override.args[i],override.args[i]]));
      if(['exponential','gamma','lognormal','poisson','poisson_log'].includes(d.name))range=[0,Infinity];
      else if(['beta','bernoulli','bernoulli_logit'].includes(d.name))range=[0,1];
      else if(['binomial','beta_binomial'].includes(d.name))range=[0,args[0][1]];
      else if(d.name==='uniform')range=interval(args[0][0],args[1][1]);
      range=declared(range,{lower:d.lower,upper:d.upper});
    }
    if(node.block==='transformed parameters'&&Object.keys(node.bounds).length) {
      const lower=constant(node.bounds.lower),upper=constant(node.bounds.upper);
      if((node.bounds.lower&&(lower===undefined||range[0]<lower))||(node.bounds.upper&&(upper===undefined||range[1]>upper)))
        modelError(`Constrained transformed parameter ${id}: its bounds are not proven redundant for every draw in this scenario. The explorer cannot silently reject or reweight those draws.`);
    }
    // Constraints on static data and stochastic parameters are checked elsewhere.
    // Observed-data declarations do not truncate newly generated observations.
    if(node.kind!=='observed')range=declared(range,node.bounds);
    env.set(id,range);
  }
}
