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
    "NotoSansDevanagari-var.ttf":
        f"{GFONTS}/notosansdevanagari/NotoSansDevanagari%5Bwdth,wght%5D.ttf",
    "NotoSerifDevanagari-var.ttf":
        f"{GFONTS}/notoserifdevanagari/NotoSerifDevanagari%5Bwdth,wght%5D.ttf",
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
