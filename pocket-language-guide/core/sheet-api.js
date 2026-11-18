import { checkShape, plain, validEdits, validSpecSettings } from './import-validation.js';
import { makeSheetSpec, THEME_IDS } from './sheet-spec.js';
import { paperSpec } from './pack.js';
import { buildSheet } from './sheet.js';

/** @param {string} path @param {string} message @returns {never} */
function invalid(path, message) {
  throw Object.assign(new Error(message), { code: 'invalid_request', issues: [{ code: 'invalid_value', path, message }] });
}

/** @param {import('./sheet.js').SheetContext} ctx @param {unknown} request */
export async function generateSheet(ctx, request) {
  if (!plain(request)) invalid('', 'Expected a sheet request object.');
  const problems = /** @type {string[]} */ ([]);
  checkShape(request, 0, 'request', problems);
  if (problems.length) invalid('', problems.join(', '));
  for (const key of Object.keys(request)) {
    if (!['target', 'source', 'settings', 'edits'].includes(key)) invalid(key, 'Unknown request field.');
  }
  const { target, source, settings = {}, edits } = request;
  for (const [key, value] of Object.entries({ target, source })) {
    if (typeof value !== 'string' || !Object.hasOwn(ctx.corpus.languages, value)) invalid(key, 'Unknown registry language.');
  }
  if (!validSpecSettings(settings) || 'target' in settings || 'source' in settings) invalid('settings', 'Expected sheet settings; specify target and source at the top level.');
  if (settings.themeId !== undefined && !THEME_IDS.includes(settings.themeId)) invalid('settings.themeId', 'Unknown sheet theme.');
  if (edits !== undefined && !validEdits(edits)) invalid('edits', 'Invalid phrase edits.');
  const presets = JSON.parse(await ctx.loadText('data/presets.json'));
  const base = makeSheetSpec(ctx, presets, { target, source });
  const presetId = settings.paper?.presetId;
  if (presetId !== undefined && !Object.hasOwn(ctx.corpus.paper, presetId)) invalid('settings.paper.presetId', 'Unknown paper preset.');
  const paper = presetId === undefined ? base.paper : paperSpec(ctx.corpus, presetId);
  const spec = { ...base, ...settings,
    geometry: { ...base.geometry, ...settings.geometry },
    paper: { ...paper, ...settings.paper },
  };
  const { plan } = await buildSheet(ctx, spec, edits);
  if (!plan.faces.length) throw Object.assign(new Error('The requested content does not fit.'), { code: 'layout_failed', issues: plan.warnings });
  return { spec, plan };
}
