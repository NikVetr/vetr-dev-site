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
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tmp" / "fonts-src"
OUT = ROOT / "data" / "fonts"

# Latin, IPA extensions, combining marks, general punctuation, currency.
LATIN_RANGES = [(0x20, 0x24F), (0x250, 0x2AF), (0x2B0, 0x2FF), (0x300, 0x36F),
                (0x2000, 0x206F), (0x20A0, 0x20BF), (0x2100, 0x214F), (0x2190, 0x21FF)]
CJK_PUNCT = [(0x3000, 0x303F), (0xFF00, 0xFFEF), (0x2E80, 0x2EFF)]
KANA = [(0x3040, 0x30FF), (0x31F0, 0x31FF)]
ARABIC_RANGES = [(0x600, 0x6FF), (0x750, 0x77F), (0x8A0, 0x8FF),
                 (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)]

# Faces: (stack, weight, italic) -> source file. CJK and Arabic have no italic in
# these families, and the sheet only ever italicises romanisation, which is Latin.
#
# `latin-cond` is the equivalent of the reference sheet's \tablelatin: dense
# reference tables need a narrower Latin face or their four columns cannot hold a
# gloss and a respelling on one line.
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
}

# Which language directories feed each stack's corpus-character union.
STACK_LANGS = {"latin": ["en", "es"], "latin-cond": ["en", "es"],
               "latin-serif": ["en", "es"], "latin-cond-serif": ["en", "es"],
               "cjk-sc": ["zh-Hans"], "cjk-sc-serif": ["zh-Hans"],
               "cjk-jp": ["ja"], "arabic": ["ar"]}


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
    """Every codepoint the shipped data uses, so nothing in the corpus is tofu."""
    chars = set()
    patterns = [f"data/lang/{code}/*.csv" for code in langs]
    patterns += ["data/respell/overrides/*.csv", "data/registry/*.csv", "data/concepts/*.csv"]
    for pattern in patterns:
        for path in glob.glob(str(ROOT / pattern)):
            with open(path, encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    for value in row.values():
                        chars.update(ord(c) for c in (value or ""))
    return chars


def coverage(stack):
    chars = expand(LATIN_RANGES) | corpus_chars(STACK_LANGS[stack])
    if stack in ("latin-cond", "latin-serif", "latin-cond-serif"):
        return chars
    if stack in ("cjk-sc", "cjk-sc-serif"):
        # GB2312 level 1: the ~3.7k characters of everyday written Chinese.
        chars |= expand(CJK_PUNCT) | legacy_charset("gb2312", range(0xB0, 0xD8), range(0xA1, 0xFF))
    elif stack == "cjk-jp":
        chars |= expand(CJK_PUNCT) | expand(KANA)
        chars |= legacy_charset("euc_jp", range(0xB0, 0xD0), range(0xA1, 0xFF))
    elif stack == "arabic":
        chars |= expand(ARABIC_RANGES)
    return chars


def build_face(stack, weight, italic, source, chars):
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
