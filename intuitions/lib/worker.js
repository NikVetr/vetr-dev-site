// A Web Worker that runs the gallery's submit() off the page's thread, for the
// Monte Carlo that would otherwise freeze a page. Pages start it through
// lib/page.js's workerRunner(). It takes a request and posts back {response}, or
// {error} with IntuitionsError's JSON fields.

import { IntuitionsError, submit } from '../api.js';

self.addEventListener('message', (event) => {
  try {
    self.postMessage({ response: submit(/** @type {MessageEvent} */ (event).data) });
  } catch (error) {
    if (!(error instanceof IntuitionsError)) throw error;
    self.postMessage({ error: error.toJSON().error });
  }
});
