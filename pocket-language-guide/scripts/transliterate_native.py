#!/usr/bin/env python3
"""Write the native-script `text` column for Klingon and Quenya.

  python3 scripts/transliterate_native.py            rewrite the two packs
  python3 scripts/transliterate_native.py --check    fail if any cell is stale

**These two packs run the other way round from every other one.** Elsewhere the
corpus authors a language's own writing in `text` and a romanisation beside it;
here every source publishes the *romanisation* and nothing else. TKD prints
Klingon in Okrand's Latin transcription; Appendix E, the Etymologies, the Plotz
letter and Eldamo all print Quenya in Tolkien's. Nobody publishes a lexicon in
pIqaD or in tengwar. So `romanization_okrand` and `romanization_appendix-e` are
the attested cells and `text` is *derived* from them by this script -- which is why
it exists rather than the transliteration having been done once by hand: a native
cell is a claim about a transliteration scheme, and a claim a script re-derives is
one nobody can quietly break.

The two schemes are not comparable in how much they assert.

**pIqaD is a relabelling.** The CSUR block encodes exactly TKD's own letters, one
codepoint per letter, including the case-significant pairs -- `q` U+F8DF against
`Q` U+F8E0, and `D` `H` `I` `S` as consonants and vowels in their own right -- so
the mapping is a bijection and carries no editorial content at all. A pIqaD cell is
as attested as the Latin cell it came from.

**Tengwar is a reconstruction, and `provenance` marks it as one.** Tengwar is an
abugida whose letter values depend on the mode, and no published source writes any
of these 206 phrases in tengwar. What *is* published is the mode: Appendix E plus
the two Namárië manuscripts (DTS 20, DTS 55), read here through Björkman's
*Amanye Tenceli* survey of the classical mode. Where the survey leaves a choice
open it is resolved toward what the manuscripts do rather than toward what
Appendix E permits; each such choice is commented at the rule that makes it.

Neither pack's punctuation is transliterated. `{}` is the engine's open-slot
marker, `/` separates two alternatives and `-` marks a verb stem or a bound
suffix: those are this project's editorial furniture rather than the language's,
and a tengwar pusta beside an ASCII question mark reads worse than plain ASCII
throughout.
"""
import argparse
import csv
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


# ------------------------------------------------------------------- pIqaD
# ConScript Unicode Registry, Klingon block U+F8D0..U+F8FF, revised 2004-01-15:
# https://www.evertype.com/standards/csur/klingon.html
#
# Case-significant, because TKD's orthography is: `q` and `Q` are different
# consonants and `I` is the vowel where `i` is not a letter of the language at all.
# That is the same fact `data/respell/rules/tlh__tlh-TA.json` records about the
# reader table, and here it is the reason the tokeniser must not fold case.
#
# The digits U+F8F0..U+F8F9 are deliberately unused. No Klingon cell holds a digit
# -- the numbers section spells `wa'`, `cha'`, `wej` -- and a digit that did reach
# the column would be an Arabic numeral a reader can act on, where the pIqaD form is
# a shape nobody outside the KLI can read off a card in a hurry.
#
# `ngh` is the one sequence longest-match gets wrong, and the syllable canon is what
# settles it. Greedily it reads as `ng` + a bare `h`, which is not a letter of the
# language at all; the only other parse is `n` + `gh`, and that is also the only
# legal one, since a Klingon onset holds exactly one consonant and `ngh` is not one.
# It reaches `Hanghuq`, Okrand's Klingon for Korea, and `TLH` in
# `scripts/build_ipa.py` carries the identical entry for the identical reason.
PIQAD = {
    "ngh": "",
    "a": "", "b": "", "ch": "", "D": "", "e": "",
    "gh": "", "H": "", "I": "", "j": "", "l": "",
    "m": "", "n": "", "ng": "", "o": "", "p": "",
    "q": "", "Q": "", "r": "", "S": "", "t": "",
    "tlh": "", "u": "", "v": "", "w": "", "y": "",
    "'": "",
}
PIQAD_KEYS = sorted(PIQAD, key=len, reverse=True)


# ------------------------------------------------------------------ tengwar
# CSUR Tengwar block U+E000..U+E07F, revised 1998-01-10:
# https://www.evertype.com/standards/csur/tengwar.html
#
# Named by tengwa rather than used as bare hex, because the mode is a statement
# about letters and because the other widely used tengwar encoding -- the Free
# Tengwar Project's, which Alcarin Tengwar follows -- puts *different* letters at
# several of these codepoints. A hex table alone would not say which registry this
# is, and the two are not interchangeable.
TINCO, PARMA, CALMA, QUESSE = "", "", "", ""
ANDO, UMBAR, ANGA, UNGWE = "", "", "", ""
FORMEN, HARMA, HWESTA = "", "", ""
ANTO, AMPA, ANCA, UNQUE = "", "", "", ""
NUMEN, MALTA, NWALME = "", "", ""
ORE, VALA, ANNA, VILYA = "", "", "", ""
ROMEN, ARDA, LAMBE, ALDA = "", "", "", ""
SILME, SILME_NUQUERNA = "", ""
ESSE, ESSE_NUQUERNA = "", ""
HYARMEN = ""
YANTA, URE, HALLA = "", "", ""
SHORT_CARRIER, LONG_CARRIER = "", ""

# Ómatehtar. Appendix E, as the Tengwar article quotes it: "the tehtar for vowels
# resemble Latin diacritics: circumflex (î) /a/, acute (í) /e/, dot (i) /i/, left
# curl /o/, and right curl /u/. [...] Some languages from which /o/ is absent or in
# which compared to /u/ it appears sparsely, such as the Black Speech, use left curl
# for /u/."
#
# That last sentence is why half the charts on the web disagree with this one. The
# Ring inscription is the most reproduced tengwar text there is, it is Black Speech,
# and a tengwar font's keyboard layout is usually mapped for it -- so "the o key"
# in a popular font is the letter that means u here. o is the LEFT curl.
TEHTAR = {"a": "", "e": "", "i": "", "o": "", "u": ""}
PALATAL = ""      # two dots below: this consonant is followed by y
DOUBLER = ""      # a bar under the tengwa: this consonant is doubled

# Consonant patterns, longest first. Quenya's own clusters are single tengwar --
# `nd` is ando, not númen plus ando -- which is the whole of the second and fourth
# grades, and most of the reason a tengwar word is shorter than its romanisation.
#
# Two entries are two tengwar rather than one, and both are worth keeping:
#
#   `x` is /ks/, which Appendix E says Quenya favours and writes with the sa-rincë,
#   an s-hook off the tengwa's bow. CSUR encodes the hook at U+E05C/E05D and
#   Constructium draws neither, so it is written out as calma + silme -- also
#   attested, and the same repair the corpus already needs for `ts`.
#
#   `ht` takes harma, not hyarmen. Appendix E's [x] survived into Third Age Quenya
#   only before t (Telumehtar) and harma is the letter for it. `pahta` is the one
#   cell this reaches.
CONSONANTS = [
    ("nqu", [UNQUE]), ("ngw", [UNGWE]),
    ("nd", [ANDO]), ("mb", [UMBAR]), ("ng", [ANGA]),
    ("nt", [ANTO]), ("mp", [AMPA]), ("nc", [ANCA]),
    ("ld", [ALDA]), ("rd", [ARDA]),
    ("ss", [ESSE]),
    ("ht", [HARMA, TINCO]),
    ("hl", [HALLA, LAMBE]), ("hr", [HALLA, ROMEN]),
    ("hw", [HWESTA]), ("qu", [QUESSE]),
    ("x", [CALMA, SILME]),
    ("t", [TINCO]), ("p", [PARMA]), ("c", [CALMA]), ("f", [FORMEN]),
    ("m", [MALTA]), ("n", [NUMEN]), ("l", [LAMBE]),
    ("v", [VALA]), ("s", [SILME]), ("h", [HYARMEN]),
]
# Tengwar whose shape wants the inverted variant once a tehta lands on top of it.
# Appendix E: silme nuquerna and esse nuquerna were "much used when accompanied by
# superposed tehtar", and both Namárië manuscripts attest it.
NUQUERNA = {SILME: SILME_NUQUERNA, ESSE: ESSE_NUQUERNA}

LONG = {"á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u"}
# ä ë ö are Tolkien's hint to an English reader that the vowel is sounded, not
# separate phonemes, so they fold away. They also mark hiatus -- `nöa` is two
# syllables -- which costs nothing here: a diphthong's second element is always i
# or u, and no i or u in either pack carries a diaeresis.
FOLD = {"ä": "a", "ë": "e", "ö": "o"}
VOWELS = set("aeiou")
# Quenya has six, all originally falling. The first vowel is written as a tehta and
# the second as a tengwa -- yanta for i, úre for u -- so the tehta sits on the
# tengwa of the *second* element and the pair reads backwards inside itself.
DIPHTHONGS = {"ai": YANTA, "oi": YANTA, "ui": YANTA,
              "au": URE, "eu": URE, "iu": URE}

# Passed through untransliterated in both packs. See the module docstring.
# Punctuation is this project's editorial furniture rather than the language's, so it
# passes through. The colon is here for the emergency note's `_frame`, which is the one
# string in the registry that is a sentence frame rather than a word -- everything else
# in these files is letters, slots and the separators above. Anything not listed raises,
# which is the point: there is no Klingon word pIqaD cannot spell, so an unmatched
# letter is a data error and not something to approximate.
PUNCTUATION = set(" -'/,:")


def piqad(text):
    """`text` in pIqaD.

    Longest-match and case-significant. It raises on a character TKD does not have:
    there is no Klingon word this cannot spell, so an unmatched letter is a data
    error rather than something to approximate.
    """
    out = []
    i = 0
    while i < len(text):
        if text[i] == "{":
            end = text.index("}", i) + 1
            out.append(text[i:end])
            i = end
            continue
        for key in PIQAD_KEYS:
            if text.startswith(key, i):
                out.append(PIQAD[key])
                i += len(key)
                break
        else:
            if text[i] not in PUNCTUATION:
                raise ValueError(f"{text!r}: {text[i]!r} is not a Klingon letter")
            out.append(text[i])
            i += 1
    return "".join(out)


class Unit:
    """One tengwa and the tehtar riding on it.

    Written base + below + above, which is the order the CSUR chart lists the signs
    in and the order a mark-attachment font expects.
    """

    __slots__ = ("base", "above", "below")

    def __init__(self, base, above=None, below=None):
        self.base, self.above, self.below = base, above, below

    def __str__(self):
        base = NUQUERNA[self.base] if self.above and self.base in NUQUERNA else self.base
        return base + (self.below or "") + (self.above or "")


def tengwar_word(word):
    """One Quenya word in the classical mode.

    The mode is an abugida read as "consonant, then the vowel after it": a vowel
    tehta sits on the *preceding* tengwa. That is what separates the classical mode
    from the general use, where it sits on the following one, and from the mode of
    Beleriand, where vowels are full letters -- and it is the reason the classical
    mode is the right one for Quenya, whose words mostly end in a vowel, so almost
    every tehta finds a consonant to its left.

    A vowel with no consonant in front of it takes a short carrier. A long vowel
    takes a long carrier of its own, which leaves the consonant before it bare --
    so `nér` is three tengwar where `ner` would be two.

    `pending` is the tengwa still waiting for a vowel. It is cleared the moment one
    lands, so the second of two adjacent vowels takes a carrier instead of
    overwriting the first: `ëa` is two carriers, which is correct.
    """
    word = "".join(FOLD.get(c, c) for c in word.lower())
    units = []
    pending = None
    i = 0
    while i < len(word):
        ch = word[i]
        if ch in LONG:
            units.append(Unit(LONG_CARRIER, above=TEHTAR[LONG[ch]]))
            pending = None
            i += 1
        elif ch in VOWELS:
            second = DIPHTHONGS.get(word[i:i + 2])
            if second:
                units.append(Unit(second, above=TEHTAR[ch]))
                pending = None
                i += 2
            elif pending is not None:
                pending.above = TEHTAR[ch]
                pending = None
                i += 1
            else:
                units.append(Unit(SHORT_CARRIER, above=TEHTAR[ch]))
                i += 1
        elif ch == "y":
            # Consonantal y is not a tengwa but a palatalisation of the consonant in
            # front of it, so it leaves `pending` open -- the vowel after `ly` still
            # lands on lambe. Standing alone it needs a bearer, and the Namárië
            # manuscripts use anna rather than the short carrier: a carrier with a
            # mark above *and* below evidently read as overloaded to the scribes.
            if pending is not None and pending.below is None:
                pending.below = PALATAL
            else:
                units.append(Unit(ANNA, below=PALATAL))
                pending = units[-1]
            i += 1
        elif ch == "n" and word.startswith("nw", i):
            # Initial nw is nwalme, the tengwa for the ñw it descended from. Medial
            # nw is n + w and falls out of the ordinary rules below, which is what
            # `hanwa` is made of. No cell in the pack is initial-nw; the rule is here
            # because the alternative to stating it is spelling one wrong in silence.
            units.append(Unit(NWALME if i == 0 else NUMEN))
            i += 1
            pending = units[-1]
        elif ch in ("r", "w"):
            i = _liquid(word, i, units)
            pending = units[-1]
        else:
            for pattern, bases in CONSONANTS:
                if word.startswith(pattern, i):
                    break
            else:
                raise ValueError(f"{word!r}: {ch!r} is not a Quenya letter")
            i += len(pattern)
            if len(pattern) == 1 and word[i:i + 1] == pattern:
                # A doubled consonant is one tengwa under a bar, not two tengwar.
                # `ss` is the exception and it is already handled above: Quenya's
                # very frequent ss has a letter of its own, esse.
                units.append(Unit(bases[0], below=DOUBLER))
                i += 1
            else:
                units.extend(Unit(b) for b in bases)
            pending = units[-1]
    return "".join(str(u) for u in units)


def _liquid(word, i, units):
    """r and w: the two letters whose tengwa depends on what follows.

    r is rómen before a vowel and órë before a consonant or a word edge. Björkman
    reads that distribution off both Namárië manuscripts and judges it aesthetic
    rather than phonemic; it is followed here because it is what the samples do.
    Palatalised r counts as prevocalic, which is his explicit note, so `harya` takes
    rómen.

    w is always vilya. Only medial w survives in Quenya -- initial w became v -- and
    DTS 20 writes that medial w with vilya, in `vanwa`. Vala is v, by the acrophonic
    principle the tengwa names run on: *vala* begins with the sound its letter
    spells, and so does *vilya*, which is why its older name was *wilya*.
    """
    ch = word[i]
    i += 1
    doubled = word[i:i + 1] == ch
    if doubled:
        i += 1
    rest = word[i:]
    prevocalic = rest[:1] in VOWELS or rest[:1] in LONG or (
        rest[:1] == "y" and (rest[1:2] in VOWELS or rest[1:2] in LONG))
    base = VILYA if ch == "w" else ROMEN if prevocalic else ORE
    units.append(Unit(base, below=DOUBLER if doubled else None))
    return i


def tengwar(text):
    """`text` in the classical mode: word by word, punctuation left alone."""
    out = []
    word = []

    def flush():
        out.append(tengwar_word("".join(word)) if word else "")
        word.clear()

    i = 0
    while i < len(text):
        if text[i] == "{":
            end = text.index("}", i) + 1
            flush()
            out.append(text[i:end])
            i = end
        elif text[i] in PUNCTUATION:
            flush()
            out.append(text[i])
            i += 1
        else:
            word.append(text[i])
            i += 1
    flush()
    return "".join(out)


# One route per language: the romanisation column its sources fill, the function
# that reads it, and the `native=` element that records which scheme wrote `text`.
ROUTES = {
    "tlh": ("romanization_okrand", piqad, "piqad-csur"),
    "qya": ("romanization_appendix-e", tengwar, "quenya-classical"),
}


def load_rows(path):
    """(header line, [(line, fields)]) with every untouched line kept byte-exact, so
    the diff is the cells that changed. Same contract as `scripts/build_ipa.py`."""
    lines = path.read_bytes().decode("utf-8").split("\r\n")
    if lines and lines[-1] == "":
        lines.pop()
    rows = [(line, next(csv.reader([line]))) for line in lines]
    return rows[0][0], rows[1:]


def serialise(fields):
    out = io.StringIO(newline="")
    csv.writer(out, lineterminator="").writerow(fields)
    return out.getvalue()


def write_rows(header_line, rows):
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\r\n")
    out.write(header_line + "\r\n")
    for line, fields in rows:
        if line is None:
            writer.writerow(fields)
        else:
            out.write(line + "\r\n")
    return out.getvalue()


def provenance_with(provenance, scheme):
    """`provenance` with its `native=` element set, **in place if it is already
    there**. Appending it instead would fight `scripts/build_ipa.py`, which rebuilds
    its own `ipa=` element by dropping it and appending: each script would then move
    the other's element to the end and both would report churn forever."""
    parts = [f"native={scheme}" if p.startswith("native=") else p
             for p in provenance.split(";") if p]
    return ";".join(parts if any(p.startswith("native=") for p in parts)
                    else parts + [f"native={scheme}"])


def build(code, check):
    """Rewrite -- or, with `check`, verify -- one pack.

    Idempotent by construction: the romanisation column is seeded from `text` the
    first time and read from thereafter, so the second run is a no-op.
    """
    column, convert, scheme = ROUTES[code]
    stale = []
    written = 0
    for path in sorted((DATA / "lang" / code).glob("*.csv")):
        header_line, rows = load_rows(path)
        header = next(csv.reader([header_line]))
        changed = column not in header
        if changed:
            at = header.index("text_alt") + 1
            header.insert(at, column)
            header_line = serialise(header)
            rows = [(None, f[:at] + [""] + f[at:]) for _, f in rows]
        index = {name: n for n, name in enumerate(header)}
        for n, (line, fields) in enumerate(rows):
            row = dict(zip(header, fields))
            roman = row[column] or row["text"]
            if not roman:
                continue
            want = convert(roman)
            provenance = provenance_with(row["provenance"], scheme)
            if (row["text"], row[column], row["provenance"]) == (want, roman, provenance):
                continue
            if check:
                stale.append(f"  {path.relative_to(ROOT)}: {row['concept_id']}")
                continue
            fields[index["text"]] = want
            fields[index[column]] = roman
            fields[index["provenance"]] = provenance
            rows[n] = (None, fields)
            changed = True
            written += 1
        if changed:
            path.write_bytes(write_rows(header_line, rows).encode("utf-8"))
    return stale, written


# The two registry tables that hold one row per language rather than one file per
# language, so one pass serves both: the file, the column naming the language, the
# native column and the romanisation beside it.
#
# `language-names.csv` is what each language calls the *others*, and its `name` column
# is what `fillLanguageSlots` substitutes into a `{target}` or `{source}` slot -- in
# the language of the cell the slot sits in. So the moment a Klingon cell is pIqaD,
# `'eSpanya' Hol` in that column makes the one thing `core/pack.js` promises
# impossible: "a substituted cell can never contain a script its own font stack can
# draw". `romanization` is also the column `build_ipa.py` reads for these two locales
# and the column the sheet's own romanisation field substitutes from. Only the
# `locale` side is transliterated: a row like `en,tlh` is English naming Klingon.
#
# `languages.csv`'s `endonym` is what a language calls *itself*, and it is the one
# native cell a reader meets before any card is drawn -- the gallery card prints it
# under its English title and the "I speak..." picker's own row is nothing else. Both
# were Latin on two cards whose every other cell had gone native. `exonym_en` carries
# "Klingon" and "Quenya" for the title above it, so a native endonym strands nobody,
# and `speak_label` in the same row stays romanised on purpose: that is interface
# chrome, and `data/i18n/{tlh,qya}.json` is romanised end to end for the same reason.
#
# `endonym_roman` and `badge_roman` are new and empty on the other twenty rows, which
# costs them nothing: every consumer reads this table by header name -- `parseTable`
# in `core/csv.js` for the app and its tests, `csv.DictReader` in `validate_data.py`
# and `build_ipa.py`.
#
# The `badge` pass is here for readability rather than for correctness. A badge is a
# choice of two codepoints, not a transliteration of anything, and the two conscript
# ones were hand-written into the CSV -- where nobody can read them, so checking that
# the Quenya badge spells what it claims to meant decoding five Private Use Area
# codepoints against the CSUR chart by hand. `badge_roman` makes that a glance and
# `--check` keeps the two in step. `languages.csv` therefore appears twice: each entry
# rewrites the whole file, and the second pass reads what the first wrote.
ROW_TABLES = [("language-names.csv", "locale", "name", "romanization"),
              ("languages.csv", "bcp47", "endonym", "endonym_roman"),
              ("languages.csv", "bcp47", "badge", "badge_roman")]


def build_rows(filename, code_column, native, roman_column, check):
    """Derive the native column of one whole-file registry table.

    Newline-delimited and rewritten whole, matching `write_names` in
    `scripts/build_ipa.py`, which is the other writer of `language-names.csv`. The
    corpus helpers above cannot be reused: `data/lang` is CRLF and kept byte-exact
    line by line, and neither of these files is.

    The romanisation is *seeded* rather than hand-authored, which is what `build`
    does for the packs: it is filled from the native cell on the first run and read
    from thereafter, so the Latin that was in `endonym` becomes `endonym_roman` once
    and every run after that is a no-op. `build_registry` refuses to seed for the same
    reason it cannot -- a per-language file has no row to tell one language's cells
    from another's -- and here the code column does.
    """
    path = DATA / "registry" / filename
    with path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        header = reader.fieldnames
        rows = list(reader)
    stale = []
    written = 0
    for row in rows:
        if row[code_column] not in ROUTES:
            continue
        convert = ROUTES[row[code_column]][1]
        roman = row[roman_column] or row[native]
        if not roman:
            continue
        want = convert(roman)
        if (row[native], row[roman_column]) == (want, roman):
            continue
        if check:
            # The romanisation names the row, and it is the cell a human would open
            # the file to look at.
            stale.append(f"  {path.relative_to(ROOT)}: {roman}")
            continue
        row[native], row[roman_column] = want, roman
        written += 1
    if written:
        out = io.StringIO(newline="")
        writer = csv.DictWriter(out, header, lineterminator="\n", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        path.write_text(out.getvalue(), encoding="utf-8", newline="")
    return stale, written


# The two registry files that print *on the card* rather than in the corpus: the
# section headings above every panel, and the emergency note's own service words. They
# had stayed romanised while the phrases beneath them went native, so a Klingon sheet
# read pIqaD under Latin headings -- which is the same half-finished state the packs
# themselves were in, arriving in a different file.
#
# Same discipline as the packs. The romanised cell is the authored one and lives in a
# `<column>_roman` column beside the native one, which is derived; nothing here is
# hand-written in pIqaD or tengwar. That column exists only in these four files, and
# both readers take the table by header name, so the other twenty languages neither
# need it nor notice it.
REGISTRY = [("section-titles", "section_id", "title"),
            ("emergency-labels", "label", "text")]


def build_registry(code, check):
    """Derive the native column of one language's two card-facing registry files.

    Its own reader rather than `load_rows`, because the registry is LF and the corpus
    is CRLF -- `load_rows` splits on CRLF by contract, and handed one of these files it
    reads the whole thing as a single line. Each file's own ending is preserved on the
    way back out, so the diff stays the cells that changed.
    """
    convert = ROUTES[code][1]
    stale = []
    for folder, key, col in REGISTRY:
        path = DATA / "registry" / folder / f"{code}.csv"
        if not path.exists():
            continue
        raw = path.read_bytes().decode("utf-8")
        nl = "\r\n" if "\r\n" in raw else "\n"
        lines = [line for line in raw.split(nl) if line != ""]
        header = next(csv.reader([lines[0]]))
        if f"{col}_roman" not in header:
            raise SystemExit(f"{path}: no {col}_roman column to derive {col} from")
        at, source = header.index(col), header.index(f"{col}_roman")
        out = [lines[0]]
        for line in lines[1:]:
            fields = next(csv.reader([line]))
            want = convert(fields[source])
            if fields[at] == want:
                out.append(line)
                continue
            fields[at] = want
            out.append(serialise(fields))
            stale.append(f"{folder}/{code}.csv {fields[header.index(key)]}")
        if not check:
            path.write_bytes((nl.join(out) + nl).encode("utf-8"))
    return stale


# `core/respell.js` carries this table a second time, because a Klingon *reader*'s
# respelling column is pIqaD too and a respelling is generated at load time from the
# target's `ipa` column -- so it is spelt by the engine rather than derived here. The
# scheme cannot be shared across the Python boundary, and two copies of one mapping is
# a real failure rather than untidiness: the same Klingon letter would be drawn as two
# different glyphs on one card, in the gloss and in the respelling under it. This is
# what makes that unreachable, and it is here rather than in `tests/respell.test.mjs`
# because this file is where the mapping is documented and cited.
ENGINE = ROOT / "core" / "respell.js"
JS_ENTRY = re.compile(r"(\S+?)\s*:\s*'((?:\\u[0-9a-f]{4})+)'")


def check_engine_table():
    """Every difference between this file's `PIQAD` and `core/respell.js`'s."""
    src = ENGINE.read_text(encoding="utf-8")
    at = src.index("const PIQAD = {")
    block = src[at:src.index("};", at)]

    def unquote(key):
        # One quote off each end, not `strip`: the glottal stop's key is written `"'"`
        # there, and stripping both quote characters would leave it empty.
        return key[1:-1] if key[:1] in ("'", '"') and key[-1:] == key[:1] else key

    theirs = {unquote(key): value.encode().decode("unicode_escape")
              for key, value in JS_ENTRY.findall(block)}
    return [f"  core/respell.js: {key!r} is {theirs.get(key)!r}, not {PIQAD.get(key)!r}"
            for key in sorted(PIQAD.keys() | theirs.keys())
            if theirs.get(key) != PIQAD.get(key)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                       help="report stale cells and exit non-zero; writes nothing")
    parser.add_argument("codes", nargs="*", choices=[*ROUTES, []],
                       help="which packs (default: both)")
    args = parser.parse_args()

    stale = []
    for code in args.codes or ROUTES:
        found, written = build(code, args.check)
        stale += found
        if not args.check:
            print(f"{code}: {written} rows written")
        stale += build_registry(code, args.check)
    for filename, code_column, native, roman_column in ROW_TABLES:
        found, written = build_rows(filename, code_column, native, roman_column, args.check)
        stale += found
        if not args.check:
            print(f"{filename}: {written} rows written")
    stale += check_engine_table()
    if stale:
        print(f"{len(stale)} cells are not what scripts/transliterate_native.py "
              "would write:", file=sys.stderr)
        print("\n".join(stale), file=sys.stderr)
        return 1
    if args.check:
        print("native-script columns are current")
    return 0


if __name__ == "__main__":
    sys.exit(main())
