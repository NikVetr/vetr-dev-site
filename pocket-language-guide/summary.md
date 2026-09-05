# Pocket Language Guide

A browser app that typesets printable, pocket-sized vocabulary and phrase cards
for a pair of languages, and exports them as vector PDF, high-resolution PNG or
SVG. Everything runs client-side, so it works with the network off — which is the
actual use case: someone abroad without a data plan.

Live at `/pocket-language-guide/` on vetr.dev, and linked from the site index.

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
is a deliberately tight layout that should not be second-guessed. On 7×5in, 196 of
the 380 pairs between the twenty full packs settle on eight faces and 181 on ten;
none now fits six, and three need twelve — `el ← hi`, `ru ← hi` and `hi ← ja`, where
Devanagari forces the column above the theme's size and the solver reports it rather
than clipping. Greek is the second-longest language in the set after Russian and takes
ten against every source; Hungarian is ordinary, eight against a Latin or Cyrillic
source and ten against the scripts that need vertical room. The tens are the scripts
that need the most vertical room: **every** Japanese, Arabic, Devanagari and Greek
sheet takes ten, and Hebrew seventeen of its nineteen — which the 1.20 leading factor
its pointed column pays for predicts — while no English or Vietnamese sheet needs one.

**The twelves have not moved through three language additions**, which is the check
that face count follows content rather than the language list — and the pairs that
*do* move show why. All 82 pairs involving Klingon or Quenya land at two or four
faces, because a partial pack has less to lay out on either side of the join: a sheet
whose *reader* is Klingon is short for the same reason a sheet whose subject is, since
a row with no gloss in the reading language cannot print. Those pairs were 28 at two
faces and 50 at four while both packs were still written in Latin; they are 2 and 80
now. **The native scripts cost them a face pair each**, and the number that did it is
`scripts.csv`'s `leading_factor` — 1.30 for tengwar against Latin's 1.02, measured off
the tehtar's own ink extents rather than chosen. The reference sheets reached four by hand against a
bank of 413 concepts. It is 813 now; the divider defaults to one position per section
rather than one per row, which costs type size; and — the largest of the three — the
respelling column has content on all 462 pairs rather than 16, so there is a third
line of type on every entry that used to have two. Eight is the same answer as four
was, at the new size, the new default and the new column. A credit-card sheet takes
sixteen rather than printing at minimum size.

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

**That pivot is what closed the largest gap in the project, and it is now closed.**
A respelling is written *for a reader* — `nee HOW` is Chinese for someone who reads
English and nothing else — so curating them by hand is O(N²), and for a long time
only the 16 pairs glossed into English had one while the other 256 printed an empty
column. The way out is two O(N) inputs instead: the `ipa` column of the language
being learned, and one rule table per language doing the reading. **All twenty-two
reader tables now exist and every one of the 462 pairs prints a respelling.**
`node scripts/respell_check.mjs <reader> --gaps` counts IPA symbols that reach the
page because no rule matched, and every reader is at zero. Twenty of the tables
derive from a published pronunciation key for that language (`content/RESPELL-SYSTEMS.md`
records which, and what had to be adapted where no key existed); the English one was
read off the 12,001 curated respellings already in the corpus, which is a better
source, because it records what a person actually chose for each sound in context.

**The nineteenth reader has the best key of the nineteen, and its author says he built
it the way we do.** Magay's *Idegen nevek kiejtési szótára* (Akadémiai Kiadó, 1974)
transcribes 40,000 foreign names into Hungarian letters, and its introduction records
that the manuscript carried **IPA for every entry, used as the pivot into Hungarian**,
suppressed in print for a general readership with a scholarly IPA edition promised and
never published. `respell(ipa, 'hu')` is that edition. The Academy prints the column
itself — AkH. 12 rule 13 is `Greenwich [grinics], joule [dzsúl]` — and Kontra's 1975
*Magyar Nyelvőr* article supplies an English chart already keyed on IPA.

Generated respellings sit *under* the curated ones, never over them: the sixteen
curated sheets are not mutually consistent — Mandarin's /ɕ/ is `sh` 103 times and
`sy` 58, with nothing in the IPA to tell them apart — so no deterministic function
can match all of them. One consequence worth knowing when reading a score from
`respell_check`: the curated layer covers every English-reader row, so for those 16
pairs the table is insurance against a future concept rather than what prints today.
The other 256 print the table's output directly.

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

### A cell that names a language

Seven concepts in the bank name a language, and the O(N) shape is exactly why they
were wrong. A row belongs to one language, so a row cannot know the pair — and the
seven cells that need to name one had it hardcoded. Two shapes, both worse than they
look:

- **`communication.do-you-speak-english` hardcoded English in all sixteen packs.**
  The phrase means "do you speak *the traveller's* language", so a Spanish traveller
  in France was holding up a card asking whether the waiter spoke English.
- **The gloss named the reader's own language.** `Je ne parle pas français` glossed
  as `Ich spreche kein Deutsch` — false, on 153 of the 306 pairs then shipped, rather than merely
  vague.

`{target}` and `{source}` fill from the pair, under one rule, and the narrower
version of it is where an implementation goes wrong:

> A placeholder names *which side* of the pair; the language it is **rendered in** is
> always the language of the cell it sits in.

So the French cell `Parlez-vous {source} ?` prints `espagnol` when French is the
target and a Spaniard is reading, and `français` when French is the source — because
then the source *is* French. One cell, both jobs. The alternative rule ("`{target}`
in the gloss, `{source}` in the target text") cannot express that, because it assumes
a cell only ever plays one of the two roles.

Two properties fall out and are worth keeping. A substituted cell can never contain a
script its own font stack cannot draw, since a language only ever names another in
its own words — so this cannot reproduce the row of empty boxes the Mandarin note
printed. And a `note` needs neither placeholder: it prints source-side only, so both
would resolve to constants and prose is clearer.

Filled in `buildSheet`, immediately after the two `loadLanguage` calls. Five places
downstream read these cells, and the one that would hurt is `solve/weights.js` — it
*measures* candidate rows to decide what fits, so an unfilled placeholder there makes
the balance solver offer a row of the wrong height.

`Intl.DisplayNames` answers most of it, with the script subtag dropped so nobody asks
about "simplified Chinese". `data/registry/language-names/<code>.csv` carries only
what ICU cannot: the Russian prepositional case, where no nominal frame takes
`английский` and there is not even a shared preposition (`по-английски` against
`на хинди`), and the romanisation of each name for the seven romanised packs. That
last table is the project's only O(N²) data, and it is affordable because it is a
table of *names* rather than of phrases — written once, independent of how many
concepts use it.

Respellings need no placeholder. They are already curated per pair, and they have to
be: the French `par-lay voo zahn-GLEH` carries a liaison /z/ that vanishes the moment
the language becomes `espagnol`, and the Arabic respelling has fused its preposition.
That is also the argument against ever *generating* a respelling from the target's
IPA.

`content/LANGUAGE-SLOTS.md` is the survey the fix was implemented from: all 112 cells
with their current text and a proposed frame, and the eleven that need a translator
rather than a noun swap.

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

  Most of what it can offer comes from the seven sections `default_on: 0` keeps off
  the default card, so a proposal is charged for that section's heading as well as
  the row, and accepting one row opens the section with only that row switched on.
  Sections the *reader* turned off stay off; that was a decision. It has to apply
  every filter `buildBlocks` applies, `applies_to` included — without that its
  candidate set was precisely the concepts that *cannot* render on the pair, so it
  proposed the Japanese yen on a Spanish sheet and ticking one changed nothing.

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
  row of letter boxes. The grid holds six, because French, Spanish and Arabic are
  each spoken in exactly six of the registry's countries and a grid two columns wide
  showed three and hid the rest behind a `+3`. The column count follows the cell
  count, so the block is two rows tall whether that is one column or three — which is
  the constraint that matters, since the title beside it is two lines and a third row
  would make one card taller than its neighbours. Only English overflows now, at
  eight, and it is the default reader so it is never in its own grid. Per-card
  *Save offline*.

  Clicking a thumbnail opens the lightbox (`ui/lightbox.js`) on the whole sheet:
  every face, one arrow key or one thumbnail click apart, at whatever size the
  window allows. The card is the only opaque thing on screen — no panel, no title,
  no caption — and everything else floats over the dim: the pair above it, a caret
  on each of the card's own edges (shown on hover, and dim at the ends of the
  series because there is nowhere to go), the thumbnails and the two buttons below.
  Both languages in the pair are controls and so is the mark between them, which
  grows a second head on hover because reversing the pair is what pressing it does.
  Changing the reader's language here changes it for the grid behind, so closing the
  lightbox never lands on a gallery that disagrees with it.

  Nothing that floats is drawn in a box, and that is a constraint rather than a
  preference: a panel over the card is a panel over the words, and the caret panels
  were sitting on two rows of the sheet. The carets are bare glyphs, ink rather than
  paper because they sit over white paper, with a halo of paper on hover so they
  separate from the type under them without covering any. The card and the strip
  share one grid column so their left and right edges are the same edges — only the
  card can state that width, since it is derived from its own height and the sheet's
  aspect, so the column takes it from the card. The two buttons divide the strip's
  height instead of setting their own. And the mark between the languages sits in its
  own grid track, because the two names are different lengths and centring the group
  put the mark off centre.

  This is the one place the gallery loads the engine, and only on the click. **The
  first face is a shipped asset and the rest are typeset**, which is a split decided
  by measurement rather than by preference.

  Laying out a sheet is about 1.2 seconds and *none* of it is network — the resource
  timings for a cold CJK open are all under 25ms — so it is arithmetic, and no amount
  of caching upstream would help. For that second the reader was looking at the 480px
  card thumbnail upscaled to card size and dimmed to 55%: honest about not being
  ready, and the thing that read as slow.

  Shipping whole sheets is still not affordable, and the reason the split works is
  that **SVG gzips about fourteen times**. A sheet is 1.5MB raw and ~118KB compressed,
  so 462 ordered pairs is 55MB even at best — but one face is 13KB, and 462 first
  faces is **6.0MB**. That is `packs/<pair>/face-1.svg.gz`, compressed in the
  repository rather than only on the wire, because these files are rewritten wholesale
  whenever the corpus or the theme moves and git would keep every revision. The
  browser inflates it with `DecompressionStream`, and since it is the same renderer
  over the same pinned fit, the face is byte-identical to the one the solve produces —
  so the swap when the sheet lands is invisible. **Measured: sharp vector at 151ms
  against a blur for 1050ms.**

  It is kept in its own slot rather than as a one-element face list, because the
  thumbnail strip and the paging carets are *shape*: driving them from the first face
  would have built one thumbnail and then eight, and resizing the foot after the fact
  is exactly what the reserved band exists to prevent.

  The inflate checks for the gzip magic bytes first. Some hosts answer a `.gz` with
  `Content-Encoding: gzip`, in which case `fetch` has already inflated it and
  `DecompressionStream` would throw — silently disabling this on the deployed site
  while it worked locally.

  The other thing pre-rendered is the expensive decision: fitting a sheet means
  searching for the fewest faces and the largest type that hold the content,
  re-measuring and re-breaking the whole sheet at a dozen candidate scales.
  `packs/index.json` already records the answer, so the lightbox pins it and lays out
  exactly once — byte-identical output, measured 10–12× faster, and
  nothing new shipped to buy it. A pinned fit is still a cached answer, so when it
  does not fit — which any change to the type or the spacing causes until the packs
  are re-rendered — it falls back to the search rather than drawing an empty card.
- **`sheet.html`** — presets and export, for people who do not want the studio. A
  deliberate subset, sharing the studio's controls so the two pages read as one app:
  card size, priority, typeface, breathing room, palette, ink and resolution. Card
  size and palette carry the same `Custom` rows the studio does, because a reader who
  wants 4×3in or their own section colours should not have to open the studio for a
  number this page can perfectly well take — and the CVD-safe palette in particular
  is needed *before* printing, since colour is the section encoding. The priority
  ladder is here for a positive reason rather than for completeness: the phone card
  plus its top step is a lock screen, and that is the one thing the quick path does
  better than the studio.
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
    layout as a miniature of the entry, and each shown column as the entry with that
    column's own words in it, taken from a real row of the pair being edited — so
    choosing whether to print romanisation shows you `wù` in the face it will be set
    in. The row is chosen rather than named (most columns filled first, then
    shortest), because naming a concept would be one more thing to keep in step with
    the corpus and because shortness alone picked a *numeral*, which fills three
    columns and illustrates none of them. Each field draws in the face that will
    actually set it, which is not the stack it sits in: romanisation runs down the
    target's side and is Latin regardless. A column the corpus has nothing for draws
    an empty dashed rule, which is how the interface finally admitted that `ipa` is
    empty in every language. Captions stay — a 3-column A6 and a
    3-column 6×4 differ only in proportion, and nobody should have to hover to tell
    them apart. Only genuinely list-shaped choices (paper, language, romanisation,
    destination country) remain menus.

    Every ladder is a set of opinions, not a set of limits, so each carries a
    *Custom* segment: a slider paired with a number box for the single-valued ones,
    two inch boxes for the card, and six colour swatches — the five section roles
    plus the ink — for the palette. Custom colours ride in `spec.themeColors` while
    `themeId` still names the theme underneath, because colour is the only part of a
    theme that can change without re-measuring anything.
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

### The focused card, and two symptoms with one cause

The face in the studio carries the *page's* aspect, and its overlays -- the hit boxes
and the drag handles -- are positioned as percentages of it. A `viewBox` inside an
element of a different aspect letterboxes, so if the box's aspect drifts the drawn
ink moves inside the element and the overlays do not follow. That produced two
complaints that read as unrelated: white bands down the outer edges of the card, and
row highlights offset from the rows they name.

The cause was `74vh` — a guess at how much height the card had, which knew nothing
about the toolbar above it or the thumbnail strip below. At the default panel widths
the *width* binds and the guess is never tested; drag the seams wide and the height
binds, the flex item is squeezed to the real height, and `aspect-ratio` loses. Then
the box is 1.546 where the page is 1.400 and the ink sits 56px from its own hit box.
The face now measures the room instead: a `.face-fit` wrapper is a size container and
the card takes `min(100%, 100cqh * aspect)`. `tests/studio.spec.js` asserts the aspect
and the ink-to-hit offset both at the default widths and after dragging both seams,
and fails on the old rule.

### Furniture

`spec.head` puts a line along the top or the bottom, in **three** positions, each
taking any number of slots joined with a bullet. It was two positions of one slot
each, chosen from a `<select>`, so a folio and the pair could not both print and the
middle of the band was unreachable. A saved spec may still hold a bare slot rather
than a list, and is read as a list of one.

Five slots: the folio, the pair, the region's emergency numbers, the reader's own
text, and the **pronunciation key**. The emergency line
breaks its digits out as separate runs and sets them bold and in the body ink: it is
the one piece of furniture somebody reads in a hurry, and a number in 5.2pt muted
grey is a number nobody finds. A part may not end in a space, because `measurer.width`
drops a trailing one -- `"110 "` measures exactly as wide as `"110"` -- so the spaces
are moved to the front of the following part, where they are counted.

**The band is set in the reader's face, and never below the reader script's own
floor.** `headSize` was the theme's smallest field size flat, which is 5.22pt where
`scripts.csv` asks 5.4 for Arabic, Devanagari, Thai and tengwar. That cost nothing
while every slot that shipped was effectively ASCII -- a folio, an emergency number, a
Latin exonym -- and the pronunciation key is the first one that sets reader-language
prose there, which is exactly what the floor is for. The floor test in
`tests/solve.test.mjs` missed it because every spec it solves has `head.at: 'none'`,
so a second test asserts the band itself.

**The band is off by default, with the folio already ticked inside it.** Turning it on
was measured rather than assumed, and re-measured when the pronunciation key gave it
something worth carrying: it costs 1.5 lines of the smallest type on the sheet, the
fit search pays 0.05-0.09 of type scale on most pairs, and `es <- en` takes a whole
extra *pair* of faces -- one more sheet of photo paper per card set, for a page
number. On an Arabic, Devanagari or Thai reader's sheet it cannot be paid for in type
size at all, because that reader's respelling is already sitting on its own 5.4pt
floor -- so it is paid for in faces instead, and `zh-Hans <- ar` goes from eight to
ten. So the choice is one click away and not made for the reader.

**What the quiz does instead is tick it where the card's romanisation carries a mark.**
That is four of the twenty-two targets, so eighteen pay nothing, and `es` -- the pair
that costs a face pair -- has no romanisation at all and therefore never pays. The
respelling key rides along in the same slot when the band is on for that reason. The
band is *added* to whatever the reader had rather than replacing it: unlike the field
set and the selection, which the quiz deliberately resets, the other slots are
choices, and one of them is the local emergency number.

### The pronunciation key is two keys, and only the columns that are on get one

The card has two columns nobody can read unaided, and they are keyed in opposite
directions. The **respelling** is written *for the reader* and comes from the `legend`
field of `data/respell/rules/<reader>__<accent>.json`, in the reader's own language.
The **marks in the romanisation** belong to the *target* and come from
`data/registry/romanizations.csv`. One slot carries both, joined with the same bullet
the band joins slots with, and each half prints only when its own column does -- which
repaired a live defect: the slot printed the respelling key whether or not the
respelling column was shown, so a reader who answered "I can read the script" in the
quiz (`proficiency: 'reading'`, which drops `respell` and keeps `roman`) got a key for
a column that was not on their card and none for the column that was.

Raised by the Vietnamese translator, and the hazard is specific: pinyin's caron `ǎ` and
Vietnamese's breve `ă` are near-identical at 5pt and pinyin's macron is not a
Vietnamese mark at all, so a Vietnamese reader is uniquely primed to read a tone mark
as a vowel-quality mark. **They will not misread the words; they will misread the
tones, silently.** The same shape runs the other way -- Thai and Chinese readers read
any superscript mark as a tone, which is why both packs dropped macron Hepburn for
doubled vowels -- so a legend lets those packs keep the standard romanisation instead
of routing around it.

Three things about the shape are decisions rather than details.

- **The romanisation line is a prose-free glyph equation**, so one string serves all
  twenty-two readers: `ā á ǎ à = 1 2 3 4` for pinyin, `ā ī ū ē ō = aa ii uu ee oo` for
  Hepburn. A per-reader prose line is six systems by twenty-two readers, it is longer
  in a band whose cost is the whole issue, and it cannot be reviewed in most of the
  languages it would ship in. It is also the project's own precedent: Bhargava's
  four-word legend, which `content/RESPELL-SYSTEMS.md` holds up as *the* pattern for
  this, is a glyph equation and not a sentence. The right-hand side is what to say if
  you cannot make the distinction, which for `iast` is the mark-free Hunterian the
  registry already names as Hindi's second system.
- **It is keyed on (target, system), not on the system.** `bgn` names two different
  systems in `languages.csv` and, read off the corpus, they share no mark: Russian's
  `ʼ ˮ ë` against Hebrew's `ẖ ‘ ’` and its acute. Rows exist only for the four systems
  whose marks carry a *misreading* hazard -- `pinyin`, `hepburn`, `iast`, `ala-lc`. The
  Russian and Hebrew `bgn` marks and Quenya's `appendix-e` were left out on purpose:
  they are native stress or vowel-quality marks that a reader misreads in the benign
  direction, dropping information rather than adding error, and a line for them would
  have to introduce a word for "stress" -- which is what breaks the prose-free
  property. `elot`, `rr`, `rtgs` and `okrand` carry no diacritic at all.
- **That half is drawn in the Latin face rather than the reader's**, which is the fifth
  instance of the tofu class below and is why `HeadPart` carries a `latin` flag. It
  costs nothing, because `stacksFor` loads `latin` for every pair anyway to set the
  romanisation and the IPA.

Nine of the twenty-two reader tables had a `legend`; the other thirteen have one now.
Each is a transcription of a decision already recorded in that table's own `note`
rather than a new one, held to RESPELL-SYSTEMS.md's rule that a legend teaches only
the glyphs that are not already ordinary orthography and that anything needing a
second line means the notation is wrong. **`th`'s was English prose *about* the legend
rather than a legend**, so a Thai reader's band read "None. Every glyph in the output
is ordinary Thai used for its ordinary sound…" in English; it is Thai now.
`validate_data.py` checks every one of them against the stack that draws it, which
nothing did before -- the nine that already existed had never been read by a face.

### One shape at a time inside a section

A row's template comes from its concept, and a section mixes them freely -- `toilets`
is fifteen phrases and ten words. `buildBlocks` already grouped *consecutive* rows of
one template into a run, so in rank order the two shapes alternated row by row: a
phrase in two columns with its respelling underneath, then a word in a three-column
grid with the respelling beside it, then another phrase. The concepts are now stably
sorted by template within their section, `entry` first, so a section reads as its
phrases followed by its reference words. Rank still orders the rows inside each group,
so the priority ladder is untouched. Forcing one template on a whole section was the
other option and is worse both ways: the reference grid is much the more compact, and
a long phrase does not fit it.

### A slang section, and what a "universal reference set" turned out to be

The brief was a per-language slang and idiom panel, built where possible from a
universal reference set — "that's good", "that's really good", "that's bad", "I like
it" — rather than a list of colourful phrases per language. That framing is what makes
it fit the corpus at all: a concept has to be language-independent to join on
`concept_id`, and "casual way to say X" is, while "the Spanish word *guay*" is not.

Fourteen concepts survived the requirement that a commonality actually exist across
twenty-one languages — Hebrew, the twenty-second, took all fourteen — and they are
the intensity ladder the brief named plus the
register-marked moves that turned out to travel with it: agreement (`exactly`),
reassurance (`no worries`, `you're welcome`), surprise (`seriously`), a *refusal*
(`I'm good, thanks`), and the four social ones every language marks casually —
`delicious`, `let's go`, `cheers`, `see you`. Three clusters carry two rungs each, so
the sheet can drop the intensifier and keep the base: `Nice` / `Awesome!`, `¡Genial!` /
`¡Buenísimo!`, `Неплохо` / `Круто!`, `いいね` / `すごいですね`.

**The negative rungs are where the universality claim gets tested and partly fails.**
"That's bad" is not a casual register move in every language the way "that's good" is:
Japanese answers with `微妙ですね` and German with `Nicht so toll`, both hedges rather
than negations, because a blunt one is a different speech act. `thats-bad` is scored
0.250 for that reason — the lowest in the section — so it drops off a dense card
before the phrases that behave the same everywhere. The section as a whole sits at
importance 0.36, below every safety and orientation panel, which is the honest place
for it: it is what you print when there is room left.

The section is `default_on: 0`, so it does not appear on the default card and is one of
the panels the balance proposal draws on when a column has whitespace to fill. Two
languages are short of the fourteen — Klingon has twelve and Quenya six — for the same
reason they are short everywhere else.

### Two constructed languages, treated as real ones

Klingon (`tlh`) and Quenya (`qya`) are in, and the instruction was to treat them
exactly as the other nineteen. That turned out to be the interesting part: both have
a published phonology, an ISO 639 code and a documented lexicon, so the same sourcing
discipline applies — and applying it honestly is what produces the findings.

**Neither pack fills, and that is recorded rather than papered over.** Klingon covers
317 of 813 concepts and Quenya 206, because the bank is pharmacy symptoms and ATM
vocabulary and neither lexicon was built for that. Nothing is coined: a row is either
verbatim from a named source, a canon frame with a slot substituted, or assembled from
attested lexemes by documented affixes, and `provenance` says which per row. A
morphological verifier over the Klingon pack strips every prefix and suffix and
requires the remainder to be a lexicon headword; it reports zero unverifiable roots
and it caught four authoring errors on the way.

The gaps are facts about the languages. Klingon has `jaj` and `jar` and no named week
or month, so `days-of-week` and `months` are empty — while Quenya has all seven days
and all twelve months attested in Appendix D, so both are complete. **Klingon's
compass has three points**, so `east` and `west` print and `north` and `south` cannot.
**Quenya has no interrogative for "where"** — `yassë` is the relative "in which
place" — and that single gap empties every "Where is X?" concept in the bank, which
is the largest cause of its 26 empty sections.

**Emergency numbers are the sharpest test of the instruction, and the answer is to
print nothing.** `regions.csv` is a table of countries keyed on ISO 3166 with a source
and a verification date; neither language has a territory, so neither gets a row and
`languages.csv` carries an empty `regions` cell. Every consumer already degrades
correctly — `emergencyNote` returns null, the destination menu hides itself, the flag
wash finds no colours — so no number is invented and no warning fires, because nothing
is missing. Separately, `validate_data.py` refuses confidence below 2 in the six
safety-critical sections, and an assembled phrase is not an authoritative source: so
those sections take only verbatim-attested cells, which means **Quenya has no
emergency section at all** on any sheet. That is the gate working, not failing.

**Klingon's case-significance is load-bearing and it reaches the pipeline.** `q` and
`Q` are different consonants and `I` is a vowel where `i` is not a letter, so the new
IPA route does not lowercase its input the way the other table routes do, and a
Klingon reader's table can carry **no stress device at all**: `stress: caps` would
turn every `q` into a different consonant, and the language has no diacritic to use
instead.

#### Both write their own script, and the Latin is a romanisation column

Klingon prints in **pIqaD** and Quenya in **tengwar**, with the Latin demoted to the
romanisation slot under it. Neither script is in Unicode -- both proposals were
rejected -- so both live in the Private Use Area by allocation of the ConScript
Unicode Registry: `Piqd` at U+F8D0-F8FF and `Teng` at U+E000-E07F, ISO 15924 codes
293 and 290. `scripts/transliterate_native.py` derives `text` from
`romanization_okrand` and `romanization_appendix-e`, and `--check` re-derives it.

**These two packs run the other way round from every other one, and that is the
fact everything else follows from.** Elsewhere a language's own writing is authored
and a romanisation sits beside it; here every source publishes the *romanisation and
nothing else* -- TKD, Appendix E, the Plotz letter, Eldamo. So the romanised cell is
the attested one and the native cell is derived, which is why the transliteration is
a script rather than a one-time hand edit: a native cell is a claim about a scheme,
and a claim a script re-derives is one nobody can quietly break. The two schemes
assert very different amounts. **pIqaD is a relabelling** -- one codepoint per TKD
letter, case-significant pairs included, so a pIqaD cell is exactly as attested as
the Latin it came from. **Tengwar is a reconstruction**, marked as one by a
`native=quenya-classical` element in `provenance`: no source writes these 206
phrases in tengwar, so what is borrowed is the *mode*.

The mode is the **classical mode**, from Appendix E and the two Namárië manuscripts
(DTS 20, DTS 55) as surveyed in Björkman's *Amanye Tenceli*. It is an abugida whose
vowel tehta rides on the **preceding** consonant, which is what separates it from
the general use (following consonant) and from the mode of Beleriand (full vowel
letters) -- and it is the mode that fits, because Quenya words mostly end in a vowel
so nearly every tehta finds a consonant to its left. A long vowel takes a long
carrier of its own, a vowel with nothing before it takes a short carrier, a diphthong
is written backwards inside itself (the tehta rides on yanta or úre), palatalisation
is two dots below, a doubled consonant is one tengwa under a bar, and silme and esse
invert when a tehta lands on top of them. **o is the left curl and u the right one**,
which is the single easiest thing to get wrong here: the Ring inscription reverses
them, it is the most reproduced tengwar text there is, and most fonts' keyboards are
mapped for it.

**The `{target}` slot needed the same move, and finding that was the point of doing
it properly.** `data/registry/language-names.csv` is what each language calls the
others, and `fillLanguageSlots` substitutes its `name` column into a cell *in the
language of that cell*. The moment a Klingon cell is pIqaD, `'eSpanya' Hol` in that
column makes `core/pack.js`'s own guarantee impossible -- "a substituted cell can
never contain a script its own font stack cannot draw". So the 22 `tlh` rows and the
one `qya` row hold the native form and their romanisation beside it, and
`build_ipa.py` reads the romanisation, which is what `ROMANISED` was already for.
Twenty of the Klingon names are Okrand's own; the last two are derived by putting
each language's *endonym* through his key — `'IvghIt Hol` from `‘ivrit`,
`qISuwaHIlI Hol` from `Kiswahili` — which is the same key the respelling column uses
and the same thing he does himself with `DoyIchlan` and `maDyar`. Where key and
author disagree the author wins: re-deriving Hungarian gives `majar` against his
`maDyar`, so the attested twenty were left alone.

**Quenya is named by nobody, and the gap is closed at the other end.** There are no
Quenya names for the other twenty-one languages, and this is the fourth time the pack
has hit that wall — no interrogative for "where", no emergency section, a 29%
interface catalogue — so it gets the same answer. The reason is sharper than "no
source": the Quenya reader table deliberately spells /b d ɡ/ as `b d g` and says of
`thl` that it "is not a possible Quenya cluster", which is right for a *respelling*
and fatal for a name, because Quenya's orthography has none of those letters. The
obvious repair is worse — the CSUR block does have ando, anga and thúle, but **in the
classical mode those spell `nd`, `ng` and `s`**, so borrowing their general-use values
would make `Deutsch` read as `ndooty`. A mode is a mapping and half a mapping is not a
transcription, so "transcribe rather than coin" is not on offer here; it would be
twenty-one coinages.

So `languageName` was fixed instead. It fell through to `Intl.DisplayNames`, and for a
locale ICU has no display data *for* — `tlh` and `qya` are CLDR subjects and neither
is a display locale — that answers in **English**, which is how English in Latin
letters was going to arrive inside a tengwar cell. It now returns nothing for such a
locale and `fillLanguageSlots` blanks the cell, which is the rule its own comment
already made for `ipa`. `scripts/build_ipa.py` had refused that fallback all along and
says so at length; **the two disagreeing was the defect**, and the renderer is now in
line with the pipeline. Nothing changes today, which is the point. The twenty-one
hollow `qya` rows are gone, restoring the invariant `write_names` states — "the file
never grows a row of five empty cells".

**`text_alt` was the obvious home for the Latin and it was already taken.** Thirty-one
rows carry an attested *lexical variant* there -- `fendë`/`ando` for door,
`ná`/`nása` for yes -- the same use Portuguese makes of the column, and like
Portuguese these leave `script_alt` empty so it never prints. The Latin therefore
goes in a romanisation column, which is where it belongs on the merits anyway: Okrand's
transcription is TKD's notation *for pIqaD* and Tolkien's is Appendix E's *for
tengwar*, `scripts/spec.mjs` already shows `roman` by default so the Latin is demoted
rather than hidden, and `FIELD_SIDE.roman` is `latin` so Noto Sans draws it. Had it
gone in `script_alt`, `resolveField` would have drawn it in the *target's* stack.

Their badges are their own scripts now, and that needed one thing the badge mechanism
never had. Every other badge — 中, あ, ع, 한, अ, ก — is a plain character in the page's
own font, which works because every real script has a system font somewhere; nothing on
earth has a glyph for U+F8D0, so `style.css` declares a `unicode-range`-scoped
`@font-face` over the shipped Latin subset. The range is what keeps it free: only a page
that actually contains one of these codepoints fetches the face — which is also why
`--ui` can lead with that family, so *any* chrome text may carry a conscript glyph
rather than only the element that named it.

**What the badge is for decided which glyphs**, and `git log` settled it: the column is
a one- or two-character sample of the *orthography*, not the language's name — `Aa`,
`Şğ`, `Яж`, `Αω`, `אב`. The whole name is ruled out by measurement, since existing
badges span 1.12–1.44em and `tlhIngan Hol` is 4.98em against a header whose width must
not be set by a long name. So Klingon is `ab`, the first two letters, on the Hebrew
badge's precedent — and not `qQ`, the literal translation of the badge it replaced,
because **pIqaD is caseless** and those are two unrelated letters chosen for a property
of the romanisation. Quenya is `ná`, and *not* the two first tengwar: tinco and parma
are both a stem with a bow, so side by side they read as `pp` to anyone who does not
know the script, which is the opposite of what a preview is for. A tehta is what makes
tengwar recognisable at a glance. It also has to differ from the endonym beside it,
which is now `Quenya` in tengwar — the first pass made badge and endonym the same five
glyphs, printed twice with the English name between them.

Both are derived rather than typed: `badge_roman` and `endonym_roman` hold the authored
Latin and `transliterate_native.py` writes the native cell, the same discipline as the
packs and the two card-facing registry files. Re-deriving the first pass's Quenya badge
from `Quenya` came back byte-identical, which re-verified a five-codepoint string that
had previously been checked by hand against the CSUR chart.

Two hazards were raised against this pack and both were measured rather than acted on,
because the measurement said not to. The first was that Klingon's case-significant `I`
and `l` would be indistinguishable at the 4.4pt Latin floor, which would have argued
for a serif default or a raised `min_size_pt` — a decision, since that floor is shared
with nineteen other Latin languages. It does not arise: Noto Sans draws `I` with
crossbars (twelve segments, a 258/1000-em bounding box) against `l`'s plain four-point
stem at 88, and the two differ in height as well, 714 against 760. At 4.4pt the
crossbar is still over a point wide. The second was that a Klingon emergency line would
read `Spain: 112 Hoch QaH`, since `regionName` has no registry override the way
`languageName` does. It would — and that is the right output. Neither language has a
word for Spain, `Intl.DisplayNames` falls back to the English name for both locales
rather than to a bare `ES`, and inventing one would fail the same sourcing rule that
kept the emergency numbers out.

#### One font, and the measurement that chose it

**pIqaD and tengwar are grafted into the four Latin stacks rather than given stacks
of their own**, which is the Greek argument and not a shortcut: `scripts.csv` already
routes `Grek` and `Cyrl` to `latin` because the Noto Sans faces draw them, and `Piqd`
and `Teng` route there too once these ~85 glyphs are in it. Own stacks would have cost
eight faces of ~85KB each, because every one of them would still have had to carry the
whole Latin repertoire — `literal` is read from the *target* row and is English on
both packs, the `gloss`, `roman` and `ipa` columns are Latin on both, and a Quenya
*reader*'s respelling column is Latin too — and worse, they would have doubled a
Klingon sheet's font download, since the gloss, the romanisation and the IPA are all
`latin`. The graft costs about 5KB a face and
reuses `merge_donor`, which now rescales the em square (`scale_upem`) because
Constructium is 2048 units and Noto is 1000.

**Constructium is the only redistributable face covering both, and for tengwar it is
the only one that survives this project's PDF path.** SIL OFL 1.1, no Reserved Font
Name, a Gentium fork with all 41 assigned pIqaD codepoints and 117 of the 128 CSUR
tengwar ones. The PDF is what decides it: `pdf-lib` keeps only the *glyph ids* fontkit
hands it and drops the GPOS offsets, so a mark has to be correct on its own advance.
Constructium draws its tehtar as zero-advance glyphs whose outlines are already offset
back over the preceding tengwa — U+E040's bbox runs x −815..−215 at 2048/em — so they
land on the right letter with no positioning at all and GPOS merely refines them.
Alcarin Tengwar, which is OFL, better drawn and has a real Bold, puts its tehtar at
x +20..+356 and relies wholly on a GPOS xOffset of about −0.5em: perfect in the
browser, and in the exported PDF every Quenya vowel would print over the *following*
consonant. It also follows the Free Tengwar Project's codepoint assignment rather than
CSUR's, and the two disagree at several letters. Tengwar Telcontar is GPL v3 with a
font-embedding exception — genuinely redistributable, but neither OFL nor a
public-domain dedication, so a subset would be a GPL derivative in this repository.
The cost of the choice is that Constructium is single-weight, so the `script` field's
`bold` falls back to 400 and the native column prints at regular weight.

**Both scripts' `scripts.csv` numbers are measured, and one of them is a surprise.**
Ink extents over every row of each pack, shaped through fontkit: pIqaD is 0.954em
tall against English Latin's 1.005em — every letter between the baseline and 0.615em,
no ascenders, no descenders, no marks — so it takes Latin's own `1.02` leading and
Latin's own `4.4pt` floor, and at that size its median stroke is *twice* Latin's.
Tengwar is 1.270em, between Devanagari and Thai, so it takes `1.30`, above its own
worst case, and `5.4pt`, where its stroke profile matches Arabic's, Devanagari's and
Thai's at their floors. 6.0pt was rejected on measurement: the finest feature is not
the stroke but the 0.009em gap between the two lower dots of the `a` tehta, which is
under one device pixel at 600dpi even at 12pt, so the five vowels are told apart by
the mark's *width* — 13px against 4px at 5.4pt — and raising the floor buys nothing
for it.

**What the twenty-one-language corpus cost the other nineteen tables.** Klingon writes
/t͡ɬ/ as `tɬ`, which `phonemesOf` splits into `t` + `ɬ` — and `ɬ` was the first lateral
fricative the corpus had ever held, so every one of the nineteen printed a bare IPA
letter on 28 cells. Each table already contained the answer, its own /l/ output, and
the fix is that each table's `ɬ` rules are now a **copy of its own `l` rules, slot
conditions and all**. That qualifier is the whole lesson, because the one-line version
of the fix was wrong twice: a single `slot: any` rule handed Hindi a leading virama, so
`कात-्लो` set a mark on a dotted circle at a syllable break, and handed Korean a bare
initial ᄅ with no vowel to compose with — which NFC leaves alone and `subset_fonts.py`
duly ships as a jamo glyph, printing a letter-sized fragment beside real syllables.
Slot-conditioned copies read `कात-लो` and `캇-로`.

**A rule cannot be audited in isolation**, which is why this went unseen: a Hangul
syllable is assembled from three rules and composed afterwards, so per-rule inspection
says nothing about what prints. `charset.json` — every character every reader emits
over the whole corpus — is the only place the defect is visible, and
`tests/respell.test.mjs` now asserts against it. There is also deliberately no `tɬ`
rule anywhere: tokenisation splits the affricate before any rule is consulted, so the
nineteen cluster rules written for it were dead code and are gone. It composes instead
— `tl`, `τλ`, `тл`, `تل`, `तल`, `ตล`, `トル`, `te-le-`, `thl` for Quenya, and `tlh` for
a Klingon reader, which is the canonical spelling arrived at without a special case.
Japanese also turned out to be the only one of the nineteen with no rule for a bare
`ʰ`, which the other eighteen all map to nothing. All twenty-two readers are at zero
gaps.

### Hebrew, and where the vowels go

Hebrew (`he`) is the twenty-second language and the second right-to-left one, and it
arrives with a question none of the other twenty-one had to answer: **Hebrew does not
write its vowels.** A card is read by somebody who does not know the language, so the
column that a Hebrew reader has to find natural and the column a learner has to be
able to *read* are not the same string.

**Both, in two columns, with a mechanical relationship between them.** `text` is the
unpointed full spelling — what is on every sign, menu and form in Israel — and
`text_alt` is the same letters with the niqqud added, on all 813 rows. The pointing
earns a column of its own rather than being dropped because it is a second
orthography a reader meets in the wild, in children's books, dictionaries, poetry and
the partial pointing a newspaper puts on an ambiguous word: the same argument that
puts Traditional Chinese in `zh-Hans`'s `text_alt`. The Devanagari and CJK packs spend
their second column on a romanisation instead (`iast`, `hepburn`, `kunrei`) and are
right to, because their scripts write their own vowels and have no gap to fill.

**`script_alt` in `languages.csv` stays empty**, which is the one place this decision
touches the interface. Its only consumer is the format panel's caption, and
`field.title.script_alt` reads "The same phrase written in {script}" — pointing is not
another script, and `Hebr` there would caption the pointed column "Hebrew" beside a
column already captioned "Hebrew".

Three things fall out of the relationship between the two columns, and all three are
load-bearing:

- **`text` is `text_alt` with the points stripped, and `validate_data.py` enforces
  it.** That is what makes the pointed column a *reading of the printed one* rather
  than a second, differently spelt phrase — and the trap is real: the Academy of the
  Hebrew Language prescribes pointing the *defective* spelling, so the correct pointed
  form of `תקווה` is `תִּקְוָה`, with one vav where the printed column has two. This pack
  points the full spelling instead, which is what Israeli textbooks and children's
  books do, and says so.
- **The unpointed column is genderless where the pointed one cannot be.** Hebrew
  inflects the present tense for the *speaker's* gender, and for the whole `-e/-a`
  class the two forms are the same unpointed string: `rotse` and `rotsa` are both
  רוצה. So `text` — the column a traveller holds up — commits to nothing on those
  rows, and only the pointed column has to choose. It chooses masculine, as the Arabic
  pack does, and `literal` records the other reading. Where a single unpointed string
  has two readings that both deserve printing — שלך is both `shelkha` and `shelakh` —
  the row prints one, because printing both would print the same string twice.
- **The pack's answer to the gender problem is a frame rather than a form.** `efshar
  la‘azor li?` — "is it possible to help me?" — is impersonal, is what an Israeli says
  to a stranger anyway, and inflects for neither the speaker nor the addressee. It
  replaces the second person in every request in the pack, and `medabrim kan {source}?`
  ("is X spoken here?") does the same for `do-you-speak-english`. That is Vietnamese's
  solution to the same problem in a different part of the grammar.

**The romanisation is BGN/PCGN 2018, which is the Academy's own 2006/2011 system
tabulated for names.** ISO 259 was rejected as a graphemic transliteration that writes
distinctions Modern Hebrew does not make, and the Academy's *simplified* popular
variant was rejected because it writes `ח` as `h` and so merges it with `ה` — fatal
here, since this column is what the `ipa` route reads and /χ/ against /h/ is `ẖam`
(hot) against `ham` (they). Three named departures, all for the same reason: an acute
marks non-final stress, which is lexical in Hebrew (`bóqer` morning, `boqér` cowboy)
and written by neither orthography; `ey` writes the [ej] diphthong where BGN writes
`e`; and a strong dagesh is not doubled, because Modern Hebrew has no geminate and
`bevaqqasha` would tell twenty-one reader tables to spell one.

**There is no espeak Hebrew voice**, so the `ipa` column is read off that romanisation
the way Japanese, Korean and Mandarin are read off theirs — one authored string per
row (the pointed form), with `text` and the romanisation derived from it and the IPA
derived from the romanisation. `GRADE["he"]` is `A-` and names the weakness: BGN
resolves a shva by a morphological test the route cannot perform, so the rule is `e`
word-initially and nothing elsewhere, and the twelve forms where Modern Hebrew
disagrees are corrected by hand in the pack's own word list.

**Final letter forms are the hazard a composing reader table has, and it is closed
structurally.** ך ם ן ף ץ are positional and must never appear mid-word. Nothing in
the corpus can produce one out of place, since `text` is authored Hebrew with the
points removed. In `he__he-IL.json` the four that can arise live in four
`syllable_fixups`, each anchored to the end of the syllable with `$` and gated on
`word_final`, and every `phonemes` rule emits only the non-final form — so a mid-word
`ם` is not unlikely, it is unreachable. The fifth, `ך`, has no rule that could produce
it at all: /x/ is written `ח`, which is the Academy's own permitted alternative, so no
`כ` is ever emitted.

**Two measurements settled `scripts.csv`, and one of them settled a column nothing
reads.** `leading_factor` is 1.20 because the largest positioned ink height over the
four shipped Hebrew faces on real rows is 1.149em — Noto Serif Hebrew, a lamed's
ascender over a below-mark — where the sans faces reach 0.997em and unpointed Hebrew
alone is 0.915em, less than Latin's typical. So the pointed column is what the factor
pays for. `min_size_pt` is 5.0: the letter body is 536/1000 em, which is exactly Noto
Sans Latin's x-height, so the letters are no smaller than Latin at the same size — but
six pairs are told apart by one small stroke (ב/כ, ד/ר, ה/ח/ת, ו/ז/ן, ם/ס, ג/נ) and a
hiriq is a 56-unit dot, which at 4.4pt is 0.25pt of ink against the 0.20pt this paper
can hold. It sits below Arabic's 5.4 because Hebrew is not cursive: no joining strokes
to lose and no stacked marks. And `needs_shaping` is 1 for the opposite reason to
Arabic's — **nothing in the repository reads that column**, fontkit's `layout()`
shapes unconditionally, so the value is documentation, and what is true of Hebrew is
that it needs no joining and does need GPOS mark attachment: eleven of the twelve
glyphs of `בְּבַקָּשָׁה` are positioned by GPOS, and even unpointed `שלום` takes a kern.

**The first pack whose emergency frame takes a preposition**, after twenty-one that
refused one. `ב{region}:` is right for all 54 regions, and the reason is orthographic
rather than grammatical: Hebrew's preposition is a single letter whose vowel *is not
written*, so the agreement that defeated Portuguese's `na`/`no`/`nos` and French's
`en`/`au` simply does not surface. ICU's Hebrew region names help by carrying no
definite article — the two that begin with `ה` are `הודו` and `הונגריה`, where the
letter is part of the name.

**Digits in a right-to-left line are safe here for a reason worth writing down.**
fontkit reverses a run only when the string contains a right-to-left character, so
`100` on its own is laid out left to right and `100 משטרה` as one string is not —
measured. `paintField` emits one run per *piece*, and pieces break at spaces, so every
number in `ב{region}: 100 משטרה · 101 אמבולנס` is its own run and its digits keep their
order. The deferred bidi problem is therefore bounded to digits *glued* to letters
inside one piece, which is exactly what the validator's one-digit rule forbids in a
corpus row. Hebrew needed no numeral rows anyway: Israel writes 0–9 as Europe does, so
the number rows carry the Hebrew word — the feminine counting series — where Arabic
and Thai carry their own digits.

Hebrew also brought the corpus the fifteenth currency: **`numbers-money.shekel` and
its symbol ₪ (U+20AA), which no shipped face carried**. It was the Italian-euro case
exactly — a ready language with a country, a currency in `regions.csv` and no row for
it — and the reason it is a named row rather than the generic `local-currency` that
Arabic and Russian take is that Israel is one country with one currency.

### The paper's own colour

`spec.background` washes the page behind the columns. White is the default and stays
it: the reference card is white, a wash costs ink on a sheet someone prints at home,
and `low-ink` and `mono` drop it outright the way they drop row shading.

An item's own box is the other half of it, and `background.rowShading` says how
opaque it is — 0 to 1, continuous rather than three named modes, because the useful
settings are the ones in between: the reference card's own shading at 1, a hint of it
over a flag wash at 0.3, nothing at 0. It uses real alpha rather than pre-blending,
because a `sections` or `flag` wash is a different colour under every row, and both
renderers take alpha natively.

**What it fades is a pair of rects, and that is a reversal worth recording.** The
shade was once the only row background: an unpainted row was white, which was right
while the paper always was. When the wash arrived, the light row's paper-coloured
rect looked like the one thing standing between the wash and the reader and was
dropped for exactly that reason. That was the wrong reading of what the alternation
is for. With only the dark half painted, the light row is not white — it is whatever
the wash happens to be under it, which on a `sections` gradient is a different colour
in every column, so the banding stops reading as two colours and the slider appears
to move only the grey. Painting both means the rows are white and grey *on* the card
at 1 and gone at 0 with the card showing through, so the slider says how much of the
card you see. It is still skipped on white paper and outside full ink, where the light
rect would be invisible and is one rect per row — about 600 a sheet, which is real
against a face that compresses to 13KB.

Four modes. `tint` is one flat rect and **takes its swatch literally** — the reader
names the paper colour, so diluting it would make the picker lie about itself; the
first version mixed it toward paper and the default came out at (254,254,254), a
control that appeared to do nothing. `flag` reads the colours off the flags of the
countries that speak the target language, which is a fact about the language rather
than a decoration: `regions.csv` carries them for the 30 countries the nineteen
languages name. `sections` reads them off the sheet's own section colours and places
them where those sections landed, weighted by inverse-square distance, so the wash
under `emergency` is red because emergency is there — and it is computed per face,
because a different section is there on the next one.

**The two gradients are a grid of flat rects, not a gradient primitive.** The plan
carries absolute positions and flat fills, which is what lets three renderers agree
by construction, and `pdf-lib` reaches a real gradient only through a raw shading
dictionary. Approximating one with cells would normally band — but every wash here
sits a few percent off white by design, so the step between adjacent cells is well
under a just noticeable difference. Measured out of the PDF at 150dpi, adjacent
samples differ by one or two units in 255. The constraint and the design point the
same way, which is the only reason this is the right answer rather than a
compromise. It also means imposition, rotation and the card cut need to know
nothing: a background is rects like any other, first in the list.

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
names across sixteen catalogues and keeping them in step.

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

Section headings are the other half of this, and they run the other way. A heading
is structural text the *source*-language reader reads, so on a `zh-Hans ← ja` sheet
it belongs in Japanese. `data/registry/section-titles/<code>.csv` holds them and
`buildSheet` picks by `spec.source`, falling back to `title_en`. That lives in the
registry rather than in `data/i18n/` because the *sheet* needs it, and the sheet is
rendered by `core/`, which has no business reaching into a UI catalogue.

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
`spec.padding` adds separation above and below each item, between the two lines of
a stacked cell, and around headings, scaled with the type — not with the raw scale,
which is a different curve, see above — so it stays proportionate when auto-fit
changes the size.

The default is `DEFAULT_PADDING` in `core/pack.js`, currently 1.4pt, shared with
`scripts/spec.mjs` because the app's default sheet and the committed thumbnails
have to be the same sheet. It costs a pair of faces on most pairs and buys back
type: French goes from six faces at a fitted 0.48 to eight at 0.67, so both the
spacing and the type grow. The ladder in the panel is three steps — the reference
sheet's own zero, this, and one more — because the two intermediate settings it
used to offer both sat close enough to zero that nobody would pick them once the
default moved up, and the Custom slider still reaches any value between.

Two things about how the glue behaves came out of that change, both of which
printed as whitespace in the wrong place:

- **A heading is bound to its opening rows, not merged with them.** Merging was the
  first implementation and it froze the gaps inside the merged run at their natural
  size while every later gap in the same column stretched to flush the bottom — so
  the first two rows of every section printed measurably tighter than the rest of
  it, invisibly, because a merge hides those gaps from the atom list entirely.
  `keepWithNext` is a constraint handed to the breaker instead, which refuses those
  breakpoints rather than penalising them, so a stranded heading is still
  impossible and the glue treats every row alike.
- **The per-gap stretch ceiling follows the type's curve too.** Against the raw
  scale it shrank faster than the rows it separates, so once more padding meant
  fewer rows per column there were no longer enough gaps to take the slack and a
  few points of it landed at the foot of the column. The ceiling still exists, and
  still binds: an underfull column should look underfull rather than be stretched
  into a ladder of canyons.

## A card for a screen, and how much of the corpus goes on it

The sheet was only ever paper, and one request changed that: the highest-priority
phrases on a single face, set as a phone lock screen while travelling. Two settings,
and they are only useful together.

**`phone-1col` is 180 × 396pt — exactly 2.5 × 5.5in**, one column, one face. The
page size is the *physical* size of a phone screen rather than a round number of
points, and that is load-bearing rather than cosmetic: the legibility floors in
`data/registry/scripts.csv` are in points, so at this page size they **are** the
apparent sizes on the glass, and the whole type-fitting apparatus is correct with no
reinterpretation. A larger page in points would fit more rows while silently
rendering them below their floor once scaled to the screen. It also lands on whole
pixels at every offered resolution — 375×825, 750×1650, 1500×3300 — because the PNG
path multiplies by `dpi/72` and a fractional product resamples.

One column, not two. The usable 162pt is *wider* than any column the app otherwise
produces (7×5/4col is 120pt, A6/2col 138pt, the wallet card 115pt), and two columns
would be 79pt — narrower than anything the solver has ever laid out. A lock screen
you glance at in an emergency is the wrong place for the app's narrowest column.

A preset marked `screen` hides the cut control rather than greying it, and clears any
cut already chosen: there is nothing to cut and no back. And auto faces can settle on
**one**, with parity carried by the card rather than imposed, so paper still comes in
pairs while a screen does not.

**`priority` is an importance floor** with four steps, each chosen as the largest cut
in the distribution that still fills a real card:

| step | floor | phrases | fits |
|---|---|---|---|
| Everything | 0 | 813 | 6–8 faces of 7×5 |
| Broad | 0.74 | 326 | four faces — what both hand-built originals settled on |
| Core | 0.82 | 148 | one sheet |
| Essential | 0.95 | 10 | **one phone face at full nominal type, in all twenty natural languages** |

**The top step is the one place the two constructed languages fall short of a
preset**, and it is worth stating plainly rather than leaving to the coverage table:
Klingon carries 5 of the 10 and Quenya 3. What is missing is the ambulance, the
allergic reaction and the polite greeting — a lexicon written for a television series
has no pharmacy in it, and the safety gate would refuse an invented one anyway.

There is a cliff above the top step, which is why it is where it is: the next rung
down is 35 phrases under *twelve* headings, and it overflows one phone face even at
the legibility floor, because seven of those sections contribute one or two rows and
the headings become a quarter of the height.

It uses plain `importance` rather than `solve/weights.js`'s scoring, for three
reasons. `numbers-money.misc` is not a cluster of near-duplicates but the number line
0–10, so cluster decay would delete counting from the card. The decay is
state-dependent on the sheet already chosen, and a ladder has to be stable and nested
or the steps stop meaning anything. And `proposeBalance` is a reviewable diff with a
per-item reason, which is a different contract from a filter. The feared failure does
not occur: importance is monotone in `cluster_rank` in 110 of 114 clustered pairs, so
a cut takes cluster *prefixes* — it never gives you `hello (polite)` without `hello`.

Two details that would otherwise be bugs. An item ticked by hand outranks the floor,
or the content tree's checkbox becomes a silent no-op on a trimmed sheet; custom terms
carry importance 1, so nothing a reader typed is ever cut. And `buildBlocks` already
declined to push a heading with no rows under it, which is what stops a cut section
leaving its heading behind — that line is load-bearing and now says so.

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

### Cut or folded, and why the flip axis is neither

`foldCards` is the same paper finished differently. A cut turns one 7×5 face into two
independent 3.5×5 card sides; a fold turns *four* of those halves into one 3.5×5 card
with four panels, hinged at the middle. It reuses the cut's own guarantee — that a
column never straddles the midline, so each half-face is already a valid two-column
page — and differs only in where on the sheet each half-face is printed.

**Where is the printers' 4-page imposition, and it is not the reading order.** The
front of the paper carries pages **4 and 1** and the back carries **2 and 3**, which
is what makes pages 1 and 2 the two faces of one leaf and 4 and 3 the two faces of the
other. Impose them in reading order instead — 1 and 2 on the front, 3 and 4 on the
back — and the folded card reads 1, 3, 4, 2. `tests/impose.test.mjs` asserts against
exactly that mistake. `long-edge` needs no second arrangement: rotating a whole sheet
side by 180° also swaps its halves, so the same `rotate` that cancels the printer's
flip axis supplies the other half of what the long-edge case needs.

**The flip axis became its own control, because it never belonged to cutting.** It was
one three-way choice — whole, cut short-edge, cut long-edge — which read as though the
axis were a property of the cut. It is a property of the reader's printer driver, and a
folded card needs it for the same reason a cut one does. Splitting it is what let the
fold arrive as one more finish rather than as two more entries in a list of five, and
it means the axis survives switching between them.

Choosing a cut turns the canvas into a **duplex check**: each card with its own
back laid over it in red, its shading and rules dropped so the front stays
readable. If the red words belong on the back of the black ones the flip setting
matches the printer; if they are the same column twice, it does not. That is
cheaper to learn there than after cutting.

**A fold gets no overlay, and that is not an omission.** The overlay lays each face
over the next, which is exactly right for a cut, where consecutive faces are one
card's front and its back. A fold's consecutive faces are the two sides of *one
sheet*, and under a short-edge flip the front's left half backs the back's *right*
half — so overlaying them as they come would pair page 4 with page 2 and quietly claim
that is what the printer will do. The canvas shows what will be printed and says which
page is where; checking a fold is a matter of folding one.

## Build steps

The shipped app has **no build step** — plain ES modules, opened by any static
server, matching the rest of the repo. Three generators produce committed
artifacts, following the `ceo-salary-benchmark/scripts/` precedent:

```bash
npm run vendor      # esbuild → vendor/{fontkit,pdf-lib}.esm.js  (rarely)
npm run icons       # Lucide SVG → data/icons.json, normalised to path data
npm run prerender   # solve + render → packs/  (after any corpus or engine change)
                    #   thumbnails only, one per pair, then indexed down to a
                    #   fifth-bit palette: 240 pairs in 8.6MB rather than 27MB
npm run shell       # data/shell.json + the respell index + sw.js VERSION
python3 scripts/fetch_fonts.py && python3 scripts/subset_fonts.py   # data/fonts/
python3 scripts/transliterate_native.py   # tlh -> pIqaD, qya -> tengwar,
                    #   packs plus the two card-facing registry files
```

The Python side needs `fontTools` for the fonts and `Pillow` for the thumbnails.
`packs/` grows as the square of the ready-language count -- every language pairs
with every other -- so `scripts/optimize_thumbs.py` runs automatically after
`npm run prerender` and reindexes each screenshot to an exact palette. It is a
lossless indexing of a five-bit-per-channel rounding, which moves no pixel by
more than 4/255 and leaves pure white alone, and it is deterministic so a
re-render of unchanged content produces byte-identical files.

`scripts/latex_corpus.py` reads the reference XeLaTeX sheets;
`scripts/port_latex_corpus.py` seeded the corpus from the Mandarin one, and
`scripts/port_language.py` merges each later sheet into it. Both are kept because
they document where every row came from.

Merging is the data model earning its keep. The Japanese sheet contributed 366
rows: 312 matched concepts that already existed and 54 were new. Matching is on a
normalised English gloss, against the exact section first and then its group,
because two sheets can file the same phrase under different panels ("Can I charge
my phone?" is hotel basics in one and hotel requests in the other).

The bank is now **813 concepts across 58 sections in twenty-two languages**, which is
**462 ordered pairs** — every one of which renders, and two of which anyone wrote a
sheet for. That ratio is the whole argument for joining on `concept_id` instead of
storing pairs: the sixteenth language added 745 rows and 30 new pairs, and the
twenty-first added 40 more pairs on its own.

Every pack covers 100% of the concepts that apply to it. The qualifier is doing
work: a concept can name the languages it belongs to, so the Korean won and the
Turkish lira are not gaps in Spanish, and the validator counts each language
against its own applicable set rather than the whole bank.

The expansion past the two hand-built sheets was done by agents, one per language
so that none of them had to hold two orthographies at once, plus three designing
new content against non-overlapping scopes. Two details of that are worth keeping.

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
Korea the answer is "nothing". The later packs kept finding the same shape of
problem: Portuguese `frutos secos` also means dried fruit and is not the labelling
term (tree nuts are `frutos de casca rija`, and peanut is legally separate);
Turkish `fıstık` alone means pistachio, so peanut has to be `yer fıstığı`; Russian
`Регидрон` is the brand a pharmacist answers to where the descriptive phrase gets a
blank look; and Vietnamese fish sauce is in enough dishes that "does this contain
fish stock" is better asked as `Món này có nước mắm không ạ?`. Hungarian repeats the
Turkish trap exactly -- **`mogyoró` on its own is hazelnut**, so peanut has to be
`földimogyoró`, and the EU labelling term for tree nuts is a third word again
(`csonthéjas`) -- and adds one of its own: **`zsír`, lard, is a default cooking fat in
Hungary**, so "no pork" has to name it beside the ham and the sausage
(`Sertéshús, sonka, kolbász, szalonna és zsír nélkül`) and the pork-stock question has
to ask about the fat rather than the broth. `tenger gyümölcsei` excludes fish the way
`Meeresfrüchte` does, so "no seafood" enumerates. And the duty-pharmacy rota has a name
a pharmacist answers to -- `ügyeletes gyógyszertár` -- where "all-night pharmacy" gets
a blank look, which is the `pharmacie de garde` case one country further east.

Third, four of the five newest packs had to answer a question their language
forces on any phrasebook, and the answer shapes hundreds of rows rather than one.
Portuguese chose the European variety as primary and carries Brazilian forms in
`text_alt`, because `banheiro` means *lifeguard* in Portugal while `casa de banho`
is merely unusual in Brazil — an asymmetry in the cost of being wrong. Vietnamese
omits the second person entirely, because the correct word depends on the
addressee's age and gender and a card handed to a stranger cannot know; politeness
rides on the particle `ạ` instead. Turkish rephrased sixteen slot rows so the fill
needs no case ending, since vowel harmony makes a frame like `{}'a gitmek
istiyorum` wrong for many fills. Russian could not do the same everywhere and says
so: twenty-one slot rows are listed in the pack's own notes as correct for some
fills and not others, on the grounds that a Russian hearing *«Я из Америка»*
understands it, whereas a stilted case-proof frame would read as broken.

Hungarian is the hardest case of that kind the project has met, and it could not take
Russian's way out. It is agglutinative with **vowel-harmonic** suffixes, so `-ul/-ül`
(speaking a language), `-ban/-ben` (in a place), `-ra/-re` and `-hoz/-hez/-höz` all
choose their vowel from the *insert's* last one -- and the definite article `a`/`az`
chooses from its first sound, so even `Hol van a {}?` is wrong half the time. A
placeholder is a plain string substitution and knows neither. So **all 44 slot rows
were restructured**, not sixteen: a demonstrative or a head noun of ours carries the
grammar and the insert follows a colon in the bare nominative — `Nem eszem a
következőt: {}`, `Allergiás vagyok a következőre: {}`, `Hol van ez: {}?`,
`Fizethetek ezzel a pénznemmel: {}?`. Six rows needed nothing at all, because a
Hungarian numeral leaves the noun after it uninflected (`{} éjszakára`, `{} napig`,
`{} éves`, `{} nappal ezelőtt`). And all six language-slot cells take one noun,
`nyelven`: `Nem beszélek {target} nyelven`, `Beszél {source} nyelven?` — which works
because ICU hands Hungarian a bare lowercase adjective (`angol`, `hindi`,
`szuahéli`) and every one of them stands in front of `nyelv`.

### One word, two concepts

Concepts are language-independent, so two of them can land on the same word.
Spanish says `Buenos días` for both "hello (polite)" and "good morning", and
`Buenas noches` for both "good evening" and "good night"; Korean answers all three
of hello, good morning and good evening with `안녕하세요`; Chinese `有` covers both
"have" and "there is". Printing the phrase twice reads as a mistake and costs a row
that something else could have had.

`mergeIdenticalRows` in `core/pack.js` folds them, within one block so the fold
never crosses a section or a template — the same word under two headings is two
different pieces of advice. Merging beats dropping one because the collapse is
itself the lesson: **"Buenos días — Hello (polite) / Good morning"** tells a reader
that Spanish does not make the distinction their own language does. Across the
fifteen packs it folds 44 rows, ten of them Chinese and six each in Korean and
Indonesian.

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
printed both -- two concepts per language, which at sixteen would have been
thirty-two entries saying the same thing. They are now one concept each, glossed
"I do not speak this language", and every pack renders it self-referentially.
Before the merge the Korean sheet had no way to say "I do not speak Korean" at all.

**Reading `applies_to` against `regions.csv` is a routine audit, not a one-off.** A
concept's scope is a claim about which countries need it, and the registry already
says which countries a language serves — so the two can be read against each other,
and every time they have been, they disagreed. The euro was scoped `de;fr;es;pt` and
shipped the Italian pack without it. Reading the whole table once found that
**English and Arabic had no currency concept at all** — the most-used target and the
second RTL one, eighteen and six pairs respectively.

Thirteen concepts came out of that reading and the translators' backlog: `franc`
(`de;fr;it;sw` — three of them name Switzerland and the fourth serves the DRC),
`peso` (`es`, four of its six countries), `real` (`pt`, the larger half of that
readership), `local-currency` (`ar;ru`), `lakh` and `crore` (`hi`, because every
Indian price above about a hundred thousand is written `₹5 लाख` with `1,00,000`
grouping), `does-it-contain-pork-fat`, `pork-code` (`id`), `i-think-i-have-dengue`
and `fare`.

**The reading beat the prose twice**, which is the argument for doing it against the
data rather than from the notes. BYN *is* a ruble, so Russian's gap is two countries
and two words rather than three; and Singapore prices are 元/块 in Chinese exactly as
China's are, so Mandarin's gap is the ringgit alone.

**`local-currency` has no symbol row, alone among the currencies, and that was
measured.** A symbol row's respelling is blank for a bare sign and *junk* for an
abbreviation: espeak read `ر.س · ج.م · د.إ · د.أ` as `rs dʒˈamm dʔ dʔ`, with the two
dinars indistinguishable, and `₸ · с` as `ˈɛs`. Both would have printed on 36 pairs.
The abbreviations ride in `text_alt` instead, which takes no IPA by design.

Two requests failed the check and stayed out. `rail-station-words.conductor` is the
half of the Swahili translator's pair that does not survive translation — a fare names
one thing in nineteen languages and a conductor does not, since the minibus
fare-collector and the rail ticket *inspector* are different jobs. And an English euro
row was declined on the gloss trade: English is the source on eighteen pairs and
Ireland is one of its eight countries, where Cyprus is one of Turkish's two.

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
dropped glyph or an unloaded font gets caught. `tests/golden.test.mjs` freezes the
geometry of eleven probe items across four pairs, and compares the Mandarin pack
against the original XeLaTeX sheet's own content stream — both discussed below.

### The romanisation legend, and three defects found by building it

The Vietnamese translator's request: pinyin's caron `ǎ` and Vietnamese's breve `ă` are
near-identical at 5pt and pinyin's macron is not a Vietnamese mark at all, so a
Vietnamese reader is primed to read tone marks as vowel-quality marks. **They will not
misread the words; they will misread the tones, silently.** It lives in `spec.head`'s
`legend` slot, which is the card-level place for a card-level fact — a `note` is a
*section* device, and `applies_to` on a note names the language it is *about* while the
row is read from the source, so the note route would have cost eight concepts times
twenty-two paragraphs.

The slot now carries two parts: the reader's own respelling key, which all
twenty-two tables have, and a **target-keyed** second part naming the marks of the
romanisation actually being printed. Two things about that second part were not
obvious:

- **The key is (target, system), not the system.** `bgn` names two different systems
  in `languages.csv`, and read off the corpus they share no mark at all: Russian's
  `ʼ ˮ ë` against Hebrew's `ẖ ‘ ’`.
- **A quoted mark set in the reader's own face is a tofu box.** The band is one run in
  the source script's stack, and Noto Sans Thai, Devanagari and Hebrew draw none of
  `ǎ ǐ ǒ ǔ ṭ ḍ ṇ ṣ` — so the pinyin caron this whole request is about would have
  printed as an empty box, in the PDF, for three of the readers who most need it.
  `HeadPart` gained a `latin` flag, which costs nothing because `stacksFor` always
  loads `latin`.

The line is a **prose-free glyph equation** — `ā á ǎ à = 1 2 3 4` — so one string
serves all twenty-two readers. Per-reader prose was costed and rejected: 132 strings,
longer in the band whose cost is the entire issue, and unreviewable in most of its
languages. Rows exist only where a mark carries a *misreading* hazard: `pinyin`,
`hepburn`, `iast`, `ala-lc`. `bgn` and `appendix-e` were rejected as
benign-direction misreadings whose legend would need a word for "stress", which breaks
the prose-free property; `elot`, `rr`, `rtgs` and `okrand` carry no diacritic at all,
measured rather than assumed.

**Three defects surfaced while building it, all of them already shipping.** Thai's
existing legend was English prose *about* the legend — "None. Every glyph in the output
is ordinary Thai used for its ordinary sound…" — printing in English in the band of
every sheet a Thai reader built. `headSize` applied no legibility floor at all, so an
Arabic, Hindi or Thai reader's band set at 5.20pt against its own 5.40 minimum; the
existing floor test could not see it because every spec it solves has
`head.at: 'none'`. And nothing had ever run a drawability check over the nine
pre-existing legends, which is how the tofu above went unnoticed.

**Measured cost, which is why the band stays off by default.** 84 of 462 pairs can be
ticked at all and 378 pay nothing. Of the 84, **81 keep their face count**, giving up
0.02 to 0.09 of type scale, median 0.04. Three take an extra face pair and *gain* type
size for it: `zh-Hans ← ar` from 8 faces at 0.47 to 10 at 1.00, `ja ← hi` and `hi ← ja`
from 10 at 0.48 to 12 at 0.88. So the twelves go from two pairs to four. Notably
`es ← en` — the pair whose extra face pair is the reason the band is off by default —
is never ticked, because Spanish declares no romanisation.

### A row's headwords now sit on one baseline

`tests/golden.test.mjs` found this on its first run, which is the argument for the
whole exercise: **461 of 462 pairs printed a row's target headword below its own
gloss.** Worst 1.813pt; Hebrew 1.222pt, which at its fitted 0.69 is about a quarter of
the type size and plainly visible. Two things combined. `atoms.js` gives each field
`max(theme leading ratio, the script's leading_factor)`, a per-script floor that exists
because the reference's 1.02× clips Devanagari and Thai — so the two sides of a row can
have different line-box heights. And the placement loop aligned line-box *tops*, while
`paintField` puts the baseline at a different depth inside each box.

It is not only a cross-script problem, which is where the first measurement was wrong:
`es ← en` shows 0.110pt, because the two headwords are 7.30 and 7.01pt and their boxes
differ at one leading factor. `leading_factor` amplifies it rather than causing it.

**The original answers this, and answers it differently for the two item shapes.**
`\entry` is `\hbox{\vtop…\vtop}`, and a `\vtop`'s reference point is its first
line's baseline — on page 1 of the reference PDF the target and the gloss share 333.70
exactly while their second lines land 5.00 and 5.30 below, so *only* the first line is
shared. The reference tables are `array`'s `m{}` columns, i.e. `\parbox[c]`, and the
original means it: a two-line respelling sits at 173.15 and 167.45 against its row's
shared 170.30, centred to the digit. So `valign: 'middle'` is a faithful transcription
and keeps both its centring and its `max(height)` row height, and only the entry shapes
became `ascent + max(below)`. Reproducing the original *exactly* in the tables would
need a row-uniform leading, measured and rejected at **+27%** on a row whose respelling
wraps to four lines.

**The result is exact, not within a tolerance**: 113,571 of 113,571 rows put their two
cells on one first baseline, and the worst delta across all 462 pairs is 0.

**What it cost.** 298 of 457 measurable pairs do not move at all. Five gain a face pair,
and every one of them was sitting at exactly scale 0.450 — the comfort threshold — so
they trade a sheet of paper for a great deal of type: `hu ← de` and `ru ← tr` from
8 faces at 0.450 to 10 at 0.74–0.76, `th ← tr` and `th ← vi` to 10 at 0.860, and
`hi ← ja` from 10 at 0.460 to 12 at 0.870, which is what makes the third twelve. Item
counts are identical throughout, so nothing was shed to pay for it. The worst scale
regression is `hi ← ar`, 0.660 → 0.580; in points that is a headword going 6.65 → 6.50,
**−0.15pt to remove 0.85pt of misalignment on the same sheet** — five to one in the
fix's favour, on the worst pair of 462. Every legibility floor holds, and
`loose-columns` warnings fall from 62 pairs to 56.

**The acceptance criterion had to be rewritten, and it was conflating two claims.**
`auto reproduces the hand-built originals at their own spacing` asserted
`faces.length === 4` under autofit, which is both "four faces are reachable" and
"autofit prefers four". Aligning the baselines costs height, so `ja ← en` now needs
0.420 to hold the original's content on four faces where it needed 0.460, and `COMFORT`
is 0.45 — so autofit takes six and gets full nominal size, which is precisely the rule
it is documented to follow. Lowering `COMFORT` to keep the old answer would have been
tuning a constant to make a number look better, and would have cost those five pairs
their type gain. The test now asserts what its name claims: pinned to four faces, all
three reproductions place every original row with no errors and nothing below a floor —
Japanese at 4.74pt against the original's own 4.44pt, so this reproduction is the more
legible of the two — and separately that autofit never falls below four faces, and
never spends a pair without gaining type.

### Golden signatures, and why they are geometry rather than pixels

The suite asserts invariants — no overflow, every atom placed once, columns flush to a
point — and those catch a great deal. What they cannot catch is a change that is
structurally legal and visually wrong: the PDF's dropped mark offsets sat *inside*
every legal run for the whole life of the renderer, and the card-aspect
letterboxing produced two separate complaints before anyone found the one cause.

**A signature is plan geometry in local coordinates.** For each of four pairs — one
Latin, one CJK, one RTL, one mark-positioned — eleven probe items covering every
template, every heading level, a `note` and an open slot, with every run, rect and
icon inside the item's own hit box, expressed relative to that box, at a pinned fit.
Plus one `glyphs` line per target-script run recording how many blocks
`render/pdf.js` drew it in and at what offsets, which is the only place the GPOS
offsets are observable. Local coordinates and a pinned fit are what stop the files
churning every time the corpus grows — the standing complaint that
`tests/counts.js` exists to answer.

**Rasters were rejected by measurement, and the numbers are not close.** The *same*
PDF through poppler's splash and cairo backends on one machine differs in **23.1% of
pixels at 72dpi**, 15.7% at 150 and 8.0% at 300 — lower resolution is worse, not
better. The signal these tests exist to catch is 0.87% for the Hebrew mark offsets
and 0.003% for Devanagari. A tolerance that survives a rasteriser upgrade is 18 to
200 times too loose to see the bug. Per-glyph dumps were rejected as 10,000 glyphs a
face carrying no information the font subsets do not already pin; SVG snapshots as
freezing serialisation rather than layout.

46KB committed across four signatures and one digest, 0.2% of `packs/`.
`env UPDATE_GOLDEN=1 npm run test:unit` regenerates them, a missing baseline fails
naming that command, and a changed one names the first line that moved.

### The reference-PDF test is exact, and a perceptual diff provably cannot work

The plan called for perceptually diffing the Mandarin pack under
`data/themes/latex-reference.json` against the original XeLaTeX sheet's page rasters.
That is not achievable, and the measurement is unusually clean: reference page 1
against our page 1 is RMSE 0.3124, while reference page 1 against **page 2 of
itself** is 0.2964. Any threshold that accepts the matched pair accepts a mismatched
one, and *prefers* it. Four faces of the same card at 4.5pt are simply more similar to
each other than to anything.

So the test reads both PDFs' content streams and compares what genuinely should still
hold: the page box, the four column edges, the column width, the ink bounds, all four
rule weights, the accent bar, the palette, the intra-row baseline steps and the
section colour coding. Every one an equality rather than a tolerance, once the TeX
point is converted (72/72.27) — which is what turns them into equalities within
0.001pt instead of percentages tuned until they pass.

**Three things that comparison established about the original**, all of which had been
guessed at before:

- **Its type is set at 0.787 of its own declared `\fontsize`**, read off its `Tf`
  operators — `Scale=MatchLowercase` acting on the fallback faces. Its
  `\baselineskip` was *not* rescaled, which is exactly why the leadings compare as
  equalities and the sizes cannot. So this project's "scale 1.0" is 1.27× the size the
  original actually printed at.
- **The shipped reference PDF does embed Inter and Noto Sans Condensed.** What is true
  is that neither is installed on this machine now. The real differences are that it
  uses no `Inter-Regular` at all — its Latin regular is the condensed face throughout
  — and that its Han is Noto Sans CJK **JP**, not SC.
- **Every rule and leading in `latex-reference.json` is 0.374% heavy**, from TeX points
  read as PostScript points. That is 0.0008pt on a hairline, so it is recorded rather
  than corrected: changing it would move every row in every pack for less than a
  thousandth of a point.

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

## Notes, and the reader side of a pair

A sheet has two languages in it, and almost everything in this project is scored
against the one being *learned*. Three things are read off the other one, and all
three were wrong in a way nothing checked.

A **`note`** is one paragraph in a bordered box at the head of its section -- Chinese
classifiers, Japanese counters, and now the Thai politeness particles and the Swahili
clock -- and it is prose about the target written in the *reader's* language, so it
renders from the source row. Nine languages had no such row and silently dropped the
note; five had it blank and drew an empty box, which takes the space and says nothing;
and Spanish had a paragraph about *Spanish* numerals sitting in a concept scoped to
Chinese, so a Spanish reader learning Chinese got advice about Spanish.

The **emergency note** was worse, because it is the line that matters most. `In China:
110 police · 119 fire · 120 ambulance` was assembled from `name_en` and the raw
service words in `regions.csv`, so 225 of the 240 pairs then shipped printed it in English under
the reader's own Emergency heading. It now takes its frame and its ten service words
from `data/registry/emergency-labels/<source>.csv` -- registry rather than
`data/i18n/`, because `core/` renders the sheet and must not reach into the
interface's catalogues -- and the country name from `Intl.DisplayNames`, checked
against all 53 regions in all nineteen natural languages. The two constructed ones are
outside this entirely: neither has a territory, so neither is a destination, and CLDR
has no display names in Quenya to check.

**Every language refused the preposition.** `In {region}` was wrong for three of the
49 English names ("In United States"); Portuguese counted 41 of 49 taking an article
across `na`/`no`/`nos`; French counted `en` for 29 against `au` for 16, so no single
preposition beats 29 of 49; German found seven ungrammatical, since ICU returns bare
nominatives and German wants article-plus-case; Turkish found five surface forms of
the locative suffix and two names not mechanically decidable at all. Most took
apposition. Turkish took `{region} için:`, a postposition governing the bare
nominative -- the same trick its pack used on sixteen slot rows. Hindi took
`{region} में:`, which works because Hindi does not oblique-mark proper nouns.

Three validator rules keep the source side honest: every `note` needs text in every
ready language except the ones it is scoped to (a language is never its own sheet's
source), and every service word in `regions.csv` needs a row in every language's
label file. All twenty-two languages pass both.

**The third is new with the nineteenth and nothing passes it yet.** A concept with an
`applies_to` renders only on the targets it names -- but on those pairs the *gloss*
still comes from whichever of the other eighteen languages is the source, and
`buildBlocks` drops a row with no source row at all. Nothing looked: coverage is
scored against a language as a sheet's *target*, and a concept scoped away from it is
not in its applicable set, so a missing gloss was invisible from both directions.
**28 scoped concepts are short their reader-side rows, and the arithmetic is worse
than it sounds.** `numbers-money.baht` is scoped to `th` and has an English gloss and
no other, so it prints on `th <- en` and on **1 of its 18 pairs**; the same is true of
the won, the lira, the dong, the ruble, the rupiah, the shilling and the euro, all
added in one batch that filled the target side and not the source. The two malaria
rows -- the ones the Swahili translator called the biggest gap in that pack -- print on
1 of 12. The Chinese and Japanese concepts of the same shape have their rows, at 6 of
18, which is what makes this an omission rather than a design. `Intl.DisplayNames`
with `type: 'currency'` closes fourteen of the twenty-eight mechanically, which is how
the forint and the rupee were filled; the rest -- measure words, counters, the maglev,
`please-write-it-in-roman-letters` -- want a translator.

### The graft moves outlines, so the copyright moves with them

Two faces here are built from more than one donor. A face whose family ships no Latin
borrows Latin from Noto Sans — Noto Sans Arabic has none at all — and the four Latin
faces borrow the two conscript blocks from Constructium, because `scripts.csv` points
both `Piqd` and `Teng` at the `latin` stack rather than giving two languages a font
stack each.

Every donor is OFL 1.1, which asks that a redistributed copy carry the notice — and a
font carries its own, in nameID 0. The subset faces already did, inherited from
whichever face `subset_source` started from. The graft broke that quietly: the Latin
faces came to hold Kreative Software's pIqaD and tengwar outlines under a notice
naming only the Noto authors. That is a licence gap rather than untidiness, so
`add_copyright` now appends the donor's own notice to every nameID 0 record of the
merged face, and `data/fonts/manifest.json` carries a `copyright` roll-up gathered
from the built faces rather than hardcoded — so a new donor cannot arrive without
appearing there. `tests/fonts.test.mjs` asserts both.

### The headings were still romanised, which is the same bug in a different file

The Klingon and Quenya packs went native and their **section headings and emergency
service words did not**, so a Klingon sheet read pIqaD under Latin panel titles. The
files are `data/registry/section-titles/<code>.csv` and
`emergency-labels/<code>.csv`, and they had nowhere to keep the citable Latin, which
is why they were left.

They now follow the packs' own discipline: the romanised cell is the authored one and
lives in a `title_roman` / `text_roman` column beside the native one, which
`transliterate_native.py` derives. Nothing in either file is hand-written in pIqaD or
tengwar. That column exists only in those four files, and both readers take the table
by header name, so the other twenty languages neither need it nor notice it. Two
details the corpus route did not have to think about: **the registry is LF where the
corpus is CRLF**, so `build_registry` reads with its own loader rather than
`load_rows`, which splits on CRLF by contract and reads one of these files as a single
line; and the colon joined the pass-through set for the emergency `_frame`, which is
the one string here that is a sentence frame rather than a word. The frame itself
stays ASCII — `{region}: {numbers}` is furniture.

`validate_data.py` already checked both columns with `check_drawable`, so the fonts
were confirmed to carry every glyph as a side effect of the move rather than by a new
check. What is still romanised is `data/i18n/{tlh,qya}.json`, the interface chrome
around the card, and the blocker there is real rather than effort: those strings
interpolate numbers formatted at runtime by `Intl.NumberFormat`, which no
transliteration reaches, so a pIqaD interface would set pIqaD words around Western
digits.

### The PDF never applied a mark offset, and Hebrew is where that showed

`pdf-lib` emits **one `Tj` of glyph ids and no positioning at all**. Inflate a page's
content stream and a run is `1 0 0 1 x y Tm` followed by `<0001…0007> Tj` — so every
glyph is placed by its own advance and every GPOS `xOffset`/`yOffset` fontkit computed
is discarded. That had been true since the renderer was written and had never cost
anything, because for twenty of the twenty-two languages the marks are drawn near
their own origin: Noto Sans Thai's tone marks come back at −3/1000 and land right
where they fall.

**Hebrew's niqqud are the opposite.** They are zero-advance glyphs whose outlines sit
at *positive* x — 52 to 228 of 1000 — and they rely wholly on the `mark` feature.
Pointed `shalom` asks for +539 and +227, more than half a letter each, so with the
offsets dropped every point sat over the next consonant along. It is the pointed
column that is affected, which is the learner's column, on the artifact that gets
printed. This is the same failure mode that ruled out Alcarin Tengwar for Quenya, met
from the other direction: there the font was rejected for needing a −0.5em GPOS shift,
and here a shipped font needed one and did not get it.

**So `drawRun` places each offset glyph itself, and the guard is a proof rather than a
list of scripts.** A glyph is redrawn on its own only if laying out its codepoints
alone returns the same glyph id. That holds for Hebrew, which has no contextual forms,
and fails for Arabic, where an isolated codepoint comes back as the isolated form and
would undo the joining — so an Arabic run is drawn whole, exactly as before. Measured
across seven targets at 300dpi: `ar`, `ja` and `en` differ by **zero pixels**; `he`
by 0.87%, which is the fix; `th` 0.14%, `hi` 0.003% and `qya` 0.10%, which are the
same correction arriving where nobody had noticed it was needed. Arabic carries
offsets up to a full em and renders correctly regardless, which is why the guard
spares it rather than the other way round.

Consecutive *unoffset* glyphs are flushed as one block, because each `drawText` is a
whole `BT`/`Tf`/`Tm`/`Tj`/`ET` of its own. Without that, a pointed Hebrew sheet grew
25%; with it, 16%. Tengwar pays the most, 32%, because nearly every tehta is offset.

Two things worth knowing if you read the content stream. Each block gets its own font
*resource name*, but `pdffonts` reports one embedded font — pdf-lib coalesces the
aliases at save. And the streams are deflated even under `useObjectStreams: false`, so
`tests/render.spec.js` inflates before matching operators.

### Tofu, and why a range table cannot catch it

Writing those notes turned up one bug five times, and it is worth stating as a class:
**a codepoint being part of a script does not mean the shipped face can draw it.**
The validator used to check text against hand-written Unicode range tables, which
were far more permissive than what `scripts/subset_fonts.py` actually builds — so
text passed validation and printed an empty box. This is invisible in the browser,
which falls back to a system font, and fatal in the PDF, which embeds only the subset
faces and has nothing to fall back to.

Three translators found it independently: `cjk-jp` carries JIS X 0208 level 1 only,
so a level-2 kanji validates and prints as a box; the Thai faces have 446 glyphs and
no `ǎ ǐ ǒ ǔ`, so tone-marked pinyin in a Thai note would have; the Korean faces carry
nine CJK ideographs, all accidental spill from language endonyms. The check now reads
the cmap of every face in `data/fonts/` with `fontTools` and tests each string
against the **intersection** of the faces in the stack it renders in — the
intersection, because a glyph present only in the bold face is unusable in regular
text. It found ten cells nothing had flagged, all Arabic.

Four fixes came out of it, none of them in the data:

- **`data/registry/` is scanned recursively.** The subsetter's corpus glob was flat,
  so `section-titles/` and `emergency-labels/` were outside the font union entirely.
  Thirty Korean and Chinese section titles are separated by U+30FB, which only the
  Japanese stack happened to carry — a row of boxes in every PDF of a Korean or
  Chinese reader's card. Those titles now use the dot their own orthography wants:
  U+3001 for Chinese, where enumerating coordinate items is what the 顿号 is for, and
  U+00B7 for Korean. U+00B7 was rejected for Chinese on measurement — it advances a
  full em in `cjk-sc-400` and a third of one in `cjk-sc-serif-400`, so the same
  heading would set differently on a serif sheet.
- **The Arabic stack had no Latin at all.** Noto Sans Arabic ships none, and the
  subsetter intersects its request with the source font's cmap, so asking for Latin
  silently yielded nothing. Every Latin letter, `/`, `=`, `…` and the U+00B7 that
  separates the emergency numbers mapped to glyph 0 — a visible rectangle in Noto.
  The Latin face is merged in now.
- **Two fields were named for where they sit rather than for what lands in them.**
  `numeral` is the label column of a number table and reads from the same cell as the
  gloss, so it is source-side; calling it Latin drew an Arabic or CJK gloss in the
  condensed Latin face. `literal` prints on the reader's side but is read from the
  *target* row, and 41 Korean literals quote Hangul while 56 Arabic ones are in
  Arabic, so drawn in the source's stack they were boxes for every reader but their
  own.
- **The head band is one run in the reader's face, and the pronunciation key quotes
  the target's marks.** This is the Thai-note case above, arrived at from the other
  end: the band's slots had all been effectively ASCII, so nothing had ever asked a
  Thai, Devanagari or Hebrew face to draw `ǎ ǐ ǒ ǔ` or `ṭ ḍ ṇ ṣ`, and none of them
  can. A part therefore carries a `latin` flag and the romanisation half of the
  `legend` slot sets it, so the caron that the whole request is about is drawn by a
  face that has one.
- **A note breaks the way its own language does.** `noteAtom` hardcoded
  `wordBreak: 'space'`, which is silently wrong for every reader whose script has
  none: a Japanese or Chinese note was one unbreakable run and painted straight past
  the right edge of its own shaded box. Three translators wrote around it by inserting
  spaces into their prose by hand before anyone found the cause. Section titles had
  the same bug for the same reason.

## Deliberately not built yet

Named so nobody has to rediscover the gap:

- **Corpus beyond the nineteen shipped languages.** Every language in the registry
  now has a pack, so there is nothing in the "help translate" state -- which the
  gallery and the studio still have to handle, and which their specs now reach by
  serving a coverage report with one language hollowed out rather than by naming a
  real one. Adding the twentieth means a registry row, a `scripts.csv` entry if its
  script is new, a font stack if the Latin faces do not cover it, and
  `python3 scripts/make_todo.py <code>`, then the two task templates in
  `content/PROMPTS/`: `translate-section.md` for the rows, and
  `reader-side-notes.md` for the notes and the emergency labels -- the second of
  which carries what all nineteen languages learned about the `_frame`, so nobody
  rediscovers that a preposition cannot work.

  **Two build steps are not optional and neither is checked by `npm run validate`.**
  A new language is a new *target* for the other eighteen reader tables, so their
  respelling output grows characters nothing has shipped a glyph for -- and the
  nineteenth proved it: the Korean table spells Hungarian's front rounded vowels into
  **37 Hangul syllables `charset.json` had never seen, five of which are outside the
  KS X 1001 set the Korean faces carry** (`겍 퇵 퇼 푈 퓍`, over eleven rows including
  `dietary-needs.no-peanuts`). In the browser a system font hides it; in the PDF it is
  an empty box on a peanut-allergy card. So `npm run respell:charset` and then
  `python3 scripts/subset_fonts.py` have to run after any new language, in that order,
  and `subset_fonts.py`'s own `ALL_LANGS` has to name it first.

  **And the interpolation hazard is a per-language design decision, not a mechanism.**
  Hungarian is the worst case the project has met: it is agglutinative with
  vowel-harmonic suffixes, so `-ul/-ül` (in a language), `-ban/-ben` (in a place) and
  `-ra/-re` all choose by the *insert's* last vowel, and the definite article `a`/`az`
  chooses by its first sound. A placeholder is a plain string substitution and knows
  neither. The escape is the one Turkish and Greek found and Hungarian needs
  everywhere: **put a head noun of your own in front of the insert so the grammar
  attaches to your word.** All six language-slot cells take `{target} nyelven` or
  `{source} nyelven` -- one noun, six cells -- and 44 of the corpus's slot rows were
  restructured into a demonstrative in the required case plus a colon: `Nem eszem a
  következőt: {}`, `Allergiás vagyok a következőre: {}`, `Hol van ez: {}?`. Six more
  needed nothing at all, because a Hungarian numeral does not inflect the noun after
  it (`{} éjszakára`, `{} napig`, `{} éves`). Hungarian also joins the validator's
  `LOWERCASE_LANGUAGE_NAMES`: `magyar`, `angol` and `német` are lowercase adjectives,
  as are the days and the months.

  Four things the eighteenth found that the templates do not yet say. **`make_todo.py`
  omits exactly the rows a new language needs most of the reader-side prompt**: it
  filters on `applies_to`, which is right for a target row and wrong for a `note`,
  whose scope names the language it is *about* -- so the four notes are absent from
  every todo and the validator warns about them immediately afterwards. **A `ref`,
  `refphrase` or `num` row's `literal` draws nothing**, because no reference template
  defines the field, so a caveat parked there is invisible on the card. **`applies_to`
  has to be widened when a new language joins an existing scope**, which nobody did
  for the seventeenth: `numbers-money.euro` was scoped `de;fr;es;pt`, so the Italian
  pack shipped without the euro while four other eurozone packs had it. And **the
  subsetter's `ALL_LANGS` has to be widened too** -- `it` was missing from it, so the
  Italian corpus, its section titles and its emergency labels were outside the font
  union entirely. That one printed nothing wrong only because Italian is Latin; the
  same omission for Greek would have been a sheet of empty boxes.
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
- **Emergency numbers for two countries.** 47 of 49 regions are verified against a
  named source and print; the citations are in `data/registry/regions-sources.md`.
  The two left are honest holdouts rather than unfinished work. The Government of
  Canada states plainly that DR Congo has no centralised emergency number, so that
  cell is empty. For Iraq the UK FCDO publishes 911, 122 and 115 while Canada says
  there is no centralised number; two foreign ministries cannot both be right, and
  a number that does not answer is worse than a blank, so it stays withheld with
  the FCDO values recorded for a future reviewer.

  **The respelling side of this list is closed, and how it closed is the useful
  part.** What was left was 29 rows: 26 where a Latin acronym stands inside a
  non-Latin sentence — `Wi-Fi`, `eSIM`, `SIM`, `PIN`, `QR`, `cm` — and three where
  `thaig2p` looped. The curators appeared to disagree: the Mandarin and Thai sheets
  respell the acronym natively (`wee-fye`, `ee-sim`) and the Russian and Korean ones
  leave the letters standing (`oo vas yest Wi-Fi`, `{}cm-yeh-yo`). They are not
  disagreeing about the same question. An override file is
  `<target>__en__en-US.csv`, a respelling **for an English reader**, so "say Wi-Fi"
  is a true instruction to somebody who reads English and no instruction at all to
  the six readers whose tables emit no Latin letter — and those files are exactly the
  pairs where the curated layer already wins, so the Russian curator's `Wi-Fi` still
  prints on ru←en either way. The Mandarin and Thai curators wrote down a *sound*,
  which is a fact about the target and generalises; the other two wrote down a
  presentation, which does not. So `LOANWORDS` in `scripts/build_ipa.py` gives the
  token a reading, per token and per language, and every reader spells it in its own
  script. `data/respell/charset.json` gained **no ASCII letter in any reader**.

  Three details worth keeping. The reading is IPA rather than the target's own
  spelling of the sound, because **Mandarin cannot be spelt**: `fai` is not a
  Mandarin syllable, so there is no Pinyin for `Wi-Fi` and `pinyin_to_ipa` refuses
  it. Each value was chosen so the English table reproduces the curated string
  where there is one — `wifaɪ` respells to `wee-fye`, the Mandarin curator's own
  spelling, where the Pinyin-legal `weɪ` gives `way-fye` — which is the only
  independent check available. And the row carries `ipa=<route>+loan`, so
  `npm run validate` counts the 26 cells no route produced instead of hiding them.

  The three Thai rows were a different fault: the decoder loops on `ธรรม` and `บบ`,
  which are dictionary *syllables* that are not words, and asked for the word the
  same model answers cleanly. `thai_syllables` retries per word, which matches the
  curated `KAH tam-niam` and `ra-bop` exactly and leaves the other 746 rows
  untouched.

  What is blank now is blank *correctly*: 76 prose notes, where a respelling of a
  paragraph would be meaningless, and 29 bare symbols like `¥`. The only other
  blanks are rows whose romanisation column is not written yet — Japanese, Korean
  and Mandarin are read off `romanization_hepburn`, `romanization_rr` and
  `romanization_pinyin`, so a new row in one of those three has no `ipa` until a
  translator fills the column and `npm run ipa` runs again.
- **Dictionary line breaking** for Thai and Khmer. `scripts.csv` marks them
  `word_break: dict`; the measurer falls back to breaking anywhere and the solver
  raises a warning, rather than pretending. It does hold each *character cluster*
  together — a Thai tone mark or spacing vowel is glued to its consonant and a
  leading vowel to what follows it — which is the cheap core of a Thai character
  cluster segmenter, and it is the difference between a break in the wrong place and
  a mark orphaned onto a dotted circle. Real word breaking needs a wordlist of a few
  hundred KB and is not here yet.

  Breaking *anywhere* had to learn three exceptions along the way, all of which
  printed in shipped notes. A Latin word embedded in a CJK run is one atom, because
  `any` means between ideographs, kana and hangul and not inside a romanisation
  printed among them — `ichiman` was free to break after any letter. A digital time
  or a decimal is one number: a Chinese note wrapped `16:00` as `16:` and `00`, and
  the fix needs the glue to work in both directions, since gluing only forwards
  still leaves `16` and `:00` as two atoms with a legal break between them. And a
  hyphen that *opens* a token belongs to it: every language's number note lists the
  Japanese counters as `-tsu`, `-mai`, `-hon`, and an unconditional break-after-hyphen
  rule dangled a bare `-` at the end of a line in nine of them.
- **Per-row split overrides.** The drag handles cover margins and the column gap;
  dragging an individual row's internal divider would need per-row overrides
  threaded through `atoms.js`.
- **Whole sheets as shipped assets.** The first face of every pair is committed and
  the rest are typeset on open. Committing all of them was the other option and the
  numbers ruled it out: 462 pairs is 55MB gzipped and 737MB raw, against 6.0MB for the
  first faces alone. So a reader gets sharp vector immediately and the remaining seven
  or nine faces about a second later, which is the point at which they would want the
  second one.
- **A reviewer queue.** `content/CONTRIBUTING.md` defines the confidence tiers and
  the validator enforces the safety gate, but there is no review UI.
- **The rest of the translators' backlog**, still staged in
  `content/PROPOSED-CONCEPTS.md` with the argument and the sources for each. The
  strong cases have shipped — the malaria pair, both pork-stock questions, the
  Indonesian pork codes, dengue and the currency table are in the bank now — and what
  is left is deliberate: the currency rows whose gloss cost outweighs the country they
  cover (English's euro, Spanish's sol, Portuguese's kwanza and metical, Mandarin's
  ringgit), `rail-station-words.conductor`, and Italy and Greece in the dengue scope.

## Notes worth keeping

Three failure modes here were silent rather than loud, and the fixes are load-bearing:

- **fontkit's subsetter drops glyphs carrying TrueType hinting instructions**, so
  the exported PDF lost most of its Latin while CJK survived. `subset_fonts.py`
  strips hinting, which is irrelevant at print resolution anyway.
- **The vendored fontkit needs a polyfill, and only Devanagari and Thai find out.**
  `@pdf-lib/fontkit` ships a Babel-transpiled build in which exactly one generator --
  `StateMachine.prototype.match` -- became a state machine calling a
  `regeneratorRuntime` the package never bundles and declares no dependency on.
  Nothing else in fontkit reaches that function: it is the matcher the Indic and
  Universal shapers use. So Latin, Cyrillic, Greek, Arabic, Han, Kana and Hangul all
  shaped fine for months, and the first Devanagari string threw
  `regeneratorRuntime is not defined` at the first glyph. `npm run vendor` now
  declares the name and imports `regenerator-runtime` for the side effect of filling
  it in. Worth knowing before adding Khmer, Tamil, Bengali or any other Indic script.
- **A font that covers a script in one file does not cover it in the others.** The
  *variable* Noto Sans carries all 128 Devanagari codepoints; the four static faces
  that fed the `latin` stack carry none. Checking `NotoSans-var.ttf` and concluding
  "Devanagari is covered" was wrong, and the Hindi translator caught it by testing
  the shipped subsets rather than the sources -- which is the right instinct and is
  now what `tests/fonts.test.mjs` does for the subsetter's other failure mode.
  Devanagari has its own stack, as Thai does.
- **Only `text` is guaranteed to reach the sheet.** `script_alt` and `literal` are
  both fields a reader switches on, and the default set is `script`, `roman`,
  `gloss`, `respell`, `numeral`. So a safety-relevant qualification that lives in
  `text_alt` or `literal` has no margin on a default card. The Spanish translator
  found this while being told the opposite by a brief of mine, and the right answer
  is the one that pack took: pack the coverage into `text` -- `Sin cerdo ni jamón ni
  embutidos` rather than `Sin cerdo` with the rest hidden -- and leave `literal` for
  the residue a card cannot carry.
- **Three of the seven field toggles drew nothing.** "Columns shown" offers the
  seven fields an item can carry, and `core/solve/arrange.js` orders all seven — but
  no template in either theme *defined* `script_alt`, `ipa` or `literal`, and
  `cellGrid` filters the template's own field list. So switching them on was a no-op,
  in the one panel whose whole subject is where text lands. The Japanese translator
  found it while arguing about where a safety warning could safely live: the answer
  was nowhere, which is why it now lives in `literal`. The `entry` template carries
  all three now; the reference tables deliberately do not, because they are one line
  of four columns and that is the point of them. `ipa` still draws nothing, for the
  honest reason that the column is empty everywhere.
- **JavaScript's `\s` matches U+00A0.** The line breaker split on
  `/(?<=[\s\-–—/])/`, so every no-break space in the corpus -- 228 of them, all
  French, holding `Thaïlande :` and `7 h` together -- was a legal break point. Nothing
  had visibly broken, which is why it survived: the guarantee was typographic intent
  and nothing more. The French translator found it by reading the regex rather than
  the output, and the break class is spelled out now.
- **`display` on a class beats the user agent's `[hidden]`.** The Custom row under
  each setting ladder was never actually hidden: `.numeric-custom { display: flex }`
  outranks `[hidden] { display: none }`, so a slider sat under every ladder showing a
  value that was not in effect. `.banner[hidden]` and `.diff[hidden]` already carried
  the rule; that one was missed, which is the shape of this bug -- it is invisible
  until someone reads the panel expecting the ladder alone.
- **A glyph drawn flush to its viewBox loses half its stroke.** `pageGlyph` scales
  the page to fill a 30-unit box, so the 7x5in card's rect sat exactly on the edge
  and its 0.8pt border was clipped down the left and right. `frame()` now bleeds the
  viewBox by 0.6 units, which fixes every glyph rather than that one.
- **fontkit's subsetter also corrupts glyph data from a long-`loca` face.** It
  copies glyph buffers verbatim and then, if the subset it produced is small enough
  for the short `loca` format, halves every offset to store it -- and fontTools
  leaves glyph data odd-length when it writes the long format, because long `loca`
  stores byte offsets and does not need alignment. Halving an odd offset truncates
  it and every glyph after the first odd one is read a byte off. `subset_fonts.py`
  pads every glyph to four bytes, and `tests/fonts.test.mjs` asserts the property
  rather than the padding. The trigger is a large source face embedded with a small
  subset, which is why it hid for so long: the CJK faces have always been
  long-`loca`, but the reference sheet embeds enough Han that the output stayed
  long-`loca` too. A face where the target script barely appears would have lost it.
  Twelve of the thirty faces fail the test on the build before the fix.
- **Chrome will not load `file://` subresources from an `about:blank` document**, so
  rasterising via `setContent` fell back to a default font and produced output
  that looked subtly wrong rather than obviously broken.
  `scripts/local_page.mjs` serves from a virtual origin and fails loudly.
- **Reference tables need a condensed Latin face.** Without the equivalent of the
  original's `\tablelatin`, four columns cannot hold a gloss and a respelling on
  one line. Separately, refusing to break at an *existing* hyphen made
  "jong-dyen-jahn" reserve its full natural width and squeeze every other column;
  allowing it cut one table's height by 39%.
