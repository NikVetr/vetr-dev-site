// Runs submit() off the page's main thread, so the page stays responsive while
// an image is converted. Messages in: { request }. Messages out: { type:
// 'progress', progress } as each stage starts (and before each k is tried),
// then { type: 'result', result } or { type: 'error', error: { code, message, issues } }.

import { RasterToVectorError, submit } from './core/index.js';

self.onmessage = (/** @type {MessageEvent} */ { data }) => {
  try {
    const result = submit(data.request, { onProgress: (progress) => self.postMessage({ type: 'progress', progress }) });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    const body = error instanceof RasterToVectorError
      ? error.toJSON().error
      : { code: 'INTERNAL', message: String(/** @type {Error} */ (error)?.message ?? error), issues: [] };
    self.postMessage({ type: 'error', error: body });
  }
};
