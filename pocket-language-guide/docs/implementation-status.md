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

## C7 — Web release gate

**Status: passed, for a text release.** The feature can ship on the web independently
of any store.

| | |
|---|---|
| `npm run check` | 8/8 — types, shell, i18n, native script, IPA across all 53 packs, respell charset |
| `validate_data.py` | 880 concepts, 60 sections, 53 languages, **0 errors**, 213 warnings |
| `node --test` | **633 pass, 0 fail** |
| `npx playwright test` | **155 pass, 0 fail** |

The 213 warnings are the standing ones plus sixteen new: one per `massage-spa`
concept, saying fifty-one languages have no gloss for it. That is the honest signal,
not a defect, and it is the reason the board serves one pair.

### No printed sheet moved

Checked rather than assumed, because a new section could quietly grow every card.
`massage-spa` is `default_on=0`, and its importances run 0.21–0.38 — so **no concept
in it reaches any priority step** (`wide` 0.74, `core` 0.82, `essential` 0.95), and
the step counts are unchanged at 362 / 148 / 10. Independently, `gallery.spec.js`
compares a stored pack against a fresh solve and passes, which would not survive a
changed sheet.

### The three shapes a phone comes in

§9.2 asks for these to be looked at, and each has now produced a defect the
behavioural tests could not see, so all three are automated: narrow portrait, short
landscape, and **1.6× system text**. The last is where the header ran off the right
edge reading "Englis / Simpli / Chines" — a flex item does not shrink below its
content unless told it may. The test measures whether anything is off-screen or
clipped inside its own box, which is a thing a machine can check; whether a layout
*looks* good still is not.

### Performance

Tap to visible message, warm, measured to the next animation frame over twelve taps
on this machine: **median 11ms, p95 52ms**, against §9.3's target of p95 under 100ms.
Now a test, less as a benchmark than as a tripwire for the day something starts
solving, fetching or re-reading the corpus on the tap path.

This is a desktop Chromium on a 32-core machine. It is **not** a phone measurement
and no phone measurement exists.

### What a release would have to say

- **One pair.** The spa board serves `zh-Hans__en`. Any other reader gets a plain
  refusal naming the pairs it does serve.
- **Offline needs no preparation** for a board: its corpus is in the shell, tested by
  a cold offline visit with nothing saved. A printed *sheet* still needs its pair
  saved, because that is where the fonts come from.
- **Personal buttons do not travel.** They persist on the device and there is no
  export or import, so a new phone starts empty. §5.4's portable package is the one
  C4 item not built.
- **Speech is untested audio.** Sixteen unit tests and one browser test cover the
  logic and the refusals; nothing has been heard. Every line of §9.2's physical
  matrix is outstanding.
- **The Mandarin is sourced, not reviewed.** `confidence: 2` throughout, two
  independent reviewers, and four strings still waiting on a fluent reader — one of
  which is on a button that says *stop*.

---

## C6 — Speech

**Status: the adapter and the wiring are done; nothing has been heard.**
`ui/platform/speech.js`, sixteen unit tests against a deterministic fake, one browser
test, and a Speak control on the message.

**The part that matters is what it refuses to say.** §6.2 forbids silently
substituting a language, and the substitutions on offer here are real ones:

- **Simplified Chinese never takes a Cantonese voice.** `zh-Hans` is a script tag,
  not a voice; it maps to `zh-CN`, accepts `zh-SG`/`cmn`, falls back to `zh-TW` last,
  and excludes `zh-HK` and `yue-*` outright. A bare `zh` voice is ambiguous and
  skipped.
- **Klingon and Quenya map to no voice at all**, which is the only correct answer for
  a constructed language written in pIqaD and Tengwar. Sending their text to an
  English voice would be a defect wearing the costume of a fallback. Tested: nothing
  reaches the engine even with an English voice installed.
- **Matching is on subtag boundaries**, because a prefix test hands Hausa (`ha`) to a
  Hawaiian (`haw-US`) voice.
- Retired ISO codes are accepted as aliases — `iw` for Hebrew, `in` for Indonesian,
  `jw` for Javanese — because Java kept the 1989 replacements and Android's speech
  locales inherit them.

Remote voices are listed but never chosen automatically; `unknown` may be, since
refusing everywhere `localService` is unimplemented would disable speech on whole
platforms, but it is never *reported* as local. Every new utterance cancels the last,
so "stronger" can never arrive after "stop".

**Speak is the owner's control; Reply is the listener's.** They sit side by side and
are labelled from different catalogues, because different people press them. Both are
siblings of the message surface rather than children, which is what structurally
stops a control's click reaching the dismiss handler.

Audio is off until pressed. Nothing speaks on load, on restore, or on changing a
setting, and a device with no voice for the language simply has no button — text
never waits on audio.

### Not verified, and not claimable

No audio was heard on any device. Chromium here enumerates **zero** voices, which the
browser test pins as a legitimate state rather than a failure. Everything in §9.2's
physical matrix is outstanding: a real iPhone and a real Android, speaker against
headphones against Bluetooth, silent mode, call interruption, resumed foreground,
airplane-mode cold start, and whether any of the Mandarin is intelligible. The
locale table is reasoned from ISO 639 and platform tagging conventions; **no device's
actual voice inventory was consulted.**

Deliberately absent: speak-on-selection (§1.2 puts it behind testing), voice-choice
persistence (the adapter guarantees a stable id; storing it belongs with the other
settings), and any embedded engine — §6.5 is explicit that a model runtime is not a
prerequisite and it would not solve a measured problem here.

---

## C4 — The owner's own buttons

**Status: complete** for everything but the portable package. `ui/board-store.js`,
`ui/board-editor.js`, eleven unit tests and seven browser tests.

### Two records, because removing a button is not deleting a sentence

A **phrase** is something the owner wrote, which has no concept behind it and so
carries its own text. A **placement** is the fact that a button sits on some node of
some board, in some position. One phrase can have several placements. That shape is
the whole reason `removePlacement` and `deletePhrase` are different operations: a
reader tidying a board has not asked to destroy words they typed, and may have them
on another board. Deleting warns when a phrase is placed more than once.

### The boundary that matters most

`ui/io.js` keeps `plg.edits.<pair>` for the *sheet*, and its flags decide what gets
printed. Nothing in the board store writes there. Making a button to say "no
peanuts" to a waiter must not add a row to every card the reader prints for that
pair — §5.2's requirement — and a test asserts the sheet's own edits are
**byte-identical** after a board round-trip. The one deliberate bridge is
`fromSheetExtra`, which *copies* a studio entry onto a board so editing the copy
cannot rewrite what the card prints.

### The app does not translate, and the form says so

There is no backend and inventing one is out of scope. Three fields — a short label,
the complete sentence in the owner's language, the complete sentence in the
listener's — and a line admitting why the third is empty. A half-written phrase is
still saved, because the reader may be coming back to it, and is drawn on the board
**disabled**: `resolvePhrase` refuses one, so it can never reach a listener, and
hiding it would move every button after it. The preview shows the exact text that
will be displayed, not an approximation of it.

The editor opens from the grid and nowhere else. The listener must not find it by
tapping, and the owner must not open it while holding the phone out to a stranger.

### Three bugs found while building it

- **A full disk poisoned every later save.** `queue = queue.then(...)` on a rejected
  promise stays rejected, so one quota error would have stopped the reader saving
  anything again — even after freeing space or shortening the sentence. The chain
  now recovers while the caller still gets the rejection. Found by a test that was
  written for something else.
- **The board asked the disk what the reader had just typed.** `withOwn` re-read
  storage on every repaint while the write was still queued, so a new button only
  appeared after a reload. The page hydrates once and is authoritative; the editor
  hands back a new value. Which is §5.3's rule that a late read must not overwrite a
  fresh edit.
- **A test harness that defeated its own persistence tests.** `addInitScript` runs on
  every navigation, so clearing storage there wiped what a test had just written the
  moment it reloaded. Both persistence tests passed alone and failed together until
  that was found.

### Not done

The portable JSON package of §5.4 — export, import, conflict preview, size caps,
rejection of unsafe keys and broken references. The store is shaped for it (versioned
schema, phrases separable from placements) but none of it is written, and a board
cannot yet be moved between installations.

---

## The board, looked at rather than tested

Four changes the owner asked for after using it, and one bug that found itself.

**Labels fit their cells.** A bounded fitter shrinks any label that overflows, down
to a floor below which nothing is readable at arm's length — past that the honest
answer is a shorter `labelKey`, which is what "That's good — keep it there" has.

**Colour coding, from the five roles the printed sheets already use.** Red for
stop, pause and *it hurts*; blue for the pressure axis; orange for *avoid*; green
for *focus on*; purple for comfort. Solid on the grid, and the full-screen message
takes **the colour of the button that opened it**, white type on solid. That is what
makes it coding rather than decoration: the owner can see they pressed the right one
without reading their own language back off the screen. Those five hexes were chosen
for a printed card, dark enough to carry white type, which is what makes them usable
filling a phone.

**A submenu says its prompt once.** Four cells reading "Please focus on my shoulders
/ my back / my neck / my feet" spend most of a small screen on the words that do not
vary. The node carries a heading with an ellipsis and the buttons are the body part
alone. This is **owner-language presentation and nothing else** — the listener is
still shown one complete idiomatic sentence, because the board format forbids
assembling a message from parts and Mandarin would not take the template anyway
(按摩背部 is idiomatic, 按摩背 is not). The split lives in the catalogue, where each
language decides whether its own prompt divides that way.

**The way back does not look like something you are saying.** It sits among coloured
buttons that are all things to hold up to a stranger, so it is grey, arrowed, 3rem
tall, and a test asserts its background is none of the five role colours.

### The bug, and why fourteen tests missed it

`style.css` styles every `button`, and `button:hover { background: var(--surface) }`
is specificity (0,1,1) against a bare `.board-cell` at (0,1,0). So a coloured button
under the pointer took a pale grey background **while keeping its white type**, and
disappeared. It hit the grid first and the full-screen message second.

Not a desktop curiosity. A touch device leaves the last-tapped element hovered, so
the button that lands under a finger after a submenu opens is exactly the one that
vanishes — which is how it was reproduced.

Both times it was found by looking at a screenshot, with fourteen behavioural tests
passing. They asserted what the DOM *said* and never what it *looked like*. So there
is now a test that measures the relative luminance behind any white text — every
cell, at rest and hovered, and the message surface — and fails if the thing behind it
is not actually dark. Confirmed by reinstating the bug: it fails with
`cell 0 hovered: white type on rgb(244, 246, 248)`.

---

## Language audit — two independent passes

Two reviewers read all sixteen `massage-spa` concepts and the two listener-facing UI
strings, **independently and without access to each other's output**, which is the
method the redundancy ratings already use here. Where they agree is a result; where
they disagree is a question, and is recorded as one rather than resolved by picking
the more confident reviewer.

| | pass 1 | pass 2 |
|---|---|---|
| `ok` | 16 | 17 |
| `weak` | 2 | 1 |
| `wrong` | 0 | 0 |

### Agreed, and changed

**`reply-cannot-avoid-this-treatment`: 无法避开 → 避不开.** Both reached the same
diagnosis independently and proposed the same replacement — 无法 is written and
official register, and spoken Mandarin negates ability with the V-不-C potential
complement. The row now reads 这个项目避不开这个部位.

**The `erb-sl-guide-2` citation overreached, on eight rows.** Both said so. It is a
Hong Kong Employees Retraining Board code of conduct being used to source mainland
usage, and the single clause either reviewer could verify is about 力度 — so the tag
stays on the three pressure rows and comes off the rest, where the citations already
present carry the claim. Both also said the mainland source was underused:
`mohrss-anmo-2023`, the 2023 occupational standard, is now on seven rows instead of
two.

The two reviewers **contradict each other on whether the ERB guide exists at all** —
pass 1 could not find it or the attributed sentence; pass 2 quotes clause 12 verbatim
and explains the negative result, that the PDF interleaves spaces between characters
so a plain search misses it. Pass 2's account is the more specific and explains the
other, but this is exactly why the tag was narrowed rather than defended.

### Verified defects, also changed

Neither of these is a matter of taste and both were checked directly:

- **The English and the Mandarin disagreed about who was refusing.** The Mandarin
  subject is 这个项目 and the row's own `literal` says "this service cannot avoid";
  the English said "**I** cannot avoid that area", relocating the constraint from the
  booking to the person and making it the personal refusal §4.4 says it must not be.
  Now "This treatment cannot avoid that area".
- **A concept note stated a fact that is not true.** It said
  `reply-i-will-avoid-that-area` "reuses the 避开 / 部位 of the question it answers".
  The question is 请不要按这个部位 and contains no 避开 — only 部位 is reused.
- `zh.wikipedia=頸` — a traditional character — in the provenance of a row in a
  simplified pack.

### A recorded rationale that was wrong

The note on `stronger-pressure` said 请用力一点 was chosen over the canonical
请重一点 to avoid a one-character minimal pair with 请轻一点 on the two buttons where
misreading matters most. **That cannot be the reason.** `renderGrid` labels cells in
the *owner's* language and `renderMessage` shows one Mandarin sentence at a time, so
the two Mandarin strings never appear together — confirmed against the code and
against a screenshot of the grid, which reads "Stronger pressure, please" and "More
gently, please" in English.

Both reviewers endorsed the wording anyway, on better grounds: 用力 is the idiom the
trade uses, and it is not Taiwan-marked (Taiwan's word is 力道). The note says that
now. The wording was right and the reason was not, which is the more dangerous of the
two to leave lying around, because a reason gets reused.

### Disagreed, and left alone

**`focus-on-feet`: 脚 or 脚部.** Pass 1 called it `weak` — all three siblings are
disyllabic (肩膀 / 背部 / 脖子) and the trade's own form is 足部 — and pass 2 called
it `ok`. One reviewer of two, on naturalness rather than correctness, is not enough
to move a string that neither called wrong. It goes to the fluent reader with the
rest.

### Still awaiting a fluent reader

Nothing here moves any row past `confidence: 2`, which in this corpus means *sourced*
and explicitly not *read by a fluent speaker*. Neither reviewer is one and both said
so. Open questions, in the order worth asking them:

1. `focus-on-feet` — 脚 or 脚部, where the reviewers split.
2. `reply-cannot-avoid-this-treatment` — is 这个项目避不开这个部位 how a therapist
   actually declines?
3. `reply-none-of-these` — does 这里面 read naturally of buttons on a screen? Both
   said yes; neither can hear it.
4. `board.reply` = 回复, which I added rather than a researcher.

Recorded and not chased: the machine-derived IPA splits 不要 as two words, gives
下来 and 里面 full tones where the neutral is optional, applies no tone sandhi, and
writes 确 as `tɕʰɥœ`. These come from `build_ipa.py`'s pinyin route rather than from
the rows, so they are a generator question and would move every Mandarin row at once.

---

## The gate had a dead link, and it had never run

`npm run check` was one `&&` chain, and `respell_check --charset --check` was last in
it. `build_ipa.py --check` sits in the middle and **cannot pass on this machine**:
Ukrainian and Marathi are built against the newer espeak that `espeakng-loader`
ships, so a plain check asks the system library for `uk` and gets `RuntimeError:
language "uk" is not supported`. In a `&&` chain that ends the run. The last check
had therefore never executed here, and `data/respell/charset.json` went stale,
was committed, and was pushed.

What was actually stale was two Korean syllables, 붜 and 응, added by the board's
English wording. **Bookkeeping rather than a shipped defect** — the font subsets
already carry both, which 243 tests in `tests/fonts.test.mjs` and
`tests/respell.test.mjs` confirm. But the file feeds `subset_fonts.py`, so the next
person to rebuild fonts from it would have produced a subset one glyph short, and
that is the failure mode this corpus has paid for before.

`scripts/check_all.mjs` replaces the chain. It runs all eight checks, reports every
failure rather than the first, and handles the espeak split the way
`content/PROMPTS/add-a-language.md` prescribes: everything but `uk` and `mr` against
the system library, then those two against the loader's. A machine without the
loader gets an explicit `skipped` line rather than a silent gap where two languages
used to be. It proved itself on its first run by reporting two failures at once
where the chain would have shown one.

**One new coupling to know about.** A conversation board's corpus is in the shell
(see C5), so editing `data/concepts/` or either board language now invalidates the
shell manifest. That is correct — those files are precached, so a change has to bump
the worker — but it caught me three times in one session. The order that works is:
land every data and code change, *then* build the shell, *then* run the gate.

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

---

# Second round — requested after using it on a phone

## Batch A — a readable grid

**Colour says what a button does, not what it is about.** The cells were the five
section colours of a printed sheet: a handsome grid, and a hard one to read, because
the label — the thing a reader is actually looking for — was fighting a saturated
fill. Neutral cells and dark type give the words the contrast. The one distinction
left worth drawing is the one that changes what happens next: a message that can be
**answered** is tinted *and* carries a small `↩`, because colour alone excludes
roughly one man in twelve and washes out in sunlight. Submenus stay dashed and a
shade back. The full-screen message is untouched and keeps its role colour, where it
is the only thing on screen and has no label to compete with.

**Each label is as large as its own cell allows, in both directions.** A short label
has no reason to wear the size a long one was forced down to: at phone width "Please
stop" is 40px and "That's good — keep it there" is 26px, and both fill their box. A
binary search over 12–40px settles in eight probes. It refits when the font arrives,
and a `ResizeObserver` on the grid catches rotation, resize and a change of system
text size in one — that last because enlarging system text moves `rem`, which moves
the grid's track sizes. Browser text layout throughout; the print solver measures
advance widths for paper and has no business here.

### Four ways a fit measurement can lie

Each of these pinned the entire grid at one size, and none of them is a logic error:

1. **Everything at the ceiling.** The label was compared to its own `scrollHeight` —
   but it is a block with `height: auto`, so it grows to hold whatever it is given
   and can never overflow itself. The fixed thing is the cell.
2. **Everything at the floor.** `getComputedStyle` did not resolve the logical
   `paddingBlockStart` family here, and an empty string parses to `NaN`, which makes
   every comparison false.
3. **Still at the floor.** `scrollWidth` is an integer and the room it is compared
   against is not: a label filling a 153.6px box reports 154 and failed by 0.4px at
   every size.
4. **"Comfort" drawn as "Comfor / t"** — visible only in a screenshot.
   `overflow-wrap: anywhere` means *any* size fits, because a word can always break
   between two letters. Sizes are chosen against normal wrapping now, with `anywhere`
   restored afterwards as the last resort, since nothing here may clip.

### A test rewritten rather than deleted

`white type is never left on a light background` guarded a grid that no longer has
white type — it would have passed by finding none. It measures the **contrast
ratio** now, at rest and hovered, on every cell and on the message. That still
catches the bug it was written for (`button:hover` in `style.css` outranks a bare
`.board-cell`, which is how a cell went white-on-white twice) and applies to the new
design as well.

**Gate:** 8/8 checks, 880 concepts / 0 errors, 161 browser tests, 633 unit tests.

## Batch B — answers that are a quantity

"How long is the wait?" is answered with a number and a unit, and that is the one
kind of answer this project does not have to translate. `core/duration.js` stores
`{ amount: 15, unit: 'minute' }` and formats it per side at the moment of display.

**This works in all fifty-one natural languages at once, with no new rows.** CLDR —
data every browser already ships — carries Russian's минута / минуты / минут, Polish's
22 *minuty*, Arabic's دقائق, Mandarin's 15分钟, and Bengali and Burmese in *their own
numerals* (১৫, ၁၅). None of it is written down in this repository and none of it can
go stale. The keypad's three unit buttons come from the same place, via
`Intl.formatToParts`: three more catalogue keys in fifty-one languages would each
have been an invitation to invent a word that already exists.

**It refuses rather than guesses.** `Intl` falls back to the runtime's default locale
for a tag it has never heard of, which would put "15 minutes" on a Klingon screen —
the silent substitution this project refuses everywhere else. `supportedLocalesOf` is
asked first, and the two constructed languages come back as `null`, which is the same
answer the corpus gives for them.

The flow: the wait question carries a reply set of *no wait*, six common durations,
*another amount…*, *I don't know* and *none of these*. The keypad has an amount, a
unit, a live preview of the exact text the listener will read, and Confirm/Cancel.
The question stays on screen throughout. Cancel returns to the answers, not to the
question and not to the grid. Confirm shows the owner the same value formatted in
their own language — the **value** travels, never the text of one, so the two sides
cannot disagree.

`parseAmount` refuses `0`, `-5`, `1.5`, `abc` and `900`. An answer nobody meant is
worse here than no answer, because it is shown to a stranger as fact.

Three concepts are **indexed rather than written**: the question itself
(`trail-transport.how-long-is-the-wait`, already universal), `social-basics.i-do-not-know`,
and `massage-spa.reply-none-of-these`. One was added.

### A board answer reached every printed card

The added concept went into `quick-responses`, which is semantically right and is
`default_on=1` and universal — so it printed on **every card**, moved four lines of
the reference sheet, and staled all 2,756 packs. Three tests caught it: the golden
baseline, a drill test whose question pool had changed, and the offline board test.

I had said earlier that board content cannot move a printed sheet. That was true of
`massage-spa` because it is `default_on=0` and scoped; it is not a property of board
content, and I overstated it.

The fix uses the mechanism that already exists rather than adding one: a
**`board-answers` section with `default_on=0`** — "in the bank, not on the card",
which is exactly what a listener's reply is. The golden passes again, no re-render
was needed, and *board display stays independent of print layout* now holds
structurally rather than by luck.

### Also found

`validateBoard` walked `board.nodes` only, so **reply-set buttons had never been
validated** — an unknown kind, a broken `phraseRef` or a duplicate id passed and
failed at the reader instead. Pre-existing; they are in the walk now, while staying
out of the reachability check, which is a question about the grid.

### Open, and not acted on

`我不知道` is correct as an answer, but mainland service staff would more often say
`我不清楚` or `不好说`. That is register, not error, and `social-basics.i-do-not-know`
is general-purpose across the corpus — retuning it for one reply grid would change
every other use. A softer staff form would have to be a new concept. Flagged for the
owner rather than decided.
