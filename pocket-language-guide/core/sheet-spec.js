import { DEFAULT_PADDING, defaultFieldSet, defaultSelection, paperSpec } from './pack.js';

export const THEME_IDS = ['latex-reference', 'cvd-safe', 'dark', 'parchment'];

/**
 * Which accent a reader's respellings are keyed on.
 *
 * This was `${source}-US`, which is right for exactly one of the seventeen
 * languages. An accent is a fact about the reading language -- Spanish
 * respellings are `es-419` and Korean's are `ko-KR` -- and it is half of the key
 * that finds both the curated sheet and the rule table, so a concatenated guess
 * meant a table could ship and never load.
 * @param {{languages: Record<string, Record<string,string>>}} corpus
 * @param {string} source
 */
export function accentFor(corpus, source) {
  return corpus.languages[source]?.default_accent || `${source}-US`;
}

/**
 * A sheet spec with everything resolved. `scale: 0` means auto-fit.
 * @param {{corpus: Awaited<ReturnType<typeof import('./pack.js').loadCorpus>>}} ctx  only
 *   the corpus is read, so the quiz page, which loads nothing else, can make one too
 * @param {any} presets
 * @param {{target:string, source:string, geometry?:string, paper?:string, region?:string}} choice
 * @returns {import('./types.js').SheetSpec}
 */
export function makeSheetSpec(ctx, presets, choice, speaker = {}) {
  const geometryId = choice.geometry ?? 'card-7x5-4col';
  const geometry = presets.geometry[geometryId];
  if (!geometry) throw new Error(`no geometry preset "${geometryId}"`);
  const paperId = choice.paper ?? 'et8550-5x7-photo-bordered';

  const target = ctx.corpus.languages[choice.target];
  const romanization = (target.romanizations || '').split(';').filter(Boolean)[0] ?? '';
  // The first region listed for a language is the one it is most associated with,
  // which is the right default for someone visiting.
  const region = choice.region ?? (target.regions || '').split(';').filter(Boolean)[0] ?? '';

  return {
    target: choice.target,
    source: choice.source,
    accent: accentFor(ctx.corpus, choice.source),
    romanization,
    register: 'neutral',
    // **Whose voice the card is in.** Read here, so every entry point gets it: the
    // quick page, the studio and the pre-render script all build their spec through
    // this one function, and a card exported in one voice and reprinted in another
    // would be a silent change to the words. Empty for every reader who has not
    // answered, which is what the corpus has always printed.
    speaker,
    region,
    fieldSet: defaultFieldSet(target),
    geometry: { ...geometry },
    paper: paperSpec(ctx.corpus, paperId),
    themeId: 'latex-reference',
    typeface: 'sans',
    inkMode: 'full',
    autoFaces: true,
    padding: DEFAULT_PADDING,
    arrangement: 'mixed',
    // The band is off, and the folio is already ticked inside it -- so choosing
    // Header or Footer prints a page number without hunting for one.
    //
    // Off rather than on, and measured rather than assumed. The band costs 1.5 lines
    // of the smallest type on the sheet, and the fit search pays for that: the type
    // scale drops about 0.05 on most pairs, and `es <- en` takes a *whole extra pair
    // of faces* -- one more sheet of photo paper per card set, for a page number.
    // Worse, it pushed the Devanagari, Arabic and Thai respellings under their own
    // 5.4pt legibility floor, which `tests/solve.test.mjs` asserts as a safety
    // property. A folio is not worth either of those by default.
    // Both bands off. What a band says when it is switched on lives in
    // `headControl`'s own seed now, rather than in an `at: 'none'` band that
    // held slots it was not printing.
    scale: 0,
    priority: 0,
    selection: defaultSelection(ctx.corpus),
  };
}
