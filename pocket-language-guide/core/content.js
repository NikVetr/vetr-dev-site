// The words of a card for a pair, without laying any of them out.
//
// Everything `buildSheet` in `core/sheet.js` does before it solves: both packs in the
// reader's own voice, the language slots filled, the respellings generated, the
// headings in the reader's language, and `buildBlocks`' decision about which rows
// exist. The quiz page needs exactly that and nothing after it -- no font loaded, no
// row measured, no layout searched for -- so it lives apart from `core/sheet.js`,
// which reaches fontkit through the measurer and the solver.

import {
  loadLanguage, loadRespellOverrides, loadRespellRules, loadSectionTitles, loadVariants,
  loadEmergencyLabels, fillLanguageSlots, buildBlocks,
} from './pack.js';
import { createRespeller } from './respell.js';
import { applyVariants, variantKey } from './speaker.js';

/**
 * Generated respellings, keyed `target__source__accent__voice`. Module scope rather
 * than per-context: it is a pure function of committed data and the reader's own
 * profile, so two contexts cannot disagree about it.
 *
 * The fourth part of the key is not decoration. A respelling is derived from the
 * target row's `ipa`, and a speaker variant replaces that row -- so the moment the
 * reader says they are speaking as a woman, the same pair has a different answer.
 * Keyed on three parts it returned the previous voice's respellings, which is the
 * quiet version of exactly the defect this feature exists to fix.
 * @type {Map<string, Record<string,string>>}
 */
const generated = new Map();

/**
 * What building the words needs: the corpus and a way to read a file.
 * @typedef {{corpus: Awaited<ReturnType<typeof import('./pack.js').loadCorpus>>,
 *   loadText: import('./pack.js').LoadText}} ContentContext
 */

/**
 * Respellings generated from the target's IPA and the reader's rule table.
 *
 * Cached on the triple because building a respeller reads the target's whole `ipa`
 * column to derive its phoneme inventory and its syllable-opening clusters, and
 * the studio re-solves on every change. Nothing here depends on the selection, so
 * one pass per pair is enough.
 * @param {ContentContext} ctx
 * @param {import('./types.js').SheetSpec} spec
 * @param {Record<string,Record<string,string>>} targetRows
 * @returns {Promise<Record<string,string>>}
 */
async function generatedRespellings(ctx, spec, targetRows) {
  const voice = variantKey(ctx.corpus.speakerAxes[spec.target] ?? [], spec.speaker ?? {});
  const key = `${spec.target}__${spec.source}__${spec.accent}__${voice ?? ''}`;
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
 * Both packs in the reader's own voice, or exactly the packs that were loaded.
 *
 * Nothing is fetched and nothing is copied when the reader has answered nothing, or
 * when neither language declares an axis — which is the common case, and the one
 * every committed pack thumbnail is rendered under.
 * @param {ContentContext} ctx
 * @param {import('./types.js').SheetSpec} spec
 * @param {Record<string,Record<string,string>>} targetRows
 * @param {Record<string,Record<string,string>>} sourceRows
 */
async function voiced(ctx, spec, targetRows, sourceRows) {
  const profile = spec.speaker;
  if (!profile || !Object.keys(profile).length) return [targetRows, sourceRows];
  const axes = ctx.corpus.speakerAxes;
  const keys = [spec.target, spec.source].map((code) => variantKey(axes[code] ?? [], profile));
  if (!keys[0] && !keys[1]) return [targetRows, sourceRows];
  const tables = await Promise.all([spec.target, spec.source].map((code, i) => (
    keys[i] ? loadVariants(ctx.loadText, code) : Promise.resolve({}))));
  return [
    applyVariants(targetRows, tables[0], keys[0]),
    applyVariants(sourceRows, tables[1], keys[1]),
  ];
}

/**
 * Join the corpus for a pair and decide its rows, as the card would print them.
 * @param {ContentContext} ctx
 * @param {import('./types.js').SheetSpec} spec
 * @param {import('./pack.js').SheetEdits} [edits]
 */
export async function buildContent(ctx, spec, edits) {
  const { corpus, loadText } = ctx;
  // Seven concepts name a language, and the name has to come from the pair rather
  // than from the row. Filled here, once, because five places downstream read these
  // cells -- and the one that would hurt is `solve/weights.js`, which *measures*
  // candidate rows to decide what fits, so an unfilled placeholder there makes the
  // balance solver offer a row of the wrong height.
  const [loadedTarget, loadedSource] = await Promise.all([
    loadLanguage(loadText, spec.target, corpus.groups),
    loadLanguage(loadText, spec.source, corpus.groups),
  ]);
  // **Whose voice the card is in, settled before anything is measured.** Every
  // sentence on a cheat sheet is the traveller's own, so if they have said they are
  // speaking as a woman then `Estoy perdido` is simply the wrong row — and the
  // respelling under it is wrong too, which is why a variant replaces the row rather
  // than the string. Both sides: the target is what they will say, the gloss is their
  // own language describing themselves, and both inflect. Applied here rather than at
  // draw time because the solver decides what fits by measuring these exact strings.
  const [targetRows, sourceRows] = await voiced(ctx, spec, loadedTarget, loadedSource);
  const pair = { target: spec.target, source: spec.source };
  fillLanguageSlots(targetRows, {
    ...pair, locale: spec.target, names: corpus.languageNames[spec.target],
  });
  fillLanguageSlots(sourceRows, {
    ...pair, locale: spec.source, names: corpus.languageNames[spec.source],
  });
  // A pair with no curated respellings is the normal case, not a failure, so do
  // not ask the network for a file the index says was never written.
  const curated = corpus.respellOverrides.has(`${spec.target}__${spec.source}__${spec.accent}`)
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
  return { blocks, sectionTitles, emergencyLabels, targetRows, sourceRows, respell };
}
