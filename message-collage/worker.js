// Runs the core off the page's main thread: submit() and the renderers, which read the fonts.
// The worker stays alive between requests, so the fonts it has read stay loaded.
// Messages in: { id, type: 'submit', request }, or { id, type: 'render', result, format } with
// format 'svg', 'svg-text' (selectable text, fonts embedded) or 'pdf'.
// Messages out: { id, type: 'progress', progress } after each layout tried, then
// { id, type: 'result', result, svg } (svg: the card with outlined text), { id, type: 'rendered', data }
// (a string, or bytes for PDF), or { id, type: 'error', error: { code, message, issues } }.
//
// The core is imported dynamically so this handler exists from the start: a message that arrived
// before a handler was set would be lost.

const core = import('./core/index.js');

self.onmessage = async (/** @type {MessageEvent} */ { data }) => {
  const { id } = data;
  try {
    const { loadFaces, renderPdf, renderSvg, submit } = await core;
    if (data.type === 'submit') {
      const result = await submit(data.request, { onProgress: (progress) => self.postMessage({ id, type: 'progress', progress }) });
      const faces = await loadFaces(result.request.fonts, result.request.styles);
      self.postMessage({ id, type: 'result', result, svg: renderSvg(result, faces) });
    } else {
      const { result, format } = data;
      const faces = await loadFaces(result.request.fonts, result.request.styles);
      const out = format === 'pdf' ? renderPdf(result, faces) : renderSvg(result, faces, { text: format === 'svg-text' ? 'embedded' : 'outlines' });
      self.postMessage({ id, type: 'rendered', data: out });
    }
  } catch (error) {
    // a CollageError carries its own JSON; anything else is a bug or a failed load
    const e = /** @type {any} */ (error);
    self.postMessage({ id, type: 'error', error: typeof e?.toJSON === 'function' ? e.toJSON().error : { code: 'internal_error', message: String(e?.message ?? e), issues: [] } });
  }
};
