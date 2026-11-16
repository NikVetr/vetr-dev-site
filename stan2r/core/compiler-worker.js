importScripts('../vendor/stanc.js');
const compilerScope = /** @type {{stanc:import('./compilation.js').Compiler}} */ (/** @type {unknown} */ (self));
const compileStan = compilerScope.stanc;
/** @type {import('./compilation.js').Compiler|undefined} */
let legacyCompiler;
const helpers = import('./compilation.js');
self.onmessage = async ({ data }) => {
  try {
    const { compileCompatible } = await helpers;
    const result = compileCompatible(data.source, compileStan, () => {
      if (!legacyCompiler) { importScripts('../vendor/stanc-2.32.2.js'); legacyCompiler = compilerScope.stanc; }
      return legacyCompiler;
    });
    self.postMessage({ id: data.id, result });
  } catch (error) {
    const e = /** @type {Error & {code?:string}} */ (error);
    self.postMessage({ id: data.id, error: { code: e.code ?? 'COMPILER_ERROR', message: e.message } });
  }
};
