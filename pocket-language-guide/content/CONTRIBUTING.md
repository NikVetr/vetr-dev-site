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
Mandarin serve every English reader.

**The syllable separator is per reading language, not a hyphen everywhere.** For an
English reader a hyphen is both conventional and useful, since the engine treats it
as a line-break opportunity. But Arabic does not hyphenate at all and a hyphen
breaks the cursive join; Indonesian's hyphen means *spell this out letter by
letter*, so `n-i-h-a-o` reads as an instruction rather than a word, and KBBI uses a
dot instead; and a Swahili respelling may hyphenate but never lead with one. So the
separator is a `policy` field of the reading language's rule table
(`data/respell/rules/<source>__<accent>.json`), and a curated sheet should use
whatever that language's own table declares.

## Writing a rule table

A curated sheet is written per *pair*, so it is O(N²) and only sixteen of the 272
pairs have one. A rule table is written per *reader*, and turns on sixteen pairs at
once. `content/RESPELL-SYSTEMS.md` surveys what to derive each one from: six
languages have a published, sound-keyed key to borrow, four have a tradition to
re-key, and seven have to be invented. Start there, not from a blank file.

**A rule table is a borrowed key plus named departures from it.** Every standard
worth borrowing needs overruling somewhere, and always for the same reason: the
standard produces a *permanent* spelling and we produce a disposable hint. So
`derives_from` names the key and `deviations` lists `{rule, why}` for each
departure, and `scripts/validate_data.py` requires both. That list is also the
answer to "why does our Korean not match the official transcription", which is a
question a reader will eventually ask.

`policy` holds the reader's typographic conventions, not the target's:

| field | values | notes |
|---|---|---|
| `syllable_separator` | any string | see the table above; not a hyphen everywhere |
| `word_separator` | any string | |
| `stress` | `caps` `acute` `prime` `none` | `caps` for a Latin script with no native mark, `acute` where one exists (Spanish, Italian, Portuguese, Russian), `prime` for caseless Devanagari |
| `stress_min_syllables` | integer | a monosyllable that shouts has stopped saying anything |
| `length` | `none` `double` `colon` | `double` doubles a Latin vowel; Turkish takes the colon, since a doubled vowel there reads as two syllables. A non-Latin script writes length in the `phonemes` table instead, by giving `oː` its own rule |
| `tone` | `keep` `drop` | `zh-Hans`, `th` and `vi` carry Chao tone letters, because tone is lexical there |
| `max_onset` | 1, 2, 3 | onset maximisation is a claim about the *reader*. The TDK prescribes `prog-ram` over `pro-gram` for exactly the Western vocabulary this corpus is full of |
| `locale` | BCP-47 | so uppercasing Turkish `i` gives `İ` |

**Whether to mark stress at all is a fact about the target, and it is already in the
data.** The four languages whose curated sheets never capitalise -- `ja ko zh-Hans
vi`, plus `th` -- are exactly the ones whose `ipa` column carries no `ˈ`, so no
stress can be marked on them whatever the policy says. A table only chooses the
device.

`phonemes` is the table proper: `{slot, ipa, out}` plus conditions, where `slot` is
`onset`, `nucleus`, `coda` or `any`. **Longest `ipa` wins**, sorted by the engine,
so file order is irrelevant -- and getting that wrong silently spells /tɕʰ/ as /t/.

The two conditions worth understanding before writing anything are `if_inventory`
and `unless_inventory`, which ask about the *target's* phoneme inventory rather
than about the symbol in hand. That is what lets one table spell Spanish /p t k/ as
`p t k` and Mandarin's as `b d g`: a language that contrasts /p/ with /pʰ/ has no
voiced stop for `b` to collide with. Prefer them to a `targets` block, which is the
escape hatch for the few rules that cannot be put typologically.

Then run it over real data:

```bash
node scripts/respell_check.mjs es            # ten rows per target, every target
node scripts/respell_check.mjs es zh-Hans    # every row of one target
node scripts/respell_check.mjs es --gaps     # every IPA symbol still reaching the page
node scripts/respell_check.mjs en --score    # agreement, where a curated sheet exists
npm run respell:charset                      # after any table changes, for the font build
```

`--gaps` is the completeness bar. An unmapped symbol passes through rather than
vanishing, so a gap in the table is an IPA character printed on the card -- and
where the reader's orthography genuinely has no letter for a sound, the answer is a
documented approximation, not a pass-through.

**`--score` only means something for an English reader.** All sixteen curated
sheets gloss into English, so that is the only table with a labelled test set. For
every other reader the obligations are faithfulness to the key, zero gaps, and
reading the output -- not a number.

## Reviewing

`confidence` is a claim about who checked a row, so only raise it if you are that
person. Lowering it is always fine. Note what you checked in `provenance`.
