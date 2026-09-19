# Conversation boards and native mobile: execution log

This file is the execution log for the plan in
`tmp/extension-mobile-convoboard/IMPLEMENTATION_PLAN.md`. It records what was done,
what was measured, and what is not yet verified. `summary.md` stays a description of
the architecture as it actually is; this file is the running account of getting
there, and the two should not duplicate each other.

Every row marked **passed** has a command and an output behind it. **not run** means
exactly that. A task is not ticked because its design is agreed.

---

## P0 — Audit and baseline

**Status: complete.** No feature code; this task is measurement.

### The checkout is ahead of the snapshot the plan read

The plan inspected remote `cb68543e`. The local branch has since gained, in this
session alone, the swatch row, the numbers-money redundancy rating, two new
validator gates, the botanical ornament redesign, nominative language titles and
three new concepts. Nothing in the plan assumes otherwise, but two of its
assumptions are now wrong in the app's favour and one in the other direction; they
are recorded under *Corrections to the plan* below.

### Toolchain, as it actually is

| | |
|---|---|
| Entry points | `index.html` → `ui/gallery.js`, `sheet.html` → `ui/sheet-options.js`, `customize.html` → `ui/studio.js` |
| Build | none. Buildless ES modules served directly; `esbuild` is a devDependency used by `scripts/build_vendor.mjs` only |
| Types | JSDoc + `jsconfig.json` `checkJs`, run as `tsc -p jsconfig.json` |
| Gate | `npm test` = `validate` → `check` → `test:unit` → `playwright` |
| Node | v22.22.1. Capacitor 8 wants Node 22+, so this is already compatible |
| Deployment | **no GitHub Actions workflow.** The site is plain GitHub Pages off `main`, Jekyll-processed, so *a pushed file is a published file* |

The last row is load-bearing for N0: `ios/`, `android/` and `dist/mobile/` would be
served to the public the moment they are committed. `pocket-language-guide/.gitignore`
currently has `node_modules/`, `tmp/`, `test-results/`, `__pycache__/` and nothing
else.

### The corpus loader is light enough to use directly

Plan §3.4 says to use the existing corpus path "if it is sufficiently light" and to
extract data-only helpers if it drags in the layout engine. Measured, by walking the
static import graph from each module:

| module | static modules | static bytes | reaches the solver? |
|---|---|---|---|
| `core/pack.js` | 2 | 44 KB | **no** |
| `ui/i18n.js` | 4 | ~30 KB | **no** |
| `ui/io.js` | 23 | — | yes, the whole solver and `render/fonts.js` |
| `ui/gallery.js` | 26 | 1,459 KB | yes |
| `ui/sheet-options.js` | 24 | 1,434 KB | yes |
| `ui/studio.js` | 38 | 1,656 KB | yes |

So **no extraction is needed for the resolver**: `core/pack.js` is a 44 KB
data-only module that imports `core/csv.js` and nothing heavy. A board can join
concepts against language realizations with the real loader. `ui/io.js` is the
opposite and must not be imported wholesale by the board page; its CSV and
validation primitives have to be reached some other way.

### Finding: the gallery statically downloads 969 KB of fontkit it never uses

`ui/gallery.js`'s own header says it "stays fast and works offline without loading
the solver, the corpus or a CJK font". That is no longer true, and two thirds of the
page's JavaScript is one file:

```
ui/gallery.js -> ui/lightbox.js -> ui/app.js -> core/sheet.js -> core/fonts.js
              -> vendor/fontkit.esm.js      (969 KB of the gallery's 1,459 KB)
```

`ui/lightbox.js` already lazy-imports `core/sheet.js`, `ui/export.js`,
`core/pack.js` and `ui/app.js` inside `faceSheet()` — but it *also* statically
imports four bindings from `ui/app.js` at the top of the file, and that static edge
is what pulls the chain in eagerly. The dynamic import at the bottom is therefore
redundant with the static one at the top, and the intended laziness does not happen.

Confirmed in a browser rather than only by reading imports: loading `/index.html`
and counting requests, the gallery fetches 26 JavaScript modules before the reader
touches anything, among them `vendor/fontkit.esm.js`, `core/sheet.js`,
`core/fonts.js`, `core/measure.js` and eight files of `core/solve/`. `pdf-lib` is
correctly absent, so the laziness works where `ui/export.js` is the only route in
and fails where `ui/app.js` is.

This matters three times over: it is a live defect on the app's landing page, which
is the first thing a phone on a bad connection fetches; C2 requires that a board not
load the solver, PDF library or fontkit to show a phrase, and any board module
importing `ui/app.js` inherits all of it; and N0 asks for a measured bundle, which
this would inflate. Scheduled as the first piece of P1.

### Asset inventory by class

Tracked bytes under `pocket-language-guide/`, by what the class is *for*. Measured
with `git ls-files | du -ab`. (The `packs/` rows are being re-measured: a pack
regeneration was running when this was taken and `prerender_packs.mjs` deletes the
whole directory before rewriting it.)

| class | files | MB | needed in a native bundle? |
|---|---|---|---|
| fonts: ttf (PDF embed) | 78 | 31.2 | only if PDF export ships |
| packs: gallery thumbnails | 2,756 | ~13 | the gallery reads them; candidate for trimming |
| fonts: woff2 (browser) | 78 | 11.3 | yes |
| data: language packs | 846 | 7.0 | yes |
| data: other (respell, presets, icons) | 78 | 3.1 | yes |
| data: UI catalogues | 53 | 1.4 | yes |
| packs: face SVG (gzipped) | 2,756 | ~1.4 | the lightbox reads them |
| vendor (pdf-lib, fontkit) | 5 | 1.4 | only if PDF export ships |
| app code (js + html/css) | 51 | 1.0 | yes |
| data: registry | 117 | 0.5 | yes |
| data: concepts | 16 | 0.2 | yes |

There are **no committed PDFs and no committed full-resolution face PNGs** — the
plan's N0 warning about "all pre-rendered `packs/` PDFs and high-resolution PNGs"
does not apply, because `prerender_packs.mjs` deliberately stopped emitting them
(its header records why: nothing read them and they cost 13 MB across six pairs).
Each pack directory holds exactly `thumb.png` and `face-1.svg.gz`.

The real weight is **fonts, not packs**: 42.5 MB of the tracked ~81 MB, and 31.2 MB
of that is TTF used only by `render/pdf.js`. A text-only conversation board needs
none of it.

### State that a board must not disturb

| thing | where | consequence |
|---|---|---|
| reader's UI language | `plg.reader` in `ui/app.js`; `active`/`overlay`/`english`/`direction` are module globals in `ui/i18n.js` | `loadUiLanguage()` mutates all four *and* sets `document.documentElement.lang`/`dir`. A listener-facing surface cannot call it. P1 owes a scoped catalogue reader that returns a lookup without touching these. |
| personal edits | `plg.edits.<target>__<source>` in `ui/io.js` | pair-global, and holds both `overrides` and printed `include` flags. Board membership must not live here — that is the semantic boundary §5.2 names. |
| studio column widths | `plg.studio-cols` | unrelated |
| banner dismissal | `plg.banner-hidden` | unrelated |

### Shell and offline

`scripts/build_shell.mjs` composes the manifest from `CODE_DIRS`
(`core`, `render`, `ui`, recursive, `.js` only), `ENTRY_FILES` (an explicit list
including the three HTML pages and `style.css`), and `DATA_DIRS` (non-recursive,
`.csv`/`.json`). It bumps `VERSION` in `sw.js`. So `conversation.html`,
`conversation.css` and `data/boards/` each need an explicit entry; `ui/conversation*.js`
and `core/conversation.js` would be picked up by the directory scan automatically.
`data/registry/redundancy-ratings/` is a deliberate exclusion (a subdirectory the
non-recursive scan does not reach), which is the precedent for keeping raw material
out of the shell.

### Baseline check results

Taken at `a33734c3`, before any board work.

| command | result |
|---|---|
| `python3 scripts/validate_data.py` | **passed** — 864 concepts, 59 sections, 53 ready languages, 0 errors, 197 warnings |
| `npx tsc -p jsconfig.json` | **passed** — no diagnostics |
| `node --test tests/*.test.mjs` | **passed** — 590 tests, 0 failures |
| `npm run check` | **not run** — includes `build_shell.mjs --check`, which scans `packs/`, and a regeneration is in flight |
| `npx playwright test` | **partial** — `tests/gallery.spec.js:134` fails because the committed packs predate three rounds of corpus growth; a full `npm run prerender` is running to clear it. No other pre-existing failure found. |

The 197 warnings are the standing ones: missing glosses in `qya`/`tlh`, unreviewed
emergency numbers, and machine `ipa` nobody has read. They are not new.

### Corrections to the plan

1. **§3.4's fallback is unnecessary.** `core/pack.js` does not import the layout
   engine, so the resolver can use the real loader rather than extracted helpers.
2. **§2's `ui/app.js` note understates the problem.** It says to "audit imports
   before reuse"; the measurement above shows the cost is 969 KB of fontkit and that
   the existing lazy-loading in `ui/lightbox.js` is already defeated by a static
   import in the same file.
3. **N0's `packs/` warning is already satisfied** and should not drive design: no
   PDFs or full-resolution PNGs are committed. The bundle question is the 31 MB of
   PDF-embedding TTF instead.
4. **There is no deployment workflow to audit.** Publication is `git push`, so
   native build directories must be gitignored rather than merely excluded from a
   pipeline.

### Not done in P0

- Screenshots of existing flows with synthetic content — **not run**.
- Provisional native application ID — **not proposed**; §1.2 and N1 both require
  owner approval before distribution, and nothing before N1 needs one.

---

## P1 — Shared contracts

**Status: complete.** `core/conversation.js` and `tests/conversation.test.mjs` hold
the contracts; `ui/app.js` and `ui/i18n.js` gained the two seams the board needs.
Ten tests, all passing.

### The engine is loaded on demand, and the gallery is 89 KB

The defect P0 found is fixed at its source rather than at the lightbox. `ui/app.js`
is the shared bootstrap — every page imports it for `loadText`, `readerLanguage`,
`showFatal` — and three of its functions needed the solver and the font registry.
Naming those at the top of the file charged every importer for them.

`browserSheetContext`, `ensureFontCss` and `saveForOffline` now import what they
need when they are called. Each already returned a promise or was already
asynchronous, so no caller changed. Measured again, in a browser, counting requests
to `/index.html`:

| | before | after |
|---|---|---|
| modules fetched | 26 | **9** |
| static bytes | 1,459 KB | **89 KB** |
| `vendor/fontkit.esm.js` | fetched | **not fetched** |
| `core/solve/*` | 8 files | **none** |

`sheet.html` and `customize.html` are unchanged, which is correct: they import the
solver directly because they use it. `ui/lightbox.js` lost the dynamic
`import('./app.js')` that had become redundant with its own static one.

### A listener catalogue that does not touch the owner's

`loadUiLanguage` sets four module globals *and* `document.documentElement.lang`/`dir`,
so it cannot be used to render a listener-facing control — §4.4 forbids the owner's
persisted preference moving to show a reply. `ui/i18n.js` gained `loadCatalogue(code,
loadText)`, which returns `{ code, dir, t }` and mutates nothing.

Both now share one `lookup(words, base, key, vars)`, and `loadUiLanguage` is
implemented in terms of `loadCatalogue` rather than repeating the English-underneath
fallback. Two callers, one function — the placeholder and bidi-isolation rules are
exactly the part that must not diverge between the interface and a listener surface.

### The board contracts

`core/conversation.js` is pure: no DOM, no fetch, no storage. It carries the board
and state typedefs, `validateBoard`, `phrasesOf`, `resolvePhrase`, `missingPhrases`
and `reduce`.

- **`validateBoard` returns every problem, not the first** — an author fixing six
  things wants six. It checks schema version, unique placements, submenu targets,
  reachability from the root, a depth bound of three, twelve buttons to a node, and
  that `kind` is one of exactly two values, so a board file can never carry a URL or
  an expression.
- **`resolvePhrase` returns `null` rather than a partial result.** A board showing
  the owner's own language to the listener has not degraded gracefully. Scope goes
  through `appliesTo`, the sheet's own helper, so a concept scoped away from this
  listener is unreachable here too rather than quietly resolving to whatever gloss
  row exists.
- **`reduce` is the navigation table.** Every row of §4.1 is a unit test. Two
  properties are worth naming: a message opened from a submenu dismisses back to
  *that* submenu, which is why `path` is a stack; and a second `open` arriving in the
  same breath is a no-op, which is B03 — "the opening tap cannot also dismiss the
  message" — stated as a property rather than chased through a browser.
- A test walks the import graph and fails if `core/conversation.js` ever reaches the
  solver, fontkit, `render/` or `core/measure.js`. It asserts the walk actually
  walked, so it cannot rot into a vacuous pass.

Findings that settled three earlier decisions follow.

### A new board section does not need a new corpus group

`sections.csv` has both a `section_id` and a `group`, and the `group` is the
*filename* — sixteen groups carry fifty-nine sections. `corpus.groups` is the set of
groups, and `loadLanguage` asks every language for every group, tolerating an absent
file. So a new group would make fifty-one of the fifty-three packs request a file
that is not there: handled, but fifty-one 404s per load and a question the service
worker should not have to answer.

Putting a `massage-spa` **section** inside an existing **group** avoids all of it.
`hotel` is the right home — it already holds `hotel-requests`, which is where
`another-towel-please` lives — and every pack already has `data/lang/<code>/hotel.csv`.
No new file, no new request, no shell entry.

### The pilot's language scope uses the convention already in the file

`applies_to` names the *target*, so scoping the new concepts to `zh-Hans` prints them
only on Mandarin cards while the English rows in the same group serve as glosses.
That is exactly what a board resolving English-owner → Mandarin-listener needs, and
it is the same convention `payment-receipt.can-i-pay-by-mobile-money` (scoped
`am;sw`) already uses. The other fifty-one languages will raise the standing "has no
gloss in ..." warning, which is the honest signal and not a new class.

`default_on=0` on the section, so it never joins a default printed sheet — §5.1's
requirement that board-only material not silently grow every existing sheet.

### What the corpus already says, and what the spa board still needs

Searched before proposing, per C1. Of the ten main-board meanings in §5.1:

| meaning | corpus today |
|---|---|
| Thank you | `social-basics.thank-you` — reuse |
| That hurts | `emergency-medical.it-hurts-here` — reuse, and it is stronger than "I don't like this", which §5.1 asks for |
| Towel, please | `hotel-requests.another-towel-please` — **reuse**; see below |
| Stronger pressure | **absent** |
| More gently | **absent** (`dietary-needs.less-spicy` is the only "less") |
| That pressure is good | **absent** (`slang.thats-good` is register-wrong) |
| Please avoid this area | **absent** |
| Please focus on … | **absent** |
| Please pause | **absent** (`communication.please-wait-a-moment` is a different act) |
| Please stop | **absent** (`taxi.please-stop-here` is about a vehicle) |

`body-parts` already has fifteen words — back, leg, arm, foot, hand, knee, head,
chest, stomach, skin and five more — but they are **words, not messages**, and §3.3
forbids assembling a message by concatenation. So the submenu needs complete
sentences of its own. `shoulder`, `neck` and `calf` are missing from the word list
regardless, and they belong in `body-parts` where every other feature can reach
them, not in a spa-specific list.

### A board node *is* an index, and terms are indexed rather than copied

The first draft of the table above proposed a spa-specific towel row, on the grounds
that `hotel-requests.another-towel-please` "is a hotel request". That was the wrong
instinct and the rule is now explicit: **an existing term is reached from a new
context by indexing it into an additional, overlapping subsection, never by adding a
second concept that says the same thing.**

The board format already supplies the mechanism, so this costs nothing to honour. A
board node is a subsection, its buttons carry a `phraseRef` naming a concept, and
nothing stops two nodes — on the same board or on different boards — from naming the
same concept. Subsections overlap by construction. So the spa board's comfort node
points at `hotel-requests.another-towel-please`, its closing node at
`social-basics.thank-you`, and its pain node at `emergency-medical.it-hurts-here`,
and none of those rows is written twice.

This matters more than tidiness. An entry is a per-language realization of a
language-independent concept, which is what keeps the corpus O(N) rather than
O(N²) — a duplicated concept multiplies by fifty-three, has to be translated again,
drifts from its twin, and hands the redundancy table a pair of rows that mean the
same thing. The index entry is one line of JSON.

A corpus-level many-to-many section membership is **not** being added. `section_id`
stays single-valued, because it governs printed placement, colour role and rank, and
nothing outside the board needs the overlap yet. If the printed side later wants it,
a `data/registry/section-index.csv` of `(section_id, concept_id, rank)` is the shape
to add — a secondary membership beside the primary one, not a replacement for it.

Revised estimate: one new section, **seven** new concepts for the meanings the corpus
genuinely cannot say (stronger, gentler, that is good, avoid, focus, pause, stop),
three new `body-parts` words, and three existing concepts indexed rather than
copied.

---

## C1 — Board data and pure resolver

**Status: resolver done, content researched and awaiting the pack rebuild.** The
resolver, the validator and the board format are done and tested (see P1). Ten
concepts are staged against `content/PROMPTS/translate-section.md` and will be
appended once the running pack regeneration finishes reading the corpus.

### Ten concepts, not seven

`please focus on …` became four complete rows rather than one with a `{}` slot, for
two independent reasons. Mechanically, `resolvePhrase` returns `listener.text`
verbatim and has no slot machinery — `fillLanguageSlots` is called from
`core/sheet.js`, so a `{}` row would print braces on the listener's screen.
Linguistically, Mandarin will not take a template here: 按摩背部 is idiomatic and
按摩背 is not, while 按摩脚 is right, so the noun form varies with the body part.

Two wordings are worth recording because they were deliberate:

- **"Stronger" is 请用力一点, not the canonical 请重一点.** The canonical form would
  make the board's safety pair 请重一点 / 请轻一点 — one character apart, on the two
  buttons where being misread matters most. 用力 is equally idiomatic and shares
  nothing with 轻.
- **"Stop" carries a second clause**, 请停下来，不要继续了, so it cannot be heard as
  the pause row beside it.

Sources are zh.wikipedia, the Taiwan MOE dictionaries, and the Hong Kong Employees
Retraining Board's statutory practitioner guide SL_GUIDE_2 (11/2021), which requires
a therapist to 查詢按摩力度是否合適 — which is where 力度 comes from and why it is
the axis the two pressure rows use.

### Two corrections applied to the staged material

- **Provenance was 170–347 characters a row**, against a pack median of 29 and a
  previous maximum of 194. The argument for a wording belongs in the concept's
  `notes`, which already carried it; `provenance` says where a cell came from, in
  short tags. Trimmed to 27–51.
- **The board index now declares pairs, not targets.** `resolvePhrase` needs a row
  on *both* sides, so a board written in Mandarin and English serves an English
  reader and would hand a French one ten dead buttons. `data/boards/index.json` and
  the board itself both carry `pairs`, the gallery offers the link only for a pair
  it covers, and opening a board by URL for a pair it does not cover is a plain
  refusal naming the pairs it does.

### Deferred: `body-parts.shoulder`, `.neck`, `.calf`

Genuinely missing from the fifteen words already there, and staged — but **not
shipped in this change**, because the board does not need them. The `focus-on-*`
rows are complete sentences, not a template plus a noun. Shipping three *universal*
words translated into two languages would add 153 missing-gloss warnings against a
baseline of 197, for no board benefit. They belong in the next gloss sweep, through
the research loop, alongside their fifty-one siblings. Recorded in
`content/PROPOSED-CONCEPTS.md` so the work is not lost.

One narrowing worth keeping: 小腿 is the *lower leg*, not the calf muscle. Mandarin
has no everyday word for the muscle alone — 腓腸肌 is anatomical — so the `literal`
column says so rather than inventing one.

### Two defects the screenshots caught that the tests did not

Worth recording because both were invisible to nine passing browser tests, which
asserted behaviour and never looked at the result.

- **Every grid label sat left-aligned.** `style.css` makes every `button` an
  `inline-flex`, so the label becomes an anonymous flex item packed to the start and
  `text-align: center` does nothing to it. A two-line label looked centred by
  accident, because it filled the width. The cells centre with flex now.
- **The message was set at 43px on an 844px screen.** The CSS clamp is in `vw`,
  which is the right unit for not overflowing sideways and completely blind to the
  other axis, and `fitMessage` only ever shrank. It grows now, bounded at 150px: the
  same "please stop" is 108px and fills the phone, which is the whole promise of the
  view. A short phrase reaches the cap.

### Still owed

The ten concepts are scoped `zh-Hans` and carry rows in `en` and `zh-Hans` only, so
the corpus will warn that fifty-one languages have no gloss for them. That is the
honest signal and the standing convention, not a defect — but it does mean the spa
board serves exactly one pair until a gloss sweep runs. That sweep is the next
research-loop task.

`data/boards/spa.json` exists and validates, built from the three concepts the
corpus already had — `emergency-medical.it-hurts-here`,
`hotel-requests.another-towel-please`, `social-basics.thank-you` — which is the
indexing rule applied rather than described. `data/boards/index.json` says which
targets a board covers, so the gallery can offer a board where one exists and stay
quiet where none does.

## C2 — Show-only interaction

**Status: complete for the slice that exists.** Eight browser tests, all passing.

| file | what it is |
|---|---|
| `conversation.html` | the page; `viewport-fit=cover`, and deliberately no `user-scalable=no` |
| `ui/conversation.js` | loads the board and two packs, owns the state, dispatches actions |
| `ui/conversation-view.js` | draws the grid, the message and the reply surface |
| `conversation.css` | namespaced `board-`; its own file because almost nothing here is shared with the dense control panels in `style.css` |
| `data/boards/{index,spa}.json` | the board and what it covers |

What the browser tests pin down, beyond the reducer's own coverage:

- **B03, the opening tap.** Ten open/dismiss cycles in a row, because the failure is
  a race and one pass proves nothing.
- **A message opened from a submenu returns to that submenu**, and the parent
  control is offered on a grid and never on a message.
- **The grid does not move.** Button order is captured, five messages are opened and
  dismissed, and the order is compared.
- **Keyboard and focus.** Enter opens, Escape closes, and focus returns to the cell
  that opened the message. This caught a real defect: the first implementation
  remembered the *element*, which `renderGrid` had already replaced, so focusing it
  silently did nothing.
- **No engine.** Requests are counted while a phrase is shown; nothing matching
  fontkit, pdf-lib, `core/solve/` or `render/` is fetched. The assertion checks the
  request list is non-empty first, so it cannot pass vacuously.
- **A pair the corpus cannot serve.** Against Quenya, the cells are drawn disabled
  in their original order rather than removed — a grid that closes a gap is a grid
  whose buttons have moved — and the status line says how many.

### Deliberately not done

- **Speak.** C6, and off by default; nothing here waits on audio.
- **A separate `tokens.css`.** `conversation.html` links `style.css` for the design
  tokens, which costs 96 KB of rules it does not use. Splitting the tokens out is the
  obvious fix and was **not** done: the page's performance target is tap-to-message,
  which a cached stylesheet does not affect, and inventing a third stylesheet on
  suspicion is the kind of speculative layer this codebase avoids. Recorded so it can
  be measured rather than assumed.
- **Long-press suppression.** The surface distinguishes a tap from a scroll by
  pointer travel and by whether it scrolled underneath, which covers the real cases.
  A stationary long press still dismisses, and adding a timer to stop it would also
  swallow a slow deliberate tap — which is the commoner gesture from someone who is
  face down on a massage table.

---

## C3 — Optional replies

**Status: complete.** Six answer concepts, the reply set wired to
`massage-spa.please-avoid-this-area`, and five browser tests on top of the reducer
coverage P1 already had.

That message is the right one to make two-way: a therapist may genuinely need to
answer it rather than comply. The answers are complete meanings rather than a
yes/no, which §4.4 requires where polarity is ambiguous — "I will avoid that area"
and "I cannot avoid that area for this treatment" are different answers and both are
plausible. One admits uncertainty (我不确定，需要问一下主管) and one rejects the set
outright (这里面没有我想说的), both of which the specification requires in every
reply set.

Two wordings were reasoned rather than translated. "Does it hurt there?" became
"Does **that area** hurt?" — the section's own note on the question warns that a
deictic "there" is not always clear, and that applies just as much to the answer. And
项目 rather than 疗程 for the refusal: the occupational standard's term for one
bookable service is 按摩服务项目, while 疗程 is a course of several sessions and would
overstate what is being declined.

### The bug the screenshot caught

The Close button said **"Close"**, in English, on the one surface the listener has to
read. `loadCatalogue` falls back to English for a key the listener's catalogue does
not carry, which is the right behaviour and exactly wrong here — and the test passed,
because it asserted `lang="zh-Hans"` on an element whose *text* was English. An
attribute is not a translation.

`board.reply` and `board.close` are in `data/i18n/zh-Hans.json` now, and the tests
assert the controls actually render Han script rather than merely claiming to. 关闭
is not an invention: it is this catalogue's own translation of "Close" at
`studio.close` and `gallery.previewClose`. 回复 is the standard term and is flagged
for review below.

### Awaiting a fluent reader

Every row is `confidence: 2`, which in this corpus means *sourced* and explicitly not
*read by a fluent speaker*. Three are worth a native eye first, and one is mine:

- `reply-cannot-avoid-this-treatment` — is 这个项目无法避开这个部位 how a therapist
  would actually decline?
- `reply-ask-supervisor` — 主管 against 店长 in a chain.
- `reply-none-of-these` — does 这里面 read naturally of buttons on a screen?
- `board.reply` = 回复, which I added rather than a researcher.

---

## N0 — Deterministic mobile bundle

**Status: complete.** `scripts/build_mobile.mjs` (also `npm run mobile`), twelve
tests across `tests/mobile-build.test.mjs` and `tests/mobile-bundle.spec.js`.

`dist/mobile` is **59.2 MB, 1,437 files**, built from an allowlist rather than a
denylist — the repository holds test fixtures, Python environments, research notes
and, until this round, an 8.6 MB dump of glyph advance widths committed by accident.
A denylist would have shipped all of it and gone stale at the next new directory.

| class | files | MB |
|---|---|---|
| fonts | 157 | 42.5 |
| data | 1,112 | 12.1 |
| packs | 105 | 2.3 |
| vendor | 5 | 1.4 |
| code | 58 | 1.0 |

**The fonts are irreducible and the packs are not.** 31 MB of that 42.5 is `.ttf`,
and the temptation is to drop it with PDF export — but the solver measures advance
widths from the `.ttf` through fontkit, so it is load-bearing for *layout*. A bundle
without it does not typeset. The packs are the opposite: 114 MB in the repository,
because thumbnails and faces both grow as the square of the language count, and
`PACK_SOURCES` ships one reader language's worth (2.3 MB).

That trim needed **no gallery change**, which is the part worth recording. The
gallery already draws a placeholder card whenever `packs/index.json` does not list a
pair, so writing a *trimmed index* is what stops the request. Nothing 404s, and a
test asserts the index and the shipped directories agree in both directions.

**No service worker in the bundle.** A WebView serves from the app's own container,
so a worker would be a second cache in front of files that are already local — and a
stale-shell bug on an app that updates through a store. `sw.js` is left out and
`data/native.json` says `serviceWorker: false`. The same file ships on the web saying
`true`, so `registerOffline` reads a cached value rather than 404ing on every page
load, and the two builds run byte-identical JavaScript. Both directions are tested:
the bundle registers none, the website still does.

The browser tests open each of the four pages **with the network cut** — everything
outside `dist/mobile` is aborted, not merely counted, because a page that works by
quietly falling back to the website is the exact failure being looked for. All four
open clean: no 404, no off-site request, no page error.

### Also done, and not strictly N0

`dist/`, `ios/` and `android/` are gitignored. There is no deployment pipeline to
exclude them from — the site is plain GitHub Pages off `main`, so publication *is*
`git push`, and an ignore entry is the only thing between a native build directory
and the public web.

### Not done

- **No Capacitor project yet** (N1). No dependency added, no `capacitor.config.ts`,
  no application identifier — §1.2 and N1 both require owner approval on identity
  before anything is distributed, and nothing before N1 needs one.
- **No device build of any kind.** A Linux machine cannot produce an iOS result, and
  nothing here has been run on a phone.
