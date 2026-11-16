export {};
declare global {
  interface Window {
    Stan2R: {
      submit: typeof import('./core/browser.js').submit;
      explore: typeof import('./core/explorer-browser.js').explore;
      analyze: typeof import('./core/explorer-browser.js').analyze;
      simulate: typeof import('./core/explorer-browser.js').simulateInBrowser;
      exportLatex: typeof import('./core/exports.js').exportLatex;
      exportPython: typeof import('./core/exports.js').exportPython;
      exportPyMC: typeof import('./core/pymc.js').exportPyMC;
    };
  }
}
