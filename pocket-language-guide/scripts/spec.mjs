// The reference sheet's SheetSpec, shared by the dev scripts and the tests.
import { readFile } from 'node:fs/promises';
import { parseTable } from '../core/csv.js';
import { DEFAULT_PADDING, defaultSelection, paperSpec } from '../core/pack.js';

/** @returns {Promise<import('../core/types.js').SheetSpec>} */
export async function referenceSpec(target = 'zh-Hans', source = 'en', overrides = {}) {
  const presets = JSON.parse(await readFile('data/presets.json', 'utf8'));
  const languages = parseTable(await readFile('data/registry/languages.csv', 'utf8'));
  const sections = parseTable(await readFile('data/registry/sections.csv', 'utf8'));
  const paperRows = parseTable(await readFile('data/registry/paper.csv', 'utf8'));
  const paper = Object.fromEntries(paperRows.map((r) => [r.preset_id, r]));
  const lang = languages.find((l) => l.bcp47 === target);
  if (!lang) throw new Error(`unknown language ${target}`);
  return {
    target,
    source,
    accent: `${source}-US`,
    // Derived, not hardcoded: pinning this to Pinyin silently dropped Hepburn from
    // every Japanese sheet.
    romanization: (lang.romanizations || '').split(';').filter(Boolean)[0] ?? '',
    register: 'neutral',
    // The country a language is most associated with, which is where its local
    // emergency numbers come from.
    region: (lang.regions || '').split(';').filter(Boolean)[0] ?? '',
    fieldSet: ['script', 'roman', 'gloss', 'respell', 'numeral'],
    // faces: 0 in the preset means auto, which is what the app defaults to.
    geometry: { ...presets.geometry['card-7x5-4col'] },
    // From the registry, not written out here: the zeros this used to carry meant
    // the committed thumbnails ignored the printer's non-printable margin that the
    // app respects, so the gallery showed a sheet nobody would get.
    paper: paperSpec({ paper }, 'et8550-5x7-photo-bordered'),
    themeId: 'latex-reference',
    typeface: 'sans',
    inkMode: 'full',
    autoFaces: true,
    padding: DEFAULT_PADDING,
    arrangement: 'two-column',
    // 0 means fit: with faces on auto too, that resolves to the fewest pairs of
    // faces at the largest legible type -- the same answer the reference sheet
    // arrived at by hand.
    scale: 0,
    // Every concept the sections below allow. Trimming the corpus by importance is
    // for fitting a card the content will not fit -- one phone face, above all --
    // and the reference sheet is not that card.
    priority: 0,
    // Sections marked `default_on: 0` start off, so the default sheet stays the
    // size the reference sheets were rather than growing with the corpus.
    selection: defaultSelection({ sections }),
    ...overrides,
  };
}
