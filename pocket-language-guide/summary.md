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
is a deliberately tight layout that should not be second-guessed. On 7×5in, 167 of
the 272 shipped pairs settle on eight faces and 105 on ten; none now fits six. The
tens are the scripts that need the most vertical room: **every** Japanese, Arabic and
Devanagari sheet takes ten, Russian eleven of sixteen and Thai nine, while no English
or Vietnamese sheet needs one. The reference sheets reached four by hand against a
bank of 413 concepts. It is 776 now; the divider defaults to one position per section
rather than one per row, which costs type size; and — the largest of the three — the
respelling column has content on all 272 pairs rather than 16, so there is a third
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
being learned, and one rule table per language doing the reading. **All seventeen
reader tables now exist and every one of the 272 pairs prints a respelling.**
`node scripts/respell_check.mjs <reader> --gaps` counts IPA symbols that reach the
page because no rule matched, and every reader is at zero. Sixteen of the tables
derive from a published pronunciation key for that language (`content/RESPELL-SYSTEMS.md`
records which, and what had to be adapted where no key existed); the English one was
read off the 12,001 curated respellings already in the corpus, which is a better
source, because it records what a person actually chose for each sound in context.

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
  as `Ich spreche kein Deutsch` — false, on 135 of the 272 pairs, rather than merely
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

  This is the one place the gallery loads the engine, and only on the click — the
  committed thumbnail holds the frame so the card is never blank, then the typeset
  faces replace it. They are SVG, so there is no resolution to run out of.

  Shipping the faces as assets was the obvious alternative and is worth recording
  as rejected. A face is about 120KB of SVG and a default sheet is eight of them, so
  240 ordered pairs is roughly 230MB in the working tree — and a compact encoding of
  the plan is no smaller, because the plan *is* the text, positioned. What is
  pre-rendered instead is the expensive part: fitting a sheet means searching for
  the fewest faces and the largest type that hold the content, re-measuring and
  re-breaking the whole sheet at a dozen candidate scales. `packs/index.json`
  already records the answer, so the lightbox pins it and lays out exactly once —
  byte-identical output, measured 10–12× faster, about 150ms rather than 1.8s, and
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

### The paper's own colour

`spec.background` washes the page behind the columns. White is the default and stays
it: the reference card is white, a wash costs ink on a sheet someone prints at home,
and `low-ink` and `mono` drop it outright the way they drop row shading.

Four modes. `tint` is one flat rect and **takes its swatch literally** — the reader
names the paper colour, so diluting it would make the picker lie about itself; the
first version mixed it toward paper and the default came out at (254,254,254), a
control that appeared to do nothing. `flag` reads the colours off the flags of the
countries that speak the target language, which is a fact about the language rather
than a decoration: `regions.csv` carries them for the 28 countries the seventeen
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
| Everything | 0 | 776 | 6–8 faces of 7×5 |
| Broad | 0.74 | 306 | four faces — what both hand-built originals settled on |
| Core | 0.82 | 147 | one sheet |
| Essential | 0.95 | 11 | **one phone face at full nominal type, in all seventeen languages** |

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
                    #   thumbnails only, one per pair, then indexed down to a
                    #   fifth-bit palette: 240 pairs in 8.6MB rather than 27MB
npm run shell       # data/shell.json + the respell index + sw.js VERSION
python3 scripts/fetch_fonts.py && python3 scripts/subset_fonts.py   # data/fonts/
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

The bank is now **771 concepts across 57 sections in sixteen languages**, which is
**272 ordered pairs** — every one of which renders, and two of which anyone wrote a
sheet for. That ratio is the whole argument for joining on `concept_id` instead of
storing pairs: the sixteenth language added 745 rows and 30 new pairs.

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
fish stock" is better asked as `Món này có nước mắm không ạ?`.

Third, three of the four newest packs had to answer a question their language
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
against all 49 regions in all sixteen languages.

**Every language refused the preposition.** `In {region}` was wrong for three of the
49 English names ("In United States"); Portuguese counted 41 of 49 taking an article
across `na`/`no`/`nos`; French counted `en` for 29 against `au` for 16, so no single
preposition beats 29 of 49; German found seven ungrammatical, since ICU returns bare
nominatives and German wants article-plus-case; Turkish found five surface forms of
the locative suffix and two names not mechanically decidable at all. Most took
apposition. Turkish took `{region} için:`, a postposition governing the bare
nominative -- the same trick its pack used on sixteen slot rows. Hindi took
`{region} में:`, which works because Hindi does not oblique-mark proper nouns.

Two validator rules keep the source side honest: every `note` needs text in every
ready language except the ones it is scoped to (a language is never its own sheet's
source), and every service word in `regions.csv` needs a row in every language's
label file. All sixteen languages now pass both.

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
- **A note breaks the way its own language does.** `noteAtom` hardcoded
  `wordBreak: 'space'`, which is silently wrong for every reader whose script has
  none: a Japanese or Chinese note was one unbreakable run and painted straight past
  the right edge of its own shaded box. Three translators wrote around it by inserting
  spaces into their prose by hand before anyone found the cause. Section titles had
  the same bug for the same reason.

## Deliberately not built yet

Named so nobody has to rediscover the gap:

- **Corpus beyond the sixteen shipped languages.** Every language in the registry
  now has a pack, so there is nothing in the "help translate" state -- which the
  gallery and the studio still have to handle, and which their specs now reach by
  serving a coverage report with one language hollowed out rather than by naming a
  real one. Adding the seventeenth means a registry row, a `scripts.csv` entry if its
  script is new, a font stack if the Latin faces do not cover it, and
  `python3 scripts/make_todo.py <code>`, then the two task templates in
  `content/PROMPTS/`: `translate-section.md` for the rows, and
  `reader-side-notes.md` for the notes and the emergency labels -- the second of
  which carries what all sixteen languages learned about the `_frame`, so nobody
  rediscovers that a preposition cannot work.
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

  What is left on the respelling side is now **19 rows of 12,837**, about one per
  sheet, and every one of them is a Latin acronym or brand embedded in a non-Latin
  sentence: `Wi-Fi`, `eSIM`, `ATM`. They are left rather than unfinished, because the
  human evidence disagrees with itself — the Mandarin and Thai curators respelled
  them natively (`wee-fye`, `ee-sim`) while the Russian and Korean ones left the
  Latin standing (`oo vas yest Wi-Fi`) — and neither is derivable from the other.
  Carrying the Latin run through the way `{}` is carried *is* expressible, and it is
  the smaller half of the decision: it would put ASCII letters into the respelling
  charset of the six readers (ar hi ja ko ru th) that have **none** today, which is a
  choice about what a reader is shown, not a transcription. A further 76 rows are
  blank *correctly*: 64 are prose notes, where a respelling of a paragraph would be
  meaningless, and 12 are bare symbols like `¥`.
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
- **Pre-rendered faces as shipped assets.** The gallery's lightbox typesets the
  pair when a reader opens it, rather than reading faces off disk. Committing them
  was the other option and the numbers ruled it out: a face is ~120KB of SVG or
  ~1.8MB of `LayoutPlan` JSON, and 240 ordered pairs at eight faces each is well
  over 200MB in the working tree either way. What *is* pre-rendered is the expensive
  half — the face count and type scale the fit settled on, already in
  `packs/index.json`, which the lightbox pins to lay out once instead of searching:
  byte-identical output about twelve times faster, for no new bytes. Also committed
  is the 480px first-face thumbnail, which
  goes up immediately so the dialog is never empty while the rest is typeset. The
  faces it then shows are vector, so they are sharper than any PNG that could have
  been shipped.
- **A reviewer queue.** `content/CONTRIBUTING.md` defines the confidence tiers and
  the validator enforces the safety gate, but there is no review UI.
- **Eleven concepts the translators asked for**, staged in
  `content/PROPOSED-CONCEPTS.md` with the argument and the sources for each rather
  than added. The strongest are a malaria pair (the Swahili translator's "biggest gap
  in this pack" — it is the most likely serious illness for a visitor to any of the
  four countries Swahili serves), a pork-stock question that Japanese, Korean and
  Mandarin all want separately from `no-pork` because 豚骨 and 猪油 are not 豚肉, and
  an Indonesian `common-signs` row for the codes that stand in for the word `babi` —
  a reader can follow `Tanpa babi` perfectly and still walk into a place signed
  `Lapo B2`. Staged rather than added because a universal concept costs every one of
  the fifteen packs a row, and the two that *were* added this round took thirteen
  agents to fill.

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
