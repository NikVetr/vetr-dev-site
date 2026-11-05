# Licences of vendored data

## Hershey Simplex Script glyphs (`../core/hershey-data.js`)

The glyph strings (minus record numbers and line wrapping) come from the Usenet distribution of the
occidental Hershey glyphs (mod.sources vol. 4, 1985; the file `hershey` in
https://paulbourke.net/dataformats/hershey/hershey.zip), keeping the glyphs
R's "HersheyScript" font (Simplex Script) draws. The distribution's terms:

```
This distribution of the Hershey Fonts may be used by anyone for
any purpose, commercial or otherwise, providing that:
	1. The following acknowledgements must be distributed with
		the font data:
		- The Hershey Fonts were originally created by Dr.
			A. V. Hershey while working at the U. S.
			National Bureau of Standards.
		- The format of the Font data in this distribution
			was originally created by
				James Hurt
				Cognition, Inc.
				900 Technology Park Drive
				Billerica, MA 01821
				(mit-eddie!ci-dandelion!hurt)
	2. The font data in this distribution may be converted into
		any other format *EXCEPT* the format distributed by
		the U.S. NTIS (which organization holds the rights
		to the distribution and use of the font data in that
		particular format). Not that anybody would really
		*want* to use their format... each point is described
		in eight bytes as "xxx yyy:", where xxx and yyy are
		the coordinate values as ASCII numbers.
```

## Elsewhere on the site

- Clipper 6.4.2.2 (polygon unions and differences) is loaded from `../../shared/vendor/clipper.js` (Boost Software License 1.0; see that directory's `VERSIONS.md` and `LICENSES.md`).
- fontkit (glyph outlines) is loaded from `../../shared/vendor/fontkit.esm.js` (@pdf-lib/fontkit 1.1.1, MIT; see that directory's `VERSIONS.md` and `LICENSES.md`).
- The fonts in `../fonts/` are under the SIL Open Font License 1.1: `Inter-OFL.txt` (Inter 4.000) and `SourceSerifPro-LICENSE.md` (Source Serif Pro 3.001).
