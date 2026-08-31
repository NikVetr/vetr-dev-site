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
    fieldSet: ['script', 'roman', 'gloss', 'respell', 'numeral'],
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
    scale: 1,
    selection: { sections: {}, items: {} },
    ...overrides,
  };
}
