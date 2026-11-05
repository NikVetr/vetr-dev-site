// Runs submit() off the page's main thread, so the page stays responsive while
// a fill is computed. Receives { id, request, background } and answers
// { id, result, svg } or { id, error } (a TextInImageError as JSON).
//
// The core is imported dynamically so this handler exists from the start:
// loading the font takes a moment, and a message that arrived before a
// handler was set would be lost.

const core = import('./core/index.js');

self.onmessage = async (/** @type {MessageEvent} */ event) => {
  const { id, request, background } = event.data;
  try {
    const { renderSvg, submit } = await core;
    const result = submit(request);
    self.postMessage({ id, result, svg: renderSvg(result, { background }) });
  } catch (error) {
    // a TextInImageError carries its own JSON; anything else is a bug or a failed load
    const e = /** @type {any} */ (error);
    self.postMessage({ id, error: typeof e?.toJSON === 'function' ? e.toJSON().error : { code: 'internal_error', message: String(e?.message ?? e), issues: [] } });
  }
};
