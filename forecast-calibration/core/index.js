// The tool's single entry point. The page, window.ForecastCalibration and cli.mjs
// all call submit(); nothing here touches the DOM.

import { analyze } from './analysis.js';
import { csvLine, normalizeRequest } from './input.js';

export { ForecastCalibrationError, DEFAULTS, parseTable, formatTable, parseProbability, issueLocation } from './input.js';
export { renderSvg } from './plot.js';

/**
 * Validates a request and runs the analysis. Same request (including seed), same result.
 * @param {unknown} request see api.md
 */
export function submit(request) {
  const { predictions, settings } = normalizeRequest(request);
  return analyze(predictions, settings);
}

/**
 * One CSV row per bin, for spreadsheets.
 * @param {ReturnType<typeof submit>} result
 */
export function binsCsv(result) {
  const header = ['bin', 'range_from', 'range_to', 'mean_probability', 'n', 'hits', 'frequency', 'interval_from', 'interval_to', 'position'];
  const rows = result.bins.map((bin) => [
    bin.label, ...bin.probabilityRange, bin.meanProbability, bin.n, bin.hits, bin.frequency, ...bin.interval, bin.position,
  ].map(String));
  return [header, ...rows].map(csvLine).join('\n') + '\n';
}
