import { heldOutRatings } from './core.mjs';

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ rows: heldOutRatings(data.catalog, data.request) });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
