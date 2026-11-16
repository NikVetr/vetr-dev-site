import { Stan2RError } from './request.js';

/** @typedef {{kind:'number',value:number}|{kind:'variable',name:string}|{kind:'binary',op:string,left:Expr,right:Expr}|{kind:'unary',op:string,arg:Expr}|{kind:'call',name:string,args:Expr[]}|{kind:'index',arg:Expr,indices:Expr[],gather?:boolean}|{kind:'array',items:Expr[]}} Expr */
/** @typedef {number | number[]} Value */
export const FUNCTIONS = ['exp','log','log1p','expm1','sqrt','square','inv_logit','logit','inv','fabs','abs','pow','sum','mean','min','max','rep_vector','rep_row_vector','rep_array','to_vector','fmin','fmax'];
/** @param {string} message @returns {never} */
export function modelError(message) { throw new Stan2RError('UNSUPPORTED_MODEL', message, 'source'); }
/** @param {Expr} expr @returns {string[]} */
export function expressionVariables(expr) {
  if (expr.kind === 'variable') return [expr.name];
  if (expr.kind === 'number') return [];
  const children = expr.kind === 'binary' ? [expr.left,expr.right] : expr.kind === 'call' ? expr.args : expr.kind === 'array' ? expr.items : expr.kind === 'index' ? [expr.arg,...expr.indices] : [expr.arg];
  return [...new Set(children.flatMap(expressionVariables))];
}
/** @param {Expr} expr @returns {string} */
export function expressionText(expr) {
  switch (expr.kind) {
    case 'number': return String(expr.value);
    case 'variable': return expr.name;
    case 'unary': return `${expr.op}(${expressionText(expr.arg)})`;
    case 'binary': return `(${expressionText(expr.left)} ${expr.op} ${expressionText(expr.right)})`;
    case 'call': return `${expr.name}(${expr.args.map(expressionText).join(', ')})`;
    case 'index': return `${expressionText(expr.arg)}[${expr.indices.map(expressionText).join(', ')}]`;
    case 'array': return `{${expr.items.map(expressionText).join(', ')}}`;
  }
}
/** @param {Value} value @param {string} context */
export function scalar(value, context) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Stan2RError('SIMULATION_ERROR', `${context} must be a finite scalar.`);
  return value;
}
/** @param {Value} a @param {Value} b @param {(a:number,b:number)=>number} fn @returns {Value} */
function binary(a,b,fn) {
  if (!Array.isArray(a) && !Array.isArray(b)) return fn(a,b);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) throw new Stan2RError('SIMULATION_ERROR','Vector lengths differ.');
    return a.map((x,i)=>fn(x,b[i]));
  }
  return Array.isArray(a) ? a.map(x=>fn(x,/** @type {number} */(b))) : /** @type {number[]} */(b).map(x=>fn(a,x));
}
/** @param {Expr} expr @param {Record<string,Value>} env @returns {Value} */
export function evaluateExpression(expr,env) {
  let value;
  switch (expr.kind) {
    case 'number': return expr.value;
    case 'variable': {
      if (!Object.hasOwn(env,expr.name)) throw new Stan2RError('SIMULATION_ERROR', `Missing value for ${expr.name}.`);
      return env[expr.name];
    }
    case 'array': return expr.items.map(x=>scalar(evaluateExpression(x,env),'Array element'));
    case 'index': {
      if(expr.indices.length!==1)throw new Stan2RError('SIMULATION_ERROR','Expected one index for a one-dimensional variable.');
      const x=evaluateExpression(expr.arg,env), selector=evaluateExpression(expr.indices[0],env);
      if(!Array.isArray(x))throw new Stan2RError('SIMULATION_ERROR','Only one-dimensional arrays or vectors can be indexed.');
      if(expr.gather ? !Array.isArray(selector) : typeof selector!=='number')throw new Stan2RError('SIMULATION_ERROR',expr.gather?'A gather requires an integer-array index.':'A scalar index must be an integer, not a vector.');
      const indexes=Array.isArray(selector)?selector:[selector];
      if(indexes.some(i=>!Number.isInteger(i)||i<1||i>x.length))throw new Stan2RError('SIMULATION_ERROR',`Index is outside the one-dimensional variable (valid range 1:${x.length}).`);
      const selected=indexes.map(i=>x[i-1]);
      return expr.gather ? selected : selected[0];
    }
    case 'unary': value=binary(0,evaluateExpression(expr.arg,env),expr.op==='-' ? (a,b)=>a-b : (a,b)=>a+b); break;
    case 'binary': {
      const a=evaluateExpression(expr.left,env),b=evaluateExpression(expr.right,env);
      if (expr.op==='*' && Array.isArray(a) && Array.isArray(b)) modelError('Vector products are not supported by the explorer; use elementwise multiplication explicitly.');
      const operations=/** @type {Record<string,(a:number,b:number)=>number>} */({'+':(x,y)=>x+y,'-':(x,y)=>x-y,'*':(x,y)=>x*y,'.*':(x,y)=>x*y,'/':(x,y)=>x/y,'./':(x,y)=>x/y,'^':(x,y)=>x**y,'.^':(x,y)=>x**y});
      if (!operations[expr.op]) modelError(`Unsupported operator ${expr.op}.`);
      value=binary(a,b,operations[expr.op]); break;
    }
    case 'call': {
      const args=expr.args.map(x=>evaluateExpression(x,env)), a=args[0];
      if (['sum','mean','min','max'].includes(expr.name)) {
        if (!Array.isArray(a) || (expr.name!=='sum'&&!a.length)) throw new Stan2RError('SIMULATION_ERROR',`${expr.name} needs a nonempty vector.`);
        value=expr.name==='min'?Math.min(...a):expr.name==='max'?Math.max(...a):a.reduce((x,y)=>x+y,0)/(expr.name==='mean'?a.length:1); break;
      }
      if (['rep_vector','rep_row_vector','rep_array'].includes(expr.name)) {
        const n=scalar(args[1],'Replication count');
        if (!Number.isInteger(n)||n<0||n>512) throw new Stan2RError('SIMULATION_LIMIT','Replication count must be between 0 and 512.');
        value=Array(n).fill(scalar(a,'Replicated value')); break;
      }
      if (expr.name==='to_vector') { value=Array.isArray(a)?a.slice():[a]; break; }
      if (['pow','fmin','fmax'].includes(expr.name)) { value=binary(a,args[1],expr.name==='pow'?(x,y)=>x**y:expr.name==='fmin'?Math.min:Math.max); break; }
      const functions=/** @type {Record<string,(x:number)=>number>} */({exp:Math.exp,log:Math.log,log1p:Math.log1p,expm1:Math.expm1,sqrt:Math.sqrt,square:x=>x*x,inv_logit:x=>x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x)),logit:x=>Math.log(x/(1-x)),inv:x=>1/x,fabs:Math.abs,abs:Math.abs});
      const fn=functions[expr.name]; if (!fn) modelError(`Unsupported function ${expr.name}.`);
      value=Array.isArray(a)?a.map(fn):fn(a); break;
    }
  }
  if (!(Array.isArray(value)?value:[value]).every(Number.isFinite)) throw new Stan2RError('SIMULATION_ERROR',`Non-finite result in ${expressionText(expr)}.`);
  return value;
}
