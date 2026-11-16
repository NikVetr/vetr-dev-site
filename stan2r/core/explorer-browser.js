import { compile } from './browser.js';
import { buildModel } from './model.js';
import { validateRequest, Stan2RError } from './request.js';

/** @type {Worker | undefined} */
let worker;
let nextId = 0;
/** @type {Map<number, {resolve:(value:any)=>void,reject:(error:Error)=>void}>} */
const pending = new Map();

/** Parse through Stan's type checker without loading R. @param {string} source */
export async function analyze(source) {
  validateRequest({ source });
  const { ast, warnings, source: parsedSource, syntax } = await compile(source);
  const model = buildModel(ast, parsedSource);
  model.syntax = syntax;
  model.warnings.unshift(...warnings);
  return model;
}

/** Runs bounded Monte Carlo away from the interface thread.
 * @param {import('./model.js').Model} model
 * @param {Parameters<typeof import('./simulation.js').simulate>[1]} options
 * @returns {Promise<ReturnType<typeof import('./simulation.js').simulate>>}
 */
export function simulateInBrowser(model, options) {
  if (!worker) {
    worker = new Worker(new URL('./simulation-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const task = pending.get(data.id); pending.delete(data.id);
      if (!task) return;
      if (data.error) task.reject(new Stan2RError(data.error.code, data.error.message));
      else task.resolve(data.result);
    };
    worker.onerror = event => {
      for (const task of pending.values()) task.reject(new Stan2RError('SIMULATION_ERROR', event.message));
      pending.clear(); worker?.terminate(); worker = undefined;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId; pending.set(id, { resolve, reject });
    worker?.postMessage({ id, model, options });
  });
}

/** @param {{source:string,data?:Record<string,any>,draws?:number,seed?:number,overrides?:any}} request */
export async function explore(request) {
  if(!request || typeof request!=='object' || Array.isArray(request))throw new Stan2RError('INVALID_REQUEST','Expected a request object.');
  const { source, ...options } = request;
  const model = await analyze(source);
  return { model, ...await simulateInBrowser(model, options) };
}
