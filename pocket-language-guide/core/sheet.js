// One-call assembly of everything a sheet needs.
//
// The browser, the pre-render script and the tests all need the same wiring --
// corpus, fonts, measurer, theme, join, solve -- so it lives here rather than
// being repeated at each entry point. The only environment-specific parts are the
// two loaders passed in.

import { createFontRegistry } from './fonts.js';
import { createMeasurer } from './measure.js';
import {
  loadCorpus, loadLanguage, loadRespellOverrides, loadRespellRules, loadSectionTitles,
  loadEmergencyLabels, fillLanguageSlots, buildBlocks,
} from './pack.js';
import { createRespeller } from './respell.js';
import { layout } from './solve/index.js';

/**
 * Generated respellings, keyed `target__source__accent`. Module scope rather than
 * per-context: it is a pure function of committed data, so two contexts cannot
 * disagree about it.
 * @type {Map<string, Record<string,string>>}
 */
const generated = new Map();

/**
 * @typedef {Object} SheetContext
 * @property {Awaited<ReturnType<typeof loadCorpus>>} corpus
 * @property {ReturnType<typeof createFontRegistry>} registry
 * @property {ReturnType<typeof createMeasurer>} measurer
 * @property {(id:string)=>Promise<any>} theme
 * @property {import('./pack.js').LoadText} loadText
 */

/**
 * @param {Object} io
 * @param {import('./pack.js').LoadText} io.loadText
 * @param {(relPath:string)=>Promise<Uint8Array>} io.loadBytes
 * @returns {Promise<SheetContext>}
 */
export async function createSheetContext({ loadText, loadBytes }) {
  const corpus = await loadCorpus(loadText);
  const manifest = JSON.parse(await loadText('data/fonts/manifest.json'));
  const registry = createFontRegistry((file) => loadBytes(`data/fonts/${file}`), manifest);
  const measurer = createMeasurer(registry);
  /** @type {Map<string,any>} */ const themes = new Map();

  // A theme may name a `base` it inherits from, which is how the CVD-safe palette
  // is only a palette. It used to be a full copy of the reference theme with
  // different colours -- so every type size existed twice, and the first edit to
  // one of them left the two sheets set differently.
  /** @param {string} id @returns {Promise<any>} */
  const theme = async (id) => {
    if (!themes.has(id)) {
      const own = JSON.parse(await loadText(`data/themes/${id}.json`));
      themes.set(id, own.base ? { ...await theme(own.base), ...own } : own);
    }
    return themes.get(id);
  };

  return {
    corpus,
    registry,
    measurer,
    loadText,
    theme,
  };
}

/**
 * Font stacks a language pair needs, including the Latin one romanisation uses and
 * the serif variants if a serif sheet was asked for.
 * @param {SheetContext['corpus']} corpus @param {string} target @param {string} source
 * @param {'sans'|'serif'} [typeface]
 */
export function stacksFor(corpus, target, source, typeface = 'sans') {
  const of = (/** @type {string} */ code) => {
    const lang = corpus.languages[code];
    if (!lang) throw new Error(`unknown language ${code}`);
    return corpus.scripts[lang.script].font_stack;
  };
  // latin-cond always travels with latin: the table templates ask for it.
  const base = [...new Set(['latin', 'latin-cond', of(target), of(source)])];
  if (typeface === 'sans') return base;
  return [...new Set([...base, ...base.map((stack) => `${stack}-${typeface}`)])];
}

/**
 * Respellings generated from the target's IPA and the reader's rule table.
 *
 * Cached on the triple because building a respeller reads the target's whole `ipa`
 * column to derive its phoneme inventory and its syllable-opening clusters, and
 * the studio re-solves on every change. Nothing here depends on the selection, so
 * one pass per pair is enough.
 * @param {SheetContext} ctx
 * @param {import('./types.js').SheetSpec} spec
 * @param {Record<string,Record<string,string>>} targetRows
 * @returns {Promise<Record<string,string>>}
 */
async function generatedRespellings(ctx, spec, targetRows) {
  const key = `${spec.target}__${spec.source}__${spec.accent}`;
  const held = generated.get(key);
  if (held) return held;
  // A reader whose language has no rule table gets nothing, which is the state of
  // sixteen of the seventeen today and is not a failure.
  if (!ctx.corpus.respellRules.has(`${spec.source}__${spec.accent}`)) return {};

  const rules = await loadRespellRules(ctx.loadText, spec.source, spec.accent);
  const ipaByConcept = Object.entries(targetRows)
    .map(([id, row]) => /** @type {[string, string]} */ ([id, (row.ipa ?? '').trim()]))
    .filter(([, ipa]) => ipa);
  const respeller = createRespeller({
    rules, target: spec.target, targetIpa: ipaByConcept.map(([, ipa]) => ipa),
  });
  /** @type {Record<string,string>} */ const out = {};
  for (const [id, ipa] of ipaByConcept) {
    const said = respeller.respell(ipa);
    if (said) out[id] = said;
  }
  generated.set(key, out);
  return out;
}

/**
 * Load the fonts a pair needs. Split from solving so the studio can show a
 * loading state, and so a gallery page never pays for a CJK face it will not use.
 * @param {SheetContext} ctx @param {string} target @param {string} source
 * @param {'sans'|'serif'} [typeface]
 */
export async function loadFontsFor(ctx, target, source, typeface = 'sans') {
  const files = ctx.registry.filesFor(stacksFor(ctx.corpus, target, source, typeface));
  await ctx.registry.load(files.map((file) => {
    const parts = /^(.*)-(\d+)(i?)$/.exec(file);
    if (!parts) throw new Error(`unparsable face id ${file}`);
    return { stack: parts[1], weight: Number(parts[2]), italic: parts[3] === 'i' };
  }));
  return files;
}

/**
 * A theme with the reader's own colours laid over it.
 *
 * Colour is the section-coding mechanism here, so it is the one part of a theme
 * worth letting someone drive directly -- and it is also the only part that can be
 * changed without re-measuring anything, since a hue has no width. Everything else
 * in a theme is typography and stays where the theme put it.
 *
 * The cache in `ctx.theme` hands out one object per file, so this copies rather
 * than assigning into it.
 * @param {any} theme
 * @param {Record<string,string>} [colors]
 */
function withThemeColors(theme, colors) {
  if (!colors || !Object.keys(colors).length) return theme;
  const roles = { ...theme.colors.roles };
  const flat = { ...theme.colors };
  for (const [key, value] of Object.entries(colors)) {
    if (key.startsWith('roles.')) roles[key.slice(6)] = value;
    else flat[key] = value;
  }
  return { ...theme, colors: { ...flat, roles } };
}

/**
 * Join the corpus for a pair and solve the sheet. Returns the intermediate pieces
 * too, because the studio needs the same rows for its content tree and must not
 * re-derive them -- and because forgetting to load the fonts first is exactly the
 * kind of mistake a single entry point prevents.
 * @param {SheetContext} ctx
 * @param {import('./types.js').SheetSpec} spec
 * @param {import('./pack.js').SheetEdits} [edits]
 */
export async function buildSheet(ctx, spec, edits) {
  const { corpus, measurer, registry, loadText } = ctx;
  await loadFontsFor(ctx, spec.target, spec.source, spec.typeface ?? 'sans');
  const theme = withThemeColors(await ctx.theme(spec.themeId), spec.themeColors);
  // Seven concepts name a language, and the name has to come from the pair rather
  // than from the row. Filled here, once, because five places downstream read these
  // cells -- and the one that would hurt is `solve/weights.js`, which *measures*
  // candidate rows to decide what fits, so an unfilled placeholder there makes the
  // balance solver offer a row of the wrong height.
  const [targetRows, sourceRows] = await Promise.all([
    loadLanguage(loadText, spec.target, corpus.groups),
    loadLanguage(loadText, spec.source, corpus.groups),
  ]);
  const pair = { target: spec.target, source: spec.source };
  fillLanguageSlots(targetRows, {
    ...pair, locale: spec.target, names: corpus.languageNames[spec.target],
  });
  fillLanguageSlots(sourceRows, {
    ...pair, locale: spec.source, names: corpus.languageNames[spec.source],
  });
  // A pair with no curated respellings is the normal case, not a failure, so do
  // not ask the network for a file the index says was never written.
  const curated = ctx.corpus.respellOverrides.has(`${spec.target}__${spec.source}__${spec.accent}`)
    ? await loadRespellOverrides(loadText, spec.target, spec.source, spec.accent)
    : {};
  // Generated respellings fill in under the curated ones, never over them. Only 16
  // of the 272 pairs have a curated sheet, and the other 256 printed an empty
  // column; a rule table for the *reader* plus the target's own `ipa` column
  // covers the rest. The curated layer stays authoritative because the sixteen
  // sheets are not mutually consistent, so no deterministic function can match all
  // of them -- see `core/respell.js`.
  const respell = { ...await generatedRespellings(ctx, spec, targetRows), ...curated };
  // Headings are read by the source-language reader, so they follow the gloss. So
  // does the emergency note's frame and its service words -- "110 police" was
  // printing in English on every one of the 225 pairs not glossed into it.
  const [sectionTitles, emergencyLabels] = await Promise.all([
    loadSectionTitles(loadText, spec.source),
    loadEmergencyLabels(loadText, spec.source),
  ]);
  const blocks = buildBlocks({
    corpus, targetRows, sourceRows, respell, spec, edits, sectionTitles, emergencyLabels,
  });
  return {
    blocks,
    theme,
    sectionTitles,
    targetRows,
    sourceRows,
    respell,
    plan: layout({ blocks, theme, spec, corpus, measurer, registry }),
  };
}
