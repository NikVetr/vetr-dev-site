# Arabic IPA from the pack's own romanisation

Arabic's `ipa` column is graded D (`scripts/build_ipa.py`, the `GRADES` entry): espeak reads
unvowelled script and guesses the short vowels, so يوجد came back as the bare consonants
`jwdʒd` on twenty rows, تفضّل as `tfdˤdˤl`, and `REPAIR["ar"]` has grown one measured string
at a time. Every reader but the English one respells Arabic from that column, so the guesses
reach fifty-two readers.

The pack already writes every vowel: `romanization_ala-lc` is ALA-LC romanisation, authored
and corrected row by row (`ʿadad al-layālī`, `hal yūjad {} bi-al-qurb min hunā?`). Japanese,
Chinese and Korean already take their IPA from their romanisation (`hepburn_to_ipa`,
`pinyin_to_ipa`, `rr_to_ipa`); this brief is to give Arabic the same.

## What to build

1. **Read the column first.** Survey every Arabic cell that has a romanisation (the packs,
   `variants.csv`, and the `ar` rows of `data/registry/language-names.csv`) for the
   conventions it actually uses: long vowels, diphthongs, digraphs (*th dh kh sh gh*), the
   dotted emphatics, *ʾ* and *ʿ*, doubled letters for shadda, the article and its hyphen,
   prefixed prepositions (*bi-al-*, *li-*, *wa-*), tāʾ marbūṭah (*-ah* / *-at*), case endings
   if any, slots (`{}`, `{source}`), slashes and punctuation. Where a cell breaks ALA-LC or the
   column's own convention, that is a data error: correct the cell (provenance
   `arabic-ipa-v1`) rather than teaching the converter the mistake.
2. **A converter, `ala_lc_to_ipa`, beside the other romanisation routes**, deterministic and
   small, with what Arabic pronunciation needs that the spelling leaves out: the article's
   assimilation to a sun letter (*al-shams* /aʃ.ʃams/), the article's vowel elided after a
   prefix or a vowel (*bi-al-qurb* /bil.qurb/), hamzat al-waṣl, and stress. Take the stress
   rule from a source, cited in the code (Ryding's *Reference Grammar of Modern Standard
   Arabic*, or en.wikipedia *Arabic phonology* by revision): the pack's IPA marks stress on
   every word, as it does today. Keep the column's notation where espeak was already right
   (`ħ ʕ ʔ x ɣ q ʃ dʒ`, emphatics as `tˤ dˤ sˤ ðˤ`, length as `ː`) so the 52 reader tables
   keep reading it: `node scripts/respell_check.mjs <code> --gaps` must report nothing for
   every table in `data/respell/rules/index.json`.
3. **Route** the Arabic cells with a romanisation through it. Cells without one (country
   names have none; list the phrase rows that have none and say why) stay on espeak with
   `REPAIR["ar"]`; drop the repairs the converter makes unnecessary, and say which remain.
   Do not invent romanisations for country names in this pass.
4. **Grade** the new column in the `GRADES` entry, with what it gets right and what it does
   not, as the other entries do.

`python3 scripts/build_ipa.py --only ar` then `--check --only ar`; compare old and new cells
for every row and read at least a hundred of the changes against the romanisation; run
`python3 scripts/validate_data.py`, `node scripts/check_all.mjs` and
`node --test tests/*.test.mjs` (a golden layout file may move with a wider IPA cell; say
which, and regenerate it only if the move is the IPA's). If the repo's tests have a place for
the converter, add a few cases (sun letter, *bi-al-*, stress on a heavy penult and on a
superheavy final, a slot); otherwise say so.

## What to write

Notes go to `tmp/notes/agents/arabic-ipa.md`: the conventions found, every romanisation cell
corrected, the stress source, the cells that stay on espeak, counts of cells changed, and a
sample of old -> new.
