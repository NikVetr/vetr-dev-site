# Contributing translations

The corpus is deliberately **O(N), not O(N²)**: an entry is not a language pair,
it is one language's realization of a language-independent concept. Adding a
language means adding one directory, and every pair involving it starts working.
There is no per-pair file to write and none to keep in sync.

## Adding a language

1. Add a row to `data/registry/languages.csv`. `script` must be an ISO 15924 code
   present in `data/registry/scripts.csv`; add the script there first if it is
   missing, with an honest `leading_factor` (the reference's tight 1.02 clips
   Devanagari, Thai and Arabic) and `min_size_pt`.
2. Create `data/lang/<bcp47>/<group>.csv` for each group in
   `data/registry/sections.csv`, with columns:
   `concept_id, text, text_alt, ipa, literal, confidence, provenance`
   plus a `romanization_<system>` column per system the language uses.
   - `text` is the phrase in this language. It is used as the target when someone
     is learning this language, and as the gloss when someone is reading it.
   - `confidence`: `0` machine, unreviewed · `1` cross-checked by a second model ·
     `2` reviewed by a fluent speaker · `3` from an authoritative source.
   - `provenance`: where the row came from, in a few words.
3. Set `status` to `draft` while coverage is partial. The gallery shows real
   coverage from `data/coverage.json` rather than the declared status, so a
   language with no rows never offers a button that would produce an empty sheet.
4. Run `npm run validate`, then `npm run prerender` if the language is complete.

## Safety-critical content

`emergency-medical`, `lost-rescue` and `dietary-needs` require
**`confidence >= 2`**, enforced by `scripts/validate_data.py`. A wrong allergy or
medical phrase can do real harm, so machine output is refused there outright
rather than shown with a caveat. If you are not a fluent speaker, leave those
sections empty; a missing section is safe, a wrong one is not.

## Register

Politeness is not decoration. Japanese keigo, the T–V distinction, Korean speech
levels: the wrong default is rude. Put the neutral-polite form in `text`, and
record variants with `register_variant` rather than picking one silently.

## Respellings

`data/respell/overrides/<target>__<source>__<accent>.csv` holds pronunciations
spelled the way a reader of the *source* language would say them. These are keyed
on the source language and accent, not on the pair, so `en-US` respellings of
Mandarin serve every English reader. Hyphens between syllables are both
conventional and useful: the engine treats them as line-break opportunities.

## Reviewing

`confidence` is a claim about who checked a row, so only raise it if you are that
person. Lowering it is always fine. Note what you checked in `provenance`.
