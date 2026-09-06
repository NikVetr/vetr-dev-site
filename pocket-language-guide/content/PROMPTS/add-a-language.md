# Adding a language

The procedure, and every trap the first twenty-three additions paid for. Read
`summary.md` first — this file is the checklist, not the reasoning.

A language is **one directory plus a handful of registry rows**. The corpus joins on
`concept_id`, so adding the twenty-fourth language makes forty-six new ordered pairs
work at once and requires no per-pair anything. That is the whole architecture; if you
find yourself writing something per-pair, stop and ask.

## What "done" means

`npm run validate` at **0 errors**, and every one of these current:

```bash
npx tsc -p jsconfig.json                     # types
npm run test:unit                            # solver, measurement, packs
node --test tests/fonts.test.mjs              # every emitted glyph is in a shipped face
npm run i18n                                  # interface catalogue coverage
python3 scripts/build_ipa.py --check          # the ipa column
node scripts/respell_check.mjs <code> --gaps  # your reader table
node scripts/respell_check.mjs <every other reader> --gaps   # you are a new *target*
```

The last one is the one people forget. **A new language is a new target for every
existing reader table**, so their respellings grow characters that may have no rule
and no glyph. All readers are at zero gaps and must stay there.

**Do not run** `npm run shell`, `npm run respell:charset`, `python3
scripts/subset_fonts.py` or `npm run prerender` as a settling step. Run them to *test*,
then report which you left dirty; the coordinating session settles them once for all
concurrent work.

## Order of operations

**Concepts before registry.** `data/registry/sections.csv` naming a section whose
`data/concepts/<group>.csv` does not exist makes `loadCorpus` throw `ENOENT`, which
breaks `npm run validate`, every test, and the app — for you and for every agent
working beside you. The same applies in reverse to your own pack: a registry row is a
promise the file exists.

1. `python3 scripts/make_todo.py <code>` for the work list. **It omits the `note`
   rows**: it filters on `applies_to`, which is right for a target row and wrong for a
   note, whose scope names the language it is *about*. Handle the notes explicitly or
   the validator will name them the moment you finish.
2. `data/lang/<code>/*.csv` — `concept_id,text,text_alt,ipa,literal,confidence,provenance`.
3. The `ipa` column via `scripts/build_ipa.py`.
4. `data/respell/rules/<code>__<code>-<ACCENT>.json` — your reader table.
5. `data/i18n/<code>.json` — the interface.
6. `data/registry/section-titles/<code>.csv` and `emergency-labels/<code>.csv`.
7. Registry rows: `languages.csv`, `scripts.csv` if the script is new, and
   `language-names.csv`.
8. `applies_to` sweep across `data/concepts/*.csv`.

## The corpus

**CRLF.** Every corpus CSV uses `\r\n`; `load_rows` in `build_ipa.py` splits on it. A
session once rewrote seven files with Unix endings and each became a single line.
`tests/pack.test.mjs` guards it. The *registry* is LF — `transliterate_native.py`'s
`build_registry` exists because of that difference.

**Provenance per row, naming a source.** A dictionary, a corpus study, a national
authority. Not a forum post, not "common knowledge".

**The safety gate is not advisory.** `validate_data.py` refuses `confidence` below 2
in the six safety-critical sections. A row you cannot source verbatim from an
authoritative source is **absent**, not guessed. Absent is a correct outcome and the
validator reports it honestly; invented is a defect that prints on a card someone is
holding in an emergency. Note that `confidence: 2` is the tier every pack claims and
means "sourced", *not* "a fluent speaker has read it" — do not describe your own work
as reviewed.

**Coverage below 100% is fine when it is a fact.** Klingon has no word for north or
south; Quenya has no interrogative for "where", which empties every "Where is X?"
concept. Record the reason in the pack's notes. What is not fine is a blank cell with
no explanation.

**No duplicate `concept_id` within your pack.** `loadLanguage` keeps the last row and
silently drops the rest. `validate_data.py` now catches this; it did not always.

## The IPA engine

`scripts/build_ipa.py` derives the `ipa` column. Two routes exist and the choice is
forced by what is available:

- **espeak**, where a voice exists for your language. Check first; the build has a
  fixed voice list. Add a `GRADE[<code>]` entry saying honestly how good the
  derivation is and where it is weak — the existing grades run A to D and the reasons
  are recorded beside them.
- **A romanisation route**, where no voice exists. Hebrew, Klingon and Quenya read
  their `romanization_*` column letter by letter. `ROMANISED` and `NON_LATIN` are the
  tables to add to.

Traps that have cost real time:

- **`clean()` drops `Cf` characters**, which silently ate U+200C and turned Persian
  `بچه‌ام` into `بچهام`. Wrong on 195 rows including one in `lost-rescue`. Check what
  your script needs to survive.
- **A new IPA symbol costs every other reader a rule.** Klingon's `/t͡ɬ/` is written
  `tɬ`, `phonemesOf` splits it into `t` + `ɬ`, and `ɬ` was the corpus's first lateral
  fricative — so all nineteen existing tables printed a bare IPA letter on 28 cells.
  Prefer a repair that adds no new symbol; Persian's `q1` → `q` was chosen for exactly
  that reason.
- **Stress is only worth deriving if the rule is mechanical.** Hungarian's is
  positional and is derived; Persian's runs in opposite directions for nominals and
  verbs and is not written at all.

## Your reader table

The table says how **your** reader spells the other languages' IPA in their own
orthography. That is what makes the respelling column O(N) rather than O(N²).

- `content/RESPELL-SYSTEMS.md` records which published pronunciation key each existing
  table derives from. Find one for your language or state plainly what you adapted and
  how.
- **Read its real output before believing it.** `node scripts/respell_check.mjs <code>
  <target>` prints actual rows. Zero gaps means every symbol had a rule, not that the
  result is any good.
- **A device the engine cannot carry is a silent no-op.** `stress: caps` on a caseless
  script does nothing; `VOWEL_LETTERS`/`ACCENTED` list no Private Use Area, so a
  conscript's diacritic devices are dead. Say so rather than configuring them.
- The `legend` field is the one-line key printed in the furniture band. It must be in
  *your* language: Thai's shipped as English prose about the legend for a while.

## Fonts and scripts

- `data/registry/scripts.csv`: `direction`, `needs_shaping`, `leading_factor`,
  `min_size_pt`, `word_break`, `font_stack`. **Measure the leading and the floor**,
  don't copy a neighbour's. Hebrew's 1.20 came from positioned ink over real rows;
  Persian reuses `Arab` because its letters span *less* than Arabic's, measured over
  all four positional forms; tengwar's 1.30 came from the tehtar's own extents.
- Check whether your script already has a stack before adding one. Persian's four
  extra letters `پ چ ژ گ` were already in the `arabic` subset, and the build proved it
  by coming back byte-identical.
- `scripts/subset_fonts.py` needs your code in `ALL_LANGS`.
- **Only OFL faces**, and if you graft glyphs from a second donor, `add_copyright`
  must carry its notice — the licence asks for it and a font carries its own.
- **`check_drawable` is fatal on a note.** A note quoting your script on a sheet whose
  reader uses another will be a box; the Japanese register note names its mechanism
  and quotes no kana for that reason.

## The registry

**`languages.csv`, `scripts.csv` and `language-names.csv` are shared with every other
agent working at the same time.** Do not edit them in the middle of your work. Write
your intended rows to `tmp/registry-<code>.md` as literal CSV lines and let the
coordinating session apply them — that removes the conflict rather than racing on it.

`language-names.csv` is N² and grows by `2N-1` rows per language: what every existing
language calls yours, and what yours calls each of them. `core/pack.js`'s
`languageNameTable` explains the rule — carry **only** what `Intl.DisplayNames` gets
wrong for our purposes, which is the prepositional case where a language needs one and
the romanisation for the romanised packs, which ICU cannot give at all.

`emergency-labels/<code>.csv`'s `_frame` is the interpolation trap. **Every one of the
first twenty-two languages rejected a naive preposition**; Hebrew was the first to
take one, because its preposition's vowel is not written, and Persian the second, for
a different reason. Read that discussion in `summary.md` before writing yours.

**`applies_to` has to be widened when your language joins an existing scope.** The
seventeenth language shipped without the euro because `numbers-money.euro` was scoped
`de;fr;es;pt` and nobody added `it`. Read the scopes against the countries
`regions.csv` gives your language; currency is the obvious one and rarely the only
one.

## House style

JSDoc types on anything typed. Comments that explain *why*, and that record what was
measured and what was rejected — the reasoning is the asset, not the result. Match the
voice of the file you are editing. No speculative abstraction, no guards for cases that
cannot arise.

## Reporting

Say what you decided and why, what you rejected, your coverage number and what
explains the gap, the state of every verification command, which generated files you
left dirty, and which rows a fluent speaker should read first. Report honestly:
a refused row with a reason is worth more than a filled one without a source.

## The roadmap to fifty

Twenty-three are in: `ar de el en es fa fr he hi hu id it ja ko pt ru sw th tr vi
zh-Hans` plus `tlh qya`. Twenty-seven to go, chosen on three things at once — speaker
count, whether a traveller actually goes there, and whether the script makes the engine
prove something it has not proved yet. The third matters more than it looks: every new
script is a leading measurement, a word-break decision and a font stack, and those are
where the defects have been.

Ordered into batches that share infrastructure, so two agents adding Indic languages
are not each discovering the same font question. **One agent per language**; the batch
is only a grouping.

| batch | languages | what it proves |
|---|---|---|
| 1 | `bn` Bengali, `ur` Urdu, `pl` Polish | first new script since Hebrew; Arabic-stack reuse a second time; a plain Latin control |
| 2 | `ta` Tamil, `te` Telugu, `mr` Marathi | three Indic scripts, two of them new, one reusing Devanagari |
| 3 | `uk` Ukrainian, `nl` Dutch, `ro` Romanian | Cyrillic reuse and two Latin, all with espeak voices |
| 4 | `my` Burmese, `km` Khmer, `lo` Lao | the hard batch: complex stacking, and `word_break: dict` for the second and third time |
| 5 | `fil` Filipino, `ms` Malay, `zh-Hant` Traditional Chinese | two Latin; the first script that is a *variant* of one already shipped |
| 6 | `am` Amharic, `ka` Georgian, `hy` Armenian | three scripts nothing else in the corpus resembles |
| 7 | `pa` Punjabi, `gu` Gujarati, `si` Sinhala | Brahmic breadth |
| 8 | `kn` Kannada, `ml` Malayalam, `ne` Nepali | completes the Indic set |
| 9 | `cs` Czech, `sv` Swedish, `fi` Finnish | European Latin, and Finnish's agglutination is Hungarian's problem again |

Three known questions the roadmap will force, worth thinking about before the batch
that hits them rather than during it:

- **Urdu is Nastaliq**, which is a *style* rather than a script — ISO 15924's `Aran`.
  Noto Nastaliq is a separate face from Noto Sans Arabic and its leading is far larger.
  Whether Urdu reuses `Arab` at Naskh or earns a stack is the first real question of
  batch 1.
- **`zh-Hant` is a variant, not a new script**, and the corpus already carries
  Traditional forms in `zh-Hans`'s `text_alt`. Whether it is a language or a
  presentation of one is a design decision, not a translation job.
- **Khmer and Lao join Thai in needing dictionary word-breaking**, and Thai is
  currently the only `word_break: dict` language. Whatever that mechanism actually
  does should be read before two more languages depend on it.
