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
raise "not supported". And `vi` keeps its voice but loses 68 rows: this build emits
two pieces of its own internal notation, a `1` after a schwa and a `-` after a
short /e/, that `phonemizer` does not translate into IPA at all.

Reproducing: `pip3 install --user phonemizer dragonmapper pythainlp`. `thaig2p`
downloads a 12MB model to `~/.pythainlp-data` on first use.

## What gets phonemised, and what does not

`note` rows are skipped: a note is prose the reader reads, not something anyone
says. Rows whose text carries `{target}` or `{source}` are skipped whole
(`content/LANGUAGE-SLOTS.md`): those resolve at build time to a language name in
the target's own words, no G2P here has that name, and `fillLanguageSlots` in
core/pack.js deliberately does not substitute into `ipa` -- so a placeholder left
in this column would print literally. Six or seven rows per language.

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
espeak's German r-vocalisation, which this version renders as a literal `??`
(`wurde` -> `vˌ??də`); a Latin-script loanword inside a non-Latin language, which
the Hepburn and Pinyin tables pass through unchanged; a pinyin syllable
`dragonmapper` does not know; a currency symbol -- without a list of things to look
for. Two routes add one gate of their own:

  ko   Revised Romanization writes both the velar nasal and a /n/+/k/ sequence as
       `ng`, and the corpus does not use the disambiguating hyphen, so `chinguga`
       (친구가) is *chin-gu-ga* and `hwajangsiri` (화장실이) is *hwa-jang-*. The
       row's own Hangul settles it: if the number of ㅇ finals equals the number of
       `ng`s, every one of them is /ŋ/. 25 rows where it does not are refused.
  ko   and the syllable count of the result must equal the number of Hangul blocks,
       which in a syllable-block script it always does. That catches every other
       digraph read across a boundary rather than within one -- `tuip` (투입) is
       *tu-ip*, not `tɰip` -- for three more rows.

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
- Three `ja` rows carry romaji rather than IPA, having passed the Hepburn route
  through unconverted.
- `it` has no word-initial /ts/ in the whole column, so `onsetClusters` never
  learns that Italian can open a word with it and *Grazie* breaks as `grats-ie`.
  Italian orthography writes it `z`; the G2P is giving something else.
- 73 `ar` rows have no short vowels at all, because espeak read unvocalised text.
  `hal imknni istijdam` is what a respelling of one looks like, and no rule table
  can recover the vowels. Vocalising the Arabic source text is the fix.
"""
import argparse
import csv
import io
import re
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
          "ar": "ar", "vi": "vi"}

# Languages read off a curated romanisation column instead, and which column.
ROMANISED = {"zh-Hans": "romanization_pinyin", "ja": "romanization_hepburn",
             "ko": "romanization_rr"}

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
          "zh-Hans": "none", "th": "none"}

NON_LATIN = {"zh-Hans", "ja", "ko", "th", "hi", "ar", "ru"}


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
TAIL = set("ːˑ̯̃")          # length, nasalisation, non-syllabic
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
}


# ------------------------------------------------------- Vietnamese tone letters
# espeak's `vi` voice writes five of the six tones as a digit after the nucleus and
# the sixth, sắc, as a stray `ɜ`. Hanoi values, as Chao tone letters. The mark
# moves to the end of its syllable, which for Vietnamese is the whole token: the
# language is written one syllable per word.
VI_TONES = {"2": "˨˩", "ɜ": "˧˥", "4": "˧˩˧", "5": "˧ˀ˥", "6": "˨˩ˀ"}
VI_LEVEL = "˧"                                    # ngang, which espeak leaves bare


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


IEUNG_FINAL = 21                                  # jongseong index of ㅇ


def ko_ng_is_unambiguous(hangul, rr):
    """Whether every `ng` in `rr` is /ŋ/ rather than an /n/+/k/ across a boundary.

    Both are spelled `ng` and the corpus does not use RR's disambiguating hyphen,
    so `chinguga` (친구가) and `hwajangsiri` (화장실이) look alike. Counting the
    Hangul's own ㅇ finals settles it whenever the two counts agree.
    """
    ieung = sum(1 for ch in hangul
                if 0xAC00 <= ord(ch) <= 0xD7A3 and (ord(ch) - 0xAC00) % 28 == IEUNG_FINAL)
    return ieung == rr.count("ng")


def hangul_blocks(text):
    return sum(1 for ch in text if 0xAC00 <= ord(ch) <= 0xD7A3)


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
    ph = [c for c in ipa if c not in TAIL and c not in STRESS_MARKS and c not in TONE]
    n, i, count = len(ph), 0, 0
    while i < n:
        if ph[i] not in VOWELS:
            if split_rising and ph[i] == "j" and i and ph[i - 1] not in VOWELS:
                count += 1
            i += 1
            continue
        hi = i
        while hi + 1 < n and (ph[hi + 1] in GLIDES or ph[hi + 1] in "ɪʊ"):
            hi += 1
        while hi > i and ph[hi] in GLIDES and hi + 1 < n and ph[hi + 1] in VOWELS:
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
MARKER = re.compile(r"(\{\}|/|[,，、])")
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
# where lowercase Latin is indistinguishable from IPA. 51 rows across the corpus,
# and they are refused rather than guessed at.
LATIN_WORD = re.compile(r"[A-Za-z]")


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


def pieces(text):
    """`text` as a list of ('text'|'marker', value), splitting on `{}`, `/`, `,`."""
    out = []
    for part in MARKER.split(text):
        if part in ("{}", "/"):
            out.append(("marker", part))
        elif part in (",", "，", "、"):
            out.append(("marker", ","))
        elif clean(part):
            out.append(("text", clean(part)))
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
        words = ["".join(c for c in w if c not in STRESS_MARKS) for w in words[:-1]] \
            + words[-1:]
        return " ".join(words)
    # espeak occasionally marks two primaries in one word. Keep the first.
    out = []
    for word in words:
        first = word.find("ˈ")
        if first >= 0:
            word = word[:first + 1] + word[first + 1:].replace("ˈ", "")
        out.append(word)
    return " ".join(out)


def normalise(ipa, code):
    for old, new in REPAIR.get(code, []):
        ipa = ipa.replace(old, new)
    for old, new in FOLD:
        ipa = ipa.replace(old, new)
    if code == "vi":
        ipa = " ".join(vi_tone(t) for t in ipa.split())
    return apply_stress(ipa, STRESS.get(code, "keep"))


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

    def one(word):
        out = ""
        for syllable in syllable_tokenize(word, engine="dict"):
            if not any(c.isalpha() for c in syllable):
                continue
            if syllable not in cache:
                raw = [p.strip() for p in
                       transliterate(syllable, engine="thaig2p").split(".") if p.strip()]
                stuck = any(raw[i] == raw[i + 1] == raw[i + 2] for i in range(len(raw) - 2))
                cache[syllable] = DECODER_STUCK if stuck else "".join(raw).replace(" ", "")
            out += cache[syllable]
        return out

    def chunk(text):
        return " ".join(filter(None, (one(w) for w in word_tokenize(text, engine="newmm")
                                      if any(c.isalpha() for c in w))))
    return chunk


def pinyin_to_ipa(word):
    """One Pinyin word. dragonmapper spaces out the syllables of a polysyllabic
    word; they are joined back up so the IPA has the same word boundaries the
    Pinyin column does, and `core/respell.js` hyphenates within a word."""
    from dragonmapper import transcriptions
    try:
        return transcriptions.pinyin_to_ipa(word).replace(" ", "")
    except Exception:
        return word                               # fails check_alphabet


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
    "ko": ("A-", "mechanical transform of the reviewed RR column; no cross-boundary tensification"),
    "es": ("A", "es-419, near-phonemic; 72% -> 97% once the curator's /j/ hiatus is allowed for"),
    "it": ("A", "near-phonemic; stress 98.2%, and this curator keeps the medial glide"),
    "id": ("A", "near-phonemic; stress 92.3%"),
    "sw": ("A", "near-phonemic; the syllable gap is prenasalised onsets (n-JEE-ah), a reader's rule"),
    "de": ("B", "shallow, stress 92.6%, but this espeak build cannot vocalise <r>: 11 rows refused"),
    "tr": ("B", "phonemic orthography, but espeak's Turkish stress is 68.1%"),
    "pt": ("B", "pt-br; vowel reduction is phonetic detail the curated sheet smooths away"),
    "en": ("B", "en-us; deep orthography, but espeak's English lexicon is its best"),
    "ru": ("C", "espeak emits reduction and palatalisation as detail; 27.6% oracle ceiling"),
    "hi": ("C", "schwa deletion is espeak's to get wrong; stress 63.2%"),
    "fr": ("C", "liaison survives and stress is phrasal, but the curated sheet's unit is coarser"),
    "vi": ("C", "tones reconstructed from espeak's digits; 68 rows refused for untranslated notation"),
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
            if LANGUAGE_SLOT.search(row["text"]):
                skipped["names a language"] += 1
                continue
            text = row[source] if source else row["text"]
            if source and not text.strip():
                skipped[f"no {source}"] += 1
                continue
            if code in NON_LATIN and LATIN_WORD.search(row["text"]):
                skipped["latin loanword"] += 1
                continue
            if code == "ko" and not ko_ng_is_unambiguous(row["text"], text):
                skipped["ng ambiguous"] += 1
                continue
            parts = pieces(text)
            if not any(kind == "text" for kind, _ in parts):
                skipped["nothing to say"] += 1
                continue
            plan.append((path, index, row, parts))

    # One backend, one batch: the espeak backend costs a second to start and the
    # Thai model costs twelve, so neither is built per row.
    if code in VOICES:
        chunks = [v for _, _, _, parts in plan for kind, v in parts if kind == "text"]
        lexicon = espeak_lexicon(VOICES[code], chunks)
        transcribe = lexicon.get
    elif code == "th":
        transcribe = thai_syllables()
    elif code == "zh-Hans":
        transcribe = lambda chunk: " ".join(pinyin_to_ipa(w) for w in chunk.split())
    elif code == "ja":
        transcribe = lambda chunk: " ".join(hepburn_to_ipa(w.lower()) for w in chunk.split())
    elif code == "ko":
        transcribe = lambda chunk: " ".join(rr_to_ipa(w.lower()) for w in chunk.split())
    else:
        raise SystemExit(f"no route for {code}")

    method = {"th": "thaig2p", "zh-Hans": "pinyin", "ja": "hepburn",
              "ko": "rr"}.get(code, "espeak")
    filled = {}                                   # (path, index) -> ipa
    bad = Counter()
    flagged = []                                  # rows a reviewer should read first
    for path, index, row, parts in plan:
        ipa = assemble([(kind, normalise(transcribe(value) or "", code) if kind == "text"
                         else value) for kind, value in parts])
        ipa = unicodedata.normalize("NFC", re.sub(r"\s+", " ", ipa).strip())
        stray = check_alphabet(ipa)
        if not ipa or stray:
            skipped["G2P failed"] += 1
            bad.update(stray or ["(empty)"])
            continue
        # Korean is a syllable-block script, so the result must have exactly as many
        # syllables as the row has blocks. That catches every RR vowel digraph read
        # across a boundary rather than within one -- `dongjeon tuip` (동전 투입) is
        # *tu-ip*, not `tɰip`, and `gichae` (기차에) is *gi-cha-e*, not `kitɕʰɛ*.
        # Only where there is a block to count and no digit to confuse it: `1월` is
        # one block and two syllables, and `₩` is none and one.
        if code == "ko" and hangul_blocks(row["text"]) \
                and not any(c.isdigit() for c in row["text"]) \
                and syllable_count(ipa) != hangul_blocks(row["text"]):
            skipped["syllable count"] += 1
            continue
        if ACRONYM.search(row["text"]):
            flagged.append(row["concept_id"])
        filled[(path, index)] = ipa
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
        codes = [r["bcp47"] for r in csv.DictReader(fh) if r["status"] == "ready"]
    if args.only:
        codes = [c for c in args.only.split(",") if c in codes]

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
                ipa = filled.get((path, index), "")
                if ipa:
                    by_cid[row["concept_id"]] = ipa
                    repertoire.update(ipa)
                    written += 1
                elif not row["ipa"] and not ipa_method(row["provenance"]):
                    continue                      # already empty and undeclared
                fields[columns.index("ipa")] = ipa
                fields[columns.index("provenance")] = provenance_with(
                    row["provenance"], method if ipa else None)
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
    import json
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
