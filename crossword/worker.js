// Runs submit() off the page's main thread, so long searches leave the page responsive.
// Messages in: { request }. Messages out: { type: 'progress', progress } at most every
// 100 ms (and at the start and end of each refinement), then { type: 'result', result }
// or { type: 'error', error: { code, message, issues } }.

import { CrosswordError, submit } from './core/index.js';

self.onmessage = (/** @type {MessageEvent} */ { data }) => {
  let last = 0;
  try {
    const result = submit(data.request, {
      onProgress: (progress) => {
        const now = performance.now();
        if (progress.iteration === 0 || progress.iteration === progress.nIter || now - last > 100) {
          last = now;
          self.postMessage({ type: 'progress', progress });
        }
      },
    });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    const body = error instanceof CrosswordError
      ? error.toJSON().error
      : { code: 'internal_error', message: String(error), issues: [] };
    self.postMessage({ type: 'error', error: body });
  }
};
