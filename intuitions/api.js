// The gallery's single entry point. Every page's window.Intuitions, cli.mjs and any
// script call submit(); nothing here touches the DOM. See api.md.

import * as correlationGeometry from './correlation-geometry/compute.js';
import * as dagAdjustment from './dag-adjustment/compute.js';
import { IntuitionsError, invalidRequest, isObject } from './lib/params.js';
import * as nullPvalues from './null-pvalues/compute.js';
import * as thresholdModel from './threshold-model/compute.js';
import * as typicalSet from './typical-set/compute.js';
import * as zscoreOutliers from './zscore-outliers/compute.js';

export { IntuitionsError };

/** Each entry: resolveParams(params) validates and fills defaults; compute(params) runs it. */
export const ENTRIES = Object.freeze({
  [zscoreOutliers.ENTRY]: zscoreOutliers,
  [thresholdModel.ENTRY]: thresholdModel,
  [correlationGeometry.ENTRY]: correlationGeometry,
  [typicalSet.ENTRY]: typicalSet,
  [dagAdjustment.ENTRY]: dagAdjustment,
  [nullPvalues.ENTRY]: nullPvalues,
});

const REQUEST_FIELDS = ['entry', 'params'];

/**
 * Runs one entry. Unknown entries and fields are rejected; every problem is listed
 * in one IntuitionsError. Same request, same result.
 * @param {unknown} request {entry, params}
 * @returns {{ entry: string, params: object, result: object }}
 */
export function submit(request) {
  if (!isObject(request)) throw invalidRequest([{ code: 'wrong_type', path: '', message: 'the request must be a JSON object {entry, params}' }]);
  /** @type {import('./lib/params.js').Issue[]} */
  const issues = [];
  for (const key of Object.keys(request)) {
    if (!REQUEST_FIELDS.includes(key)) issues.push({ code: 'unknown_field', path: key, message: `unknown field; the fields are ${REQUEST_FIELDS.join(', ')}` });
  }
  const names = Object.keys(ENTRIES);
  const { entry } = request;
  if (entry === undefined) {
    issues.push({ code: 'missing_field', path: 'entry', message: `is missing; the entries are ${names.join(', ')}` });
  } else if (typeof entry !== 'string' || !Object.hasOwn(ENTRIES, entry)) {
    issues.push({ code: 'unknown_entry', path: 'entry', message: `${JSON.stringify(entry)} is not an entry; the entries are ${names.join(', ')}` });
  }
  const module = typeof entry === 'string' && Object.hasOwn(ENTRIES, entry) ? ENTRIES[/** @type {keyof typeof ENTRIES} */ (entry)] : null;
  let params = null;
  if (module) {
    try {
      params = module.resolveParams(request.params ?? {});
    } catch (error) {
      if (!(error instanceof IntuitionsError)) throw error;
      issues.push(...error.issues);
    }
  }
  if (issues.length || !module || !params) throw invalidRequest(issues);
  return { entry: /** @type {string} */ (entry), params, result: module.compute(params) };
}
