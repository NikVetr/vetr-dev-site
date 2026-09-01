// Picking a language for a spec to point at, from the registry rather than by name.
//
// `tests/gallery.spec.js` needs one language that is translated and one that is
// not, to assert that the gallery is honest about the difference. Naming them was
// churn: the assertion was written against French, moved to Portuguese when French
// got a pack, and would have moved again -- each time failing for a reason that had
// nothing to do with what the test is about. Both ends now come from the same two
// files the app itself reads, and `hasContent` is imported rather than reimplemented
// so the threshold cannot drift between the app and its tests.

import { readFile } from 'node:fs/promises';
import { parseTable } from '../core/csv.js';
import { hasContent } from '../core/pack.js';

const languages = parseTable(await readFile('data/registry/languages.csv', 'utf8'), 'languages.csv');
const coverage = JSON.parse(await readFile('data/coverage.json', 'utf8'));

/** Languages the gallery will offer, in registry order. */
export const translated = languages.filter((l) => hasContent(coverage, l.bcp47));

/** Languages the gallery must show as "help translate". */
export const untranslated = languages.filter((l) => !hasContent(coverage, l.bcp47));

/**
 * The endonym of a language with a usable pack -- what the card and the picker
 * show. Defaults to the first, which is stable as long as the registry is ordered.
 * @param {number} [at]
 */
export function translatedEndonym(at = 0) {
  const lang = translated[at];
  if (!lang) throw new Error(`only ${translated.length} translated languages`);
  return lang.endonym;
}

/** The endonym of a language with no pack. Skip the spec if every language has one. */
export function untranslatedEndonym() {
  return untranslated[0]?.endonym;
}
