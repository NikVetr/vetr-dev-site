// Runs submit() off the page's main thread, so a long search leaves the page responsive.
// Messages in: { request }. Messages out: { type: 'progress', progress } at most every
// 100 ms, then { type: 'result', result } or { type: 'error', error: { code, message, issues } }.

import { SeatingError, submit } from './core/index.js';

self.onmessage = (/** @type {MessageEvent} */ { data }) => {
  let last = 0;
  try {
    const result = submit(data.request, {
      onProgress: (progress) => {
        const now = performance.now();
        if (now - last > 100) {
          last = now;
          self.postMessage({ type: 'progress', progress: { ...progress, move: null } });
        }
      },
    });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    const body = error instanceof SeatingError
      ? error.toJSON().error
      : { code: 'internal_error', message: String(error), issues: [] };
    self.postMessage({ type: 'error', error: body });
  }
};
