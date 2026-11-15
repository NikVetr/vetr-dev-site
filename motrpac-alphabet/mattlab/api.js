/* The browser and CLI share Cardinal Studio's geometry, project model and exporters. */
(/** @param {any} global Browser globals or Node's globalThis for the shared UMD modules. */ function (global) {
  'use strict';
  const Core = global.PainterCore || require('./core.js');
  const Model = global.PainterModel || require('./model.js');
  const Sheet = global.PainterSheet || require('./sheet.js');

  /** @param {{operation?:string, fills?:Record<string,string>, options?:object, entries?:object[], project?:object}|null} request */
  function submit(request) {
    try {
      if (!request || typeof request !== 'object' || Array.isArray(request)) {
        throw new Error('Provide a request object with an operation.');
      }
      switch (request.operation) {
        case 'svg': {
          if (!request.fills || typeof request.fills !== 'object' || Array.isArray(request.fills)) {
            throw new Error('SVG export requires a fills object keyed by face id.');
          }
          return {ok:true, svg:Core.svgString(request.fills, request.options)};
        }
        case 'sheet':
          return {ok:true, svg:Sheet.svgString(request.entries, request.options)};
        case 'validate':
          return {ok:true, project:Model.validateProject(request.project)};
        default:
          throw new Error('Unknown operation. Use svg, sheet or validate.');
      }
    } catch (error) {
      return {ok:false, error:{code:'INVALID_REQUEST', message:error instanceof Error ? error.message : String(error)}};
    }
  }
  const API = Object.freeze({submit:submit});
  global.MattlabPainter = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
