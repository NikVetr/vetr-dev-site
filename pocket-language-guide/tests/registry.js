// Picking a language for a spec to point at, from the registry rather than by name.
//
// `tests/gallery.spec.js` needs one language that is translated and one that is
// not, to assert that the gallery is honest about the difference. Naming them was
// churn: the assertion was written against French, moved to Portuguese when French
// got a pack, and would have moved again -- each time failing for a reason that had
// nothing to do with what the test is about.
//
// Reading the untranslated one off the registry fixed that and introduced a worse
// problem: once every registered language had a pack the list was empty, and the
// assertion quietly became a skip. So the positive side is read from the registry
// and the negative side is *manufactured* -- `withoutPack` hands back a coverage
// report with one language hollowed out, which the spec serves to the page. Either
// way `hasContent` is imported rather than reimplemented, so the threshold cannot
// drift between the app and its tests.

import { readFile } from 'node:fs/promises';
import { parseTable } from '../core/csv.js';
import { hasContent } from '../core/pack.js';

const languages = parseTable(await readFile('data/registry/languages.csv', 'utf8'), 'languages.csv');
const coverage = JSON.parse(await readFile('data/coverage.json', 'utf8'));

/** Languages the gallery will offer, in registry order. */
export const translated = languages.filter((l) => hasContent(coverage, l.bcp47));

/**
 * The endonym of a language with a usable pack -- what the card and the picker show.
 * @param {string} [bcp47] defaults to the first translated language in the registry
 */
export function translatedEndonym(bcp47) {
  const lang = bcp47 ? translated.find((l) => l.bcp47 === bcp47) : translated[0];
  if (!lang) throw new Error(`${bcp47 ?? 'any'} is not a translated language`);
  return lang.endonym;
}

/**
 * A coverage report with one language emptied, for testing the "help translate"
 * state. Every registered language has a pack now, so the state cannot be reached
 * from real data -- and reading it off the registry turned the assertion into a
 * skip, which leaves the code path untested rather than known-good.
 * @param {string} bcp47 the language to hollow out; must be one that has a pack
 */
export function withoutPack(bcp47) {
  const lang = translated.find((l) => l.bcp47 === bcp47);
  if (!lang) throw new Error(`${bcp47} has no pack to take away`);
  return {
    code: bcp47,
    endonym: lang.endonym,
    coverage: { ...coverage, languages: { ...coverage.languages, [bcp47]: 0 } },
  };
}
