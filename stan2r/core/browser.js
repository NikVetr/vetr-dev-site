import { validateRequest, conversionCall, checkedAST, Stan2RError } from './request.js';

const WEBR_URL = 'https://webr.r-wasm.org/v0.5.8/webr.mjs';
/** @type {Promise<any> | undefined} webR's loader is dynamically imported from its pinned CDN. */
let runtimePromise;
/** @type {Worker | undefined} */
let compiler;
/** @type {Promise<unknown>} */
let serial = Promise.resolve();
let nextId = 0;
const pending = new Map();

/** @param {string} source @returns {Promise<{ast: string, warnings: string[]}>} */
export function compile(source) {
  if (!compiler) {
    compiler = new Worker(new URL('./compiler-worker.js', import.meta.url));
    compiler.onmessage = ({ data }) => {
      const task = pending.get(data.id);
      pending.delete(data.id);
      if (!task) return;
      if (data.error) task.reject(new Stan2RError('COMPILER_ERROR', data.error));
      else { try { task.resolve(checkedAST(data.compilation)); } catch (e) { task.reject(e); } }
    };
    compiler.onerror = event => {
      for (const task of pending.values()) task.reject(new Stan2RError('COMPILER_ERROR', event.message));
      pending.clear(); compiler?.terminate(); compiler = undefined;
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    compiler?.postMessage({ id, source });
  });
}

/** @param {URL} url */
async function text(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  return response.text();
}

async function runtime() {
  if (!runtimePromise) runtimePromise = (async () => {
    const { WebR, ChannelType } = await import(WEBR_URL);
    const webR = new WebR({ channelType: ChannelType.PostMessage, interactive: false });
    try {
      await webR.init();
      const manifest = JSON.parse(await text(new URL('../vendor/manifest.json', import.meta.url)));
      const scripts = await Promise.all(Object.keys(manifest.files).map(name => text(new URL(`../vendor/R/${name}`, import.meta.url))));
      scripts.push(await text(new URL('./bridge.R', import.meta.url)));
      await webR.evalRVoid(scripts.join('\n'));
      return webR;
    } catch (e) { webR.close(); throw e; }
  })().catch(error => {
    runtimePromise = undefined;
    throw new Stan2RError('RUNTIME_ERROR', `Could not start the R runtime. Check your connection and try again. ${error.message}`);
  });
  return runtimePromise;
}

/** @param {ReturnType<typeof validateRequest>} request */
async function convert(request) {
  // Reject invalid Stan before downloading the larger R runtime.
  const { ast, warnings } = await compile(request.source);
  const webR = await runtime();
  await webR.FS.writeFile('model.ast', new TextEncoder().encode(ast));
  await webR.FS.writeFile('model.stan', new TextEncoder().encode(request.source));
  await webR.evalRVoid(`.stan2r_result <- ${conversionCall(request)}`);
  const error = await webR.evalRString('.stan2r_result$error');
  if (error) throw new Stan2RError(await webR.evalRString('.stan2r_result$error_code'), error, 'source');
  const code = await webR.evalRString('.stan2r_result$code');
  const extra = await webR.evalRString('paste(.stan2r_result$warnings, collapse="\\n")');
  await webR.evalRVoid('rm(.stan2r_result)');
  await webR.flush();
  return { code, mode: request.mode, warnings: [...warnings, ...(extra ? [extra] : [])], compiler: 'stanc 2.38.0', translator: 'Stan2R e4f4b15' };
}

/** @param {Parameters<typeof validateRequest>[0]} request */
export function submit(request) {
  let validated;
  try { validated = validateRequest(request); } catch (e) { return Promise.reject(e); }
  const result = serial.then(() => convert(validated));
  serial = result.catch(() => {});
  return result;
}
