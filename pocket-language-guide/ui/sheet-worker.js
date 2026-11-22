// The worker runs the same sheet builder as the CLI. Reads go through the page
// so downloaded native files and the browser service worker keep their semantics.
import { createSheetContext, buildSheet } from '../core/sheet.js';

/** @param {'text'|'bytes'} kind @param {string} path */
function read(kind, path) {
  const channel = new MessageChannel();
  return new Promise((resolve, reject) => {
    channel.port1.onmessage = ({ data }) => {
      channel.port1.close();
      if (data.error) reject(Object.assign(new Error(data.error), { status: data.status }));
      else resolve(data.value);
    };
    /** @type {any} */ (self).postMessage({ kind, path }, [channel.port2]);
  });
}

/** @type {Promise<import('../core/sheet.js').SheetContext>} */ let context;
self.onmessage = async ({ data, ports }) => {
  const reply = ports[0];
  try {
    if (data.corpus) context = createSheetContext({
      corpus: data.corpus, loadText: path => read('text', path), loadBytes: path => read('bytes', path),
    });
    const result = await buildSheet(await context, data.spec, data.edits);
    reply.postMessage({ result });
  } catch (error) {
    reply.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally { reply.close(); }
};
