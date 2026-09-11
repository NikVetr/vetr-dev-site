#!/usr/bin/env python3
"""Subset the upstream fonts into data/fonts/ and write a manifest.

Two outputs per face: .ttf for pdf-lib (which re-subsets to the glyphs a given
document actually uses) and .woff2 for the CSS preview. Coverage is a per-stack
union of standard Unicode ranges, a common-character allowance so users can type
their own terms offline, and every character the shipped corpus actually uses.

  python3 scripts/fetch_fonts.py && python3 scripts/subset_fonts.py
"""
import csv
import glob
import io
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.DefaultTable import DefaultTable
from fontTools.ttLib.scaleUpem import scale_upem
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tmp" / "fonts-src"
OUT = ROOT / "data" / "fonts"

# Latin, IPA extensions, combining marks, general punctuation, currency. Every
# stack gets these: the gloss column is Latin whatever the target script is.
LATIN_RANGES = [(0x20, 0x24F), (0x250, 0x2AF), (0x2B0, 0x2FF), (0x300, 0x36F),
                (0x2000, 0x206F), (0x20A0, 0x20BF), (0x2100, 0x214F), (0x2190, 0x21FF)]
# Greek, Cyrillic and Latin Extended Additional, for the `latin` stacks only.
#
# These are here rather than left to the corpus union because the add-your-own-term
# editor lets someone type a word the corpus never contained, offline, with no font
# left to fall back to. Greek needs the first block, Russian the second and
# Vietnamese the third, and together they cost about 20KB a face. They are kept off
# the CJK and Arabic stacks because `scripts.csv` routes Greek, Cyrillic and
# Vietnamese to `latin` -- a Mandarin card glossed in Russian sets the Russian in
# the Latin face, so the CJK face would carry 500 glyphs it can never be asked to
# draw, in the largest files here.
#
# Greek needs no stack of its own, unlike Devanagari and Thai: all four static Noto
# Sans faces and both variable ones carry the whole of U+0370-03FF, 354 codepoints
# apiece, so `Grek` can name the `latin` stack in `scripts.csv` and be drawn by it.
# That was checked against the shipped subsets rather than inferred from the family
# name, which is the mistake the Devanagari note above records.
LATIN_EXTRA_RANGES = [(0x370, 0x3FF), (0x400, 0x4FF), (0x1E00, 0x1EFF)]
CJK_PUNCT = [(0x3000, 0x303F), (0xFF00, 0xFFEF), (0x2E80, 0x2EFF)]
KANA = [(0x3040, 0x30FF), (0x31F0, 0x31FF)]
# Jamo, so a Hangul syllable that is stored decomposed still has parts to shape.
HANGUL_JAMO = [(0x1100, 0x11FF), (0x3130, 0x318F), (0xA960, 0xA97F), (0xD7B0, 0xD7FF)]
ARABIC_RANGES = [(0x600, 0x6FF), (0x750, 0x77F), (0x8A0, 0x8FF),
                 (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)]
# Two scripts the Latin faces cover not at all, each with a stack of its own. Both
# blocks have gaps; the subsetter intersects with the font's cmap anyway.
#
# Devanagari is here rather than folded into the Latin union because only the
# *variable* Noto Sans carries it, and that file feeds the condensed stack alone --
# the static faces behind `latin` have none of it. Adding `hi` to `ALL_LANGS` would
# have looked like a fix and produced a subset request the source could not fill.
THAI_RANGES = [(0x0E00, 0x0E7F)]
# The whole Lao block, for Bengali's, Tamil's, Telugu's, Gurmukhi's, Gujarati's,
# Kannada's and Malayalam's reason: Phetsarath reaches its contextual tone-mark
# variants and its `ນ ້ ຳ` -> `ນ ້(lowered) ໍ າ` substitution through **GSUB**
# `rlig`, and none of those glyphs has a codepoint at all, so the request has to be
# the block whole rather than the letters the corpus happens to use today.
# `subset_source`'s `layout_features = ["*"]` is what keeps the lookups.
#
# 82 of the block's 128 codepoints are assigned (checked against `unicodedata`
# rather than by eye) and Phetsarath carries 65 of the 82. The 17 it lacks are the
# fourteen Pali and Sanskrit extension letters, the Pali virama U+0EBA and the two
# Khmu letters -- precisely the set modern Lao does not write, and the Pali virama's
# absence is a *benefit*: it is the one base every Noto Lao face has a NULL
# MarkBasePos anchor for. The subsetter intersects with the cmap in any case.
#
# U+0ED0..0ED9, the Lao digits, are inside the range and are requested for the same
# reason Bengali's are: the block is subset whole. The `lo` pack itself writes none
# of them -- Laos prices, buses and timetables are in ASCII numerals, which is
# Hindi's and Tamil's answer rather than Bengali's and Arabic's.
LAO_RANGES = [(0x0E80, 0x0EFF)]
# The whole Khmer block, for Lao's, Bengali's and Telugu's reason and one of its own.
#
# Khmer OS Content positions **every** vowel sign, subscript and register shifter by
# GSUB substitution -- 696 glyphs of precomposed and contextual forms under
# `blwf abvf blws pres psts liga clig` and 52 `zz##` features, with a GPOS table that
# declares two scripts and holds zero features and zero lookups. None of those output
# glyphs has a codepoint, so the request has to be the block whole rather than the
# letters the corpus happens to use today; `subset_source`'s `layout_features = ["*"]`
# is what keeps the lookups that reach them. That GSUB-only design is also why this
# face was chosen -- see tmp/khmer.md section 4 -- because it makes both of
# fontkit's Khmer crash paths unreachable by construction.
#
# 100 of the block's 114 assigned codepoints are in the face and the subsetter
# intersects with the cmap anyway. The fourteen it lacks are exactly the fourteen no
# modern Khmer text writes: U+17B4/17B5, which Unicode's own note says are for
# transliteration and must not appear in Khmer text; U+17DC/17DD, which are Pali-only;
# and U+17F0..17F9, the archaic lek attak divination numerals. The riel sign `៛`
# U+17DB **is** present, checked against the cmap rather than assumed, because
# `numbers-money.riel-symbol` prints it.
#
# U+17E0..17E9, the Khmer digits, arrive with the block and no row can reach them:
# the pack writes ASCII numerals, which is Hindi's, Tamil's, Telugu's and Lao's
# answer rather than Bengali's -- and here it is measured rather than conventional.
# The Khmer digits are `Script=Khmer`, so `core/measure.js`'s `BREAKS_ANYWHERE`
# makes `wordish` false for them and the `IN_WORD` glue cannot weld them, which
# means `១១៩` would offer a line break between each digit. See tmp/khmer.md section 1.
KHMR_RANGES = [(0x1780, 0x17FF)]
# The whole Hebrew block: 88 of its 135 codepoints are in both Hebrew faces, and the
# subsetter intersects with the cmap anyway. The Alphabetic Presentation Forms block
# is deliberately *not* here -- U+FB2A shin-with-dot and U+FB31 bet-with-dagesh are
# compatibility characters, NFC leaves the corpus's letter+mark sequences decomposed,
# so nothing can ask for one; the shaper reaches its own ligature glyphs through GSUB,
# which `layout_features` keeps.
HEBREW_RANGES = [(0x0590, 0x05FF)]
DEVA_RANGES = [(0x0900, 0x097F), (0xA8E0, 0xA8FF)]
# The whole Bengali block. Its vowel signs go on all four sides of a consonant --
# including the two-part ো and ৌ that wrap around it -- so the block is requested
# whole rather than by the letters the corpus happens to use: a conjunct the corpus
# does not contain today is one row away, and the subsetter intersects with the cmap
# in any case. U+09E6..09EF are the Bengali digits, which the pack prints.
BENG_RANGES = [(0x0980, 0x09FF)]
# The whole Tamil block, for Bengali's reason: the vowel signs sit on three sides of
# a consonant, including the two-part ொ ோ ௌ that wrap around it, so the block is
# requested whole rather than by the letters the corpus uses today. Only 72 of its
# 128 codepoints are assigned and the subsetter intersects with the cmap anyway.
#
# **The Tamil Supplement block U+11FC0..11FFF is deliberately not here**, and the
# Tamil digits arrive with the block rather than being asked for: `data/lang/ta`
# carries no `௦-௯` at all, because ASCII has supplanted them in Tamil education,
# government and daily life (see tmp/tamil.md). ௰ ௱ ௲ and ௹ come along too and no
# row can reach them.
TAML_RANGES = [(0x0B80, 0x0BFF)]
# The whole Telugu block, for Bengali's and Tamil's reason plus one of its own.
#
# Telugu puts its vowel signs *above* the consonant (the talakattu ` ి` and its
# relatives) and its conjuncts *below* the line as subscript consonants -- and the
# subscript forms have no codepoints at all. The shaper reaches `lasubscripttelu` and
# the other 35 through GSUB, which `subset_source`'s `layout_features = ["*"]` keeps,
# so the request has to be the block whole rather than the letters the corpus happens
# to use today: a conjunct is one row away and it is not a character. 100 of the
# block's 128 codepoints are assigned and the subsetter intersects with the cmap in
# any case. U+0C66..0C6F are the Telugu digits, which the pack does *not* print --
# they arrive with the block and no row can reach them, exactly as Tamil's do.
TELU_RANGES = [(0x0C00, 0x0C7F)]
# The whole Gurmukhi block, for Bengali's, Tamil's and Telugu's reason and one of its
# own: Gurmukhi's three subjoined consonants -- pairin ਹ ਰ ਵ -- have **no codepoints
# at all**, and the shaper reaches them through GSUB, so the request has to be the
# block plus `subset_source`'s `layout_features = ["*"]`. 80 of the block's 128
# codepoints are assigned (checked against `unicodedata` rather than by eye; the other
# 48 are Unicode leaving them unassigned) and both faces carry all 80. That includes
# the addak U+0A71 and the nukta U+0A3C, the two marks the whole design of the Punjabi
# reader table turns on, and the digits U+0A66..0A6F, which the pack does **not**
# print -- they arrive with the block and no row can reach them, exactly as Tamil's
# and Telugu's do.
GURU_RANGES = [(0x0A00, 0x0A7F)]
# The whole Kannada block, for Bengali's, Tamil's, Telugu's, Gurmukhi's and
# Gujarati's reason and **two** of its own, because Kannada stacks in two directions
# and has a third device none of those five has.
#
# Its conjuncts are *subscript* consonants hung below the line and have **no
# codepoints at all** -- `kasubscriptknda` and its 33 siblings are reached only
# through GSUB, which `subset_source`'s `layout_features = ["*"]` keeps. And a coda
# `ರ್` before a consonant becomes the **arkavattu**, a superscript hook drawn over
# the *following* letter (ಕರ್ನಾಟಕ), which is a third contextual form again. So the
# request has to be the block whole rather than the letters the corpus happens to use
# today. 89 of the block's 128 codepoints are assigned (checked against
# `unicodedata`; the other 39 are Unicode leaving them unassigned) and both faces
# carry all 89. That includes the digits U+0CE6..0CEF, which the pack does **not**
# print -- they arrive with the block and no row can reach them, exactly as Tamil's,
# Telugu's, Gurmukhi's and Gujarati's do -- and the nukta U+0CBC, which no Kannada
# text uses and which `tmp/kn/write.py` asserts is absent from every cell.
KNDA_RANGES = [(0x0C80, 0x0CFF)]
# The whole Malayalam block, for Bengali's, Tamil's, Telugu's, Gurmukhi's,
# Gujarati's and Kannada's reason and **two** of its own.
#
# Its conjuncts have **no codepoints at all**: ക്ക, ന്ന, ണ്ട, ത്ത, ല്ല, ങ്ങ, ഞ്ഞ,
# മ്പ, ന്ത, സ്ഥ, ക്ഷ, ന്റ and the rest of a large inventory are reached only
# through GSUB from the `C + ് + C` the corpus stores, which is why
# `subset_source`'s `layout_features = ["*"]` is load-bearing here. And the
# **traditional/reformed orthography split is a property of the face rather than of
# the encoding** -- ക + ു is the same two codepoints either way, and whether it
# prints as the fused traditional കു or as a detached reformed sign is decided by
# whether the face has the ligature. Manjari has it; Noto does not. So the request
# has to be the block whole rather than the letters the corpus happens to use today.
#
# 118 of the block's 128 codepoints are assigned (checked against `unicodedata`
# rather than by eye) and Manjari carries all 118. That includes the digits
# U+0D66..0D6F, which the pack does **not** print -- it writes ASCII, for Hindi's,
# Tamil's, Telugu's, Gurmukhi's, Gujarati's and Kannada's usage reason -- and the
# six **chillu** letters U+0D7A..0D7F, five of which the reader table emits on every
# coda and the sixth (ൿ, chillu k) of which is archaic and banned from the pack by
# `tmp/ml/write.py`. It also carries U+0D3B and U+0D3C, the two Unicode 9.0
# alternate viramas, which no Malayalam text writes and which `tmp/ml/write.py` also
# asserts absent: they are the marks Noto Sans Malayalam's 227 NULL MarkBasePos base
# anchors belong to. See tmp/malayalam.md.
MLYM_RANGES = [(0x0D00, 0x0D7F)]
# The whole Gujarati block, for Bengali's, Tamil's, Telugu's and Gurmukhi's reason and
# one of its own. Gujarati is Devanagari without the shirorekha and it forms the same
# subjoined and ligated conjuncts -- ક્ત, દ્ધ, ષ્ટ, હ્ય, and the below-base ર of પ્ર --
# and **none of those has a codepoint at all**: the shaper reaches every one through
# GSUB, which `subset_source`'s `layout_features = ["*"]` keeps, so the request has to
# be the block whole rather than the letters the corpus happens to use today. 91 of the
# block's 128 codepoints are assigned (checked against `unicodedata` rather than by
# eye) and Mukta Vaani carries 85 of the 91 -- the six it lacks are U+0AFA..0AFF, the
# Unicode 8.0 signs for writing Perso-Arabic phonology in Gujarati, which no standard
# Gujarati text uses. The subsetter intersects with the cmap in any case. U+0AE6..0AEF
# are the Gujarati digits, which the pack does **not** print -- it writes ASCII, for
# Hindi's, Tamil's, Telugu's and Punjabi's usage reason -- and they arrive with the
# block. **U+0ABC, the nukta, arrives too and no row and no rule can reach it**: it is
# banned from the pack by `tmp/gu/write.py` and from the reader table outright, because
# a nukta letter followed by a subjoined ર is one of the two sequences Noto Serif
# Gujarati throws on in `vendor/fontkit.esm.js`. See tmp/gujarati.md.
GUJR_RANGES = [(0x0A80, 0x0AFF)]
# The whole Ethiopic block, and here the reason is the opposite of every Brahmic
# entry above. Ethiopic is an **abugida written as a syllabary**: each of the ~34
# consonant series has seven vowel-bearing forms and every one of them is its own
# *precomposed* codepoint, so there is no vowel sign, no conjunct, no reordering and
# no GSUB form to reach -- `tmp/am/shapecheck.mjs` lays all 129,628 single syllables,
# mark sequences and ordered pairs through `vendor/fontkit.esm.js` and finds **zero**
# substitutions among the letters. The block is requested whole for the plain reason
# instead: 358 of the 384 codepoints are assigned, the pack's 837 rows reach a large
# fraction of them, and a reader typing their own term into the add-your-own-term
# editor can reach any of them.
#
# **What the block also carries is the one thing that would make `needs_shaping: 0`
# false, and it is unreachable by construction.** U+1369..137C are the Ethiopic
# numerals, and this fontkit *does* substitute them -- 400 contextual joined forms,
# every ordered pair of the twenty. The pack writes ASCII digits (Hindi's and Tamil's
# usage answer: every Ethiopian price board, plate and receipt does) and
# `tmp/am/write.py` asserts that no cell contains one, as it asserts for the three
# combining marks U+135D..135F, which are the only glyphs in the block with a GPOS
# anchor. They arrive with the block and nothing can reach them, exactly as the
# Gujarati nukta and the Tamil, Telugu, Gurmukhi and Kannada digits do.
ETHI_RANGES = [(0x1200, 0x137F)]

# Mkhedruli, and **only** Mkhedruli. Georgian has three scripts in Unicode and the
# choice is not a preference, it is what the corpus is: 12,455 Georgian characters
# in the pack and 77,992 in 97KB of Georgian Wikipedia are Mkhedruli, and **zero**
# are Mtavruli (U+1C90..1CBF) or Asomtavruli/Nuskhuri (U+10A0..10CF, U+2D00..2D2F).
# Modern Georgian is unicameral Mkhedruli; Khutsuri is liturgical and historical.
#
# Mtavruli is the case worth stating, because it is reachable in a way Khutsuri is
# not: Unicode 11 gave every Mkhedruli letter an uppercase mapping *into* Mtavruli,
# so `"გამარჯობა".toUpperCase()` is `ᲒᲐᲛᲐᲠᲯᲝᲑᲐ` in plain JavaScript. Two places
# could reach that and neither does. `core/respell.js`'s `caps` stress device would,
# and `ka__ka-GE.json` declines it and says why -- Georgian is the first script here
# where `caps` is neither dead (Amharic, Thai, Hebrew: caseless) nor native (Latin,
# Greek, Cyrillic), it *fires* and produces a display style that means something
# else. And `style.css`'s `text-transform: uppercase` on `.panel-title` does, but
# that is browser chrome set in `var(--ui)` -- a system font, never a shipped subset
# -- and Mtavruli all-caps is the typographically correct answer there anyway.
# Nothing in `core/` or `render/` uppercases sheet text at all, so no glyph of
# U+1C90..1CBF can reach a page this project draws.
#
# The block is requested whole rather than by corpus union for the reason
# `LATIN_EXTRA_RANGES` states: 33 of the 48 are the modern alphabet and the corpus
# uses exactly those 33, but the add-your-own-term editor can type the five archaic
# letters ჱ ჲ ჳ ჴ ჵ offline with no font to fall back to. Unlike the Brahmic and Lao
# blocks there is no second reason: Georgian reaches **no** unencoded glyph, because
# it fires no substitution at all -- 0 GSUB substitutions over the 38,241-string
# exhaustive cube and 3,370 real tokens, in both faces (tmp/ka/georgian.md).
GEOR_RANGES = [(0x10D0, 0x10FF)]

# The whole Armenian block, for Georgian's reason and one of its own.
#
# 91 of the 96 codepoints are assigned and the subsetter intersects with the cmap
# anyway. The corpus writes 39 letters, `։ ՝ ՞ ՜ ՛` and nothing else; the block is
# requested whole so the add-your-own-term editor can type ՈՒ, ՙ, ՚ or the dram sign
# ֏ offline with no font to fall back to.
#
# The reason of its own is the one the Brahmic and Lao blocks have: **Armenian
# reaches glyphs that have no codepoint at all.** `liga` ligates ո+ւ to
# `uni05780582` and Ո+Ւ to `uni05480552` -- the ու digraph, which is the ordinary
# spelling of /u/ and fires on 783 of 2,496 real tokens -- and neither has a
# codepoint. `subset_source`'s `layout_features = ["*"]` is what keeps the lookups
# that reach them, and the closure is what keeps the glyphs.
#
# U+FB13..FB17 are deliberately **not** requested. They are the five presentation
# forms ﬓ ﬔ ﬕ ﬖ ﬗ, which the same `liga` reaches from մ+ն, մ+ե, մ+ի, վ+ն and մ+խ,
# so the glyphs arrive through the layout closure rather than through the cmap --
# 160 times over the same token list. Requesting them would add a second encoding of
# a glyph NFC does not normalise away, and `hy.check` in tmp/hy/hy.py refuses to
# write one for the same reason. This is Hebrew's Alphabetic-Presentation-Forms
# decision in a script that actually fires the ligatures.
ARMN_RANGES = [(0x0530, 0x058F)]
# Three codepoints subtracted from the **Latin** side of the `armn` request, and the
# reason is a crash rather than a size.
#
# `LATIN_RANGES` asks every stack for U+0300..036F, and both Noto Armenian variables
# hold a MarkBasePos lookup whose second mark class -- U+0326 comma below, U+0327
# cedilla, U+0328 ogonek -- has a **NULL base anchor** on the seven Armenian vowel
# letters Ա Ո Օ ՠ ա ո օ and on the dotted circle. That is the crash that refused Noto
# for Telugu, Gurmukhi, Gujarati and Malayalam: `getAnchor` dereferences the NULL and
# `core/measure.js` throws. Measured through this project's own fontkit, **21 of the
# 1,365 (Armenian letter x mark) pairs throw** in the donor and in a subset built
# with the marks in; dropping these three prunes the lookup's second class and takes
# the count to **0**, at a cost of two glyphs and with the mark/mkmk machinery for
# the other twelve marks left intact.
#
# Safe because none of the three is reachable from the corpus: they appear in no
# `text`, no `romanization_*`, no `ipa` cell in any of the forty-nine packs, in no
# reader table's `charset.json` entry, and in none of the shared registry or concept
# files. The combining marks the corpus does use -- U+0300 U+0301 U+0303 U+0304
# U+0310 U+031D U+0325 U+0329 U+032A U+032F U+0348 -- are all in the *first* mark
# class, whose anchors are present. See tmp/hy/armenian.md section 3.
ARMN_EXCLUDE = {0x0326, 0x0327, 0x0328}

# Klingon pIqaD and Tengwar. These are the two scripts here that are **not in
# Unicode**: both proposals were rejected, so they live in the Private Use Area by
# allocation of the ConScript Unicode Registry, and nothing about them can be
# inferred from a codepoint. The registry is therefore cited rather than the script:
#   https://www.evertype.com/standards/csur/klingon.html   (revised 2004-01-15)
#   https://www.evertype.com/standards/csur/tengwar.html   (revised 1998-01-10)
#
# The whole pIqaD block, but only the tengwar the classical Quenya mode uses. pIqaD
# is an alphabet of 26 letters, ten digits and two marks, and a complete alphabet is
# the useful unit -- the same argument `LATIN_EXTRA_RANGES` makes for Greek. CSUR
# tengwar is 117 codepoints of which the mode needs 35; the rest are Sindarin-only
# forms, Rúmilian numerals and hexadecimal digits that no cell in the corpus can
# reach, and they cost real bytes in eight faces. The 35 are exactly what
# `scripts/transliterate_native.py` emits, and `tests/fonts.test.mjs` is what fails
# if that table grows and this list does not.
PIQAD_RANGES = [(0xF8D0, 0xF8E9), (0xF8F0, 0xF8F9), (0xF8FD, 0xF8FE)]
TENGWAR_RANGES = [(0xE000, 0xE00B), (0xE00C, 0xE026),
                  (0xE040, 0xE040), (0xE043, 0xE044), (0xE046, 0xE046),
                  (0xE048, 0xE048), (0xE04A, 0xE04A), (0xE04D, 0xE04D)]

# Faces: (stack, weight, italic) -> source file. CJK and Arabic have no italic in
# these families, and the sheet only ever italicises romanisation, which is Latin.
#
# `latin-cond` is the equivalent of the reference sheet's \tablelatin: dense
# reference tables need a narrower Latin face or their four columns cannot hold a
# gloss and a respelling on one line.
# Seconds from 1904-01-01 (the OpenType epoch) to 2026-01-01.
PINNED_DATE = 3850070400

CONDENSED_WDTH = 87.5
NORMAL_WDTH = 100

FACES = {
    ("latin", 400, False): "NotoSans-Regular.ttf",
    ("latin", 700, False): "NotoSans-Bold.ttf",
    ("latin", 400, True): "NotoSans-Italic.ttf",
    ("latin", 700, True): "NotoSans-BoldItalic.ttf",
    ("latin-cond", 400, False): "NotoSans-var.ttf",
    ("latin-cond", 700, False): "NotoSans-var.ttf",
    ("latin-cond", 400, True): "NotoSans-Italic-var.ttf",
    ("latin-cond", 700, True): "NotoSans-Italic-var.ttf",
    ("cjk-sc", 400, False): "NotoSansSC-var.ttf",
    ("cjk-sc", 700, False): "NotoSansSC-var.ttf",
    ("cjk-jp", 400, False): "NotoSansJP-var.ttf",
    ("cjk-jp", 700, False): "NotoSansJP-var.ttf",
    ("arabic", 400, False): "NotoSansArabic-Regular.ttf",
    ("arabic", 700, False): "NotoSansArabic-Bold.ttf",
    # Serif variants of the stacks that have one. Scripts without a serif here fall
    # back to their sans face at runtime rather than failing.
    ("latin-serif", 400, False): "NotoSerif-var.ttf",
    ("latin-serif", 700, False): "NotoSerif-var.ttf",
    ("latin-serif", 400, True): "NotoSerif-Italic-var.ttf",
    ("latin-serif", 700, True): "NotoSerif-Italic-var.ttf",
    ("latin-cond-serif", 400, False): "NotoSerif-var.ttf",
    ("latin-cond-serif", 700, False): "NotoSerif-var.ttf",
    ("latin-cond-serif", 400, True): "NotoSerif-Italic-var.ttf",
    ("latin-cond-serif", 700, True): "NotoSerif-Italic-var.ttf",
    ("cjk-sc-serif", 400, False): "NotoSerifSC-var.ttf",
    ("cjk-sc-serif", 700, False): "NotoSerifSC-var.ttf",
    ("cjk-jp-serif", 400, False): "NotoSerifJP-var.ttf",
    ("cjk-jp-serif", 700, False): "NotoSerifJP-var.ttf",
    ("cjk-kr", 400, False): "NotoSansKR-var.ttf",
    ("cjk-kr", 700, False): "NotoSansKR-var.ttf",
    ("cjk-kr-serif", 400, False): "NotoSerifKR-var.ttf",
    ("cjk-kr-serif", 700, False): "NotoSerifKR-var.ttf",
    # No italic, as with CJK and Arabic: the sheet only italicises romanisation and
    # the respelling, both of which are Latin.
    # Lao is sans-only, on Telugu's, Gujarati's and Kannada's precedent: Phetsarath
    # has no serif companion, and Noto Serif Lao was refused on the same shaper
    # divergence as the Noto sans plus a second NULL-anchor class of its own (see
    # tmp/lao.md section 5), so the typeface control falls back to sans for Lao.
    ("laoo", 400, False): "Phetsarath-Regular.ttf",
    ("laoo", 700, False): "Phetsarath-Bold.ttf",
    # Khmer, and sans-only for Lao's, Telugu's, Gujarati's, Kannada's and Malayalam's
    # reason: the only OFL Khmer serif is Noto Serif Khmer, which throws 19,041 times
    # in 213,605 clusters on NULL MarkBasePos base anchors, so the typeface control
    # falls back to sans for Khmer.
    #
    # Khmer OS Content is the **only** candidate of twenty-four whose fontkit output
    # is identical to HarfBuzz's, glyph for glyph and advance for advance, with zero
    # throws, over 260,015 clusters in both weights -- the 213,605-cluster cube of
    # every cluster modern Khmer orthography writes plus a 46,410-cluster
    # register-shifter cube. All six Noto Khmer faces are refused twice over, and
    # Battambang, Suwannaphum, Hanuman and Nokora each on a fontkit defect Khmer is
    # the only script here that can reach. See tmp/khmer.md sections 2 to 4.
    ("khmr", 400, False): "Content-Regular.ttf",
    ("khmr", 700, False): "Content-Bold.ttf",
    ("thai", 400, False): "NotoSansThai-var.ttf",
    ("thai", 700, False): "NotoSansThai-var.ttf",
    ("thai-serif", 400, False): "NotoSerifThai-var.ttf",
    ("thai-serif", 700, False): "NotoSerifThai-var.ttf",
    ("hebrew", 400, False): "NotoSansHebrew-var.ttf",
    ("hebrew", 700, False): "NotoSansHebrew-var.ttf",
    ("hebrew-serif", 400, False): "NotoSerifHebrew-var.ttf",
    ("hebrew-serif", 700, False): "NotoSerifHebrew-var.ttf",
    ("beng", 400, False): "NotoSansBengali-var.ttf",
    ("beng", 700, False): "NotoSansBengali-var.ttf",
    ("beng-serif", 400, False): "NotoSerifBengali-var.ttf",
    ("beng-serif", 700, False): "NotoSerifBengali-var.ttf",
    ("deva", 400, False): "NotoSansDevanagari-var.ttf",
    ("deva", 700, False): "NotoSansDevanagari-var.ttf",
    ("deva-serif", 400, False): "NotoSerifDevanagari-var.ttf",
    ("deva-serif", 700, False): "NotoSerifDevanagari-var.ttf",
    ("taml", 400, False): "NotoSansTamil-var.ttf",
    ("taml", 700, False): "NotoSansTamil-var.ttf",
    ("taml-serif", 400, False): "NotoSerifTamil-var.ttf",
    ("taml-serif", 700, False): "NotoSerifTamil-var.ttf",
    # Telugu, and the one stack here that is neither Noto nor paired with a serif.
    # **Noto Sans Telugu and Noto Serif Telugu throw in `vendor/fontkit.esm.js`** --
    # 340 of the 49,140 aksharas Telugu can write, every consonant with a
    # ra-subscript plus ి ీ ె ే, so ప్ర, శ్రీ and క్రి among them. The cause is 468
    # NULL MarkBasePos base anchors, which are legal OpenType and which this fontkit
    # dereferences without a null check; instancing and subsetting change nothing.
    # See the note in fetch_fonts.py and tmp/telugu.md, which also records why Hind
    # Guntur was chosen over the other twenty faces that do not throw. Static, like
    # the Arabic pair and unlike every other stack here, because this family ships
    # five real weights and needs no instancing.
    #
    # No `telu-serif`: the only OFL Telugu face with a claim to being a serif is the
    # Noto Serif that throws. `stackFor` in core/fonts.js falls back to the sans face
    # for a variant that is not shipped, which is what `arabic` above relies on -- it
    # has no serif either.
    ("telu", 400, False): "HindGuntur-Regular.ttf",
    ("telu", 700, False): "HindGuntur-Bold.ttf",
    # Gurmukhi. **Noto Sans Gurmukhi is refused and the shaper closed it**: it throws
    # in `vendor/fontkit.esm.js` on 26,232 of the 59,280 aksharas Gurmukhi can write,
    # including 680 of the 1,520 that have no subjoined consonant at all -- ਪੰਜਾਬੀ,
    # ਸਿੰਘ, ਮੈਂ and ਸ੍ਰੀ among them -- because its GPOS holds 880 NULL MarkBasePos
    # base anchors of 1,486 and this fontkit reads `.xCoordinate` off them. Telugu's
    # defect in a worse proportion; see the note in fetch_fonts.py, and run
    # `node tmp/pa/shapecheck.mjs` before choosing a face for gu, si, kn, ml or ne.
    #
    # **Noto Sans Gurmukhi *UI* is the same design with a GPOS that has none of them**
    # -- byte-identical glyph bounding boxes, identical vertical metrics, zero throws
    # -- so unlike Telugu this stack stays inside the Noto family and keeps a serif.
    # It is the second source here to need a `LATIN_DONOR`, because the UI cut carries
    # 43 codepoints of U+0020..024F and no letter of either case; the serif carries
    # 284 and needs none, so the graft is on one face of the stack and not the other,
    # which `build_face` already handles per source file.
    ("guru", 400, False): "NotoSansGurmukhiUI-var.ttf",
    ("guru", 700, False): "NotoSansGurmukhiUI-var.ttf",
    ("guru-serif", 400, False): "NotoSerifGurmukhi-var.ttf",
    ("guru-serif", 700, False): "NotoSerifGurmukhi-var.ttf",
    # Gujarati, and this is Telugu's outcome reached by a different route: **Noto Sans
    # Gujarati is refused and the shaper closed it, on the Gujarati past tense.** Over
    # the 53,352 aksharas Gujarati can write (`node tmp/gu/shapecheck.mjs`) it throws
    # in `vendor/fontkit.esm.js` on only **27** -- a small number, and one of the 27
    # families is `હ્યું`, the neuter perfect participle, so કહ્યું *said*, રહ્યું
    # *stayed* and સહ્યું *endured* all throw. Probed as whole words rather than
    # inferred from the matrix. A throw in `core/measure.js` is a crash rather than a
    # bad glyph, so what matters is not how many strings throw but whether a real row
    # reaches one -- and the ordinary Gujarati past tense does. Same NULL MarkBasePos
    # base anchor defect as Telugu's 340 and Gurmukhi's 26,232.
    #
    # Unlike Gurmukhi there is no UI cut on Google Fonts to fall back to, so the sans
    # half leaves the Noto family. **Mukta Vaani** (Ek Type, OFL 1.1, "Copyright (c)
    # 2016, Ek Type", no Reserved Font Name in OFL.txt) shapes all 53,352 with zero
    # throws and zero notdef, carries 85 of the 91 assigned Gujarati codepoints
    # including the digits, the nukta and ૃ/ૄ, and carries **326** codepoints of
    # U+0020..024F including the whole of ASCII, `·` U+00B7 and `₹` -- so it needs no
    # `LATIN_DONOR` graft, which is what decided it against Noto Sans Gujarati **UI**
    # (43 codepoints, no letter of either case, no `·`). It is the same superfamily as
    # Mukta Mahee, which tmp/punjabi.md measured and refused for Gurmukhi on the nukta;
    # Gujarati's binding pair is the **anusvara** instead, and Mukta Vaani's ક/કં
    # differ by 0.078 of the smaller letter's ink at 5.4pt against Noto's 0.070 -- both
    # in Devanagari's and Thai's tier (0.067, 0.065) rather than Arabic's 0.036, so
    # refusing the graft costs nothing measurable. Real static Regular and Bold, so the
    # pair needs no instancing: the third stack of which that is true, after `arabic`
    # and `telu`. Hind Vadodara (lacks 23 of the block including the digits, worst pair
    # 0.060) and Anek Gujarati (worst pair 0.051, upem 2000) are refused on those
    # numbers, Baloo Bhai 2 is a display design, and Rasa throws on 1,355.
    #
    # **No `gujr-serif`, and this is Telugu's outcome by a different route.** Noto Serif
    # Gujarati was measured, staged and then refused, and the way it was refused is the
    # finding the next Brahmic addition should read. Over the 53,352-akshara matrix it
    # throws on 183, and every one of the 183 looked unreachable: 75 are `C્રૃ`, which
    # Gujarati cannot write because ૃ *is* a vowel, and 108 are a nukta letter plus a
    # subjoined ર, and this pack writes no nukta. **The matrix was wrong, because it
    # tested one subjoined consonant and the corpus produces two.** Shaping the real
    # 27,644 rows -- the pack's own strings plus every respelling `gu__gu-IN.json`
    # generates over the whole corpus, `node tmp/gu/throwrows.mjs` -- found it throwing
    # on three: `હ્ર્ર`, `ચ્ર્ર્ફ્ના` and `ત્ફ્ર્ર્જ ફ’-કત`, all of them Arabic's
    # shadda-geminated ر (حرّ, تشرّفنا, أتفرّج) arriving as `rr` and each `r` taking the
    # `any` rule `્ર`. A **double subjoined ર**, which no other shipped face has any
    # trouble with -- `ह्र्र`, `হ্র্র`, `హ్ర్ర`, `ਹ੍ਰ੍ਰ` and `ஹ்ர்ர` all shape clean in
    # the eighteen committed deva/beng/telu/guru/taml faces, checked -- so this is Noto
    # Serif Gujarati's defect alone.
    #
    # It could have been papered over with one rule (`after_out: "્ર"` on the four
    # rhotics), and it is not, for the reason the whole face question turns on: Mukta
    # Vaani throws on **zero** of the 53,352 aksharas *and* zero of the 27,644 real
    # rows, and a matrix that missed one reachable sequence may be missing another. The
    # only other OFL Gujarati serif is **Rasa**, which throws on **1,758** real rows.
    # `stackFor` in core/fonts.js falls back to the sans face for a variant that is not
    # shipped, which `arabic` and `telu` both already rely on.
    ("gujr", 400, False): "MuktaVaani-Regular.ttf",
    ("gujr", 700, False): "MuktaVaani-Bold.ttf",
    # Kannada, and **the first Brahmic script in this corpus to ship both halves of
    # the Noto pair.** The NULL MarkBasePos base-anchor defect that refused Noto for
    # Telugu (468 of 2,106), Gurmukhi (880 of 1,486) and Gujarati is simply absent
    # from Noto Sans Kannada: **0 NULL anchors of 667**, so the `applyLookup` case-4
    # path `vendor/fontkit.esm.js` crashes on cannot be entered at all. Over the
    # 123,760-akshara matrix (34 consonants x 13 vowel signs x {bare, anusvara,
    # visarga, candrabindu} x {no subjoined, each of the 34} x {no arkavattu, ರ್}) it
    # throws on 0 and draws 0 notdefs, and `PAIRS=1` over all 34^3 double conjuncts
    # plus every arkavattu-over-a-conjunct throws on 0 as well. 89 of 89 assigned
    # codepoints of U+0C80..0CFF, and **274** codepoints of U+0020..024F including
    # the whole of ASCII, `·` U+00B7 and `₹` -- so this is the Bengali case and needs
    # no `LATIN_DONOR` graft, unlike the Gurmukhi UI cut.
    #
    # **There is no `knda-serif`, and Noto Serif Kannada was measured, staged and
    # then withdrawn -- which is tmp/gujarati.md's lesson happening a second time and
    # costing more.** It holds **210 NULL base anchors of 1,451** and throws on **0**
    # of the 123,760 aksharas *and* 0 of the 40,460 double conjuncts, so both
    # matrices called it clean. Reading the lookup out with fontTools shows the NULL
    # class is `halant_kannada` **as a mark**, which is only reached when the virama
    # has no consonant to fuse with -- and the cube never contained a bare one,
    # because every virama in it was followed by a consonant.
    #
    # **Shaping the real rows found 2,593 throws of 30,659**, and the class is
    # a *subjoined* consonant carrying a **word-final virama** -- 1,120 of the 1,156
    # such pairs. That is the shape of every English loanword ending in a consonant
    # cluster, and modern Kannada is full of them: ಲಿಫ್ಟ್ *lift*,
    # ಆಂಬ್ಯುಲೆನ್ಸ್ *ambulance*, ಆಗಸ್ಟ್ *August*, ಫಿಟ್ಸ್ *fits*,
    # ಪ್ರಿಪೇಯ್ಡ್ *prepaid*. A throw in `core/measure.js` is a crash, not a bad
    # glyph, so this is a blocker rather than a defect. A single consonant plus a
    # virama shapes clean, and so does a subjoined consonant plus a vowel sign, which
    # is exactly why both matrices missed it -- **the harness to run on the next
    # Brahmic addition is `tmp/kn/throwrows.mjs` over real rows.**
    #
    # So Kannada ships **sans-only**, which is `telu`'s, `gujr`'s and `arabic`'s
    # shape, and `stackFor` in core/fonts.js falls back to the sans face for a
    # variant that is not shipped.
    #
    # What was refused, and on what: **Noto Sans Kannada UI** (43 codepoints of
    # U+0020..024F, no letter of either case, no `·` -- the graft Gurmukhi pays and
    # there is no reason to pay it when the non-UI face has no NULL anchors);
    # **Hubballi** (630 NULL anchors of 1,433, and a single weight); **Anek Kannada**
    # (upem 2000, 194 Latin codepoints, and the same confusable-pair measurement its
    # Telugu, Gurmukhi and Gujarati siblings failed); **Hind Mysuru** (the Kannada
    # member of the Hind superfamily `telu` ships -- real static Regular and Bold,
    # full Latin, zero throws, zero NULLs, and refused on coverage: 84 of 89 of the
    # block, missing the two Vedic signs, ಽ and ೞ/ಱ); **Tiro Kannada**, **Benne** and
    # **Padyakke Expanded One** (all real serifs with 0 NULL anchors, 0 throws over
    # the same 30,659 real rows and -- for Tiro Kannada -- only 6 notdefs, so **Tiro
    # Kannada is the replacement if the sans ever has to go**; all three are refused
    # as `knda-serif` only because they have no bold, so a stack built from one would
    # print the theme's weight distinction as none); **Baloo Tamma 2** (a heavy rounded display design); and **Akaya
    # Kanadaka** (2,600 throws and 30,290 notdefs -- it has no candrabindu glyph).
    # See tmp/kannada.md.
    ("knda", 400, False): "NotoSansKannada-var.ttf",
    ("knda", 700, False): "NotoSansKannada-var.ttf",
    # Malayalam, and **the first script in this corpus where *neither* half of the
    # Noto pair can be shipped.** This is Kannada's finding exactly inverted.
    #
    # **Noto Sans Malayalam and Noto Serif Malayalam throw on `ക്` -- a single
    # consonant plus a word-final chandrakkala -- which is how the majority of
    # Malayalam consonant-final words are spelt.** Same crash as Telugu's,
    # Gurmukhi's, Gujarati's and Noto Serif Kannada's: `getAnchor` reading
    # `.xCoordinate` off a NULL MarkBasePos base anchor in `vendor/fontkit.esm.js`,
    # which is a throw in `core/measure.js` rather than a bad glyph. Over the
    # 61,704-akshara matrix (36 consonants x {no subjoined, each of the 36} x 15
    # vowel signs x {bare, anusvara, visarga}, **plus a word-final chandrakkala on
    # every stem**, plus the six chillu letters against every consonant in both
    # orders) they throw on **52,001 and 51,967** -- 84% -- and `ഇഷ്ടം`, `ഉണ്ട്`
    # and `ടിക്കറ്റ്` are all among them. Reading the anchor table out with
    # fontTools names it: Noto Sans Malayalam has **227 NULL base anchors of 1,189**
    # whose mark class is U+0D3B/U+0D3C (the two Unicode 9.0 alternate viramas) plus
    # U+0952 and three Latin combining marks, and **Noto Serif Malayalam has a
    # second NULL class whose mark list includes `viramamlym` itself** -- Kannada's
    # `halant_kannada` in another script. The difference is that Malayalam *keeps* a
    # bare chandrakkala on the surface where Kannada mostly fuses it, so what was a
    # 26-sequence unwritable corner there is 84% of the script here.
    #
    # **So `mlym` is Manjari, and the argument is structural rather than
    # statistical**: **0 NULL base anchors of 461/462**, so the `applyLookup` case-4
    # path cannot be entered at all. 0 throws and 0 notdefs over the same 61,704
    # aksharas and over all 93,312 double conjuncts (36^3, each also with a
    # word-final chandrakkala). 118 of 118 assigned codepoints of U+0D00..0D7F, and
    # **260** codepoints of U+0020..024F including the whole of ASCII, `·` U+00B7
    # and `₹` -- so this is the Bengali case and needs no `LATIN_DONOR` graft. Real
    # static Regular and Bold, so the pair needs no instancing: the fourth stack
    # here of which that is true, after `arabic`, `telu` and `gujr`. OFL 1.1,
    # "Copyright 2018 The Manjari Project Authors", **no Reserved Font Name**, from
    # Swathanthra Malayalam Computing -- the face designed in Kerala. upem 2048,
    # which is the first non-1000 upem shipped here and is handled generally:
    # `core/measure.js` divides by `face.upem` and `render/pdf.js` by
    # `shaper.unitsPerEm`.
    #
    # **Manjari also settles the orthography question, and it is a font question
    # rather than an encoding one.** ക + ു is the same two codepoints in the
    # traditional and the reformed orthography; which one prints depends on whether
    # the face has the ligature. Measured over `കു കൂ രു ഗു ശു കൃ പ്ര`, one glyph
    # against two: Manjari, Gayathri and Chilanka give **one** -- the fused
    # traditional signs a Kerala street sign uses -- and Noto Sans/Serif/UI, Anek
    # and Baloo Chettan 2 give two, the reformed detached signs a phone keyboard's
    # default face draws. All nine ligate the common conjuncts (ക്ക ന്ന ണ്ട ത്ത
    # ല്ല ങ്ങ ഞ്ഞ മ്പ ന്ത സ്ഥ ക്ഷ ന്റ), so that is not where the split lives.
    #
    # **There is no `mlym-serif`**, which is `telu`'s, `gujr`'s, `knda`'s and
    # `arabic`'s shape: the only OFL Malayalam serif is Noto Serif Malayalam, which
    # is the blocker above. `stackFor` in core/fonts.js falls back to the sans face
    # for a variant that is not shipped.
    #
    # What was refused, and on what: **Gayathri** (0 NULLs, 0 throws, real Regular
    # and Bold, 117 of 118 -- and refused on `·` U+00B7, which it does not carry and
    # which `core/pack.js` joins the emergency numbers with, so it would be the
    # third stack here to need a `LATIN_DONOR` graft. **It is the replacement if
    # Manjari ever has to go**, and the graft is a solved problem); **Noto Sans
    # Malayalam UI** (43 codepoints of U+0020..024F, no letter of either case and no
    # `·` -- Gurmukhi's graft again, and no reason to pay it); **Anek Malayalam**
    # (upem 2000, 194 Latin codepoints, 2 NULL anchors on Latin combining marks, and
    # the same confusable-pair measurement its Telugu, Gurmukhi, Gujarati and
    # Kannada siblings failed); **Chilanka** (single weight, so the theme's bold
    # would print as regular, and a handwriting design besides); **Baloo Chettan 2**
    # (a heavy rounded display design, and 100 of 118 codepoints -- it lacks both
    # alternate viramas, three of the archaic chillu and the fraction signs).
    # See tmp/malayalam.md.
    ("mlym", 400, False): "Manjari-Regular.ttf",
    ("mlym", 700, False): "Manjari-Bold.ttf",
    # Ethiopic, and **the first script here whose Noto pair needed no argument at
    # all.** The NULL MarkBasePos base-anchor defect that refused Noto for Telugu,
    # Gurmukhi and Gujarati cannot arise: Ethiopic has no mark to attach except the
    # three combining signs U+135D..135F, which no Amharic text writes. Over the
    # 129,628-string matrix -- every assigned syllable singly, every syllable under
    # each of the three marks, all 24 punctuation and numeral signs, and every one of
    # the 358x358 ordered pairs -- both faces throw on **0** and draw **0** notdefs.
    # 358 of 358 assigned codepoints of U+1200..137F, and **283** of U+0020..024F
    # including the whole of ASCII, `·` U+00B7, `…`, `—`, `’` and `ä`, so this is the
    # Bengali case and needs no `LATIN_DONOR` graft.
    #
    # Abyssinica SIL was the third candidate and is refused on two counts, neither of
    # them drawing quality: it is **single-weight**, so the `script` field's bold
    # would fall back to 400 the way Constructium's does for tengwar, and its OFL
    # carries a **Reserved Font Name**, so a subset would have to be renamed. Its
    # upem is 2048 besides. See tmp/amharic.md.
    ("ethi", 400, False): "NotoSansEthiopic-var.ttf",
    ("ethi", 700, False): "NotoSansEthiopic-var.ttf",
    ("ethi-serif", 400, False): "NotoSerifEthiopic-var.ttf",
    ("ethi-serif", 700, False): "NotoSerifEthiopic-var.ttf",
    # Georgian, and a serif beside the sans because for once nothing refuses it.
    # Lao, Khmer, Telugu, Gujarati, Kannada and Malayalam all ship sans-only because
    # their serif candidate throws or diverges; Noto Serif Georgian does neither --
    # same zero divergences against HarfBuzz over the same 38,241-string cube, same
    # zero NULL anchors, same full ASCII. So the typeface control means something for
    # a Georgian sheet instead of silently falling back, which is the reason
    # `NotoSerifBengali` is fetched a few entries above.
    ("geor", 400, False): "NotoSansGeorgian-var.ttf",
    ("geor", 700, False): "NotoSansGeorgian-var.ttf",
    ("geor-serif", 400, False): "NotoSerifGeorgian-var.ttf",
    ("geor-serif", 700, False): "NotoSerifGeorgian-var.ttf",
    # Armenian, and **sans only**, which is Lao's, Khmer's, Telugu's, Gujarati's,
    # Kannada's and Malayalam's outcome reached for a new reason: Noto Serif Armenian
    # neither throws nor diverges -- 0 differences against HarfBuzz over the same
    # 67,696-string cube, 0 NULL anchors after `ARMN_EXCLUDE` -- it is **refused on
    # legibility at the floor**.
    #
    # Armenian has three minimal pairs that differ only by a foot or a tail on one
    # stem: դ/ղ, գ/զ and ը/ր. `tmp/hy/calibrate2.py` renders every letter at a
    # candidate floor and XORs each pair, the method every addition since Bengali has
    # used. At 4.4pt the two sans faces sit at **0.140 and 0.141**, better than Latin
    # at the same floor (O/Q, 0.126); the two serif faces sit at **0.060 and 0.057**,
    # which is Thai's 0.062 at 5.4 -- the most confusable script this project ships.
    # And raising the floor does not rescue them: at 5.0 they are 0.054 and 0.047, at
    # 5.4 0.078 and 0.080, at 6.0 0.089 and 0.091. `min_size_pt` is per *script* and
    # not per face, so shipping the serif would have pinned every Armenian sheet --
    # sans ones included -- to Devanagari's floor to protect a typeface option, which
    # is the defect summary.md's "Type size is not one multiplier" section describes.
    # A serif Armenian sheet therefore sets its Armenian in the sans, which
    # `core/fonts.js` already does by design.
    ("armn", 400, False): "NotoSansArmenian-var.ttf",
    ("armn", 700, False): "NotoSansArmenian-var.ttf",
}

# Sources that need a Latin face grafted in, and the face to graft.
#
# Noto Sans Arabic carries no Latin at all: nineteen codepoints in U+0020..U+024F,
# no letter of either case and no U+00B7. So `LATIN_RANGES` intersected with its
# cmap yielded nothing, the request silently succeeded with no glyphs, and every
# Latin character on an Arabic sheet drew glyph 0 -- which in Noto is a visible box,
# not a blank. The browser preview substituted a system font and hid it; the PDF
# embeds only the subset face and printed the boxes, including in the emergency
# numbers, which `core/pack.js` joins with U+00B7. Arabic is the only stack this
# happens to -- every other non-Latin family here ships the Noto Sans Latin subset.
#
# Merging is safe because these are one family: same units per em, same x-height
# and cap-height, and the Latin glyphs the two do share have identical outlines at
# identical widths, so the Latin lands on the Arabic baseline unscaled. The Arabic
# face is merged first, so its `hhea`/`OS/2` metrics and its `name` table win and
# the line box is unchanged.
# Noto Sans Gurmukhi UI is the second, read off the same `getBestCmap()`: 43
# codepoints of U+0020..024F -- the ASCII digits and punctuation and nothing else --
# so no letter of either case and no `·` U+00B7, which `core/pack.js` joins emergency
# numbers with. The *non*-UI Noto Sans Gurmukhi has 284 and would need no graft; it is
# the file that throws in the shaper, which is why the graft is the cheaper of the two
# costs. The donor is the variable Noto Sans, instanced to the same weight by
# `subset_source`, so this is one family again: same upem, same x-height, and the
# Latin the two do share has identical outlines.
LATIN_DONOR = {"NotoSansArabic-Regular.ttf": "NotoSans-Regular.ttf",
               "NotoSansArabic-Bold.ttf": "NotoSans-Bold.ttf",
               "NotoSansGurmukhiUI-var.ttf": "NotoSans-var.ttf",
               # Phetsarath carries **no Latin letter of either case** -- 35
               # codepoints of U+0020..024F, all ASCII punctuation and the digits --
               # and neither `·` U+00B7, which `core/pack.js` joins the emergency
               # numbers with, nor `₭` U+20AD, the kip sign, which is the currency of
               # the one country that speaks the language. So this is the largest
               # graft here and the third source to need one. The donor is a
               # *different family* rather than a sibling cut, unlike Noto Sans
               # Arabic's, so the em square really is rescaled: Phetsarath is 2048
               # units where Noto is 1000, and `scale_upem` is what makes that safe.
               "Phetsarath-Regular.ttf": "NotoSans-Regular.ttf",
               "Phetsarath-Bold.ttf": "NotoSans-Bold.ttf",
               # Khmer OS Content is Phetsarath's case exactly, read off the same
               # `getBestCmap()`: 35 codepoints of U+0020..024F -- the ASCII digits
               # and punctuation -- so **no Latin letter of either case** and no `·`
               # U+00B7, which `core/pack.js` joins the emergency numbers with. Every
               # Khmer candidate measured shares that cost; Battambang, Suwannaphum,
               # Nokora and Hanuman carry 98 codepoints and are also missing `·`
               # and `…`. A different family rather than a sibling cut, as with
               # Phetsarath, so the em square really is rescaled: Content is 2048
               # units where Noto is 1000, and `scale_upem` is what makes that safe.
               "Content-Regular.ttf": "NotoSans-Regular.ttf",
               "Content-Bold.ttf": "NotoSans-Bold.ttf"}

# The same graft in the other direction, for the two conscripts. No Noto face has a
# pIqaD or a tengwar glyph -- neither script is in Unicode -- so the four Latin
# stacks borrow them from Constructium, a fork of SIL Gentium that carries both under
# the same OFL 1.1 (no Reserved Font Name, so the subset may keep its own names).
#
# **Grafting into `latin` rather than giving each script a stack of its own is the
# decision worth recording, and it is the Greek argument, not a shortcut.**
# `scripts.csv` already routes `Grek` and `Cyrl` to `latin` because the Noto Sans
# faces draw them; `Piqd` and `Teng` route there too, once these glyphs are in it.
# A stack of their own would have cost eight more faces of ~85KB, because every one
# of them would still have had to carry the whole Latin repertoire: `literal` is
# read from the *target* row and is English on both packs, and the respelling column
# of a Klingon or Quenya *reader* is Latin as well. Worse, it would have doubled a
# Klingon sheet's font download -- the gloss, the romanisation and the IPA are all
# `latin`, so such a sheet would fetch both stacks where it now fetches one.
#
# **Constructium is also the only tengwar face that survives this project's PDF
# path, and that is a measurement.** Tengwar is an abugida: the vowel is a tehta
# riding on the consonant. pdf-lib's `encodeText` keeps only the glyph *ids* fontkit
# hands it and drops the GPOS offsets, so a mark has to land correctly on its own
# advance. Constructium draws its tehtar as zero-advance glyphs whose outlines are
# already offset back over the preceding tengwa (U+E040's bbox runs x -815..-215 at
# 2048/em), so they sit on the right letter with no positioning at all and GPOS only
# refines them. Alcarin Tengwar -- also OFL, and a better-drawn face -- puts its
# tehtar at x +20..+356 and relies entirely on a GPOS xOffset of about -0.5em: in
# the browser it is perfect and in the exported PDF every vowel would print one
# letter to the right of the consonant it belongs to. Alcarin also follows the Free
# Tengwar Project's codepoint assignment rather than CSUR's, which disagree at
# several letters, so the two are not interchangeable at all.
PUA_DONOR = "Constructium.ttf"

# Which language directories feed each stack's corpus-character union.
ALL_LANGS = ["en", "es", "fr", "de", "ko", "ar", "zh-Hans", "ja",
             "pt", "ru", "tr", "vi", "hi", "id", "sw", "th", "it", "el", "hu",
             # Klingon and Quenya, whose `text` is now pIqaD and tengwar. They still
             # belong in this union rather than in a stack of their own -- see
             # `PUA_DONOR` -- and they still need it for their romanised columns,
             # their section titles and their emergency-service labels, all of which
             # are Latin. Italian was left out of this list for a whole language
             # generation and only escaped a sheet of empty boxes because it is Latin
             # too, which is luck rather than design. Quenya brings the o-diaeresis
             # and the a-diaeresis, which no other pack writes.
             "tlh", "qya",
             # Hebrew, whose own stack is below. It is in this Latin union as well
             # because its section titles and emergency labels are Hebrew but its
             # corpus quotes `Wi-Fi`, `SIM` and `PIN` in Latin, and because the four
             # `latin` faces draw the romanisation and the IPA of every pair whose
             # target is Hebrew.
             "he",
             # Persian, whose own stack is `arabic` below. Here for the same reason
             # Hebrew is: the four `latin` faces draw its `romanization_bgn` column
             # and its `ipa` column on every pair whose target is Persian, and the
             # romanisation brings `ā ī ū ‘ ’` and the middle dot of `es·hāl`. Leaving
             # a language out of this list is the omission Italian shipped with for a
             # whole language generation and only survived because it is Latin.
             "fa",
             # Urdu, whose own stack is `arabic` too. Same reason again -- the four
             # `latin` faces draw its `romanization_bgn` and its `ipa` on every pair
             # whose target is Urdu, and the romanisation brings `ā ī ū ṭ ḍ ṛ ñ ’`,
             # of which `ṛ` U+1E5B and `ñ` are the two no earlier pack needed.
             "ur",
             # Bengali, whose own stack is `beng`. Here for the reason Hebrew,
             # Persian and Urdu are: the four `latin` faces draw its
             # `romanization_iso15919` and its `ipa` on every pair whose target is
             # Bengali, and that romanisation brings the underdots `ṭ ḍ ṇ ṛ ṣ` and
             # `ṁ`, whose candrabindu no earlier pack needed.
             "bn",
             # Polish, which needs no stack of its own -- `Latn` already routes to
             # `latin` -- but does need naming here, because a language left out of
             # this union is exactly the omission Italian shipped with. It brings
             # `ą ć ę ł ń ó ś ź ż`, of which the ogoneks and `ł` are new.
             "pl",
             # Ukrainian, also routed to `latin` via `Cyrl`. Named here for the
             # reason every language is -- one left out of this union is the omission
             # Italian shipped with -- and not because anything was missing: its four
             # letters Russian does not have, і ї є ґ, are already in all sixteen
             # `latin*.ttf` cmaps, and ₴ U+20B4, the hryvnia sign, arrives through the
             # Currency Symbols range at the top of this file rather than through any
             # corpus union, exactly as the shekel's ₪ does. Measured against the
             # shipped faces, not inferred: Persian's `پ چ ژ گ` result a second time.
             "uk",
             # Tamil, whose own stack is `taml`. Here for the reason Hebrew, Persian,
             # Urdu and Bengali are: the four `latin` faces draw its
             # `romanization_iso15919` and its `ipa` on every pair whose target is
             # Tamil, and that romanisation brings the underdots and underbars
             # `ṭ ṇ ṟ ṉ ḷ ḻ ṅ ñ ṣ ś` -- of which `ḻ` U+1E3B and `ṟ` U+1E5F are the
             # two no earlier pack needed. Leaving a language out of this list is the
             # omission Italian shipped with for a whole language generation.
             "ta",
             # Telugu, whose own stack is `telu`. Here for the reason Hebrew, Persian,
             # Urdu, Bengali and Tamil are: the four `latin` faces draw its
             # `romanization_iso15919` and its `ipa` on every pair whose target is
             # Telugu. What that romanisation brings that no earlier pack needed is
             # **`r̥`** -- `r` plus U+0325 COMBINING RING BELOW, ISO 15919's vocalic r,
             # which Telugu writes as ఋ/ృ. It is a *combining* mark rather than a
             # precomposed letter, so it arrives through `LATIN_RANGES`' U+0300..036F
             # block rather than through this union, and all sixteen `latin*.ttf`
             # cmaps already carry it -- measured, the way Persian's `پ چ ژ گ` and
             # Ukrainian's `і ї є ґ` were. The rest of the column (ā ī ū ē ō, ṭ ḍ ṇ ḷ
             # ṟ, ś ṣ, ṅ ñ, ṁ ḥ) is already drawn for Tamil, Bengali and Hindi.
             "te",
             # Marathi shares `hi`'s stack, `deva` -- Devanagari's own font question
             # was already answered when Hindi landed, and checked again rather than
             # assumed: ळ U+0933, ऱ U+0931 and ॲ U+0972/ऑ U+0911 (the candra vowels
             # Marathi uses for English loans) are all present in every shipped
             # `deva*.ttf` face, via `fontTools.ttLib.TTFont.getBestCmap()` -- the
             # Persian `پ چ ژ گ` result a third time. `DEVA_RANGES` below is the whole
             # Devanagari block requested unconditionally for the `deva` stack, so
             # this entry is only for the four `latin` faces, which draw Marathi's
             # `romanization_iso15919` and `ipa` columns and the occasional Latin
             # loan (`Wi-Fi`, `SIM`, `PIN`) in its section titles and emergency
             # labels, on every pair whose target is Marathi.
             "mr",
             # Dutch, routed to `latin` via `Latn` -- no stack of its own needed, and
             # this entry costs nothing further: checked rather than assumed, IJ/ij
             # (U+0132/U+0133), Dutch's one unusual letter, is present in every
             # shipped `latin*.ttf` face via `fontTools.ttLib.TTFont.getBestCmap()`.
             # No romanisation column either -- Latin-scripted already -- so this
             # entry is only for the language's own text, section titles and
             # emergency labels, the Polish/Ukrainian/Romanian shape.
             "nl",
             # Romanian, routed to `latin` via `Latn` -- no stack of its own needed.
             # Checked rather than assumed, the way Polish and Ukrainian were: ă â î
             # ș ț and their capitals (U+0103/00C2/00EE/0219/021B and uppercase) are
             # all present in every shipped `latin*.ttf`/`latin-cond*.ttf` cmap,
             # confirmed with `fontTools.ttLib.TTFont.getBestCmap()` against the
             # actual faces. â and î were already drawn for French; ă, ș and ț are
             # new codepoints but cost nothing further. No romanisation column
             # either -- Romanian is Latin-scripted already, so this entry is only
             # for the language's own text, section titles and emergency labels.
             "ro",
             # Czech, routed to `latin` via `Latn` -- no stack of its own needed.
             # Checked rather than assumed, the way Polish, Ukrainian and Romanian
             # were: á č ď é ě í ň ó ř š ť ú ů ý ž and their capitals are all present
             # in every shipped `latin*.ttf`/`latin-cond*.ttf` cmap, confirmed with
             # `fontTools.ttLib.TTFont.getBestCmap()` against the actual faces --
             # including the two checked hardest, ř U+0159/Ř U+0158 (caron on r,
             # which no earlier pack needed) and ů U+016F/Ů U+016E (ring above, also
             # new). No romanisation column either -- Czech is Latin-scripted
             # already -- so this entry is only for the language's own text, section
             # titles and emergency labels, the Polish/Ukrainian/Romanian shape.
             "cs",
             # Punjabi, whose own stack is `guru`. Here for the reason Hebrew,
             # Persian, Urdu, Bengali, Tamil and Telugu are: the four `latin` faces
             # draw its `romanization_iso15919` and its `ipa` on every pair whose
             # target is Punjabi. What that romanisation brings that no earlier pack
             # needed is **`ġ`** U+0121 for ਗ਼ -- g with a dot above, which arrives
             # precomposed and is in all sixteen `latin*.ttf` cmaps -- while `ṛ` for
             # ੜ, `ḷ` for ਲ਼, the underdots `ṭ ḍ ṇ`, `ś`, `ṁ` and the macrons
             # ā ī ū ē ō are already drawn for Tamil, Telugu, Bengali and Hindi, and
             # `x` for ਖ਼ is ASCII. Measured against the shipped faces rather than
             # inferred, the way Persian's `پ چ ژ گ`, Ukrainian's `і ї є ґ`, Marathi's
             # `ळ ऱ ॲ` and Czech's `ř ů` were.
             #
             # What the **`ipa`** column brings is the two Chao tone letters `˥` and
             # `˩`, and those cost nothing either: `th`, `vi` and `zh-Hans` already put
             # U+02B0..02FF in every Latin face through `LATIN_RANGES` at the top of
             # this file. Punjabi is the only tonal Indic language in the corpus and
             # its tone is free here for exactly that reason.
             "pa",
             # Filipino, routed to `latin` via `Latn` -- no stack of its own needed.
             # Checked rather than assumed, the way Polish, Ukrainian, Romanian and
             # Czech were: ñ/Ñ U+00F1/U+00D1 (this pack's own text mostly spells the
             # sound `ny`, but a proper name may still need bare ñ) and the peso sign
             # ₱ U+20B1 (numbers-money.peso-symbol, scoped `es;fil` -- a different
             # codepoint from the Latin American pesos' `$`) are both present in
             # every shipped `latin*.ttf`/`latin-cond*.ttf` cmap, confirmed with
             # `fontTools.ttLib.TTFont.getBestCmap()` against the actual faces. `ng`
             # is two ordinary ASCII letters and costs nothing. No romanisation
             # column either -- Filipino is Latin-scripted already, and has no
             # espeak voice (see `VOICES`' comment in build_ipa.py), so this entry
             # is only for the language's own text, section titles and emergency
             # labels, the Polish/Ukrainian/Romanian/Czech shape.
             "fil",
             # Swedish, routed to `latin` via `Latn` -- no stack of its own needed.
             # Checked rather than assumed, the way Polish, Ukrainian, Romanian,
             # Czech and Filipino were: å ä ö and their capitals (U+00E5/00C4/00F6
             # and uppercase) are all present in every shipped
             # `latin*.ttf`/`latin-cond*.ttf` cmap, confirmed with
             # `fontTools.ttLib.TTFont.getBestCmap()` against the actual faces --
             # ä and ö were already drawn for German's own text, å is the one
             # genuinely new codepoint and costs nothing further. No romanisation
             # column either -- Swedish is Latin-scripted already -- so this
             # entry is only for the language's own text, section titles and
             # emergency labels.
             "sv",
             # Gujarati, whose own script is `Gujr` with a stack of its own below. It
             # belongs in this union anyway, for the reason Bengali, Tamil, Telugu and
             # Punjabi do: the four `latin` faces draw its `romanization_iso15919` and
             # its `ipa` column on every pair whose target is Gujarati, and both are
             # Latin.
             "gu",
             # Malay, routed to `latin` via `Latn` -- no stack of its own needed and
             # no new codepoint at all: Malay uses plain ASCII Latin with no
             # diacritics whatsoever, confirmed by reading every row of the finished
             # pack rather than assumed, so nothing here was even worth measuring
             # with `fontTools.ttLib.TTFont.getBestCmap()` the way Dutch's IJ or
             # Swedish's å were -- there is no character to check. No romanisation
             # column either -- Latin-scripted already -- so this entry is only for
             # the language's own text, section titles and emergency labels, the
             # Polish/Ukrainian/Romanian/Czech/Filipino/Swedish shape.
             "ms",
             # Nepali shares `hi`'s and `mr`'s stack, `deva` -- Devanagari's own font
             # question was already answered twice and checked a third time rather
             # than assumed: every Devanagari codepoint Nepali's finished pack
             # actually uses (58 of them -- the independent vowels, the 33
             # consonants, the vowel signs, virama, candrabindu/anusvara/visarga and
             # the danda) is present in all four shipped `deva*.ttf` faces, via
             # `fontTools.ttLib.TTFont.getBestCmap()`. Nepali's inventory turned out
             # to be a *subset* of Hindi's rather than needing anything new: no
             # candra vowels (ऍ ऑ ॲ, which Marathi uses and standard Nepali
             # orthography does not, checked against real Nepali-language financial
             # press rather than assumed), no nukta series (Nepali does not use the
             # nukta at all, unlike Hindi), and no ळ (Marathi's retroflex lateral,
             # which Nepali does not write separately from ल). `DEVA_RANGES` below
             # already requests the whole Devanagari block unconditionally for the
             # `deva` stack, so this entry in the `latin` union is only for Nepali's
             # `romanization_iso15919` and `ipa` columns and the occasional Latin
             # loan (`Wi-Fi`, `SIM`, `PIN`) in its section titles and emergency
             # labels, the Marathi shape exactly.
             "ne",
             # Kannada. `KNDA_RANGES` below already requests the whole Kannada block
             # unconditionally for the `knda` stack, so this entry in the `latin`
             # union is only for Kannada's `romanization_iso15919` and `ipa` columns,
             # which are drawn by the Latin faces on every pair, and for the four
             # `note` rows that quote pinyin, Hepburn, Thai and Swahili in Latin
             # plus the `B2 · BPK · bakso` pork-code row. Telugu's and Gujarati's
             # shape exactly.
             "kn",
             # Amharic. `ETHI_RANGES` below requests the whole Ethiopic block
             # unconditionally for the `ethi` stack, so this entry in the `latin`
             # union is for the pack's `romanization_bgn` and `ipa` columns -- which
             # the Latin faces draw on every pair -- and for the one row that quotes
             # Latin, `common-signs.pork-code`. The romanisation is BGN/PCGN 1967 and
             # brings `ā ī ē` plus the modifier letters `ʼ` U+02BC and `ʽ` U+02BD,
             # all four of which arrive through `LATIN_RANGES` at the top of this
             # file rather than through this union.
             "am",
             # Malayalam. `MLYM_RANGES` below already requests the whole Malayalam
             # block unconditionally for the `mlym` stack, so this entry in the
             # `latin` union is only for Malayalam's `romanization_iso15919` and
             # `ipa` columns, which the Latin faces draw on every pair, and for the
             # four `note` rows that quote pinyin, Hepburn, Thai and Swahili in Latin
             # plus the `B2 · BPK · bakso` pork-code row. Telugu's, Gujarati's and
             # Kannada's shape exactly. The romanisation brings `ŭ` U+016D, ISO
             # 15919's mark for the samvrutokaram, which no other pack writes; it
             # arrives through `LATIN_RANGES` and both shipped Latin weights already
             # carry it, checked.
             "ml",
             # Lao. `LAO_RANGES` above already requests the whole Lao block
             # unconditionally for the `laoo` stack, so this entry in the `latin`
             # union is for the pack's `romanization_bgn` and `ipa` columns -- which
             # the Latin faces draw on every pair -- and for the rows that quote a
             # Latin acronym. Telugu's, Gujarati's, Kannada's, Amharic's and
             # Malayalam's shape exactly.
             #
             # What the romanisation brings is BGN/PCGN 1966's three accented
             # letters `é è ô` (U+00E9/U+00E8/U+00F4), every one of which is already
             # drawn for French, German and Portuguese. What the **`ipa`** column
             # brings is the Chao tone letters `˥ ˧ ˩ ˨`, and those cost nothing
             # either: `th`, `vi`, `zh-Hans` and `pa` already put U+02B0..02FF into
             # every Latin face through `LATIN_RANGES` at the top of this file.
             # Measured against the shipped faces rather than inferred, the way
             # Persian's `پ چ ژ گ`, Ukrainian's `і ї є ґ` and Punjabi's `ġ` were.
             "lo",
             # Khmer. `KHMR_RANGES` above already requests the whole Khmer block
             # unconditionally for the `khmr` stack, so this entry in the `latin`
             # union is for the pack's `ipa` column -- which the Latin faces draw on
             # every pair -- and for the rows that quote a Latin acronym (`ATM`,
             # `SIM`, `Wi-Fi`, `PIN`, `QR`, all of which Cambodia writes in Latin).
             # Lao's, Malayalam's, Kannada's, Gujarati's and Telugu's shape exactly.
             #
             # The `ipa` column adds **no codepoint any shipped Latin face lacks**,
             # and that is the deliberate result of two notation choices rather than
             # luck: Khmer's palatal stops are written `tɕ`/`tɕʰ` rather than `c`/`cʰ`
             # and `ប`/`ដ` are written `b`/`d` rather than `ɓ`/`ɗ`, both chosen on
             # reader-table cost -- `ɓ` has a rule in no reader table at all. Khmer is
             # also not tonal, so unlike Thai, Lao, Vietnamese, Mandarin and Punjabi
             # it brings no Chao tone letter. There is no romanisation column: see
             # tmp/registry-km.md for why `geodept` carries no diacritic, and
             # tmp/km/buildpack.py for why the cells are empty rather than derived.
             "km",
             # Croatian, which needs no stack of its own -- `Latn` already routes to
             # `latin` -- but does need naming here, for Polish's and Italian's
             # reason: a Latin language left out of this union is the omission
             # Italian shipped with for a whole language generation and survived only
             # by luck.
             #
             # **And it costs the union nothing, which was measured rather than
             # assumed.** Gaj's alphabet is `č ć š ž đ` plus the digraphs `dž lj nj`,
             # and every one of those letters is already requested: `č š ž` by Czech,
             # `ć` by Polish, `đ` by Vietnamese, and the digraphs are two ordinary
             # letters each. The `ipa` column adds nothing either -- `REPAIR["hr"]`
             # folds Croatian's allophones down to five vowels and one rhotic, so the
             # column's whole repertoire is `ɕ ɡ ɲ ʃ ʎ ʑ ʒ ˈ ː`, all of which older
             # packs already need. Checked against the cmap of all sixteen shipped
             # Latin faces over every cell of the pack, both registry files and the
             # `Đđ` badge: nothing is absent from any of them. There is no
             # romanisation column, Croatian being Latin already.
             "hr",
             # Georgian. `GEOR_RANGES` above already requests the whole Mkhedruli
             # block unconditionally for the `geor` stack, so this entry in the
             # `latin` union is for the pack's `romanization_national` and `ipa`
             # columns -- which the Latin faces draw on every pair whose target is
             # Georgian -- and for the rows that quote a Latin acronym (`eSIM`,
             # `QR`, `B2 · BPK · bakso`, and the romanised Japanese numerals in the
             # two `number-and-classifier-notes` rows). Khmer's, Lao's, Malayalam's,
             # Kannada's, Gujarati's and Telugu's shape exactly.
             #
             # **And it costs the union nothing, measured against the cmaps of all
             # sixteen shipped Latin faces rather than assumed.** The romanisation
             # is the Georgian national (2002) system, which is deliberately
             # diacritic-free -- see the `ka` row of registry/romanizations.csv --
             # so the column is bare ASCII. The `ipa` column's only characters
             # outside older packs' repertoire are the ejective marker `ʼ` U+02BC,
             # already requested by Amharic, and `ʁ q χ`, already requested by
             # Arabic, Persian and German.
             "ka",
             # Armenian. `ARMN_RANGES` above already requests the whole Armenian
             # block unconditionally for the `armn` stack, so this entry in the
             # `latin` union is for the pack's `romanization_bgn` and `ipa` columns --
             # which the Latin faces draw on every pair whose target is Armenian --
             # and for the rows that quote Latin on a sign: `Wi-Fi`, `WC`,
             # `QR կոդով`, `SIM քարտ`, `eSIM`, `Tax Free`, `PIN կոդ` and
             # `B2 · BPK · bakso`. Georgian's, Khmer's, Lao's and Malayalam's shape
             # exactly.
             #
             # **And it costs the union one character, measured against the cmaps of
             # all sixteen shipped Latin faces rather than assumed.** The romanisation
             # is BGN/PCGN 1981 (re-validated November 2022), whose only non-ASCII
             # character is the aspirate mark `’` **U+2019**, named in note 6 of that
             # document -- not U+02BC, which is what Amharic's `romanization_bgn` and
             # Georgian's ejectives use. It arrives through `LATIN_RANGES`' General
             # Punctuation block and is in every shipped Latin cmap, checked. The
             # `ipa` column brings nothing new at all: espeak's `ʀ` is folded to `ʁ`
             # and its `χ` to `x` before the column is written, which is Persian's
             # `q1` -> `q` decision for Persian's reason -- a new IPA symbol costs
             # every one of the other forty-eight reader tables a rule.
             "hy",
             # Finnish, which needs no stack of its own -- `Latn` already routes to
             # `latin` -- but does need naming here, for Polish's, Croatian's and
             # Italian's reason: a Latin language left out of this union is the
             # omission Italian shipped with for a whole language generation and
             # survived only by luck.
             #
             # **And it costs the union nothing, measured rather than assumed.** The
             # whole pack including its `ipa` column, both registry files, the `Yö`
             # badge, the section titles, the emergency labels and the reader table's
             # legend come to **86 distinct codepoints**, of which fourteen are
             # non-ASCII: `Ä ä ö` (already requested by German and Swedish), `š`
             # (Czech and Croatian; Finnish orthography uses the caron letters for
             # the postalveolars itself), `ž` (Czech), `€` (already in
             # `LATIN_RANGES`' Currency Symbols block), and the eight IPA characters
             # `æ ø ŋ ɡ ʃ ˈ ˌ ː`, every one of which older packs already need. In the
             # cmap of all sixteen shipped `latin*.ttf` faces, checked with
             # `getBestCmap()` in tmp/fi/fontcheck.py -- **0 of 86 missing**. `å` is
             # in the Finnish alphabet and in no row of the pack: it is there for
             # Swedish proper names, so it arrives through Swedish's own entry.
             #
             # That the `ipa` column brings nothing new is a consequence of two
             # repairs rather than luck: `REPAIR["fi"]` folds espeak's
             # stress-conditioned `ɪ` back to `i` and its `q` to `k`, and
             # `GEMINATE_DOUBLES` turns its `Cː` into `CC`. There is no romanisation
             # column, Finnish being Latin already.
             #
             # **One knock-on, and it is in another stack.** Finnish as a *target*
             # grows the Korean reader's respelling charset by thirteen Hangul
             # syllables, two of which -- `룜` (paljon) and `얫` (jättää, Jättäkää) --
             # are outside the KS X 1001 rows `cjk-kr` requests below, so the
             # Korean faces cannot draw them today. `respell_chars` unions
             # `charset.json` into each stack, so one run of `npm run
             # respell:charset` followed by this script closes it; until then
             # `tests/fonts.test.mjs` cannot see it either, because the shipped
             # charset has no `fi` key. Bengali did the same thing to the Hindi
             # reader's `deva` subset.
             "fi"]
STACK_LANGS = {"latin": ALL_LANGS, "latin-cond": ALL_LANGS,
               "latin-serif": ALL_LANGS, "latin-cond-serif": ALL_LANGS,
               "cjk-sc": ["zh-Hans"], "cjk-sc-serif": ["zh-Hans"],
               "cjk-jp": ["ja"], "cjk-jp-serif": ["ja"],
               "cjk-kr": ["ko"], "cjk-kr-serif": ["ko"],
               # Persian shares the stack with Arabic because `scripts.csv` gives it
               # the same `Arab` row -- measured, see tmp/persian.md -- so the corpus
               # union has to name both or the Persian rows, section titles and
               # emergency labels are outside it. The *ranges* below already cover
               # پ چ ژ گ ک ی and the Eastern Arabic-Indic digits: `ARABIC_RANGES` is
               # the whole standard repertoire and not a corpus union, which is why
               # Persian needed no font change for its four extra letters.
               # Urdu joins for the same reason, and its script decision is in
               # tmp/urdu.md: it reuses `Arab` at Naskh because Nastaliq cannot be
               # shaped by the fontkit this project measures and prints with -- 84
               # of 86 real Urdu rows throw on Noto Nastaliq Urdu's NULL cursive
               # anchors -- and because an honest Nastaliq `leading_factor` is 2.80
               # against Arabic's 1.30. `ARABIC_RANGES` already covers ٹ ڈ ڑ ھ ہ ں
               # ے, measured against both shipped cmaps, so Urdu needs no font
               # change either.
               "arabic": ["ar", "fa", "ur"], "thai": ["th"], "thai-serif": ["th"],
               "laoo": ["lo"],
               "khmr": ["km"],
               "deva": ["hi"], "deva-serif": ["hi"],
               "beng": ["bn"], "beng-serif": ["bn"],
               "taml": ["ta"], "taml-serif": ["ta"],
               "telu": ["te"],
               "guru": ["pa"], "guru-serif": ["pa"],
               "gujr": ["gu"],
               "knda": ["kn"],
               "mlym": ["ml"],
               "ethi": ["am"], "ethi-serif": ["am"],
               "geor": ["ka"], "geor-serif": ["ka"],
               "armn": ["hy"],
               "hebrew": ["he"], "hebrew-serif": ["he"]}


def expand(ranges):
    return {cp for lo, hi in ranges for cp in range(lo, hi + 1)}


def legacy_charset(codec, lead_range, trail_range):
    """Enumerate a legacy CJK encoding to get its common-character set."""
    chars = set()
    for lead in lead_range:
        for trail in trail_range:
            try:
                chars.add(ord(bytes([lead, trail]).decode(codec)))
            except (UnicodeDecodeError, ValueError):
                pass
    return chars


def corpus_chars(langs):
    """Every codepoint the shipped data uses, so nothing in the corpus is tofu.

    The section titles and the emergency-service labels live in subdirectories of
    `data/registry`, which a flat glob missed entirely. Thirty Korean and Chinese
    section titles are separated by U+30FB, a codepoint only the Japanese stack
    happened to carry -- so those headings drew a row of boxes in the PDF, where
    unlike the browser there is no system font to fall back to.
    """
    chars = set()
    patterns = [f"data/lang/{code}/*.csv" for code in langs]
    # The per-language registry files are scoped the same way `data/lang` is: a
    # Korean section title only ever renders in the Korean stack, so unioning all
    # sixteen into every face would only pay for glyphs no sheet can ask for.
    patterns += [f"data/registry/section-titles/{code}.csv" for code in langs]
    patterns += [f"data/registry/emergency-labels/{code}.csv" for code in langs]
    patterns += ["data/respell/overrides/*.csv", "data/registry/*.csv",
                 "data/concepts/*.csv"]
    for pattern in patterns:
        for path in glob.glob(str(ROOT / pattern)):
            with open(path, encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    for value in row.values():
                        chars.update(ord(c) for c in (value or ""))
    return chars


def respell_chars(langs):
    """Every character the respelling rule tables can put on a page, per reader.

    `corpus_chars` is the right rule for every other field and the wrong one for
    this column: a generated respelling is computed at load time from the target's
    `ipa` column and a rule table, so it appears in no CSV. Korean is the sharp
    case -- the Hangul subset below is the ~2,350 KS X 1001 syllables, and the
    Korean table asks for 39 outside them, which in the PDF is a box. The English
    table needs it too: capitalising a syllable whose IPA had no rule produces
    Latin Extended-C letters like U+2C6F, which no range here covers.

    Regenerate `charset.json` with `npm run respell:charset`; `npm run check`
    fails if it is stale, and it is built from the *published* tables only.
    """
    with open(ROOT / "data/respell/charset.json", encoding="utf-8") as fh:
        by_source = json.load(fh)
    chars = set()
    for code in langs:
        chars.update(ord(c) for c in by_source.get(code, ""))
    return chars


def coverage(stack):
    chars = expand(LATIN_RANGES) | corpus_chars(STACK_LANGS[stack])
    # The respelling column is set in the *reader's* script, so a stack carries the
    # tables of the languages it draws -- the same scoping `corpus_chars` uses.
    chars |= respell_chars(STACK_LANGS[stack])
    if stack.startswith("latin"):
        chars |= expand(LATIN_EXTRA_RANGES) | expand(PIQAD_RANGES) | expand(TENGWAR_RANGES)
    if stack in ("latin-cond", "latin-serif", "latin-cond-serif"):
        return chars
    if stack in ("cjk-sc", "cjk-sc-serif"):
        # GB2312 level 1: the ~3.7k characters of everyday written Chinese.
        chars |= expand(CJK_PUNCT) | legacy_charset("gb2312", range(0xB0, 0xD8), range(0xA1, 0xFF))
    elif stack in ("cjk-kr", "cjk-kr-serif"):
        # All 11,172 Hangul syllables would be gratuitous; the KS X 1001 Hangul
        # rows are the ~2,350 in everyday use, the same trick GB2312 does for
        # Chinese. The rows above those are Hanja, and they are deliberately left
        # out: Korean signage and travel language are Hangul, the corpus uses no
        # Hanja at all, and including them cost 6,000 glyphs and a megabyte of
        # woff2 per weight -- which a reader pays for when saving the pack offline.
        chars |= expand(CJK_PUNCT) | expand(HANGUL_JAMO)
        chars |= legacy_charset("euc_kr", range(0xB0, 0xC9), range(0xA1, 0xFF))
    elif stack in ("cjk-jp", "cjk-jp-serif"):
        chars |= expand(CJK_PUNCT) | expand(KANA)
        chars |= legacy_charset("euc_jp", range(0xB0, 0xD0), range(0xA1, 0xFF))
    elif stack == "arabic":
        chars |= expand(ARABIC_RANGES)
    elif stack.startswith("thai"):
        chars |= expand(THAI_RANGES)
    elif stack.startswith("laoo"):
        chars |= expand(LAO_RANGES)
    elif stack.startswith("khmr"):
        chars |= expand(KHMR_RANGES)
    elif stack.startswith("deva"):
        chars |= expand(DEVA_RANGES)
    elif stack.startswith("beng"):
        chars |= expand(BENG_RANGES)
    elif stack.startswith("taml"):
        chars |= expand(TAML_RANGES)
    elif stack.startswith("telu"):
        chars |= expand(TELU_RANGES)
    elif stack.startswith("gujr"):
        chars |= expand(GUJR_RANGES)
    elif stack.startswith("guru"):
        chars |= expand(GURU_RANGES)
    elif stack.startswith("knda"):
        chars |= expand(KNDA_RANGES)
    elif stack.startswith("mlym"):
        chars |= expand(MLYM_RANGES)
    elif stack.startswith("ethi"):
        chars |= expand(ETHI_RANGES)
    elif stack.startswith("hebrew"):
        chars |= expand(HEBREW_RANGES)
    elif stack.startswith("geor"):
        chars |= expand(GEOR_RANGES)
    elif stack.startswith("armn"):
        chars |= expand(ARMN_RANGES)
        chars -= ARMN_EXCLUDE
    return chars


# Sources whose AAT tables are kept through the subset. @see aat_tables
#
# **Phetsarath has `morx` and `feat` too and is deliberately not here**, which is the
# half of this decision that needed measuring. Lao does not need the repair: against
# the browser its subset is already exact -- 0.03% aggregate over its 824 cells,
# unchanged with the tables and without them -- so keeping them buys nothing, and it
# costs something real. Every one of those 824 glyph runs changes when fontkit shapes
# Lao through AAT instead of OpenType, and Phetsarath was *chosen* on its OpenType
# behaviour: tmp/lao.md's argument is that it does the U+0EB3 decompose-and-reorder
# entirely in GSUB `rlig` with no GPOS at all, which is why preview and export agree
# by construction where every Noto Lao face disagrees. Moving a shipped language onto
# a different shaping path with no measured gain would throw that argument away.
AAT_SOURCES = {"Content-Regular.ttf", "Content-Bold.ttf"}


def aat_tables(font, source=None):
    """A font's AAT `morx`/`feat` as raw bytes, or `{}`.

    **fontkit prefers AAT over OpenType whenever a font has a `morx` table**, and
    `fontTools.subset` cannot subset one, so it drops it with a warning -- which
    silently moves the shaper out from under us. Khmer OS Content is the one source
    here that ships both, and dropping its `morx` is what put fontkit on its
    OpenType path, where the chain-context *backtrack* defect recorded in
    tmp/khmer.md section 2 mis-measures 11 of 17 probe clusters by up to 0.2832em
    against HarfBuzz -- `ម៉ា`, `ថ្នា`, `ន្មា`, `កោ`, `កៅ`, `កើ`, and the whole of
    `ម៉ោងប៉ុន្មាន` 20.6% too wide. Since Khmer is in `BREAKS_ANYWHERE` the solver
    cuts it into one atom per cluster and `render/svg.js` draws each atom at an x the
    measurer chose, so that surplus printed as **white space inside words** on half
    the pack. Keeping the table takes it to zero.

    This is also the answer to why the font hunt in tmp/khmer.md section 4 measured
    Content as exact over 260,015 clusters: it measured the *donor*, which still had
    `morx`, so fontkit never entered its OpenType path there at all. Lao's rule --
    measure the subset you ship, not the upstream face -- with the Myanmar lesson on
    top of it: a clean comparison is only evidence once the shaper being exercised is
    the one the shipped file will use.

    Carried as **bytes** rather than as the parsed table because the binary
    references glyph *ids* while fontTools' object model references glyph *names*,
    and the two halves of the build treat those differently: `retain_gids` keeps the
    ids through the subset, and `Merger` keeps the ids through the Latin graft but
    renames the unencoded glyphs, so re-attaching the parsed table fails on
    `uni17C4.zz01` while the bytes stay valid.
    """
    if source is not None and source not in AAT_SOURCES:
        return {}
    return {tag: font.getTableData(tag) for tag in ("morx", "feat") if tag in font}


def put_aat(font, saved):
    """Re-attach what `aat_tables` saved. @see aat_tables"""
    for tag, data in saved.items():
        table = DefaultTable(tag)
        table.data = data
        font[tag] = table


def subset_source(source, stack, weight, chars):
    """One source file, instanced to `weight` and cut down to `chars`."""
    font = TTFont(SRC / source, fontNumber=0)
    aat = aat_tables(font, source)
    if "fvar" in font:
        axes = {"wght": weight}
        # Pin every axis the font has. Leaving one free keeps fvar and gvar alive,
        # and subsetting a partially-instanced variable font trips over glyphs that
        # gvar never carried.
        if "wdth" in {a.axisTag for a in font["fvar"].axes}:
            axes["wdth"] = CONDENSED_WDTH if stack.startswith("latin-cond") else NORMAL_WDTH
        # **`updateFontNames` needs a STAT table with axis *values* in it, and one
        # shipped source does not have one.** Noto Sans Gurmukhi UI declares its two
        # axes in `DesignAxisRecord` and ships an empty `AxisValueArray`, which is
        # legal enough for a shaper and makes `instancer` raise
        # `ValueError: Cannot update name table since there are no STAT Axis Values`.
        # Asking for the rename only when it can be answered is the whole fix: the
        # face then keeps the family's own style name for both weights, which is
        # cosmetic -- `core/fonts.js` and `manifest.json` key on the *file* name, and
        # nameIDs 0, 13 and 14 (the copyright and the licence, which are the records
        # the OFL cares about) are untouched either way.
        stat = font.get("STAT")
        named = bool(stat and getattr(stat.table, "AxisValueArray", None))
        instancer.instantiateVariableFont(font, axes, inplace=True, updateFontNames=named)

    options = subset.Options()
    options.layout_features = ["*"]      # keep GSUB/GPOS so fontkit can shape
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.drop_tables += ["DSIG"]
    options.recalc_bounds = True
    # Strip TrueType hinting. It only affects low-resolution screen rasterisation,
    # which never applies to a 600dpi print, and it also matters for correctness:
    # fontkit's subsetter -- the one pdf-lib calls when embedding -- silently drops
    # glyphs that carry instructions, so a hinted face loses most of its Latin in
    # the exported PDF. Also makes the files meaningfully smaller.
    options.hinting = False
    # An AAT source keeps every glyph and every glyph id, because `morx` names ids
    # and a dropped slot would leave it pointing at the wrong glyph. It costs nothing
    # worth counting: Content has 696 glyphs and the character request already keeps
    # 695 of them.
    if aat:
        options.retain_gids = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=chars & set(font.getBestCmap()),
                       glyphs=list(font.getGlyphOrder()) if aat else [])
    subsetter.subset(font)
    put_aat(font, aat)
    return font


def merge_donor(font, donor):
    """`font` with `donor`'s glyphs, cmap and layout rules added to it.

    `Merger` reads from files, so both halves go through a buffer rather than the
    filesystem. It stamps `head.created` with the current time, which would put
    the churn the pinned timestamps exist to prevent straight back; the primary
    face's value carries over instead.
    """
    created = font["head"].created
    # `Merger` copies outlines verbatim, so the two halves have to agree on the em
    # square or the donor's glyphs come out at the wrong size. Noto and Constructium
    # do not: 1000 against 2048. `scale_upem` rewrites `glyf`, `hmtx` and the GPOS
    # values together, which is the whole reason the graft is possible at all.
    if donor["head"].unitsPerEm != font["head"].unitsPerEm:
        scale_upem(donor, font["head"].unitsPerEm)
    buffers = []
    for half in (font, donor):
        buf = io.BytesIO()
        half.save(buf)
        buf.seek(0)
        buffers.append(buf)
    merged = Merger().merge(buffers)
    merged["head"].created = created
    return merged


def add_copyright(font, credit):
    """Append a donor's copyright notice to every record of the font's own nameID 0.

    Every record, because the name table can hold the same string once per platform
    and a reader may consult either. Appending rather than replacing: the primary
    face's outlines are still most of the file.
    """
    table = font["name"]
    for record in table.names:
        if record.nameID != 0:
            continue
        own = record.toUnicode()
        if credit in own:
            continue
        record.string = f"{own}  {credit}"


def build_face(stack, weight, italic, source, chars):
    font = subset_source(source, stack, weight, chars)
    # `Merger` drops the tables it does not know how to merge, so they are held here
    # and put back after the graft. @see aat_tables
    aat = aat_tables(font)
    # At most one graft per face, and which one follows from the stack: a Latin face
    # borrows the two conscript blocks, a face of a family that ships no Latin
    # borrows Latin, and no face here needs both.
    donor = PUA_DONOR if stack.startswith("latin") else LATIN_DONOR.get(source)
    if donor:
        # Only the codepoints the primary face is missing. Taking the overlap too
        # would store nineteen glyphs twice and let the donor's Latin reading of
        # U+204F and U+2E41 -- reversed semicolon and comma, which Arabic draws the
        # other way round -- compete in the merged cmap for no gain.
        donor_font = subset_source(
            donor, stack, weight, chars - set(font.getBestCmap()))
        credit = donor_font["name"].getDebugName(0)
        font = merge_donor(font, donor_font)
        # **The graft moves outlines, so it has to move the copyright with them.**
        #
        # The OFL asks that a redistributed copy carry the notice, and a font carries
        # its own: nameID 0. Grafting Constructium's conscript blocks into the Latin
        # faces put Kreative Software's outlines inside a file whose notice named only
        # the Noto authors, which is a licence gap rather than an oversight to tidy
        # later. Both donors used here are OFL and neither declares a Reserved Font
        # Name, so nothing else about the merge needs permission -- only the credit.
        if credit:
            add_copyright(font, credit)
        put_aat(font, aat)

    # Pad every glyph out to a four-byte boundary.
    #
    # fontkit -- the subsetter pdf-lib calls on the way into a PDF -- copies glyph
    # data verbatim and then, if the subset it produced is small enough for the
    # short `loca` format, halves every offset to store it. Halving an odd offset
    # truncates it, and every glyph after that point is read from one byte off: the
    # exported PDF loses most of its type while the on-screen preview, which reads
    # the woff2 through the browser, stays perfect. fontTools only aligns glyph data
    # when it is writing short `loca` itself, so a face large enough to need the
    # long format -- which the Latin ones became when they took on Cyrillic --
    # silently starts producing broken PDFs. Four-byte alignment costs about 3KB a
    # face and makes the halving lossless whichever format fontkit picks.
    if "glyf" in font:
        font["glyf"].padding = 4

    # Pin the head table's timestamps. fontTools stamps the current time on save,
    # which made every one of the ~50 committed faces show as modified on every
    # run -- about 7MB of churn for no change at all -- and broke the invariant
    # that identical input produces identical output. 2026-01-01, matching the
    # pinned date in prerender_packs.mjs; the epoch here is 1904-01-01.
    # recalcTimestamp has to go too, or save() overwrites what we just set.
    # `created` is left as upstream set it -- it is already stable, and it is the
    # only provenance the file itself carries.
    font.recalcTimestamp = False
    font["head"].modified = PINNED_DATE

    stem = f"{stack}-{weight}{'i' if italic else ''}"
    OUT.mkdir(parents=True, exist_ok=True)
    ttf = OUT / f"{stem}.ttf"
    font.flavor = None
    font.save(ttf)
    font.flavor = "woff2"
    font.save(OUT / f"{stem}.woff2")
    font.close()

    built = TTFont(ttf)
    glyphs = len(built.getGlyphOrder())
    notice = built["name"].getDebugName(0) or ""
    return {
        "stack": stack, "weight": weight, "italic": italic, "file": stem,
        "glyphs": glyphs,
        "ttfBytes": ttf.stat().st_size,
        "woff2Bytes": (OUT / f"{stem}.woff2").stat().st_size,
        "source": source,
        # Consumed by the manifest's roll-up and then dropped from the face entry,
        # where it would be the same few strings repeated fifty times.
        # Split on the double space `add_copyright` joins with, and collapse the
        # internal whitespace: Constructium's own notice contains a newline, which
        # would otherwise put a line break inside a JSON string in the manifest.
        "copyright": [" ".join(part.split()) for part in notice.split("  ") if part.strip()],
    }


def main():
    if not SRC.exists():
        print("run scripts/fetch_fonts.py first", file=sys.stderr)
        return 1
    cache = {}
    faces = []
    for (stack, weight, italic), source in FACES.items():
        chars = cache.setdefault(stack, coverage(stack))
        face = build_face(stack, weight, italic, source, chars)
        faces.append(face)
        print(f"  {face['file']:<14} {face['glyphs']:>5} glyphs  "
              f"ttf {face['ttfBytes']//1024:>5} KB  woff2 {face['woff2Bytes']//1024:>4} KB")

    # Every donor here is OFL 1.1 and each shipped face carries its own notices in its
    # name table, which is where the licence actually asks for them. This is the
    # human-readable roll-up, gathered from the faces rather than hardcoded, so a new
    # donor cannot be added without appearing here.
    notices = set()
    for face in faces:
        notices.update(face.pop("copyright", []))

    manifest = {
        "license": "SIL Open Font License 1.1",
        "copyright": sorted(notices),
        "note": "Generated by scripts/subset_fonts.py. Do not edit.",
        "faces": faces,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    total = sum(f["woff2Bytes"] for f in faces)
    print(f"data/fonts/manifest.json  ({total//1024} KB of woff2 total)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
