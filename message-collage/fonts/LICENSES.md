# Bundled fonts

Five families, each with plain, bold, italic and bold-italic faces, all under the SIL Open Font
License 1.1. `../core/fonts.js` lists which file is which face. A page loads only the faces its
request uses.

| Family | Kind | Version | Faces here | Licence |
| --- | --- | --- | --- | --- |
| Source Serif Pro | serif | 3.001 | italic, bold italic (plain and bold are `../../name-tags/fonts/`) | `SourceSerifPro-LICENSE.md` |
| Inter | sans-serif | 4.000 | italic, bold italic (plain and bold are `../../name-tags/fonts/`) | `Inter-OFL.txt` |
| Courier Prime | monospace | 3.018 | all four | `CourierPrime-OFL.txt` |
| Lobster Two | script | 1.006 | all four | `LobsterTwo-OFL.txt` (Reserved Font Names "Lobster", "Lobster Two") |
| Playfair Display | display | 1.203 | all four | `PlayfairDisplay-OFL.txt` (Reserved Font Name "Playfair Display") |

## Sources

Each file here is the upstream TrueType file re-encoded as WOFF2 with fontTools 4.64.0
(`fonttools ttLib.woff2 compress`). WOFF2 is a lossless container: every glyph's outline points
and advance width, as fontkit reads them, are the same as in the TrueType original (checked for
every code point of every face). The fonts' data and names are unchanged.

Upstream files:

- `SourceSerifPro-It.ttf` and `SourceSerifPro-BoldIt.ttf` from github.com/adobe-fonts/source-serif,
  release 3.001R, `TTF/`.
- `Inter-Italic.ttf` and `Inter-BoldItalic.ttf` from github.com/rsms/inter, release v4.0, `extras/ttf/`.
- `CourierPrime-*.ttf` and `LobsterTwo-*.ttf` from github.com/google/fonts at commit fbe8181,
  `ofl/courierprime/` and `ofl/lobstertwo/`.
- `PlayfairDisplay-{Regular,Bold,Italic,BoldItalic}.ttf`: Google Fonts' own static instances of
  Playfair Display (the family download from fonts.google.com, version v40). The repository has
  only the variable font.

SHA-256 of the upstream files:

```
fbbdabe510e6c0d94d1b0c67640d375b94c09899c8626b300df10cebf7ba3e16  SourceSerifPro-It.ttf
c358f1bd4345e5414a14884cf8cfebfb087227ae48f5e4ce26dcb4432e41e108  SourceSerifPro-BoldIt.ttf
d054d998ae12be33820b100e0ed3923d513fa5c79c6d4e7ca1953afeb262ea9b  Inter-Italic.ttf
5e606f805a71432d4875de7dab737bf9dea1187090f0a5190da9b1bbab09f57c  Inter-BoldItalic.ttf
72f793376f8e2841656bf21d77a5de010f2929bd6956a22ee848ad0c7eb978af  CourierPrime-Regular.ttf
ff1f38786c849d1c41fa8e447960abdb2bd75fdfb0cfcdeb524fad65a5af3638  CourierPrime-Bold.ttf
f1b9a5829789f7e56432a9f3bc7665ef4531dbba1c112639e48bef39621a006b  CourierPrime-Italic.ttf
3355273f3ea6d6362658f9564f4e83d59e156cf1a182e3c1592b5c5943627dcc  CourierPrime-BoldItalic.ttf
be3d8ce18188bc559de37e4355f5f902b4960a7b65a99efb78c03bb65bb782e6  LobsterTwo-Regular.ttf
5255b383fc8aa432e4e7e5f8005210477c0983370adc6ad6205c9bd2cd1ceb76  LobsterTwo-Bold.ttf
c727ae1d9e1e166a7c0679fcf79c2ff0c21bc5483ee253fdfee2f5792c0bebd9  LobsterTwo-Italic.ttf
980ee087455f1f0a96fb2ea74bef441a2bf29048e2c739d11683d330cfc19329  LobsterTwo-BoldItalic.ttf
861f838d481d28cbbd4793e45dc02f01d04c81e06ed98ab2779ca152ace9f27b  PlayfairDisplay-Regular.ttf
4f3b87b5aa297eed5e5a48dbd9941356ca0313d4725b02c29a298cb042b7b31b  PlayfairDisplay-Bold.ttf
40a6afa92220254c2c426ccef129d3615dd19e4c591fbfa997e5f28ebba8302c  PlayfairDisplay-Italic.ttf
db5737059ff617317aca97e9e35730f8933a2e187c75bbe2deaf45c4d72f5b1d  PlayfairDisplay-BoldItalic.ttf
```

The upright Inter and Source Serif Pro files in `name-tags/fonts/` are byte-identical to the same
releases' `Inter-Regular.ttf`, `Inter-Bold.ttf`, `SourceSerifPro-Regular.ttf` and
`SourceSerifPro-Bold.ttf`.
