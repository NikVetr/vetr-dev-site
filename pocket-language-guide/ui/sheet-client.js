import { buildSheet } from '../core/sheet.js';
import { loadBytes, loadText } from './app.js';

/** @type {Worker|undefined} */ let worker;
let unavailable = false;
class WorkerUnavailable extends Error {}
/** @type {Set<(error:Error)=>void>} */ const pending = new Set();

/** @type {typeof buildSheet} */
export async function buildBrowserSheet(ctx, spec, edits) {
  // Older WebViews without module workers can still run exactly the same layout.
  if (unavailable || typeof Worker === 'undefined') return buildSheet(ctx, spec, edits);
  const first = !worker;
  if (!worker) {
    try {
      worker = new Worker(new URL('./sheet-worker.js', import.meta.url), { type: 'module' });
    } catch (error) {
      if (!(error instanceof DOMException && ['SecurityError', 'NotSupportedError'].includes(error.name))) throw error;
      unavailable = true;
      console.warn('[plg] WebView cannot start a sheet worker, using the page solver:', error);
      return buildSheet(ctx, spec, edits);
    }
    let started = false;
    worker.onmessage = async ({ data, ports }) => {
      started = true;
      const port = ports[0];
      try {
        const value = data.kind === 'bytes' ? await loadBytes(data.path) : await loadText(data.path);
        port.postMessage({ value });
      } catch (error) {
        port.postMessage({ error: error instanceof Error ? error.message : String(error),
          status: /** @type {{status?:number}} */ (error)?.status });
      } finally { port.close(); }
    };
    worker.onerror = (event) => {
      worker?.terminate();
      worker = undefined;
      const message = event.message || 'Sheet worker failed to load';
      if (!started) {
        unavailable = true;
        console.warn('[plg] Sheet worker startup failed, using the page solver:', message);
      }
      for (const fail of pending) fail(started ? new Error(message) : new WorkerUnavailable(message));
    };
  }
  const target = worker;
  const result = new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const close = () => { channel.port1.close(); pending.delete(fail); };
    /** @param {unknown} error */
    const fail = error => { close(); reject(error); };
    pending.add(fail);
    channel.port1.onmessage = ({ data }) => {
      close();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    channel.port1.onmessageerror = () => fail(new Error('The sheet result could not be read'));
    try { target.postMessage({ corpus: first ? ctx.corpus : undefined, spec, edits }, [channel.port2]); }
    catch (error) { channel.port2.close(); fail(error); }
  });
  try { return await result; }
  catch (error) {
    if (error instanceof WorkerUnavailable) return buildSheet(ctx, spec, edits);
    throw error;
  }
}
