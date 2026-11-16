import { createRequire } from 'node:module';
import { checkedAST, validateRequest, Stan2RError } from './request.js';
import { buildModel } from './model.js';
import { simulate } from './simulation.js';
import { exportLatex, exportPython } from './exports.js';
import { exportPyMC } from './pymc.js';
const { stanc } = createRequire(import.meta.url)('../vendor/stanc.js');
/** @param {string} source */
export function analyze(source) {
  validateRequest({ source });
  const {ast,warnings}=checkedAST(stanc('model',source,['debug-typed-ast']));
  const model=buildModel(ast,source);model.warnings.unshift(...warnings);return model;
}
/** @param {{source:string,data?:Record<string,any>,draws?:number,seed?:number,overrides?:any}} request */
export function explore(request) {
  if(!request || typeof request!=='object' || Array.isArray(request))throw new Stan2RError('INVALID_REQUEST','Expected a request object.');
  const {source,...options}=request;
  const model=analyze(source);
  return {model,...simulate(model,options)};
}
/** @param {any} request */
export function dispatchExploration(request) {
  if(!request || typeof request!=='object' || Array.isArray(request))throw new Stan2RError('INVALID_REQUEST','Expected a request object.');
  for(const key of Object.keys(request))if(!['action','source','data','draws','seed','overrides'].includes(key))throw new Stan2RError('INVALID_REQUEST',`Unknown field: ${key}`);
  const {action,source,...options}=request;
  if(action==='explore')return explore({source,...options});
  const model=analyze(source);
  if(action==='graph')return {model};
  if(action==='latex')return {code:exportLatex(model,options),format:'latex'};
  if(action==='python')return {code:exportPython(model,options),format:'python'};
  if(action==='pymc')return {code:exportPyMC(model,options),format:'pymc'};
  throw new Stan2RError('INVALID_REQUEST',`Unknown action: ${action}`);
}
