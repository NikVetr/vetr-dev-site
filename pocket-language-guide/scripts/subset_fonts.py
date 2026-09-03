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
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tmp" / "fonts-src"
OUT = ROOT / "data" / "fonts"

# Latin, IPA extensions, combining marks, general punctuation, currency. Every
# stack gets these: the gloss column is Latin whatever the target script is.
LATIN_RANGES = [(0x20, 0x24F), (0x250, 0x2AF), (0x2B0, 0x2FF), (0x300, 0x36F),
                (0x2000, 0x206F), (0x20A0, 0x20BF), (0x2100, 0x214F), (0x2190, 0x21FF)]
# Cyrillic and Latin Extended Additional, for the `latin` stacks only.
#
# These are here rather than left to the corpus union because the add-your-own-term
# editor lets someone type a word the corpus never contained, offline, with no font
# left to fall back to. Russian needs the first block and Vietnamese the second, and
# together they cost about 16KB a face. They are kept off the CJK and Arabic stacks
# because `scripts.csv` routes Cyrillic and Vietnamese to `latin` -- a Mandarin card
# glossed in Russian sets the Russian in the Latin face, so the CJK face would carry
# 500 glyphs it can never be asked to draw, in the largest files here.
LATIN_EXTRA_RANGES = [(0x400, 0x4FF), (0x1E00, 0x1EFF)]
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
DEVA_RANGES = [(0x0900, 0x097F), (0xA8E0, 0xA8FF)]

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
    ("thai", 400, False): "NotoSansThai-var.ttf",
    ("thai", 700, False): "NotoSansThai-var.ttf",
    ("thai-serif", 400, False): "NotoSerifThai-var.ttf",
    ("thai-serif", 700, False): "NotoSerifThai-var.ttf",
    ("deva", 400, False): "NotoSansDevanagari-var.ttf",
    ("deva", 700, False): "NotoSansDevanagari-var.ttf",
    ("deva-serif", 400, False): "NotoSerifDevanagari-var.ttf",
    ("deva-serif", 700, False): "NotoSerifDevanagari-var.ttf",
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
LATIN_DONOR = {"NotoSansArabic-Regular.ttf": "NotoSans-Regular.ttf",
               "NotoSansArabic-Bold.ttf": "NotoSans-Bold.ttf"}

# Which language directories feed each stack's corpus-character union.
ALL_LANGS = ["en", "es", "fr", "de", "ko", "ar", "zh-Hans", "ja",
             "pt", "ru", "tr", "vi", "hi", "id", "sw", "th"]
STACK_LANGS = {"latin": ALL_LANGS, "latin-cond": ALL_LANGS,
               "latin-serif": ALL_LANGS, "latin-cond-serif": ALL_LANGS,
               "cjk-sc": ["zh-Hans"], "cjk-sc-serif": ["zh-Hans"],
               "cjk-jp": ["ja"], "cjk-jp-serif": ["ja"],
               "cjk-kr": ["ko"], "cjk-kr-serif": ["ko"],
               "arabic": ["ar"], "thai": ["th"], "thai-serif": ["th"],
               "deva": ["hi"], "deva-serif": ["hi"]}


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
        chars |= expand(LATIN_EXTRA_RANGES)
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
    elif stack.startswith("deva"):
        chars |= expand(DEVA_RANGES)
    return chars


def subset_source(source, stack, weight, chars):
    """One source file, instanced to `weight` and cut down to `chars`."""
    font = TTFont(SRC / source, fontNumber=0)
    if "fvar" in font:
        axes = {"wght": weight}
        # Pin every axis the font has. Leaving one free keeps fvar and gvar alive,
        # and subsetting a partially-instanced variable font trips over glyphs that
        # gvar never carried.
        if "wdth" in {a.axisTag for a in font["fvar"].axes}:
            axes["wdth"] = CONDENSED_WDTH if stack.startswith("latin-cond") else NORMAL_WDTH
        instancer.instantiateVariableFont(font, axes, inplace=True, updateFontNames=True)

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
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=chars & set(font.getBestCmap()))
    subsetter.subset(font)
    return font


def merge_donor(font, donor):
    """`font` with `donor`'s glyphs, cmap and layout rules added to it.

    `Merger` reads from files, so both halves go through a buffer rather than the
    filesystem. It stamps `head.created` with the current time, which would put
    the churn the pinned timestamps exist to prevent straight back; the primary
    face's value carries over instead.
    """
    created = font["head"].created
    buffers = []
    for half in (font, donor):
        buf = io.BytesIO()
        half.save(buf)
        buf.seek(0)
        buffers.append(buf)
    merged = Merger().merge(buffers)
    merged["head"].created = created
    return merged


def build_face(stack, weight, italic, source, chars):
    font = subset_source(source, stack, weight, chars)
    donor = LATIN_DONOR.get(source)
    if donor:
        # Only the codepoints the primary face is missing. Taking the overlap too
        # would store nineteen glyphs twice and let the donor's Latin reading of
        # U+204F and U+2E41 -- reversed semicolon and comma, which Arabic draws the
        # other way round -- compete in the merged cmap for no gain.
        font = merge_donor(font, subset_source(
            donor, stack, weight, chars - set(font.getBestCmap())))

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

    glyphs = len(TTFont(ttf).getGlyphOrder())
    return {
        "stack": stack, "weight": weight, "italic": italic, "file": stem,
        "glyphs": glyphs,
        "ttfBytes": ttf.stat().st_size,
        "woff2Bytes": (OUT / f"{stem}.woff2").stat().st_size,
        "source": source,
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

    manifest = {
        "license": "SIL Open Font License 1.1",
        "note": "Generated by scripts/subset_fonts.py. Do not edit.",
        "faces": faces,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    total = sum(f["woff2Bytes"] for f in faces)
    print(f"data/fonts/manifest.json  ({total//1024} KB of woff2 total)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
