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
          "ar": "ar", "vi": "vi", "el": "el", "hu": "hu"}

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
             "tlh": "romanization_okrand", "qya": "romanization_appendix-e"}

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
          "zh-Hans": "none", "th": "none", "tlh": "none"}

# Which packs write `text` in something other than the Latin alphabet, so that a
# Latin run left in one is a loanword rather than the language. `tlh` and `qya` are
# in here because their `text` is pIqaD and tengwar; the gate finds nothing to
# refuse in either -- neither pack quotes a Latin loanword -- and they are named
# anyway so that the next row that does quote one is asked the same question.
NON_LATIN = {"zh-Hans", "ja", "ko", "th", "hi", "ar", "ru", "el", "tlh", "qya", "he"}


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
    "hi": [("r.h", "ɽʰ"), ("r.", "ɽ"), (".", "")],
    # espeak inserts a stray `.` before a long vowel in Arabic: `i.ː` for `iː`.
    "ar": [(".", "")],
    # `u"` is the fronted /u/ between palatalised consonants, and `ɪ^` is what a
    # soft sign on a final consonant comes out as: `dvʲˈerɪ^` for дверь /dvʲerʲ/.
    # And espeak writes ы as `y`, which in IPA is the close front *rounded* vowel:
    # Russian has no such phoneme, so a bare `y` can only be /ɨ/, and leaving it
    # would have `добрый` respelled with the vowel of French `tu`.
    "ru": [("u\"", "ʉ"), ("ɪ^", "ʲ"), ("y", "ɨ")],
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
    """
    return "".join(c for c in chunk
                   if unicodedata.category(c)[0] in "LMN" or c.isspace()
                   or c in "'-").strip()


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
GEMINATE_DOUBLES = {"hu", "it"}


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


def normalise(ipa, code, text=""):
    for old, new in REPAIR.get(code, []):
        ipa = ipa.replace(old, new)
    for old, new in FOLD:
        ipa = ipa.replace(old, new)
    if code == "vi":
        ipa = " ".join(vi_tone(t) for t in ipa.split())
    if code == "el":
        ipa = el_stress(text, ipa)
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
        lexicon = espeak_lexicon(VOICES[code], chunks)
        return lexicon.get, "espeak"
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
    "tr": ("B", "phonemic orthography, but espeak's Turkish stress is 68.1%"),
    "pt": ("B", "pt-br; vowel reduction is phonetic detail the curated sheet smooths away"),
    "en": ("B", "en-us; deep orthography, but espeak's English lexicon is its best"),
    "ru": ("C", "espeak emits reduction and palatalisation as detail; 27.6% oracle ceiling"),
    "hi": ("C", "schwa deletion is espeak's to get wrong; stress 63.2%"),
    "fr": ("C", "liaison survives and stress is phrasal, but the curated sheet's unit is coarser"),
    "vi": ("C", "tones reconstructed from espeak's digits, ngang included; anh/ach is a judgement"),
    "ar": ("D", "short vowels are unwritten and espeak guesses; emphatics inconsistent"),
    "th": ("D", "a neural G2P, and no Thai tone is verifiable against anything in this corpus"),
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
