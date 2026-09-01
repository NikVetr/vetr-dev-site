#!/usr/bin/env python3
"""Shrink the gallery thumbnails written by scripts/prerender_packs.mjs.

    npm run prerender          # runs this afterwards, via the postprerender hook

Every ready language pairs with every other, so `packs/` grows as the square of the
language count: eight languages is 56 thumbnails, twelve is 132. At the ~140KB a
raw Playwright screenshot costs, that is 18MB of committed binaries -- for images
that are almost entirely white paper and antialiased grey text.

Rounding each channel to five bits brings a thumbnail under 256 distinct colours,
which makes an *exact* palette possible: from there the file is a lossless indexed
PNG rather than a lossy approximation of one, about a third the size. The rounding
itself is visible only if you difference the two images -- the colours it merges
differ by at most 1/32 of a channel, well inside the antialiasing.

Determinism matters because `packs/` is committed: the palette is built by sorting
the colours rather than by asking Pillow to choose, so the same input gives the same
bytes on any machine and the repository does not churn on every re-render.
"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("this needs Pillow: pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
PACKS = ROOT / "packs"


def reduced(image, bits):
    """The image with each channel rounded to `bits`, and its distinct colours.

    Rounding to the nearest of `2**bits` evenly spaced levels rather than
    truncating, so that 0 and 255 map to themselves: the card is white paper on a
    white page, and a background that came back as 252 would read as a faint grey
    panel behind the thumbnail.
    """
    levels = (1 << bits) - 1
    lut = bytes(round(round(v * levels / 255) * 255 / levels) for v in range(256))
    out = image.point(lut * 3)
    return out, out.getcolors(maxcolors=1 << 24)


def to_palette(image):
    """An indexed copy of an RGB image, or None if it will not fit 256 colours."""
    for bits in (5, 4, 3):
        flat, colors = reduced(image, bits)
        if colors is not None and len(colors) <= 256:
            break
    else:
        return None

    palette = sorted(colour for _, colour in colors)
    index = {colour: i for i, colour in enumerate(palette)}
    out = Image.new("P", flat.size)
    out.putpalette([channel for colour in palette for channel in colour])
    out.putdata([index[px] for px in flat.getdata()])
    return out


def main():
    thumbs = sorted(PACKS.glob("*/thumb.png"))
    if not thumbs:
        sys.exit("no thumbnails in packs/ -- run npm run prerender first")

    before = after = 0
    skipped = []
    for path in thumbs:
        was = path.stat().st_size
        with Image.open(path) as source:
            indexed = to_palette(source.convert("RGB"))
        if indexed is None:
            skipped.append(path.parent.name)
            before += was
            after += was
            continue
        indexed.save(path, "PNG", optimize=True)
        before += was
        after += path.stat().st_size

    for name in skipped:
        print(f"warn  {name}: too many colours to index, left as is")
    saved = before - after
    print(f"{len(thumbs)} thumbnails, {before // 1024}KB -> {after // 1024}KB "
          f"({saved * 100 // before}% smaller)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
