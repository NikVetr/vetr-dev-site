// The reference sheet's SheetSpec, shared by the dev scripts and the tests.
import { readFile } from 'node:fs/promises';

/** @returns {Promise<import('../core/types.js').SheetSpec>} */
export async function referenceSpec(target = 'zh-Hans', source = 'en', overrides = {}) {
  const presets = JSON.parse(await readFile('data/presets.json', 'utf8'));
  return {
    target,
    source,
    accent: `${source}-US`,
    romanization: 'pinyin',
    register: 'neutral',
    // Overridden by callers that know better; the app derives it from the
    // target language's first listed region.
    region: target === 'zh-Hans' ? 'CN' : '',
    fieldSet: ['script', 'roman', 'gloss', 'respell', 'numeral'],
    // faces: 0 in the preset means auto, which is what the app defaults to.
    geometry: { ...presets.geometry['card-7x5-4col'] },
    paper: {
      presetId: 'et8550-5x7-photo-bordered',
      borderless: false,
      oversprayPct: 0,
      nonprintablePt: 0,
      minRulePt: 0.2,
      minSizeDelta: 0,
    },
    themeId: 'latex-reference',
    inkMode: 'full',
    density: 0.7,
    arrangement: 'two-column',
    // 0 means fit: with faces on auto too, that resolves to the fewest pairs of
    // faces at the largest legible type -- the same answer the reference sheet
    // arrived at by hand.
    scale: 0,
    selection: { sections: {}, items: {} },
    ...overrides,
  };
}
