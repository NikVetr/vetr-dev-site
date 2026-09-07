#!/usr/bin/env python3
"""Fill the `ipa` column of data/lang/<code>/*.csv for every ready language.

    python3 scripts/build_ipa.py            # regenerate and report
    python3 scripts/build_ipa.py --check    # verify the committed data is current
    python3 scripts/build_ipa.py --only es,ja

**Why this exists.** A respelling -- `nee HOW` -- is written per *pair*, which is
why only 16 of the 272 shipped pairs have one and the other 256 print an empty
column. `core/respell.js` replaces that O(N^2) table with two O(N) inputs: one rule
file per language doing the reading, and the `ipa` column of the language being
learned. The rule files are hand-written; this column is not, and until it exists
the transducer has nothing to transduce. It was empty in all 12,841 rows.

**What it is not.** Machine G2P is not a fluent speaker. Every cell this writes
declares itself in `provenance` (see "Declaring provenance" below) so that a later
human pass can find exactly what has not been read, and so that this script never
overwrites a cell a person has claimed. Nothing here raises `confidence`.

## Routes

espeak-ng through `phonemizer`, which loads `libespeak-ng.so` by ctypes and needs
no `espeak-ng` binary, covers thirteen of the seventeen. **Four do not, and they
fail in four different ways** -- which is why "which languages have no voice" has
three defensible answers. One has no voice at all; two have a voice that does not
emit IPA; one has a voice that emits IPA for a phonology it gets wrong.

  th       **no espeak voice exists.** There is no `th_dict` and
           `espeak-ng-data/lang/tai/` holds only Shan. Route: `pythainlp` --
           `newmm` word tokenizer, `dict` syllable tokenizer, then the `thaig2p`
           model per syllable. Per *syllable* because whole-word decoding has a
           length cap and silently degenerates on any word past three syllables
           (`โรงพยาบาล` -> `r oː ŋ . pʰ a . j aː . b aː . b aː . b aː ...`), which is
           the one failure mode that produces plausible-looking garbage. 5.2% of
           Thai rows hit it whole-word; per syllable, three do, and those three
           rows are refused (see `DECODER_STUCK`).
  zh-Hans  the `cmn` voice does not emit IPA. It gives `ts.ˈo-5 s.ˈi.5` for 这是
           -- ASCII stand-ins for the retroflexes with tone digits glued into the
           rime. Route: the pack's own curated Pinyin column through
           `dragonmapper`, a closed ~410-syllable table.
  ja       the `ja` voice cannot read kanji: it renders 月曜日 as
           `tʃˈaɪniːzlˈe̞tə` three times -- it is speaking the words "Chinese
           letter". Route: the curated Hepburn column through the mora table
           below. `pykakasi` would fix the kanji, but Hepburn is already there,
           already reviewed, and unlike espeak's kana output it needs no
           un-picking of phonetic detail (`pˌäsɯᵝpˈo̞o̞to̞`, two codepoints of which
           no shipped face can draw).
  ko       the `ko` voice emits three separate kinds of non-IPA -- `q` for a
           non-initial ㄱ, an ASCII `h` for aspiration (`phˈɐ`), a trailing `-` for
           the tense series -- conflates ㅈ with ㅉ, and applies no obstruent-nasal
           assimilation, so 합니다 comes out `hˈɐpnidˌɐ` rather than *hamnida*.
           Route: the curated Revised Romanization column, which is a
           transcription rather than a transliteration and therefore has every one
           of those rules already applied by a human.
For the thirteen that do have a usable voice, the *variety* matters as much as the
language. The default `es` is Castilian -- 107 instances of /θ/ and 34 of /ʎ/ --
while the curated respellings are seseo and yeísmo (`ah-sen-SOR`), so the voice is
`es-419`. `en` is `en-us`, matching the accent `data/respell/overrides/*__en-US.csv`
is keyed on. `fr` and `pt` must be spelled `fr-fr` and `pt-br`; the bare codes
raise "not supported". And `vi` emits two pieces of espeak's own phoneme mnemonics
that `phonemizer` does not translate into IPA at all, which refused 68 rows until
`VI_TONES` and `REPAIR` were told what they stand for: `1` is the ngang tone
written out and `e-` is the rhyme of `anh`/`ach`.

Reproducing: `pip3 install --user phonemizer dragonmapper pythainlp`. `thaig2p`
downloads a 12MB model to `~/.pythainlp-data` on first use.

## What gets phonemised, and what does not

`note` rows are skipped: a note is prose the reader reads, not something anyone
says. Four rows per language, and they are the only rows this script declines to
transcribe on principle.

`{target}` and `{source}` are carried through as markers rather than phonemised
(`content/LANGUAGE-SLOTS.md`): each resolves at render time to a language name that
no G2P here has, so `fillLanguageSlots` in core/pack.js substitutes the IPA of the
name from the `ipa` column of `data/registry/language-names.csv`, which
`language_name_ipa` below fills through these same routes. `{target}` needs the 17
entries where a language names itself and `{source}` the other 272, because a
`{source}` cell is the target's sentence naming whichever of sixteen languages is
*reading* it. Where the matrix has no entry the whole cell is blanked rather than
printed with a hole where the language should be.

`{}` and `/` *are* carried through as their own tokens. Both change how the phrase
is read rather than how it sounds, both already appear in the curated respellings
(660 and 191 cells), `core/measure.js` draws `{}` as a rule in whatever column it
finds it, and `core/respell.js` passes a symbol it has no rule for straight
through -- so `no ˈaβlo {}` respells as `no AH-blo ___`. A comma is kept for the
same reason, attached to the preceding IPA word: it is a pause the reader needs and
its position cannot be recovered downstream. Everything else -- `¿ ? . ! : …` and
all quotes and brackets -- is dropped. A question mark is not a phoneme, it is
already visible in the `text` cell directly above, and its position *is*
recoverable, being the end of the sentence.

`text_alt` gets no IPA. There is one `ipa` column and it belongs to `text`; two
transcriptions in one cell would print a pronunciation for a phrase the sheet is
not showing. 2,146 variants across the corpus are therefore untranscribed, which is
a schema limit rather than a G2P one.

## Refusal, rather than a plausible wrong answer

Every route ends at `check_alphabet`, which is a whitelist: if a row's output
contains one character outside the IPA repertoire, the row is refused and counted
instead of being written. That one gate catches everything the G2P could not do --
a Latin-script loanword inside a non-Latin language, which
the Hepburn and Pinyin tables pass through unchanged; a pinyin syllable
`dragonmapper` does not know; a currency symbol -- without a list of things to look
for. Two routes add one gate of their own:

  ja   the characters `ROUTE_FORBIDS` names, which are IPA but are not Japanese
  ko   the syllable count of the result must equal the number of Hangul blocks,
       which in a syllable-block script it always does. This used to be the main
       defence against a digraph read across a block boundary and is now a net
       behind `ko_hyphenate`, which resolves those instead of refusing them.

**Refusing is the last resort and not the first.** Two classes of refusal turned
out to be answerable from data already in the repository, and both were retired
rather than made stricter:

  ko   `ng` is both /ŋ/ and an ㄴ+ㄱ sequence, and the corpus does not use RR's
       disambiguating hyphen, so `chinguga` (친구가) is *chin-gu-ga*. Counting the
       Hangul's ㅇ finals against the `ng`s refused the 25 rows where the two
       disagree; aligning the blocks' *vowels* against the RR instead tells you
       which `ng` is which, and fixes the vowel digraphs in the same pass -- see
       `ko_hyphenate`. It also caught four rows that were passing while wrong:
       `다음 주` was `tɛum`, the `ae` of `daeum` read across the boundary.
  all  a Latin run in a non-Latin sentence was refused by asking whether `text`
       held a Latin letter. For the three languages read off a romanisation that
       is the wrong string to ask about: `romanization_hepburn` is Latin
       throughout, and for these rows it is also the answer, since a fluent
       speaker wrote `SIM` as `shimu` and `ATM` as `ētīemu`. `latin_survives` asks
       whether the run is still there in the string the route will read, which
       kept all 14 Japanese rows and refused the 16 where the loanword really does
       survive.

## Declaring provenance, and why `confidence` does not move

`confidence` is documented in `content/CONTRIBUTING.md` as a claim about *who
checked a row* -- and the row it is checking is the translation. Lowering it to
admit that the IPA is machine output would say something false about `text`, which
a fluent speaker did check, and would trip the `SAFETY_CRITICAL` gate in
`scripts/validate_data.py` on every emergency and allergy row in the corpus. It is
the wrong instrument: one number cannot describe two columns.

`provenance` can, because it is prose and the repository already uses `;` as its
list separator (`regions`, `script_alt`, `romanizations`). So a row's provenance
becomes a `;`-separated list, whose first element stays exactly what it was and
whose `ipa=` element names the method that produced this cell:

    es-agent-v1;ipa=espeak          machine, unread
    japanese-reviewed-v6;ipa=hepburn
    th-agent-v1;ipa=thaig2p
    latex-reference-v2;ipa=pinyin
    ko-agent-v1;ipa=rr
    <anything>;ipa=reviewed         a person has read this cell

The method name is deliberately the *class* of route and not the voice, because the
voice is uniform per language and belongs in this file, which is its single source
of truth. `ipa=reviewed` is the only value that means a human read it, and this
script will not touch a cell that carries it -- so a reviewer's work survives the
next regeneration, which is the property that makes the convention load-bearing
rather than decorative. `scripts/validate_data.py` requires the tag on any
non-empty `ipa` and reports the unread count per language as the reviewer queue.

## Two things this cannot do honestly

**Three IPA codepoints the shipped faces cannot draw.** `content/summary.md` says
"every `latin*.ttf` already ships the full IPA repertoire including the Chao tone
letters". Two thirds right: U+0250-02AF, U+02B0-02FF (Chao bars included) and
U+0300-036F are complete in all sixteen Latin faces, but IPA also borrows three
Greek letters, and `LATIN_RANGES` in `scripts/subset_fonts.py` has no Greek block,
so U+03B2 β, U+03B8 θ and U+03C7 χ are in none of them -- nor is U+1D00-1D7F, all
128 codepoints of it. β and χ are avoidable and are avoided (see `FOLD`); θ is not,
because it is the only symbol for a phoneme that English, Swahili and Arabic all
contrast. Every source face in `tmp/fonts-src` has all three, and
`subset_fonts.py` unions `corpus_chars`, so one run of it picks them up from this
column -- until then `npm run validate` warns on the θ cells and they print as an
empty box in the PDF.

**Stress, tone and length are only as good as the G2P.** Word-level stress marks
are omitted entirely for the five languages that have no lexical stress (see
`STRESS`), because espeak emits `ˈ` for Korean and Vietnamese anyway and a
respelling would capitalise 938 Korean words that must not be capitalised. For
French they are collapsed onto the phrase-final word, which is where French stress
actually is. For the rest they are espeak's, and espeak's agree with the curated
respelling's capitals 99% of the time in Spanish and 68% in Turkish. Japanese pitch
accent is not in the Hepburn column and is not here. Mandarin, Thai and Vietnamese
tone is, as Chao tone letters. Korean tensification across a syllable boundary
(학교 [hak̚k͈jo]) is not applied, because Revised Romanization does not write it.

**Known defects, found by the rule tables reading this column rather than by
anything here.** Each one prints, so each is worth a pass; none is a reason to
distrust the column as a whole.

- `vi` has no /tʰ/ anywhere, though Vietnamese contrasts it. It is the aspirated
  series that lets a Korean or Mandarin reader's table fire its own aspiration
  rules, so its absence silently disables them for Vietnamese.
- **The largest blank-respelling class was never in this column at all.**
  `fillLanguageSlots` blanked the `ipa` cell of any row whose filled value still
  contained a `{`, meaning to catch an unresolved language slot -- and caught the
  ordinary `{}` blank as well, on **747 cells, 44 per language**, every one of which
  reached the renderer with an `ipa` and left it without one. Nothing on this side
  could see it: the cell on disk is full. The guard now tests whether the
  *substitution* came back empty, which is the thing it was trying to ask, and 44
  rows a sheet went from an empty respelling column to a full one. Worth knowing
  when reading a blank-cell count: the number this script reports is a lower bound
  on what a reader actually sees blank.
- **The language-name matrix is only as stable as the ICU that node was built
  with.** `data/registry/language-names.csv` carries a `name` only where CLDR is
  wrong for our purposes, so `language_name_ipa` asks node for the other ~200 and
  phonemises what it gets. If an ICU update renames a language, the generated `ipa`
  changes and `--check` fails -- which is the drift report
  `content/LANGUAGE-SLOTS.md` asks for, and is also the reason `--check` now needs
  `node` on PATH as well as `phonemizer`. A browser whose ICU disagrees with node's
  would print a name this column transcribed differently; no pair in the matrix
  does today, and filling `name` for all 289 rows is the fix if one ever does.
- **espeak's `vi` voice reads a Latin-script language name with English rules**, so
  two of Vietnamese's sixteen `{source}` substitutions are English: `Indonesia` is
  `ɪndəʊniːziə̯` and `Swahili` is `swɑːhiːli` where Vietnamese would have
  [in.do.ne.zi.a] and [swa.hi.li]. `id`'s word for Thai (`thˈaɪ`, with the `th`
  unconverted) is the same fault. Three cells of 289, and each prints on one pair's
  two rows.
- **`thaig2p` drops the final /t/ of `อังกฤษ`**, Thai for English: the name is
  `ʔaŋ˧kri˨˩` where the curated sheet respells it *ang-grit*. It prints on both of
  the Thai pack's `{source}` rows for an English reader, and nowhere else.
- **`thaig2p` appends a phantom `นะ` to `ขอบคุณ`**, which is `social-basics.thank-you`
  -- the most-said row in the pack. It comes back `kʰɔːp˨˩kʰun˧na˦˥`, three syllables
  where the word has two, so an English reader is told to say *kop-kun-na*. The model
  is completing the polite formula rather than reading the string, and it does it to
  the syllable and to the word alike, so neither of `thai_syllables`'s two units
  escapes it. Found while writing `slang.im-good-thanks`, which now uses `ไม่ล่ะ`
  instead of a phrase containing `ขอบคุณ`; the `social-basics` row still prints it.
- **`thaig2p` reads a `จร`/`กร` cluster as two syllables and a leading `ห` as /h/.**
  `จริง` comes back `t͡ɕa˨˩riŋ˧` where Thai says /t͡ɕiŋ/, and `เหรอ` comes back
  `heː˩˩˦rɔː˧` where the `ห` is the silent tone-marking consonant and the word is
  /rɤː/. Together they make `จริงเหรอ` -- the ordinary Thai for "really?" -- respell
  as four syllables of which none is right. Both are properties of the decoder rather
  than of the tokenizer, so there is no unit that fixes them; the slang round routed
  around it with `ไม่น่า`.
- **A French `{source}` cell carries two phrase stresses.** `STRESS["fr"]` puts the
  mark on the last word of a *run*, and the substituted name is its own run, so
  `Parlez-vous {source} ?` is `paʁlˈevˈu ɛspanjˈɔl` -- three marks where French has
  one, at the end. The name's own stress is right and the frame's is now early;
  fixing it needs the slot's position, which is downstream of this script.
- **`anh`/`ach` is transcribed `aɲ`/`ac`, which is a choice.** Hanoi diphthongises
  the rhyme to [ajŋ]/[ajk]; the curated sheet's *khak* and *ang* for an English
  reader are what picked `a` over `ɛ` (see `REPAIR["vi"]`), and the palatal coda is
  espeak's. A Vietnamese reviewer should read these 31 rows first.
- **`ɪ` is espeak's offglide in `ây`/`ay`**, so `dậy` is `zəɪ˨˩ˀ` and not `zəj˨˩ˀ`.
  It is the one unit `respell_check --units` gained: `ɪˀ`, once, in 14 of the 17
  readers' lists, from the single row where that offglide meets a glottalised tone.
  `syllable_count` already counts `ɪ` as a falling glide, so the count is right and
  only the letter is unusual; changing it would touch every `əɪ`/`aɪ` cell and every
  reader's spelling of them, which is a bigger question than this row.
- **The three `ja` rows that carried romaji rather than IPA no longer do, and this
  entry was already stale when it was written down.** Driving `hepburn_to_ipa` over
  every word of the column and reporting the position at which its `longest` gives
  up finds *none*: the extended-katakana block in `HEPBURN` and
  `ROUTE_FORBIDS["hepburn"]` between them closed it, the first by reading the morae
  and the second by refusing the row if anything is left. What replaced it is
  smaller and in the other direction -- 33 `ja` cells are byte-identical to their
  Hepburn, which is correct rather than unconverted: /doko/ really is `doko`.
- **espeak writes Turkish /e/ as `/æ/` before a coda liquid or nasal** on 98 cells:
  *gelmek* is `ɟælmɛk`, *lütfen* is `lytfæn`. The allophony is real, but `/æ/` is the
  wrong *letter* to hand a rule table -- `a` is Turkish's other vowel, so a reader
  gets `gal-` for `gel-`, which is a different word. One table overruled it in a
  `targets` block.
- `it` has no word-initial /ts/ in the whole column, so `onsetClusters` never
  learns that Italian can open a word with it and *Grazie* breaks as `grats-ie`.
  Italian orthography writes it `z`; the G2P is giving something else.
- **espeak's `hu` voice fuses a proclitic into the word after it**, so `nem
  beszélek` is the single token `nˈɛmbɛseːlɛk` -- and so are `nem értem`, `nem
  tudom`, `nem kérek`, `ez az` and `elnézést kérek`. `nem` is the most frequent word
  in a phrasebook's negatives, and a respelling then prints one unbroken word where
  the card shows two. It is also the *only* thing phrase-level phonemisation buys
  Hungarian: every phrase in the pack was phonemised both ways and the only
  differences are this fusion and stress demotion, never a segment. So `hu` is
  phonemised one word at a time -- see `WORD_AT_A_TIME` -- which fixes the boundaries
  and introduces exactly one artefact, the bare definite article `a` read as the
  *letter* and returned as `ˈɑː`, a long back rounded vowel Hungarian does not have.
  Repaired in `REPAIR["hu"]`.
- **espeak reads Hungarian `lj` as a palatal lateral.** Standard Hungarian has none:
  the yod-merger completed around 1800, AkH. rule 88 says the letter `ly` survives
  for a sound that does not, and `melyik` does come back correctly as `mˈɛjik`. But
  an orthographic `lj` -- `forduljon`, `aktiválja`, `használjon` -- comes back as
  `ʎj` on eleven rows, where the standard pronunciation is a long [jː]. One
  substitution fixes the phoneme and the length together.
- **espeak declines Hungarian's cross-morpheme assimilation** and reads the spelling
  instead: `nagysebességű` and `egyszerű` come back as `nˈɑɟʃɛbɛʃːeːɡyː` and
  `ˈɛɟsɛryː` where the usual readings are [nɑccɛ-] and [ɛccɛryː], and a geminate
  before a consonant is shortened on some rows (`jobbra`, `mellkasi`, `otthon`) and
  not others. All three are careful-speech readings rather than errors, so they are
  left. It does get the *within-word* assimilations right, which are the ones that
  change a letter: `biztosítás` is `bistoʃiːtaːʃ`, `segítség` is `ʃɛɡiːtʃːeːɡ`,
  `ezt` is `ɛst`. The one it drops outright is `egészség`, returned with a single
  `ʃ` where the length is the whole point of the word.
- **Hungarian stress is not read off espeak at all**, and does not need to be: it is
  on the first syllable of every word, without exception and without lexical
  contrast, so `hu_stress` writes it from the position. Which is as well -- even one
  word at a time espeak demotes some words to a secondary mark and no primary
  (`vagyok` is `vˌɑɟok`), and a word with no primary mark prints unmarked, which for
  an accented script is not a possible word.
- 73 `ar` rows have no short vowels at all, because espeak read unvocalised text.
  `hal imknni istijdam` is what a respelling of one looks like, and no rule table
  can recover the vowels. Vocalising the Arabic source text is the fix. A further
  `ar` row is a wrong *reading* rather than a missing vowel: espeak takes `كم حجم`
  for *kilometer*.
- **espeak writes /y/ for three different vowels that are not /y/**, which is one
  defect wearing three hats and the most consequential entry here, since /y/ is a
  real phoneme in `fr de zh-Hans` and a rule table cannot tell the cases apart.
  Portuguese's reduced final [ɨ] is /y/ on 292 cells (`de nada` is `dʒy nˈadæ`),
  Vietnamese's ư [ɨ~ɯ] on 220, and Turkish's ü inconsistently -- `Günaydın` is
  right but `Özür` is `œzˈør`. Portuguese's final [ɐ] is likewise
  written **/æ/ on 412 cells** -- `nˈadæ`, `bˈoæ`, `dʒˈiæ` -- a vowel no variety of
  Portuguese has.
  Three rule tables have had to work around this with `targets` blocks.
- **`vi`'s centring diphthongs are marked now, and the mark goes on the *second*
  element** -- see the `vi` entry in `REPAIR`. This entry used to say the column
  split every Vietnamese syllable in two and to propose `biɛ̯t̪`, `ɗy̯əc`, `bu̯əj`;
  the diagnosis was right and two of the three spellings were wrong. ia/iê, ưa/ươ
  and ua/uô are *falling* diphthongs -- Kirby (2011: 384) -- so the nucleus is the
  first element and U+032F belongs on the offglide after it, uniformly:
  `biɛ̯t̪`, `ɗyə̯c`, `buə̯j`. Marking the first element instead would have made ə the
  nucleus of ươ and uô, which is backwards, and would have left the offglide in the
  syllable's *onset* rather than its nucleus.
  The measured cost was **349 extra syllables on 282 of vi's then-677 filled rows**
  -- 747 now -- and not the 380 on 287 this entry used to claim; `syllabify` puts
  every one of the 349 marks on a vowel that was starting a syllable of its own, so
  each removes exactly one and no row's count went up. The four rows where espeak spells an
  acronym out letter by letter (`kwˌiˈɛʐəː` QR, `ˌɛɜsˌiˈɛməː` SIM) keep their two
  syllables and should: there the `i` and the `ɛ` are different letter names.
- **What still prints is now a reader's problem rather than this column's.** A table
  whose orthography has no way to write a one-syllable /uə̯/ used to get the hyphen
  for free from the split. Thai gains its own native spelling (`buə̯j` -> `บ่วย`,
  `biɛ̯t̪` -> `เบี้ยต`) and Mandarin gains a legal syllable shape (`bi-èd` ->
  `bièd`), but English now piles letters: `mùa` is `moouh` where the curated sheet
  says `moo-uh`, on 8 rows of `vi__en__en-US.csv` -- the only 8 rows in the corpus
  this fix scored worse on, and all 8 differ from the curated sheet in the hyphen
  alone. Arabic is the same problem in a script that cannot absorb it at all: two
  harakat now stack on one consonant (`buə̯j` -> `بَُيْ`) on 282 rows, where the
  split used to give each vowel its own carrier. That is the `split_rising` case in
  `syllable_count` -- a fact about the reader, not about Vietnamese -- so it wants a
  nucleus or `splits` rule in `en__en-US.json` and `ar__ar-MSA.json`, not a change
  here.
"""
import argparse
import csv
import io
import json
import re
import subprocess
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


# --------------------------------------------------------------------- routes
# espeak voice per language. The suffixes are not decoration: `es` is Castilian,
# and `fr`/`pt` without a region raise "not supported".
VOICES = {"en": "en-us", "es": "es-419", "fr": "fr-fr", "de": "de", "pt": "pt-br",
          "it": "it", "id": "id", "sw": "sw", "tr": "tr", "ru": "ru", "hi": "hi",
          "ar": "ar", "vi": "vi", "el": "el", "hu": "hu", "fa": "fa", "ur": "ur",
          # `bn` and not a regional variant: espeak-ng ships one Bengali voice. The
          # two standards it would otherwise have to choose between differ
          # lexically -- পানি against জল -- rather than phonologically, and the pack
          # carries that in `text_alt`, where a voice could not.
          # This build's installed espeak-ng-data is 1.50 (Ubuntu jammy's package),
          # and Ukrainian's voice was only added upstream in 1.52 (espeak-ng#1480,
          # 2022) -- confirmed by diffing this package's `espeak-ng-data/lang/`
          # against upstream `docs/languages.md`, which lists `uk` under `zle` beside
          # `ru`. `pip3 install --user espeakng-loader` bundles a newer prebuilt
          # library and data tree that does carry it; point `phonemizer` at it with
          # `PHONEMIZER_ESPEAK_LIBRARY`/`PHONEMIZER_ESPEAK_DATA_PATH` (both read by
          # `EspeakWrapper` itself, so nothing in this file has to know) before
          # running this script for `uk`. See tmp/ukrainian.md.
          #
          # **Point those two variables at the loader for `uk` alone, and never for a
          # `--only` list that includes another language.** The two libraries do not
          # agree, so pointing the newer one at an already-built column silently
          # re-derives it: German's `Fruehstueck` comes back frˈyːʃtʏk under the loader
          # and frˈyːʃtyk under Ubuntu's 1.50, and one settling run of the other
          # twenty-four languages moved about 320 cells that way, Russian worst. It
          # was caught by `tests/fonts.test.mjs` rather than by anything closer: /ʏ/
          # is a symbol only five of the twenty-eight reader tables have a rule for,
          # so six scripts could not draw what their respellings now emitted. Both
          # `--gaps` and `--check` were clean at the time, because a re-derived column
          # is internally consistent -- it is only wrong against the grade a reviewer
          # gave it. Rebuilding the same list with the system library restored all
          # twenty-four byte-for-byte, which is also how the drift was measured.
          #
          # The uncomfortable part is that the newer library is the *more accurate*
          # one here: `Fruehstueck` really is [ˈfʁyːʃtʏk] with a lax second vowel, so
          # the shipped German column writes /y/ where the language has /ʏ/. Upgrading
          # deliberately would mean re-deriving those cells, giving twenty-two reader
          # tables a `ʏ` rule modelled on their own `y`, and regrading German -- a pass
          # of its own rather than a side effect of adding a language, which is why
          # this is a note and not a change.
          "bn": "bn", "pl": "pl", "uk": "uk",
          # Marathi is in the same situation as Ukrainian, not a new one: this
          # build's espeak-ng-data 1.50 has no `mr` voice at all (confirmed with
          # `EspeakBackend.supported_languages()` against the system library before
          # reaching for the loader), and `espeakng_loader`'s bundled tree does --
          # `EspeakBackend('mr').phonemize(['नमस्कार, तुम्ही कसे आहात?'])` returns
          # `nəmskaːɾ tʊmhi kʌseː aːhaːt`, a plausible reading of "namaskār, tumhī
          # kase āhāt" with the schwa and the retained final /t/ both right. Needs
          # the same two environment variables as `uk`, and the same warning: run
          # `--only mr`, never a list that also touches an already-built language,
          # or the newer library silently re-derives cells nothing asked it to.
          "mr": "mr",
          # Dutch needed neither the loader nor a warning about it: unlike `uk` and
          # `mr`, which were both added to espeak-ng after this build's system
          # `espeak-ng-data` 1.50 was cut, `nl` has been in espeak-ng for a long time
          # and is present in the system package on PATH-less Ubuntu jammy --
          # confirmed with `EspeakBackend.supported_languages()` against the plain
          # system library, no `PHONEMIZER_ESPEAK_*` set, before even considering the
          # loader. Probed directly: `EspeakBackend('nl').phonemize(['Goedemorgen,
          # spreekt u Engels?'])` returns `ɣudəmɔrɣən spreːkt y ɛŋəls` -- ɣ for the
          # Dutch g (not Hindi's aspirate, not German's x), y for u (front rounded,
          # not English y), ʋ for w (labiodental approximant, not English [w]) all
          # correct on a second probe (`mɛɪn pɑspɔːrt kʋɛɪt` for "mijn paspoort
          # kwijt"). Built with `--only nl` against the same system library every
          # other already-built column was built with, so the two-libraries-disagree
          # hazard this comment block warns about for `uk`/`mr` does not apply here.
          "nl": "nl",
          # Malay has been in espeak-ng for a long time (unlike `uk`/`mr`,
          # recent additions), and the system package (1.50) carries it, so
          # no `espeakng_loader` is needed -- confirmed the same way `nl`'s
          # own entry was, by checking before reaching for the loader.
          "ms": "ms",
          # espeak-ng ships one Tamil voice and no regional variant, and it is used
          # rather than a romanisation route for one reason: **it implements Tamil's
          # positional voicing rule**, which the script itself does not write and
          # which no letter-by-letter table over `romanization_iso15919` could
          # recover, because the information is not in the letters. Probed on all
          # four environments before it was trusted -- word-initial voiceless
          # (கடை `kˈʌɖaɪ`, பால் `pˈaːl`), intervocalic voiced (அகம் `ˈaɡʌm`, எது
          # `ʲˈedʉ`), geminate voiceless (அப்பா `ˈappaː`, ஓட்டு `ˈoːʈʈʉ`) and
          # post-nasal voiced (தம்பி `tˈʌmbi`, ஐந்து `ˈaɪndʉ`, ஒன்பது `ˈonbʌdʉ`) --
          # and right in every one. See GRADE["ta"] for the two words it is wrong on.
          "ta": "ta",
          # Telugu, and **`te_dict` is in this build's installed 1.50 data tree**
          # beside `ta`, `kn` and `ml` under `espeak-ng-data/lang/dra/`, so the
          # `espeakng-loader` escape Ukrainian needed above is not needed here.
          # Checked before anything was installed.
          #
          # The reason it can be used at all is the opposite of Tamil's: Telugu
          # *writes* voicing and aspiration, all four series, so a romanisation route
          # over `romanization_iso15919` would have carried the same information. The
          # espeak route is taken because it also gets the things the letters do not
          # say -- vowel length is written but the anusvara's place of articulation is
          # not, and neither is the [m] it becomes word-finally, which is why
          # `te_anusvara` below exists. Probed on the four-way series before it was
          # trusted: ఖాళీ `kʰˈaːɭiː`, ఘంటం `ɡʰˈaɳʈam`, ధన్యవాదాలు `dʰˈanjaʋˌaːdaːlu`,
          # భోజనం `bʰˈoːdʒanam` -- aspiration emitted as a `ʰ` modifier on the stop and
          # right in every one, which is what makes this pack the first to put the
          # whole series in front of every reader table at once.
          "te": "te",
          # Romanian, and the opposite situation from Marathi/Ukrainian above:
          # checked before assuming the loader was needed, and it is not.
          # `/usr/lib/x86_64-linux-gnu/espeak-ng-data/lang/roa/ro` is already in
          # this build's system-package data (1.50), so `EspeakBackend('ro')`
          # finds it directly -- the Telugu precedent (`te_dict` already in the
          # 1.50 tree) rather than the Marathi/Ukrainian one. Never point
          # `PHONEMIZER_ESPEAK_LIBRARY`/`_DATA_PATH` at the loader for a `ro`
          # run: there is nothing here for the loader to fix, and doing it
          # anyway would risk the exact cross-language drift the `uk` comment
          # above describes, for zero benefit.
          "ro": "ro",
          # Czech, and the Telugu/Romanian situation rather than the Marathi/
          # Ukrainian one: `EspeakBackend.supported_languages()['cs'] == 'Czech'`
          # against the plain system library, no `PHONEMIZER_ESPEAK_*` set, so
          # this build's own 1.50 data tree already has it and the loader is
          # never touched for `--only cs`.
          #
          # Probed on exactly what Czech orthography is not transparent about,
          # matching the method `GRADE["pl"]`/`GRADE["hu"]` use for the same
          # kind of language. **ř devoicing after a voiceless consonant is
          # right**: `tři` -> `tr̝̊i`, `přes` -> `pr̝̊es`, both with the
          # voiceless ring correctly placed. **Word-initial stress is right on
          # every probe**, long words and proclitic fusion included
          # (`ˈaʊtomˌobil`, `do domu` -> `dˈodomu`) -- so, like Polish, stress
          # is looked up rather than derived: no `cs_stress` override function
          # is needed, because espeak already agrees with Czech's own
          # exceptionless first-syllable rule everywhere tried. **Syllabic r
          # and l are right** on every inflected form probed (krk, prst, smrt,
          # srp, trh, vlku, vlkodlak, vlna, plný, plzeň all correct) with one
          # dictionary-level exception: the bare headwords `vlk` (wolf) and
          # `plch` (dormouse) are spelled out letter-by-letter in isolation
          # (`veːelkaː`, `peːeltseːhaː`) regardless of context, which is a
          # defect in those two specific dictionary entries rather than in the
          # syllabic-consonant mechanism -- neither word is in this pack.
          # **What is wrong, and systematic**: word-initial/-medial `kd` never
          # voices to [ɡd] -- `kdo`, `kde`, `kdy`, `kdyby`, `nikdo`, `nikdy`
          # all keep a voiceless `k` where standard Czech has regressive
          # voicing assimilation (Palková, *Fonetika a fonologie češtiny*),
          # while the general assimilation rule is applied correctly
          # elsewhere (sbírka -> zbˈiːrka, prosba -> prˈozba, svatba ->
          # svˈadba, pod stromem -> pˈotstromem). Repaired below, because
          # `kdo/kde/kdy` are exactly the high-frequency interrogatives a
          # travel pack cannot avoid.
          "cs": "cs",
          # Punjabi, and **`pa_dict` is in this build's installed 1.50 data tree**
          # beside `hi`, `bn`, `ur`, `gu` and `mr` under `espeak-ng-data/lang/inc/`,
          # so the `espeakng-loader` escape Ukrainian and Marathi needed above is
          # **not needed here** -- checked with the plain system library and no
          # `PHONEMIZER_ESPEAK_*` set before anything was installed. Never point
          # those two variables at the loader for a `pa` run: there is nothing here
          # for the loader to fix and it would risk the cross-language drift the
          # `uk` comment describes for no benefit.
          #
          # **The reason this voice can be used is that it implements Punjabi
          # tonogenesis, which is the fact Punjabi is in the corpus to prove.** The
          # historical voiced aspirates ਘ ਝ ਢ ਧ ਭ are written and not said: word
          # initially they came out voiceless and unaspirated with a **low tone** on
          # the following vowel, and non-initially they left a **high tone** on the
          # preceding one. Probed word-initially before the voice was trusted, on all
          # five letters -- ਘੋੜਾ `kˈo+r.a`, ਘਰ `kˈʌ+ɾ`, ਝੂਠ `cˈu+ʈʰ`, ਢੰਗ `ʈˈʌ+nɡ`,
          # ਧੰਨਵਾਦ `tˌə+nnəvˈad`, ਭਾਰਤ `pˈa+ɾət` -- and right on every one, with the
          # tone written as an ASCII `+`, which is espeak's internal marker rather
          # than IPA and is repaired below. All 20 such words in the pack got it;
          # there is no lexicon miss of Tamil's kind.
          #
          # **What it does not do is the non-initial half**, and that is why
          # `pa_tone` below exists: ਦੁੱਧ comes back `dˈʊdʰ` and ਲਾਭ `lˈabʰ`, keeping a
          # voiced aspirate that modern Punjabi does not have, where the language says
          # [dʊ́d] and [lɑ́b]. The voice is internally inconsistent about the same
          # sound, which is what makes this an omission rather than a transcription
          # choice.
          "pa": "pa",
          # Swedish, confirmed with `EspeakBackend.supported_languages()` against
          # the plain system library (this build's espeak-ng-data 1.50 already
          # ships `sv`) before considering `espeakng_loader` at all -- no
          # `PHONEMIZER_ESPEAK_*` override needed, matching Czech's and Polish's
          # finding rather than Ukrainian's or Marathi's.
          #
          # **Probed for the one thing this language is in the corpus to prove --
          # lexical pitch (accent 1/accent 2, "anden" the duck against "anden" the
          # spirit) -- and the voice does not write it.** Both readings of `anden`
          # phonemize identically (`ˈandən`), and so do other standard minimal
          # pairs (`tomten`, `anden`); there is no tone letter, no extra stress
          # mark, nothing in the output that varies with which word was intended.
          # SAOL (Svenska Akademiens ordlista) *does* have a native notation for
          # this -- a superscript 3/4 after the long segment, in its own
          # pronunciation key -- so the omission is the G2P's, not the
          # orthography's; there is simply nothing here to carry to the `ipa`
          # column, and inventing marks espeak cannot produce would make every
          # unmarked row look like a claim of accent 1 rather than an absence of
          # data. See the reader-table notes below for what this means for
          # `sv__sv-SE.json`.
          #
          # **The sj/tj fricatives cost the corpus no new symbol.** `sjuk`,
          # `stjärna` and `sju` come back with the sj-sound written `sx` (ASCII
          # for /ɧ/, which `phonemesOf` splits into the already-common `s` + `x`);
          # `tjugo`, `kött` and `kyrka` get the tj-sound as plain `ɕ`, already in
          # the corpus from Polish's ś and Russian's palatalised sibilants. Loan
          # /ʃ/ (`garage`, `choklad`) is kept separate from both, correctly.
          #
          # **Vowel length is written on the vowel, as `ː`, which is what
          # `policy.length` in the reader table below needs** -- confirmed on
          # minimal pairs mat/matt, vit/vitt, sol/full (long vowel gets `ː`, short
          # vowel does not) rather than assumed from the orthography. What the
          # voice does *not* reproduce is Swedish's own spelling convention of
          # doubling the *following consonant* after a short stressed vowel
          # (väg/vägg): a handful of coda clusters before /t/ show the same
          # inconsistency un-repaired (`bort` keeps `rt`, `svart`/`kort` drop the
          # r entirely with no retroflex mark) with no single deterministic
          # substitution across them, unlike German's `??`, so it is left as a
          # graded weakness rather than patched.
          "sv": "sv",
          # espeak-ng ships one Gujarati voice and this build's **system**
          # espeak-ng-data 1.50 has it: `gu_dict` is in the installed tree and
          # `espeak-ng-data/lang/inc/gu` sits beside `hi`, `bn`, `pa`, `mr` and `ur`,
          # confirmed with `EspeakBackend.supported_languages()` against the plain
          # system library before reaching for anything else. So the
          # `espeakng_loader` escape `uk` and `mr` need is **not** needed here, and
          # per the warning on those two entries it must not be set for a run that
          # also touches an already-built language.
          #
          # It is used rather than a romanisation route over
          # `romanization_iso15919`, and unlike Tamil the reason is not that the
          # script hides something. Gujarati writes voicing and aspiration both, so a
          # letter-by-letter route would have carried the same information -- but the
          # voice supplies the three things the letters do not say and gets two of
          # them right: the ordinary reading of ઝ as [z] (see the fold list), the
          # deletion of the word-final inherent vowel (ઘર `ɡʰʌɾ`, હાથ `haːtʰ`,
          # પુરુષ `puɾuʂ`), and the anusvara's split between a nasal consonant before
          # a stop (પંજો `pʌɲɟoː`, રંગ `ɾʌŋɡ`, ઠંડી `ʈʰʌɳɖi`) and vowel nasalisation
          # elsewhere (હું `hũ`, નહીં `nʌhĩ`).
          #
          # **The four-way stop series survives intact**, which is the thing to probe
          # before trusting any Indic voice: ધન્યવાદ `dʰənjəʋaːd`, ભારત `bʰaːɾʌt`,
          # ખાવાનું `kʰaːʋaːnũ`, છે `cʰeː`, ઠીક `ʈʰiːk`, ફોન `pʰoːn`, દૂધ `duːdʰ`,
          # ઘર `ɡʰʌɾ`, થોડું `tʰoːɖũ`. Aspiration comes back as a `ʰ` modifier bound
          # to the stop, and over the finished column the count of `ʰ` is 655 and the
          # counts of the nine aspirated units sum to exactly 655 -- so there is no
          # bare `ʰ` anywhere and the Hindi `dʰ` bug cannot recur here for the
          # structural reason Telugu's entry gives rather than by luck.
          "gu": "gu",
          # Kannada, and **`kn_dict` is in this build's installed system
          # espeak-ng-data 1.50** -- `espeak-ng-data/lang/dra/kn` sits beside `ta`,
          # `te` and `ml`, and `EspeakBackend.supported_languages()['kn']` is
          # `'Kannada'` against the plain system library with no
          # `PHONEMIZER_ESPEAK_*` set, confirmed before reaching for anything else.
          # So the `espeakng_loader` escape `uk` and `mr` need is **not** needed
          # here, and per the warning on those two entries it must not be set for a
          # run that also touches an already-built language.
          #
          # Used rather than a romanisation route over `romanization_iso15919`, and
          # the reason is neither Tamil's nor Telugu's. Kannada writes voicing and
          # aspiration both, and it writes every vowel it pronounces including the
          # short/long e and o -- so a letter-by-letter route would have carried the
          # same segments. What the letters do **not** say is the anusvara's place of
          # articulation, and this voice gets it right in **every environment the
          # pack contains**, checked one by one before it was trusted: ಂಬ `mb`
          # (ತುಂಬಾ `tumbaː`), ಂಪ `mp`, ಂಭ `mbʰ`, ಂಸ `ms` (ಮಾಂಸ `maːmsɐ`), ಂತ `nt`,
          # ಂದ `nd`, ಂಧ `ndʰ`, ಂಟ `ɳʈ` (ಪಾಯಿಂಟ್ `paːjiɳʈ`), ಂಡ `ɳɖ`, ಂಕ `ŋk`,
          # ಂಖ `ŋkʰ`, ಂಗ `ŋɡ`, ಂಜ `ɲɟ` (ಸಂಜೆ `sɐɲɟe`), and word-finally `m`
          # (ಎಟಿಎಂ `eʈiem`). That is the whole of what `te_anusvara` had to be
          # written by hand for and what `pa_nasal` had to regularise, so **no new
          # per-language function is needed here** -- which is Gujarati's outcome
          # rather than Telugu's.
          #
          # **The full four-way stop series survives, all ten aspirates**, which is
          # the thing to probe before trusting any Indic voice: ಧನ್ಯವಾದ
          # `dʰɐnjɐvaːdɐ`, ಭಾರತ `bʰaːɹɐtɐ`, ಖಾಲಿ `kʰaːli`, ಘಂಟೆ `ɡʰɐɳʈe`, ಫೋನ್
          # `pʰoːn`, ಥಟ್ಟನೆ `tʰɐʈʈɐne`, ಛತ್ರಿ `cʰɐtɹi`, ಝರಿ `ɟʰɐɹi`, ಠೀಕು `ʈʰiːku`,
          # ಢಾಳ `ɖʰaːɭɐ`. Aspiration comes back as a `ʰ` modifier bound to the stop,
          # and over the finished column the count of `ʰ` is 152 while the counts of
          # the eight aspirated units the pack actually produces (`pʰ dʰ tʰ bʰ kʰ ʈʰ
          # cʰ ɡʰ`) sum to exactly 152 -- so there is **no bare `ʰ` anywhere** and
          # the Hindi `dʰ` bug cannot recur, for the structural reason Telugu's entry
          # gives rather than by luck. `ɟʰ` and `ɖʰ` have no row in this pack: ಝ and
          # ಢ are real Kannada letters that no concept in the bank happens to need,
          # which is a fact about the bank rather than about the language.
          #
          # **Gemination is written as a doubled consonant, not as a length mark**,
          # checked over the whole pack: ಇಲ್ಲ `illɐ`, ಇದ್ದಾರೆ `iddaːɹe`, ಗಡ್ಡೆ
          # `ɡɐɖɖe`, and there is **not one consonant+`ː` sequence in the column**.
          # So `GEMINATE_DOUBLES` is not needed, unlike Punjabi's and Gujarati's.
          "kn": "kn",
          # Nepali is in this build's **system** espeak-ng-data (1.50) directly --
          # unlike `mr`/`uk`, no `espeakng_loader` is needed. Confirmed with
          # `EspeakBackend.supported_languages()['ne']` and a direct probe against the
          # plain system library, no `PHONEMIZER_ESPEAK_*` set:
          # `EspeakBackend('ne').phonemize(['नमस्ते'])` -> `'nəmʌsteː '`, a correct
          # reading with the schwa retained. See `REPAIR["ne"]` for the one defect
          # this voice shares with `hi`/`mr`.
          "ne": "ne"}

# Phonemised one word at a time rather than a phrase at a time, which every other
# espeak language is.
#
# Phrase-level is deliberate elsewhere: French liaison and Spanish cross-word
# assimilation only appear if the words are given to espeak together. Hungarian gets
# nothing from it and loses two things. Measured rather than assumed -- every phrase
# in the pack was phonemised both ways, and the *only* differences are word fusion
# and stress demotion, never a segment: `hat gyerek`, `vonat jegy` and every other
# assimilation environment come out identical.
#
# What it loses is word boundaries. espeak's Hungarian dictionary fuses a proclitic
# into the word after it -- `nem beszélek` is one token `nˈɛmbɛseːlɛk`, and so are
# `nem értem`, `nem tudom`, `nem kérek`, `ez az` and `elnézést kérek` -- and `nem` is
# the most frequent word in a phrasebook's negatives. A respelling then prints one
# unbroken word where the card shows two, so the two columns stop lining up.
WORD_AT_A_TIME = {"hu"}

# Languages read off a curated romanisation column instead, and which column.
#
# Klingon and Quenya are here for the opposite reason from the first three. Those
# have a native orthography a letter-by-letter route cannot read, so the
# romanisation is a *convenience*. These two have no published native text at all:
# every source prints Okrand's or Tolkien's Latin transcription, so the romanisation
# is the attested cell and `text` is transliterated *out* of it by
# `scripts/transliterate_native.py`. Reading `text` here would ask the `okrand` and
# `appendix-e` routes to phonemise pIqaD and tengwar codepoints, which is not what
# either of them is a table of.
ROMANISED = {"zh-Hans": "romanization_pinyin", "ja": "romanization_hepburn",
             "ko": "romanization_rr", "he": "romanization_bgn",
             "tlh": "romanization_okrand", "qya": "romanization_appendix-e",
             # **Amharic is here for a reason none of the other five has: the fidal
             # carries *less* information than the romanisation, so the romanisation
             # is the authored cell and `text` is derived from it.** Amharic
             # geminates phonemically -- አለ is both *ala* "he said" and *alla* "there
             # is", one and the same string of letters -- and the script does not
             # write gemination at all. Nor does espeak's `am` voice: probed over 90
             # words it emits **zero** length marks. So the `ipa` column is the only
             # column in an Amharic row that can carry it, which is Tamil's finding
             # about voicing arrived at from the other end. The same column also
             # resolves the sixth order, whose vowel is pronounced in ስንት /sɨnt/ and
             # not in ገንዘብ /ɡənzəb/ -- a distinction BGN/PCGN's own Note 1 delegates
             # to pronunciation and espeak gets wrong on most polysyllables.
             "am": "romanization_bgn"}

# Whether espeak's word-level stress marks are kept.
#   keep    the language has lexical stress and espeak finds it
#   phrase  stress is phrasal, so only the last word of a run keeps its mark
#   none    the language has no lexical stress; espeak marks one anyway
#
# This is the curated `has_lexical_stress` boolean `content/RESPELL-PILOT.md` §7
# asks for, except that it lives here rather than in `data/registry/languages.csv`.
# A rule table cannot derive it -- espeak emits `ˈ` for Korean and Vietnamese,
# which have no lexical stress at all -- but it does not need to be told either, if
# the generator simply does not write a mark it cannot justify.
STRESS = {"fr": "phrase", "ko": "none", "vi": "none", "ja": "none",
          # **Punjabi stress is not contrastive and espeak's is the first syllable**,
          # which is Telugu's finding in another language and was measured the same
          # way. Over the 671 polysyllables of the finished pack, espeak's primary
          # mark agrees with "the first syllable" on **72%**, with "the penult" on
          # 62%, with "the leftmost heavy syllable" on 52% and with "the rightmost
          # heavy syllable" on 12% -- so it follows no rule Punjabi grammars state,
          # and ਗੁਰਮੁਖੀ comes back `ɡˈʊɾəmˌʊkʰi` where the word is [ɡʊɾmʊkʰˈi].
          #
          # And there is a second reason here that Telugu did not have: **this column
          # already carries prominence, as tone.** Punjabi's contrastive prominence is
          # the high/low tone `pa_tone` writes, and adding a non-contrastive stress
          # mark beside it would give one column two prominence devices -- an acute
          # for a Spanish reader on a syllable the language does not stress, next to a
          # tone the language does. Tamil refused a stress prime for the same reason.
          "pa": "none",
          # **Kannada stress is not contrastive and espeak's is the first syllable,
          # unconditionally** -- which is a sharper measurement than Punjabi's or
          # Gujarati's, because the number is not a percentage. Over the **1,772**
          # polysyllables of the finished pack the primary mark lands on the first
          # syllable **1,772 times**, so this voice is applying a rule rather than
          # looking anything up.
          #
          # The rule it is applying is roughly Kannada's own. Sridhar (*Kannada*,
          # Descriptive Grammars, 1990) and Schiffman both state that Kannada has no
          # phonemic stress and that such prominence as there is falls on the initial
          # syllable **unless that syllable is light and the next holds a long
          # vowel** -- ಪ್ರಯಾಣ, ವಿಮಾನ, ಸಹಾಯ. **77 of the pack's 858 distinct
          # polysyllables (9%) are in that environment by vowel length alone**, and
          # espeak never implements the exception. Deriving it the way `hu_stress`
          # does does not reach, for Telugu's reason: the exception is stated over
          # syllable *weight* and nothing here syllabifies.
          #
          # So the mark is dropped, which is what Tamil, Telugu, Punjabi and Gujarati
          # all do: it would be a capital for an English reader and an acute for a
          # Spanish one on a syllable the language does not contrast, and Kannada
          # vowels do not reduce, so an unmarked respelling is fully intelligible.
          "kn": "none",
          "zh-Hans": "none", "th": "none", "tlh": "none",
          # **Persian stress is not lexical, and espeak's is wrong in a systematic
          # direction, so this is the one place both halves of the rule agree.**
          #
          # Persian stress is predictable from morphology: the final syllable of a
          # nominal, the *prefix* of a prefixed verb (mi-, be-, na-), and never an
          # enclitic. espeak prefers the initial syllable of a nominal, which is the
          # opposite of the rule -- `kˈetɑb` for ketā́b, `xˈɑne` for khāné, `mˈardom`
          # for mardóm, `pˈolis` for polís, `pˈezeʃk` for pezešk, `kˈomak` for komák,
          # `bimˈɑrestˌɑn` for bimārestā́n. Keeping it would tell all twenty-two
          # reader tables to shout the wrong syllable.
          #
          # Deriving it the way `hu_stress` does was the alternative and it does not
          # work here: Hungarian's rule is positional and exceptionless, Persian's
          # runs in *opposite directions* for nominals and verbs, and nothing in this
          # pipeline knows which a word is. `می`/`نمی` are detectable from the text
          # and the rest of the verb prefixes are not, so a derived mark would be
          # right on the nouns and backwards on half the verbs -- and a mark in the
          # wrong place is worse than no mark, because a reader with no capital falls
          # back on their own language's default while a reader with the wrong capital
          # is actively misled.
          #
          # What it costs is small and that is the third reason: Persian vowels do not
          # reduce, so an unstressed syllable is spelt and said the same as a stressed
          # one and an unmarked respelling is fully intelligible. Russian, where the
          # vowel quality depends on the stress, could not have made this trade.
          "fa": "none",
          # **Tamil stress is not contrastive, and espeak's is wrong in exactly the
          # place the generalisation has an exception -- so this is Persian's case,
          # not Hungarian's.**
          #
          # Keane's IPA illustration of Tamil (Journal of the IPA 34(1), 2004) states
          # that stress is not contrastive, and that the first syllable tends to be
          # prominent *unless* it is short and the second syllable holds a long vowel.
          # espeak marks the first syllable and never that exception: விமானம் comes
          # back `vˈimaːnʌm` where the generalisation puts the prominence on `maː`,
          # and that shape covers a large class of the Sanskrit-derived nouns this
          # pack is full of -- சுற்றுலா, பரிசோதனை, மருத்துவமனை, கடவுச்சீட்டு.
          #
          # Deriving it the way `hu_stress` does was the alternative and it does not
          # reach: Hungarian's rule is positional and exceptionless, and Tamil's
          # exception is stated over *syllable weight*, which needs a syllabification
          # this script does not do. A mark in the wrong place is worse than no mark
          # -- the Persian argument -- and it costs less here than it does there,
          # because Tamil vowels do not reduce: an unstressed syllable is said
          # exactly as a stressed one, so an unmarked respelling is fully
          # intelligible rather than merely flat.
          "ta": "none",
          # **Telugu is Tamil's case exactly, and the exception is the same one.**
          #
          # Krishnamurti and Gwynn's *A Grammar of Modern Telugu* (OUP 1985) states
          # that stress is not contrastive and that the first syllable is prominent
          # *unless* it is light and the second holds a long vowel, in which case the
          # second takes it. espeak marks the first syllable unconditionally and never
          # that exception, and the exception is a large class in this pack -- the
          # Sanskrit-derived nouns in -āṇaṁ and -ānaṁ: విమానం comes back `ʋˈimaːnan`
          # where the rule puts the prominence on `maː`, and so do ప్రయాణం, సహాయం,
          # పరిశోధన. It is right where the first syllable is heavy (ధన్యవాదాలు
          # `dʰˈanja…`), which is what makes this a rule error rather than a lexicon
          # one.
          #
          # Deriving it the way `hu_stress` does does not reach, for Tamil's reason:
          # the exception is stated over syllable *weight*, and nothing here
          # syllabifies. A mark in the wrong place is worse than no mark, and it costs
          # less here than in Russian because Telugu vowels do not reduce -- an
          # unstressed syllable is said exactly as a stressed one.
          "te": "none",
          # **Filipino stress is lexical and contrastive** -- `buhay` "life"
          # [ˈbuhaj] against `buhay` "alive" [buˈhaj] is the textbook pair -- so
          # this is not Hungarian's case (positional, exceptionless, worth
          # deriving). It is closest to Persian's: there is nothing mechanical to
          # derive it from, and unlike Persian there is not even a morphological
          # rule to try, because there is no espeak voice and no machine-readable
          # pronouncing dictionary for Tagalog/Filipino to look one up from either
          # (`fil_to_ipa` never emits a stress mark at all, so this entry changes
          # nothing in practice -- it is here to make the decision explicit and
          # searchable rather than an accident of a function that happens not to
          # produce one).
          "fil": "none",
          # **Gujarati stress is not contrastive and espeak marks the penult even
          # when the penult is a schwa**, which is exactly the half of the rule the
          # language does not follow. Measured over the 1,650 polysyllables of the
          # finished pack: espeak's primary mark agrees with "the penult" on 84%,
          # with the first syllable on 54%, with the leftmost long vowel on 52%, with
          # the antepenult on 1% -- and with **Gujarati's own rule on only 67%**.
          # That rule is Mistry's (*Gujarati Phonology*, 1997) and Cardona's (*A
          # Gujarati Reference Grammar*, 1965): the penultimate vowel, unless it is
          # /ə/, in which case the one before it. કેટલો comes back `keːʈˈʌloː` where
          # the word is [ˈkeʈlo], and a third of the pack's polysyllables carry the
          # mark on a schwa in the same way.
          #
          # **Deriving it the way `hu_stress` does was considered and refused**, and
          # the reason is a property of this column rather than of the language: the
          # rule's condition is stated over vowel *quality*, and this voice writes
          # the one Gujarati inherent vowel two ways -- `ʌ` on 905 cells and `ə` on
          # 440, on no discernible principle beyond espeak's own stress placement --
          # so the predicate the derivation needs is the distinction the column does
          # not reliably carry. An unmarked respelling costs nothing here: Gujarati
          # vowels do not reduce, and a wrong mark is a capital for an English reader
          # and an acute for a Spanish one on a syllable the language does not
          # stress. Tamil, Telugu, Punjabi, Persian and Filipino all reached "none"
          # by one or other half of this argument.
          "gu": "none",
          # **Amharic stress is not lexical and this route writes none**, so the
          # entry is a decision made explicit rather than a filter on anything --
          # `am_to_ipa` emits no mark at all, the way `fil_to_ipa` does not. Amharic
          # prominence is phrasal and largely predictable from the gemination and
          # vowel length already in the column; Leslau's grammar and the *Handbook of
          # the IPA* illustration both state that it is not contrastive, and there is
          # no espeak mark to keep or drop because the espeak route is not used.
          "am": "none"}

# Which packs write `text` in something other than the Latin alphabet, so that a
# Latin run left in one is a loanword rather than the language. `tlh` and `qya` are
# in here because their `text` is pIqaD and tengwar; the gate finds nothing to
# refuse in either -- neither pack quotes a Latin loanword -- and they are named
# anyway so that the next row that does quote one is asked the same question.
NON_LATIN = {"zh-Hans", "ja", "ko", "th", "hi", "ar", "ru", "el", "tlh", "qya", "he",
             "fa", "ur",
             # Bengali writes every loanword in its own script -- ওয়াই-ফাই, এটিএম, সিম,
             # প্ল্যাটফর্ম -- so the pack quotes no Latin at all and this gate finds
             # nothing to refuse. Named anyway, so the next row that does quote a
             # Latin acronym is asked the same question.
             "bn",
             # Tamil writes its loanwords in its own letters too -- வைஃபை, சிம் கார்டு,
             # ஏடிஎம், க்யூஆர், போர்டிங் பாஸ் -- so no `text` cell in the pack quotes
             # Latin, checked over all 826. `atm-cash.pin` and `sim-data.esim` keep
             # `PIN` and `eSIM` in `text_alt`, which takes no `ipa`. Named anyway, so
             # the next row that does quote one is asked the same question.
             "ta",
             # Telugu writes its loanwords in its own letters too -- పాస్పోర్ట్,
             # ప్లాట్ఫారం, వైఫై, ఏటీఎం, సిమ్ కార్డు, బోగీ -- so no `text` cell that
             # this script transcribes quotes Latin, checked over all 828. `PIN`,
             # `eSIM` and `1,00,000` are in `text_alt`, which takes no `ipa`, and the
             # six rows that really do quote Latin (`shi yi`, `juuichi`, `saa moja`,
             # `B2`, `bakso`, `damn`) are all `note` rows, which this script skips on
             # principle. Named anyway, so the next row that does quote one is asked
             # the same question.
             "te",
             # Punjabi writes its loanwords in Gurmukhi too -- ਏਟੀਐਮ, ਵਾਈ-ਫ਼ਾਈ,
             # ਪਿਨ ਨੰਬਰ, ਈ-ਸਿਮ, ਕਿਊਆਰ ਕੋਡ, ਪਾਸਪੋਰਟ, ਪਲੇਟਫ਼ਾਰਮ -- so no `text` cell
             # this script transcribes quotes Latin, checked over all 831. `PIN`,
             # `eSIM`, `1,00,000` and the ASCII digits ride in `text_alt`, which takes
             # no `ipa`. Three rows really do quote Latin and all three are refused
             # here rather than guessed at: the two Chinese/Japanese `note` rows,
             # which this script skips on principle, and `common-signs.pork-code`,
             # whose whole content is `B2 · BPK · bakso` -- the gate doing exactly
             # the job its comment describes, which is what Telugu's own pork-code
             # row records.
             "pa",
             # Gujarati writes its loanwords in its own letters too -- એટીએમ,
             # વાઇ-ફાઇ, પિન, ઈ-સિમ, ક્યુઆર કોડ, પાસપોર્ટ, પ્લૅટફૉર્મ -- so no `text`
             # cell this script transcribes quotes Latin, checked over all 832.
             # `PIN`, `eSIM` and the ASCII digits ride in `text_alt`, which takes no
             # `ipa`. Four rows really do quote Latin and all four are refused here
             # rather than guessed at: the three `note` rows that name Chinese,
             # Japanese and Swahili readings, which this script skips on principle,
             # and `common-signs.pork-code`, whose whole content is
             # `B2 · BPK · bakso` -- the gate doing exactly the job its comment
             # describes, which is what the Telugu and Punjabi pork-code rows record.
             "gu",
             # Amharic writes its loanwords in the fidal -- ኤቲኤም, ዋይፋይ, ፒን, ኢ-ሲም,
             # ፓስፖርት, ሆስፒታል -- so no `text` cell this script transcribes quotes
             # Latin, checked over all 837. The one row that does is
             # `common-signs.pork-code`, whose whole content is `B2 · BPK · bakso`,
             # and `latin_survives` refuses it exactly as it does for `te`, `pa` and
             # `gu`. Worth stating separately for this pack because its route reads a
             # **romanisation** column, which is Latin from end to end: the narrower
             # question `latin_survives` asks -- does a Latin run of `text` survive
             # into the string the route reads -- is what makes that safe.
             "am",
             # Kannada writes its loanwords in its own letters too -- ಎಟಿಎಂ,
             # ವೈ-ಫೈ, ಪಿನ್, ಇ-ಸಿಮ್, ಕ್ಯುಆರ್ ಕೋಡ್, ಪಾಸ್ಪೋರ್ಟ್, ಪ್ಲಾಟ್ಫಾರ್ಮ್ -- so no
             # `text` cell this script transcribes quotes Latin, checked over all
             # 838. `PIN`, `SIM`, `eSIM`, `ATM` and the ASCII digits ride in
             # `text_alt`, which takes no `ipa`. Five rows really do quote Latin and
             # all five are refused here rather than guessed at: the four `note` rows
             # that name Chinese, Japanese, Thai and Swahili readings, which this
             # script skips on principle, and `common-signs.pork-code`, whose whole
             # content is `B2 · BPK · bakso` -- the gate doing exactly the job its
             # comment describes, which is what the Telugu, Punjabi and Gujarati
             # pork-code rows record.
             "kn"}


# ------------------------------------------------------------------- alphabet
def _ranges(*spans):
    return {chr(c) for lo, hi in spans for c in range(lo, hi + 1)}


# IPA Extensions, spacing modifier letters (which is where the Chao tone bars
# live), and combining diacritics. All three blocks are complete in every shipped
# Latin face, so anything from them is safe to emit.
IPA_BLOCKS = _ranges((0x250, 0x2AF), (0x2B0, 0x2FF), (0x300, 0x36F))
# The ASCII and Latin-1 letters IPA uses. `g` is absent on purpose: the IPA voiced
# velar stop is U+0261 ɡ, and a face can draw a different shape for each.
IPA_LETTERS = set("abcdefhijklmnopqrstuvwxyz") | set("æçðøœħŋɐ")
# U+03B8 GREEK SMALL LETTER THETA. The only symbol for /θ/, which English, Swahili
# and Arabic contrast, and the one character here no shipped face can draw.
IPA_GREEK = {"θ"}
# Carried through from the source text rather than produced by a G2P.
MARKS = {"{}", "/", ",", " "}
ALPHABET = IPA_BLOCKS | IPA_LETTERS | IPA_GREEK | set("".join(MARKS))

VOWELS = set("iyɨʉɯuɪʏʊeøɘɵɤoəɛœɜɞʌɔæɐaɶɑɒ")
GLIDES = set("jwɥ")
NONSYLLABIC = "\u032F"        # "this vowel is not a syllable" -- so, an offglide
TAIL = set("ːˑ̃") | {NONSYLLABIC}          # length, nasalisation, non-syllabic
STRESS_MARKS = set("ˈˌ")
TONE = set("˥˦˧˨˩ˀ")


# ---------------------------------------------------- Bengali, on the way *in*
# **The corpus and espeak want opposite normalisations of the same three letters.**
# ড় ঢ় য় -- U+09DC, U+09DD, U+09DF -- have canonical decompositions *and* are Unicode
# composition exclusions, so NFC leaves them as base + U+09BC NUKTA and never
# composes them. `validate_data.py` requires NFC, so that is the form the pack must
# store. espeak's Bengali dictionary only knows the precomposed codepoints, and
# handed the decomposed sequence it **drops the vowel sign that follows**: গাড়ি comes
# back `ɡaɽ` instead of `ɡaɽi`, পড়া `pɔɽ`, হারিয়ে `haɾi`, পয়েন্ট `pɔnʈɔ`. That is a
# whole syllable gone, on **202 rows** of an 824-row pack.
#
# So the route composes on the way in. **Only before a dependent vowel sign**, which
# is the case that is broken and is measured rather than assumed: composing
# everywhere also changes 48 further rows and every one of those changes is *wrong*,
# because espeak gives the precomposed letter an inherent vowel word-finally --
# কোথায় becomes `kotʰajo` for [kothae] and যায় `dʒajo` for [dʒae]. Conditioning on
# the following matra fixes the 202 and touches none of the 48.
#
# This is Persian's `clean()` trap in the other direction, and worth reading beside
# it: there a `Cf` character the pack needed was being thrown away, here a
# normalisation the validator requires is one the G2P cannot read.
BN_NUKTA = {"\u09a1\u09bc": "\u09dc",       # ড় BENGALI LETTER RRA
            "\u09a2\u09bc": "\u09dd",       # ঢ় BENGALI LETTER RHA
            "\u09af\u09bc": "\u09df"}       # য় BENGALI LETTER YYA
# The dependent vowel signs, U+09BE..U+09CC and U+09D7.
BN_BEFORE_MATRA = re.compile("(" + "|".join(BN_NUKTA)
                             + ")(?=[\u09be-\u09cc\u09d7])")


def bn_compose(text):
    """`text` with ড় ঢ় য় composed where a vowel sign follows. See `BN_NUKTA`."""
    return BN_BEFORE_MATRA.sub(lambda m: BN_NUKTA[m.group(0)], text)


# Substitutions applied to every route's output before the alphabet is checked.
# Each is either a G2P artefact or a codepoint no shipped face can draw; none of
# them is a phonemic distinction in any language in the corpus.
FOLD = [
    ("͡", ""),   # tie bar: t͡ɕ -> tɕ. Two units to core/respell.js, one sound.
    ("͜", ""),
    ("̚", ""),   # unreleased, which every Thai final stop is: t̚ -> t
    ("χ", "x"),       # uvular -> velar. No language here contrasts them, and χ is
                      # U+03C7, which no shipped Latin face can draw.
    ("ᵻ", "ɪ"),       # espeak's reduced /ɪ/, U+1D7B, likewise undrawable
]

# Per-language repairs, applied before FOLD. All of these are notation this
# espeak-ng build emits that is not IPA at all; the value is what it stands for.
REPAIR = {
    # espeak writes the trill as a doubled tap, gives <ll>/<y> as `jj` in some
    # words and `ʝ` in others, and has a pre-nasal allophone of /e/ that Spanish
    # does not contrast. β/ð/ɣ are folded to their stops for two reasons at once:
    # they are positional allophones with no phonemic status in Spanish, so the
    # phonemic column core/respell.js asks for wants the stops -- and U+03B2 is one
    # of the three characters no shipped face can draw.
    "es": [("ɾɾ", "r"), ("jj", "ʝ"), ("ɛ", "e"), ("β", "b"), ("ð", "d"), ("ɣ", "ɡ")],
    # espeak marks an elidable schwa with a trailing hyphen: `ʒə-` for *je*.
    "fr": [("-", "")],
    # `r.` is ड़ /ɽ/, and `r.h` is ढ़; the bare `.` that is left over is noise.
    # **`Cːj` is a `C्य` conjunct, not a geminate.** क्या comes back `kːjaː` where the
    # word is [kjaː] with one consonant; `gu`'s entry below carries the full argument
    # and reported this here rather than editing another language's column. Applied by
    # the coordinating session: 131 `hi` cells and 6 `mr` ones, and क्या is the yes/no
    # question particle heading a large share of the pack's questions, so the spurious
    # geminate was telling all thirty-seven readers to double the first consonant of
    # the most frequent interrogative in the language. `REPAIR` runs before
    # `GEMINATE_DOUBLES`, so the real geminates are untouched.
    "hi": [("kːj", "kj"), ("tːj", "tj"), ("cːj", "cj"),
           ("r.h", "ɽʰ"), ("r.", "ɽ"), (".", "")],
    # Marathi shares Devanagari and the same espeak defect, on six cells.
    "mr": [("kːj", "kj"), ("tːj", "tj"), ("cːj", "cj")],
    # Bengali's two nukta consonants, and its length marks.
    #
    # `r.` is ড় /ɽ/ as it is in Hindi, but ঢ় is **`hr.`** and not `r.h` -- this voice
    # writes the aspiration *before* the tap (আষাঢ় `aʃahr.ɔ`, দৃঢ় `dɾihr.ɔ`), so the
    # order of the two substitutions is the opposite of Hindi's. Nothing else can
    # produce `hr.`: no row in the pack has হ immediately before ড়, checked over the
    # whole column. No `(".", "")` mop-up after them, unlike Hindi and Arabic --
    # measured at zero surviving dots over all 824 rows, and a dot that did survive
    # would make `check_alphabet` refuse the row, which is a blank cell rather than a
    # wrong one.
    #
    # **The length mark is folded out after a vowel and kept after a consonant.**
    # Bengali has no vowel length contrast -- ই/ঈ and উ/ঊ are spelling variants of one
    # sound -- and espeak writes `ː` on the *letter* rather than the sound: ওষুধ comes
    # back `oːʃudʰ` while কোথায়, the same vowel written with a matra, comes back
    # `kotʰaj`. Left in, 134 rows would tell twenty-three reader tables to double a
    # vowel or reach for a length device, and the identical sound elsewhere would not.
    # Persian's blanket `("ː", "")` is wrong here and that is the reason this is
    # enumerated per vowel instead: Bengali's **consonant** geminates are real and
    # phonemic -- সত্যি /ʃɔtti/, বাক্য /bakko/, সাহায্য /ʃahaddʒo/ -- and espeak writes
    # those with the same mark, on eleven rows.
    "bn": [("hr.", "ɽʰ"), ("r.", "ɽ")]
          + [(v + "ː", v) for v in "aeiouɔæɑɜãẽĩõũ"],
    # **Urdu is Hindi's phonology in another script, and the first three repairs are
    # Hindi's own**: this build writes ड़/ڑ /ɽ/ as `r.` and ढ़/ڑھ as `r.h` in the Urdu
    # voice exactly as it does in the Hindi one, and `.` was the *only* character
    # espeak's Urdu emitted that was nowhere in the corpus already -- so after these
    # three, Urdu costs the twenty-four existing reader tables nothing.
    #
    # The rest were measured over the 847 distinct words of the finished pack, and
    # each one is a place where this build's Urdu notation is not IPA or is not Urdu:
    #
    # `ph` for `پھ`: the aspirates come back with the modifier letter everywhere
    # (`ʈʰ ɟʰ kʰ bʰ dʰ ɡʰ cʰ tʰ`) except in `پھر`, where the dictionary entry gives a
    # plain `h`. A bare `ph` cannot arise any other way -- an Urdu `پ` followed by a
    # real /h/ always has a vowel between them (`پہلے` pˈʌhle, `پہنچانا` pahunchānā) --
    # so the substitution is unambiguous. Left as `ph`, `phonemesOf` splits it into
    # /p/ + /h/ and every reader spells two consonants where Urdu has one.
    #
    # `ʂ` and `ʐ`: the retroflex fricatives. Every one of the twelve `ʂ` came from a
    # ص (صبح, صرف, تصدیق, شخص, غصہ) and every one of the seven `ʐ` from a ظ (لفظ,
    # محفوظ, انتظار, حافظ) -- letters Urdu inherited from Arabic and pronounces as
    # plain /s/ and /z/. Urdu has no retroflex fricative at all, so neither symbol
    # can be right in this pack. (`ʂ` *is* right in Hindi, for ष, which is why this
    # is a per-language repair and not a FOLD.)
    #
    # `nahˈiːn` and `huːn`: espeak realises the noon ghunna as nasalisation nearly
    # everywhere -- `میں` mˈẽ, `ہیں` hẽ, `ہاں` hˈãː, `کیوں` kjˈũː, `بچوں` bˈʌcõː --
    # and as a full /n/ in exactly two words, which are the 1sg copula and the
    # negator: the two most frequent words in the pack. Both are lexical dictionary
    # defects rather than notation, so the repair is lexical, and it is safe by
    # measurement rather than by argument: over those 847 words `huːn` occurs only in
    # `ہوں` and `nahˈiːn` only in `نہیں`. A general rule was tried and refused -- a
    # real final /n/ after a long vowel exists (`مکین` məkˈiːn, `قانون` qˈaːnuːn,
    # `سکون` sʊkˈuːn), so `iːn -> ĩː` would have broken those.
    #
    # `w` -> `ʋ` and `r` -> `ɾ`, both for the reason `el`'s rhotic repair records.
    # Urdu has one labial approximant and one rhotic; espeak writes the labial as `ʋ`
    # in 51 places and `w` in one (`وہ`), and the rhotic as `r` in all 393. `r` is the
    # *trill*, and the English table spells a non-initial `r` as `rr`, so leaving it
    # would tell every reader to roll an Urdu tap. `ɾ` is also what Hindi's own column
    # carries for the same sound in 496 of its 524 rhotics -- Hindi and Urdu are one
    # spoken language, and the two packs must not disagree about a phoneme.
    "ur": [("r.h", "ɽʰ"), ("r.", "ɽ"), (".", ""), ("ph", "pʰ"),
           ("ʂ", "s"), ("ʐ", "z"),
           ("nahˈiːn", "nahˈĩː"), ("huːn", "hũː"),
           ("w", "ʋ"), ("r", "ɾ")],
    # espeak inserts a stray `.` before a long vowel in Arabic: `i.ː` for `iː`.
    "ar": [(".", "")],
    # `u"` is the fronted /u/ between palatalised consonants, and `ɪ^` is what a
    # soft sign on a final consonant comes out as: `dvʲˈerɪ^` for дверь /dvʲerʲ/.
    # And espeak writes ы as `y`, which in IPA is the close front *rounded* vowel:
    # Russian has no such phoneme, so a bare `y` can only be /ɨ/, and leaving it
    # would have `добрый` respelled with the vowel of French `tu`.
    "ru": [("u\"", "ʉ"), ("ɪ^", "ʲ"), ("y", "ɨ")],
    # espeak writes Ukrainian в as β (voiced bilabial fricative), which is not IPA
    # for the sound and not one of the three characters `FOLD` already strips for
    # being undrawable -- Greek established U+03B2 in this corpus for its own /v/,
    # and only 5 of 26 reader tables have a rule for it, so a plain FOLD here would
    # cost the other 21 a new rule for a symbol this pack does not actually need.
    # Ukrainian в is not [b] either (`ALLOPHONE`'s fold in core/respell.js is a
    # syllable-clustering heuristic for Spanish, not a respelling rule, and does not
    # reach the printed page) -- it is a labiodental approximant, [ʋ], which is
    # already the corpus's own symbol for exactly that sound: Urdu's و forced a `ʋ`
    # rule into all 26 existing reader tables. Folding в to `ʋ` here is therefore
    # both the phonetically closer answer (the brief's own "в is /w/ or /ʋ/, not
    # /v/") and the one that costs no other table anything, checked with
    # `grep -c '"ipa": "ʋ"' data/respell/rules/*.json` returning nonzero for all 26.
    # This build's uk voice reads the onset cluster шв- as /ɬβ/ instead of /ʃβ/ --
    # "швидко" is `ɬβˈɪtko`, and plain ш is correct everywhere it is not followed
    # by в (кошик -> koʃˈɪk, подушка -> podˈuʃka) -- and /ɬ/ is not a Ukrainian
    # sound at all, so every occurrence is this one dictionary defect and not a
    # real lateral. Repaired to ʃ before the в->ʋ fold runs, so швидку comes out
    # ʃʋˈɪtku rather than ɬʋˈɪtku. Three rows in this pack hit it (швидку,
    # швидкісний x2), all in the frequent швидк- "fast/ambulance" family.
    #
    # This voice also marks dentality on nearly every т/д (565 of this pack's
    # cells carry U+032A), which no target in the corpus contrasts and which no
    # other reader table has a rule for -- Russian's own т/д carry no such mark,
    # so the symbol never had to be handled before. And it marks palatalisation
    # on a handful of consonants with a bare ʲ (14 cells), which this table's own
    # phoneme list already drops (`"ipa": "ʲ", "out": ""`) and Polish's table
    # does not, so leaving either in would cost every reader table that lacks a
    # rule a gap the moment uk landed as a target -- caught by
    # `node scripts/respell_check.mjs pl uk --gaps`. Both are dropped here, at
    # generation time, rather than patched into two dozen reader tables: neither
    # carries information any of them could use.
    "uk": [("̪", ""), ("ʲ", ""), ("ɬβ", "ʃβ"), ("β", "ʋ")],
    # Two repairs, both about ř and neither a guess.
    #
    # `("̊", "")` strips the ring this voice adds to mark ř's predictable
    # voiceless allophone after a voiceless consonant (tři -> tr̝̊i, přes ->
    # pr̝̊es, both probed and correct as *phonetics*). Czech spelling has
    # exactly one letter, ř, for both allophones, because the devoicing is
    # automatic and never contrastive -- the same argument REPAIR["uk"]
    # above makes for dropping a dentality mark no target contrasts. Left
    # in, every reader table gains a second ř-like phoneme (`r̝̊`) worth
    # nothing over the first, for zero rows any table needs it on: Czech's
    # own `core/respell.js` binds `r̝` (not `r̝̊`) into CONSONANT_TAIL,
    # by design, so a surviving ring would simply be an unbound stray mark.
    #
    # `("kd", "ɡd")` repairs word-initial/-medial /kd/ never voicing to
    # [ɡd] -- kdo, kde, kdy, kdyby, nikdo, nikdy all keep espeak's voiceless
    # k where standard Czech has regressive voicing assimilation (Palková,
    # *Fonetika a fonologie češtiny*; this is the textbook example of the
    # rule). Safe as a blanket string substitution: checked over the whole
    # built `cs` column for any word where a genuine /k/+/d/ sequence should
    # NOT assimilate, and none exists -- Czech's own assimilation rule is
    # general to the whole obstruent inventory, and every other cluster this
    # voice was probed on already gets it right (sbírka -> zbˈiːrka, prosba
    # -> prˈozba, svatba -> svˈadba, pod stromem -> pˈotstromem), so /kd/ is
    # this dictionary's own isolated gap rather than a different rule.
    "cs": [("̊", ""), ("kd", "ɡd")],
    # This voice reads a/ă written before an i-glide as a front rounded vowel
    # instead of the language's usual /ɨ/: mâine ("tomorrow") comes back
    # `mˈyɪne` and pâine ("bread") `pˈyɪne`, where the correct reading is
    # `ˈmɨjne`/`ˈpɨjne` -- the same â this voice gets right everywhere else
    # (vârf vˈɨrf, mâna mˈɨna, câmp kˈɨmp, românește rˌomɨnˈeʃte all read
    # correctly). Checked rather than assumed to be isolated: câini
    # ("dogs") shows the identical substitution (`kˈyɪnʲʲ` for `ˈkɨjnʲ`), so
    # this is one dictionary rule keyed on the following -i rather than a
    # one-word fluke. /y/ is not a Romanian phoneme and does not otherwise
    # appear in this voice's output, so the fold is unconditional rather
    # than needing a following-context guard.
    # This voice inserts a secondary-stress mark ˌ directly after a
    # palatalisation mark ʲ on a word-final consonant, in words whose primary
    # stress falls two or more syllables from the end -- astazi (today) is
    # `ˈastəzʲˌʲ`, vineri (Friday) `vˈineɾʲˌʲ`, faceti (2pl imperative "do")
    # `fˈatʃetsʲˌʲ`, and the same word plus an enclitic keeps it mid-string
    # (scrieti-mi "write to me" is `skrˈietsʲˌimʲ`). A secondary stress
    # belongs on a syllable, not wedged inside a single consonant's own
    # diacritics, so `ʲˌ` is folded to `ʲ` rather than kept: this is a
    # placement defect, not information a respelling could use. Found via
    # `node scripts/respell_check.mjs ro --gaps`, which showed `ˌ` reaching
    # all thirty other reader tables as a new, unmapped, mid-word artefact.
    #
    # **A second, independent defect, only visible after the first repair
    # runs**: this voice doubles the palatalisation mark itself on a
    # word-final consonant before Romanian's non-syllabic final -i --
    # bani (money) is `bˈanʲʲ`, marti (Tuesday) `mˈartsʲʲ`, luni (Monday)
    # `lˈunʲʲ`, imi (to me) `ˌɨmʲʲ`, and arata,ti (show, 4 syllables, no
    # embedded stress mark to confuse this with the first defect) is
    # `ˌaɾətˈatsʲʲ` -- clean of the first bug and still doubled. `ʲʲ` is
    # redundant by definition, the same argument Polish's own entry above
    # makes for a palatal nasal that already carries a bare `ʲ`: this is
    # about 100 rows across this pack, all at the same word-final
    # non-syllabic -i, and it reached `nl` as a target before it was
    # caught here -- `respell_check nl --units` showed a decomposed `ʃʲʲ`
    # reading Romanian, since a doubled modifier still decomposes into
    # base + `ʲ` + `ʲ` and both halves have rules, so `--gaps` alone never
    # saw it. Ordered after the `ʲˌ` fold, so `ʲˌʲ` collapses to `ʲʲ`
    # first and then to a single `ʲ`. No tripled `ʲʲʲ` form was found
    # anywhere in the corpus once both folds are checked.
    "ro": [("yɪ", "ɨj"), ("ʲˌ", "ʲ"), ("ʲʲ", "ʲ")],
    # This version of espeak emits a literal `??` for German short /ʊ/ before a
    # coda r -- `wurde` is `vˌ??də`, `Sturm` is `ʃtˈ??m` -- and `check_alphabet`
    # then refuses the whole row, which is why *Durchsage*, *Durchfall*, *gestohlen*
    # and *Sturm* had no `ipa` at all and so printed a blank respelling column.
    #
    # The substitution is not a guess. Probing the series shows `??` stands for
    # exactly one thing: every other vowel before a coda r comes out as `Vɾ` and is
    # correct -- Karte kˈaɾtə, Wort vˈɔɾt, Werk vˈɛɾk, Herz hˈɛɾts, warm vˈaɾm,
    # hart hˈaɾt -- and the mark appears only after a short u, in wurde, Sturm, Burg
    # and Furcht. Long /uː/ is unaffected (Kurs kˈuːɾs, Durst dˈuːɾst). So `??` is
    # `ʊɾ`, written the same way espeak writes the rest of the series.
    "de": [("??", "ʊɾ")],
    # Greek writes a few consonants double and pronounces every one of them single
    # -- and espeak follows the spelling for exactly one of them. Of the doubles in
    # the corpus (λλ, μμ, ππ, ββ, νν, γγ, κκ, ττ) it correctly gives a single
    # consonant for all but σσ: `θάλασσα` comes out `θˈalassˌa` and `τέσσερα`
    # `tˈesserˌa`. Modern Greek has no geminate, so a doubled `s` here is
    # orthography leaking through, and it would put a reader's respelling one
    # syllable out on `περισσότερο`.
    # And espeak writes the rhotic as `r`, the trill, where Modern Greek has a
    # single rhotic phoneme realised as an alveolar *tap*. The symbol is free for
    # Greek -- there is no contrast for it to carry -- and it is not free for the
    # readers: the English table spells a non-initial `r` as `rr`, fitted against
    # the curated Italian sheet where the trill is real, so 677 Greek rows were
    # telling an English reader to roll a tap (`kah-lee-MEH-rra`), and a Spanish or
    # Italian reader got their own doubled rhotic for the same reason. `ɾ` is what
    # the Spanish, Portuguese and Turkish columns already carry for the same sound.
    "el": [("ss", "s"), ("r", "ɾ")],
    # This voice writes Dutch short /ʏ/ (the vowel of nummer, munt, rug,
    # alstublieft) as U+0275 ɵ throughout rather than U+028F ʏ, the symbol this
    # corpus already uses for the identical sound in every other target that has
    # it. Checked rather than assumed: 134 rows carry it, all in a closed
    # syllable spelled with u, which is exactly `ʏ`'s own environment, and the
    # substitution is unconditional because this voice never emits ʏ at all --
    # so there is no real distinction being erased. Caught by
    # `node scripts/respell_check.mjs ru --gaps` the moment `nl` landed as a
    # target: 29 of 30 reader tables already carry a `ʏ` rule (the German-table
    # `ʏ` drift this file's own `VOICES` comment records), and folding here
    # rather than adding `ɵ` as a new symbol costs the thirtieth (Russian)
    # nothing extra either, per this project's own preference for a repair that
    # adds no new symbol over one that costs every reader table a rule.
    "nl": [("ɵ", "ʏ")],
    # Telugu. Five folds and eight assimilations, and the folds were chosen the way
    # Tamil's were: **every symbol this voice emits was looked up in all 29 shipped
    # rule tables before the column was generated**, because `--gaps` only reports a
    # hole after it has already reached a page. Two symbols had no rule anywhere --
    # `ʰ` and `ʲ`, both missing in `pl` and `ta` -- and they are the two this list
    # has to answer. `ʲ` is dropped; `ʰ` is *kept*, because a bare `ʰ` never reaches
    # a table (see `--units` in tmp/telugu.md) and the aspirated units it forms all
    # have rules of their own.
    #
    #   `ʲ`  espeak inserts a y-onglide before a word-initial front vowel -- ఎక్కడ
    #        comes back `ʲˈekkaɖa` -- which is a real phonetic detail of spoken
    #        Telugu and is not phonemic, is not written, and has no rule in `pl` or
    #        `ta`. Dropped, exactly as `REPAIR["uk"]` drops the same symbol for the
    #        same reason.
    #   `c ɟ`  espeak gives చ and జ as palatal *stops*. **Telugu has no palatal stop
    #        series**; both are affricates -- Krishnamurti's *The Dravidian
    #        Languages* and Krishnamurti & Gwynn's grammar both describe them as
    #        palato-alveolar affricates in the modern standard -- so they fold to
    #        `tʃ` and `dʒ`, which every table already has a rule for and which the
    #        Hindi and Bengali packs use for च/চ and ज/জ. Doing it as a bare fold
    #        also repairs the aspirates for free: `cʰ` becomes `tʃʰ` and `ɟʰ`
    #        becomes `dʒʰ`. What it discards is the dental-affricate realisation
    #        [ts]/[dz] before back vowels, which is real in some Telangana and
    #        coastal speech and which the archaic letters ౘ/ౙ once wrote; the
    #        standard is [tʃ]/[dʒ] and one pack cannot carry both.
    #   `ɕ`  espeak gives శ as an alveolo-palatal fricative. The corpus's symbol for
    #        this sound is `ʃ` -- it is what Hindi's श and Bengali's শ carry -- and
    #        keeping `ɕ` would have Telugu disagree with them about a phoneme the
    #        three share. ష is already `ʂ`, so the fold gives Telugu the same ś/ṣ
    #        split Hindi has rather than collapsing it.
    #   `ɹ`  four occurrences against 571 `r`, and Telugu ర is a tap or trill, not
    #        an approximant. `el`'s and `ur`'s rhotic repairs record the argument.
    #
    # **The eight assimilations are the anusvara, and they are the largest thing
    # this voice gets wrong.** ం is a *place-neutral* nasal in the orthography and
    # assimilates to whatever follows; espeak writes `n` for it everywhere, which is
    # right only before a dental or alveolar. So ంక is [ŋk] and comes back `nk`, ంబ
    # is [mb] and comes back `nb`, ండ is [ɳɖ] and comes back `nɖ` -- 263 corrections
    # over the pack. Safe as a bare string replacement, which was checked rather than
    # assumed: every `nC` of these eight shapes in the whole pack comes from a ం, not
    # one from a న్, because Telugu does not write a heterorganic nasal cluster
    # inside a word and a word boundary is a space. `nt`, `nd`, `ns`, `nl` and `nn`
    # are deliberately left alone -- those are the environments where `n` is already
    # the right nasal. The `c`/`ɟ` folds run first, so the palatal pair is written
    # `ntʃ`/`ndʒ` by the time these see it.
    "te": [("ʲ", ""), ("ɕ", "ʃ"), ("c", "tʃ"), ("ɟ", "dʒ"), ("ɹ", "r"),
           ("nk", "ŋk"), ("nɡ", "ŋɡ"), ("ntʃ", "ɲtʃ"), ("ndʒ", "ɲdʒ"),
           ("nʈ", "ɳʈ"), ("nɖ", "ɳɖ"), ("np", "mp"), ("nb", "mb")],
    # Asked for one word at a time -- see `WORD_AT_A_TIME` -- espeak reads the bare
    # definite article `a` as the *letter* and returns `ˈɑː`. Hungarian has no such
    # vowel: the long partner of /ɒ/ is the unrounded /aː/, written `á`, which espeak
    # writes `aː` everywhere it belongs (`három` hˈaːrom, `kívánok` kˈiːvaːnok). So a
    # long back rounded vowel is only ever this artefact, and `a` is in a great many
    # rows of the pack.
    # And it reads `lj` as a palatal lateral. Standard Hungarian has none: the
    # yod-merger is complete, `ly` is /j/ everywhere (`melyik` comes back correctly
    # as mˈɛjik), and an orthographic `lj` assimilates to a long [jː] -- `forduljon`
    # is [fordujjon], `aktiválja` [ɑktivaːjjɑ]. espeak writes that as `ʎj` on eleven
    # rows and as `jj` on others (`álljon` ˈaːjjon), so one substitution fixes both
    # the phoneme and the length: `ʎj` becomes `jj` by rewriting the `ʎ` alone.
    "hu": [("ɑː", "ɑ"), ("ʎ", "j")],
    # Vietnamese's three centring diphthongs -- ia/iê/yê, ưa/ươ, ua/uô -- are
    # *falling*: Kirby (2011: 384) gives the inventory as nine vowel qualities and
    # "three falling diphthongs /iə ɯə uə/", the nucleus first and a centring
    # offglide second, which is also the direction of travel in his Figure 1. So the
    # second element is the one that is not a syllable, and U+032F belongs on it --
    # exactly where the `th` route already puts it (`tɕʰua̯j˥˩`, `plia̯n˨˩`).
    #
    # espeak spells the same phoneme two ways, following the orthography rather than
    # the phonology: `iə` in an open syllable (kia `kˈiə`, phía `fˈiəɜ`) and `iɛ` in
    # a closed one (biết `bˈiɛɜt̪`, tiếng `t̪ˈiɛŋ`). Both get the mark; correcting
    # the second element of the closed form to a schwa is a separate question about
    # vowel quality, not about syllabicity, and is not done here.
    #
    # Safe as a substring, and that is measured rather than assumed: espeak writes
    # the tone digit after the *whole* diphthong in all three (`bˈiɛɜt̪`, `mˈyə6n`,
    # `bˈuə2m`), never between the elements, so the pair is contiguous here and
    # still contiguous after `vi_tone`. The corpus's other vowel pairs are untouched
    # -- vi's own falling `əɪ aɪ` already syllabify correctly, and `iːɛ eɪ əʊ eɛ ea`
    # belong to English loanwords espeak read with English rules (ATM `eɪtiːɛm`,
    # data `deɪtə`), where the length mark keeps `iːɛ` from matching.
    #
    # `e-` is the rhyme orthographic `anh`/`ach` has, and the hyphen is espeak's own
    # mnemonic for "short", not IPA -- so it refused 31 rows, every *khách*, *hành*,
    # *cảnh* and *anh* in the corpus. Probing the front series shows espeak keeps
    # four heights before a palatal coda and this is the lowest of them: `binh bˈiɲ`,
    # `bênh bˈeɲ`, `benh bˈɛɲ`, `banh bˈe-ɲ`. The value is `a` rather than `ɛ`
    # because the only human reading of these rows in the repository says so: the
    # curated sheet respells `khách` *khak* and `anh` *ang* for an English reader,
    # against *khahk* for `khác`, so the contrast a reader has to hear is the one
    # espeak already writes as `a` (ă) against `aː` (a) -- `ɛ` would have given
    # *khek*. Hanoi actually diphthongises this rhyme to [ajŋ]/[ajk]; that detail is
    # below the resolution of this column, which keeps espeak's palatal coda.
    "vi": [("e-", "a"), ("iɛ", "iɛ̯"), ("iə", "iə̯"), ("yə", "yə̯"), ("uə", "uə̯")],
    # Two artefacts, and the first is the whole of what stands between this voice and
    # a usable column. espeak writes Persian's one voiced uvular -- the phoneme both
    # ق and غ realise in Tehrani speech -- as the two characters **`q1`**, its own
    # mnemonic and not IPA, so `check_alphabet` refused every row containing either
    # letter: چقدر, اتاق, قطار, دقیقه, قرص, برق, مرغ, غار. Measured over a 239-word
    # probe, a bare `q` never occurs -- the counts of `q` and of `1` are equal and
    # every one is part of a `q1` -- so this is a straight relabelling and not a
    # guess about which `q` is which.
    #
    # `q` rather than `ɢ` or `ʁ`, which are the narrower symbols. The corpus already
    # carries `q` from the Arabic pack, so all twenty-two reader tables already have a
    # rule for it and Persian adds no symbol to `--gaps`; `ɢ` would have been the
    # first voiced uvular stop the corpus ever held and would have cost twenty-two
    # table edits, which is exactly what Klingon's /ɬ/ cost. What is lost is voicing:
    # Arabic's `q` is voiceless and Persian's is not, so the two spell the same in
    # every reader's column. That is below this column's resolution -- it is a
    # respelling hint, and no reader table distinguishes uvular voicing anyway.
    #
    # **And length is folded out, because Persian has none.** Modern Persian has six
    # vowel qualities and no length contrast: the historical long/short pairs are now
    # /i u ɑ/ against /e o a/, distinguished by quality. espeak writes `ː`
    # inconsistently on exactly those three -- `pˈuːl` for پول beside `mˈamnun` for
    # ممنون, `bˈaleː` for بله beside `xˈoʃ` for خوش -- so the mark follows the
    # spelling rather than the sound and tells a reader table to double a vowel or
    # reach for a length device on some rows and not others.
    #
    # Safe as a bare substring, and that is measured rather than assumed: over the
    # probe and over the shipped pack, `ː` follows a **vowel** every time (e ɑ a u i)
    # and never a consonant, because espeak writes Persian gemination as a doubled
    # letter instead -- `q1ˈolleː` for قله, `ˈavval` for اول, `bˈannɑ` for بنّا,
    # `xˈatt` for خطّ. So nothing here shortens a geminate.
    #
    # And one word, which is the Hebrew word-list case arriving through this table
    # instead. espeak's Persian dictionary reads میگو -- shrimp -- as `mˈejɡu`,
    # taking the می for the verbal prefix *mey-*; the word is [miɡu] and nothing in
    # Persian orthography can force that reading (`مِیگو` gives the same answer,
    # `میگُو` gives `miɡov`, and every other spelling is a misspelling). It matters
    # more than a vowel usually would because the word is on an **allergy** row, and
    # a shellfish allergy respelled *MAY-goo* is a hint a shopkeeper will not
    # decode. `ejɡu` is the substring because the stress mark sits between the m and
    # the e at this stage; it fires on exactly the three میگو rows in the pack and
    # nowhere else, verified over the whole column.
    #
    # کیف is the same shape and is a genuine homograph rather than a dictionary
    # slip: [kif] is a bag and [kejf] is pleasure, and both are spelt کیف. espeak
    # picks the second, so `کیفم را دزدیدند` and `کیفِ پولم` came back as *keyfam*
    # and *keyf-e pulam*. In a phrasebook the word is always the bag, so `ejf` is
    # rewritten -- checked against every `ejf` in the finished column, which is
    # these five rows and nothing else.
    "fa": [("q1", "q"), ("ejɡu", "iɡu"), ("ejf", "if"), ("ː", "")],
    # **Three folds, and the first one is the whole cost of Polish to the other
    # twenty-three reader tables.** espeak writes `ń` and the palatalising `ni` as a
    # palatal nasal carrying U+02B2 -- a palatalisation mark on a consonant that is
    # already palatal, which is redundant by definition -- and that two-character
    # unit was the *only* thing in the Polish column that was nowhere else in the
    # corpus. Left in, `phonemesOf` binds the modifier to the nasal and every one of
    # the twenty-three existing tables, which all have a rule for the bare palatal
    # nasal and none for the pair, would have printed a bare IPA modifier letter on
    # 157 cells. Folding is the `q1` -> `q` decision one language later, and after it
    # Polish costs no table an edit: its other seven palatalised consonants are
    # already in the corpus from Russian.
    #
    # `ç` is the pre-front allophone of /x/ and occurs exactly once, in
    # `przeciwhistaminowy`, where the devoiced `w` puts the `h` before an `i`. This
    # column is phonemic, so it folds to `x`.
    #
    # `ː` is a phrase-level artefact and not a Polish contrast: the language has had
    # no vowel-length opposition since the sixteenth century, and all four instances
    # are a word-final vowel before a vowel-initial word (`do ubezpieczenia`, `tylko
    # oglądam`). Left in, four rows would tell every table to reach for a length
    # device on a vowel that is not long while the identical vowel elsewhere did not.
    "pl": [("ɲʲ", "ɲ"), ("ç", "x"), ("ː", "")],
    # **Three folds, and two of them are chosen by which symbols the other
    # twenty-six reader tables already have a rule for rather than by taste.** The
    # census that decided them is in tmp/tamil.md: every symbol espeak's Tamil voice
    # emits was looked up in all twenty-six shipped tables *before* the column was
    # generated, because `--gaps` only reports a hole after it has already reached
    # the page.
    #
    # `ʲ` is espeak's onglide before a word-initial எ/ஏ -- `ʲˈeŋɡeː` for எங்கே,
    # `ʲˈeːɻʉ` for ஏழு -- and it is dropped for three reasons at once. It is
    # **inconsistent**: espeak writes it for எ/ஏ and never for ஒ/ஓ, which take a [w]
    # onglide by the same rule, so keeping it would tell twenty-six tables the two
    # vowels behave differently when they do not. It is the **wrong symbol**: in this
    # corpus U+02B2 is Slavic palatalisation *of a preceding consonant*, and word
    # initially there is no consonant, so `phonemesOf` hands every table a bare
    # standalone modifier. And `pl__pl-PL.json` has **no rule for it at all** --
    # Polish's own column is where most of the corpus's `ʲ` lives and a table never
    # respells its own language -- so shipping it would open a gap in exactly one
    # reader, which is the defect this fold exists to avoid.
    #
    # `ʉ` -> `ɯ` for the same class of reason and it is the sharper case. This is
    # Tamil's reduced ukaram, the centralised short உ that appears everywhere except
    # word-initially (சாப்பாடு `sˈaːppaːɖʉ` against உதவி `ˈudʌvi`) -- real, audible
    # and worth carrying. But `ʉ` occurs in the corpus **only in Russian's own
    # column**, 26 cells, so `ru__ru-RU.json` has never needed a rule for it and does
    # not have one, while `ɯ` has a rule in all twenty-six. `ɯ` is also the symbol
    # the Tamil phonetic literature uses for this vowel, so the fold is toward the
    # standard notation rather than away from it.
    #
    # `ɹ` -> `ɾ`: espeak writes ர as the English approximant and ற as a trill, which
    # keeps the two letters apart -- the right outcome by the wrong letter. Tamil ர is
    # a tap. `ɾ` is mapped in all twenty-six tables and is 5,109 cells of the corpus
    # already, so this costs nothing and fixes the symbol.
    #
    # **`ʌ` is deliberately *not* folded to `a`, and `ː` is deliberately kept.**
    # espeak writes Tamil's short அ as `ʌ` and its long ஆ as `aː`. Nineteen of the
    # twenty-six tables spell `a` and `ʌ` identically anyway, so the fold would be
    # invisible to most readers; three of the seven that do not (`th` เอ, `vi` ơ,
    # `id` ê) give `ʌ` a *mid* vowel that is wrong for Tamil, and two (`en` u, `ur`
    # اَ) give a short vowel that is right. It is left alone because it is the
    # phonetic quality Keane's illustration reports and because folding it would put
    # the whole length contrast on `ː`, which twenty-one tables drop by policy --
    # Tamil has real length minimal pairs (படம் [paɖam] a picture, பாடம் [paːɖam] a
    # lesson) and unlike Bengali it is not a spelling variant. Both halves of that
    # trade are honest and neither is free; the three tables with the wrong mid vowel
    # are the cost and are named here so a reviewer can find them.
    #
    # No `("f", ...)` fold: `f` is correct here. Tamil writes /f/ as ஃப (āytam plus
    # ப) and the pack uses it in வைஃபை, இபுபுரூஃபன், ஃபிராங்க் and சல்ஃபா.
    # **Eight lexical repairs after the three folds, and they are dictionary entries
    # rather than a broken rule.** Every one of the four voicing environments was
    # probed and espeak's rule is right in all of them (see `VOICES["ta"]`), so what
    # is left is individual words its Tamil lexicon has wrong. `tmp/ta/audit.py`
    # finds them mechanically rather than by sampling: it walks `text` and `ipa` word
    # by word and flags a word whose Tamil letter is க ச ட த ப and whose ipa opens
    # with a voiced stop, which Tamil's own rule forbids word-initially, and a word
    # whose Tamil letter is an independent vowel and whose ipa does not open with a
    # vowel. Over 2,026 word pairs that is **17 occurrences of the first and 4 of the
    # second**, and the audit is a candidate list rather than a verdict: four of the
    # twelve flagged words are English loans -- பஸ் bus, பில் bill, பேங்க் bank,
    # போர்டிங் boarding -- where the voiced reading is exactly what a Tamil speaker
    # says, so espeak is right and the audit's rule is what is over-strict. Those
    # four are left alone. The other eight are repaired, and each prefix was checked
    # against the whole finished column for a second match before being written.
    #
    # இரத்தம் is the one that matters most: espeak **drops the initial vowel**,
    # giving [rattam] for [irattam], and the word is *blood* -- it is in
    # `medical-conditions.my-blood-sugar-is-low`, `.my-blood-type-is`,
    # `.i-take-blood-thinners` and `emergency-medical.i-am-bleeding-badly`, so the
    # repair lands on four safety-critical rows.
    "ta": [("ʲ", ""), ("ʉ", "ɯ"), ("ɹ", "ɾ"),
           ("ɾˈʌtt", "iɾˈʌtt"),          # இரத்தம் -- initial vowel dropped
           ("ɡˈʌrbb", "kˈʌrpp"),         # கர்ப்ப, கர்ப்பிணி -- and the geminate too
           ("dˈuːɾ", "tˈuːɾ"),           # தூரம், தூரமா
           ("dˈʌjʌv", "tˈʌjʌv"),         # தயவுசெய்து
           ("dˈʌɖipp", "tˈʌɖipp"),       # தடிப்பு
           ("bˈudʌn", "pˈudʌn"),         # புதன்கிழமை
           ("bˈaːdaːm", "pˈaːdaːm"),     # பாதாம்
           ("bˈaːɡʌm", "pˈaːɡʌm")],      # பாகம் -- same defect, and in language-names
    # **Punjabi, and every one of these is a place where this voice's notation is
    # not IPA or not Punjabi.** Measured over the 886 distinct Gurmukhi words of the
    # finished pack, not over probes.
    #
    # `("r.", "ɽ")` is ੜ, Hindi's and Urdu's repair in this build's third script.
    # **No `(".", "")` mop-up after it, and that was measured rather than assumed**:
    # over the whole column there is no `.` that is not preceded by `r` and no `r`
    # that is not followed by `.`, so the pair is exhaustive -- Bengali's argument,
    # and a dot that did somehow survive would make `check_alphabet` refuse the row,
    # which is a blank cell rather than a wrong one.
    #
    # `("+", "˩")` is **the low tone**, and `+` U+002B is not IPA at all -- it is
    # espeak's internal marker leaking through, the same class of thing as the `r.`
    # above. Written as U+02E9 MODIFIER LETTER EXTRA-LOW TONE BAR, which is the
    # notation the corpus already carries on `th`, `vi` and `zh-Hans`: 30 of the 33
    # reader tables are `policy.tone: "drop"` and strip U+02E5..02E9 in `respell()`
    # before anything is looked up, and the three that keep tone all have rules for
    # the bare bars already. So the tone costs **no symbol and no rule anywhere**,
    # which is the opposite of Klingon's `/ɬ/`. See tmp/punjabi.md for the two
    # notations refused (combining acute/grave, which appears in no `ipa` column in
    # the corpus, and two-bar contours, of which `˩˧` has a rule in none of the three
    # tone-keeping tables).
    #
    # `("v", "ʋ")` is ਵ, which every description of Punjabi gives as /ʋ/ and which
    # `hi`, `mr` and `te` already write that way for the same letter. 79 cells, and
    # both symbols have a rule in all 33 tables, so this buys agreement with the
    # three packs Punjabi shares most of its vocabulary with rather than fixing a gap.
    #
    # The five aspirate geminates are folded with **the aspiration on the second
    # half**, which is the correct Punjabi phonetics: ਅੱਖ is [əkkʰ], not [əkʰː]. This
    # voice writes the same sound both ways in the same pack -- ਇਕੱਠੇ comes back
    # `ɪkˈʌʈʰʈʰe` doubled and ਅੱਖਰਾਂ `ˈʌkʰːəɾˌã` with a length mark -- so folding is
    # what makes the column internally consistent. The **unaspirated** geminates are
    # left to `GEMINATE_DOUBLES` below, which is the same job done by machinery that
    # already exists for Hungarian and Italian; between them the two cover all eleven
    # geminate bases the pack produces (k ɡ t d p b c ɟ kʰ tʰ pʰ). Doubling rather
    # than keeping `ː` matters for the reader and not only for the phonetics: the
    # addak is phonemic and frequent in Punjabi -- ਪਤਾ *address* against ਪੱਤਾ *leaf*,
    # ਦਸ *ten* against ਦੱਸ *tell* -- and `ː` has a map-to-nothing rule in most tables,
    # so keeping it would respell those pairs identically for most readers.
    "pa": [("r.", "ɽ"), ("+", "˩"), ("v", "ʋ"),
           ("kʰː", "kkʰ"), ("tʰː", "ttʰ"), ("pʰː", "ppʰ"),
           ("ʈʰː", "ʈʈʰ"), ("cʰː", "ccʰ")],
    # Gujarati: eight repairs, every one of them counted over the finished column
    # before it was written, and **not one of them adds a symbol the corpus did not
    # already carry** -- `ɭ ɾ ʋ cʰ ɛ ɔ ə j ã k t c d ʰ` all have a rule in all
    # thirty-six reader tables, checked table by table rather than assumed.
    #
    # **`r.` is ળ, the retroflex lateral, in this voice's ASCII fallback** -- the
    # same notation Hindi's and Urdu's voices use for ड़ and Punjabi's for ੜ, over a
    # different letter. `("r.", "ɭ")` needs **no `(".", "")` mop-up and that was
    # measured rather than assumed**: over the whole column there are 68 dots and 68
    # `r.` sequences, so the pair is exhaustive -- Bengali's argument -- and a
    # surviving dot would make `check_alphabet` refuse the row, which is a blank cell
    # rather than a wrong one. The 12 bare `r` that remain are the trill allophone
    # this voice writes inside `ર્ય`/`ર્જ` clusters (સૂર્યોદય, એલર્જી, કર્યો), and
    # they fold to `ɾ` because Gujarati has **one** rhotic and `ɾ` is the symbol
    # `hi`, `mr`, `te` and `pa` already give it.
    #
    # **`w` is વ, on 60 cells, where the same letter comes back `ʋ` on 220.** The
    # voice is simply inconsistent about one phoneme; `ʋ` wins for Punjabi's reason,
    # which is agreement with `hi`, `mr`, `te` and `ur` on the same letter.
    #
    # **`ch` is છ, and it is the shape of the Hindi `dʰ` bug caught before it
    # shipped.** One row -- `numbers-money.li`, the bare numeral six -- comes back
    # `chə` with an ASCII `c` + `h` where every other છ in the pack comes back
    # `cʰ` (છે `cʰeː`, ઓછું `oːcʰũ`, છોકરો `cʰoːkʌɾoː`, 305 cells in all). Left
    # alone, thirty-six readers would have spelt "six" with a separate /h/
    # consonant. Exhaustive: `ch` occurs once and only there.
    #
    # **ૈ and ૌ are monophthongs in Gujarati and this voice writes them as
    # diphthongs.** `aɪ` (7 cells: પૈસા, તૈયાર) and `aʊ` (10 cells: શૌચાલય, સૌથી)
    # are [ɛ] and [ɔ] -- Cardona's eight-vowel inventory /ə a i u e ɛ o ɔ/ has no
    # diphthong at all -- and the fold is also what makes the column agree with
    # `hi`, whose own committed cells give ऐ as `ɛ` and शौचालय as `ʃɔːcˈaːlˌɛj`.
    # Exhaustive and safe: every `aɪ`/`aʊ` in the column was traced to a ૈ or a ૌ,
    # and a genuine આઇ/આઈ hiatus comes back with the **long** `aː` (સાઇઝ `saːɪz`,
    # ભાઈ `bʰaːi`), which these two-character keys cannot match.
    #
    # **`ʌɛj` is a word-final `-અય` with a vowel inserted into it**, on 12 cells
    # (શૌચાલય, સૂર્યોદય, સમય). Folded to `ɛj`, which is what `hi`'s own column
    # writes for the identical ending (`sˈʌmˌɛj` for समय), rather than to the
    # phonetically better `əj`: Punjabi's `c`/`ɟ` decision in another place, where
    # agreement with the neighbouring Indo-Aryan pack on one unstressed final
    # syllable is worth more than a third reading of it. `ʌ̃ɛj` -- one cell, બાંય --
    # goes to `ãj` first, because a nasal vowel there would otherwise carry three
    # vowels in a row.
    #
    # **`Cːj` is a `C્ય` conjunct, and it is not a geminate.** ક્યાં comes back
    # `kːjʌ̃` and ત્યાં `tːjʌ̃` -- 43 cells across `kːj`, `tːj` and `cːj` -- where
    # the words are [kjã] and [tjã] with one consonant each. This one is repaired
    # rather than tolerated even though **`hi`'s own column ships the identical
    # defect** (`kːjaː` for क्या), because gemination is *phonemic* in Gujarati:
    # સિકો against સિક્કો, પતા against પત્તા. A spurious geminate is a different
    # word, not a shade, and it tells all thirty-six readers to double a consonant.
    # Reported for `hi` and `mr` rather than edited there, which is the precedent
    # `tmp/punjabi.md` set for Czech's `r̝` in four Indic tables.
    #
    # **The real geminates are written two ways and the doubled one wins.** સિક્કો
    # comes back `sɪkːoː` with a length mark and છેલ્લો `cʰeːlloː` with a doubled
    # consonant, for the same orthographic conjunct. `dʰː` (શુદ્ધ) is folded here so
    # that the aspiration lands on the second half only -- `ddʰ`, which is the
    # correct [ʃuddʰ] -- and the ten plain ones are left to `GEMINATE_DOUBLES`
    # below, machinery that already exists for Hungarian, Italian and Punjabi. It
    # has to run after the `Cːj` folds, and it does: `REPAIR` is applied first.
    #
    # **`ʌ̃` has a rule in none of the thirty-six tables and `ã` has one in all
    # thirty-six.** 120 cells, and almost all of them are the locative postposition
    # `-માં` (`bɪlʌmʌ̃`, `aːmʌ̃`) and the interrogative ક્યાં -- so left in, the most
    # frequent grammatical morpheme in the pack would have relied on `̃` mapping to
    # nothing and quietly lost its nasal, which is the Hindi `dʰ` bug in another
    # place. `ã` is the better transcription anyway: -માં is [mã], a low central
    # nasal vowel. What survives is `ã ũ ĩ ẽ` -- 214 `ũ`, 120 `ã`, 37 `ĩ`, 2 `ẽ` --
    # and **no `õ`, `ɛ̃`, `ɔ̃`, `ʊ̃` or `ɪ̃` occurs at all**, which matters because
    # `õ` has no rule in `cs` and the other four have none in `cs`, `en` or `pl`.
    "gu": [("r.", "ɭ"), ("r", "ɾ"), ("w", "ʋ"), ("ch", "cʰ"),
           ("aɪ", "ɛ"), ("aʊ", "ɔ"),
           ("ʌ̃ɛj", "ãj"), ("ʌɛj", "ɛj"),
           ("kːj", "kj"), ("tːj", "tj"), ("cːj", "cj"),
           ("dʰː", "ddʰ"), ("ʌ̃", "ã")],
    # Kannada, and **three folds is the whole list** -- the shortest REPAIR entry any
    # Indic language here has, because this voice gets the anusvara, the aspirates,
    # the gemination and the word-final vowel all right on its own. Every one was
    # counted over the finished column first, and **not one adds a symbol the corpus
    # did not already carry**, which is this brief's hardest constraint.
    #
    # **`ɐ` -> `a`, 1,895 cells, and the argument is the length pair.** espeak writes
    # Kannada's short a as `ɐ` and its long ā as `aː`, so the one length pair the
    # language contrasts most often comes back as *two different vowel qualities*.
    # `ɐ` has a rule in all 39 tables, so this is not a gap -- it is a
    # disagreement: `policy.length` in a reader table is written for a `V`/`Vː`
    # pair, and `ɐ`/`aː` is not one. Folding also makes this column agree with
    # Telugu's and Tamil's on the commonest vowel in the pack, where `ɐ` occurs
    # today in only `en`, `pt` and `vi` (364 cells between them). What it discards is
    # the centralised realisation, which is real and is not contrastive.
    #
    # **`ɹ` -> `r`, 450 cells, and this voice is already inconsistent about it.** ರ
    # comes back `ɹ` as an onset (450) and `r` in the arkavattu coda (89, ಕುರ್ಚಿ
    # `kurci`, ಸಾರ್ವ `saːrvɐ`) -- one phoneme, two symbols, on no principle. `ɹ` is
    # the English approximant and Kannada's ರ is a tap or a trill; `ɹ` occurs in the
    # corpus only in `ar de en it ms vi`, which have one. `r` has a rule in all 39
    # tables. Telugu made the same fold for the same reason on four cells.
    #
    # **`ɕ` -> `ʃ`, 43 cells.** ಶ is [ʃ]. `ɕ` in this corpus belongs to `ja ko pl ru
    # sv th zh-Hans`, all of which really have an alveolo-palatal; `ʃ` is what
    # Hindi's श, Bengali's শ, Gujarati's શ, Telugu's శ and Tamil's ஸ் all carry, and
    # ಷ is already `ʂ`. Keeping `ɕ` would have Kannada disagree with five packs it
    # shares the phoneme with. Telugu's decision, unchanged.
    #
    # **`c` and `ɟ` are kept, which is Punjabi's and Gujarati's decision and not
    # Telugu's**, and it was decided on rule coverage rather than on phonetics.
    # ಚ and ಜ are affricates in every description of Kannada (Sridhar 1990;
    # Krishnamurti, *The Dravidian Languages*), so `tʃ`/`dʒ` would be the better
    # transcription and it is what `te` and `ta` write. Against that: `ɟ` has a rule
    # in **all 39** tables where `dʒ` has none in `ru` or `uk`, and `cʰ` has one in
    # 29 where `tʃʰ` has one in only 13 -- so folding would *create* two
    # decompositions and cost aspiration in sixteen more tables, on a language whose
    # entire Sanskrit-derived layer is cognate with the six packs that already write
    # `c`/`ɟ` (ಜ್ವರ/ज्वर, ಪ್ರಜ್ಞೆ/प्रज्ञा, ಅಸಭ್ಯ/असभ्य). Recorded as a cost.
    #
    # **`ɪ` and `ʊ` are kept and are not a defect**, checked rather than assumed:
    # all 67 occurrences are the second element of ಐ `aɪ` and ಔ `aʊ` (ವೈ-ಫೈ
    # `vaɪpʰaɪ`, ಶೌಚಾಲಯ `ʃaʊcaːlɐjɐ`), which is the right transcription of Kannada's
    # two diphthongs and is what `en`, `de` and `hi` already carry. Kannada has no
    # lax /ɪ/ or /ʊ/ of its own and this column contains none.
    "kn": [("ɐ", "a"), ("ɹ", "r"), ("ɕ", "ʃ")],
    # Nepali shares Devanagari and this build's espeak voice shares the same defect
    # `REPAIR["hi"]` names: क्या (the yes/no particle) comes back `kːjaː`, reading a
    # `C्य` conjunct as a doubled consonant. Probed directly before assuming the
    # defect carried over: `EspeakBackend('ne').phonemize(['क्या'])` -> `'kːjaː '`,
    # confirming it. Aspiration was probed separately and is not affected --
    # `धन्यवाद` -> `dʰənjəwaːd`, `भात` -> `bʰaːt`, both correct on their own.
    "ne": [("kːj", "kj"), ("tːj", "tj"), ("cːj", "cj")],
}


# ------------------------------------------------------- Vietnamese tone letters
# espeak's `vi` voice writes five of the six tones as a digit after the nucleus and
# the sixth, sắc, as a stray `ɜ`. Hanoi values, as Chao tone letters. The mark
# moves to the end of its syllable, which for Vietnamese is the whole token: the
# language is written one syllable per word.
VI_LEVEL = "˧"                                 # ngang, which espeak usually leaves bare
# `1` is ngang written out, which espeak does for the `âu` rhyme and inside its
# number dictionary and nowhere else: probing the tone series on one rhyme gives
# `câu kˈə1w`, `cầu kˈə2w`, `cấu kˈəɜw`, `cẩu kˈə4w`, `cẫu kˈə5w`, `cậu kˈə6w`, so
# the digit sits in exactly the slot the other five do and means the sixth tone.
# Leaving it out of this table refused 40 rows -- every *ở đâu* and *bao lâu* in the
# corpus -- and mapping it to the same bars `VI_LEVEL` already supplies for the bare
# form is what makes `ɗə1w˧` and `xoŋ˧` agree.
VI_TONES = {"1": VI_LEVEL, "2": "˨˩", "ɜ": "˧˥", "4": "˧˩˧", "5": "˧ˀ˥", "6": "˨˩ˀ"}


def vi_tone(token):
    """One espeak Vietnamese token with its tone digit moved to the end, as bars."""
    tone = "".join(VI_TONES[c] for c in token if c in VI_TONES) or VI_LEVEL
    return "".join(c for c in token if c not in VI_TONES) + tone


# ------------------------------------------------------------- Hepburn -> IPA
# Japanese is a closed set of morae, so this is a table rather than a G2P: 106
# entries, longest match first. The Hepburn column it reads was written and
# reviewed by a fluent speaker, so the only thing that can be wrong here is the
# table. /u/ is written ɯ, which is the usual broad transcription of a vowel that
# is compressed rather than rounded.
HEPBURN = {
    # Hepburn writes length with a macron on the vowel, so `hepburn_to_ipa`
    # decomposes its input and this reads the mark on its own: `dō` is `do` + this.
    "\u0304": "ː",
    "kya": "kja", "kyu": "kjɯ", "kyo": "kjo", "gya": "ɡja", "gyu": "ɡjɯ",
    "gyo": "ɡjo", "sha": "ɕa", "shu": "ɕɯ", "sho": "ɕo", "shi": "ɕi",
    "cha": "tɕa", "chu": "tɕɯ", "cho": "tɕo", "chi": "tɕi", "tsu": "tsɯ",
    "nya": "ɲa", "nyu": "ɲɯ", "nyo": "ɲo", "hya": "ça", "hyu": "çɯ", "hyo": "ço",
    "bya": "bja", "byu": "bjɯ", "byo": "bjo", "pya": "pja", "pyu": "pjɯ",
    "pyo": "pjo", "mya": "mja", "myu": "mjɯ", "myo": "mjo",
    "rya": "ɾja", "ryu": "ɾjɯ", "ryo": "ɾjo", "ja": "dʑa", "ju": "dʑɯ",
    "jo": "dʑo", "ji": "dʑi", "fu": "ɸɯ", "hi": "çi",
    "ka": "ka", "ki": "ki", "ku": "kɯ", "ke": "ke", "ko": "ko",
    "ga": "ɡa", "gi": "ɡi", "gu": "ɡɯ", "ge": "ɡe", "go": "ɡo",
    "sa": "sa", "su": "sɯ", "se": "se", "so": "so",
    "za": "za", "zu": "zɯ", "ze": "ze", "zo": "zo",
    "ta": "ta", "te": "te", "to": "to", "da": "da", "de": "de", "do": "do",
    "na": "na", "ni": "ɲi", "nu": "nɯ", "ne": "ne", "no": "no",
    "ha": "ha", "he": "he", "ho": "ho",
    "ba": "ba", "bi": "bi", "bu": "bɯ", "be": "be", "bo": "bo",
    "pa": "pa", "pi": "pi", "pu": "pɯ", "pe": "pe", "po": "po",
    "ma": "ma", "mi": "mi", "mu": "mɯ", "me": "me", "mo": "mo",
    "ya": "ja", "yu": "jɯ", "yo": "jo", "wa": "wa",
    # The extended katakana. These exist only in loanwords, which is exactly what a
    # phrasebook's hotel and pharmacy rows are made of -- チェックイン, アセトアミノフェン,
    # アナフィラキシー -- and without them `longest` matched nothing, the tail was
    # carried out whole, and ten rows shipped as raw Hepburn: `chekkuin`.
    "che": "tɕe", "she": "ɕe", "je": "dʑe",
    "fa": "ɸa", "fi": "ɸi", "fe": "ɸe", "fo": "ɸo",
    "ti": "ti", "di": "di", "tu": "tɯ", "du": "dɯ",
    "tsa": "tsa", "tsi": "tsi", "tse": "tse", "tso": "tso",
    "wi": "wi", "we": "we", "wo": "wo",
    # ヴ, which only appears in loanwords but does appear: ヴィーガン.
    "va": "va", "vi": "vi", "vu": "vɯ", "ve": "ve", "vo": "vo",
    "ra": "ɾa", "ri": "ɾi", "ru": "ɾɯ", "re": "ɾe", "ro": "ɾo",
    "a": "a", "i": "i", "u": "ɯ", "e": "e", "o": "o",
    "n": "ɴ",                                     # moraic n, ん
    # Hepburn writes one long /iː/ two ways -- `ī` for い+ー and `ii` for い+い --
    # and the curated respelling reads both as one syllable (`tah-dah-shee` for
    # `tadashii`), so they transcribe the same way here.
    "ii": "iː",
}

# --------------------------------------------------- Revised Romanization -> IPA
# Read after the vowel table, so `ng` cannot swallow the `n` of a `n`+vowel.
RR_VOWELS = {"yae": "jɛ", "yeo": "jʌ", "wae": "wɛ", "ae": "ɛ", "eo": "ʌ",
             "eu": "ɯ", "oe": "we", "ui": "ɰi", "ya": "ja", "yu": "ju",
             "yo": "jo", "ye": "je", "wa": "wa", "wo": "wʌ", "we": "we",
             "wi": "wi", "a": "a", "e": "e", "i": "i", "o": "o", "u": "u"}
# The tense series takes U+0348, which is the IPA notation for it and which every
# shipped face has. `g d b j` are the lenis series, voiceless in isolation and
# voiced between voiced segments -- RR writes them the same way in both positions,
# so the value is decided by context in `rr_to_ipa` rather than here.
RR_ONSETS = {"kk": "k͈", "tt": "t͈", "pp": "p͈", "ss": "s͈",
             "jj": "tɕ͈", "ch": "tɕʰ", "ng": "ŋ", "g": "k", "d": "t",
             "b": "p", "j": "tɕ", "k": "kʰ", "t": "tʰ", "p": "pʰ", "s": "s",
             "h": "h", "n": "n", "m": "m", "r": "ɾ", "l": "l"}
RR_LENIS = {"g": "ɡ", "d": "d", "b": "b", "j": "dʑ"}
# RR spells a syllable-final ㄱㄷㅂ with the same letters as an initial ㅋㅌㅍ. A
# vowel after it means it opened a syllable and is aspirated; anything else means
# it closed one and is not.
RR_UNASPIRATED = {"k": "k", "t": "t", "p": "p"}
VOICED_END = set("aeiouɯʌɛɰjw") | set("nmŋɾl")


def longest(table, text, i):
    """The longest key of `table` that `text` starts with at `i`, or None."""
    for size in (3, 2, 1):
        if text[i:i + size] in table:
            return text[i:i + size]
    return None


def hepburn_to_ipa(word):
    """One Hepburn word. Gemination is the doubled letter Hepburn writes it as."""
    word = unicodedata.normalize("NFD", word)
    out, i = "", 0
    while i < len(word):
        # An apostrophe marks a moraic n before a vowel (`kin'en`) and a hyphen a
        # morpheme boundary (`sochira-sama`); neither is a sound.
        if word[i] in "'-":
            i += 1
            continue
        # A consonant that duplicates the onset of the following mora is っ. `tch`
        # and `ssh` are the two places Hepburn writes that doubling with a
        # different letter than the one it doubles.
        #
        # Only obstruents. `m n r` are excluded because Japanese has no geminate of
        # any of them: a doubled `n` is always the moraic nasal plus an n-row mora,
        # so `konnichiwa` is /koɴɲitɕiwa/ and not /koɲɲitɕiwa/, and `onna` is
        # /oɴna/.
        nxt = longest(HEPBURN, word, i + 1)
        if nxt and word[i] in "kstpgdbzjc" \
                and (word[i] == word[i + 1] or word[i:i + 3] in ("tch", "ssh")):
            # The first consonant of the following mora, which is what っ is:
            # /tɕ/ geminates as [t] (`matcha` -> `mattɕa`) and /ɕ/ as [ɕ].
            onset = ""
            for ch in HEPBURN[nxt]:
                if ch in VOWELS or ch in GLIDES:
                    break
                onset += ch
            if onset:
                out += onset[0]
                i += 1
                continue
        mora = longest(HEPBURN, word, i)
        if not mora:
            # Nothing is dropped: the unreadable tail is carried out so that
            # `check_alphabet` refuses the row and names the character.
            return out + word[i:]
        out += HEPBURN[mora]
        i += len(mora)
    return out


def rr_to_ipa(word):
    """One Revised Romanization word, with the lenis series voiced in context."""
    out, i = "", 0
    while i < len(word):
        if word[i] == "-":                        # RR's disambiguating hyphen
            i += 1
            continue
        vowel = longest(RR_VOWELS, word, i)
        if vowel:
            out += RR_VOWELS[vowel]
            i += len(vowel)
            continue
        onset = longest(RR_ONSETS, word, i)
        if not onset:
            return out + word[i:]
        after = word[i + len(onset):]
        opens = bool(after) and longest(RR_VOWELS, after, 0) is not None
        if onset in RR_UNASPIRATED and not opens:
            out += RR_UNASPIRATED[onset]          # syllable-final ㄱㄷㅂ, not ㅋㅌㅍ
        elif onset in RR_LENIS and out and out[-1] in VOICED_END and opens:
            out += RR_LENIS[onset]
        else:
            out += RR_ONSETS[onset]
        i += len(onset)
    return out


# The RR spelling of each jungseong, in jungseong order. A block's *vowel* is the
# one part of its RR spelling that assimilation cannot rewrite -- 약물 is `yangmul`
# and 신라 is `silla`, but ㅑ is `ya` and ㅣ is `i` wherever they stand -- and RR's
# vowel letters `a e i o u w y` are disjoint from its consonant letters, so
# matching this sequence in order against a word recovers its block boundaries.
JUNGSEONG_RR = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae",
                "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"]
# The jongseong RR spells with a bare `n`: ㄴ, ㄵ, ㄶ. A `g` after one of those
# opens the next block, which is the whole of the `chin-gu` question.
N_FINALS = {4, 5, 6}
RR_VOWEL_LETTERS = set("aeiouwy")
HANGUL = re.compile(r"[가-힣]+")
# A word of the romanisation column: its letters, and whatever punctuation the
# sentence hung on either end.
RR_WORD = re.compile(r"([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$")


def hangul_blocks(text):
    return sum(1 for ch in text if 0xAC00 <= ord(ch) <= 0xD7A3)


def ko_hyphenate(hangul, rr):
    """One RR word carrying RR's disambiguating hyphen at every block boundary a
    longest match would read across, or None if it cannot be aligned.

    Two digraphs cross a block boundary in this corpus and both are then read as a
    unit that is not there. `ng` is both the velar nasal and an ㄴ+ㄱ sequence, so
    친구가 `chinguga` is *chin-gu-ga* and not /tɕʰiŋuɡa/; and two vowels in a row
    are also a vowel digraph, so 기차에 `gichae` is *gi-cha-e* and not /kitɕʰɛ/ and
    투입 `tuip` is *tu-ip* and not /tʰɰip/. Both were refused rather than read.

    The Hangul settles both, because it is a syllable-block script: line the
    blocks' vowels up against the RR and the boundaries fall out. Only where the
    reading would change -- a hyphen everywhere would be wrong, since RR
    resyllabifies a coda onto a following null onset (있어요 `isseoyo` is
    /i.s͈ʌ.jo/, so `is-seoyo` would lose the tense /s͈/).
    """
    blocks = [ord(c) - 0xAC00 for c in hangul]
    spans, at = [], 0
    for block in blocks:
        vowel = JUNGSEONG_RR[block // 28 % 21]
        start = rr.find(vowel, at)
        if start < 0:
            return None
        at = start + len(vowel)
        spans.append((start, at))
    if RR_VOWEL_LETTERS & set(rr[at:]):           # more RR syllables than blocks
        return None
    cuts = []
    for i, (_, end) in enumerate(spans[:-1]):
        run = rr[end:spans[i + 1][0]]
        if not run:                               # two vowels, and so two blocks
            cuts.append(end)
        elif run.startswith("ng") and blocks[i] % 28 in N_FINALS:
            cuts.append(end + 1)                  # the `g` is the next block's onset
    out, last = [], 0
    for cut in cuts:
        out.append(rr[last:cut])
        last = cut
    return "-".join(out + [rr[last:]])


def ko_romanization(hangul, rr):
    """The row's RR column hyphenated word by word against its Hangul, or None if
    an all-Hangul word cannot be aligned to the RR word standing opposite it.

    Word by word because that is the unit the two columns share: RR is written with
    the Hangul's own spacing. A word either column writes in something other than
    Hangul or Latin letters -- `{target}로`, `1월`, `₩` -- is left as it is, since
    there are no blocks there to align against; None then only ever means the two
    columns disagree about a word that is nothing but blocks, which is a fault in
    the data rather than an ambiguity, and the row is refused.
    """
    words, romanised = hangul.split(), rr.split()
    if len(words) != len(romanised):
        return None
    out = []
    for word, piece in zip(words, romanised):
        parts = RR_WORD.fullmatch(piece)
        if not HANGUL.fullmatch(word) or not parts:
            out.append(piece)
            continue
        split = ko_hyphenate(word, parts[2])
        if split is None:
            return None
        out.append(parts[1] + split + parts[3])
    return " ".join(out)


# ----------------------------------------------------------------- syllables
def syllable_count(ipa, split_rising=False):
    """How many syllables `core/respell.js` will find in an IPA word.

    Mirrors the nucleus-span half of `syllabify` there, which is the only half
    that decides the count: a vowel takes its *falling* glides, and a glide
    between two vowels is rising, so it opens the second syllable instead.
    Duplicated rather than shared because the consumer is JavaScript; the report's
    agreement rate against the curated sheets is only meaningful if it counts the
    same way the renderer will.

    `split_rising` counts a rising /j/ as a syllable of its own, which is what
    `applySplits` does when a rule file asks for it -- an English reader cannot
    read /sja/, so `farmacia` is respelled `far-MAH-see-ah`, four syllables from
    three. Only /j/: English orthography has no `Cy` onset but it does have `Cw`,
    so the same curator who writes `tee-EM-po` for /tjempo/ writes `KWAN-toh` for
    /kwanto/. It is a source-side reader preference rather than a fact about the
    target, so it is a second column rather than folded into the first.
    """
    # U+032F binds to the vowel before it rather than being stripped with the rest
    # of `TAIL`, because it is the one tail mark that changes the *count*: to
    # `syllabify` it says "this vowel is not a syllable", so the vowel can neither
    # begin a nucleus nor be one. Stripping it counted every Thai and Vietnamese
    # centring diphthong as two syllables.
    ph = []
    for c in ipa:
        if c == NONSYLLABIC and ph:
            ph[-1] += c
        elif c not in TAIL and c not in STRESS_MARKS and c not in TONE:
            ph.append(c)
    n, i, count = len(ph), 0, 0
    while i < n:
        if ph[i][0] not in VOWELS or NONSYLLABIC in ph[i]:
            if split_rising and ph[i] == "j" and i and ph[i - 1][0] not in VOWELS:
                count += 1
            i += 1
            continue
        hi = i
        while hi + 1 < n and (ph[hi + 1][0] in GLIDES or ph[hi + 1][0] in "ɪʊ"
                              or NONSYLLABIC in ph[hi + 1]):
            hi += 1
        while hi > i and ph[hi][0] in GLIDES and hi + 1 < n and ph[hi + 1][0] in VOWELS:
            hi -= 1
        count += 1
        i = hi + 1
    return count


def curated_syllables(respell):
    """Syllables in a curated respelling: hyphen-separated pieces that have letters."""
    return sum(len([p for p in word.split("-") if re.search(r"[A-Za-z]", p)])
               for word in respell.split() if re.search(r"[A-Za-z]", word))


# ------------------------------------------------------------------- the text
# `{}` is a blank the reader fills and `/` separates two alternatives; both are
# carried into the IPA, and a comma is attached to the word before it.
MARKER = re.compile(r"(\{\}|\{target\}|\{source\}|/|[,，、])")
LANGUAGE_SLOT = re.compile(r"\{(?:target|source)\}")
# An all-capital Latin run is an acronym or a loanword, and espeak spells one out
# letter by letter in the target language. Sometimes that is right -- `QR` really is
# *cu-erre* in Spanish -- and sometimes it is the one thing worse than a blank cell:
# `SIM` comes out `ˌeseˌiˈeme` where the curator wrote `seem`. Nothing here can tell
# the two apart, so the row is written and counted rather than refused, and the
# count is the shortest reviewer queue in the report.
ACRONYM = re.compile(r"(?<![A-Za-z])[A-Z]{2,5}(?![A-Za-z])")
# The same problem one step worse. A Latin-script word inside a non-Latin language
# is a loanword -- `Wi-Fi`, `eSIM`, `cm` -- and every route here reads it with the
# wrong letter-to-sound rules, or in the table routes passes it through unchanged
# where lowercase Latin is indistinguishable from IPA: `SIM` lowercased is three
# letters no Hepburn mora matches, so it is carried out as `sim` and every one of
# `s i m` is legal IPA.
LATIN_RUN = re.compile(r"[A-Za-z]+")

# The reading a non-Latin language gives a Latin acronym its own orthography keeps
# in Latin letters. Per token and per language, because that is the only shape the
# evidence has: the reviewed Japanese Hepburn column, which already fills these
# same rows, reads `SIM` as a word (`shimu`), `ATM` letter by letter (`ētīemu`) and
# `Wi-Fi` as the brand (`wai-fai`) -- one language doing all three things depending
# on the token, which no rule over either axis alone can express.
#
# **Why these rows get a reading rather than carrying the Latin through, which is
# the other thing the curators did.** The sixteen curated sheets disagree, and it
# takes reading all of them to see that they are not answering the same question.
# `zh-Hans__en` respells `Wi-Fi` as `wee-fye` and `eSIM` as `ee-sim`; `th__en` gives
# `ee-sim`; `ja__en` gives `wah-i-fah-i`, `ehh-tee-eh-mu`, `shih-mu` and
# `kyoo aah-ru` across fourteen rows. `ru__en` leaves the letters standing --
# `oo vas yest Wi-Fi`, `pa QR-KOH-doo` -- and so does `ko__en`, with `{}cm-yeh-yo`.
#
# But an override file is `<target>__en__en-US.csv`: a respelling *of* the target
# *for an English reader*. "Say Wi-Fi" is a true and useful instruction to somebody
# who reads English and no instruction at all to the Arabic, Hindi, Japanese,
# Korean, Russian and Thai readers whose tables emit no Latin letter -- and those
# sixteen files are exactly the pairs where the curated layer already wins, so the
# Russian curator's `Wi-Fi` still prints on ru<-en whatever this table says. What
# the generated column has to serve is the other eighteen readers. The Mandarin and
# Thai curators wrote down a sound; the Russian and Korean ones wrote down a
# presentation. Only the first is a fact about the target, so only the first
# generalises past the reader it was written for.
#
# IPA rather than the target's own spelling of the sound, which was the other
# candidate and would have been reviewable by more people: Mandarin cannot be
# spelt. `fai` is not a Mandarin syllable, so there is no Pinyin for `Wi-Fi` at all
# and `pinyin_to_ipa` refuses it. One mechanism for five languages beats an
# orthographic one for four plus a hand-written exception.
#
# Each value is checked twice. `check_alphabet` reviews it like any other cell, and
# the reading is chosen so that the *English* table reproduces the curated string
# where there is one: `wifaɪ` respells to `wee-fye`, which is the Mandarin
# curator's own spelling, where the Pinyin-legal `weɪfaɪ` (`wēi`) gives `way-fye`,
# which is not. One IPA word each, because that is what the curators' hyphens say.
LOANWORDS = {
    "el": {
        # γουάι-φάι, but `ου` before a vowel is Greek's digraph for /w/ --
        # Ουάσιγκτον is [ˈwasiŋgton] -- so espeak's letter reading `ɣuˈaɪ fˈaɪ`
        # hands every reader a syllable nobody says: `goo-ay-FYE`, `гу-ай-фа́й`.
        "Wi-Fi": "waɪˈfaɪ",
        "eSIM": "isˈim",                          # ισίμ
        "SIM": "sˈim",                            # σιμ
        "PIN": "pˈin",                            # πιν
        # κιου-αρ. Greek /k/ before a front glide is [c] and this column writes
        # espeak's `c` throughout, but that is the allophone and `core/respell.js`
        # is given phonemes: `cjuˈaɾ` comes out `chee-oo-AR` for an English reader
        # and `추-아르` for a Korean one, and neither of those is a Q.
        "QR": "kjuˈaɾ",
    },
    "ru": {
        "Wi-Fi": "vajˈfɑj",                       # вай-фа́й
        "eSIM": "iˈsʲim",                         # и-си́м
        "QR": "kʲjuˈɑr",                          # кью-а́р
    },
    "th": {"eSIM": "ʔiː˧sim˧"},                   # อีซิม, straight out of thaig2p
    # No tone letters: the loan has no lexical tone to carry, and the readers who
    # keep tone would otherwise be shown one that was invented here.
    "zh-Hans": {"Wi-Fi": "wifaɪ", "eSIM": "isim"},
    # 센티미터. The one entry that is not an acronym, and the one place a curator's
    # Latin is left in on purpose elsewhere: `cm` is a unit symbol glued to the `{}`
    # the traveller fills, and Korean reads it out in full.
    "ko": {"cm": "sentʰimitʰʌ"},
    # Israeli Hebrew writes these three in Latin letters -- on the router, on the
    # sign in the phone shop, in the newspaper -- so the pack keeps them there and
    # gives the reading. `w` is not a Hebrew consonant: `Wi-Fi` is [vajfaj], which
    # is also how it is spelt when somebody does write it out, ווי-פיי.
    "he": {"Wi-Fi": "vajˈfaj", "eSIM": "iˈsim", "QR": "kjuˈar"},
    # Filipino keeps these six in Latin letters exactly as Hebrew's press and
    # routers do, and for the same reason: they are said with (Filipino-accented)
    # English sounds, not read letter-by-letter through `FIL`, which would give
    # `card` the vowel of `cat` rather than the vowel it is actually said with.
    # Letter names (`ATM`, `WC`) follow DepEd's own Alpabetong Filipino names for
    # the Latin letters, which is where a Filipino schoolchild is taught to read
    # an acronym aloud -- `ATM` is `ey-ti-em`, not `a-t-m`.
    "fil": {"Wi-Fi": "wajfaj", "eSIM": "isim", "SIM": "sim", "PIN": "pin",
            "QR": "kjuar", "ATM": "eitiɛm", "WC": "dobolyusi", "card": "kaɾd"},
}


def loan_pattern(loans):
    """One regex over `loans`' tokens, longest first so `eSIM` is not read as `SIM`.

    The seam hyphen comes out with the token, because it joins the acronym to the
    word after it and is not a sound: Russian writes `QR-коду` and the two halves
    are transcribed separately.
    """
    if not loans:
        return None
    return re.compile("-?(" + "|".join(re.escape(t) for t in
                                       sorted(loans, key=len, reverse=True)) + ")-?")


def latin_survives(text, source, loans=()):
    """Whether a Latin run of `text` is still Latin in the string a route will read.

    The gate this replaces asked whether `text` contains a Latin letter, which is
    the wrong question for the three languages read off a romanisation column: that
    column is Latin from end to end, and for these rows it is also *the answer*.
    A fluent speaker wrote `SIM` as `shimu`, `ATM` as `ētīemu`, `QR` as `kyū āru`
    and `Wi-Fi` as `wai-fai` in `romanization_hepburn`, so all fourteen Japanese
    rows the old gate refused transcribe from already-reviewed data -- there was
    never a loanword left in them to mishandle. Asking the narrower question keeps
    the refusal exactly where the loanword really does survive: the Pinyin column
    leaves `Wi-Fi` and `eSIM` in Latin, the RR column leaves `cm`, and Thai and
    Russian have no romanisation column, so their route reads `text` itself.

    A token `LOANWORDS` has a reading for is not a survivor: `pieces` takes it out
    of the chunk before any route sees it. So what is left after they are stripped
    is the honest question -- a Latin run this language has no reading for -- and
    the refusal stays exactly there.
    """
    pattern = loan_pattern(loans)
    if pattern:
        text = pattern.sub(" ", text)
    lower = source.lower()
    return any(run.lower() in lower
               for run in LATIN_RUN.findall(LANGUAGE_SLOT.sub("", text)))


def clean(chunk):
    """A run of real text, with everything that is not a sound taken out.

    Letters *and marks*: `str.isalpha` is false for a Thai vowel sign, a Devanagari
    matra and an Arabic short vowel, all of which are Unicode category Mn or Mc, so
    testing it dropped every one of them -- `เปิด` came out `เปด` and `है` came out
    `ह`, and the G2P dutifully phonemised the wreckage instead of failing.

    An apostrophe and a hyphen survive because they are load-bearing in the input:
    French elision (`l'eau`), a Pinyin syllable break (`wúzhàng'ài`), a compound
    (`check-out`). Everything else -- `¿ ? ! . : ; … ~ +`, quotes, brackets, the
    CJK marks -- goes, so that the table routes never see a character they would
    pass through and the espeak routes never get one back out.

    **And the zero-width non-joiner, U+200C, which is category Cf and was therefore
    being thrown away with the punctuation.** It is not punctuation in Perso-Arabic:
    it is a letter-level part of the spelling, the نیم‌فاصله the Academy of Persian
    Language and Literature prescribes between a verb and its `می` prefix, between
    a noun and its `ها` plural, and before the enclitic `ام`. Strip it and espeak
    reads a different word -- `بچه‌ام` (bachche-am, 'my child') became `بچهام` and
    came back `batʃhɑm`, and `آمده‌ام`, `بقیه‌اش`, `روبه‌رو` and `سریع‌السیر` all
    lost a syllable boundary the same way. Wrong on 195 rows of the Persian pack,
    including `lost-rescue.my-child-is-missing`.

    U+200D is deliberately not added beside it: nothing in the corpus uses the
    joiner, and this is the character the data actually contains. Adding U+200C
    changes no other language -- it appears in `fa` and in no other pack, in no
    registry file and in no override, so `build_ipa.py --check` is unmoved for the
    other twenty-two.
    """
    return "".join(c for c in chunk
                   if unicodedata.category(c)[0] in "LMN" or c.isspace()
                   or c in "'-\u200c").strip()


def pieces(text, loans=()):
    """`text` as a list of ('text'|'loan'|'marker', value), splitting on `{}`,
    `{target}`, `{source}`, `/`, `,` and on any `loans` token.

    Both language slots ride through as markers rather than being phonemised, and
    the renderer substitutes the IPA of the language's name -- see the `ipa` column
    of `data/registry/language-names.csv`, which `language_name_ipa` fills. The two
    are the same mechanism and different amounts of table: `{target}` in a Japanese
    row is Japanese naming itself, one string per language, where `{source}` names
    whichever of the other sixteen is reading, so it wants the whole matrix.

    A `loan` piece carries its IPA already -- it is the `LOANWORDS` value, not
    something to transcribe -- so the route never sees the Latin, which is the whole
    point: espeak language-switches on `Wi-Fi` and returns English phonology inside
    a Russian sentence, and the table routes pass the letters through as IPA.
    """
    out = []
    pattern = loan_pattern(loans)
    for part in MARKER.split(text):
        if part in ("{}", "{target}", "{source}", "/"):
            out.append(("marker", part))
        elif part in (",", "，", "、"):
            out.append(("marker", ","))
        else:
            for i, chunk in enumerate(pattern.split(part) if pattern else [part]):
                if pattern and i % 2:
                    out.append(("loan", loans[chunk]))
                elif clean(chunk):
                    out.append(("text", clean(chunk)))
    return out


def assemble(parts):
    """Join transcribed pieces: a comma sticks to the word before it, the rest space."""
    out = ""
    for kind, value in parts:
        if kind == "marker" and value == ",":
            out += ","
        else:
            out += (" " if out else "") + value
    return out


# ------------------------------------------------------------------ the routes
def espeak_lexicon(voice, chunks):
    """Phonemise a language's chunks in one batch. Phrase-level, so that French
    liaison and Spanish cross-word assimilation survive; the chunks are already cut
    at every comma, slot and slash, which are the only places a pause belongs."""
    from phonemizer.backend import EspeakBackend
    backend = EspeakBackend(voice, with_stress=True, language_switch="remove-flags",
                            words_mismatch="ignore")
    unique = list(dict.fromkeys(chunks))
    return dict(zip(unique, backend.phonemize(unique, strip=True, njobs=1)))


def apply_stress(ipa, policy):
    """One primary stress per word at most, and none at all where none exists."""
    if policy == "none":
        return "".join(c for c in ipa if c not in STRESS_MARKS)
    words = ipa.split()
    if policy == "phrase":
        # French stress is phrasal: the last word of the run carries it and the
        # others carry nothing. Marking each word is wrong by design, not by error
        # -- 177 of 466 French words in the curated sheets have no capital at all.
        #
        # And the word that keeps its mark keeps exactly one, the *last*. espeak
        # renders a hyphenated compound as a single IPA word and marks both halves
        # -- `sèche-linge` is `sˈɛʃlˈɛ̃ʒ`, `venez-vous` is `vənˈevˈu` -- and this
        # branch used to return before the one-primary-per-word pass below, so 26
        # rows carried two. Every reader saw it: two capitals for an English reader,
        # two acutes for a Spanish, Russian or Greek one, which is a spelling no
        # orthography has. The last rather than the first, because a phrasal accent
        # falls at the end of its group, which is where these compounds put it.
        head = ["".join(c for c in w if c not in STRESS_MARKS) for w in words[:-1]]
        tail = words[-1]
        last = tail.rfind("ˈ")
        if last >= 0:
            tail = tail[:last].replace("ˈ", "") + tail[last:]
        return " ".join(head + [tail])
    # espeak occasionally marks two primaries in one word. Keep the first.
    out = []
    for word in words:
        first = word.find("ˈ")
        if first >= 0:
            word = word[:first + 1] + word[first + 1:].replace("ˈ", "")
        out.append(word)
    return " ".join(out)


# ---------------------------------------------------------------- Greek stress
# espeak's Greek dictionary flags a closed class of function words as unstressable
# and gives them a *secondary* mark and no primary one at all: `είμαι` is `ˌime`,
# `έχετε` is `ˌeçetˌe`, `από` is `apˌo`. In connected speech that is defensible --
# they are clitic-like -- but a Greek word with no stress at all is not a possible
# Greek word: monotonic orthography accents every polysyllable, exactly once. So
# `Έχετε` printed with no capital for an English reader and no acute for a Russian
# one, on 8.5% of the words in the pack and specifically the most frequent ones.
#
# The position is recoverable, and not from espeak: it is in the *spelling*, which
# marks it unambiguously. Counting nuclei from the end of the Greek word gives the
# syllable, and Greek IPA has one vowel character per syllable -- no length marks,
# no phonemic diphthongs, glides written `j`/`w` -- so the same count lands on the
# right vowel in the transcription. The mark goes immediately before that vowel
# rather than before the onset, which is where espeak itself puts it (`θˈelo`,
# `apˈo`), so the column stays internally consistent.
EL_ACCENTED = "άέήίόύώΐΰ"
EL_VOWELS = "αεηιουω" + EL_ACCENTED + "ϊϋ"
# A vowel digraph is one nucleus. An accent on its *first* element breaks it
# (`ρολόι` is ro-LO-i), on its second does not (`είναι` is EE-neh), so only the
# unaccented-first forms are listed.
EL_DIGRAPHS = {a + b for a in "αεουηω" for b in "ιυίύ"} - {"ηι", "ωι", "ηί", "ωί"}


def el_nucleus_from_end(word):
    """How many nuclei follow the accented one, or None if the word has no accent."""
    low = word.lower()
    nuclei, i = [], 0
    while i < len(low):
        if low[i:i + 2] in EL_DIGRAPHS:
            nuclei.append(low[i:i + 2])
            i += 2
        elif low[i] in EL_VOWELS:
            nuclei.append(low[i])
            i += 1
        else:
            i += 1
    marked = [n for n, v in enumerate(nuclei) if any(c in EL_ACCENTED for c in v)]
    return len(nuclei) - 1 - marked[0] if marked else None


def el_stress(text, ipa):
    """Put back the primary stress espeak's function-word entries dropped.

    Word-aligned, and it declines to guess: if espeak returned a different number
    of words than the text has, or the vowel count cannot reach the syllable the
    spelling names, the transcription is left exactly as it came.
    """
    words, out = text.split(), []
    if len(words) != len(ipa.split()):
        return ipa
    for word, unit in zip(words, ipa.split()):
        k = el_nucleus_from_end(word)
        vowels = [n for n, c in enumerate(unit) if c in VOWELS]
        if "ˈ" in unit or k is None or len(vowels) <= k:
            out.append(unit)
            continue
        at = vowels[-1 - k]
        if at and unit[at - 1] == "ˌ":                 # replace, never stack
            unit, at = unit[:at - 1] + unit[at:], at - 1
        out.append(unit[:at] + "ˈ" + unit[at:])
    return " ".join(out)


# -------------------------------------------------------------------- geminates
# **A long consonant is two letters, not a letter and a length mark**, in every
# language here that writes gemination at all -- and espeak splits its own notation
# by manner rather than by phonology. Hungarian comes back with the stops and
# affricates as `Cː` (`kettő` kˈɛtːøː, `jobb` jˈobː, `meggy` mˈɛɟː) and the sonorants
# and fricatives as `CC` (`holló` hˈolloː, `össze` ˈøssɛ, `könnyű` kˈøɲɲyː); Italian
# is the same mixture, 158 rows of `Cː` beside 165 of `CC`. One phoneme, two
# spellings, and the corpus would carry both.
#
# `CC` is the form to keep, for two reasons that point the same way. Every reader's
# table maps a bare `ː` to nothing, so `Cː` silently *erases* a phonemic contrast for
# eighteen readers -- Hungarian `hal` fish against `hall` hears, Italian `fato`
# against `fatto` -- while `CC` survives as a coda plus an onset. And `syllabify`
# treats `Cː` as one unit between two vowels, which opens the next syllable: an
# English reader got `KEH-tur` for `kettő` where the doubled form gives `KET-tur`,
# and `ghè-ttee` for the Italian one where it gives `ghèt-tee`. Doubled is also the
# division both orthographies make themselves (`ket-tő`, `ott-hon`, `asz-szony`;
# `fat-to`).
#
# **Measured, and only where it measures.** Folding Italian raises the English
# reader's agreement with the curated Italian sheet from 7.3% to 8.3% exact and 7.9%
# to 9.3% loose. `ar`, `hi` and `tr` also carry `Cː` -- 56, 144 and 18 rows -- and
# folding them moves nothing at all (0.5%, 2.7%, 3.8%, unchanged to three figures),
# because their curated English respellings do not record gemination either. The
# length would still reach the other seventeen readers, so this is a live proposal
# rather than a closed question; it is left out because there is no evidence for it
# here and the four packs would all need re-rendering to find out.
#
# The affricates are captured whole so that `tsː` becomes `tsts` rather than `tss`,
# which `phonemesOf` would read as /t/ + /s/ + /s/.
GEMINATE = re.compile(r"(ts|tʃ|dz|dʒ|tɕ|ʈʂ|[pbtdkɡcɟqfvszʃʒçxhmnɲŋlrɾjʋ])ː")
# Punjabi joins for its addak and Gujarati for the same conjunct written the other
# way: see the geminate paragraph in REPAIR["pa"] and in REPAIR["gu"].
GEMINATE_DOUBLES = {"hu", "it", "pa", "gu"}


# ------------------------------------------------------------- Hungarian stress
# Hungarian stress is on the **first syllable of every word**, without exception and
# without lexical contrast, so it does not have to be recovered from espeak at all --
# it is a property of the word's position, and the generator can simply write it.
#
# Which is as well, because espeak does not supply it. Even asked one word at a time
# it demotes some words to a secondary mark and no primary (`vagyok` is `vˌɑɟok`), and
# asked a phrase at a time it demotes most non-initial words. A word with no primary
# mark prints unmarked -- no capital for an English reader, no acute for a Spanish,
# Russian or Greek one -- and for the accented scripts an unmarked polysyllable is not
# a possible word.
#
# Marking every word slightly over-marks: Hungarian clitics -- the article `a`/`az`, a
# postposition after its noun, the verb after negative `nem` -- are prosodically weak.
# Monosyllables are filtered downstream by each reader's `stress_min_syllables`, which
# covers the articles; the rest is a prosodic nicety against a missing mark, and a
# missing mark is the worse error.
#
# Immediately before the vowel rather than before the onset, which is where espeak
# itself puts it (`kˈeːrɛm`, `ʃˈɛɡiːtʃːeːɡ`), so the column stays internally
# consistent with the other eighteen.
def hu_stress(ipa):
    out = []
    for word in ipa.split():
        bare = "".join(c for c in word if c not in STRESS_MARKS)
        at = next((i for i, c in enumerate(bare) if c in VOWELS), None)
        out.append(bare if at is None else f"{bare[:at]}ˈ{bare[at:]}")
    return " ".join(out)


# ------------------------------------------------------- Telugu final anusvara
# **Word-final ం is [m], and this voice writes it `n`.** It is the one thing about
# Telugu that the letters do not say and that a string fold cannot fix: 112 of the
# pack's 1,098 distinct words end in the anusvara and all 112 come back with a final
# `n`, while 28 words end in న్ + virama and come back with a final `n` correctly --
# ఫోన్, ఇన్సులిన్, ఆస్పిరిన్, జూన్, the loanwords. So the repair needs the source
# spelling, which is exactly what `text` is here for; `REPAIR` sees only the output
# and could not tell the two classes apart.
#
# Word-aligned and it declines to guess, which is `el_stress`'s contract above: if
# espeak returned a different number of words than the text has, the transcription is
# left exactly as it came rather than shifted by one.
#
# The claim itself is the standard description -- Krishnamurti and Gwynn's *A Grammar
# of Modern Telugu* gives the word-final anusvara as [m], and every romanisation
# writes it so (namaskāram, bhōjanam, prayāṇam). The medial cases are in `REPAIR`
# above, where a fold is enough because the following consonant is in the output.
def te_anusvara(text, ipa):
    words, out = text.split(), []
    if len(words) != len(ipa.split()):
        return ipa
    for word, unit in zip(words, ipa.split()):
        out.append(unit[:-1] + "m" if word.endswith("\u0c02") and unit.endswith("n")
                   else unit)
    return " ".join(out)


# Punjabi's two tones, which are what its five written voiced aspirates actually
# are. Word-initially espeak already does the job and writes the low tone as `+`
# (folded to `˩` in REPAIR); the two things it does not do are here.
#
# **The high tone, from a non-initial ਘ ਝ ਢ ਧ ਭ.** espeak leaves those as voiced
# aspirates -- ਦੁੱਧ `dˈʊdʰ`, ਲਾਭ `lˈabʰ`, ਸਿੱਧਾ `sˈɪdʰa`, ਖੰਘ `kʰˈʌnɡʰ`, 27 words of
# the pack -- where modern Punjabi has a plain voiced stop and a high tone on the
# *preceding* vowel: [dʊ́d], [lɑ́b], [sɪ́da], [kʰə́ŋɡ]. The voice applies the same
# merger word-initially and not here, which is what makes this an omission rather
# than a transcription choice.
#
# **The high tone from ਹ outside an onset**, which needs the source text and is why
# this function takes it. Punjabi's subjoined ਹ (pairī̃ hāhā, `੍ਹ`) is not
# pronounced: it marks tone. espeak writes it as an [h] -- ਪੜ੍ਹ `pˈʌr.h`, ਕੱਲ੍ਹ
# `kˈʌllh`, ਥੋੜ੍ਹਾ `tʰˈor.ha`, ਉਨ੍ਹਾਂ `ˈʊnhã`, 18 words -- and word-final ਹ after a
# vowel is the same phenomenon (ਮੀਂਹ `mˈĩh`, ਬਾਂਹ `bˈãh`, both [mĩ́ː] and [bã́ː]).
# **The output alone cannot tell those from a real [ɦ]**: ਉਨ੍ਹਾਂ's h sits between a
# consonant and a vowel exactly as ਨਹੀਂ's does, and ਨਹੀਂ's is pronounced. So the
# test is on the Gurmukhi: `੍ਹ` in the word, or the word ending in `ਹ`. Contract
# borrowed from `el_stress` and `te_anusvara` -- word-aligned, and if espeak
# returned a different number of words than the text has, the transcription is
# returned exactly as it came rather than shifted by one.
#
# The tone bar goes immediately after the vowel, which is where espeak's own `+`
# goes and where `syllabify` in core/respell.js wants it: `VOWEL_TAIL` binds a Chao
# letter to the nucleus and `isTone` walks back past a coda consonant to find one.
PA_ASPIRATE_TONE = re.compile(r"([" + "".join(VOWELS) + r"]\u0303?)([mnɳŋɲlɾɽ]?)([bdɖɡɟ])ʰ")
PA_ONSETLESS_H = re.compile(r"([" + "".join(VOWELS) + r"]\u0303?)([mnɳŋɲlɾɽ]*)h")


# The homorganic nasal, which is the other thing this voice is inconsistent about.
# Gurmukhi's tippi ੰ and bindi ਂ are one sign for two things: a **nasal consonant**
# before a stop (ਪੰਜ [pəndʒ], ਘੰਟੇ [kò.ɳʈe], ਕਿੰਨਾ [kɪnna]) and **vowel
# nasalisation** elsewhere (ਹਾਂ [hã], ਮੈਂ [mɛ̃], ਨਹੀਂ [nəɦĩ]). espeak writes the
# consonant on some words (ਪੰਜ `pˈʌnɟ`, ਖੰਘ `kʰˈʌnɡʰ`, ਧੰਨਵਾਦ `tˌə+nnəvˈad`) and a
# nasal vowel on others with the identical structure (ਅੰਦਰ `ˈʌ̃dəɾ`, ਬੈਂਕ `bˈɛ̃k`,
# ਮਿੰਟ `mˈɪ̃ʈ`) -- 67 places against 71 where the nasal vowel is correct because
# nothing follows it.
#
# Fixed in the direction the voice itself uses elsewhere, which also removes the one
# real cost the nasal vowels would have carried: `ə̃` and `ʌ̃` have a rule in **none**
# of the 33 reader tables, `ɪ̃` in 5 and `ʊ̃` in 10, so 67 rows would have relied on
# `̃` mapping to nothing and quietly lost their nasal -- the shape of the Hindi `dʰ`
# bug. What survives is the word-final and pre-fricative nasal vowel, which is
# correct Punjabi and which uses only `ã ẽ ĩ õ ũ ɛ̃ ɔ̃` -- the set `hi` and `bn`
# already put in front of every table.
#
# Before a fricative or /h/ the nasal vowel is kept, because that is what Punjabi
# has: ਬਾਂਹ [bã́ː], ਐਂਬੂਲੈਂਸ, ਕੌਂਸਲਖ਼ਾਨਾ. Telugu's eight `REPAIR` folds do the same job
# from the other side, as plain string substitutions; a regex is used here because
# the nasal vowel rather than the nasal consonant is what has to be matched.
PA_HOMORGANIC = {"k": "ŋ", "ɡ": "ŋ", "c": "ɲ", "ɟ": "ɲ", "ʈ": "ɳ", "ɖ": "ɳ",
                 "t": "n", "d": "n", "p": "m", "b": "m", "m": "m", "n": "n", "l": "n"}
# The tone bar can sit **between** the tilde and the stop, because espeak writes
# its own `+` there: ਧੁੰਦ comes back `tˈʊ̃+d`, so after the fold the string is
# `tʊ̃˩d`. Missed on the first pass, and it was the Korean reader that found it --
# `respell_check ko pa` printed `ᄃ드` for that one row, a bare choseong with no
# vowel, which is the uncomposed-jamo defect `tests/respell.test.mjs` guards. The
# tone stays on the vowel, where `syllabify` wants it, and the nasal goes after it.
PA_NASAL = re.compile(r"([" + "".join(VOWELS) + r"])\u0303([˥˩]?)(["
                      + "".join(PA_HOMORGANIC) + r"])")


def pa_nasal(ipa):
    return PA_NASAL.sub(
        lambda m: m.group(1) + m.group(2) + PA_HOMORGANIC[m.group(3)] + m.group(3), ipa)


def pa_tone(text, ipa):
    ipa = PA_ASPIRATE_TONE.sub("\\1˥\\2\\3", ipa)
    words = text.split()
    units = ipa.split()
    if len(words) != len(units):
        return ipa
    out = []
    for word, unit in zip(words, units):
        if "\u0a4d\u0a39" in word or word.endswith("\u0a39"):
            unit = PA_ONSETLESS_H.sub("\\1˥\\2", unit)
        out.append(unit)
    return " ".join(out)


def normalise(ipa, code, text=""):
    for old, new in REPAIR.get(code, []):
        ipa = ipa.replace(old, new)
    for old, new in FOLD:
        ipa = ipa.replace(old, new)
    if code == "vi":
        ipa = " ".join(vi_tone(t) for t in ipa.split())
    if code == "el":
        ipa = el_stress(text, ipa)
    if code == "te":
        ipa = te_anusvara(text, ipa)
    if code == "pa":
        # Nasal first: `pa_tone` inserts a tone bar between the vowel and its coda,
        # which would then sit between the tilde and the stop `pa_nasal` matches on.
        ipa = pa_tone(text, pa_nasal(ipa))
    if code in GEMINATE_DOUBLES:
        ipa = GEMINATE.sub(r"\1\1", ipa)
    if code == "hu":
        ipa = hu_stress(ipa)
    return apply_stress(ipa, STRESS.get(code, "keep"))


# ------------------------------------------- Hebrew romanisation -> IPA
# Hebrew has **no espeak voice in this build** -- `EspeakBackend.supported_languages()`
# lists 109 and none of them is Hebrew -- so it is the `th`/`ja`/`ko`/`zh-Hans` case
# and, specifically, the romanised one: the route reads a column a human wrote.
#
# That column is `romanization_bgn`, the BGN/PCGN 2018 agreement, which is the
# Academy of the Hebrew Language's 2006 and 2011 systems tabulated for names. Read
# in this direction it is very nearly a phonemic notation for Modern Israeli
# Hebrew, and the three places it is not are the pack's three named departures:
# an acute marks non-final stress (BGN marks none, and Hebrew stress is lexical and
# unwritten in both orthographies), `ey` writes the [ej] diphthong where BGN writes
# `e`, and a strong dagesh is not doubled, because Modern Hebrew has no geminate to
# double and `bevaqqasha` would have to be undone here anyway.
#
# **Why the romanisation and not the pointed column**, which is the pack's own
# native orthography and would be the more faithful thing to read: `language_name_ipa`
# feeds a locale in `ROMANISED` its `romanization` cell out of
# `data/registry/language-names.csv`, and that column prints. Pointing it would put
# a pointed string in the romanisation column of every language-slot row. One input
# per language beats two, and the pointed column is authored from the same string.
#
# Three merges are correct rather than lossy, and all three are Modern Israeli
# Hebrew rather than the standard's graphemics: `ẖ` (ח) and `kh` (כ) are both /x/,
# `q` (ק) and `k` (כּ) are both /k/, and `t` covers ת and ט alike.
HE = {
    "kh": "x", "sh": "ʃ", "ts": "ts", "ey": "ej", "ay": "aj", "oy": "oj",
    "b": "b", "v": "v", "g": "ɡ", "d": "d", "h": "h", "z": "z", "t": "t",
    "y": "j", "k": "k", "l": "l", "m": "m", "n": "n", "s": "s", "p": "p",
    "f": "f", "q": "k", "r": "ʁ", "ẖ": "x", "ǧ": "dʒ", "ž": "ʒ", "č": "tʃ",
    "a": "a", "e": "e", "i": "i", "o": "o", "u": "u",
}
# **א and ע are not in that table and do not need to be.** BGN writes them `’` and
# `‘`, and `clean` takes both out before any route sees a chunk -- they are Unicode
# Pi/Pf, not letters -- so what reaches here is the hiatus: `hake’ev` arrives as
# `hakeev` and transcribes /hakeev/, `‘ivrit` as /ivʁit/, `shavua‘` as /ʃavua/.
# That is the right answer rather than a lucky one: both letters are silent in
# Modern Israeli Hebrew, and `syllabify` reads two adjacent vowels as two
# syllables, which is what a reader needs to be told. Anything else in this column
# is carried out and refused by `check_alphabet` rather than guessed at.
# The five acute vowels the stress departure adds, and what they stand for.
HE_STRESSED = {"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u"}
HE_VOWELS = set("aeiou") | set(HE_STRESSED)


def he_to_ipa(word):
    """One BGN-romanised Hebrew word, with the stress written on its nucleus.

    Final stress is Hebrew's default and is unmarked in the romanisation, so the
    mark goes on the last nucleus unless an acute says otherwise. Immediately
    *before* the nucleus rather than before its onset, which is where `syllabify`
    in core/respell.js reads it from and where every other route here puts it.

    The three digraphs can in principle span two letters -- `ts` from ת+ס, `sh`
    from ס+ה, `kh` from כ+ה -- and over this corpus they never do ambiguously:
    the only two rows where a digraph spans a letter boundary are `lehatshir` and
    `hatsharat`, where `ts` wins at its own position and leaves the `h` to be read
    on its own, which is the right answer.
    """
    out, marks, i = [], [], 0
    while i < len(word):
        if word[i] == "-":
            # Hebrew's hyphen joins a one-letter clitic to what follows it -- `ba-Wi-Fi`,
            # `čeq-in` -- and is not a sound. `clean` keeps it because it is
            # load-bearing for French elision and Pinyin, so it is dropped here, as
            # the Klingon route drops its suffix boundary.
            i += 1
            continue
        letter = longest(HE, word, i)
        if letter:
            out.append(HE[letter])
            marks.append(letter in HE_VOWELS)
            i += len(letter)
            continue
        if word[i] in HE_STRESSED:
            out.append(HE[HE_STRESSED[word[i]]])
            marks.append("stress")
            i += 1
            continue
        out.append(word[i])                       # carried out, so a gate names it
        marks.append(False)
        i += 1
    at = next((n for n, m in enumerate(marks) if m == "stress"), None)
    if at is None:
        at = next((n for n in range(len(marks) - 1, -1, -1) if marks[n] is True), None)
    if at is not None:
        out.insert(at, "ˈ")
    return "".join(out)


# ------------------------------------- Amharic romanisation -> IPA
# Amharic has an espeak voice in this build -- `am_dict` and `lang/sem/am` are both
# in the 1.50 tree -- and it is **not used**, which is the one place this pack
# departs from every Indic and Semitic neighbour. Five defects, probed over ninety
# real words before the decision rather than after:
#
#   ejectives come back as a backtick (ጤና `t`ena`, ቀይ `k`əj`, ጳጳስ `p`ap`as`);
#   ጸ loses its ejection entirely (ጸሎት `tsˈəlot`, where the letter is /sʼ/);
#   ህ is read `x` or `ç` in a coda (እባክህ `ʔˈɨβakɨx`, እዚህ `ʔˈɨziç`) and Amharic has
#     neither sound;
#   a spurious `ɨ` after most sixth-order consonants -- ስንት `sˈɨnɨt` for [sɨnt],
#     ገንዘብ `ɡˈənɨzəb` for [ɡənzəb], እንደምን `ʔˈɨnɨdəmɨn` for [ɨndəmɨn];
#   and **no gemination at all**: zero length marks over the whole probe.
#
# The first three are folds. The fourth is not: the correct rule is a
# syllable-structure rule -- Amharic syllables are (C)V(C), so /ɨ/ appears where a
# cluster would otherwise be illegal -- and repairing espeak's output means
# resyllabifying it, at which point the G2P has been written. And the fifth cannot be
# repaired from anything, because the information is in neither the letters nor the
# voice: gemination is phonemic (አለ is *ala* "he said" and *alla* "there is", one
# spelling) and the fidal does not write it. So the route reads a column a human
# wrote, the way Hebrew, Japanese, Korean and Mandarin do.
#
# That column is `romanization_bgn`: **BGN/PCGN 1967 for Amharic**, the table the UK
# and US geographic-names boards publish jointly, re-checked for validity in
# September 2022. It says of itself that "the Roman letters and letter combinations
# shown as equivalents to the Amharic characters reflect modern Amharic
# pronunciation", and read in this direction it is very nearly a phonemic notation:
# all seven vowels are distinguished, and the two pairs that matter are the ones a
# reader will misread -- `ī` is /i/ against `i` for /ɨ/, and `ē` is /e/ against `e`
# for /ə/, so the macron marks *quality* here and not length.
#
# Three named departures and nothing else:
#   1. a geminate consonant is written twice, which BGN marks nowhere. For a digraph
#      the *first character* doubles -- `nny` /ɲː/, `ssh` /ʃː/, `kkʼ` /kʼː/, `ttsʼ`
#      /sʼː/ -- which is unambiguous because the consonants are tried longest first,
#      and the only two sequences it cannot tell apart, a real /n/+/ɲ/ and a real
#      /s/+/ʃ/, occur in no row of the pack.
#   2. the sixth-order `i` is written only where the vowel is pronounced, which is
#      the standard's own Note 1 taken up rather than departed from.
#   3. the two apostrophes are the **modifier letters** U+02BC and U+02BD rather than
#      the quotation marks U+2019 and U+2018 that Note 6 pins. That one is forced:
#      `clean` keeps Unicode categories L, M and N and deletes the rest, so a Pf
#      apostrophe is thrown away before any route sees the chunk -- Persian's U+200C
#      bug in a new place, and it would have merged ቀ into ከ, ጠ into ተ, ጨ into ቸ, ጰ
#      into ፐ and ጸ into ሰ on 504 cells with nothing downstream able to notice. The
#      corpus's other BGN column already does this: `ru`'s uses U+02BC on 275 cells.
#
# The values are the inventory of Hayward & Hayward's illustration of Amharic in the
# *Handbook of the IPA* -- /p b t d k ɡ kʼ tʼ pʼ tʃ dʒ tʃʼ f v s z ʃ ʒ sʼ h m n ɲ l
# r w j ʔ/ over /ə u i a e ɨ o/. Three mergers in it are the modern language rather
# than approximations and the BGN table records all three itself: ሀ ሐ ኀ ኸ are all
# /h/, ሰ and ሠ are both /s/, ጸ and ፀ are both /sʼ/, and አ and ዐ are both /ʔ/.
#
# **Labialisation is written `w` and not `ʷ`**, so ቋንቋ is /kʼwankʼwa/ and the route
# needs no labial machinery at all: a `w` is simply the consonant. Amharic's
# labiovelars are analysable as /Cw/ clusters either way, and `ʷ` has a rule in only
# fourteen of the thirty-eight reader tables where `w` has one in all of them --
# Persian's `q1` -> `q` decision, taken for the same reason.
AM = {
    # Three characters long first, so `chʼ` and `tsʼ` beat `ch` and `t`.
    "chʼ": "tʃʼ",
    "kʼ": "kʼ", "tʼ": "tʼ", "pʼ": "pʼ", "tsʼ": "sʼ",
    "ch": "tʃ", "sh": "ʃ", "ny": "ɲ", "zh": "ʒ",
    "b": "b", "d": "d", "f": "f", "g": "ɡ", "h": "h", "j": "dʒ", "k": "k",
    "l": "l", "m": "m", "n": "n", "p": "p", "r": "r", "s": "s", "t": "t",
    "v": "v", "w": "w", "y": "j", "z": "z",
    "ʼ": "ʔ", "ʽ": "ʔ",
}
# The seven orders. `ā` is the first order of the five guttural rows only -- the BGN
# table prints `hā` and `ʼā` where every other row prints `Ce`, because on ሀ ሐ ኀ አ ዐ
# the first order says [a] and ሀ and ሃ are homophones -- so it is a spelling of /a/
# and not an eighth vowel.
AM_VOWELS = {"e": "ə", "u": "u", "ī": "i", "a": "a", "ē": "e", "i": "ɨ", "o": "o",
             "ā": "a"}
# Longest first: `ī ē ā` are one codepoint each but must be tried before `i e a` in
# case a future normalisation decomposes them.
AM_VOWEL_KEYS = sorted(AM_VOWELS, key=len, reverse=True)
AM_CONS_KEYS = sorted(AM, key=len, reverse=True)


def am_to_ipa(word):
    """One BGN/PCGN-romanised Amharic word, geminates and all.

    A consonant written twice is long: the doubling is on the *first character* of
    its spelling, so `nny` is /ɲː/ and `nna` is /nː/ + /a/, resolved by trying the
    consonant keys longest first at the second character. A consonant with no vowel
    after it is the sixth order with its vowel unpronounced, which is departure 2. A
    vowel with no consonant before it is the አ series romanised bare, which is the
    standard's own Note 4 -- so `ādīs` is /ʔadis/ and not /adis/.

    No stress mark, deliberately: see `STRESS["am"]`.
    """
    out, i = [], 0
    while i < len(word):
        if word[i] == "-":
            # A hyphen joins the two halves of a written compound -- `ī-sīm`, and the
            # fidal writes ኢ-ሲም -- and is not a sound. `clean` keeps it because it is
            # load-bearing for French elision and Pinyin, so it is dropped here, as
            # the Hebrew and Klingon routes drop theirs.
            i += 1
            continue
        letter = longest(AM, word, i)
        if letter is None:
            vowel = longest(AM_VOWELS, word, i)
            if vowel is None:
                out.append(word[i])              # carried out, so a gate names it
                i += 1
                continue
            out.append("ʔ" + AM_VOWELS[vowel])   # BGN Note 4, word-initially
            i += len(vowel)
            continue
        # A geminate: the same character twice, then a consonant spelling starting
        # with it. `ll` finds `l` at the second character and `nny` finds `ny`.
        double = None
        if word.startswith(word[i] * 2, i):
            double = next((c for c in AM_CONS_KEYS
                           if word.startswith(c, i + 1) and c[0] == word[i]), None)
        if double:
            out.append(AM[double] + "ː")
            i += 1 + len(double)
        else:
            out.append(AM[letter])
            i += len(letter)
        vowel = longest(AM_VOWELS, word, i)
        if vowel is not None:
            out.append(AM_VOWELS[vowel])
            i += len(vowel)
    return "".join(out)


# ---------------------------------------------- Klingon orthography -> IPA
# Klingon is written in a Latin transcription of Okrand's own devising, and TKD
# section 1.1 describes each letter's sound one at a time -- so this is a table
# rather than a G2P, the same shape the Hepburn and Revised Romanization routes
# have, and the values are the IPA the published descriptions amount to (TKD 1.1;
# the same inventory is tabulated in the Klingon-language literature as
# /pʰ tʰ qʰ ʔ b ɖ t͡ɬ t͡ʃ q͡χ d͡ʒ ʂ x v ɣ m n ŋ r w l j/ over five vowels
# /ɑ ɛ ɪ o u/).
#
# **The orthography is case-significant and nothing here may fold it.** `q` /qʰ/
# and `Q` /q͡χ/ are a minimal pair -- `qat` "accompany" against `Qat` "be popular"
# -- and `I` is the vowel /ɪ/ while `i` is not a letter of the language at all. The
# other three table routes lowercase their input, because for them a capital is
# orthography rather than sound; doing it here would merge two consonants and
# delete a vowel. That is also why `ROUTE_FORBIDS` names eleven lowercase letters:
# every one of them is legal IPA, so a cell written `hol` for `Hol` would otherwise
# be transcribed as `hol` and pass every gate.
#
# Three-letter keys come first because `longest` tries 3, 2, 1 -- and `ngh` is here
# for a reason that reads like an accident and is not. No Klingon letter is a bare
# `h`: the only letters containing one are `ch`, `gh`, `tlh` and the separate
# consonant `H`. So an `h` after `ng` can only be the second letter of `gh`, which
# makes `ngh` unambiguously `n` + `gh` and never `ng` + something. Five entries in
# the lexicon need it (`nenghep`, `QIngheb`, `tlhonghaD`, `Hanghuq`, `chungHa'wI'`),
# and without it `ng` would match first, leave a bare `h`, and take the row down.
#
# `Q` is given as `qχ` and `FOLD` then writes it `qx`, which is the same treatment
# every other uvular in this file gets and is safe here for the same reason it is
# safe there: Klingon's syllable canon admits exactly one consonant in an onset and
# one in a coda (plus `-w'`, `-y'`, `-rgh`), so a `q`+`x` sequence cannot arise from
# two separate letters and `qx` can only be `Q`.
#
# It does have one visible consequence, on exactly two rows. `Q` followed by `H` is
# /q͡χ/ + /x/, and after the fold that is `qxx` -- `ngaQHa'moHwI'` (key) comes out
# `ŋɑqxxɑʔmoxwɪʔ`, where the doubled `x` reads like a geminate and is not one. It is
# still unambiguous, because `qHH` is not a possible Klingon spelling and neither is
# a bare `q` before two `H`s, so `qxx` can only be `Q`+`H`. Keeping χ would read
# better and would cost far more: no reader's table has a rule for U+03C7, and five
# of the nineteen draw in a stack whose source font has no glyph for it.
TLH = {
    "ngh": "nɣ",
    "tlh": "tɬ",
    "ch": "tʃ", "gh": "ɣ", "ng": "ŋ",
    "D": "ɖ", "H": "x", "Q": "qχ", "S": "ʂ", "I": "ɪ",
    "b": "b", "j": "dʒ", "l": "l", "m": "m", "n": "n", "p": "pʰ", "q": "qʰ",
    "r": "r", "t": "tʰ", "v": "v", "w": "w", "y": "j",
    "a": "ɑ", "e": "ɛ", "o": "o", "u": "u",
    "'": "ʔ",
}


def tlh_to_ipa(word):
    """One Klingon word, letter by letter, longest grapheme first.

    Not lowercased -- see `TLH`. The unreadable tail is carried out rather than
    dropped, so `check_alphabet` and `check_route` refuse the row and name the
    character instead of the cell going quietly wrong.
    """
    out, i = "", 0
    while i < len(word):
        if word[i] == "-":                        # a suffix boundary, not a sound
            i += 1
            continue
        letter = longest(TLH, word, i)
        if not letter:
            return out + word[i:]
        out += TLH[letter]
        i += len(letter)
    return out


# ------------------------------------------------ Quenya orthography -> IPA
# Quenya's pronunciation is Tolkien's own, in *The Lord of the Rings* Appendix E,
# and its orthography is regular enough to be a table: `c` is always /k/, `qu` is
# /kw/ ("qu has been used for cw"), `x` is /ks/, an acute marks a long vowel, and a
# diaeresis marks a vowel that is pronounced rather than silent -- so `ë` is /e/ and
# not a separate quality. The consonant values are checked against Eldamo's own
# phoneme inventory for Late Quenya, which lists each one with the orthography that
# writes it (`c` [k], `qu` [kʷ], `ty` [tʲ], `ny` [nʲ], `hy` [j̊], `hw` [w̥],
# `hl` [l̥], `hr` [r̥], `nw` [ŋʷ], `gw` [gʷ]).
#
# Where a phoneme and its spelling disagree about how many segments there are, this
# table follows the **spelling** and `qya_weight` follows the **phoneme**, and that
# split is deliberate rather than sloppy. Appendix E describes the palatal series in
# terms an English reader can say -- `ty` "as the ty in British tune", `hy` "as in
# English hew, huge" -- which is a consonant plus /j/, and spelling them that way is
# what lets nineteen reader tables that have no palatalised series spell them at all
# (`ʲ` is in every one of them, but every one of them spells it as nothing). Syllable
# weight is a different question, and there the segment count is what Appendix E's
# stress rule counts, so `qu` and `ty` count as one consonant there.
#
# `hl` and `hr` are the Third-Age readings Appendix E gives, where the voiceless
# liquids had already fallen in with plain `l` and `r`. `þ` likewise does not appear:
# in the Quenya of the Exiles it had become `s`, and the attested Late Quenya word
# list writes none.
QYA_C = {                                         # (ipa, consonant units)
    "ht": ("xt", 2), "ng": ("ŋɡ", 2), "x": ("ks", 2),
    "qu": ("kw", 1), "ty": ("tj", 1), "ny": ("nj", 1), "ly": ("lj", 1),
    "ry": ("rj", 1), "dy": ("dj", 1), "hy": ("hj", 1), "hw": ("hw", 1),
    "hl": ("l", 1), "hr": ("r", 1), "nw": ("ŋw", 1), "gw": ("ɡw", 1),
    "p": ("p", 1), "t": ("t", 1), "c": ("k", 1), "k": ("k", 1), "b": ("b", 1),
    "d": ("d", 1), "g": ("ɡ", 1), "f": ("f", 1), "v": ("v", 1), "s": ("s", 1),
    "h": ("h", 1), "m": ("m", 1), "n": ("n", 1), "l": ("l", 1), "r": ("r", 1),
    "w": ("w", 1), "y": ("j", 1), "ñ": ("ŋ", 1), "þ": ("θ", 1), "χ": ("x", 1),
}
# A nucleus, and whether it is *heavy* for the stress rule. Eldamo's stress entry is
# explicit that only the six true diphthongs count -- "two vowels in hiatus make up a
# pair of light syllables, not one heavy syllable: tië has two syllables, ti.e" --
# so `ëa`, `ea`, `oa` and the rest are two nuclei and fall out of the single-vowel
# entries below. `iu` is Appendix E's Third-Age rising reading, "as yu in English
# yule", which puts the glide in the onset and leaves `u` as the nucleus; it is still
# a true diphthong for the weight rule, which is why the flag is carried here rather
# than derived from the vowel's own length.
QYA_V = {
    "ai": ("aj", True), "au": ("aw", True), "oi": ("oj", True), "ui": ("uj", True),
    "eu": ("ew", True), "iu": ("ju", True),
    "á": ("aː", True), "é": ("eː", True), "í": ("iː", True), "ó": ("oː", True),
    "ú": ("uː", True),
    "ä": ("a", False), "ë": ("e", False), "ö": ("o", False),
    "a": ("a", False), "e": ("e", False), "i": ("i", False), "o": ("o", False),
    "u": ("u", False),
}


def qya_units(word):
    """One Quenya word as [(kind, ipa, weight)], or None if a letter is unreadable.

    `kind` is `V` for a nucleus and `C` for a consonant; `weight` is the heaviness
    flag for a nucleus and the segment count for a consonant. Both tables are tried
    longest-first at each position, vowels before consonants, so `ai` beats `a` and
    `ty` beats `t`.
    """
    units = []
    i = 0
    while i < len(word):
        if word[i] in "-'":                       # elision and hyphen are not sounds
            i += 1
            continue
        vowel = longest(QYA_V, word, i)
        if vowel:
            units.append(("V",) + QYA_V[vowel])
            i += len(vowel)
            continue
        cons = longest(QYA_C, word, i)
        if not cons:
            return None
        units.append(("C",) + QYA_C[cons])
        i += len(cons)
    return units


def qya_weight(units):
    """Which nucleus of `units` is heavy, in nucleus order.

    Eldamo, following Appendix E: a light syllable "contains a single short vowel and
    is followed by zero or one consonant", and anything else is heavy -- a long
    vowel, a true diphthong, or a vowel followed by two or more consonants. Counted
    in *segments* rather than in letters, so `niquessë` is light-heavy-light (`qu` is
    one, `ss` is two) and comes out ni-QUES-se the way the source says it does.
    """
    heavy, run = [], 0
    for kind, _, w in reversed(units):
        if kind == "C":
            run += w
        else:
            heavy.append(w or run >= 2)
            run = 0
    return list(reversed(heavy))


def qya_to_ipa(word):
    """One Quenya word, with Appendix E's stress written on the nucleus.

    The rule is fully mechanical and this is the only route here that can say that:
    "In words of two syllables it falls in practically all cases on the first
    syllable. In longer words it falls on the last syllable but one, where that
    contains a long vowel, a diphthong, or a vowel followed by two (or more)
    consonants; otherwise it falls on the syllable before that" (LotR/1116). A
    monosyllable gets no mark, which is also what every reader's
    `stress_min_syllables` would do with one.

    The mark goes immediately before the stressed nucleus rather than before its
    onset, which is where espeak puts it for the thirteen espeak languages and where
    `syllabify` in core/respell.js reads it from: the mark applies to the next unit,
    and onset maximisation has already put the onset in the same syllable.
    """
    units = qya_units(word.lower())
    if units is None:
        return word                               # fails check_alphabet
    heavy = qya_weight(units)
    n = len(heavy)
    at = None
    if n == 2:
        at = 0
    elif n >= 3:
        at = n - 2 if heavy[n - 2] else n - 3
    out, seen = "", 0
    for kind, ipa, _ in units:
        if kind == "V":
            if seen == at:
                out += "ˈ"
            seen += 1
        out += ipa
    return out


# ---------------------------------------------- Filipino orthography -> IPA
# Filipino has no espeak voice in this build, and none in `espeakng_loader`'s
# bundled library either -- checked both directly rather than assumed: neither
# `EspeakBackend.supported_languages()` (system espeak-ng-data 1.50) nor the
# `poz/` directory (the Malayo-Polynesian family folder that holds `id` and `ms`)
# under either library's `espeak-ng-data/lang/` tree has a `tl` or `fil` file. So
# this is the `he`/`tlh`/`qya` case, a table read letter by letter -- except there
# is no separate romanisation column to read it *off*, because Filipino
# orthography already *is* the romanisation: it has been written in the Latin
# alphabet since Spanish contact, and the post-1987 alfabetong Filipino (the
# native Abakada's 20 letters plus `c f j ñ q v x z` for loanwords and proper
# names) is close to phonemic throughout. `route()` below reads `row["text"]`
# directly rather than adding `fil` to `ROMANISED`, and `fil` is not added to
# `NON_LATIN` either, for the same reason: the script is already Latin, so there
# is no "loanword written in the wrong alphabet" case for `latin_survives` to
# catch.
#
# Two words are hand-coded rather than left to the table, because they are
# frozen irregular spellings of extremely common grammatical function words
# rather than an ordinary sound-letter mismatch a table entry could fix. `ng`,
# the linker/genitive particle (`bahay ng pusa`, "the cat's house"), is
# pronounced [naŋ] -- not [ŋ] -- and `mga`, the plural marker (`mga bata`,
# "children"), is pronounced [maˈŋa]. Both are named in Tagalog reference
# grammars (Schachter & Otanes, *Tagalog Reference Grammar*, University of
# California Press, 1972, section on function words) as the two spellings the
# modern alphabet inherited without reforming -- almost certainly because both
# are so frequent that respelling them was never going to happen. Every *other*
# occurrence of the digraph `ng` is the ordinary velar nasal /ŋ/ and goes through
# `FIL` like any other digraph, including where a genuine `ng`+`g` cluster
# follows (`panggastos` "for spending" -> `p a ŋ ɡ a s t o s`, matching how the
# word is actually said, digraph then plain letter, with no separate rule
# needed).
FIL_WORDS = {"ng": "naŋ", "mga": "maŋa"}

# Digraphs first (`longest` tries 3, 2, then 1 -- there are no 3-letter keys
# here, so a 3-character probe that happens to land on a 2-letter key at the end
# of a short word is the same outcome as the 2-character probe finding it).
# `ng` is the native velar nasal; `ts` is the affricate loanwords are spelled
# with (tsokolate "chocolate", tsinelas "slippers"); `ny` and `ñ` both write the
# palatal nasal Spanish loans carry (banyo < baño, Espanya < España) -- modern
# Filipino orthography prefers `ny` for common nouns and reserves bare `ñ` for a
# handful of retained proper names, so both map to the same phoneme rather than
# the pack needing to pick one. No entry is needed for the diphthongs `ay aw iw
# oy uy ey` at all: `y` and `w` are already the glides /j/ and /w/ in the plain
# letter table below, so `ay` composes to /aj/ and `aw` to /aw/ for free, the
# same way Indonesian's respell table gets `ai`/`au` for nothing.
FIL = {
    "ng": "ŋ", "ts": "ts", "ny": "ɲ", "qu": "k",
    "a": "a", "e": "ɛ", "i": "i", "o": "o", "u": "u",
    "b": "b", "k": "k", "d": "d", "g": "ɡ", "h": "h", "l": "l", "m": "m", "n": "n",
    "p": "p", "r": "ɾ", "s": "s", "t": "t", "w": "w", "y": "j",
    "ñ": "ɲ", "f": "f", "v": "v", "z": "z", "j": "dʒ", "q": "k", "x": "ks",
}
# `c` alone is the one letter this table cannot give a context-free value: the
# alfabetong Filipino keeps the Spanish rule it was borrowed with, /s/ before a
# front vowel and /k/ elsewhere (`sentro`, `klima` -- most loans are simply
# respelled with `s`/`k` instead, but a handful of retained spellings are not).
FIL_C_FRONT = {"e": "s", "i": "s"}


def fil_to_ipa(word):
    """One Filipino word, letter by letter, longest grapheme first.

    Lowercased by the caller in `route()`, like the other table routes: Filipino
    capitalises the first word of a sentence and proper nouns, and a capital is
    orthography, not a sound.

    No stress mark is ever placed, which is a finding rather than an oversight.
    Filipino stress is lexical and contrastive -- `buhay` [ˈbuhaj] "life" against
    `buhay` [buˈhaj] "alive" is the textbook minimal pair -- and with no espeak
    voice and no machine-readable pronouncing dictionary for Tagalog/Filipino to
    look it up from, there is nothing to derive it from except a wrong default.
    That is the same conclusion `STRESS` already reaches for Persian, for a
    different reason (verbs and nominals stress in opposite directions there;
    here the rule is simply unrecoverable from the spelling without a lexicon).
    See `STRESS["fil"]` for the fuller note.

    The phonemic word-final glottal stop (`baba` "chin" against `babà` "to go
    down") is the same story and is silently absent for the same reason: it is
    real and contrastive, and the everyday orthography this pack's `text` column
    uses -- a road sign, a newspaper, a phrasebook -- does not write it either,
    reserving the grave/circumflex tuldik marks for a dictionary headword. What
    the printed word does not distinguish, this column cannot recover.

    The predictable word-initial glottal *onset* before a vowel-initial syllable
    (`aso` "dog", phonetically [ˈʔaso]) is not written either, and that is a
    consistency decision rather than a second gap: `EspeakBackend('id')` does not
    insert one for the identical environment in Indonesian (`anak` -> `ˈanak`,
    not `ʔˈanak`, confirmed directly against this build's output), and a
    Malayo-Polynesian sibling language's own espeak-derived column is the more
    relevant precedent here than inventing a mark from scratch.

    A bare digit is carried out unread rather than expanded to a number word,
    unlike espeak's own languages, which expand a numeral before phonemising it
    for free. Five rows in this pack are literal numerals or contain one
    (`numbers-money.2-items`, `.li-ng`, `.lakh`, `.crore`, `.toman`), and all
    five are refused here rather than guessed at: writing a place-value reader
    for five reference rows is exactly the speculative machinery this project
    avoids building for a case that does not generalise, and an absent `ipa`
    on a reference word is a stated, checked gap rather than a silent one.
    """
    if word in FIL_WORDS:
        return FIL_WORDS[word]
    out, i = "", 0
    while i < len(word):
        if word[i] in "-'":
            # A hyphen is a morpheme boundary; an apostrophe marks an elided
            # syllable in casual spelling ('yun for iyon) -- 'Wala 'yun!' in
            # slang.csv is the row this was found on. Neither is a sound.
            i += 1
            continue
        if word[i] == "c":
            out += FIL_C_FRONT.get(word[i + 1:i + 2], "k")
            i += 1
            continue
        letter = longest(FIL, word, i)
        if letter:
            out += FIL[letter]
            i += len(letter)
            continue
        out += word[i]                                # carried out, so a gate names it
        i += 1
    return out


# Letters that are inside the IPA alphabet and still cannot appear in *Japanese*
# IPA, so seeing one means a Hepburn mora went unconverted rather than that the
# reading is exotic. `u` is the sharp one: Japanese /ɯ/ is never `u`, so a single
# `u` is proof the tail was carried out whole. This is what let `chekkuin` ship --
# `check_alphabet` only knows what is IPA, not what is IPA *for this language*.
ROUTE_FORBIDS = {
    "hepburn": set("ucflqx"),
    # Every lowercase letter Klingon's orthography does not use, and every one of
    # them is legal IPA -- which is the whole reason the gate is needed. `TLH` is a
    # whitelist and an unmatched letter is carried out, so `hol` for `Hol` would
    # otherwise transcribe as `hol`, `Sos` for `SoS` as `ʂos`, and both would pass
    # `check_alphabet`. `p t d` are absent from the list because the table emits them
    # inside `pʰ`, `tʰ`, `tʃ` and `dʒ`.
    "okrand": set("acefghiksyz"),
    # `c`, `q` and `y` are Quenya letters that this table always rewrites -- `c` to
    # `k`, `qu` to `kw`, `y` to `j` -- so one surviving means the letter was not
    # where the table expected it: a bare `q` with no `u` after it, most likely a
    # typo for `qu`.
    "appendix-e": set("cqy"),
    # Every one of these is legal IPA and none of them is a sound Modern Hebrew
    # has, so one surviving means a BGN letter went unconverted: `q` for ק, `y`
    # for י, `c` and `w` for nothing at all. `HE` is a whitelist and an unmatched
    # character is carried out, which is what makes the gate necessary.
    "bgn": set("cqwy"),
    # Every one of these is legal IPA and none of them is a sound Amharic has, so one
    # surviving means a BGN letter went unconverted. `q` and `x` are not letters of
    # this romanisation at all -- BGN writes ቀ as `k’` and Amharic has no velar
    # fricative -- and `y` is always rewritten to `j`. `c` is *not* in the list,
    # because the table emits it inside `tʃ` and `tʃʼ`.
    "bgn-am": set("qxy"),
}


def check_route(ipa, route):
    """The characters `route` should never produce. Non-empty means refuse the row."""
    return sorted(set(ipa) & ROUTE_FORBIDS.get(route, set()))


def check_alphabet(ipa):
    """The characters of `ipa` that are not IPA. Non-empty means refuse the row.

    Decomposed first, because the column is stored NFC and NFC composes a
    nasalisation mark into its vowel wherever a precomposed form exists: espeak's
    Portuguese `ũ` arrives as u + U+0303 and is stored as U+0169. Five vowels do
    that -- ã ẽ ĩ õ ũ -- and `core/respell.js` will need them in its `VOWELS` set,
    because to it they are one character and not a vowel plus a tail.
    """
    return sorted({c for c in unicodedata.normalize("NFD", ipa) if c not in ALPHABET})


# `thaig2p` is a seq2seq decoder with a fixed output cap, and past it it repeats
# the last syllable until it runs out of room -- `ธรรม` becomes
# `tʰam˧.ra˦˥.ma˦˥.ma˦˥.ma˦˥.ma`. It is the only failure here that produces
# plausible-looking garbage rather than nothing, so a word it happens to must take
# its row down with it: this stands in for the syllable and `check_alphabet`
# refuses the row and counts it.
DECODER_STUCK = "…"


def thai_syllables():
    """A cached Thai syllable -> IPA function, so a repeated word costs nothing."""
    from pythainlp.tokenize import syllable_tokenize, word_tokenize
    from pythainlp.transliterate import transliterate
    cache = {}

    def g2p(unit):
        if unit not in cache:
            raw = [p.strip() for p in
                   transliterate(unit, engine="thaig2p").split(".") if p.strip()]
            stuck = any(raw[i] == raw[i + 1] == raw[i + 2] for i in range(len(raw) - 2))
            cache[unit] = DECODER_STUCK if stuck else "".join(raw).replace(" ", "")
        return cache[unit]

    def one(word):
        out = "".join(g2p(s) for s in syllable_tokenize(word, engine="dict")
                      if any(c.isalpha() for c in s))
        # **A syllable the decoder loops on is usually a syllable it was never
        # meant to be given.** `ธรรม` and `บบ` are dictionary syllables that are
        # not words, and asked for the *word* the same model answers cleanly:
        # `ค่าธรรมเนียม` is `kʰaː˥˩ tʰam˧ nia̯m˧` and `ระบบ` is `ra˦˥ bop˨˩`,
        # which are the three syllables and two syllables the curated Thai sheet
        # writes as `KAH tam-niam` and `ra-bop`. So the unit was the fault rather
        # than the model, and this closes the three rows Thai was refusing --
        # `ค่าธรรมเนียม` twice and `ระบบเติมเงิน` -- without touching the other
        # 746, which never reach this line.
        #
        # The retry is per word, not per row: given the whole string the model
        # loops on `มีค่าธรรมเนียมไหม` and drops a syllable from `ระบบเติมเงิน`,
        # and `word_tokenize` already hands this function the right unit.
        return g2p(word) if DECODER_STUCK in out else out

    def chunk(text):
        return " ".join(filter(None, (one(w) for w in word_tokenize(text, engine="newmm")
                                      if any(c.isalpha() for c in w))))
    return chunk


def route(code, chunks):
    """A `chunk -> IPA` function for one language, and the provenance tag naming it.

    `chunks` is every chunk the caller will ask for: the espeak backend costs a
    second to start and the Thai model twelve, so neither is built per row, and
    espeak phonemises the whole batch at once. Shared with `language_name_ipa`,
    which has to put the language names through the same route the column uses or
    the substituted cell would be in a different phonology than the sentence
    around it.
    """
    if code in VOICES and code in WORD_AT_A_TIME:
        lexicon = espeak_lexicon(VOICES[code], [w for c in chunks for w in c.split()])
        return lambda chunk: " ".join(lexicon.get(w) or "" for w in chunk.split()), "espeak"
    if code in VOICES:
        # `bn_compose` is the identity for every other language: those three
        # sequences occur in no other pack, in no registry file and in no override.
        pre = bn_compose if code == "bn" else (lambda text: text)
        lexicon = espeak_lexicon(VOICES[code], [pre(c) for c in chunks])
        return (lambda chunk: lexicon.get(pre(chunk))), "espeak"
    if code == "th":
        return thai_syllables(), "thaig2p"
    if code == "zh-Hans":
        # Lowercased for the same reason the other two table routes are: a capital
        # is orthography, not sound. `dragonmapper` tolerates one on an initial
        # (`Zhōngwén`) and refuses one on a bare vowel, so `Ālābóyǔ` and `Éyǔ` --
        # Chinese for Arabic and Russian -- were the only two language names in the
        # matrix with no transcription.
        return lambda chunk: " ".join(pinyin_to_ipa(w.lower())
                                      for w in chunk.split()), "pinyin"
    if code == "ja":
        return lambda chunk: " ".join(hepburn_to_ipa(w.lower())
                                      for w in chunk.split()), "hepburn"
    if code == "ko":
        return lambda chunk: " ".join(rr_to_ipa(w.lower()) for w in chunk.split()), "rr"
    if code == "tlh":
        # **Not lowercased**, unlike the three routes above: Klingon's orthography is
        # case-significant and `q`/`Q` is a minimal pair. See `TLH`.
        return lambda chunk: " ".join(tlh_to_ipa(w) for w in chunk.split()), "okrand"
    if code == "qya":
        return lambda chunk: " ".join(qya_to_ipa(w) for w in chunk.split()), "appendix-e"
    if code == "he":
        # Lowercased like the other romanisation routes: a capital in this column is
        # a sentence opening, not a sound.
        return lambda chunk: " ".join(he_to_ipa(w.lower()) for w in chunk.split()), "bgn"
    if code == "am":
        # Lowercased like the other romanisation routes: a capital in this column is
        # a sentence opening, not a sound. Amharic has no case of its own.
        return lambda chunk: " ".join(am_to_ipa(w.lower())
                                      for w in chunk.split()), "bgn-am"
    if code == "fil":
        # Reads `row["text"]` itself, not a romanisation column -- see the comment
        # above `FIL_WORDS` for why `fil` is in neither `ROMANISED` nor `NON_LATIN`.
        return lambda chunk: " ".join(fil_to_ipa(w.lower()) for w in chunk.split()), "fil-g2p"
    raise SystemExit(f"no route for {code}")


def pinyin_to_ipa(word):
    """One Pinyin word. dragonmapper spaces out the syllables of a polysyllabic
    word; they are joined back up so the IPA has the same word boundaries the
    Pinyin column does, and `core/respell.js` hyphenates within a word."""
    from dragonmapper import transcriptions
    try:
        return transcriptions.pinyin_to_ipa(word).replace(" ", "")
    except Exception:
        return word                               # fails check_alphabet


# ------------------------------------------------------------- language names
NAMES = DATA / "registry/language-names.csv"


def cldr_names(codes):
    """`Intl.DisplayNames` for every (locale, subject) pair, asked of node.

    The registry deliberately carries a `name` only where CLDR is wrong for our
    purposes -- `content/LANGUAGE-SLOTS.md`, "Where Intl.DisplayNames is not
    enough" -- and `languageName` in core/pack.js falls back to CLDR for the rest.
    So the names this has to phonemise mostly are not in the repository at all, and
    the only honest source for them is the one the renderer itself will use.

    That also makes this the drift check that document asks for: if an ICU version
    renames a language, the `ipa` generated from the new name differs from the
    committed one and `--check` fails, which is the notification. Asked exactly the
    way `languageName` asks -- full locale, base language for the subject, since
    `zh-Hans` answers with the *script* ("Simplified Chinese", "chinois simplifie")
    and nobody says `Parlez-vous chinois simplifie ?`.
    """
    script = """
      const codes = JSON.parse(process.argv[1]);
      const out = {}, own = [];
      for (const locale of codes) {
        const names = new Intl.DisplayNames([locale], { type: 'language' });
        // Whether ICU has display data *for* this locale, as against display data
        // about it. Both new languages are in CLDR as subjects and neither is a
        // display locale, so asking either of them for a name silently answers in
        // English -- see `language_name_ipa`.
        if (names.resolvedOptions().locale.split('-')[0] === locale.split('-')[0]) {
          own.push(locale);
        }
        out[locale] = {};
        for (const subject of codes) {
          const base = subject.split('-')[0];
          out[locale][subject] = names.of(base) || base;
        }
      }
      console.log(JSON.stringify({ names: out, own }));
    """
    done = subprocess.run(["node", "-e", script, json.dumps(codes)],
                          capture_output=True, text=True, check=True)
    got = json.loads(done.stdout)
    return got["names"], set(got["own"])


def language_name_ipa(locales, subjects, rows):
    """{(locale, bcp47): ipa} for one language naming another, with no entry at all
    for a pair its route refuses.

    Up to 272 strings rather than the 17 `{target}` needed, because a `{source}`
    cell is the target's sentence naming the *reader's* language: `Parlez-vous
    {source} ?` wants French's word for each of the other sixteen. Every pair is
    needed -- both `{source}` concepts ship in all seventeen packs -- and the
    17 diagonal entries `{target}` already uses fall out of the same loop, so this
    owns the whole column rather than adding to it.

    Through the language's own route, so the substituted name is in the same
    phonology as the sentence it lands in: the seven romanised packs read their
    `romanization` cell, which is hand-written and complete, and the rest read the
    name in its own script. A pair the route refuses gets an empty cell, and
    `fillLanguageSlots` then blanks the whole `ipa` rather than printing a sentence
    with a hole where the language should be -- which is the blank respelling these
    rows print today, so nothing regresses.
    """
    names, cldr_locales = cldr_names(sorted(set(locales) | set(subjects)))
    written = {}
    for locale in locales:
        # What to phonemise, per subject. A pack read off a romanisation reads the
        # registry's own `romanization` cell -- one column here where the corpus has
        # one per system, because a language names another in only one of them --
        # and the rest read the name, CLDR's unless the registry overrides it.
        text = {}
        for subject in subjects:
            row = rows.get((locale, subject), {})
            # **A locale ICU cannot display in gets no fallback at all.** `tlh` and
            # `qya` are in CLDR as subjects and in neither case as a display locale,
            # so `Intl.DisplayNames(['qya'])` resolves to English and answers
            # "Greek", "Japanese", "Swahili" -- names that are not Quenya words. Run
            # through the Quenya route those came out as `ɡrˈeek`, `japanˈese`,
            # `swˈahili`: legal IPA, correctly stressed by Appendix E's rule, and
            # wrong in the one way this column cannot afford, since `fillLanguageSlots`
            # would have substituted them into a Quenya sentence. So for these
            # locales the registry's own `name` is the only source, and a subject it
            # has no name for gets no cell -- which is what an empty `ipa` already
            # means everywhere else here.
            cldr = names[locale][subject] if locale in cldr_locales else ""
            name = (row.get("romanization") if locale in ROMANISED
                    else row.get("name") or cldr) or ""
            if name and locale == "ko":
                # RR read against the Hangul it romanises, which for every name but
                # 한국어 is CLDR's rather than the registry's: `yeongeo` is 영어, so
                # the `ng` is /ŋ/, while `hangugeo` is 한국어 and its `ng` is not.
                name = ko_romanization(names[locale][subject], name) or ""
            text[subject] = name
        # Keyed on what `pieces` produces and not on the name, because that is what
        # `transcribe` will be asked for: `espeak_lexicon` is a dict, so a name
        # `clean` trims would miss its own entry and come back empty.
        parts = {subject: pieces(name) for subject, name in text.items() if name}
        transcribe, method = route(locale, [v for one in parts.values()
                                            for kind, v in one if kind == "text"])
        for subject, one in parts.items():
            ipa = assemble([(kind, normalise(transcribe(value) or "", locale, value)
                             if kind == "text" else value)
                            for kind, value in one])
            ipa = unicodedata.normalize("NFC", re.sub(r"\s+", " ", ipa).strip())
            if ipa and not check_alphabet(ipa) and not check_route(ipa, method):
                written[(locale, subject)] = ipa
    return written


def load_names():
    """The registry keyed on (locale, bcp47), and its header, in file order."""
    with NAMES.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        return reader.fieldnames, {(r["locale"], r["bcp47"]): r for r in reader}


def write_names(header, rows, ipa, locales):
    """The registry as text, with the `ipa` cell of every row whose locale is in
    `locales` set from `ipa`.

    Owning the column for a locale rather than only adding to it, the same way the
    corpus pass does: a pair the route stops being able to read has to lose the
    value the last run left behind. A pair `ipa` has nothing for keeps whatever else
    its row holds -- a `name` override, a romanisation -- and a pair with no row at
    all only gets one if there is an `ipa` to put in it, so the file never grows a
    row of five empty cells.
    """
    for key, row in rows.items():
        if key[0] in locales:
            row["ipa"] = ipa.get(key, "")
    for key, value in ipa.items():
        rows.setdefault(key, dict.fromkeys(header, ""))["ipa"] = value
    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, header, lineterminator="\n",
                            extrasaction="ignore")
    writer.writeheader()
    for key in sorted(rows):
        row = dict(rows[key], locale=key[0], bcp47=key[1])
        writer.writerow(row)
    return out.getvalue()


# ------------------------------------------------------------------ the corpus
def load_rows(path):
    """(header, [(line, fields)]) with every line kept as it was written.

    Byte-exact round-tripping matters here and a whole-file rewrite does not give
    it: four Arabic note rows are quoted on disk for a U+060C Arabic comma, which
    `csv.QUOTE_MINIMAL` would not quote. Keeping the original line for every row
    this script does not touch makes the diff exactly the cells that changed.
    """
    raw = path.read_bytes().decode("utf-8")
    lines = raw.split("\r\n")
    if lines and lines[-1] == "":
        lines.pop()
    rows = [(line, next(csv.reader([line]))) for line in lines]
    return rows[0], rows[1:]


def write_rows(header, rows):
    """The file back as text: every untouched line verbatim, the rest re-serialised."""
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\r\n")
    out.write(header[0] + "\r\n")
    for line, fields in rows:
        if line is None:
            writer.writerow(fields)
        else:
            out.write(line + "\r\n")
    return out.getvalue()


def provenance_with(provenance, method):
    """`provenance` with its `ipa=` element set to `method`, or dropped if None."""
    parts = [p for p in provenance.split(";") if p and not p.startswith("ipa=")]
    return ";".join(parts + ([f"ipa={method}"] if method else []))


def ipa_method(provenance):
    for part in provenance.split(";"):
        if part.startswith("ipa="):
            return part[len("ipa="):]
    return ""


# --------------------------------------------------------------------- grading
# What a reviewer should expect per language, from `content/RESPELL-PILOT.md` §9
# and from the two things this script can measure: whether the route is a mechanical
# transform of already-reviewed data, and how often its syllable count disagrees
# with the hand-written respelling of the same row.
GRADE = {
    "zh-Hans": ("A", "mechanical transform of the reviewed Pinyin column; tone sandhi not applied"),
    "ja": ("A", "mechanical transform of the reviewed Hepburn column; the 49% is 74% final /ɯ/ devoicing"),
    "ko": ("A-", "reviewed RR read against the Hangul's own blocks; no cross-boundary tensification"),
    "es": ("A", "es-419, near-phonemic; 72% -> 97% once the curator's /j/ hiatus is allowed for"),
    "it": ("A", "near-phonemic; stress 98.2%, and this curator keeps the medial glide. "
           "espeak's two notations for a geminate are folded to the doubled one, which is "
           "what Italian orthography writes and what survives a reader table: +1.0 point "
           "exact and +1.4 loose against the curated sheet, on 158 rows"),
    "id": ("A", "near-phonemic; stress 92.3%"),
    "sw": ("A", "near-phonemic; the syllable gap is prenasalised onsets (n-JEE-ah), a reader's rule"),
    "de": ("A", "shallow and stress 92.6%; the coda-r rows this build refused are repaired in REPAIR"),
    "el": ("A", "shallow in the direction that matters: Greek spelling is many-to-one for /i/ and /o/ "
           "but reading it is deterministic, and the accent marks the stress. No curated sheet, so "
           "the syllable column is blank; the two espeak artefacts are repaired above"),
    "hu": ("A", "phonemic orthography read one word at a time, and stress is positional rather "
           "than looked up -- first syllable, always, written by hu_stress -- so the one thing "
           "espeak gets wrong for every other language cannot be wrong here. No curated sheet, so "
           "the syllable column is blank; the three artefacts are repaired above. What is left is "
           "assimilation espeak declines to apply across a morpheme boundary: `nagysebessegu` and "
           "`egyszeru` come back read off the spelling rather than as [nɑccɛ-] and [ɛccɛryː], and "
           "a geminate before a consonant is shortened on some rows (`jobbra`, `mellkasi`) and not "
           "others. All three are careful-speech readings rather than errors"),
    "tlh": ("A", "a letter-by-letter table over TKD section 1.1's own descriptions, so the "
            "only thing that can be wrong here is the table -- and it is 26 entries long "
            "over a five-vowel, twenty-one-consonant inventory with a strict CV(C) syllable "
            "canon. Two things are deliberately absent. Stress is not written at all: TKD "
            "1.3 states it over morphology (the stem of a verb, the last syllable of a "
            "noun's stem, and any syllable ending in a glottal stop) and this column carries "
            "no morphological analysis, so a partly-right mark would capitalise some rows and "
            "not others for every reader whose table uses caps. And /t\u0361\u026c/ is written "
            "t\u026c, which is correct and which nothing else in the corpus has -- it is "
            "the phoneme that made every one of the other nineteen tables grow a rule, "
            "and no table has a rule for the cluster itself: phonemesOf splits it into "
            "/t/ + /\u026c/ before any rule is consulted, so each reader spells it with "
            "its own two, under its own slot conditions"),
    "qya": ("A", "a letter-by-letter table over The Lord of the Rings Appendix E, checked "
            "against Eldamo's own Late Quenya phoneme inventory, which lists each consonant "
            "with the orthography that writes it. Stress is the only fully mechanical stress "
            "rule in this file -- Appendix E states it as a function of syllable count and "
            "syllable weight and nothing else -- and `qya_weight` reproduces Eldamo's four "
            "worked examples exactly. The one judgement in it is that the palatal digraphs "
            "count as one consonant for weight while being spelt C+j, which is stated in "
            "`QYA_C`"),
    "am": ("A-", "a letter-by-letter table over BGN/PCGN 1967 for Amharic, read in "
           "reverse -- the standard says of itself that its letters reflect modern "
           "Amharic pronunciation, and read this way it is very nearly a phonemic "
           "notation, so the only thing that can be wrong is the table and it is 32 "
           "entries over a seven-vowel, twenty-eight-consonant inventory. **The "
           "weakness is gemination and it is the whole of the weakness.** Amharic "
           "geminates phonemically -- አለ is both `ala` \"he said\" and `alla` \"there "
           "is\", one and the same fidal string -- and neither the script nor espeak "
           "writes it, so it is *authored* in the romanisation column rather than "
           "derived from anything, which makes it exactly as good as the source behind "
           "each row and no better. It is the pack's weakest claim, it is the second "
           "thing a fluent speaker should read, and unlike most weaknesses of this "
           "kind it is visible on the artifact: the doubled letter prints in the "
           "romanisation column beside the word. The sixth-order vowel is the same "
           "shape of claim and a much safer one, because the standard's own Note 1 "
           "asks for it (`i` where the vowel is pronounced and nothing where it is "
           "not) and the syllable-structure rule behind it is exceptionless: ስንት is "
           "/sɨnt/ and ገንዘብ is /ɡənzəb/, where espeak gives `sˈɨnɨt` and `ɡˈənɨzəb`. "
           "Two things are deliberately *not* in the column. Stress: Amharic "
           "prominence is not contrastive and is written by neither orthography, so "
           "nothing is marked, which is Persian's, Tamil's, Telugu's and Gujarati's "
           "decision. And the intervocalic [β] allophone of /b/, which espeak does "
           "emit (አበባ `ʔˈaβəβa`) and which is real Amharic phonetics -- folded to /b/, "
           "because this column is broad everywhere else and `β` has a rule in five "
           "of thirty-eight reader tables"),
    "he": ("A-", "a letter-by-letter table over the BGN/PCGN 2018 agreement, which is "
           "the Academy of the Hebrew Language's own 2006/2011 transliteration read in "
           "reverse -- so the only thing that can be wrong is the table, and it is 31 "
           "entries over a five-vowel, twenty-consonant inventory. Two things are "
           "authored rather than derived and both are named departures from BGN: the "
           "stress, which is lexical in Hebrew and written by neither orthography, is "
           "carried by an acute on the non-final case and is therefore only as good as "
           "the pack's own word list (137 of 1,033 forms are marked, and two positions "
           "-- a final furtive patach and the `-ayim` dual -- are rule-derived rather "
           "than listed); and `ey`, because BGN writes [ej] as `e`. The known weakness "
           "is the shva: BGN note 3 resolves it by a morphological test this cannot "
           "perform, so the rule here is `e` word-initially and nothing elsewhere, and "
           "the twelve forms where Modern Hebrew disagrees (`solela`, `tikhtevu`, "
           "`umetsiot`) are corrected in the pack's own word list. It also means the "
           "column writes the careful `seliẖa` where Israelis say [sliˈχa], which is "
           "what BGN prescribes and is one syllable more than colloquial speech"),
    "fa": ("B+", "espeak has a Persian voice and it is much better than the Arabic one, for a "
           "structural reason rather than a lucky dictionary: Persian writes /i u ɑ/ with the "
           "letters ی و ا, so the three vowels Arabic leaves to a guess are on the page, and only "
           "/a e o/ are unwritten. Probed on fifty words chosen for exactly that ambiguity -- مرد "
           "گل سفر نظر گم پر تند خشک جلو عقب شکم نسخه -- the vowel is right in every one. Two "
           "artefacts are repaired in REPAIR above (`q1`, and the spelling-driven length mark) and "
           "after them the output is clean IPA. Three weaknesses, in order. **Stress is not "
           "written at all** and that is a decision, not a gap: see STRESS above. **ق and غ are "
           "both `q`**, which is the Tehrani merger and is right for the sound but drops the "
           "voicing, so Persian's uvular and Arabic's spell the same in every reader's column. "
           "**And the ezāfe is only as good as the pack**: the linking /e/ is not in the script, "
           "espeak does not insert it -- `آب معدنی` comes back `ɑb maʔdani` where Persian says "
           "*āb-e ma‘dani* -- so this pack writes the kasra U+0650 on the host word wherever an "
           "ezāfe is required, which makes espeak produce the vowel every time (`آبِ معدنی` -> "
           "`ɑbe maʔdani`, verified on sixteen constructions). A row that forgets the kasra loses "
           "one vowel silently, which is what a reviewer should grep for first"),
    "pl": ("A", "near-phonemic orthography, and the one language in this file whose "
           "stress espeak cannot get wrong: Polish stress is positional and "
           "exceptionless -- the penultimate syllable, always -- so the thing espeak "
           "misses for German, Turkish, Hindi and French cannot be missed here, and "
           "it is looked up rather than derived only because espeak already agrees. "
           "The four learned words Polish stresses on the antepenult (`gramatyka`, "
           "`fizyka`, `matematyka`, `uniwersytet`) are the whole exception list and "
           "none is in this corpus. Probed on the four things Polish orthography is "
           "*not* transparent about, and espeak has all four: final devoicing "
           "(`chleb` -> xlɛp), voicing assimilation across a cluster (`prosba` -> "
           "prɔʑba, `takze` -> taɡʐɛ), the nasal letters before a stop, which are "
           "vowel plus a homorganic nasal rather than a nasal vowel (`zab` -> zɔmp, "
           "`kat` -> kɔnt), and the devoicing of `w` after a voiceless consonant "
           "(`twoj` -> tfuj). The known weakness is that it merges `trz` with `cz` "
           "and `drz` with `dz-dot` -- `trzy` and `czy` both come back tʂɨ -- which "
           "is a merger careful Polish also makes, so it is the orthography's "
           "ambiguity rather than espeak's, and it costs the corpus nothing because "
           "The one thing it writes that the corpus did not already have is the "
           "palatalisation as a modifier letter -- `nie` comes back as a palatal "
           "nasal carrying U+02B2, `kwiat` as kfʲat, `pogotowie` as pɔɡɔtɔvʲɛ -- and "
           "of those units only the one on the palatal nasal was new, because the "
           "other seven are already in the corpus from Russian. It is folded out in "
           "REPAIR above, on the grounds that a palatal nasal carrying a "
           "palatalisation mark is redundant by definition; after the fold this "
           "column is 50 phonemes and every one of them was already in the corpus, "
           "so Polish costs the other twenty-three reader tables no edit at all. No "
           "curated sheet, so the syllable column is blank"),
    "cs": ("A", "near-phonemic orthography, and the same Polish/Hungarian argument for "
           "stress: Czech's is positional and exceptionless -- the first syllable, "
           "always -- so it is looked up rather than derived, and every probe agrees, "
           "long words and proclitic fusion included (`ˈaʊtomˌobil`, `do domu` -> "
           "`dˈodomu`). Probed on the four things Czech orthography is not transparent "
           "about. Voicing assimilation across a cluster is mostly right (`sbírka` -> "
           "`zbˈiːrka`, `prosba` -> `prˈozba`, `svatba` -> `svˈadba`, `pod stromem` -> "
           "`pˈotstromem`) with one systematic, repaired exception: word-initial/-medial "
           "`kd` never voiced to [ɡd] on any of `kdo/kde/kdy/kdyby/nikdo/nikdy` before "
           "`REPAIR[\"cs\"]`. ř devoicing after a voiceless consonant is right (`tři` -> "
           "`tr̝̊i`, `přes` -> `pr̝̊es`), and the voiceless ring is folded out in REPAIR "
           "because the alternation is automatic and Czech spelling does not mark it "
           "either. Syllabic r/l are right on every inflected form probed (krk, prst, "
           "smrt, srp, trh, vlku, vlkodlak, vlna, plný, plzeň), with one dictionary-level "
           "defect rather than a mechanism failure: the bare headwords `vlk` (wolf) and "
           "`plch` (dormouse) are spelled out letter-by-letter in isolation regardless of "
           "context, and neither word is in this pack. No curated sheet, so the syllable "
           "column is blank, and this grade is a spot-check rather than a corpus-wide "
           "measurement, the same honest bar Dutch's and Romanian's entries set"),
    "pa": ("B", "espeak has a Punjabi voice and it does the one thing this language is "
           "here to prove, in one direction of two. **Punjabi tone is the residue of the "
           "lost voiced aspirates and the script still writes the old letters**, so the "
           "`ipa` column is the only column in a Punjabi row that can carry it -- `text` "
           "writes ਘ and `romanization_iso15919` transliterates that as `gha`, and the "
           "word is [ko˩ɽa]. **Word-initially the voice gets it right and was probed on "
           "all five letters before it was trusted**: ਘੋੜਾ, ਘਰ, ਝੂਠ, ਢੰਗ, ਧੰਨਵਾਦ, ਭਾਰਤ all "
           "come back voiceless, unaspirated and tone-marked, and all 20 such words in "
           "the pack got the mark -- no lexicon miss of Tamil's kind. The tone itself "
           "arrives as an ASCII `+`, which is not IPA and is folded to `˩` in REPAIR. "
           "**Non-initially the voice does not do it at all**, which is the single largest "
           "thing repaired here: ਦੁੱਧ comes back `dˈʊdʰ` and ਲਾਭ `lˈabʰ`, keeping a voiced "
           "aspirate modern Punjabi does not have, on 27 words -- so `pa_tone` writes the "
           "high tone on the preceding vowel instead, which is what the language does. "
           "The voice is internally inconsistent about the same sound, applying the merger "
           "in one position and not the other, which is what makes this an omission rather "
           "than a transcription choice. Three further defects, all repaired and all "
           "measured over the 886 distinct words of the finished pack rather than over "
           "probes. **The subjoined ਹ is written as an [h]** -- ਪੜ੍ਹ `pˈʌr.h`, ਕੱਲ੍ਹ "
           "`kˈʌllh`, 18 words -- where it is silent and marks tone; the output alone "
           "cannot tell it from the real [ɦ] of ਨਹੀਂ, so `pa_tone` takes the source text, "
           "which is `te_anusvara`'s and `el_stress`'s contract. **The tippi/bindi is "
           "written as vowel nasalisation before a stop on 67 words and as a homorganic "
           "nasal consonant on others of identical structure** (ਪੰਜ `pˈʌnɟ` against ਅੰਦਰ "
           "`ˈʌ̃dəɾ`), so `pa_nasal` regularises it in the direction the voice itself uses "
           "elsewhere. **And the addak is written as a length mark on some words and a "
           "doubled consonant on others** (ਅੱਖਰਾਂ `ˈʌkʰːəɾˌã` against ਇਕੱਠੇ `ɪkˈʌʈʰʈʰe`), "
           "which matters because Punjabi gemination is phonemic -- ਪਤਾ against ਪੱਤਾ -- and "
           "`ː` has a map-to-nothing rule in most reader tables. What is left un-repaired "
           "and is the reason this is a B rather than higher: **stress is not written at "
           "all** (see STRESS[\"pa\"] -- espeak's is the first syllable on 72% of the 671 "
           "polysyllables and follows no rule Punjabi grammars state, and this column "
           "already carries prominence as tone); **the aspiration of a doubled aspirate is "
           "left on both halves** on the one word that has it, ਇਕੱਠੇ; **[ɦ] between vowels "
           "is left as a full [h]** on words like ਨਹੀਂ and ਵਿਹੜਾ, where much of Punjab says "
           "[nə́ĩ] with a tone and no consonant, because that reduction is variable and the "
           "careful reading is the one a stranger will be understood saying; and there is "
           "**no curated sheet for Punjabi**, so this grade is a spot-check and a "
           "mechanical audit rather than a corpus-wide measurement against a reviewer, "
           "which is the same honest bar Czech's, Dutch's and Romanian's entries set"),
    "gu": ("B+", "espeak-ng's Gujarati voice is in this build's *system* 1.50 tree, so this "
           "column is library-independent and settles with either pass of the two-pass "
           "`--check` the `uk` comment in VOICES describes. It is the second-best Indic "
           "reading in this file after Tamil's, and for the same kind of structural reason "
           "rather than a lucky dictionary: **Gujarati orthography is shallow in almost "
           "everything the corpus needs**. Voicing and all four stop series are written, "
           "every vowel except the inherent one is written, and the two things the letters "
           "*do* leave to the reader are exactly the two the voice gets right. **The "
           "word-final inherent vowel is deleted**, categorically and correctly -- ઘર "
           "`ɡʰʌɾ`, હાથ `haːtʰ`, પુરુષ `puɾuʂ`, ઔષધ `ɔʂʌdʰ`, પાસપોર્ટ `paːspoːɾʈ` -- which "
           "is the one thing Hindi's own voice is graded C for getting wrong. And **the "
           "anusvara's split is implemented**: a homorganic nasal consonant before a stop "
           "(પંજો `pʌɲɟoː`, રંગ `ɾʌŋɡ`, ઠંડી `ʈʰʌɳɖi`, પલંગ `pəlʌŋɡ`) and vowel "
           "nasalisation elsewhere (હું `hũ`, છું `cʰũ`, નહીં `nʌhĩ`), which is what "
           "`te_anusvara` had to be written by hand to supply for Telugu and what "
           "`pa_nasal` had to regularise for Punjabi. **ઝ comes back `z`, and that is "
           "right rather than a merger to repair**: Gujarati's historical /dʒʰ/ has gone to "
           "[z] in the modern standard -- ઝાડા [zaːɖaː], ઝડપી [zəɖpi] -- and the same "
           "letter is what writes loan /z/ (સાઇઝ, ઝ્લોટી), so the pack contains no `ɟʰ` at "
           "all and the four-way series has a real hole at the palatal. Eight things are "
           "repaired in REPAIR[\"gu\"] and every one was counted over the finished column "
           "first; the largest is `ʌ̃` -> `ã` on 120 cells, which is the locative "
           "postposition `-માં` and which no reader table has a rule for. "
           "What is left un-repaired, and is the reason this is B+ rather than higher. "
           "**Stress is not written at all** (see STRESS[\"gu\"]: espeak marks the penult "
           "even when the penult is a schwa, agreeing with Gujarati's own rule on 67% of "
           "1,650 polysyllables, and the rule's condition is a vowel-quality distinction "
           "this column does not reliably carry). **A word-final schwa survives after a "
           "consonant cluster** on 61 cells -- ચિહ્ન `cɪhnə`, કેન્દ્ર `keːndɾə`, મિત્ર "
           "`mɪtɾə`, શૂન્ય `ʃuːnjə`, થાય `tʰaːjə` -- which is careful-speech Gujarati in "
           "the Sanskrit-derived words and an inserted vowel in the ય-final ones, and which "
           "`hi`'s own committed column has identically (`ʃˈuːnjə`, `kˈẽːdɾə`), so it is "
           "left rather than patched in one language only. **The one Gujarati inherent "
           "vowel is written two ways**, `ʌ` on 905 cells and `ə` on 440, tracking espeak's "
           "own stress placement rather than anything in the language; folding them would "
           "make this column disagree with `hi`, `mr`, `pa` and `ur`, all four of which "
           "carry the same split, so it is recorded as a cost instead. **ચ and જ are kept "
           "as `c` and `ɟ`** rather than folded to the affricates `tʃ`/`dʒ` they really "
           "are, which is Punjabi's decision and not Telugu's, for Punjabi's reason: `hi`, "
           "`bn`, `mr`, `pa` and `ur` all write `c`/`ɟ` for the cognate letters and "
           "Gujarati shares most of its vocabulary with them. And there is **no curated "
           "sheet for Gujarati**, so this grade is a spot-check and a mechanical audit "
           "rather than a measurement against a reviewer -- the same honest bar Czech's, "
           "Dutch's, Romanian's and Punjabi's entries set"),
    "tr": ("B", "phonemic orthography, but espeak's Turkish stress is 68.1%"),
    "pt": ("B", "pt-br; vowel reduction is phonetic detail the curated sheet smooths away"),
    "en": ("B", "en-us; deep orthography, but espeak's English lexicon is its best"),
    "ru": ("C", "espeak emits reduction and palatalisation as detail; 27.6% oracle ceiling"),
    "hi": ("C", "schwa deletion is espeak's to get wrong; stress 63.2%"),
    "ta": ("B+", "espeak has a Tamil voice and it is the best Indic one in this file, for a "
           "structural reason rather than a lucky dictionary. **Tamil orthography is shallow "
           "in everything except voicing** -- every vowel is written, there is no schwa "
           "deletion for a G2P to get wrong, and the pulli marks a bare consonant "
           "explicitly -- and the one thing it does *not* write, whether a stop is voiced, "
           "is a positional rule that espeak implements. Probed on all four environments "
           "before it was trusted, and right in each: word-initial voiceless (கடை kaḍai, "
           "பால் paal, சரி sari), intervocalic voiced (அகம் agam, எது edu, உதவி udavi), "
           "geminate voiceless (அப்பா appaa, ஓட்டு ooṭṭu, மருக்கு marukku), post-nasal "
           "voiced (தம்பி tambi, ஐந்து aindu, அங்கே angee, ஒன்பது onbadu). It also gets the "
           "ukaram reduction right -- short உ is [u] word-initially and [ɯ] elsewhere -- and "
           "keeps ர /ɾ/ apart from ற /r/ and ழ /ɻ/ apart from ள /ɭ/, which are the two "
           "distinctions a romanisation route off `romanization_iso15919` would have "
           "preserved and the voicing is the one it could not. Four weaknesses, in order. "
           "**Eight lexical defects, found mechanically and repaired**: `tmp/ta/audit.py` "
           "walks text against ipa word by word, and over 2,026 word pairs found 17 "
           "word-initial stops wrongly voiced and 4 dropped initial vowels -- of which four "
           "are English loans espeak is right about (பஸ், பில், பேங்க், போர்டிங்) and eight "
           "are repaired in REPAIR above; இரத்தம் *blood* came back with no initial vowel at "
           "all, on four safety-critical rows. **The dental/alveolar contrast is lost**: "
           "espeak writes both ந and ன as `n` and த as a plain `t` rather than `t̪`, so the "
           "column does not distinguish Tamil's dental nasal from its alveolar one. It is a "
           "real contrast and a marginal one -- the two letters are in complementary "
           "distribution in almost every word -- and adding `t̪`/`n̪` would have cost every "
           "one of the twenty-six reader tables a rule for a distinction no reader would "
           "spell differently. **Stress is not written at all** and that is a decision, not "
           "a gap: see STRESS above. **And espeak's `ʌ` for short அ is kept rather than "
           "folded to `a`**, which is a trade with a named cost -- see REPAIR"),
    "nl": ("A-", "system espeak-ng-data 1.50, no loader needed (see the `VOICES` comment). "
           "821 of 831 rows filled -- 6 note rows and 4 bare-symbol/number rows (e.g. the "
           "euro sign) need none. Dutch orthography is close to phonemic and the derivation "
           "reads correctly on every spot-check run for this pack: ɣ/x for g/ch (`regen` "
           "rˈeːɣən, `acht` ˈɑxt), ʋ for w (`water` wˈaːtər -> ʋˈaːtər), the œy/ɛi diphthongs "
           "(`huis`, `mijn`/`kwijt`), and øː for eu. Not cross-checked against a curated "
           "Dutch sheet the way `es`/`it`/`hu` are, because none exists in this corpus, so "
           "there is no syllable-agreement percentage to report -- this grade is a "
           "targeted spot-check on the phonemes the pack's own reader table (below) had to "
           "get right, not a corpus-wide measurement. One inconsistency worth naming rather "
           "than hiding: the acronym `eSIM` is read as a spelled-out acronym "
           "(ˌɛsˌiːˈɛm) inside the sentence 'Heeft u een eSIM?' but as a word "
           "(ˈeː sˈɪm) in the bare `sim-data.esim` row -- the same string, two G2P paths, "
           "depending on sentence context. Left as espeak produced it rather than "
           "hand-patched, since both readings are things a Dutch speaker might actually "
           "say and neither is wrong, only inconsistent"),
    "ms": ("A-", "system espeak-ng-data 1.50, no loader needed (see the `VOICES` comment). "
           "829 of 836 rows filled -- 6 note rows and 1 bare-symbol row (the yen sign) need "
           "none. Malay orthography is near-phonemic and the derivation reads correctly on "
           "every spot-check for this pack, including a real allophonic rule this voice "
           "models rather than glosses over: word-final short vowels reduce in the standard "
           "broadcast pronunciation this voice implements -- `saya` sˈajə (not sˈaja), `dia` "
           "dˈiə, `bilik`-type closed final syllables lower /i u/ toward [e o] (`ringgit` "
           "rˈiŋɡet, `panggil` pˈaŋɡel) -- which is a genuine feature of standard spoken "
           "Malay (the 'Johor-Riau'/kelainan-pepet pronunciation Wikipedia's own Malay- "
           "phonology article names) and not an error, though it reads as a surprise next "
           "to Indonesian's more open `saya` sˈaja for the identical spelling. One pattern "
           "flagged rather than silently accepted: coda `r` before a following consonant "
           "comes back as the two-character sequence `ɾr` (`perlu` pˈəɾrlu, `berdarah` "
           "bərdarˈahan) rather than a single rhotic -- both `ɾ` and `r` already carry a "
           "rule in every reader table this corpus has, so it costs no reader a new symbol "
           "and `--gaps` cannot see it either way, but it reads as an espeak dictionary "
           "quirk rather than a real gemination and is worth a fluent speaker's second look "
           "before it is trusted as phonetic fact."),
    "mr": ("B", "espeak has an `mr` voice only via `espeakng_loader`'s newer bundled data -- "
           "this build's system espeak-ng-data 1.50 predates it, the same situation Ukrainian "
           "was in. Probed directly rather than trusted, on words chosen to force the question "
           "the respell table's own second deviation turns on: schwa retention. Mixed within a "
           "single word -- कमळ *lotus* comes back kˈʌməɭ, keeping the medial अ and dropping the "
           "final one -- which is a fact about Marathi's own less-categorical deletion (real, "
           "but nothing like Hindi's well-documented syncope) rather than a G2P defect, and it "
           "is exactly why the respell table keeps the final halant Hindi's drops rather than "
           "assuming the same rule transfers. Aspiration (भ ध घ ढ छ ठ झ, all eight probed), "
           "retroflexion (ट ड ण ळ against त द न ल) and the dental/alveolar nasal contrast all "
           "came back correct on every word tried, including the retroflex lateral ळ itself "
           "(बाळ, आळशी). Not probed against a reference corpus of comparable size to Hindi's "
           "or Tamil's audits, so this grade is a spot-check rather than a measurement -- the "
           "honest bar available for a table with no curated Marathi sheet to score against"),
    "te": ("A-", "espeak has a Telugu voice -- `te_dict` is in this build's 1.50 data tree -- and "
           "it is the best Indic derivation in this file, for a structural reason: **Telugu "
           "orthography is shallow in the two places every other Indic script in this corpus is "
           "not.** There is no schwa deletion, so a consonant letter says [a] unless a vowel "
           "sign or the virama says otherwise and no rule has to guess (Hindi's and Bengali's "
           "biggest G2P risk simply does not exist here); and it writes the whole four-way stop "
           "series, so voicing and aspiration are on the page where Tamil leaves both to a "
           "positional rule. Probed on the series before it was trusted and right in every one: "
           "ఖాళీ `kʰˈaːɭiː`, ఘంటం `ɡʰˈaɳʈam`, గంట `ɡˈaɳʈa`, కాలం `kˈaːlam`, ధన్యవాదాలు "
           "`dʰˈanjaʋˌaːdaːlu`, భోజనం `bʰˈoːdʒanam`. It writes both vowel lengths for all five "
           "pairs including short ఎ/ఒ, which Devanagari cannot. Three weaknesses, in order, and "
           "the first two are repaired. **The anusvara has no place of articulation and espeak "
           "gives it `n` everywhere**, which is right before a dental and wrong before everything "
           "else -- ంక is [ŋk], ంబ is [mb], ండ is [ɳɖ] -- and wrong word-finally, where Telugu "
           "says [m] and 112 of the pack's 1,098 distinct words end in it. Both halves are "
           "repaired: the medial cases by the eight folds in REPAIR above (263 corrections, and "
           "every `nC` they touch was verified to come from a ం rather than a న్), and the "
           "word-final case by `te_anusvara`, which needs the source spelling because the output "
           "cannot tell ప్రవేశం from ఫోన్. **It gives చ and జ as palatal stops**, which Telugu "
           "does not have; folded to the affricates, which discards the dental-affricate "
           "realisation some Telangana and coastal speech has before back vowels. **And stress "
           "is not written at all**, which is a decision rather than a gap -- see STRESS above: "
           "espeak marks the first syllable unconditionally and Telugu's own rule moves it to a "
           "long second syllable, which is most of the Sanskrit-derived nouns this pack is full "
           "of. What no reviewer should assume is checked: the dental/retroflex *nasal* contrast "
           "is now carried by a repair rather than by the dictionary, so a row where the "
           "assimilation reads wrong is a repair to question and not a lexicon entry"),
    "bn": ("C", "espeak-ng has a Bengali voice and it is a real one -- the consonant "
           "inventory comes back whole, retroflex against dental, all four aspirates, ঙ ঞ as "
           "/ŋ ɲ/, and the inherent vowel's /ɔ/ against /o/ right most of the time. Two "
           "artefacts are repaired in REPAIR and one normalisation trap in `bn_compose`, and "
           "after them what is left is three weaknesses, in order. **Inherent-vowel deletion "
           "is espeak's to get wrong and it gets it wrong in one direction**: it inserts the "
           "vowel where Bengali deletes it, so হাসপাতাল comes back `haʃɔpatal` for [haspatal] "
           "and সাত `ʃato` for [ʃat]. This is Hindi's schwa problem with a wider scope, "
           "because Bengali deletes in more places than Hindi does. **The ya-phala is read as "
           "a vowel rather than as gemination**: ধন্যবাদ comes back `dʰɔnæbad` where the word "
           "is [dʰonːobad], so ্য after a consonant loses the doubling on the rows where it "
           "should have it -- though `স্য`, `ক্য` and `ত্য` do come back geminated, so it is "
           "inconsistent rather than uniformly wrong. **And a bare letter is read as its "
           "letter name**: য on its own returns `ɔntostedʒɔ`, the dictionary's অন্তঃস্থ য, which "
           "is the failure mode that produces something plausible. No row in this pack is a "
           "bare consonant letter, so nothing hits it, but a `core` row that added one would. "
           "Stress is kept, because Bengali stress is initial and non-lexical and espeak puts "
           "it there; that is a fact about the language rather than a claim about the voice"),
    "fr": ("C", "liaison survives and stress is phrasal, but the curated sheet's unit is coarser"),
    "vi": ("C", "tones reconstructed from espeak's digits, ngang included; anh/ach is a judgement"),
    "ar": ("D", "short vowels are unwritten and espeak guesses; emphatics inconsistent"),
    "th": ("D", "a neural G2P, and no Thai tone is verifiable against anything in this corpus"),
    "uk": ("B+", "near-phonemic orthography and, unlike Russian, genuinely no vowel-"
           "reduction system to get wrong -- probed on 60-odd words chosen for it "
           "(молоко, телефон, весело, педагог, перевод, легенда...) and unstressed "
           "о and е come back as written in all but one, температура, whose second "
           "е comes back ɪ rather than ɛ; a single lexical item rather than a "
           "pattern, since neither `пере-` elsewhere in the sample nor any other "
           "unstressed е does the same. Stress is lexical and free, as in Russian, "
           "so it is looked up rather than derived, and there is no curated sheet to "
           "score it against -- unlike `es`/`it`, this is the first pack in the file "
           "with no such reference, so the syllable column is blank and the number "
           "the other B/B+ grades cite is one this entry cannot give. Three "
           "repairs were needed, all in REPAIR above: в comes back as β, which is "
           "folded to /ʋ/, a symbol already in all 26 reader tables from Urdu's و "
           "rather than the /b/ Greek's own β would suggest; шв- comes back /ɬβ/ "
           "rather than /ʃβ/ -- ш is correct everywhere it is not followed by в "
           "(кошик -> koʃˈɪk) and /ɬ/ is not a Ukrainian sound at all, so this is "
           "one dictionary defect on one cluster (3 rows: швидку, швидкісний x2), "
           "folded to ʃ before the в repair runs so the resulting β also gets the "
           "ʋ fold. Apostrophe is handled correctly as a hard boundary rather than "
           "a soft one -- п'ять comes back pjˈat with a true glide, not a "
           "palatalised п -- which is the thing to check first in any Cyrillic "
           "voice, since it is where a dictionary-less rule engine most often "
           "guesses wrong. Palatalisation of consonants other than л is written as "
           "a following /j/ (дякую -> djˈakuju) rather than a diacritic, which "
           "matches how this build already treats it elsewhere and costs nothing "
           "new. Weaknesses: loanwords with an ае hiatus diphthongise "
           "(аеропорт -> aɪrˈoport̪, one row in this pack), г/х show an occasional "
           "assimilation this build did not verify against a second source "
           "(хворий -> ɣβˈorɪj, а voiced г for a written х), and none of the "
           "seven-case declension is or could be represented -- the ipa column "
           "reads citation-form pronunciation only, which is what every other "
           "language in this file does too"),
    "ro": ("A-", "system espeak-ng-data 1.50 has a Romanian voice directly, no loader "
           "needed (see the `VOICES` comment) -- and Romanian orthography is nearly as "
           "shallow as Italian's, which the derivation confirms rather than assumes: "
           "probed on ce/ci/che/chi/ge/gi/ghe/ghi (excelent, chelner, geantă, gheață -- "
           "all correct), the ș/ț letters (șase, ștampilă, mulțumesc, județ -- ʃ and ts "
           "throughout, never the Turkish cedilla forms), and x's two positional "
           "readings, /ks/ before a stressed syllable's onset and /ɡz/ when the "
           "following syllable is stressed (excelent eksˈ-, exemplu eɡzˈ- -- a real "
           "allophonic rule, not noise, and this voice gets the conditioning right on "
           "both probed words). **One real, repeatable defect, repaired in REPAIR "
           "above**: â/ă before an i-glide reads as a front rounded vowel instead of "
           "the language's own /ɨ/ -- mâine and pâine came back `mˈyɪne`/`pˈyɪne` "
           "before the fix, against the correct `ˈmɨjne`/`ˈpɨjne`, while â everywhere "
           "else (vârf, mâna, câmp, românește) was already right; câini confirmed it "
           "is a rule keyed on the following -i rather than a single lexical accident. "
           "**A second, unrelated defect, also repaired in REPAIR**: a stray secondary-"
           "stress mark lands directly after a word-final consonant's palatalisation "
           "in words whose primary stress sits two or more syllables from the end -- "
           "astazi (today) was `ˈastəzʲˌʲ`, faceti (do, 2pl) `fˈatʃetsʲˌʲ` -- found by "
           "`node scripts/respell_check.mjs ro --gaps`, which showed the mark reaching "
           "all thirty other reader tables as a new mid-word symbol none of them has a "
           "rule for. Folded to plain `ʲ`, since a secondary stress belongs on a "
           "syllable and not wedged inside one consonant's own diacritic. "
           "**A third defect, found after the first two were fixed**: this voice "
           "doubles the palatalisation mark itself, unconditionally, on a word-final "
           "consonant before Romanian's non-syllabic final -i -- bani (money) is "
           "`bˈanʲʲ`, marti (Tuesday) `mˈartsʲʲ`, luni (Monday) `lˈunʲʲ` -- about 100 "
           "rows in this pack, clustering exactly at that one position (word-final "
           "non-syllabic -i) rather than scattered across the lexicon. `ʲʲ` is "
           "redundant by definition and folded to a single `ʲ`, the same argument "
           "Polish's own REPAIR entry makes for a doubly-marked palatal nasal. Not "
           "visible to `--gaps` at all, because a doubled modifier decomposes into "
           "base + `ʲ` + `ʲ` and both halves already have a rule in most tables; it "
           "surfaced in Dutch's own `--units` output as a decomposed `ʃʲʲ` reading "
           "Romanian. Checked for a tripled `ʲʲʲ` form once both folds were in place "
           "and found none. "
           "**Stress is lexical and free, as in Russian/Ukrainian**, so it is looked "
           "up from espeak's dictionary rather than derived by any rule this file "
           "writes -- there is no mechanical position to compute it from, the same "
           "conclusion `STRESS` reaches for Persian, for the opposite reason. No "
           "curated Romanian sheet exists to score syllable-agreement against, so "
           "this grade is a spot-check like Dutch's and Marathi's rather than a "
           "corpus-wide measurement. Romanian has no phonemic aspiration to get "
           "wrong or right: it never appears as a *source* concern here, only as a "
           "*target* one in the reader table below"),
    "fil": ("A-", "no espeak voice exists for `tl`/`fil` in this build's system "
            "espeak-ng-data (1.50) or in `espeakng_loader`'s bundled library -- checked "
            "directly rather than assumed, since `mr`/`uk` needed the loader and `ro` "
            "turned out not to: neither library's `lang/poz/` directory (Indonesian's "
            "and Malay's own family folder) has a Tagalog/Filipino file at all. So this "
            "is a hand-written letter table (`FIL`) like `tlh`/`qya`/`he`, over an "
            "orthography that is close to phonemic throughout the post-1987 alfabetong "
            "Filipino, rather than a probabilistic model with an error rate to measure. "
            "**What the table cannot capture, both silently and by design**: the "
            "word-final glottal stop (baba 'chin' against babà 'to go down') and lexical "
            "stress (buhay [ˈbuhaj] 'life' against buhay [buˈhaj] 'alive') are both real "
            "and contrastive in spoken Filipino, and neither is written in the everyday "
            "orthography this pack's `text` column uses -- so this column is exactly as "
            "silent about both as the printed word already is, not a separate loss on "
            "top of it. That is the one point of daylight from `tlh`'s A: Klingon's "
            "orthography does not lose a phonemic contrast by omitting stress (TKD "
            "1.3's stress is predictable from morphology and non-contrastive), where "
            "Filipino's omission is a genuine, if honestly documented, gap. Two "
            "irregular high-frequency function-word spellings are hand-coded rather "
            "than left to the table -- `ng` [naŋ] the linker, `mga` [maˈŋa] the plural "
            "marker, both frozen spellings named in Schachter & Otanes 1972 -- which is "
            "this pack's version of the aspiration trap the project has been bitten by "
            "before: a table entry alone would have read `mga` as `mɡa`, not `maŋa`, "
            "and both words are among the most frequent in the language, so the defect "
            "would have reached nearly every row rather than a handful. No curated "
            "Filipino sheet exists to score syllable-agreement against, so this grade "
            "is a table read carefully rather than a corpus-wide measurement, in the "
            "same position Dutch's, Marathi's and Romanian's own spot-checks are."),
    "sv": ("A-", "near-phonemic orthography read by a mature espeak voice (this build's "
           "system espeak-ng-data 1.50 already ships `sv`; no loader override needed). "
           "Word stress is looked up rather than derived, as for Polish and Czech, "
           "because Swedish stress is lexical rather than positional -- loanwords keep "
           "final stress (`restaurang`, `banan`) beside native initial stress, and "
           "espeak's dictionary carries the distinction rather than a rule. Vowel "
           "length is written correctly and is what `policy.length` in the reader "
           "table below is for. The sj/tj fricatives (`sjuk`, `kyrka`) come back as "
           "`sx` and `ɕ`, both decomposing into symbols already in the corpus, so "
           "Swedish costs the other reader tables no new rule. "
           "**What keeps this from A rather than what earns the minus**: lexical pitch "
           "accent (accent 1/accent 2 -- `anden` the duck against `anden` the spirit) "
           "is real and contrastive and the voice does not write it at all, confirmed "
           "on the standard minimal pair rather than assumed -- both readings "
           "phonemize identically. SAOL's own pronunciation key has a native notation "
           "for it (a superscript 3/4 after the long segment), so the gap is the G2P's "
           "and not a case of the orthography having nothing to say; there is no route "
           "to it from `text` that this build can drive, and inventing marks the voice "
           "cannot produce would print false certainty on every unmarked row rather "
           "than an honest absence. And a handful of `r`-plus-coronal codas before /t/ "
           "are inconsistent (`bort` keeps `rt`, `svart`/`kort` drop the r with no "
           "retroflex mark) with no single deterministic substitution across them, "
           "unlike German's `??`, so it is left ungraded rather than patched. No "
           "curated Swedish sheet exists to score syllable-agreement against, so this "
           "grade is a probe-based spot-check like Dutch's, Marathi's, Romanian's, "
           "Czech's and Filipino's, not a corpus-wide measurement."),
    "kn": ("A-", "espeak-ng's Kannada voice is in this build's *system* 1.50 tree "
           "(`kn_dict`, `espeak-ng-data/lang/dra/kn` beside `ta`, `te` and `ml`), so "
           "no `espeakng_loader` is involved and this column is library-independent. "
           "**This is the highest grade any Indic language in the corpus has, and it "
           "is earned on four separate things the neighbouring voices get wrong.** "
           "Kannada's orthography is shallow -- every vowel it pronounces is written, "
           "including the short/long e and o pairs Devanagari lacks, and a final "
           "consonant carries its own virama, so there is no schwa-deletion "
           "convention to model and no inherent-vowel guessing of the kind that keeps "
           "`hi` and `bn` at C. On top of that: **the anusvara's place of "
           "articulation is right in every environment the pack contains** (ಂಬ `mb`, "
           "ಂಪ `mp`, ಂಸ `ms`, ಂತ `nt`, ಂಟ `ɳʈ`, ಂಡ `ɳɖ`, ಂಕ `ŋk`, ಂಗ `ŋɡ`, ಂಜ `ɲɟ`, "
           "and word-finally `m`), which `te_anusvara` had to be hand-written for "
           "Telugu; **the four-way stop series survives intact**, with the count of "
           "`ʰ` reconciling exactly against the eight aspirated units, so the Hindi "
           "`dʰ` bug is structurally impossible here; and **gemination comes back as "
           "a doubled consonant** with not one consonant+`ː` sequence anywhere, so "
           "the `GEMINATE_DOUBLES` machinery Punjabi and Gujarati need is not needed. "
           "Only three folds were required (`ɐ`->`a`, `ɹ`->`r`, `ɕ`->`ʃ`), all three "
           "of them corpus-consistency rather than error repair, and **zero new IPA "
           "symbols reach the other 38 reader tables**. "
           "**What keeps it from A.** First, stress: the voice marks the first "
           "syllable on all 1,772 polysyllables unconditionally, which is roughly "
           "Kannada's own rule but never its exception (light initial syllable before "
           "a long vowel, 9% of the pack's distinct polysyllables), so `STRESS` drops "
           "the mark rather than printing a wrong one. Second, the short/long "
           "quality split described above is a real inconsistency in the raw output "
           "that had to be folded away rather than something the voice got right. "
           "Third, Kannada's ಚ and ಜ are affricates and this column writes them `c` "
           "and `ɟ`, palatal stops, for the rule-coverage reason `REPAIR['kn']` "
           "records -- a deliberate cost, not an oversight. No curated Kannada sheet "
           "exists to score syllable-agreement against, so this grade is a probe-based "
           "audit of every symbol and every anusvara environment in the pack rather "
           "than a corpus-wide measurement, like Gujarati's and Punjabi's."),
    "ne": ("B", "espeak has a `ne` voice in this build's own system espeak-ng-data "
           "(1.50) -- unlike `mr`/`uk`, no `espeakng_loader` needed. Probed directly "
           "rather than trusted: schwa retention is correct on the words checked "
           "(नमस्ते -> nəmʌsteː, keeping both syllables' vowels where Hindi's own "
           "voice would delete a medial one), aspiration is correct on bʰ/dʰ (भात, "
           "धन्यवाद), and the same spurious `Cːj` geminate `hi`'s and `mr`'s voices "
           "share on क्या is present here too and repaired the same way "
           "(`REPAIR['ne']`). Not probed against a corpus of comparable size to "
           "Hindi's or Tamil's, and no curated `ne__en__en-US.csv` respelling exists "
           "to score syllable-agreement against either, so this grade is a "
           "spot-check rather than a measurement -- the same honest bar Marathi's "
           "own entry sets."),
}


def build(code):
    """Every row of one language: its new `ipa`, or why there is none."""
    concepts = {}
    for path in sorted((DATA / "concepts").glob("*.csv")):
        with path.open(encoding="utf-8-sig") as fh:
            for row in csv.DictReader(fh):
                concepts[row["concept_id"]] = row

    files = sorted((DATA / "lang" / code).glob("*.csv"))
    source = ROMANISED.get(code)
    loans = LOANWORDS.get(code, {})
    plan = []                                     # (path, index, row, pieces)
    skipped = Counter()
    for path in files:
        header, rows = load_rows(path)
        columns = header[1]
        for index, (_, fields) in enumerate(rows):
            row = dict(zip(columns, fields))
            cid = row["concept_id"]
            if concepts.get(cid, {}).get("default_template") == "note":
                skipped["note"] += 1
                continue
            if ipa_method(row.get("provenance", "")) == "reviewed":
                skipped["reviewed"] += 1
                continue
            if not row["text"].strip():
                skipped["no text"] += 1
                continue
            text = row[source] if source else row["text"]
            if source and not text.strip():
                skipped[f"no {source}"] += 1
                continue
            # Against `text` *and* against the string the route will actually read:
            # a romanisation column is Latin throughout, and for these rows it is
            # also where the answer already is. The slot's own name comes out of the
            # question first, being Latin and no part of the sentence -- otherwise
            # `{target}の文を見せてください` is refused for the word "target".
            if code in NON_LATIN and latin_survives(row["text"], text, loans):
                skipped["latin loanword"] += 1
                continue
            if code == "ko":
                text = ko_romanization(row["text"], text)
                if text is None:
                    skipped["rr not aligned"] += 1
                    continue
            parts = pieces(text, loans)
            # A row that is nothing but an acronym -- `eSIM` is its own entry in
            # four languages -- has a loan piece and no text piece, and is not
            # nothing to say.
            if not any(kind in ("text", "loan") for kind, _ in parts):
                skipped["nothing to say"] += 1
                continue
            plan.append((path, index, row, parts))

    transcribe, method = route(code, [v for _, _, _, parts in plan
                                      for kind, v in parts if kind == "text"])
    filled = {}                                   # (path, index) -> (ipa, method)
    bad = Counter()
    flagged = []                                  # rows a reviewer should read first
    for path, index, row, parts in plan:
        # A loan piece is already IPA and already in this column's conventions, so
        # it skips `normalise` for the same reason a marker does: there is no route
        # output to repair and no stress for `apply_stress` to find.
        sounds = [(kind, normalise(transcribe(value) or "", code, value)
                   if kind == "text" else value) for kind, value in parts]
        ipa = unicodedata.normalize("NFC", re.sub(r"\s+", " ", assemble(sounds)).strip())
        # `check_alphabet` is a whitelist of what is IPA; `check_route` is what this
        # route can never legitimately produce. Both refuse the row, because a
        # characterless failure and an unconverted mora are the same fault.
        # A language slot is a placeholder the renderer fills with the IPA of a
        # name, not a transcription, so neither gate reviews its letters -- the same
        # licence `{}` already has, and for the same reason. `{source}` needs it
        # more than `{target}` did: `u` and `c` are both in
        # `ROUTE_FORBIDS["hepburn"]`, so the two Japanese rows that name the reader
        # were being refused for the word "source".
        sound = LANGUAGE_SLOT.sub("", ipa)
        stray = check_alphabet(sound) + check_route(sound, method)
        if not ipa or stray:
            skipped["G2P failed"] += 1
            bad.update(stray or ["(empty)"])
            continue
        # Korean is a syllable-block script, so the result must have exactly as many
        # syllables as the row has blocks. `ko_hyphenate` now resolves the digraphs
        # that used to fail this rather than leaving them to be caught, so what is
        # left is a net: anything else that reads a unit across a boundary.
        # Only where there is a block to count and no digit to confuse it: `1월` is
        # one block and two syllables, and `₩` is none and one. The language slot
        # comes out of the count as well -- it is one word of Latin standing in for a
        # name whose syllables are not this row's, so counting its letters refused
        # every Korean row that names a language. A loan piece comes out for exactly
        # the same reason -- `{}cm예요` has eight blocks and its reading has
        # thirteen syllables, because five of them belong to `cm`.
        blocks = LANGUAGE_SLOT.sub("", assemble([p for p in sounds if p[0] != "loan"]))
        if code == "ko" and hangul_blocks(row["text"]) \
                and not any(c.isdigit() for c in row["text"]) \
                and syllable_count(blocks) != hangul_blocks(row["text"]):
            skipped["syllable count"] += 1
            continue
        if ACRONYM.search(row["text"]):
            flagged.append(row["concept_id"])
        # `+loan` on the row's own provenance, because a hand-written reading is the
        # one thing in this column no route produced: `npm run validate` counts the
        # cells per method, so the precedent is visible rather than buried here.
        loaned = any(kind == "loan" for kind, _ in parts)
        filled[(path, index)] = (ipa, f"{method}+loan" if loaned else method)
    return filled, skipped, bad, method, flagged


def agreement(code, filled_by_cid):
    """How often the generated syllable count matches the curated respelling's.

    The cheapest quality signal available: `data/respell/overrides/` holds a human
    respelling of these same rows, and while it is not IPA, a respelling tells you
    how many syllables the row has. A disagreement is a flag on that row.
    """
    path = DATA / "respell/overrides" / f"{code}__en__en-US.csv"
    if not path.exists():
        return None
    same = loose = total = 0
    with path.open(encoding="utf-8-sig") as fh:
        for row in csv.DictReader(fh):
            ipa = filled_by_cid.get(row["concept_id"])
            if not ipa or "{}" in ipa or "/" in ipa:
                continue                          # a slot has no syllables to count
            total += 1
            want = curated_syllables(row["respell"])
            words = ipa.replace(",", "").split()
            same += sum(syllable_count(w) for w in words) == want
            loose += sum(syllable_count(w, True) for w in words) == want
    return same, loose, total


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true",
                        help="verify the committed column is current, write nothing")
    parser.add_argument("--only", default="",
                        help="comma-separated language codes, for iterating")
    args = parser.parse_args()

    with (DATA / "registry/languages.csv").open(encoding="utf-8-sig") as fh:
        ready = [r["bcp47"] for r in csv.DictReader(fh) if r["status"] == "ready"]
    codes = [c for c in args.only.split(",") if c in ready] if args.only else ready

    stale, repertoire, report = [], Counter(), []
    for code in codes:
        filled, skipped, bad, method, flagged = build(code)
        by_cid = {}
        written = 0
        for path in sorted((DATA / "lang" / code).glob("*.csv")):
            header, rows = load_rows(path)
            columns = header[1]
            # This script owns the whole column, not just the cells it can fill:
            # a row it stops being able to transcribe -- because a gate got
            # stricter or a route changed -- has to lose the value the last run
            # left behind, or `--check` would keep passing on stale output from a
            # route that no longer exists. The one exception is a cell a person has
            # claimed with `ipa=reviewed`, which is never touched.
            for index, (line, fields) in enumerate(rows):
                row = dict(zip(columns, fields))
                if ipa_method(row["provenance"]) == "reviewed":
                    continue
                ipa, how = filled.get((path, index), ("", None))
                if ipa:
                    by_cid[row["concept_id"]] = ipa
                    repertoire.update(ipa)
                    written += 1
                elif not row["ipa"] and not ipa_method(row["provenance"]):
                    continue                      # already empty and undeclared
                fields[columns.index("ipa")] = ipa
                fields[columns.index("provenance")] = provenance_with(
                    row["provenance"], how)
                rows[index] = (None, fields)
            text = write_rows(header, rows)
            on_disk = path.read_bytes().decode("utf-8")
            if text == on_disk:
                continue
            if args.check:
                stale.append(str(path.relative_to(ROOT)))
            else:
                path.write_bytes(text.encode("utf-8"))
        agreed = agreement(code, by_cid)
        report.append((code, written, skipped, bad, agreed, method, len(flagged)))

    # The language names, as their own pass over the same routes. Only the locales
    # this run rebuilt, so that `--only vi` does not blank the other sixteen and
    # does not pay for their backends; a full run therefore owns the whole column.
    header, name_rows = load_names()
    names_ipa = language_name_ipa(codes, ready, name_rows)
    text = write_names(header, name_rows, names_ipa, codes)
    if text != NAMES.read_text(encoding="utf-8"):
        if args.check:
            stale.append(str(NAMES.relative_to(ROOT)))
        else:
            NAMES.write_text(text, encoding="utf-8")
    repertoire.update("".join(names_ipa.values()))

    undrawable = font_gap(repertoire)
    # `syl` is the headline quality number and the cheapest one available: how often
    # the generated IPA has the same syllable count as the hand-written respelling of
    # the same row in `data/respell/overrides/`. `+split` is the same count with a
    # rising /j/ broken out, which is a reader's rule rather than the target's and
    # which four of the curated sheets apply. `caps` is how many rows contain an
    # acronym the G2P may have spelled out letter by letter.
    print(f"{'lang':8} {'filled':>6} {'skip':>5}  {'syl':>5} {'+split':>7}  "
          f"{'caps':>5}  grade  route     skipped because")
    for code, written, skipped, bad, agreed, method, flags in report:
        if agreed and agreed[2]:
            rate = (f"{100 * agreed[0] / agreed[2]:5.1f}%"
                    f"{100 * agreed[1] / agreed[2]:7.1f}%")
        else:
            rate = "    --      --"
        grade = GRADE.get(code, ("?", ""))[0]
        print(f"{code:8} {written:6} {sum(skipped.values()):5}  {rate}  {flags:5}  "
              f"{grade:5}  {method:8} "
              f"{', '.join(f'{n} {k}' for k, n in skipped.most_common() if n)}")
        if bad:
            print(f"{'':8} refused on: "
                  + ", ".join(f"{k!r}x{n}" for k, n in bad.most_common(8)))
    total = sum(r[1] for r in report)
    print("\ngrades -- what a reviewer should expect, worst first:")
    for code, *_ in sorted(report, key=lambda r: GRADE.get(r[0], ("?",))[0], reverse=True):
        grade, note = GRADE.get(code, ("?", ""))
        print(f"  {code:8} {grade:3} {note}")
    if undrawable:
        print("\nnot drawable by the shipped Latin faces: "
              + ", ".join(f"U+{ord(c):04X} {c}" for c in undrawable)
              + "\n  every source face in tmp/fonts-src has them and subset_fonts.py"
              " unions corpus_chars,\n  so one run of it closes the gap;"
              " until then validate warns on those cells.")
    if args.check:
        if stale:
            raise SystemExit(f"data/lang is stale -- run `npm run ipa` and commit: "
                             f"{', '.join(stale[:4])}"
                             f"{f' and {len(stale) - 4} more' if len(stale) > 4 else ''}")
        print(f"\nipa column current  {total} cells, {len(codes)} languages")
    else:
        print(f"\n{total} ipa cells written across {len(codes)} languages")
    return 0


def font_gap(repertoire):
    """Which of the characters just written some shipped Latin face cannot draw.

    Any face, not every face: `check_drawable` in scripts/validate_data.py checks
    text against the intersection of a stack's variants, because a glyph only the
    regular weight carries is unusable in a column set in the bold.
    """
    from fontTools.ttLib import TTFont
    faces = json.loads((DATA / "fonts/manifest.json").read_text(encoding="utf-8"))["faces"]
    missing = set()
    for face in faces:
        if not face["stack"].startswith("latin"):
            continue
        font = TTFont(DATA / "fonts" / f"{face['file']}.ttf", lazy=True)
        missing |= {c for c in repertoire if ord(c) not in font.getBestCmap()}
        font.close()
    return sorted(missing)


if __name__ == "__main__":
    sys.exit(main())
