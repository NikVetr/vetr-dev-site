import { simulate } from './simulation.js';
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, result: simulate(data.model, data.options) }); }
  catch (raw) {
    const error = /** @type {Error & {code?:string}} */ (raw);
    self.postMessage({ id: data.id, error: { code: error.code || 'SIMULATION_ERROR', message: error.message } });
  }
};
