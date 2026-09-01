# Pocket Language Guide

A browser app that typesets printable, pocket-sized vocabulary and phrase cards
for a pair of languages, and exports them as vector PDF, high-resolution PNG or
SVG. Everything runs client-side, so it works with the network off — which is the
actual use case: someone abroad without a data plan.

Live at `/pocket-language-guide/` on vetr.dev. Not linked from the site index yet.

## What it produces

A **sheet** is a set of **faces**. The default geometry is 7×5in faces of four
columns, printed double-sided on 5×7 photo paper; cut each sheet down the middle
and you have double-sided 3½×5in cards.

**How many faces is mostly a consequence, not a setting.** `spec.autoFaces` lets the
solver move the count, in pairs, because a double-sided sheet is two faces. It is
anchored on the card's natural count rather than minimised — with each field able to
shrink toward its own floor, "fewest faces" is always achievable by making
everything tiny, which nobody wants. So it moves off the anchor only for a reason:

- it gives up a pair only if the content still fits at full size, so losing paper
  never costs type size;
- it takes a pair while the type would otherwise sit near its floor.

The comfort threshold is set below the Japanese reference sheet's own 0.478, which
is a deliberately tight layout that should not be second-guessed. On 7×5in every
shipped pair settles on four faces — the answer both reference sheets reached by
hand. A6 takes six, and a credit-card sheet takes sixteen rather than printing at
minimum size.

Every column is flush at the top *and* the bottom, an item never splits across a
column, and a section heading is never stranded at the foot of one.

PDF is one file. PNG and SVG are one file *per face*, so a multi-face export is a
single zip (`core/zip.js`, store-only — the payload is already-compressed PNG, and
pinning the timestamps keeps identical input producing identical bytes). Calling
`download()` once per face, which is what it used to do, makes Chrome raise its
"Download multiple files?" prompt and gate all but the first. Export buttons take
themselves out of service and count faces as they go, because a 600dpi six-face
render takes seconds and the previous feedback was none.

## Architecture

One solver, one intermediate representation, two renderers.

```
SheetSpec  (language pair + content selection + geometry + paper + theme)
    │
    ├── core/measure.js ── fontkit shaping, advances cached in em units
    ▼
core/solve/*  →  LayoutPlan { faces[{ rects, runs, icons, hits }] } + warnings
    │
    ├── render/svg.js   live preview AND .svg export AND the PNG source
    └── render/pdf.js   vector PDF, subset fonts, selectable text
              │
              └── render/impose.js   card split, duplex pairing, n-up  (plan → plan)
```

A `LayoutPlan` holds absolute point positions with text **already broken into
single lines**. Renderers therefore make no layout decisions and cannot disagree
with each other. The studio preview uses `render/svg.js` — the same code as the
export — with a transparent hit-box layer for interaction, so what you see is
what you download.

`core/sheet.js` is the single entry point that wires corpus, fonts, measurer,
theme, join and solve together. Going around it is how you forget to load a font.

A solve costs 0.4-2.0s depending on the pair, and two things keep it there as the
corpus grows. Atoms are memoised by scale, because they depend on the type scale
and the column width but not on how many columns there are — so every candidate
face count can share them. And the face search asks "does the comfort threshold
fit?" rather than running a whole fit search per candidate: those are the same
question, since the fitted scale is the largest one that fits and fitting is
monotone in scale. One measurement instead of a search, at the same scale every
time. Together they took the fully translated Japanese sheet from 3.4s to 1.9s
with byte-identical output.

### Why fontkit for measurement

The solver needs advance widths; the PDF needs glyph ids. Both come from the same
`@pdf-lib/fontkit`, in the browser and in Node, so preview and export agree by
construction rather than being held in sync by a test. Arabic really is shaped
(GSUB/GPOS), which `tests/measure.test.mjs` asserts.

## The data model

**An entry is not a language pair; it is one language's realization of a
language-independent concept.** So the corpus is O(N) files, not O(N²), and any
pair is a runtime join on `concept_id`:

| Path | Holds |
|---|---|
| `data/registry/` | languages (with the countries each is spoken in), scripts, sections, paper/printer presets, regions |
| `data/concepts/<group>.csv` | the language-independent concept bank: importance, coverage cluster, slot count, template |
| `data/lang/<bcp47>/<group>.csv` | one language's `text`, romanizations, IPA, confidence, provenance |
| `data/respell/overrides/<target>__<source>__<accent>.csv` | pronunciations spelled for a reader of the *source* language |
| `data/themes/` | type scale, palette, item templates |
| `data/fonts/` | generated subsets + `manifest.json` |
| `packs/<target>__<source>/` | pre-rendered PDF, face PNGs, thumbnail |

A language's `text` serves as the **target** when someone is learning it and as
the **gloss** when someone is reading it, which is what collapses the pairwise
explosion. Adding a language is one directory; every pair with it then works.
Informal respellings key on the source language and accent, not the pair, so one
set of `en-US` rules serves every English reader.

`data/coverage.json` is generated by the validator and drives the gallery, because
declared status is intent and coverage is fact: a language with no rows must never
offer a button that yields an empty sheet.

**Some content belongs to a country, not a language.** `data/registry/regions.csv`
holds local emergency numbers, and the sheet prints them under the emergency
heading exactly where the reference sheet did. They carry a `confidence`, a
`source` and a `verified_at`, and only `confidence >= 2` is printed: wrong numbers
here are worse than none, so unreviewed ones are withheld and the studio says so
rather than quietly leaving a gap. The validator refuses a confidence claim that
comes without a source and a date.

## The solver

`core/solve/` in dependency order:

- **`atoms.js`** — blocks become *atoms*: indivisible vertical material with a
  height and, optionally, its own painting in local coordinates. A heading is
  **fused** with the first rows it introduces, which makes a stranded heading
  structurally impossible rather than a penalty to tune. Measurement and per-row
  width solving happen here exactly once.
- **`rowsplit.js`** — column widths inside an item. Phrase rows solve per row so a
  long phrase can borrow width from a short gloss; reference tables solve one
  split for the whole group.
- **`columnbreak.js`** — assigns atoms to columns with an exact dynamic program.
  Ordered breakpoints minimising `Σ slack² + Σ breakPenalty` is Knuth–Plass one
  level up, so it is solved the same way rather than by a greedy fill.
- **`justify.js`** — clamped water-filling distributes each column's slack across
  its interior gaps in proportion to their stretch weights, with a per-gap
  ceiling so a loose column spreads evenly instead of opening one canyon.
- **`index.js`** — resolves the two free variables. With a fixed face count,
  auto-fit binary-searches the largest type scale that still fits, seeded
  analytically (content height rises roughly with the square of the scale, since
  column widths are fixed). With faces on auto, the content height at the smallest
  legible type gives a hard lower bound on the count — nothing fits in fewer,
  however the type is set — so the search starts there rather than at two, and the
  first count that works is the answer. That is usually one auto-fit, not several.
  The plan reports the geometry it settled on, which is how the panel can say
  "Auto · 4". When nothing fits, it
  searches for geometries that would -- more faces, then more columns, then
  shedding the least important sections -- **verifies each before offering it**, and
  attaches them to the warning as one-click fixes. It declines to offer what will
  not help: A6 gets "use 6 faces" but not "use 3 columns", because three columns
  that narrow still cannot hold the content.

  The legibility floor is per field, not per sheet. Each field is written in its
  own script, and a romanisation reads fine at 4.4pt where Han needs 5pt. Applying
  the target script's floor to everything pinned the whole sheet to the strictest
  script it contained and left auto-fit almost no room -- the difference between
  0.958x and 0.899x, which is the difference between working and breaking on any
  small change.
- **`arrange.js`** — how an item's fields sit inside its own box: side by side (the
  reference's target-left, reader-right pairing), one line, or one field per line.
  Only per-row templates are rearranged; a reference table is already one line of
  four columns and its whole point is that every row aligns.
- **`weights.js`** — proposes items to fill leftover whitespace. Value decays with
  each item already taken from the same coverage cluster, so a sheet with "Hello"
  gains little from "Hello (polite)". Results are a reviewable diff with a stated
  reason per item; nothing is applied without a click.

Everything is deterministic — stable ordering, no randomness — so the same spec
always produces the same sheet, and the committed packs never churn.

## Pages

Three separate HTML entry points rather than one SPA, so the gallery loads fast
and offline on a phone without paying for the solver, `pdf-lib` or a CJK font.

- **`index.html`** — gallery. Cards keep a fixed header: the flags sit in a grid to
  the right of the name, which is already two lines tall, and are capped at four
  cells so a language spoken in eight countries does not get a taller card than one
  spoken in two. The action buttons stay on one row for the same reason. Reader
  language auto-detected from
  `navigator.languages`, with the picker's label cycling through "I speak" in each
  language we can gloss into so a visitor who reads none of the others still finds
  it. Each card carries a script-glyph badge and the flags of the countries the
  language is spoken in — Windows draws no glyph for regional-indicator pairs, so
  `ui/flags.js` detects support and falls back to country-code chips rather than a
  row of letter boxes. Per-card *Save offline*.
- **`sheet.html`** — presets and export, for people who do not want the studio.
- **`customize.html`** — the studio: format (20%) · faces (50%) · content (30%).
  Faces open as a grid, click one to focus it with the rest as a thumbnail strip.
  Clicking a row on a face reveals it in the content tree and vice versa. The
  tree is built once and updated in place so scroll position and expanded
  sections survive a re-solve.
  - **`ui/quiz.js`** — the banner's *Help me decide*. Three questions set the
    things a newcomer cannot guess at: which sections earn their space, whether
    romanisation and respelling are useful or noise (a reader who knows the script
    needs no respelling; one with no script needs little else), and whether to
    prefer more items or larger type.
  - **`ui/format-panel.js`** — the left panel. It owns the spec fields it controls
    and reports changes as patches, so nothing reads values back out of the DOM;
    that is where a dragged margin used to get overwritten by a dropdown. Choices
    about shape are drawn rather than described (`ui/glyphs.js`): card sizes at true
    proportions with their columns in them, faces as that many little pages, row
    spacing as bars at that spacing, ink modes showing what each gives up, entry
    layout as a miniature of the entry. Captions stay — a 3-column A6 and a
    3-column 6×4 differ only in proportion, and nobody should have to hover to tell
    them apart. Only genuinely list-shaped choices (paper, language, romanisation,
    destination country) remain menus.
  - **`ui/handles.js`** — drag bars on the focused face for margins and the column
    gaps. Dragging shows a guide and a readout but does not re-solve, since a solve
    takes a few hundred milliseconds; geometry is committed on release. There is one
    bar per gutter rather than one at the first: every column is the same width, so
    the only thing a gutter can change is the gutter, and widening it narrows every
    column. The readout gives the resulting column width, because "gap 17pt" does
    not make it obvious the text is being reflowed.
  - **`ui/add-term.js`** — adding one phrase should not require exporting a CSV and
    importing it back, so this writes the same `edits.extras` entry an import
    would. The two paths are the same path.

## Typeface, and what "font options" costs

`spec.typeface` is `sans` or `serif`. Stack names gain a suffix -- `latin` becomes
`latin-serif` -- and a variant we do not ship falls back to the sans face rather
than failing: a serif sheet with one sans column is a compromise, a crash is not.
Noto Serif carries a width axis, so its dense tables get the same condensed
treatment the sans ones do.

Every stack a shipped language needs now has both variants, including
`cjk-jp-serif` (Noto Serif JP), which was the one place the fallback was visible:
choosing Serif with Japanese silently kept sans kanji. The fallback stays because
it is the right behaviour for the next script somebody adds, not because anything
currently relies on it.

Subsetting a variable font requires pinning *every* axis. Leaving one free keeps
`fvar` and `gvar` alive, and subsetting a partially-instanced font trips over
glyphs `gvar` never carried.

## Themes and accessibility

`data/themes/latex-reference.json` is the reference palette: five semantic colours,
transcribed from the original.

`data/themes/cvd-safe.json` exists because section colour is the sheet's main
category cue, and the reference palette collapses under red-green colour
blindness — blue and purple are near-identical under both deuteranopia and
protanopia. Its five colours maximise the minimum pairwise separation under
simulated deuteranopia, protanopia and tritanopia, subject to at least 4.6:1
contrast on white (which a 0.92pt rule and 5.5pt bold type need): worst-case
separation 0.148 against the reference's 0.019. The cost is semantic — green
cannot coexist safely with red, so transport and outdoors lose it — which is why
this is an alternative a reader chooses, not the default. Headings keep their
icons and titles, so colour is never the only cue.

Each theme has both a `description` (prose) and a `note` (the note-template
style). These once collided as one key and JSON silently kept the last;
`tests/theme.test.mjs` now asserts the shape.

Every section has an icon, so the tree and the sheet both carry a shape as well as
a colour. Five sections had none and fell back to an 8pt coloured square, which is
the one place the coding *was* colour alone. Those five are level-2 headings, which
the reference sheet prints without a mark, so their icons appear in the studio and
not on the page.

### Right-to-left

Arabic is the first RTL target, and it found two things.

`paintField` walked pieces left-to-right regardless of direction, so every
multi-word Arabic phrase printed with its words in the wrong order — "as-salām
ʿalaykum" came out as "ʿalaykum as-salām". An RTL line starts at its right edge,
and because a piece's trailing space sits to the *left* of its word, the ink is
flushed to the right of its advance box rather than the left.

The renderers also disagreed about what `run.x` meant: SVG's `direction="rtl"`
anchors text at its right edge, pdf-lib anchors at the left. One plan, two
drawings — which defeats the point of having a plan. `run.x` is the left edge in
both now, and dropping the attribute also stops SVG reversing a numeral piece.

What is *not* handled is bidi proper; see "Deliberately not built yet".

### Interface language

The interface language is the reader's **own** language -- the one already chosen in
the header and persisted -- not a separate setting. Somebody who reads Korean wants
a Korean interface and Korean glosses; asking twice would be asking the same
question twice, and it makes the picker that was already there do something more
useful than it did.

`data/i18n/en.json` is the source of truth and holds every key. Every other
catalogue is a *partial overlay*: a key it omits falls back to English rather than
rendering a bare key, so a half-translated language degrades to a mixed interface
instead of a broken one, and a language with no catalogue at all is simply English
-- exactly what it was before. Static markup carries `data-i18n="key"`; anything
built in JavaScript calls `t('key', vars)`. Both read the same catalogue, so a
string lives in one place regardless of which side of that line it is drawn on.

Three decisions worth keeping:

**Placeholders, never concatenation.** `t('studio.status', { faces, scale })`, not
three fragments glued together. Word order is exactly what differs between
languages, and `4 faces at 0.87x` cannot be reassembled correctly in Japanese or
Arabic from parts chosen for English.

**No plural machinery.** English switches `column`/`columns`; other languages have
different rules, and CLDR plural categories are far more apparatus than this needs.
So the strings are phrased to need no agreement -- "Some columns could not be filled
evenly ({count})" rather than "{count} column(s)". That is a constraint on the
English, and it is cheaper than the alternative.

**Language names come from the platform.** `Intl.DisplayNames` already knows every
language's name in every locale, which is a better answer than carrying sixteen
names across eight catalogues and keeping them in step.

The solver cannot translate -- it has no business knowing what language the
interface is in -- so a `Warning` carries a stable `code`, the English `message`
(which is also what the Node-side scripts print), and a `params` object. The UI
looks up `warn.<code>` and interpolates. A code with no catalogue entry falls back
to `message`, so a warning is never lost to a missing key.

`npm run i18n` checks the catalogue against the code: a key referenced but not
defined fails the build, because the reader would see the bare key. A key defined
but never referenced is only reported -- it wastes a translator's time rather than
breaking anything, and it is the normal state while a catalogue is written ahead of
its call sites. The same script reports each language's coverage.

Right-to-left needed almost nothing: the stylesheet was already written in logical
properties (`padding-inline`, `border-end-start-radius`), so setting
`document.documentElement.dir` mirrors the whole interface with no overflow. The one
physical offset left is the drag handle's, and that is sheet geometry rather than
interface direction.

### The keyboard contract

The app was effectively mouse-only: eleven segmented controls declared
`role="radiogroup"` and a roving tabindex but had no key handler, and the page
canvas had ninety-five interactive targets and no focusable node at all.

There are three roving-tabindex widgets now — the settings groups, the face
chooser, and the rows on a face — and they answer arrows, `Home` and `End`
identically, because a reader should not have to learn three sets of keys. The
index arithmetic is four lines in `ui/keys.js`, shared rather than reimplemented.

The canvas deliberately spends **two** tab stops, not ninety-two: the face chooser
is one stop and the row layer is another, with arrows moving inside them. Ninety
stops would wall the content panel off behind the canvas, and the count would vary
with the layout (a credit-card sheet has fourteen faces), so the tab order would
depend on the geometry. `role="toolbar"` for the face choosers, since that is the
pattern that sanctions roving tabindex over buttons; `listbox`/`option` for the
rows, since position-in-set is genuinely useful over ninety of them.

One consequence worth knowing: every node in the canvas is replaced on each
render, so choosing a face would otherwise drop a keyboard reader back to the top
of the document. `focusMark`/`refocus` in `ui/preview.js` carry focus across the
rebuild in terms that survive it.

The gallery's `I speak` collage is decoration — one idea repeated in five
languages — so it is hidden from assistive technology, which also stops it from
becoming the language select's accessible name (it computed to the entire
collage). Its opacity floor is 0.62, giving 3.28:1 against white, rather than the
0.16 that rendered the faintest layer effectively invisible. Five distinct steps
remain, so it still reads as a fade.

## Type size is not one multiplier

The reference sheets prove a single scale is the wrong knob. The Mandarin edition
sets its smallest Latin at 4.73pt; the Japanese one goes to 4.44pt while keeping
Japanese *larger*, because Latin stays readable smaller than kanji does. Scaling
every field in lockstep cannot express that, and with a uniform scale the Japanese
corpus needed six faces where the reference fits four.

So below the nominal size each field travels toward **its own** floor:

```
scale >= 1 :  size = nominal * scale
scale <  1 :  size = floor + (nominal - floor) * scale
```

Scale 1 is the theme's size, scale 0 is every field at the smallest its script can
carry, and the two meet continuously. `data/registry/scripts.csv` holds the floors:
4.4pt Latin, 5.0pt Han and Japanese, 5.4pt Devanagari and Thai. Nothing can render
below its floor now, so there is no separate "scale floor" to compute and no
below-minimum warning to emit — the only remaining case is paper so coarse that its
minimum exceeds a theme size, which is reported.

On the Japanese pack this lands at 4.79pt Latin over 5.27pt Japanese: four faces,
like the reference, and a little more legible than the reference's own 4.44pt.

## Spacing

The reference sheet's item padding is essentially zero: consecutive rows are held
apart by a 0.22pt rule and nothing else, which reads as cramped at print size.
`spec.density` adds separation above and below each item, between the two lines of
a stacked cell, and around headings, scaled with the type so it stays
proportionate when auto-fit changes the size. The default is 0.7pt — airier than
the original, at the cost of about 7% of the type scale.

## Print and paper

`data/registry/paper.csv` carries per-preset facts that change the layout:

- **Borderless overspray.** Epson borderless enlarges the image ~2.5% to guarantee
  bleed, so the outer edge is cropped; the safe area is inset by half the
  enlargement per side, and the studio says when it widened your margins.
- **Media.** Hairlines and 4.5pt italic hold on photo stock but bleed on plain
  paper, so `min_rule_pt` and `min_size_delta` are per-media and feed the
  warnings.

`render/impose.js` is all plan → plan transforms. `splitCards` halves each face and
pairs the halves for duplexing; which half backs which depends on the axis the
printer flips about, and getting it wrong is only discovered after cutting, so
both orders are offered. `long-edge` pre-rotates each back via a page-level
rotation. `nUp` tiles faces onto Letter or A4 with trim marks.

Choosing a cut turns the canvas into a **duplex check**: each card with its own
back laid over it in red, its shading and rules dropped so the front stays
readable. If the red words belong on the back of the black ones the flip setting
matches the printer; if they are the same column twice, it does not. That is
cheaper to learn there than after cutting.

## Build steps

The shipped app has **no build step** — plain ES modules, opened by any static
server, matching the rest of the repo. Three generators produce committed
artifacts, following the `ceo-salary-benchmark/scripts/` precedent:

```bash
npm run vendor      # esbuild → vendor/{fontkit,pdf-lib}.esm.js  (rarely)
npm run icons       # Lucide SVG → data/icons.json, normalised to path data
npm run prerender   # solve + render → packs/  (after any corpus or engine change)
                    #   thumbnails only, one per pair: 56 pairs in 7.2MB
npm run shell       # data/shell.json + the respell index + sw.js VERSION
python3 scripts/fetch_fonts.py && python3 scripts/subset_fonts.py   # data/fonts/
```

`scripts/latex_corpus.py` reads the reference XeLaTeX sheets;
`scripts/port_latex_corpus.py` seeded the corpus from the Mandarin one, and
`scripts/port_language.py` merges each later sheet into it. Both are kept because
they document where every row came from.

Merging is the data model earning its keep. The Japanese sheet contributed 366
rows: 312 matched concepts that already existed and 54 were new. Matching is on a
normalised English gloss, against the exact section first and then its group,
because two sheets can file the same phrase under different panels ("Can I charge
my phone?" is hotel basics in one and hotel requests in the other).

The bank is now **751 concepts across 57 sections in eight languages**, which is
**56 ordered pairs** — every one of which renders, and only eight of which anyone
wrote a sheet for. That ratio is the whole argument for joining on `concept_id`
instead of storing pairs.

The expansion past the two hand-built sheets was done by ten agents: three
designing new content against non-overlapping scopes, then one per language
translating the whole bank. Two details of that are worth keeping.

First, the gaps were concrete. "Toilet" appeared **zero** times in the original
413 concepts. Pharmacy and police had one phrase each. `directions` had four items
at importance 0.94. There was nothing about obtaining money, crossing a border,
accessibility, or what to say to police to get a report an insurer will accept.

Second, external verification changed the wording rather than confirming it, which
is why it was worth doing: dispatchers are trained on "anaphylaxis" and not
"severe allergic reaction", and the equivalent term differs from the clinical one
in every language; German `Meeresfrüchte` excludes fish, so "no seafood" has to
enumerate or it is a potentially fatal allergy mistranslation; Arabic `لبن` is milk
in Egypt and yoghurt in the Levant; Spanish `coger` is obscene across most of Latin
America; Korean `간질` was replaced in law and now carries stigma; and tipping
questions ask what is customary rather than how much, because in Japan, China and
Korea the answer is "nothing".

### Concepts that are not universal

Two columns keep a growing bank from wrecking the sheets it feeds.

`applies_to` on a concept limits it to particular targets. The bank was seeded from
Chinese and then Japanese sheets, so Chinese measure words, the yuan, Japanese
counters, a Chinese land-use category and "please write it in Roman letters"
arrived dressed as universal entries — and the Spanish sheet printed all of them.
Four translation agents flagged it independently before it was fixed.

Four concepts went further and hardcoded a language *name*: "I do not speak
Chinese" and "I do not speak Japanese" were separate entries. Invisible with two
languages, since each sheet carried only its own; with eight, the Spanish sheet
printed both. They are now one concept each, glossed "I do not speak this
language", and every pack renders it self-referentially. Before the merge the
Korean sheet had no way to say "I do not speak Korean" at all.

`default_on: 0` on a *section* keeps it off the default card while leaving it one
click away. A pocket sheet holds less than the corpus does, and it should: seven of
the thirteen new sections are things a traveler needs once (customs, buying a SIM)
or only if they apply to them (chronic medication, children, accessibility). The
onboarding quiz turns them on from `audience_tags`.

One consequence worth knowing: for a concept both sheets carry, the row order
comes from whichever sheet was ported first. Order within a section is authored
intent, and the later sheet's is partly lost. Per-language ordering would need a
rank column in every language file, which has not seemed worth it yet.

Types are enforced without a build: JSDoc annotations plus `jsconfig.json` with
`checkJs`, checked by `npm run check` (`tsc` emits nothing).

`sw.js` precaches the shell, but it no longer carries the list. That list was
hand-written and drifted immediately: seven modules were missing, so the studio
would have failed with the network off — the one situation the app exists for.
`npm run shell` derives it from what is on disk into `data/shell.json`, sets
`VERSION` to a content hash of those files so a deploy re-primes the cache with no
one remembering to bump anything, and writes
`data/respell/overrides/index.json` — the list of hand-curated respelling files,
so the app stops asking for triples nobody wrote. `npm run check` runs the same
script with `--check`, which fails if either file is stale.

## Testing

```bash
npm test          # validate → check → node:test → playwright
npm run validate  # corpus schema, NFC, orphan ids, safety gates
npm run check     # tsc --noEmit over the JSDoc types
npm run test:unit # solver invariants, measurement, CSV, imposition, weights
npx playwright test
npm run preview -- --scale auto   # rasterise the faces to look at them
```

Unit tests assert the invariants the product promises: no column overflows, every
atom placed exactly once in authored order, columns flush within a point at the
fitted scale, identical output for identical input. Browser specs drive the real
pages, including a PDF export with the network switched off. `tests/render.spec.js`
renders the same plan through both renderers and compares ink, which is how a
dropped glyph or an unloaded font gets caught.

## When a load fails

Offline is the primary use case, and the state between "online" and "offline" is
the one that bites: a warming CDN or a dropped connection fails *some* requests.
The app used to carry on through that. A 503 on `data/lang/ja/social.csv` printed
a sheet quietly missing a whole section -- possibly Emergency -- and a 503 on a
`.woff2` printed one typeset in a fallback face whose advances differ from the
ones every box was measured against, because measurement reads the `.ttf` and
display reads the `.woff2`.

Both now refuse. `isMissingFile` in `core/pack.js` separates *absent* (404 in the
browser, ENOENT in Node) from *unreachable*: a draft language genuinely has no
file for some groups and that is fine, while anything else is a failure to fetch
rows that exist. `ensureFontCss` checks the faces it actually asked for -- not
every face in `document.fonts`, which still holds the previous typeface's -- and
names the ones that did not arrive. `tests/offline.spec.js` asserts both, and
asserts the page recovers once the network does.

For a print artifact, refusing beats printing something subtly wrong.

## Deliberately not built yet

Named so nobody has to rediscover the gap:

- **Corpus beyond the eight shipped languages.** Portuguese, Hindi, Thai, Russian,
  Indonesian, Swahili, Turkish and Vietnamese are registered with no rows. Nothing
  offers them: `hasContent` reads `data/coverage.json` rather than the declared
  status, so a language with no data cannot be picked as a target or a gloss, and
  the gallery shows it as "help translate".
- **Digits inside right-to-left text.** The renderer shapes a run right-to-left as
  a whole and nothing here implements the bidi algorithm's rule that digits stay
  left-to-right inside it, so Arabic-Indic `١٠` printed as `٠١` and `١/٢` as `٢/١`.
  The validator now refuses more than one digit in an RTL row and says why; the
  five Arabic numeral rows carry the spelled-out word with the numeral in
  `text_alt`, which is what its translator proposed. Fixing it properly means
  splitting a piece into bidi runs, which changes measurement, so it is deferred
  rather than hidden.
- **Gendered self-description.** Arabic rows use the masculine singular, and
  Spanish and German prefer genderless constructions where one exists and `/a`
  where it does not. Encoding both would double the corpus for a card that has no
  room for it.
- **Emergency numbers for most countries.** 14 of 49 regions are marked reviewed;
  the rest carry plausible numbers at `confidence: 1` so a reviewer has something
  to check rather than research from scratch, and are withheld from sheets until
  someone raises them.
- **IPA.** The reference sheet carried no IPA, so the `ipa` column is empty
  throughout. The respelling transducer (`data/respell/<src>/rules.yaml`) that
  would consume it is therefore also unwritten; `zh-Hans → en-US` respellings ship
  as the hand-curated override layer they already were.
- **Dictionary line breaking** for Thai and Khmer. `scripts.csv` marks them
  `word_break: dict`; the measurer falls back to breaking anywhere and the solver
  raises a warning, rather than pretending.
- **UI translation.** `ui/` strings are English. A free global resource needs its
  own chrome translated and RTL-mirrored.
- **Per-row split overrides.** The drag handles cover margins and the column gap;
  dragging an individual row's internal divider would need per-row overrides
  threaded through `atoms.js`.
- **A reviewer queue.** `content/CONTRIBUTING.md` defines the confidence tiers and
  the validator enforces the safety gate, but there is no review UI.

## Notes worth keeping

Three failure modes here were silent rather than loud, and the fixes are load-bearing:

- **fontkit's subsetter drops glyphs carrying TrueType hinting instructions**, so
  the exported PDF lost most of its Latin while CJK survived. `subset_fonts.py`
  strips hinting, which is irrelevant at print resolution anyway.
- **Chrome will not load `file://` subresources from an `about:blank` document**, so
  rasterising via `setContent` fell back to a default font and produced output
  that looked subtly wrong rather than obviously broken.
  `scripts/local_page.mjs` serves from a virtual origin and fails loudly.
- **Reference tables need a condensed Latin face.** Without the equivalent of the
  original's `\tablelatin`, four columns cannot hold a gloss and a respelling on
  one line. Separately, refusing to break at an *existing* hyphen made
  "jong-dyen-jahn" reserve its full natural width and squeeze every other column;
  allowing it cut one table's height by 39%.
