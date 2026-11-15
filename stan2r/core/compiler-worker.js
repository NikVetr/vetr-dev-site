importScripts('../vendor/stanc.js');
const compileStan = /** @type {{stanc:(name:string, source:string, flags:string[])=>unknown}} */ (/** @type {unknown} */ (self)).stanc;
self.onmessage = ({ data }) => {
  try { self.postMessage({ id: data.id, compilation: compileStan('model', data.source, ['debug-typed-ast']) }); }
  catch (error) { self.postMessage({ id: data.id, error: String(error) }); }
};
