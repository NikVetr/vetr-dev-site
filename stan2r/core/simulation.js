import { Stan2RError } from './request.js';
import { evaluateExpression, scalar } from './expressions.js';
/** @typedef {import('./expressions.js').Value} Value */
/** @typedef {import('./model.js').Model} Model */
/** @typedef {import('./model.js').ModelNode} ModelNode */
/** @typedef {{fixed?:Value,args?:Record<string,number>}} Override */
/** @typedef {{data?:Record<string,Value>,draws?:number,seed?:number,overrides?:Record<string,Override>}} SimulationOptions */
/** @param {string} message @param {string} [code] @returns {never} */
const fail=(message,code='SIMULATION_ERROR')=>{throw new Stan2RError(code,message);};
/** @param {unknown} value @returns {value is Record<string,any>} */
const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
/** @param {unknown} value @returns {value is Value} */
const numeric=value=>typeof value==='number'?Number.isFinite(value):Array.isArray(value)&&value.every(x=>typeof x==='number'&&Number.isFinite(x));
/** Validate request options without drawing random values. @param {Model} model @param {SimulationOptions} [options] */
export function validateSimulation(model,options={}) {
  if(!object(options)) fail('Simulation options must be an object.','INVALID_REQUEST');
  for(const key of Object.keys(options))if(!['data','draws','seed','overrides'].includes(key))fail(`Unknown simulation option ${key}.`,'INVALID_REQUEST');
  const {data={},draws=1000,seed=12345,overrides={}}=options;
  if(!Number.isInteger(draws)||draws<1||draws>10000)fail('Choose 1–10,000 Monte Carlo draws.','INVALID_REQUEST');
  if(!Number.isInteger(seed)||seed<0||seed>4294967295)fail('Seed must be an integer between 0 and 4294967295.','INVALID_REQUEST');
  if(!object(data)||!object(overrides))fail('Data and overrides must be objects.','INVALID_REQUEST');
  for(const [id,value] of Object.entries(data)) {
    if(!model.nodes.some(n=>n.id===id&&n.block==='data'))fail(`Unknown data variable ${id}.`,'INVALID_REQUEST');
    if(!numeric(value))fail(`Data ${id} must be a finite number or numeric vector.`,'INVALID_REQUEST');
  }
  for(const n of model.nodes) if(n.kind==='input'&&!Object.hasOwn(data,n.id))fail(`Missing required data ${n.id}.`,'INVALID_REQUEST');
  validateOverrides(model,overrides);
  return {data,draws,seed,overrides};
}

/** Validate scenario edits independently of numerical data. @param {Model} model @param {Record<string,Override>} [overrides] */
export function validateOverrides(model,overrides={}) {
  if(!object(overrides))fail('Overrides must be an object.','INVALID_REQUEST');
  for(const [id,override] of Object.entries(overrides)) {
    const node=model.nodes.find(n=>n.id===id);
    if(!node||node.block!=='parameters'||!node.distribution)fail(`Only parameters with priors can be overridden (${id}).`,'INVALID_REQUEST');
    if(!object(override)||Object.keys(override).some(key=>!['fixed','args'].includes(key)))fail(`Invalid override for ${id}.`,'INVALID_REQUEST');
    if(Object.hasOwn(override,'fixed')&&Object.hasOwn(override,'args'))fail(`Choose fixed or prior arguments for ${id}, not both.`,'INVALID_REQUEST');
    if(Object.hasOwn(override,'fixed')&&!numeric(override.fixed))fail(`Fixed ${id} must be a finite number or numeric vector.`,'INVALID_REQUEST');
    if(override.args!==undefined) {
      if(!object(override.args))fail(`Arguments for ${id} must be an object.`,'INVALID_REQUEST');
      for(const [index,value] of Object.entries(override.args))if(!/^(0|[1-9][0-9]*)$/.test(index)||Number(index)>=node.distribution.args.length||typeof value!=='number'||!Number.isFinite(value))fail(`Invalid prior argument ${index} for ${id}.`,'INVALID_REQUEST');
    }
  }
  return overrides;
}

/** Mulberry32: reproducible local Monte Carlo, not Stan's RNG stream. @param {number} seed @param {{steps:number}} budget */
function randomGenerator(seed,budget) {
  let state=seed;
  return ()=>{
    if(++budget.steps>5000000)fail('Simulation exceeded its random-draw budget; reduce draws, vector sizes, or extreme truncation.','SIMULATION_LIMIT');
    state=(state+0x6D2B79F5)|0;let t=Math.imul(state^(state>>>15),1|state);t^=t+Math.imul(t^(t>>>7),61|t);return (((t^(t>>>14))>>>0)+0.5)/4294967296;
  };
}
/** @param {()=>number} rng */
const normal=rng=>Math.sqrt(-2*Math.log(rng()))*Math.cos(2*Math.PI*rng());
/** Gamma shape/scale sampler, Marsaglia–Tsang rejection. @param {number} shape @param {()=>number} rng @returns {number} */
function gamma(shape,rng) {
  if(shape<1) return gamma(shape+1,rng)*rng()**(1/shape);
  const d=shape-1/3,c=1/Math.sqrt(9*d);
  for(let attempt=0;attempt<10000;attempt++) {
    const x=normal(rng),root=1+c*x;if(root<=0)continue;const v=root**3,u=rng();
    if(u<1-.0331*x**4||Math.log(u)<.5*x*x+d*(1-v+Math.log(v)))return d*v;
  }
  return fail('Gamma sampler exceeded its rejection limit.','SIMULATION_LIMIT');
}
/** @param {string} name @param {number[]} a @param {()=>number} rng */
function drawDistribution(name,a,rng) {
  /** @param {boolean} valid @param {string} requirement */ const require=(valid,requirement)=>{if(!valid)fail(`${name}: ${requirement}.`);};
  const [x,y,z]=a;
  switch(name) {
    case 'normal': require(y>0,'standard deviation must be positive; use Fix for a point mass');return x+y*normal(rng);
    case 'lognormal':require(y>0,'log-scale standard deviation must be positive');return Math.exp(x+y*normal(rng));
    case 'exponential':require(x>0,'rate must be positive');return -Math.log(rng())/x;
    case 'gamma': {require(x>0&&y>0,'shape and rate must be positive');const result=gamma(x,rng)/y;if(result===0)fail('Gamma shape caused numerical underflow; choose a less extreme shape.');return result;}
    case 'beta': {require(x>0&&y>0,'shape parameters must be positive');const u=gamma(x,rng),v=gamma(y,rng);if(u===0||v===0)fail('Beta shape caused numerical underflow; choose less extreme shapes.');return u>=v?1/(1+v/u):(u/v)/(1+u/v);}
    case 'uniform':require(y>x,'upper bound must exceed lower bound');return x+(y-x)*rng();
    case 'student_t':require(x>0&&z>0,'degrees of freedom and scale must be positive');return y+z*normal(rng)/Math.sqrt(2*gamma(x/2,rng)/x);
    case 'cauchy':require(y>0,'scale must be positive');return x+y*Math.tan(Math.PI*(rng()-.5));
    case 'bernoulli':require(x>=0&&x<=1,'probability must be between 0 and 1');return Number(rng()<x);
    case 'bernoulli_logit':return Number(rng()<(x>=0?1/(1+Math.exp(-x)):Math.exp(x)/(1+Math.exp(x))));
    case 'binomial': {require(Number.isInteger(x)&&x>=0&&x<=10000,'trials must be an integer between 0 and 10,000');require(y>=0&&y<=1,'probability must be between 0 and 1');let total=0;for(let i=0;i<x;i++)total+=Number(rng()<y);return total;}
    case 'poisson':case 'poisson_log': {
      let rate=name==='poisson_log'?Math.exp(x):x;require(Number.isFinite(rate)&&rate>=0&&rate<=1000,'rate must be between 0 and 1,000 for this browser sampler');let total=0;
      // Independent Poisson chunks add exactly, avoiding exp(-rate) underflow.
      while(rate>0) {const chunk=Math.min(rate,20),threshold=Math.exp(-chunk);let product=1,count=0;do{count++;product*=rng();}while(product>threshold);total+=count-1;rate-=chunk;}return total;
    }
    default:return fail(`No sampler for ${name}.`,'UNSUPPORTED_MODEL');
  }
}
/** @param {ModelNode} node @param {Record<string,Value>} env */
function sizeOf(node,env) {
  if(!node.dimensions.length)return 1;
  if(node.dimensions.length!==1)fail(`${node.id}: only one-dimensional variables are supported.`);
  const n=scalar(evaluateExpression(node.dimensions[0],env),`${node.id} dimension`);
  if(!Number.isInteger(n)||n<0||n>512)fail(`${node.id}: dimension must be between 0 and 512.`,'SIMULATION_LIMIT');return n;
}
/** @param {Value} value @param {number} size @param {string} context @returns {number[]} */
function vectorize(value,size,context) {
  if(typeof value==='number')return Array(size).fill(value);
  if(value.length!==size)fail(`${context}: expected ${size} elements, got ${value.length}.`);
  return value;
}
/** @param {Value} value @param {ModelNode} node @param {number} size @param {Record<string,Value>} env @param {boolean} checkBounds */
function checkValue(value,node,size,env,checkBounds) {
  if(node.dimensions.length?(!Array.isArray(value)||value.length!==size):typeof value!=='number')fail(`${node.id}: value does not match its declared shape.`);
  const xs=Array.isArray(value)?value:[value];
  if(!xs.every(Number.isFinite))fail(`${node.id}: simulation produced a non-finite value.`);
  if(node.type==='int'&&!xs.every(x=>Number.isInteger(x)&&x>=-2147483648&&x<=2147483647))fail(`${node.id}: expected 32-bit integer values.`);
  if(checkBounds) {
    const lower=node.bounds.lower?vectorize(evaluateExpression(node.bounds.lower,env),size,`${node.id} lower bound`):Array(size).fill(-Infinity);
    const upper=node.bounds.upper?vectorize(evaluateExpression(node.bounds.upper,env),size,`${node.id} upper bound`):Array(size).fill(Infinity);
    if(xs.some((x,i)=>x<lower[i]||x>upper[i]))fail(`${node.id}: value violates declared bounds.`);
  }
}
/**
 * Direct, seeded Monte Carlo through a supported generative graph. Array outputs
 * are [draw][element], so coordinates are never silently pooled into one marginal.
 * @param {Model} model @param {SimulationOptions} [options]
 */
export function simulate(model,options={}) {
  const input=validateSimulation(model,options),{data,draws,seed,overrides}=input;
  const budget={steps:0},byName=new Map(model.nodes.map(n=>[n.id,n]));
  const usedSeeds=new Set();
  const streams=new Map(model.nodes.map(node=>{
    let hash=2166136261;for(const char of node.id)hash=Math.imul(hash^char.charCodeAt(0),16777619);
    let streamSeed=(seed^hash)>>>0;
    while(usedSeeds.has(streamSeed))streamSeed=(streamSeed+1)>>>0;
    usedSeeds.add(streamSeed);
    return [node.id,randomGenerator(streamSeed,budget)];
  }));
  /** @type {Record<string,number[][]>} */const samples=Object.fromEntries(model.nodes.map(n=>[n.id,[]]));
  // Stan validates observed inputs before any predictive draws. In particular,
  // bounds such as y <= n refer to supplied n, never to its replicate.
  for(const node of model.nodes)if(node.block==='data'&&Object.hasOwn(data,node.id)) {
    checkValue(data[node.id],node,sizeOf(node,data),data,true);
  }
  const warnings=[...model.warnings];
  if(Object.keys(overrides).length)warnings.push('Scenario overrides change the generative model; the Stan source remains unchanged.');
  let totalSize=0;
  for(let draw=0;draw<draws;draw++) {
    /** @type {Record<string,Value>} */const env=Object.create(null);
    for(const id of model.order) {
      const node=byName.get(id);if(!node)fail(`Invalid model order: ${id}.`);
      const size=sizeOf(node,env);
      if(size===0&&(node.kind==='stochastic'||node.kind==='observed'))fail(`${id}: zero-length sampled variables are not supported by the explorer.`, 'UNSUPPORTED_MODEL');
      if(draw===0) {totalSize+=size;if(totalSize*draws>1000000)fail('Simulation output exceeds 1,000,000 values; reduce draws or vector sizes.','SIMULATION_LIMIT');}
      const override=overrides[id];
      /** @type {Value} */ let value;
      if(node.kind==='input')value=data[id];
      else if(node.kind==='deterministic') {if(!node.expression)fail(`No expression for ${id}.`);value=evaluateExpression(node.expression,env);}
      else if(override&&Object.hasOwn(override,'fixed')) {
        const fixed=/** @type {Value} */(override.fixed);value=node.dimensions.length?vectorize(fixed,size,`Fixed ${id}`).slice():fixed;
      } else {
        const distribution=node.distribution;if(!distribution)fail(`No distribution for ${id}.`);
        const args=distribution.args.map((expr,i)=>vectorize(override?.args?.[i]??evaluateExpression(expr,env),size,`${id} argument ${i+1}`));
        const lows=[],highs=[];
        if(node.kind==='stochastic') {if(node.bounds.lower)lows.push(node.bounds.lower);if(node.bounds.upper)highs.push(node.bounds.upper);}
        if(distribution.lower)lows.push(distribution.lower);if(distribution.upper)highs.push(distribution.upper);
        const lowerValues=lows.map(x=>vectorize(evaluateExpression(x,env),size,`${id} lower bound`)),upperValues=highs.map(x=>vectorize(evaluateExpression(x,env),size,`${id} upper bound`));
        const xs=Array.from({length:size},(_,i)=>{
          const lower=Math.max(-Infinity,...lowerValues.map(x=>x[i])),upper=Math.min(Infinity,...upperValues.map(x=>x[i]));
          if(lower>upper||(lower===upper&&node.type!=='int'))fail(`${id}: empty sampling interval; use Fix for a point mass.`);
          const parameters=args.map(x=>x[i]);
          for(let attempt=0;attempt<10000;attempt++) {
            const x=drawDistribution(distribution.name,parameters,/** @type {()=>number} */(streams.get(id)));
            if(!Number.isFinite(x))fail(`${id}: distribution produced a non-finite value.`);
            if(x>=lower&&x<=upper)return x;
          }
          return fail(`${id}: truncation accepted no sample in 10,000 attempts; choose a less extreme interval.`,'SIMULATION_LIMIT');
        });
        value=node.dimensions.length?xs:xs[0];
      }
      checkValue(value,node,size,env,node.kind!=='observed'&&node.kind!=='input');
      env[id]=value;samples[id].push(Array.isArray(value)?value.slice():[value]);
    }
  }
  return {samples,draws,seed,warnings};
}
