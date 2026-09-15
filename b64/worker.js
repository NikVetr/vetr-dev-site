"use strict";
importScripts("decoder.js");
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, ...B64.transform(data.text, data.layers) });
  } catch {
    self.postMessage({ id: data.id, links: [], error: "Couldn’t read that message. Try pasting just the encoded part." });
  }
};
