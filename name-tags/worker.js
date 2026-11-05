// Runs submit() off the page's main thread, so long fits leave the page
// responsive. Messages in: { request }. Messages out: { type: 'progress',
// progress } after each tag, then { type: 'result', result } or
// { type: 'error', error: { code, message, issues } }.
//
// The core is imported dynamically so this handler exists from the start:
// loading the fonts takes a moment, and a message that arrived before a
// handler was set would be lost.

const core = import('./core/index.js');

self.onmessage = async (/** @type {MessageEvent} */ { data }) => {
  try {
    const { submit } = await core;
    const result = submit(data.request, { onProgress: (progress) => self.postMessage({ type: 'progress', progress }) });
    self.postMessage({ type: 'result', result });
  } catch (error) {
    // a NameTagsError carries its own JSON; anything else is a bug or a failed load
    const e = /** @type {any} */ (error);
    self.postMessage({ type: 'error', error: typeof e?.toJSON === 'function' ? e.toJSON().error : { code: 'internal_error', message: String(e?.message ?? e), issues: [] } });
  }
};
