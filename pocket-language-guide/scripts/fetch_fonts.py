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
