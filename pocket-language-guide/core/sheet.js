// One-call assembly of everything a sheet needs.
//
// The browser, the pre-render script and the tests all need the same wiring --
// corpus, fonts, measurer, theme, join, solve -- so it lives here rather than
// being repeated at each entry point. The only environment-specific parts are the
// two loaders passed in.

import { createFontRegistry } from './fonts.js';
import { createMeasurer } from './measure.js';
import {
  loadCorpus, loadLanguage, loadRespellOverrides, loadSectionTitles, buildBlocks,
} from './pack.js';
import { layout } from './solve/index.js';

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

  return {
    corpus,
    registry,
    measurer,
    loadText,
    async theme(id) {
      if (!themes.has(id)) themes.set(id, JSON.parse(await loadText(`data/themes/${id}.json`)));
      return themes.get(id);
    },
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
  const theme = await ctx.theme(spec.themeId);
  const targetRows = await loadLanguage(loadText, spec.target, corpus.groups);
  const sourceRows = await loadLanguage(loadText, spec.source, corpus.groups);
  // A pair with no curated respellings is the normal case, not a failure, so do
  // not ask the network for a file the index says was never written.
  const respell = ctx.corpus.respellOverrides.has(`${spec.target}__${spec.source}__${spec.accent}`)
    ? await loadRespellOverrides(loadText, spec.target, spec.source, spec.accent)
    : {};
  // Headings are read by the source-language reader, so they follow the gloss.
  const sectionTitles = await loadSectionTitles(loadText, spec.source);
  const blocks = buildBlocks({
    corpus, targetRows, sourceRows, respell, spec, edits, sectionTitles,
  });
  return {
    blocks,
    theme,
    targetRows,
    sourceRows,
    respell,
    plan: layout({ blocks, theme, spec, corpus, measurer, registry }),
  };
}
