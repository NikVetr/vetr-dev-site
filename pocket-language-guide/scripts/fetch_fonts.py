#!/usr/bin/env python3
"""Download upstream font sources into tmp/fonts-src/ (untracked).

Only the subset outputs under data/fonts/ are committed; this step exists so the
subsetting in subset_fonts.py is reproducible from named upstream releases.
All faces are SIL Open Font License 1.1.
"""
import sys
import urllib.request
from pathlib import Path

NOTO = "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts"
GFONTS = "https://raw.githubusercontent.com/google/fonts/main/ofl"

SOURCES = {
    "NotoSans-Regular.ttf": f"{NOTO}/NotoSans/hinted/ttf/NotoSans-Regular.ttf",
    "NotoSans-Bold.ttf": f"{NOTO}/NotoSans/hinted/ttf/NotoSans-Bold.ttf",
    "NotoSans-Italic.ttf": f"{NOTO}/NotoSans/hinted/ttf/NotoSans-Italic.ttf",
    "NotoSans-BoldItalic.ttf": f"{NOTO}/NotoSans/hinted/ttf/NotoSans-BoldItalic.ttf",
    "NotoSansArabic-Regular.ttf": f"{NOTO}/NotoSansArabic/hinted/ttf/NotoSansArabic-Regular.ttf",
    "NotoSansArabic-Bold.ttf": f"{NOTO}/NotoSansArabic/hinted/ttf/NotoSansArabic-Bold.ttf",
    # Variable; subset_fonts.py pins static instances out of these. The upright
    # and italic Noto Sans variables carry a width axis, which is what supplies
    # the condensed face the reference sheet used for its dense tables.
    "NotoSans-var.ttf": f"{GFONTS}/notosans/NotoSans%5Bwdth,wght%5D.ttf",
    "NotoSans-Italic-var.ttf": f"{GFONTS}/notosans/NotoSans-Italic%5Bwdth,wght%5D.ttf",
    # The serif typeface option. Also carries a width axis, so its dense tables get
    # the same condensed treatment the sans ones do.
    "NotoSerif-var.ttf": f"{GFONTS}/notoserif/NotoSerif%5Bwdth,wght%5D.ttf",
    "NotoSerif-Italic-var.ttf": f"{GFONTS}/notoserif/NotoSerif-Italic%5Bwdth,wght%5D.ttf",
    "NotoSerifSC-var.ttf": f"{GFONTS}/notoserifsc/NotoSerifSC%5Bwght%5D.ttf",
    "NotoSansSC-var.ttf": f"{GFONTS}/notosanssc/NotoSansSC%5Bwght%5D.ttf",
    "NotoSansJP-var.ttf": f"{GFONTS}/notosansjp/NotoSansJP%5Bwght%5D.ttf",
    "NotoSerifJP-var.ttf": f"{GFONTS}/notoserifjp/NotoSerifJP%5Bwght%5D.ttf",
    "NotoSansKR-var.ttf": f"{GFONTS}/notosanskr/NotoSansKR%5Bwght%5D.ttf",
    "NotoSerifKR-var.ttf": f"{GFONTS}/notoserifkr/NotoSerifKR%5Bwght%5D.ttf",
    # Two scripts the Latin faces do not cover, each needing a stack of its own.
    #
    # Thai is the obvious one: Noto Sans carries none of its codepoints. Devanagari
    # is the trap. The *variable* NotoSans has all 128 of it, which is why a check
    # against `NotoSans-var.ttf` says Devanagari is covered -- but that file feeds
    # only the condensed stack. The four static faces that feed `latin`, which is
    # where `scripts.csv` used to route Devanagari, have zero. Hindi would have
    # printed as tofu, and the Hindi translator caught it by testing the shipped
    # subsets rather than the sources.
    # Hebrew is the second right-to-left script here and it is not the Arabic case.
    # Noto Sans Arabic ships no Latin at all, which is why `LATIN_DONOR` exists; both
    # Hebrew faces carry 273 codepoints of U+0020-024F including the whole of ASCII,
    # so the emergency line's digits and its U+00B7 separators draw without a graft.
    # Checked against these files rather than assumed -- that is the same mistake the
    # Devanagari note below records, in the other direction.
    "NotoSansHebrew-var.ttf": f"{GFONTS}/notosanshebrew/NotoSansHebrew%5Bwdth,wght%5D.ttf",
    "NotoSerifHebrew-var.ttf": f"{GFONTS}/notoserifhebrew/NotoSerifHebrew%5Bwdth,wght%5D.ttf",
    "NotoSansThai-var.ttf": f"{GFONTS}/notosansthai/NotoSansThai%5Bwdth,wght%5D.ttf",
    "NotoSerifThai-var.ttf": f"{GFONTS}/notoserifthai/NotoSerifThai%5Bwdth,wght%5D.ttf",
    # Bengali. Noto Sans Bengali rather than any Latin face: `NotoSans-var.ttf` has
    # none of U+0980..09FF, the same fact that made Devanagari and Thai their own
    # stacks. The serif is fetched for the same reason its neighbours' are -- the
    # typeface control offers serif per script and falls back per script, so a Bengali
    # sheet in serif would otherwise silently be sans.
    "NotoSansBengali-var.ttf":
        f"{GFONTS}/notosansbengali/NotoSansBengali%5Bwdth,wght%5D.ttf",
    "NotoSerifBengali-var.ttf":
        f"{GFONTS}/notoserifbengali/NotoSerifBengali%5Bwdth,wght%5D.ttf",
    "NotoSansDevanagari-var.ttf":
        f"{GFONTS}/notosansdevanagari/NotoSansDevanagari%5Bwdth,wght%5D.ttf",
    "NotoSerifDevanagari-var.ttf":
        f"{GFONTS}/notoserifdevanagari/NotoSerifDevanagari%5Bwdth,wght%5D.ttf",
    # Tamil, and `NotoSans-var.ttf` has zero codepoints of U+0B80..0BFF, so `Taml`
    # cannot route to `latin` the way `Grek` and `Cyrl` do. Both faces cover all 72
    # assigned codepoints of the block, and -- read off the cmap rather than assumed
    # -- both also carry `² ³ ⁴` and `₂ ₃ ₄` and nothing else from Latin-1's
    # superscripts or the Superscripts and Subscripts block, which are exactly the
    # two written forms of the Sanskrit-in-Tamil digit notation `ta__ta-IN.json`
    # depends on. They carry 286 codepoints of U+0020..024F including `·` and `₹`,
    # so this is the Bengali case and not the Arabic one: no `LATIN_DONOR` graft.
    "NotoSansTamil-var.ttf":
        f"{GFONTS}/notosanstamil/NotoSansTamil%5Bwdth,wght%5D.ttf",
    "NotoSerifTamil-var.ttf":
        f"{GFONTS}/notoseriftamil/NotoSerifTamil%5Bwdth,wght%5D.ttf",
    # Telugu, and this is the one script here whose face was **not** chosen from the
    # Noto family, because Noto Sans Telugu and Noto Serif Telugu are the two files
    # this project's shaper cannot shape. Their GPOS MarkBasePos lookups hold 468
    # NULL base anchors out of 2,106 -- legal OpenType, a base glyph may have no
    # anchor for a mark class it never attaches -- and `vendor/fontkit.esm.js` reads
    # `.xCoordinate` off them with no null check. The result is a *throw*, not a bad
    # glyph, on 340 of the 49,140 aksharas Telugu can write: every consonant with a
    # ra-subscript plus ి ీ ె ే, which is ప్ర, ప్రే, క్రి and శ్రీ -- so ప్రయాణం,
    # ప్రవేశం and Sri Lanka's own ICU name శ్రీలంక could not be measured. Instancing
    # and subsetting change nothing; the var file, Noto's static release and this
    # script's own subset all throw the same 340. See tmp/telugu.md, and run
    # tmp/te/shapecheck.mjs before choosing a face for pa, gu, si, kn, ml or ne.
    #
    # Every other OFL Telugu face on Google Fonts throws on none of the 49,140,
    # because none of them has a MarkBasePos base anchor at all -- so the choice was
    # made on the two things this project measures. Of the 21 candidates, only four
    # carry every character a Telugu sheet needs (`·` U+00B7, `₹`, `…`, `—`, `’` and
    # the whole of ASCII, so that no `LATIN_DONOR` graft is needed): Anek Telugu,
    # Baloo Tammudu 2, Gidugu and **Hind Guntur**. Baloo and Gidugu are display
    # designs. Between the last two, Hind Guntur wins on the worst-confusable-pair
    # measurement -- `ఠ`/`ర` differing by 0.061 of the smaller letter's ink at 5.4pt,
    # against Anek's `క్డ`/`క్ద` at 0.036, so it lands in Devanagari's and Thai's
    # tier (0.067, 0.065) rather than Arabic's (0.036) -- and marginally on the ink
    # span too. It is Indian Type Foundry's Hind superfamily, drawn for UI and text
    # at small sizes, OFL 1.1, no Reserved Font Name, five real static weights.
    #
    # What it costs: 76 of the Telugu block against Anek's 96, and the 20 it lacks
    # are the nukta, the Vedic marks, ౚ, the fraction and weight signs and the
    # **Telugu digits ౦-౯**. No row and no reader rule reaches any of them -- the
    # pack writes numbers in ASCII, for the reason tmp/te/g_num.py gives -- but a
    # reader typing ౧ into the add-your-own-term editor would get a box, which is the
    # concern `LATIN_EXTRA_RANGES` states for Greek and Cyrillic. It also lacks
    # U+00A0, which only the French rows contain and which draws in `latin`.
    #
    # No serif beside it: the only Telugu face with a claim to being one is the Noto
    # Serif that throws, so `telu` ships sans-only and `stackFor` falls back the way
    # it does for `arabic`, which has no serif either.
    # Gurmukhi, and this is Telugu's finding a second time -- **run
    # tmp/pa/shapecheck.mjs before choosing a Brahmic face**, which is what
    # tmp/telugu.md tells the next addition to do. Over the 59,280 aksharas
    # Gurmukhi can write (38 consonants x 10 vowel signs x {bare, bindi, tippi,
    # addak} x {no subjoined, each of the 38}), through the same
    # `vendor/fontkit.esm.js` this project measures and prints with:
    #
    #   Noto Sans Gurmukhi        26,232 throws   880 NULL MarkBasePos base anchors
    #                                             of 1,486
    #   Anek Gurmukhi              1,482 throws   229 of 730
    #   Baloo Paaji 2              1,482 throws
    #   Noto Serif Gurmukhi            0 throws   0 of 768
    #   Noto Sans Gurmukhi UI          0 throws   0 of 110
    #   Mukta Mahee                    0 throws   0 of 133
    #
    # Same defect as Telugu's, in a worse proportion, and **unlike Telugu's 340
    # these are not edge shapes**: 680 of the 1,520 *plain* aksharas throw, and
    # among the throwing strings are ਪੰਜਾਬੀ *Punjabi*, ਸਿੰਘ, ਮੈਂ *I*, ਸ੍ਰੀ and
    # ਪ੍ਰੇਮ. Instancing and subsetting change nothing. Anek's and Baloo's 1,482
    # are an artefact of the matrix rather than a blocker -- every one is ੀ+ੰ,
    # bihari plus tippi, a sequence Gurmukhi does not write -- and are recorded so
    # the next agent does not reject those two for the wrong reason.
    #
    # **Noto Sans Gurmukhi UI is the same design as Noto Sans Gurmukhi**, not a
    # different one: every glyph the two share has a byte-identical bounding box
    # and their hhea/OS-2 metrics are the same, so what differs is a GPOS table
    # built without the NULL anchors. Over the 2,856 aksharas the non-UI face can
    # shape at all, the two differ only in tucking a subjoined consonant 0.041em
    # higher. Its cost is Arabic's: 43 codepoints of U+0020..024F, no letter of
    # either case and no `·` U+00B7, so it is the second stack here to need a
    # `LATIN_DONOR` graft. It does carry `₹`, `…`, `’`, `—` and `–` itself.
    #
    # **Mukta Mahee was the alternative that avoids the graft and it is refused on
    # the mark this script turns on.** Ek Type / Indian Type Foundry, OFL, real
    # static weights, full Latin, zero throws -- everything Hind Guntur was chosen
    # for above. Its nukta is 0.00802 em-squared of differing ink against
    # Devanagari's nuqta 0.00997 and Noto's own bindi 0.01014, so at 5.4pt ਗ/ਗ਼
    # differ by 0.039 of the smaller letter's ink -- which would make Gurmukhi the
    # second most confusable script this project prints, behind only Arabic's
    # 0.036. Noto Sans Gurmukhi UI's worst pair at the same size is 0.067, in
    # Devanagari's and Thai's tier. The nukta is not decoration in Punjabi: it is
    # ਸ/ਸ਼ *sa/sha*, ਜ/ਜ਼ *ja/za* and ਫ/ਫ਼ *pha/fa*, three live phonemic contrasts
    # in a pack full of Perso-Arabic loans. Anek (0.043 at 5.4) and Baloo (a
    # display design) fall to the same measurement. See tmp/punjabi.md.
    #
    # The serif needs no graft: 284 codepoints of U+0020..024F including ASCII,
    # `·` and `₹`, so this half of the stack is the Bengali case and the sans half
    # is the Arabic one.
    "NotoSansGurmukhiUI-var.ttf":
        f"{GFONTS}/notosansgurmukhiui/NotoSansGurmukhiUI%5Bwdth,wght%5D.ttf",
    "NotoSerifGurmukhi-var.ttf":
        f"{GFONTS}/notoserifgurmukhi/NotoSerifGurmukhi%5Bwght%5D.ttf",
    "HindGuntur-Regular.ttf": f"{GFONTS}/hindguntur/HindGuntur-Regular.ttf",
    "HindGuntur-Bold.ttf": f"{GFONTS}/hindguntur/HindGuntur-Bold.ttf",
    # Klingon pIqaD and Tengwar, which no Noto face has and which are not in Unicode
    # at all -- they are Private Use Area allocations from the ConScript Unicode
    # Registry, U+F8D0..U+F8FF and U+E000..U+E07F. Constructium is a fork of SIL
    # Gentium that carries both, under the same OFL 1.1 as everything else here
    # (`Constructium/OFL.txt` in the repository below: "Copyright (c) 2008-2020
    # Kreative Software. This Font Software is licensed under the SIL Open Font
    # License, Version 1.1", with no Reserved Font Name declared, so a subset may
    # keep the name).
    #
    # It is the only redistributable face found that covers *both*, and for tengwar
    # it is the only one that survives this project's PDF path -- see the note at
    # `PUA_DONOR` in subset_fonts.py, which is a measurement rather than a
    # preference.
    "Constructium.ttf":
        "https://raw.githubusercontent.com/kreativekorp/open-relay/master"
        "/Constructium/Constructium.ttf",
}

DEST = Path(__file__).resolve().parent.parent / "tmp" / "fonts-src"


def main() -> int:
    DEST.mkdir(parents=True, exist_ok=True)
    for name, url in SOURCES.items():
        out = DEST / name
        if out.exists():
            print(f"have  {name}")
            continue
        print(f"fetch {name}")
        with urllib.request.urlopen(url, timeout=120) as resp:
            out.write_bytes(resp.read())
    print(f"sources in {DEST}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
