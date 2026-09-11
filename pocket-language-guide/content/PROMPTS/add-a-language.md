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

**Your `LANGUAGE_MOTIFS` entry has to land in the same step as your registry row,
in both directions.** `tests/ornaments.test.mjs` asserts
`Object.keys(LANGUAGE_MOTIFS).sort()` deep-equals the list of `ready` languages, so a
motif for an unregistered language fails exactly as hard as a ready language with no
motif — the invariant is there to stop dead motifs accumulating. Czech added its
motif while its row was still staged, and the two failures read `unknown language cs`
from `scripts/spec.mjs`, which points at neither file. Stage the motif with the row.

**And do not put your language in `languages.csv` until its pack, its interface
catalogue, its section titles and its emergency labels all exist** — nor before
`regions.csv` defines every region the row names, which is a hard error rather than a
warning.** Dutch was
registered `ready` while `data/i18n/nl.json`, `section-titles/nl.csv` and
`emergency-labels/nl.csv` were still unwritten, and the effects were spread out and
confusing: `npm run validate` stayed at 0 errors, `npm run i18n` did not complain
either — it skips a language with no catalogue rather than failing it —
`tests/ornaments.test.mjs` went red on an unrelated-sounding assertion ("every ready
language has distinct rules and corners"), and the app itself would have failed to
load Dutch's interface at runtime. Three other agents then had to be told which red
test was not theirs. Stage the row and let the coordinating session apply it once the
files are real.

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

**A gloss sweep has to run *before* your ipa build, and this has now gone wrong four
times.** The sweep writes a row with an empty `ipa` cell, and `build_ipa.py` is what
fills it — so a sweep that lands *after* the build ships a currency that prints with
no pronunciation in every pack that is not its own. It happened to `koruna` in thirty
packs, and to `ringgit` and `krona` in thirty-three each, in the same session. Nothing
catches it: `validate_data.py` has no opinion on a blank `ipa`, `--gaps` has nothing to
report because no symbol reached the page, and `build_ipa.py --check` reads *current*
because the file on disk is what the last build produced. **The check is to look:**

```bash
grep -h '<your-concept-id>,' data/lang/*/numbers.csv | awk -F, '$5 == "" || $4 == ""'
```

The safe order is: add the concept, sweep the gloss into every pack, *then* build ipa
— and if you are filling only your own language, remember that the sweep touched
thirty-odd others whose ipa now needs a run too, split by library so `uk` and `mr` go
through `espeakng-loader` and nothing else does.

**The sweep also bites in the other direction — appending twice.** A new currency concept needs a gloss row in every other pack, and appending
that row twice is easy to do when the sweep is re-run after an interruption. Because
`loadLanguage` keeps the *last* row, the surviving copy is the second one, which is
the one written before `build_ipa.py` filled the `ipa` cell — so the pack silently
ships a row with no pronunciation while the good row is discarded. The Romanian `leu`
sweep did exactly this to the Telugu pack. **Read the file before appending to it**,
and re-run `python3 scripts/validate_data.py` at the very end rather than only after
your own pack is done, because another agent may have swept into your pack meanwhile.

## The IPA engine

`scripts/build_ipa.py` derives the `ipa` column. Two routes exist and the choice is
forced by what is available:

- **espeak**, where a voice exists for your language. Check first; the build has a
  fixed voice list. Add a `GRADE[<code>]` entry saying honestly how good the
  derivation is and where it is weak — the existing grades run A to D and the reasons
  are recorded beside them.

  **If your language needs `espeakng-loader`, scope it to `--only <your code>` and
  nothing else.** This machine's `espeak-ng-data` is Ubuntu's 1.50 and several voices
  (`uk`, `mr`) landed upstream later, so those packs are built against a newer library
  behind `PHONEMIZER_ESPEAK_LIBRARY` and `PHONEMIZER_ESPEAK_DATA_PATH`. Leaving those
  set across a wider `--only` list is not a rebuild, it is a different phonemiser:
  about 320 cells moved across twenty-four languages that way, German most legibly
  (`Fruehstueck` is frˈyːʃtʏk under the newer library and frˈyːʃtyk under 1.50).
  Neither `--check` nor `--gaps` can see it, because a re-derived column is internally
  consistent and is only wrong against the grade a reviewer gave it. What caught it was
  `tests/fonts.test.mjs`, two steps downstream: /ʏ/ has a rule in only five reader
  tables, so it fell through as a literal and six scripts were asked to draw a letter
  they do not have.
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

**`languages.csv`, `scripts.csv`, `regions.csv`, `romanizations.csv` and
`language-names.csv` are shared with every other agent working at the same time.** Do
not edit them in the middle of your work. Write your intended rows to
`tmp/registry-<code>.md` as literal CSV lines and let the coordinating session apply
them — that removes the conflict rather than racing on it.

The same holds for every other file more than one language touches:
`scripts/subset_fonts.py`, `data/respell/rules/index.json`, `core/ornament-designs.js`
and `data/concepts/*.csv`. If you do edit one, **edit it in place and append; never
regenerate it from a script that rewrites the whole file.** The twenty-seventh
addition wrote its registry rows directly while the twenty-eighth was staging its own,
and the only reason nothing was lost is that both appended rather than rebuilt. A
wholesale rewrite from a copy loaded minutes earlier silently drops the other agent's
work, and `npm run validate` will not notice, because the result is still a valid
file.

`language-names.csv` is N² and grows by `2N-1` rows per language: what every existing
language calls yours, and what yours calls each of them. `core/pack.js`'s
`languageNameTable` explains the rule — carry **only** what `Intl.DisplayNames` gets
wrong for our purposes, which is the prepositional case where a language needs one and
the romanisation for the romanised packs, which ICU cannot give at all.

`emergency-labels/<code>.csv`'s `_frame` is the interpolation trap. **Every one of the
first twenty-two languages rejected a naive preposition**; Hebrew was the first to
take one, because its preposition's vowel is not written, and Persian the second, for
a different reason. Read that discussion in `summary.md` before writing yours.

**Two corrections to advice this file used to give, both earned the hard way.**

`pgrep -f "[s]ubset_fonts.py"` was recommended here as the way to check whether a
subset run is in flight without the pattern matching your own shell. **It still
self-matches through the parent shell.** The check that actually works assembles the
pattern at run time in a separate file. The unbracketed form is worse still — an
agent deadlocked itself on it for an hour.

**`data/concepts/numbers.csv` and `social.csv` are LF where the other fourteen are
CRLF**, so a `\r\n` splitter fails *silently* on exactly those two. Five of one
addition's eight `applies_to` scopes needed a second pass because of it. Split on both.

**A `slot: onset` rule is not the fix for a mark that needs a preceding consonant.**
Czech's `r̝` arrives in the Indic tables as a subjoined `्र`, which needs something to
attach to, so a word-initial ř printed a dangling mark and the obvious repair looked
like an `onset`-slot rule emitting the independent letter. **Measure before doing it:**
across the Czech pack, `r̝` is word-initial 4 times and cluster-internal 96 times, and
the onset rule fires on both — so `pr̝es` came out `परेस` (pa-res) rather than
`प्रेस` (pres). It was reverted. Gujarati's table renders both correctly from a
three-rule set, and the mechanism is *not* simply the extra `coda` rule; whoever needs
this next should read `gu__gu-IN.json` against `hi__hi-IN.json` and find out why rather
than copying rule shapes.

**`applies_to` has to be widened when your language joins an existing scope.** The
seventeenth language shipped without the euro because `numbers-money.euro` was scoped
`de;fr;es;pt` and nobody added `it`. Read the scopes against the countries
`regions.csv` gives your language; currency is the obvious one and rarely the only
one. An Indian language has to be read against `rupee`, `rupee-symbol`, `lakh` and
`crore` too.

**And the mirror of it, which is the easier half to miss: a scope names the *target*,
so your pack still needs a gloss for every scoped concept it is not in.** Ukrainian
shipped with fifty-two of them empty — every foreign currency, the four Chinese
classifier rows, and the three tropical-disease rows — because the reasoning stopped
at "Ukraine is temperate and does not use the baht". True, and beside the point:
`pharmacy-symptoms.i-think-i-have-malaria` is scoped to the tropical countries *being
visited*, and a Ukrainian traveller in Thailand needs it exactly as much as a Polish
one does. The validator says so in as many words — "scoped to X but has no gloss in
`<you>`, so it prints on N of its M pairs" — so find your own code in that warning
block before calling the sweep done. `python3 scripts/validate_data.py 2>&1 | grep
'no gloss in.*<code>'` is the whole check.

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

Twenty-eight are in: `ar bn de el en es fa fr he hi hu id it ja ko pl pt ru sw ta th
tr uk ur vi zh-Hans` plus `tlh qya`. Twenty-two to go, chosen on three things at once — speaker
count, whether a traveller actually goes there, and whether the script makes the engine
prove something it has not proved yet. The third matters more than it looks: every new
script is a leading measurement, a word-break decision and a font stack, and those are
where the defects have been.

Ordered into batches that share infrastructure, so two agents adding Indic languages
are not each discovering the same font question. **One agent per language**; the batch
is only a grouping.

| batch | languages | what it proves |
|---|---|---|
| 1 | ~~`bn` Bengali, `ur` Urdu, `pl` Polish~~ **done** | first new script since Hebrew; Arabic-stack reuse a second time; a plain Latin control |
| 2 | ~~`ta` Tamil, `te` Telugu, `mr` Marathi~~ | three Indic scripts, two of them new, one reusing Devanagari |
| 3 | ~~`uk` Ukrainian, `nl` Dutch, `ro` Romanian~~ | Cyrillic reuse and two Latin, all with espeak voices |
| 4 | **`my` refused**, `km` Khmer **draft**, ~~`lo` Lao~~ | the hard batch: complex stacking, and `word_break: dict` for the second and third time |
| 5 | ~~`fil` Filipino, `ms` Malay~~, `zh-Hant` **not a language** | two Latin; the variant question is settled above -- `zh-Hant` is `script_alt`, not a row |
| 6 | ~~`am` Amharic, `ka` Georgian, `hy` Armenian~~ **done** | three scripts nothing else in the corpus resembles |
| 7 | ~~`pa` Punjabi, `gu` Gujarati~~, **`si` refused** | Brahmic breadth |
| 8 | ~~`kn` Kannada, `ml` Malayalam, `ne` Nepali~~ | completes the Indic set |
| 9 | ~~`cs` Czech, `sv` Swedish~~, `fi` Finnish | European Latin, and Finnish's agglutination is Hungarian's problem again |

`hr` Croatian was added off-roadmap as language 46, for a reason the batches do not
capture: Croatia is among the highest-traffic destinations without a card, and Gaj's
Latin cost the font and respelling machinery nothing. **What is actually left** is
`fi` Finnish -- two refusals (`my`, `si`) are closed until
fontkit gains a shaper, and `zh-Hant` is not a row.

**Georgian went in as language 47 and is the counter-example the last three
script attempts needed**, so its numbers are here rather than only in
tmp/ka/georgian.md. Burmese and Sinhala were both refused on fontkit, and the
method this file prescribes -- compare glyph *runs* against HarfBuzz before
writing anything -- is what refused them. Run the same way, Mkhedruli comes back
**exactly clean**: 0 throws, 0 glyph-run differences, 0 GPOS-offset differences
and 0 advance differences over 3,370 real tokens, 1,389 real strings and a
38,241-string exhaustive cube, in all five candidate files and in all four
shipped subsets. And it is clean for the *right* reason, which is the check
Burmese's caveat demands: `geor` is absent from fontkit's script-to-shaper map
and falls to the **Default** shaper -- which is also what HarfBuzz picks, whose
buffer trace under `set_message_func` shows `ccmp` in GSUB and `kern`/`mark`/
`mkmk` in GPOS under `script tag 'geor'` and no syllable machinery at all. Nor
is the pass vacuous: `kern` moves advances on 2,567 of the 3,370 tokens in Noto
Sans Georgian and 2,904 in the serif, and fontkit reproduces every one. **A
clean cube is evidence when the shaper being exercised is the one the script
needs, and for an alphabet with no marks and no reordering that shaper is the
default one.**

The questions the roadmap forces, worth thinking about before the batch that hits
them rather than during it. Deliberately not numbered: this list was "three known
questions" through two additions to it, and an ordinal in the prose goes stale the
moment someone inserts a bullet in the right *thematic* place rather than at the
end -- which is the right place to insert it.

- ~~**Urdu is Nastaliq**~~ — **settled, and by a crash rather than a preference.**
  `fontkit` throws on Noto Nastaliq Urdu for 84 of 86 real Urdu rows, in both copies of
  the shaper this project measures and prints with, so Urdu reuses `Arab` at Naskh,
  which is what most Urdu on a phone or a street sign is set in anyway. See tmp/urdu.md.
  The general lesson is that a script decision can sometimes be closed by measuring the
  toolchain rather than by weighing the typography.
- **`zh-Hant` is a variant, not a new script**, and the corpus already carries
  Traditional forms in `zh-Hans`'s `text_alt`. Whether it is a language or a
  presentation of one is a design decision, not a translation job.
- ~~**Khmer and Lao join Thai in needing dictionary word-breaking**~~ — **read, and
  the answer is that `word_break: dict` is a to-do rather than a feature.** A Burmese
  survey traced it: `core/measure.js`'s `atoms()` has exactly one branch,
  `if (wordBreak === 'space')`, so `dict` and `any` are the *same code*. No wordlist
  ships, `Intl.Segmenter` is never constructed, and `'dict'` is compared in one place
  in the whole tree — `core/solve/index.js:552`, which raises the
  `no-dictionary-breaking` warning. **That warning is the only observable difference
  between `dict` and `any` anywhere in the app**, and `core/respell.js` never reads
  `word_break` at all.

  It also does *not* uniformly "degrade to `any`", because `wordish` excludes only the
  scripts in `BREAKS_ANYWHERE` (Han, kana, hangul, Thai, Khmer) and the glue clause
  welds every adjacent `wordish` pair. Measured with the real measurer: Thai breaks
  between clusters and works; **Khmer broke into one atom per codepoint** because it
  is in `BREAKS_ANYWHERE` and had no cluster glue; Lao and Myanmar are in neither, so
  each run is one unbreakable atom. For Burmese that means a real sentence is a single
  16.9em atom against `rowsplit.js`'s 0.6 cap, overflowing by 27—64%.

  **The Khmer half of that was a live latent defect and is now fixed**, with a
  regression test that fails without it: a line could open on a bare coeng (U+17D2),
  whose only job is to bind the consonant after it, which renders over a dotted
  circle. It would have shipped broken the day a `km` pack existed.

  Read-across for the rest of the batch, measured rather than assumed: **Lao is
  Thai's case** — fontkit and HarfBuzz agree to four decimal places, because both
  store pre-base vowels in visual order and need no reordering. **Khmer is a font
  hunt** — Noto Sans Khmer holds 385 NULL anchors and throws on `ភ្នំពេញ` and
  `ខ្ញុំ`.

- **Burmese is blocked, and not by anything in this repo.** `mymr`/`mym2` are absent
  from fontkit's script-to-shaper map — in the vendored bundle, in
  `@pdf-lib/fontkit` 1.1.1's own dist, **and in `foliojs/fontkit@master`** — so
  Burmese falls to the *Default* shaper: no subjoined consonants, no kinzi, and the
  pre-base vowel `ေ` drawn on the wrong side of its consonant. fontkit over-measures
  real Burmese by up to **64.6%** against HarfBuzz, so the preview would draw correct
  text at a width the solver never measured while the PDF drew the wrong glyphs.
  Every escape was tried and failed: requesting `blws` by hand OOMs at 4 GB, the
  Indic shaper does not stack, and the Universal shaper reorders correctly but emits
  a dotted circle on the kinzi, so `မင်္ဂလာပါ` prints an error glyph. Unlike Urdu's
  Nastaliq refusal there is no fallback script, so this closes the language until
  fontkit gains a Myanmar shaper or the project gains a second shaper for the PDF
  path. **No pack was written**, on the stated grounds that 769 rows of unreviewable
  Burmese for a language that cannot be printed is 769 rows that *look* reviewed.

- **Sinhala is blocked too, and it is the sharper case, because fontkit selects the
  *right* shaper and is wrong anyway.** `sinh` maps to the Universal shaper in the
  registry, exactly as it does in HarfBuzz — so Burmese's caveat is satisfied and
  the language still cannot be printed. `UniversalShaper.assignFeatures`
  canonically decomposes a split vowel unconditionally and before GSUB, so ේ
  U+0DDA becomes `VPre + halant` and ෝ U+0DDD becomes `VPre + VPst + halant`; the
  USE syllable DFA declines to place a halant after a matra, HarfBuzz's machine has
  a `broken_cluster` catch-all where fontkit's has none, and `nextSyllable` then
  reads `.syllable` off a null `shaperInfo`. **`තේ` "tea" and `ලංකාවේ` "of Sri
  Lanka" throw**, which in `core/measure.js` is a crash; `ලෝක`, `ආයුබෝවන්`,
  `වේලාව`, `කෝපි` and `රෝහල` come back with a **dotted circle** and up to **30.2%**
  too wide. It is not lexically unlucky — `-ේ` is the genitive/locative ending, so
  **8.2% of 1,770 real Sinhala tokens throw** and 11.9% of running text carries one
  of the two characters. Same defect in both fontkit copies and in
  `foliojs/fontkit@master`, and the throw count is identical in five unrelated
  families including one with no GPOS table at all, so **there is no face to choose
  instead** — the NULL MarkBasePos crash that refused Noto for Telugu, Gurmukhi,
  Gujarati and Malayalam is absent from twelve of the thirteen Sinhala candidates,
  and Yaldevi would ship as it is. Every escape measured and refused, including a
  one-hunk patch that removes all 4,804 cube throws and still leaves 1.31% of
  clusters on a dotted circle and the rakaransaya's pre-base vowel on the wrong
  side. **No pack was written**, on Burmese's grounds. The three registry numbers
  were measured anyway so the next attempt need not: `leading_factor` **1.50** with
  Noto Sans Sinhala or **1.40** with Yaldevi — **Kannada's tier, not Khmer's**,
  because Sinhala has no vertical stack — `min_size_pt` **5.0**, `word_break`
  **space** with 1,770 real rows giving 1,770 atoms and zero violations. See
  tmp/si/sinhala.md.

- **And one that is *shipping*: Thai's `ห้องน้ำ` renders with a detached
  nikhahit.** `thai` and `lao ` are both absent from fontkit's shaper map, and
  HarfBuzz has a dedicated Thai/Lao shaper whose whole job is the U+0E33/U+0EB3
  decompose-and-**reorder**. Without it the nikhahit prints as a loose dot floating
  above the tone mark rather than beside it. The Lao survey measured the divergence
  — advances agree to four decimal places, glyph *runs* do not — then asked
  whether Thai had the same problem, rendered it, and looked: it does, in **both
  shipped Thai faces**, on the word for *toilet*. It is why Lao writes standard
  U+0EB3 rather than routing around it, and why its own face was chosen for doing
  the whole job in GSUB with no GPOS at all. **Not fixed**: the repair is a Thai/Lao
  shaper in the vendored fontkit, which is a piece of work rather than a patch.

- **And a rule that follows from Lao's numbers: measure on the subset you ship, not
  on the upstream face.** Its `leading_factor` and `min_size_pt` were both wrong
  until re-measured on `laoo-400.ttf` itself, because the shipped subset fires a
  `liga` upstream Phetsarath does not, ligating `ຼ`+`ູ` **0.18em deeper**: a cluster
  span of 1.4551em shipped against 1.2773em upstream. 1.30 became 1.50 and 5.4
  became 6.0. Every earlier addition measured the donor; this is the first to catch
  the donor and the subset disagreeing.

- **Three defects in `vendor/fontkit.esm.js` itself, found by the Khmer font hunt.**
  None is a font's fault and none affects a shipped pack, which is why they had gone
  unseen — but each is a trap for the next script that reaches it, and the third is
  why Khmer's face was chosen the way it was.

  1. **The chain-context *backtrack* sequence is matched in the wrong direction.**
     `coverageSequenceMatches(-n.backtrackGlyphCount, …)` starts at the farthest
     glyph and walks forward, where the spec and HarfBuzz put element 0 on the glyph
     *immediately* before the input. **A one-glyph backtrack coincides**, which is
     exactly why no shipped script found it; Khmer OpenType is built on two-glyph
     backtracks, so `ថា` is right and `ថ្នា` is wrong. In Battambang Bold it costs
     5.99% of clusters an advance error up to 8.3%; reversing the array at its three
     call sites takes that to 0.01%. Reproducer and patch in `tmp/km/patch-fk.py`,
     deliberately unapplied.
  2. **Shaping is order-dependent inside one solve.** `getGlyph` caches a `Glyph` by
     id *together with whatever codepoints asked for it first*, and the Indic shaper
     classifies by `glyph.codePoints[0]`. Khmer is the only script here that can
     reach it structurally, because the Khmer-OS faces substitute the register
     shifters down into the below slot and substitute *to* `uni17BB`, which is also
     the encoded glyph for `ុ`. So shaping `ស៊ើ` makes the next `ហ៊ុន` come back with
     a dotted circle **permanently**, and `ក៉ុ` measures 92% too wide. Verified clean
     across 9,764 cells in all nine Indic-shaper packs and Thai, so nothing shipped
     is affected — but a solve is not order-independent in general, which is a
     stronger claim than this project had evidence for before.
  3. **`render/pdf.js` discards GPOS offsets wholesale on contextual glyphs.** Its
     all-or-nothing proof guard fails on every contextual Khmer glyph, so 83.5% of
     Noto Khmer clusters lose their positioning entirely — `pdf-dropped` equalled
     `shifted` exactly. That is the guard working as written rather than a bug in it,
     and it is the reason the shipped Khmer face was chosen for carrying **no GPOS
     table at all**: Khmer OS Content positions every vowel sign, subscript and
     shifter by GSUB substitution, so both crash paths are unreachable *by
     construction* and the dropped-offset path does not exist. That is Constructium
     over Alcarin arriving in a real script rather than a conscript.

  The method that found all three is worth copying: **compare fontkit's output
  against HarfBuzz glyph-for-glyph and advance-for-advance, rather than counting
  throws.** Burmese's caveat below is answered that way and not by a clean cube.

- **And the sharpest font-testing lesson of all, from the same survey: a clean cube
  can be clean for the wrong reason.** All seven candidate Myanmar faces shaped all
  152,976 cube clusters and a 150,752-sequence exhaustive block probe with **zero
  throws** — *because the Default shaper never produces the `.sub` glyphs the NULL
  anchors belong to*. The cube was clean because the language was broken. So a
  zero-throw result is only evidence when you have separately confirmed that the
  shaper being exercised is the one the script actually needs.

**Armenian went in as language 49 and closes batch 6, and three of its findings are
here rather than only in tmp/hy/armenian.md** because each one generalises.

**The non-vacuity of a clean cube can be a *substitution* and not only a kern, and
Armenian is where that first happened.** Run Georgian's way, `armn` comes back
exactly clean -- 0 throws, 0 glyph-run differences, 0 GPOS-offset differences and 0
advance differences over 3,695 real tokens, 1,426 real strings and a 67,696-string
exhaustive cube, in all four candidate files and both shipped subsets -- and for the
right reason, `armn` being absent from fontkit's script-to-shaper map and falling to
the **Default** shaper, which is also what HarfBuzz picks (traced under
`set_message_func`: `liga` and `ccmp` in GSUB, `kern`/`mark`/`mkmk` in GPOS under
`script tag 'armn'`, no syllable machinery). What makes it a stronger result than
Georgian's is *what the lookups do*: `liga` changes the glyph run on **761 of 2,496
tokens (30.5%)**, reaching 943 ligature glyphs, **783 of which are `uni05780582` --
the ու digraph, the ordinary spelling of /u/, and a glyph with no codepoint at all**.
Georgian fired zero substitutions over its whole cube and had to rest on `kern`. So
when a script's ligatures are the hazard, they are also the evidence.

**And the hazard Lao warned about is real here and was caught by measuring the
subset.** U+FB13-FB17 are reached from մ+ն, մ+ե, մ+ի, վ+ն and մ+խ -- 160 times over
the same token list -- so the block is subset whole and the presentation forms are
deliberately **not** requested: the glyphs arrive through the layout closure, and
requesting the codepoints would add a second encoding of a glyph NFC does not
normalise away.

**A `min_size_pt` can refuse a typeface, and here it did.** Noto Serif Armenian
neither throws nor diverges, and is not shipped: Armenian has three minimal pairs
that differ only by a foot or a tail on one stem -- դ/ղ, գ/զ, ը/ր -- and the serif
faces XOR at **0.060 and 0.057** at 4.4pt against Latin's O/Q at 0.126 and the
sans's ա/պ at **0.140**, which is Thai's 0.062 at 5.4, the most confusable script
this project ships. Raising the floor does not rescue them (0.054/0.047 at 5.0,
0.078/0.080 at 5.4, 0.089/0.091 at 6.0), and `min_size_pt` is per *script* rather
than per face -- so shipping the serif would have pinned every Armenian sheet, sans
ones included, to Devanagari's floor to protect a typeface option. **Sans-only for a
legibility reason rather than a crash is new**, and the general form is: measure
every candidate face at the floor before deciding how many to ship, because the
floor is the one registry number a second face can force upwards.

**Armenian's line box is set by its punctuation and not by its letters**, which is
the third thing worth carrying. The 39-letter alphabet spans 1.0150em -- Latin's
tier -- and the pack's 849 real rows span 1.0710em, because `՞` U+055E sits at
0.8260em, **0.056em above the tallest letter**, and it goes *inside* the word over
the stressed vowel rather than at the end of the clause. So it is on every one of
the pack's ~200 questions rather than in a corner, and `leading_factor` is **1.12**
where the letters alone would have said 1.02. Any script whose sentence marks are
in-word should be measured over real sentences and not over its alphabet.

Two smaller results, both reusable:

- **The romaniser has to be run against its own standard's worked examples.**
  `hy.translit` derives `romanization_bgn` mechanically and reproduces all **37**
  examples in the BGN/PCGN 2022 document -- but only after two bugs the examples
  found and nothing else would have: `ով` came out `ovv`, and `Ո՞ւր` came out
  `Vowr?` because the in-word question mark sat between ո and ւ and broke the ու
  digraph lookahead. A derived column is only as good as the table it was derived
  from, and a published table usually ships its own test set.
- **Armenian needs a case device on eight of the 44 slot rows and no more**, which is
  further than Croatian's reading reaches. Its accusative of an inanimate noun is
  the nominative, a destination takes the bare form, a numeral takes none, and an
  ending on a numeral or a Latin-letter word is written **with a hyphen** as ordinary
  orthography (`ժամը {}-ին`, `{}-ից`, `{}-ով`, `{}-ում`) rather than as a device. The
  eight that really govern an oblique case take the **բութ `՝`** U+055D, Armenian's
  own mark for introducing an explanation -- apposition in native punctuation rather
  than an imported ASCII colon. And the `{target}`/`{source}` rows need nothing at
  all, Armenian language names being adverbials in -երեն that take no ending, so all
  50 of its `language-names.csv` rows leave `name` empty where Polish had to
  hand-write `po X-u` twenty-eight times.

**A case language has to decide what to do with the 44 slot rows, and the corpus is
now split three ways rather than two.** A `{}` filler is a bare dictionary-form noun,
so a frame governing an oblique case is ungrammatical — and `ru`, `uk` and `cs` all
took the natural frame and put the problem in `literal`, while `pl`, `hu` and `tr`
all took a colon apposition (`Jestem z tego kraju: {}`). Croatian's addition split
the difference **on which case the frame governs**, which is the reading those six
packs make available but none of them states: an *accusative* frame is right as
written for every masculine-inanimate and neuter noun, because that accusative is
identical to the nominative, so `Trebam {}` and `Imate li {}?` keep the frame and say
so; a *genitive, locative or instrumental* frame is wrong for everything, so those
thirteen rows take the apposition. Worth knowing before writing 44 rows one way.

Two smaller findings from the same addition, both reusable:

- **One row was reworded rather than devised around, and that is the best outcome
  available.** `utility-templates.is-there-nearby` is an existential, which takes the
  genitive in Croatian as in Russian — but `Je li blizu {}?` ("is {} nearby") makes
  the slot a *nominative subject* and needs no device at all. Look for the
  nominative-subject rewrite before reaching for a colon.
- **Numeral slots cannot be got right and every pack has taken the same trade.**
  `{} noći` and `{} dana` are correct from two up because the paucal and the genitive
  plural coincide; `{} godina` is correct from five up and wrong for two to four. No
  single form of a Slavic noun serves every numeral, and `ru`, `uk`, `pl` and `cs`
  all print the high form. Say so in `literal` rather than looking for a fifth
  answer.

**And a reader-table device worth knowing about before enumerating a list by hand:
`after_out`.** Croatian writes a post-vocalic /j/ as `j` and never as `i`, so `aɪ`
has to come out `aj` where `ɪ` alone is `i`. Swedish's table lists the four
diphthongs it meets by hand and Czech's and Polish's do not do it at all, spelling
`ai` and `ei`. Neither is necessary: `after_out: "a e i o u"` asks whether the slot
has already emitted a vowel letter, which *is* the definition of an offglide, so one
rule spells the whole tail — 1,678 `aɪ`, 614 `eɪ`, 191 `ɛɪ`, 83 `əɪ`, 71 `oɪ` and
`ʌɪ ɔɪ ɑɪ ɐɪ æɪ ʊɪ uɪ iɪ yɪ ɨɪ aːɪ` besides. It has to be written *before* the
unconditioned rule for the same symbol: `createRespeller` sorts by IPA length and
then by slot specificity and leaves an exact tie to file order, which is the
shadowing that cost the kana table 99 rows.

**Finally: reusing a sibling table's key set does not make a table complete, and the
hole is exactly one entry wide.** Croatian's phoneme list was built from Czech's,
which is at zero gaps — but a table never reads its own language, so Czech's list has
no rule for Czech's own `l̩` and `r̩`, and Croatian's first `--gaps` run reported 37
of them. The general form: a sibling's key set is missing precisely the phonemes the
sibling contributes, so check the new table against the *union* of every table's keys
and not against the one it was copied from.
