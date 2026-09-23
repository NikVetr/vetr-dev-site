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

## Batch C — whose voice the card is in

The complaint this batch exists for is one sentence long: *a woman shows a Russian
card that says* `Я заблудился` *and it is in a man's voice.* A general translation
tool cannot do better — it is handed one sentence and no speaker, so it picks the
citation form, which is the masculine in every language here. **This app's phrases
are a fixed set, so it can ask once, in advance, and never ask again.** That is the
whole advantage a small inflexible board has over a flexible translator.

### Only meaningful choices, which meant surveying first

Before writing a settings screen it was worth knowing what there is to ask, so a
survey went through all 53 ready languages asking one narrow question: *does a
**first-person** phrase **in this corpus** change according to a property of the
speaker?* Not "does the language have gender" — most grammar summaries illustrate the
third person, and several first drafts were wrong until the paradigm itself was read.

The answer is in `data/registry/speaker-axes.csv` (44 rows) with the full reasoning,
sources and confidence per language in `data/registry/NOTES.md`:

- **One axis, `speaker_gender`, for 22 of 53 languages.** 31 declare nothing and
  their readers are asked nothing — the settings control is not rendered at all.
- **No politeness axis anywhere.** Every politeness system in this set — Japanese,
  Korean, Javanese, Thai, Khmer, Vietnamese, Filipino, Bengali, Persian, and the
  European T–V distinctions — is oriented to the *addressee*, and a card shown to a
  stranger has exactly one correct setting. Politeness is a **content invariant** for
  the packs, not a question for the traveller. Javanese is the one language where a
  register axis would arguably be worth asking; the pack is uniformly *krama* and
  declaring `{krama, ngoko}` would offer a second value that is always wrong here.
- **Nothing about the listener.** Where second-person forms are gendered it is
  recorded as a hazard for reply *content*, never as a question.

### The mechanism

`core/speaker.js` (`readAxes`, `axesFor`, `variantKey`, `variantOf`, `applyVariants`,
`unanswered`) and a sparse per-language file `data/lang/<code>/variants.csv` — the
language's own columns plus a leading `variant`, where a blank cell inherits and only
the cells that genuinely differ are written. Three properties are structural rather
than remembered:

**A variant replaces the row, not the string.** `Я заблудилась` is romanised
*ya zabludilas*, and a card that varied the script while leaving the respelling
masculine would be teaching her to say the wrong thing out loud. That was the first
thing to get wrong and is now what `variantOf` is shaped around.

**An incoming reply is never inflected for the owner.** `variantOf` refuses a phrase
marked `incoming`, so a caller cannot break the rule by forgetting it. The board
resolves reply-set buttons through that path — `tests/conversation.test.mjs` checks
the awkward case, where the *same concept* (`I don't know`) is something the traveller
might say and also something the person behind the counter might tap. Bending the
second to the traveller's gender would put words in a stranger's mouth and leak the
traveller's profile to someone who never asked.

**No silent masculine default.** Unset is a real stored state that resolves to the
row on disk — but where a pair *does* inflect and the reader has not said, the app
says so, in a line under the grid and beside the control on the cheat sheet. Declining
is stored as an answer, so "rather not say" stops the asking without pretending to be
a choice of form.

### One setting, four surfaces

`ui/speaker-settings.js` holds the storage and the form; the conversation board, the
quick page and the studio panel all open the same dialog, and the profile rides in
`SheetSpec.speaker` so an exported sheet carries the voice it was built in. The
cheat sheet applies it once in `buildSheet`, **before anything is measured** — the
solver decides what fits by measuring these exact strings — and the practice drill
inherits it for free, because it drills the blocks the sheet solved. Storage is
`localStorage`, not a cookie: a fact about the reader's own body has no business
being sent to a server on every request, and it is the same key the native shell's
`Preferences` will map onto.

### Honest coverage

`scripts/speaker_coverage.mjs` reports rather than fails, because a declared axis with
no wordings yet is a known state the reader is told about, and turning it red would
mean either declaring fewer axes than the grammar warrants or shipping wordings nobody
has checked. `scripts/validate_data.py` owns what really is an error: a variant key no
language declares, a variant of a phrase the pack does not have, a variant with no
text, an axis with one value, an axis whose default is not one of its values, and an
axis named for the listener.

### The wordings, through the research loop

Three agents, one per family, each given `content/PROMPTS/speaker-variants.md` and the
survey. **Most of this turned out to be re-filing rather than translating.** The packs
had been handling speaker gender ad hoc for a long time — a slash inside the sentence,
or the feminine parked in `text_alt` — so where the pack already carried the form it
was taken verbatim, on the grounds that reviewed content beats a fresh derivation.
All 19 Romanian rows, all 32 Czech, 33 of 34 Croatian and 12 of 14 Russian came out of
the pack. French is the exception and is derived throughout, from rules a first-year
textbook states.

Both passes excluded the same four categories, independently, which is some evidence
the prompt is saying what it means to say:

- **Third-party gender** — `my friend is hurt`, `my child is missing` — even where the
  pack already had both forms sitting there.
- **Grammatical gender of an object.** `Zginął mi paszport` against `Zginęła mi torba`
  agrees with the lost item, not the speaker. Romanian's `prea scump / scumpă` agrees
  with the thing being sold. Both look exactly like the real cases.
- **Polite address.** Polish `Jak się pan/pani nazywa?` splits on the *listener's*
  title. That is the reply-neutrality hazard, not an axis.
- **`I am pregnant`**, feminine-only in all five Slavic packs, with no masculine
  counterpart for a variant to be a variant *of*.

Greek came out at two rows, which is a finding rather than a shortfall: that pack
systematically prefers `έχω` + noun to `είμαι` + adjective, and `έχω` never agrees.
The Romance pass also found the coverage script's first-person filter is wrong in both
directions — `obrigado / obrigada` inflects for the speaker and its English is "Thank
you" — so the report now prints counts rather than a fraction and says so.

`build_ipa.py` filled the new `ipa` cells without being modified: it globs
`data/lang/<code>/*.csv`, so it found `variants.csv` on its own. Ukrainian needed the
usual `espeakng-loader` split. No base row changed.

**All 22 declaring languages now have a file — 302 wordings.** Hebrew is the largest
at 55, as the survey predicted: its present tense inflects for gender and not for
person, so every present-tense `אני …` changes. Arabic is 14, and only nominal
sentences — its 1sg *verbs* do not inflect, which is the thing a naive pass would get
backwards. The three smallest are findings rather than shortfalls: **German is two
rows**, because the pack had already neutralised three of the five candidate concepts
("Ich habe Diabetes", "Ich esse vegetarisch") and only `Ich bin Tourist` still uses a
role noun — if that one is ever reworded, German's axis has nothing left and should be
dropped, which is the alternative the survey itself named. **Thai is three**, because
only five rows in that pack print a politeness particle or a 1sg pronoun at all and
the rest carry none to vary. **Khmer is one**, the narrow reading, confirmed by the
base row's own `literal`, which states the scope was a deliberate decision:
បាទ/ចាស is the one row in the pack that prints both, "everywhere else they are left
off a card that cannot know its holder's sex."

Two defects in my own work, both caught by the agents rather than by me. The test that
walks the shipped variant files listed five concept groups by hand, so Khmer's single
row — which lives in a sixth — made a correct file fail; it reads the group list from
`data/concepts/` now. And it asserted over every row in the pack rather than over the
rows a variant touched, which accused Thai of an empty `text` belonging to a `note`,
whose prose is on the reader's side by design.

### What is not done

**The base rows still carry the old ad-hoc forms.** 113 first-person rows hold a slash
inside the sentence (`Estoy perdido/a`, `Ztratil jsem se / ztratila jsem se`), and
several packs park a feminine in `text_alt`, which is that cell's other and unrelated
job. Cleaning them is the right fix and changes what every card prints, which stales
2,756 committed pack thumbnails — so it is its own pass with a pre-render settle
rather than a rider on this one. `speaker_coverage.mjs` counts the backlog and
`content/PROMPTS/speaker-variants.md` says how to clear it. Until then a woman who
answers sees the clean sentence and a man still sees the slash, which is an odd
asymmetry and strictly an improvement.

**No `companion_gender` axis.** Five concepts inflect for the gender of someone who is
neither speaker nor listener (`my friend is hurt`, `my child is missing`, …). An axis
would be a second questionnaire, about a third party, during an emergency, to produce
a sentence whose gender the listener can see for themselves. The rule is to write them
with a grammatically fixed word — Russian *ребёнок* is masculine whatever the child's
sex — and that is recorded in the prompt.

**Two pronunciation gaps, both now warned about by `validate_data.py`.** A variant
replaces the row precisely so the pronunciation moves with the wording, and in two
places it cannot yet. **Hebrew's 55 rows inherit the other gender's pointed spelling**
in `text_alt`: unpointed Hebrew is what the card prints and what the variants change,
but `text_alt` is the *pointed* reading of it, and the points cannot be derived from
the unpointed string. The romanisation and the IPA are right — Hebrew's IPA route
reads the romanisation column, which the pass filled — so only the pointed alternate,
which is off by default and used by the drill, is stale. **Khmer's one row inherits
`baːt`**, the masculine particle's pronunciation, because Khmer has no automated IPA
route and its column is hand-analysed. Both want a reader of the language, not a rule.

**The board half is not exercised in a browser.** `spa` is the only board and it
serves `zh-Hans__en`; neither language declares an axis, so the settings control never
appears there and the variant path on the board is covered by unit tests only. It
cannot be fixed by adding a pair to the board: the 16 `massage-spa` concepts exist in
Mandarin and English and nowhere else, so every other pair reports 17 missing phrases.
A gloss sweep for those concepts is the next content batch, and it is what would make
the board available for more than one pair — which is worth doing for its own sake.
The cheat sheet's half *is* exercised end to end, in `tests/speaker.spec.js`: a real
Russian sheet solved twice, `Я заблудился` before and `Я заблудилась` after.

**A round trip through the CSV would pin the voice, and is left alone on purpose.**
`importSheetCsv` writes an override for every row in the file, not only the changed
ones — so exporting a card in her voice and re-importing it freezes those wordings as
edits, which then outrank the profile forever. This is pre-existing (it pins the
masculine today for anyone who round-trips) and the profile only makes it visible, but
it does defeat "share the resolved wording" for anyone who uses the CSV. The obvious
fix — only record an override where a cell differs — needs a baseline the importer
does not have: comparing against the *rendered* rows is wrong, because those already
include the reader's own earlier edits, so an unchanged re-import would delete them.
Getting that wrong loses someone's work, which is worse than the defect, so it wants
its own change rather than a rider on this one.

### Also in this batch

**An update no longer interrupts a sentence.** The service worker's
`controllerchange` handler reloaded the page unconditionally, so a deploy landing
while the owner held the phone out to a stranger took the sentence off the screen.
Reloads now wait for `idle`, which defaults to "no `<dialog>` is open" — true of every
page without any of them having to say so — and the board narrows it to "and no
message is showing". The update lands the moment they close it.

**The screen stays awake while a message is up.** `ui/platform/wake.js`, held for
exactly as long as a sentence is on screen. A stranger reading an unfamiliar script
off a phone at arm's length routinely takes longer than a 15-second display timeout,
and the screen going dark means starting the exchange again. Best-effort and silent
when unavailable, and re-acquired on `visibilitychange`, because the platform drops
the lock whenever the page is hidden and does not give it back.

## Batch E — a board is a situation, not a phrasebook

Five pieces of feedback from using the Mandarin board on a phone, four of which had
one cause.

### The blue tint and the ↩ meant nothing, because replies were switched off

Reply screens were built behind `?replies=1` while they were being written, and the
flag never came off. The effect was worse than a missing feature: `renderGrid` marks
a cell that *can be answered* with a tint and a ↩, and with the flag off those cells
behaved exactly like every other one — the Reply control they promise never appeared.
So the one distinction the grid draws was decoration, and a question shown to a
stranger had no way for them to answer it, which is the board failing at the thing it
is for. Replies are on unless a session passes `replies=0`.

The mark also needed explaining. It carried a `title` attribute, which is invisible to
a finger. A one-line legend now sits under the grid — and only on a grid that has such
a cell, because a key to a symbol that is not on screen is noise.

### The board never filled its language slots

Seven concepts name a language: `communication.do-you-speak-english` is
`你会说{source}吗？` in the pack, and the pair supplies the name. The sheet has always
called `fillLanguageSlots`; the board never did, so any board carrying one of those
phrases would have shown a stranger the literal string `{source}`. They are exactly
the phrases a board wants — "I do not speak Chinese", "please write it down" — so the
fix was to fill them rather than to keep them off every board.

### Seven boards, and a topic grid in front of them

A board is a **situation**. What someone needs face down on a massage table and what
they need in a taxi have almost nothing in common, and one grid holding both is a grid
you have to read rather than glance at. Converse now opens the list of situations —
Meeting people, Directions, Getting around, Eating out, Shopping, Time, Massage and
spa — and each board names itself in a bolded `h1` in the bar, beside the owner-only
controls. The root Back no longer vanishes; it says **All topics** and goes there.

The picker loads one small JSON file and nothing else — no corpus, no language packs —
because it is the screen someone lands on and the one they are most likely to reach
with no signal.

**99 buttons across the seven, and not one new translated phrase.** Every button is an
existing concept referenced by id, which is what the O(N) corpus is for: `toilets.where-toilet`
on the Directions board, `dietary-needs.no-peanuts` under "I cannot eat…", the
`quick-directions` set doing double duty as the *answers* to "which way?" — the person
being asked taps "turn left" in their own language and the traveller reads it in theirs.

Two fixes to the massage board while its structure was open: **Comfort is gone as a
submenu** — "another towel" and "thank you" are buttons on the main grid, because two
buttons never earned a screen of their own — and **"How long is the wait?" moved to the
Time board**, which is not a thing anyone says face down on a massage table.

### What the other person can now say back

Eleven concepts in `board-answers`, which is `default_on=0` and therefore prints on
nothing. They are what staff actually say: 关门了, 我们没有这个, 请稍等, 我带路,
这个没办法, 麻烦再说一遍, 刷卡还是现金？ Each question kind gets the answers that fit
it — a stock question offers "we do not have it" and "how many?", a directions question
offers the seven `quick-directions` plus "I will show the way", a time question offers
"it is closed" and "I will write it down" — and every set ends with an uncertain answer
and a refusal, because someone who will not use the board is not the same as someone
who is unsure.

Three of the eleven were reworded away from second-person address before they were
written: "I will show **the way**" rather than "show you", "One moment, please" rather
than the imperative "wait", "One more time, please?" rather than "say it again". Those
are the reply-neutrality rules from `speaker-variants.md` doing their job in advance —
an imperative or an object pronoun aimed at the traveller is gendered in Arabic,
Hebrew, Polish and the Indo-Aryan languages, and it is far cheaper to avoid it now
than to discover it in eleven packs later.

### The clipping check earned its keep the moment it was widened

`nothing is cut off on …` ran against the massage board only, which is ten short
labels. Pointed at the topic list and at "Getting around" — twelve buttons and whole
phrases for names — it immediately found the board's own title **clipped inside its
box at a 1.6× system text size**. Same cause as the header bug it was written for: a
flex row will not let an item shrink below its content, and Back plus two owner-only
buttons leave a long topic name no room. The bar wraps now, as the header already did.

### A mistake worth recording

Two edits — the language slots and the board title — were silently lost. The script
that made them asserted its *third* anchor after applying the first two and wrote the
file only at the end, so the `AssertionError` discarded work that had already
succeeded. The symptom was a board whose title was empty, and it cost a Playwright
timeout to find. Apply one edit per write, or write before the next assert.

## Batch F — the shell, the emergency, and the arithmetic behind "all pairs"

### N1, and the app-side of N3 and N4

Capacitor 7 is pinned with **three plugins and no more** — App, Preferences, Share —
because those are the only ones an implemented feature uses. `capacitor.config.json`
and the adapters under `ui/platform/` are committed; `ios/` and `android/` stay
gitignored, which is unusual for a Capacitor project and deliberate: publication here
*is* `git push`, so a native project at the repository root would be served to the
public web. `docs/native.md` says how to regenerate them.

**Safe areas, once, everywhere.** `viewport-fit=cover` was on the board alone, so the
gallery, the quick page and the studio drew under the notch. One
`env(safe-area-inset-*)` rule on `body` now covers all four, plus the three
`position: fixed` overlays that escape that box — `.board-stage`, `dialog.lightbox`
and `.donate`. The board's own copy of the rule was removed: two elements padding for
the same notch is how a phone ends up with a two-notch margin.

**Durable personal storage.** A WKWebView's `localStorage` is evictable under storage
pressure, and for a store holding the only copy of someone's own phrases that is not
acceptable. `ui/platform/store.js` mirrors `Preferences` into memory at start-up so
that all fourteen synchronous call sites keep working unchanged, and writes through
behind the reader. An install that predates the adapter migrates **forward only**,
and the source copy is not deleted — `tests/store.test.mjs` checks that a stale web
copy cannot overwrite something saved after the upgrade.

**Android Back.** Unhandled in a WebView it exits the application, so a reader holding
a sentence out to a stranger who presses Back meaning "close this" would quit. An open
`<dialog>` closes first, then the page unwinds one step, and only an unconsumed press
leaves. Escape and Back go through the same `unwind()` so they cannot drift apart.

The one decision here that cannot be checked without a device is
`adjustMarginsForEdgeToEdge: "disable"` — CSS owns the insets, Capacitor adds none.
Letting both act is the "padding twice" the plan warns about; getting it wrong the
other way puts the header under the status bar. It is the first thing to try on an
Android phone, and the fix is one word.

### The emergency board

First in the topic list, 36 buttons, all existing concepts: Help, this is an
emergency, call an ambulance, call the police, I need a doctor, I cannot breathe,
where is the nearest hospital, plus *Hurt or ill…* and *Lost or stolen…*.

Ten new `board-answers` concepts for what a **bystander** says, which is a different
speech act from anything the corpus had: 我要叫救护车了, 救援马上就到, 医院就在附近,
哪里疼？, 您最好待在这里, 我去找能帮忙的人. Three had to be reworded before they were
written, because their natural English is second-person and that out-genders the
traveller in Arabic, Hebrew, Polish and the Indo-Aryan languages: *"Is walking
possible?"*, *"Staying here is best"*, *"What is the name?"*. All three use 您 in
Mandarin, deliberately not the 你 the older rows use.

### "All pairs" is 1,122 rows, and here is the arithmetic

`scripts/build_board_index.mjs` computes, per board, **which languages can be the
listener and which can be the owner** — two lists, not a list of pairs, for the same
reason the corpus is O(N): 53 languages are 2,756 ordered pairs and the ones that work
are the product. The two questions differ, which matters: a listener must have the row
*and* be inside the concept's `applies_to` scope, because that is what `resolvePhrase`
checks; an owner needs only the row, because that side is a gloss. Gated in
`npm run check` like the shell manifest.

Run today, every board serves two pairs. The blocker is **entirely** the 22
`board-answers` concepts, which exist in Mandarin and English alone; the ordinary
phrases the boards use are already near-universal, short by one to three languages
each. Translating those 22 into the remaining 51 languages projects to:

| board | today | after |
|---|---|---|
| emergency, intro, transport, shopping, time | 2 | 2,550 each |
| directions | 2 | 2,652 |
| eating out | 2 | 2,450 |
| massage and spa | 2 | 1 |

**1,122 rows takes Converse from two pairs to about 2,550 per board**, with no
per-pair work anywhere. Massage stays where it is: its 18 `massage-spa` concepts are
Mandarin-only, which is a separate project and a much less useful one.

One consequence had to be handled rather than discovered. `boardCorpus` precached
every language a board declared; with computed lists that is every language, and the
offline shell would go from 4.4MB to something nobody downloads on hotel wifi. It
carries the language-independent concept bank — which every pair needs — plus the two
languages the app opens with. Any other pair is one somebody chose, which means they
were in the app with a connection, which is when Save for offline is the honest
answer, and it is the rule a sheet has always followed.

## Batch G — all fifty-three languages, in eight waves

1,122 rows of content took Converse from **two pairs to 2,550 per board**, and the
projection in Batch F was exact. Eight agents by language family, each given
`content/PROMPTS/board-answers.md` rather than a prompt-embedded brief — which turned
out to matter: later agents read the earlier packs' rows and adopted their row order
and provenance tags without being told to, and one read a mid-flight edit to the brief
and reasoned about whether it applied to its own languages.

| | listeners | pairs |
|---|---|---|
| directions | 52 | 2,652 |
| emergency, intro, transport, food, shopping, time | 51 | 2,550 |
| massage and spa | 1 | 1 |

**Zero rows, across all 51 natural languages, where a gendered form was unavoidable.**
No masculine default was substituted for a missing neutral anywhere.

### What each family had to route around

The constraint is that **two people of unknown gender** are in one short sentence: the
stranger saying it and the traveller reading it. Every family solved it differently.

- **Slavic** — the past is an l-participle that agrees with the speaker, so every
  first-person row uses a present or perfective future (`Вызываю скорую`). Polish
  forced the only real rework: "what is your name" needs `pan/pani`, so it became
  `Proszę o imię`, which is what a clinic desk says and addresses nobody.
- **Indo-Aryan** — the future is gendered too, so it is not the escape it is in
  Slavic. The answer was the **dative-subject obligative** the packs already use:
  `मुझे एंबुलेंस बुलानी पड़ेगी`, where the agreement attaches to *एंबुलेंस*, a feminine
  noun, and never to the speaker. "I will find someone" dropped the first person
  entirely: `मदद करने वाला कोई मिल जाएगा`.
- **Hebrew** — the sharpest catch in the batch. The present inflects for gender and
  not person; the future for person and not gender. So every first-person row is
  future (`אני אתקשר לאמבולנס`) — and the existing
  `police-consulate.i-am-calling-the-police` was **refused as a source**, because it
  is present tense (`אני מתקשר`) and therefore does leak the speaker's sex.
- **Hausa** — no axis but a real second-person hazard. Impersonal `a` (`Za a iya
  tafiya?`), grammatical rather than human agreement (`Ina ciwon yake?` agrees with
  *ciwo*), and for "what is your name" the possessive dropped entirely, because every
  option — 2nd-person `-nka/-nki`, 3rd-person `-sa/-ta` — is sexed.
- **Thai and Khmer** — a cost, not a win. The polite particle is selected by the
  *speaker's* sex and the speaker is a stranger, so all 22 rows drop ครับ/ค่ะ and
  បាទ/ចាស. Thai reads **noticeably blunter** as a result. Offering both is the paired
  alternative the design forbids; the survey's own advice was to omit or pick one.
  Omitted, and now named rather than silent.

### The English steering is a hazard note, not a template

The Germanic agent declined the impersonal wording and wrote `Können Sie gehen?` and
`Bleiben Sie hier`, on the grounds that *Sie* and its imperative carry no gender and
the paraphrase would be a stilted sentence bought for nothing. That is right, and it
is right structurally: a concept here is a language-independent *meaning*. The brief
now says so, with German as the worked example.

### Two refusals that were correct

**Yoruba declined `dietary-needs.no-sesame`.** Three candidate words with three
referents — one names the confection, one is independently given as the Igbo term and
also means "cocoon" in Yoruba, one comes from an ethnobotanical inventory under a
medicinal use — none tone-marked, and Yoruba tone is phonemic. On an allergen row.
A 458-page English-Yoruba dictionary has no "sesame" headword at all.

That refusal exposed a bad rule rather than a bad agent: all-or-nothing cost Yoruba
the whole Eating-out board over one seed. `SLACK = 1` in the board index now lets a
board tolerate **one** missing phrase, because the app has always drawn an
unresolvable button in place and disabled and reported the count under the grid. One
dim button in twelve is usable and disclosed; two reads as broken, which is why it is
not higher.

**Klingon wrote 20 of 22 and Quenya 11**, both refusing on grammar rather than taste.
Klingon's `'ar` is bound to the noun it questions and never stands alone, and
`-laH`/`-laHbe'` always attaches to a specific verb — so "How many?" and "That is not
possible" have no honest context-free rendering, and stretching the pack's existing
`Qapbe'` to cover the second would have blurred two rows into one. Quenya has no word
for money, ambulance, police, telephone or hospital. Both used the existing confidence
tiers: **3** for a bare attested headword used as its own answer (`SoQ`, `pa'`,
`Pahta`, `Tanomë`, `Lacárima`), **1** for anything composed, with morphemes recorded.

### Three defects the tooling caught that reading would not have

- **Uzbek**: the G2P leaked `ʻ` (U+02BB) into the `ipa` column, which the validator
  refuses because an orthographic letter there reaches the font subset of every reader
  of the pack. The cause was one character upstream — Uzbek uses `ʻ` for the `oʻ`/`gʻ`
  digraphs and `ʼ` for the glottal after a consonant, and counting the pack settled
  it: 324 uses of the first, every one after *o* or *g*; 10 of the second, after
  *a*/*e*/*n*. The new row's `maʻqul` was the single exception in either direction.
- **Khmer has no automated IPA route** — its column is entirely hand-analysed and
  tagged `ipa=km-analysis` — so its 22 rows were the only ones in the batch with an
  empty pronunciation, which would have printed a blank respelling. Analysed by hand
  afterwards. While doing it the agent corrected a rule I had given it: the bantak
  shortens the vowel without leniting the final consonant, and my two examples had
  both happened to end in ស, which does lenite.
- **A report contained a Gujarati sentence written in Bengali script.** The data was
  correct; the write-up was not. A script-block check across all seven Indo-Aryan
  packs found 154 rows, none in the wrong script.

### Still open

`massage-spa`'s 18 concepts are Mandarin-only, so that board stays at one pair — a
separate and much less useful project. `dietary-needs.no-sesame` wants a Yoruba source.
The Khmer pack is internally inconsistent on two transcriptions (បិទ as both `bət` and
`bɨt`, ចូល as both `tɕoul` and `tɕoːl`), found while analysing the new rows and left
alone. And none of the 1,122 rows has been read by a fluent speaker of anything.

## Batch H — seven things from using it on a phone

### A word broken in half, and two causes

A screenshot showed `supervisor` set as `supervis / or`. Two things had to be true
for that, and **either fix alone is sufficient** — worth knowing before someone
deletes one as redundant:

- `overflow-wrap: anywhere` on the message surface. It is now `break-word`, which
  only ever breaks a word that cannot fit a line *by itself*.
- The fitter grew the text while checking **height only**. With `anywhere`, growing
  never overflowed sideways — the browser silently absorbed it by splitting a word —
  so the loop had no signal to stop. It measures width too now, against the box that
  actually clips rather than the paragraph, which sizes itself to its own content in
  a flex column and so never reports overflow.

On a 390px screen the message drops from 126px to 54px and nothing breaks.
`tests/conversation.spec.js` walks the rendered text character by character and
fails if a line starts mid-word; checked by reverting each fix in turn.

The same `anywhere` was on every surface a phrase is read from, and all of them are
`break-word` now. `.board-pair` and `.board-title` keep it deliberately: they are
chrome, and `anywhere` is what lets a flex item shrink below its content, which is
the fix that stopped the header clipping at 1.6× text.

### The mark on an answerable cell

Two overlapping speech bubbles, drawn inline from the owner's own SVG, in place of
`↩` — which said "this goes back", the opposite of what the cell does. It sits in
whichever **outer corner the label is not using**: `placeMark` measures the first and
last line box of the wrapped label and moves the icon to the short end. "Where do I
pay?" wraps 109/153 and takes the top corner; "Pay by card?" wraps 132/109 and takes
the bottom. `inset-inline-end`, so a right-to-left board mirrors it.

### The picker folds once it has been used

Fifty language buttons is the right density for choosing and the wrong thing to leave
between a reader and the Export / Customise / Converse buttons on the card they just
chose. Picking one now folds the grid and names the choice in the label, which still
reads as an answered question; the state is remembered, as the studio's panels are.
Measured after the fold: the chosen card lands at y=309 with its actions ending at
659 in an 844px viewport, at scroll 0 — directly reachable, for every language tried.

### The beacon, and the one place this app moves

`ui/platform/beacon.js`. Everywhere else a transition would be decoration and the
information is better given statically; here the motion **is** the feature, because a
distress signal that does not move is not one.

Two modes for two situations. **SOS** flashes the whole screen white-on-black in
Morse — the brightest thing a phone can do, and a signal a stranger may recognise
without reading a word. **Attention** holds one word still and runs a light around
the edge of the display, which is what catches an eye that is not pointed at the
screen. Tapping anywhere stops either; so does Escape and Android Back, which take
the beacon before the board's own state because it is over the whole screen.

**The dot is 300ms, and that is a safety property.** WCAG puts the photosensitive
seizure threshold at three flashes per second; measured, this runs at **1.00**. The
test counts transitions over three seconds rather than reading the constant, so
shortening the dot without thinking goes red.

`kind: 'beacon'` is a new board-button kind with its own two-value enum, validated
like the others — a board file naming its own signal would be a board file describing
behaviour, which is the line this format does not cross. The two sit together at the
end of the emergency grid, away from the phrases, so a thumb reaching for "it hurts
here" never lands on a strobing screen. They replaced the emergency number (a fact,
better on the printed card) and "I do not speak X" (one tap away on Meeting people).

### A trap the board generator set

`mkboards.py` writes `index.json` in the *authored* shape, with `pairs`;
`build_board_index.mjs` replaces that with the computed `listeners`/`owners` the app
reads. Regenerating the boards without re-running the builder left the file half
written, and the board page died on `undefined.includes`. The generator runs the
builder itself now, so the two cannot be out of step.

### Also

The reply grid's way out was a centred, answer-sized button, which read as a
thirteenth option; it is small, in the lower inline-start corner, with an arrow, and
still in the listener's language. The board title is larger, bold and in the accent
colour, which also tells it apart from the grey pair line without a rule or a box.

### §5.4 — the reader's own data, in a file they can carry

There is no account and no server, which is the point, and it means the only copy of
someone's own phrases is on one device. `core/personal.js` builds and reads a
versioned JSON package; `ui/speaker-settings.js` gains Save a copy / Load a copy /
Delete everything, and `tests/personal.test.mjs` covers the rules.

**It is inert.** JSON with sentences in it: no URLs, no scripts, no templates,
nothing fetched or evaluated, and every string rendered into a text node. A file
someone was sent by a stranger cannot do anything except add phrases they can read
first. The shape walk refuses `__proto__`, `constructor` and `prototype` keys, caps
nesting at eight, and rejects anything that is not text, a number, a boolean or a
shallow container of those.

**It is validated whole, before anything is written.** `readPackage` returns problems
or a value, never both — a half-applied import is worse than a refused one, because
the reader cannot tell which half landed. A placement naming a board or a screen this
build does not have is reported rather than imported, which is the plan's rule that
an import must never claim success for something that cannot be used. Passing no
board list turns that check off, which is what a plain backup restore wants.

**A newer package is refused rather than guessed at**, because it was written by a
later build and this one cannot know what it left out. The cap is 2 MiB counted in
*bytes* — one emoji is four — and it is checked before the parse.

What travels is the reader's *work*: their phrases and placements, their speaker
profile, their per-pair sheet edits. What does not is this device's preferences —
studio column widths, whether a banner is dismissed — because carrying those to
another phone would be presumptuous rather than helpful.

**Settings are now offered on every pair.** The button was gated on the pair
declaring a speaker axis, which is 22 languages of 53 — so on the Mandarin board that
ships by default, the export was unreachable. A backup button that appears only for
Russian readers is one nobody can find.

### And then on every page, which took undoing a rule

`speakerControl` returned `null` when neither language declared an axis. That was
right while the dialog only asked about voice — and wrong the moment it also held the
reader's own phrases, because on a pair that asks nothing the way to save a copy of
them disappeared. It always returns a control now, labelled Settings, and the dialog
says for itself when there is no voice question to put.

The storage half lives in `ui/personal-data.js` rather than three times over: which
keys are read, which are written, and what happens after. It is its own module so the
gallery does not pull the board store and the sheet editor in just to know the
reader's language. Each page supplies `onChanged`, because reloading means different
things — the board has the new phrases in front of the reader and repaints, while a
sheet page holds a solved layout built from the edits that just changed underneath it
and starts again rather than keeping a second, quieter copy of `buildSheet`.

### Not done in this batch

N2's native file delivery. On a device the Save-a-copy download goes through the
browser path, which inside a WebView may do nothing at all.

### The slashed rows a reader actually meets

Of 410 slashed rows across the corpus, **33 are on a conversation board** and only
**12 of those are gender pairs**. The rest are the concept doing its job:
`quick-responses.yes-right` is "yes / right", two glosses of one meaning, and
`communication.i-cannot-read-understand` is "I cannot read / understand", two
genuine alternatives. A sweep told to "split the slashes" would have destroyed both,
so `speaker_coverage.mjs --slashed` prints the English beside each row and the prompt
now names an example of each kind.

The twelve are split: base row masculine, feminine in `variants.csv`, stale
`"(male speaker) / (female speaker)"` notes cleared from `literal` — 113 → 101
first-person slashed rows. Czech's four `i-lost-my-*` masculines were reconstructed
from the existing feminine rows programmatically rather than retyped, so no diacritic
could slip.

**Two judgement calls came back rather than being guessed at.** French's
`Bonjour madame / monsieur` is the *listener's* gender on a card held out to a
stranger; bare `Bonjour` is fully polite and the guess disappears at no cost, so it
was changed. Spanish's `Mi hijo/a se ha perdido` is the *child's* gender, which the
no-companion-axis rule covers — the recommendation is `Mi hijo` as the RAE-sanctioned
generic, matching the Russian ребёнок precedent the prompt already cites, with
`mi criatura`/`mi peque` rejected as register-risky on a missing-child card and
`mi niño` rejected because it splits identically. Left for the owner.
`es children.child-age` has the same shape and is flagged, untouched.

**Mandarin now says 您 to a stranger** on the four board rows that said 你.
`introductions.what-is-your-name` became `您怎么称呼？` rather than a literal
`您叫什么名字？`, on the grounds that the corpus already holds the brusque intake
register as `board-answers.what-is-your-name` for a first responder, and an
introductions card is the warmer context.

### Two test failures worth the record

`speaker.spec.js` asserted "one axis question" by counting `.speaker-axis`, and the
new personal-data section reused that class for its frame — so the count was two. The
fix was to model it rather than work around it: `.speaker-block` is the frame every
section shares and `.speaker-axis` means *a question about the reader*, so counting
it counts questions.

The delete-everything test failed because `onChanged` read the board store before its
own queued write had landed, and the grid still showed a phrase the status line had
just called deleted. It chains off the write now, with `finally` rather than `then`,
because a refused write still has to repaint — a screen that keeps claiming something
that did not happen is the worse failure.

### A mistake in the process, not the code

Checkpoint 7 went out with three rows whose `ipa` column was empty, which would fail
`build_ipa.py --check` on the pushed state. Cause: `git add -A` while an agent was
still writing. The gate I ran and quoted was green for the tree as it stood *before*
those edits landed, and the commit swept them in unverified.

The rule that follows is narrow and worth keeping: **the settle sequence — regenerate,
rebuild the shell, run the gate — has to be the last thing that happens before
`git add`, with nothing writing to the checkout in between.** Committing by explicit
pathspec instead of `-A` is the cheap version of the same protection, and is what the
earlier checkpoints in this session did while agents were in flight.

Fixed in the following commit rather than by rewriting history: the push had already
happened, and a force-push to a branch that *is* the deployment is worse than a
second commit that says what it is.

## Batch I — twelve things from a second afternoon on a phone

Twelve requests, one of which turned out to be a real defect wearing the costume of a
taste complaint. In order of how much they changed.

### "The text pushes flush against the white outline" was an overflow

Reported as a margin being too tight. It was not: on a 390pt phone the message
`Извините` was being drawn **810px wide inside a 368px box**, and Tamil's
`காவல்துறையை அழையுங்கள்` ran 349px past the edge of the screen. Four languages
probed, three of them overflowing, every one of them at the fitter's ceiling.

The cause is one declaration nobody wrote. `.board-message` is a `<button>`, and the
HTML rendering spec gives a button `align-items: center` — so its flex children are
**shrink-to-fit**, and the paragraph inside grew to its own max-content width rather
than to the width of the box. Two things followed from that, and the second is why it
survived a fitter that was written specifically to catch this:

- The text overflowed, because nothing was constraining it.
- `fitMessage` could not see the overflow. Its width test is
  `widestLine(text) <= lineRoom(text)`, and `lineRoom` measures the paragraph's own
  content box — which, being shrink-to-fit, was **exactly as wide as the ink in it**.
  The test was comparing a number with itself and passing at every size, so the only
  thing bounding the type was `MAX_MESSAGE_PX`.

`align-items: stretch`, stated. The tightest ink-to-edge clearance across Mandarin,
German, Tamil and Russian went from **−349px to +27px**, and no message on any of the
four boards overflows its screen in either orientation.

This is the same class of defect as the mid-word break in Batch H and has the same
moral: a fitter that measures the element it is sizing against *itself* will always
say yes. The width has to come from the box that clips.

### And the screen can be turned

Requested as "a small semicircle-arrow button in the bottom margin to rotate the
displayed text… to fit big text", and it earns its place for a reason that only became
clear after the fix above. Nothing here breaks a word in half, so a long word sets the
type size: `английском?` is eleven characters, and in 310px of line it holds the whole
message to 42px. Turned, the line is 750px and the same message is set at about 100px.
Measured on `最近的医院在哪里？`: **108px over four lines upright, 126px on one line
sideways.**

The whole stage turns, not the text: a rotated text box still has to be laid out,
measured and scrolled, so swapping the stage's own dimensions and rotating it means
everything inside lays out honestly in a landscape box and the Reply control comes out
the right way up for whoever is reading the turned screen. The controls move to the
trailing edge rather than staying at the foot, because a row of 3rem buttons costs an
eighth of a 390px-tall stage where it cost a twentieth of an 844px one — turning the
screen to gain room and then spending it on the same controls is no gain.

One thing had to be taught to the fitter: `getClientRects` reports **viewport** space,
so on a turned stage every line came back with its length in `height` and its
thickness in `width`, which reads as a line far too wide for its box at every size and
pinned the text at the floor. The turn is a paint-time rotation and changes no layout,
so the fit drops it for the measurement and restores it in the same synchronous block.

A `ResizeObserver` on the surface came with it, closing a gap nobody had reported:
turning the phone over used to leave a message set for the other orientation.

### The beacon is amber, moves, and speaks to the stranger

Four edges taking turns was a flash in the corner of the eye and four separate lights
up close. One point going round the perimeter continuously is what a beacon looks
like, and the eye tracks it. `requestAnimationFrame` against the clock, one lap in
2.6s; the perimeter arithmetic is four subtractions in JavaScript rather than four
clamped `calc` terms, because the four sides are genuinely four cases. Amber `#ffb020`
rather than red: red on a dark screen reads as an error state, and this is not an
error, it is someone asking to be seen.

**And the word on it is the listener's.** A beacon exists to be read by whoever walks
past, so the one thing on that screen that cannot be in the reader's language is the
word itself. It comes from `emergency-medical.help` in the listener's pack — reviewed,
in the native script, present for all 51 languages that can be a listener — rather
than from a second translation of "Help" living in the interface catalogue. Mandarin
shows `救命！`. `beacon.dismiss` stays the reader's, because the reader is the one who
has to know how to stop it.

### The answer mark became a watermark, and the legend went with it

Requested as "centre them in the button, really big and faint like a watermark" and
"remove the note at the bottom clarifying what they do, which should be obvious by
design" — and the two halves of that are the same point. In the corner it was an icon,
and an icon invites the question of what it means, which is what the legend answered
in words on a screen whose whole job is to be read at a glance. At 72% of the cell and
0.12 opacity it stops being a control to interpret and becomes the surface the words
sit on. `placeMark`, which measured which end of a wrapped label had room, is gone
with the corner it was choosing between.

### The phone's customise screen is three rows of one screen

Stacked and page-scrolled, each panel's bar was sticky *to its panel* — so scrolling
the page slid the Format bar under the site header and left the reader inside a
32,000px list with no visible label on it. A column that fills the viewport puts every
bar permanently on screen, which is what makes them headers rather than captions, and
it is the layout the desktop already uses; the only thing a phone changes is the axis.

**The bar is also the seam.** On a desktop each panel has a visible seam beside it; on
a phone the boundary between two rows is exactly where the lower one's bar already is,
and adding a second grabbable strip a few pixels tall under a finger would be a worse
control than the one already there. So a tap folds the panel and a drag moves the seam,
told apart by six pixels of travel — and dragging a bar down onto its own panel until
nothing is left of it *is* folding it, and says so.

Two details cost a debugging pass each. Taking the pointer capture on `pointerdown`
retargets the click to the bar, which is where the toggle button is not, so every tap
stopped folding — the capture is taken when the drag starts instead, where the click it
eats is one that should not have happened. And the flag that swallows a drag's click
has to be cleared a turn later rather than in the click handler, because a drag that
ends off the bar produces no click on it at all, and the stale flag ate the next
genuine tap.

### The picker stays where it is, and opens

Fifty-two buttons is more than one screen, so the question they answer used to scroll
off the top and leave a reader looking at a wall of unlabelled languages with no
visible way to fold them away. Stuck below the site header — whose height is not a
constant and so comes from a `ResizeObserver` as `--header-h` — it is always the thing
above the grid.

The fold no longer persists. It folds itself the moment a language has been picked,
which is the common case, so remembering that meant almost every return visit opened
on a page whose first control was collapsed — and the picker is what the page is for.
Nothing else about the picker is remembered either: which card was reeled to the top
row is this visit's reordering, not a setting. The reader's *own* language, in the
site header, is the thing that persists.

### The bar is one row, and nothing in it is truncated

Settings and Edit buttons became one three-bar menu (`ui/board-menu.js`, a `<dialog>`
so Escape, Android Back and update deferral come free), which gave the topic the room
to be the first thing you read: bold, accent-coloured, and sized against the bar with
`cqi` rather than the viewport.

`nowrap` plus an ellipsis kept it to one row and paid for it by cutting a topic's name
in half, which nothing here is allowed to do — and at a 1.6× system text size, where
two 44px controls and rem-sized gaps eat the row, it did: "Getting around" wanted 164px
and had 160px. `min(5.5cqi, var(--fs-2))` with wrapping allowed as the last resort
gives one line at every ordinary setting and a second line rather than a lost syllable
at the extremes. A floor in a `clamp` is what turns "as large as fits" into "large
enough to need the ellipsis".

### Also

- "What is this about?" is **Context**, and the context page has its own way out
  (`All languages`). The within-board control is an arrow and nothing else: where it
  goes is obvious from where you are, and the word beside it was competing with the
  topic for the only row there is. The accessible name still says which.
- The project is **Phraselet** — 52 catalogues, the web manifest and the native
  `appName`. The `appId` and the URL are untouched deliberately; five catalogues that
  had *translated* "Pocket Language Guide" were reset to the English name, because a
  product name is not a phrase.
- **Ten listener-facing interface keys, previously present in Mandarin alone.** These
  are the strings shown to the stranger — Reply, Close, the keypad's labels, the
  beacon's word — so every one of them being English was the reply button appearing in
  the owner's language, which is how it was reported. All **fifty natural-language
  catalogues now carry exactly the same 388 keys**, which is the first time that has
  been true of anything but `en`. `beacon.help` was aligned against each language's own
  reviewed `emergency-medical.help` row rather than translated afresh; five independent
  agents, briefed separately, each arrived at that alignment or at the same wording.

  The distress word is not the dictionary word, which is most of what the research was
  for: Spanish and Portuguese `SOCORRO` rather than *ayuda*, French `SECOURS` rather
  than *aide*, Polish `POMOCY` in the genitive rather than nominative *Pomoc*, Croatian
  `Upomoć` rather than *pomoć*, Finnish `APUA`, Armenian `Օգնությու՜ն` with the emphasis
  mark inside the word. Whether the international signal is written `SOS` or
  transliterated was settled per language from that language's own sources: Arabic,
  Persian, Amharic and the Indic catalogues transliterate, Greek, Russian and Ukrainian
  keep the Latin letters, because the point of a beacon is to be recognised regardless
  of script.

  **Klingon and Quenya were done last and deliberately incompletely.** Nine of ten keys
  for `tlh` and six for `qya`, each traced to Okrand or to Eldamo with a citation, and
  the rest left to the English fallback rather than filled with invented compounds —
  there is no attested Quenya word for *minute*, so `board.unit` names no units at all.
  Two were reworded rather than translated, because the English is a suggestion:
  Klingon's `'ar` must follow the noun it counts, so "How many" became `poH 'ar`, "how
  much time". Both files record the sourcing and the omissions in a `_board_note`,
  following the `_ornament_note` precedent already in them. The one that mattered
  functionally: `tlh`'s corpus row has a blank `text` — Klingon is romanised-only here
  — so the beacon genuinely falls through to the catalogue for that pack, which is what
  the fallback is for.
- The board's back arrow and menu are 44px again. 2.1rem looked right in the bar and
  is 33.6px, which is under the floor for a control meant to be hit without looking.

### Not done in this batch

- Nothing, in the end, about "converse does not work for most languages" — see below.
  It was not a stale deployment.
- The unit words under the keypad still come from CLDR with the catalogue as a floor.
  That floor is now read from the *listener's* catalogue rather than the owner's, which
  is where it belonged: it is their screen.

### "Converse does not work for most languages" was not a stale deploy

That was the first guess and it was wrong, which is worth recording because the
evidence for it was circumstantial and the check was cheap. The live site's
`data/boards/index.json` already listed 51 listeners; `data/lang/de/social.csv` on the
live host already had all 22 `board-answers` rows; and driven through a real browser
against the live URL, with the service worker in charge, German, Japanese, Swahili and
Tamil all opened the emergency board with twelve buttons, none disabled and no console
errors. Fifty of the fifty-two languages work; the two that do not are Klingon and
Quenya, which say so in a sentence naming the board and the language.

What does reproduce the report is the network being off. The deployed shell precaches
corpus rows for **two** languages — `en` and `zh-Hans` — because the bound is the
default pair, and that bound is right: per-language rows across the registry come to
something like seven megabytes, which is not a thing to push at someone before they
have asked for anything. But the consequence is exactly what was reported, in the
situation this screen exists for: offline, converse worked in Mandarin and in nothing
else.

So opening a board now keeps the pair it is using. That is the honest moment — it
means there is a connection *right now*, it names which pair matters, and the reader
has demonstrably asked for it. 100-160KB of rows per language and usually only one of
the two, no fonts and no solver (a board has never loaded either), and the worker
already skips anything it finds in the shell cache -- which is both why the reader's
own side is free and why this cannot shadow a shipped file. The message protocol was factored out of
`saveForOffline` rather than copied, since the difference between the two callers is
only what goes in the list.

One file had to be named that was not obvious: `data/lang/<code>/variants.csv`. German
declares an axis about who is speaking, so the board reads that table, and the first
version of the warm left it out — which cost precisely the visit it was written to
fix, with `LoadError: data/lang/de/variants.csv: HTTP 504`. The caller names the
languages rather than the helper guessing, because the caller has already fetched
exactly those files.

## Batch J — the answers, and ten things from looking at it again

### Three Opus audits of the conversation trees, and what they found

The report was *"sometimes the responses do not quite make sense"*. Three agents took
the eight boards between them, each told to name fixes as concept ids that already
exist and to price every proposal against the board index's own reach computation.
All three re-implemented that computation rather than trusting a description of it,
which is why the numbers below are measured.

**The finding under the finding: 116 of 168 buttons can now be answered, against
about 30 before.** The boards were built as a way to *say* things and the reply sets
were retrofitted, so the pattern was systematic rather than a handful of bad fits:

- **`food` had thirteen silent buttons**, including all eight allergen instructions.
  The owner showed "No peanuts" and the waiter had no way to say yes, no, or "I will
  ask the kitchen" — on the board where that answer matters most. One `kitchen` set of
  seven existing ids covers all thirteen, and `board-answers.we-do-not-have-it`'s own
  concept note turns out to have been written for exactly this ("the shopkeeper's *or
  kitchen's* negative answer").
- **`time`'s `when` set could not say a time.** Asked "what time does it open?" at
  eight in the morning, the only substantive cell was *It is closed* — so the owner
  read back a **false** statement when the answer was *opens at ten*. That is not a
  thin answer, it is a wrong one manufactured by the layout.
- **`Where am I?` offered eight ways to send someone somewhere.** A stranger asked
  where you are wants to name a place or point at a map; the owner got *Turn left* with
  no destination attached and turned left. The same defect sat on `emergency`'s *I do
  not know where I am*.
- **`Help!` offered a set with no way to offer or refuse help.** Two of its four
  substantive cells were questions back, and a bystander whose true answer was "I am
  calling an ambulance" could not say it — though that phrase was already on the board.
- **`It hurts here` on the spa board had no reply at all**, while `avoid-area` — *I
  will avoid that area* / *which area do you mean?* / *does that area hurt?* — sat one
  button away. One line.
- **`yes-no` was offered to questions about the world.** *That is not possible* answers
  a request and is a non-sequitur against *is it delayed*, *is it far*, *is this
  vegetarian* — the last of which is the owner's complaint word for word.

**Reach cost of the whole batch: one constructed language on one board.** Every
concept named is in all 51 natural packs; the only price is Klingon on `directions`,
taken deliberately to buy `lost-rescue.we-are-here` (the one exact answer to "where am
I?") and a compass set with all four points rather than two. 52 → 51 listeners there;
every other board unchanged.

### Depth, where it was actually earned

`emergency` is now three deep: a `conditions` node under `Hurt or ill…` holding the
twenty-two `medical-conditions` concepts that the twelve-button cap had locked out of
every board — penicillin and aspirin allergies, an adrenaline injector and where it
is, blood thinners, epilepsy. Its reader is the one holding the phone out to a
paramedic, who is stationary; the tap is cheap and the phrases are not reachable any
other way.

`transport` went from twelve flat buttons to six and three nodes, split by **which
vehicle you are standing in**. The argument is not tidiness: the board was at the cap
and therefore closed, while `transit-rides` held five phrases a traveller needs more
than *Please use the meter* — *where is the subway station*, *do I need to validate
this*, *I went past my stop*. Nobody is in a taxi *and* at a ticket window, so every
cell on the screen you land on is one you might press. The three phrases that cannot
afford a tap — *stop here*, *I am in a hurry*, *take me here* — stay on the root and
appear again inside the taxi node, which is what `spa` already does with *please stop*.

`food` gained a `contains` node, because `avoid` could only *instruct*: a vegetarian in
Vietnam needs "does it contain fish stock?" more than "no seafood", and six
fully-formed, unscoped concepts existed that no board used.

Three boards were told to stay as they were, and that is in the record too:
`directions` is ten buttons of one situation with no division that is not arbitrary,
`shopping` is flat and correct, `intro` is a greeting.

### The validator was blind in one direction

Applying the audit, a reply set went in and the button meant to point at it was given
the wrong id. Nothing caught it: the reachability walk only ever looked at nodes,
because a reply set is reached from a message rather than from the grid. Both failures
that follow were silently possible, and one of them I shipped for a few minutes.

- A button naming a set that does not exist draws a Reply control that opens nothing.
- **A set nothing names is worse than dead.** `build_board_index.mjs` charges the board
  for every phrase in every set, so an orphan quietly costs the board the languages
  that cannot say answers no reader can reach.

`validateBoard` now reports both, `tests/conversation.test.mjs` validates all eight
shipped boards rather than only a fixture, and the dead `pairs` field — superseded by
the computed index and still sitting in all eight files — is gone.

### What all three audits independently asked for — now done

**There was no way to answer with a number.** `entry` accepts `'duration'` and nothing
else, and `value` is minute/hour/day — so a clock time, a platform number and a price
are all unrepresentable. That is why `time`'s *What time is it?* has no reply set, why
`shopping`'s *How much is this?* gets a set that can only promise to write the price
down, and why a departure has to be answered in minutes-from-now rather than at a
time. It is a code change rather than a data one, it costs no translation, and it is
the single largest remaining gap in the format.

### Ten things from looking at the screen again

- **The rotate control is three quarters of a turn, not a half**, with a solid head
  whose tip carries past where the stroke stops: a half-circle with an arrow on it
  reads as "undo", and a stroked chevron merges with its own arc at 22 pixels. It sits
  in the footer row with Speak and Reply now, square where they are words.
- **The watermark cannot leave its button.** Given a width alone, its height came from
  the artwork's own 256:208 and a short cell got a watermark taller than itself. With a
  box in both directions the SVG's own `preserveAspectRatio` letterboxes it inside
  whatever shape the grid gives it — worst clearance across a dense grid went from
  extruding to 15px inside. The gap between the two bubbles is nearly twice what it
  was, because at 12% opacity there is no tonal difference between the shapes to
  separate them, only the space.
- **Characters in a square script line up, and the punctuation sits outside them.**
  `救命！` set large enough to wrap breaks as `救` / `命！`, because no line may begin
  with a closing mark — and centring each line then puts the `救` on the midline while
  the `命` is pushed half a character left of it. Aligning the lines to each other and
  centring the block makes the characters the column and the punctuation the thing off
  to the side. The block has to be as wide as its widest line, which is not a width CSS
  can name: `fit-content` on a Han string is the full container, since it can break
  anywhere. So it is measured. Only for Han, kana and Hangul, which are drawn on an em
  square — Latin is proportional and aligning it would buy a ragged right edge and no
  column.
- **The SOS screen has nothing in the middle of it.** The Morse *is* the message, the
  middle is the part doing the signalling, and `SOS` is not a word in most of these
  languages. The word stays in the accessibility tree for the alert to announce, and
  the one line that is not signal — how to stop it — is at the bottom edge.
- The travelling light is a third of the screen long and nearly twice as thick: what
  carries at a distance is the *amount* of moving light.
- **The context list's buttons lost their dashed borders.** The dash says "this goes
  deeper rather than saying something", which is information on a mixed grid and noise
  on a screen where every button is one.
- **The collage names the language of the place.** It used to say "I speak" in whichever
  languages sorted first. A browser gives away two things that mean something: the
  language the device is set to, and — the one that *moves when the reader does* — the
  timezone. `data/registry/timezones.csv` is generated from IANA's own `zone1970.tab`
  (public domain, and the reference copy of that mapping, with a shared zone taking its
  most populous country because that is IANA's own ordering); `languages.csv` already
  names the regions each language is spoken in, so region to language needs nothing
  new and handles India naming twelve of them. An American browser in Tokyo now reads
  `話せる言語` behind `I speak`, and it survives to the phone, where there is room for
  exactly the two guesses and nothing else.

### Three kinds of number

`core/duration.js` is `core/quantity.js`, which is what its own first line always
called it: *answers that are a quantity, not a sentence*. It now holds three.

- **`clock`** — a time of day. The gap that produced a *wrong* answer rather than a
  missing one: asked "what time does it open?" at eight in the morning, the only
  substantive cell in the answer space was *It is closed*.
- **`count`** — a bare number. A platform, a price, a how-many. `numbers-money` holds
  single digits and magnitudes and a price is not spellable one tap at a time, so
  "how much is this?" had nothing but a promise to write it down.
- **`duration`** — unchanged, and now tagged like the other two.

None of the three costs a translation, which is the whole reason a keypad is worth
having here: `Intl` knows a locale's plural rules, whether it writes twelve- or
twenty-four-hour clocks, and which digits it uses. Klingon and Quenya are refused for
all three, as they already were for durations — `null` rather than an English time on
a Klingon screen.

**The clock is asked for with `<input type="time">`.** The platform's own picker knows
this reader's convention and hands back one unambiguous `HH:MM` whatever it displayed;
two text fields would be a worse control in every locale and a differently worse one in
each. Measured: a Mandarin listener types into their own 24-hour control, the preview
reads `14:30`, and the English owner reads `2:30 PM` off the same structured value.

Three things had to change beyond the formatter.

**Values are tagged.** `{amount, unit}` became `{kind: 'duration', amount, unit}`, and
the eighteen presets in the board files with it. The alternative was discriminating on
which fields a value happens to carry, which is the kind of implicitness that reads
fine until somebody adds a fourth kind.

**The parsers return one shape.** `parseAmount` returned `{ok, duration}`, and adding
`{ok, clock}` and `{ok, count}` beside it made the caller's type a union it could not
express — a signal the shape was wrong rather than the caller. All three return
`{ok, value}` now, and `renderEntry`'s `check` hands back the value it parsed instead
of the view re-deriving it from the raw string, which was two parsers keeping a private
agreement about what a number is.

**`enter` carries which keypad was tapped.** A set may offer two: `how-soon` answers a
departure in minutes from now *or* at a time, which is two cells opening two different
keyboards. The reducer recorded only that a keypad had been opened, so the first
version rendered a duration pad for the clock cell — and the tell was that the cell
said *Another duration* either way.

## Batch K — the last board, and a desktop view that was broken

### `spa` reached one language; it reaches fifty-one

All sixteen `massage-spa` concepts were written for a Mandarin massage parlour and
carried `applies_to: zh-Hans`, so seven boards served 51 listeners and the eighth
served one. Nothing else about it was narrow. Five research agents wrote the rows for
the 49 remaining packs against `content/PROMPTS/massage-spa.md`, and the board went
**1 listener → 51, one pair → 2,550.** Corpus warnings fell 214 → 198, because
sixteen "scoped to zh-Hans but has no gloss in…" lines retired at once.

The briefs asked for trade vocabulary from sources of record rather than translated
English, and that is most of what came back. A sample of what would have been wrong:

- **Thai is a different trade**, and the agent holding it said where the Mandarin
  framing broke. Thai splits ไหล่ (the shoulder joint) from **บ่า** (the top of the
  shoulder), and the trade sells คอ บ่า ไหล่ as one unit — so 肩膀 has no single
  counterpart, and `focus-on-shoulders` is บ่า because that is the part a Thai massage
  works. It also noted that ดัด and ดึง — the assisted stretches that define the trade
  — have no concept on this board at all. That is a gap in the concept set, not in the
  Thai rows.
- **Malay `pijat` is a false friend**: Kamus Dewan's primary Malaysian sense is the
  bedbug. The trade word is `urut`.
- **Javanese `alon` is speed**, not softness — Bausastra gives "rindhik, ora
  kêbantêrên" — so `more-gently` uses `alus`, which the same dictionary defines of the
  touch.
- **Every language's word for *slowly* was the trap**, and every agent checked its own
  `communication.please-speak-more-slowly` row to find it: Czech *pomaleji*, Tamil
  *மெதுவாக*, Persian *آهسته‌تر*, Indonesian *pelan*, Marathi *हळू*. `more-gently` is
  about pressure and avoids all of them.
- **Russian and Ukrainian could not use `давление` / `тиск` for "that pressure is
  good"**, because the bare noun reads first as *blood* pressure. Those rows name the
  action instead.
- **French law reserves *massage* to physiotherapists** (CSP L.4321-1), so a spa
  performs a *soin* — which is the word `reply-cannot-avoid-this-treatment` uses,
  sidestepping the question rather than picking a side.

**Gender was the other half of the job.** The ten customer rows are spoken by the
traveller, whose sex the app can ask about; the five therapist replies are tapped by
someone the app knows nothing about and had to come out neutral with no slash. Arabic
and Hebrew needed a third device, because a masculine imperative genders the
*therapist* too: `أرجو` + maṣdar and `יש ל` + infinitive, both invariant. Czech's
`vedoucí` is epicene only in the nominative, so that reply makes the supervisor the
subject. Punjabi nearly shipped a `ਕਰਦੇ ਰਹੋ` that would have gendered the therapist —
a hazard no `speaker_gender` axis can express. Two rows are recorded as generic
masculine with the reason in `provenance`: Polish `kierownika` and Arabic `المسؤول`,
because neither language has a neutral noun for the person and the concept requires
naming one.

### A duplicate concept, found five times over

All five agents independently refused to translate `massage-spa.reply-none-of-these`,
and they were right: it was byte-identical to `board-answers.none-of-these` in every
pack that had both, and no board had referenced it since the reply-set audit. It is
deleted — concept and 41 rows — and the general row's note now records that rather
than describing itself as a generalisation of something that still exists. 902 → 901
concepts.

Two other things the agents found and did not fix, both outside their files and both
worth doing:

- **`data/lang/ms/emergency.csv`'s `body-parts.back` is `Punggung`**, which Kamus
  Dewan gives as *pantat, bokong* in Malaysian Malay and marks the "back" sense `Id`.
  A Malaysian pointing at that card is pointing at their buttocks.
- **The Hausa pack is under-hooked** and disagrees with its own catalogue: `kudi` 49×
  against `kuɗi` 2×, `karfi` 4× against the catalogue's `ƙarfi`. It wants one sweep,
  not a per-row fix.

And one they found in a file they did hold: `data/lang/am/social.csv` romanised ቅ as
`q` in a single row, which is not in `build_ipa.py`'s Amharic table — so that row's
`ipa` had been silently empty since it was written. Every other Amharic row writes
`kʼ`. Fixed, and the cell now generates.

### A note that was wrong twice

`massage-spa.stronger-pressure`'s note said the shape of the wording could not matter,
because "the grid labels its cells in the owner's language… so the two never appear
together". Two agents checked it against the code instead and it is false:
`labelOf` in `ui/conversation.js` falls back to the owner's own sentence when a button
carries no `labelKey`, and neither `stronger` nor `gentler` has one on the spa board —
so on the owner's grid those cells *are* those two sentences, adjacent. The note now
says so and cites the line; `massage-spa.md` says it too. It had been reasoned about
wrongly twice, which is the argument for checking rather than reasoning.

### The desktop view of converse was broken, and it was Batch I's fault

Reported as "I am not sure the desktop view of converse works currently", and it did
not. Giving the page a definite height so that every row of a board would be on screen
turned `grid-auto-rows: 1fr` loose on a 1000px window: twelve buttons came out as
**eight towers 147px wide and 435px tall**, with "Please call the police" set one word
to a line. The answers screen was worse at 167 × 387.

Past the width where a phone stops being the shape, both grids are panels now: capped,
centred, and no taller than a board wants to be. The column floor moved 9rem → 10rem,
which is the only value that gives two columns on a 360px phone and four on one held
sideways — 11rem drops a 360px phone to a single column and twelve rows. The way out
of the answers keeps to the panel's edge rather than the screen's, because in the
middle of a wide window it reads as a thirteenth answer. Pinned by a test that walks
six viewport sizes and refuses any cell more than twice as tall as it is wide.

### Two generated files that were not as generated as they looked

`data/registry/timezones.csv` shipped with a comment header, because provenance
belongs with the data. No other file in `data/registry` has one, and the tooling reads
that directory with a bare `csv.DictReader`: the `#` line becomes the header, the
first comment containing a comma overflows into the `None` key as a *list*, and
`scripts/subset_fonts.py` dies calling `ord()` on it. It did. The provenance is in the
generator's own header now.

And the Korean subsets needed rebuilding: the new rows gave the respeller new IPA, and
a Korean reader's respelling of it emits `뉙` and `댠`, which `cjk-kr` could not draw.
`tests/fonts.test.mjs` caught it — that test exists because this has happened before.

### Concepts with identical English, and why most of them are right

Sweeping the English corpus for texts carried by more than one concept turns up seven
pairs. My first reading was that they were the duplication the "index, don't
duplicate" rule exists to prevent. That reading was wrong, and the reason is
structural: **`section_id` is a single column on a concept**, and `core/pack.js`
builds a sheet section by exact match on it. A board can index a concept from any
section — that is what the spa board does with `another-towel-please` and `thank-you`
— but a *sheet* section cannot. Two sections that both need a term genuinely need two
concepts under this schema, and deleting one would silently empty a row out of a
printed card.

Of the seven:

- **Three are documented distinctions and should stay.** `board-answers.i-am-calling-the-police`'s
  own note says it is textually identical to the traveller's row and separate because
  a different person says it; `border-customs.i-am-a-tourist` is one of four answers
  to "purpose of visit" that have to stay grammatically parallel; and
  `trail-warnings.closed` against `common-signs.closed` is a distinction **English
  cannot make and eighteen languages do** — a trail is *gesperrt* and a shop is
  *geschlossen*.
- **One was a real duplicate and is gone** — `massage-spa.reply-none-of-these`, which
  was on no board at all and so cost a section nothing.
- **Three are structurally required and have drifted**: luggage-storage across
  `hotel-words`/`place-words` (9 languages disagree, Spanish over an article),
  the toilet-will-not-flush row across `room-problems`/`toilets` (3), and
  please-write-the-number across `payment-receipt`/`utility-templates` (14). These
  should *agree* unless there is a reason, and where there is one it belongs in
  `notes`. That is a review job, not a deletion.

### The board spoke English to everyone who was not English

Reported from a screenshot with the interface set to Italian: the topic picker said
"Context", the tiles said "Emergency / Introductions / Directions", and the submenu
heading said "What is wrong". Every *phrase* on the board was translated — that is
the corpus, and it had been right all along — but the board's own chrome was not in
the catalogues at all. 54 keys existed in `en.json` and in no other file: 36
`boards.*` (eight board titles and the submenu headings under them) and 18 `board.*`
(the controls, the keypad, the status lines).

Six agents, seven to nine languages each, against a brief distilled from what the
board wave itself had already learned. **All 52 catalogues now carry all 54**, moving
each from 394/533 to 447/532 (84%). Italian end to end: "Argomento", then
"Emergenza | Presentazioni | Indicazioni | Spostarsi | Mangiare fuori | Acquisti |
Orari | Massaggi e spa", then "Che cosa non va". Klingon takes 392/532 and Quenya
135/532, both partial by design and both now recording in their own `_note` exactly
which keys they declined and why — `tlh` has no word for *massage* in the published
lexicon and no verb for *flash* that takes Latin letters as an object.

That brief is now `content/PROMPTS/interface-strings.md`, because the same eight
problems came back in six independent reports and the next wave should not rediscover
them: which of `t()` and `theirs.t()` a string is read through and therefore whether
it is a label or signage; reuse over translation, with the printed section title as
the arbiter when the two could disagree; the fact that `{count}` and `{language}` are
substituted raw and so cannot be made to agree with anything; and the way a heading
completed by its buttons ("Please focus on…" over *the shoulders*) simply cannot be
translated into a verb-final language without re-casting both halves.

### The checker could not see the keys it was being asked about

`check_i18n.mjs` scanned `ui/`, the root HTML and `data/presets.json`, and reported 75
keys as "in the catalogue but never referenced". It was wrong about 42 of them: board
titles and button labels are named by key from `data/boards/*.json`, which is the
whole mechanism that lets the chrome be read in the owner's language, and the scan
never opened those files. Adding them — and moving three keypad error keys out of a
ternary and into a table beside the `ENTRY_LABEL` one already there, so the existing
`…Key:` pattern can see them — takes the list from 75 to 33.

Which is what made the one real dead key findable. `boards.spa.comfort` is referenced
by nothing: not a board, not the UI, only `en.json`. Two agents flagged it
independently and translated it anyway, being unable to prove the negative from inside
their own slice. It is deleted from all 51 catalogues that had it. The remaining 33
are keys reached through a computed string, which is a different problem.

### Two things the reader could see

**The donate link was jammed against the right edge of a phone.** It is
`position: fixed` bottom-right on a desktop, and the mobile override made it static
but left it `display: inline-flex` — on which `margin: auto` does nothing, because an
inline-level box is not laid out by the block centring rule. `display: flex` plus
`inline-size: fit-content` centres it. Pinned by a test that checks the two gaps are
within a pixel of each other, on both the gallery and the sheet page, at 390px and at
360px — and that the desktop pill is still `position: fixed`. 25 lines of dead
`.page-footer` and duplicate `.donate` rules went with it.

**Every board message was one word wide.** `.board-message` is a `<button>`, and a
button's UA stylesheet sets `align-items: center`, which makes a stretch-sized child
shrink to max-content instead. So the paragraph inside was as wide as its longest
unbroken line, `lineRoom()` measured that instead of the box, and the fit test
compared a number with itself and always passed: Russian `Извините` drew 810px inside
a 368px card. `align-items: stretch` on the message; clearance went from −349px to
+27px.

### The Malay corpus disagreed with its own note

`data/lang/ms/emergency.csv` glossed *back* as **Punggung**. Kamus Dewan gives
*punggung* as "pantat, bokong, pinggul" and tags the dorsal sense **Id** —
Indonesian; the Malaysian word for the part of the body behind the chest is
*belakang*. The corpus already knew this: `data/lang/ms/hotel.csv:61` writes the spa
row as "Tolong urut **belakang** terutamanya" and its own `notes` cell says
"belakang, not punggung, which in Malaysian Malay is the buttocks". One row had
simply never been brought into line, and it is the row a traveller taps while
pointing at their own back in a clinic.

Now `Belakang`, with `build_ipa.py --only ms` deriving `bəlˈakaŋ` — the same string
the spa phrase already carried, which is the check that the fix is consistent rather
than merely different.

Found by the agent translating the Malay board chrome, which also reported that
`ms.json` leaks Indonesian in keys nobody has swept: `board.unit` says *Menit* while
the neighbouring `board.minutes` now says *Minit*, so two buttons in one widget
disagree; plus *Donasi*, *lembar*, *jaringan*, *setelan* and a `preview.duplexNote`
that is Indonesian end to end. That is a language job and goes to the next wave, not
into this commit.

## Batch L — the rest of the interface, and what the translators found

### 47 keys behind the menu, in fifty languages

What the ☰ menu on the board still said in English: "Edit buttons", "Settings", and
behind them two panels headed "Your own buttons" and "Your own phrases and settings".
Five families — `editor.*`, `personal.*`, `speaker.*`, `speech.*`, `settings.*` — and
unlike the board chrome of the previous batch these are not labels. They are the
privacy promise, the delete confirmation and the data-loss warning, which is why the
brief they were given names three of them as load-bearing and forbids softening:

> A translation that renders *"nothing is sent anywhere"* as *"your data is safe"* is
> a worse statement than the English, because it is the wording a service that *does*
> transmit would also use.

Fifty of the 52 catalogues now sit at **494/532 (93%)**, up from 447. Quenya is
partial by design and Klingon declines what its published lexicon cannot say.

**The session limit killed four of the six agents mid-flight**, which is worth
recording because the recovery was cheap and the reason it was cheap is a line in the
brief. Nothing was corrupted — four groups had already finished — and the agent that
died having fully drafted Amharic and Arabic had written its draft to disk as it went,
because the brief tells it to. That draft was handed to a review pass rather than
retranslated, and the review is what earned its keep:

- **Amharic `ቁልፍ` for "button"** — already spent. The corpus glosses
  `building-words.key` as ቁልፍ, and so do the hotel key-card and toilet-key rows, and
  `am.json`'s own `_note` uses it for "catalogue key". Exactly the hazard the brief
  names with the Greek πίνακας/πινακίδα pair. Now `አዝራር`.
- **Amharic wrote `ስክሪን` for "screen"** where the file already says `መስኮት` three
  times, and used the ፀ series in five keys where `am.json` uses ጸ sixty-four times
  and ፀ never.
- **Arabic `editor.confirmDeleteMany` used the 3–10 plural.** `ui/board-editor.js:167`
  only fires that string when the count is above one, so **two is the commonest case**
  and Arabic wants the dual there. Recast around an invariant head with the count in a
  parenthetical, which is that file's own documented dodge.
- **Arabic `speaker.unspecified` ended in a masculine imperative** — one gendered token
  in the one string whose entire job is not to assume the reader's gender.

The re-run used four agents of two or three languages each rather than six of eight to
ten. Smaller units are the lever, not lower concurrency: a limit then costs a fraction
of a group instead of most of a wave.

### The lock screen was asking 52 people to write a date

`preview.lockDate` and `preview.lockTime` are sample data drawn into the lock-screen
mock — "Monday 15 September" and the canonical 9:41 — and they were about to be handed
to 52 translators. They are not interface text. Every locale writes a date in its own
order and a clock in its own cycle, CLDR knows both, and asking for them by hand is 52
chances to put the month before the day in a language that does not, for no
information the platform was not already holding.

So `lockSample` in `ui/preview.js` derives both, and reuses `supports()` from
`core/quantity.js` rather than writing a second copy of the same refusal — because
`Intl` answers a tag it has never heard of in the *runtime's* language rather than
admitting it cannot, which would put an English date on a Klingon card. Japanese now
reads 9月15日月曜日, Finnish `maanantai 15. syyskuuta`, Korean `AM 9:41`; Klingon and
Quenya fall to the English in the catalogue, which stays as the floor.

### Half a message in the reader's language and half in English

`personal.refused` is a translated sentence — "Not loaded — nothing was changed:" —
concatenated with `got.problems.join('; ')`, and those problems are hard-coded English
in `core/personal.js`: `placement spa/main: not a list`, `phrase p1: needs a sentence
on both sides`. Seventeen of them.

Translating them would be wrong. They name keys and indices out of the reader's own
file and there is nothing in them a traveller can act on. But leaving them untagged is
also wrong, and visibly so in four of the languages this batch just finished: an
untagged Latin string full of brackets and colons reorders into nonsense in a Hebrew,
Arabic, Urdu or Persian interface, and a screen reader pronounces it with the wrong
phonology. They are now a `<span lang="en" dir="ltr">` under the translated sentence —
still English, but *saying* it is English.

The refusal path had no test at all, which is the half that matters: a reader who
cannot tell whether an import half-landed is worse off than one who was told it did
not. It has one now, and it checks that nothing landed as well as what was said.

### A note that said the work was done, and a CSV that said otherwise

`tlh.json`'s `_board_note` recorded five Klingon section titles as written. They were
never in `data/registry/section-titles/tlh.csv`, which had not changed since
`8137e9e9` — the note landed and the data edit did not. The gap survived because a
`_note` is prose that nothing checks against the file it describes, and because
nobody had reason to re-read it. Both halves exist now, and one of the five changed on
the way in: `accessibility` is `naw'`, TKD's noun for *access*, not the `vIHlaHmeH`
("in order to be able to move") the note had planned — two of that section's nine rows
are `jIQoylaHchu'be'` and `jIleghlaHchu'be'`, hearing and sight, which a purpose clause
about moving does not head.

The same pass narrowed a claim the note made too strongly. "Klingon has no attested
word for tax" is wrong — `{rup}` is in TKD. It is a *verb*; there is no noun for a tax
and none for a refund, which is the real reason `tax-refund` stays English, and now
the stated one.

### Quenya: 26 of 47, and the refusals are the deliverable

Quenya went 135/532 → 161/532 and the twenty-one omissions are sorted by *why*, which
is the part worth keeping. Most are a missing word — Late Quenya has `tecil` "pen" and
`sarmë` "writing" and no verb *to write*; `hep-` "save" is a reconstruction. But three
were refused for a better reason than absence:

- **`editor.removeHere` is indistinguishable from `editor.delete`** without a word for
  *screen*, and two buttons under one label is worse than one button in English.
- **`personal.forget` would be `á aucirë ilya`** — which is already `studio.allOff`,
  word for word. One turns print sections off; the other destroys everything the
  reader has written. The destructive one stays English.
- **`settings.*` would be `cilmë` "choice"**, already spent on `quick.optionsLabel`
  and `board.menu`.

Nineteen of the 43 section titles Quenya still lacks are sections with **no Quenya rows
at all**, where a heading would head an empty panel. Four more are collisions rather
than gaps: English has two names where Quenya has one — quick-responses would also be
`hanquentar`, trail-landmarks also `tengwar`.

And the audit corrected the catalogue's own note: `qya.json` listed `véra` among
twelve absent roots, but the adjective *véra* "personal, private, own" is attested
unmarked at PM/340.2707, and the whole `editor.*` family now turns on it.

### Prose left in English counts as translated, which is how a gap hides

Four sentences under `format.headSpanTitle` were sitting in English in **nineteen
catalogues that report 93% coverage**. They were not missing — they had been *copied*
from `en.json` rather than left absent, so every coverage count since has called them
done. Leaving a key out is visible; copying it is not.

`check_i18n.mjs` now reports any value byte-identical to English whose prose runs to
three words or more, and the threshold needs no allowlist to be right. Below it sit
every value that legitimately matches: the romanisation standards `ALA-LC` and
`BGN/PCGN`, French *Communication*, and a pattern like `{source} → {target}` with no
words in it at all. Above it, a sentence somebody meant to translate. The report finds
exactly the 76 and nothing else.

## Batch M — nine notes from using it

### The header says what is loaded, and is now how you change it

The topic's name and the pair were the two facts on the board's header, and the only
way to act on either was to leave: up to the topic list and back down, or out to the
gallery and start over. Both are controls now, and **they look exactly as they did** —
the test asserts the button's font, weight and colour against the heading's, because a
header that grows two more buttons is a header competing with the grid above which it
sits. An underline appears on hover, which is the pointer's own question rather than a
claim made at rest.

Splitting the pair took a trick worth recording. `t('board.pair')` renders
`{source} -> {target}`, and Urdu renders it `{source} <- {target}` — the order is the
catalogue's business. So `t` is asked for the sentence with two **control characters**
standing in for the names, and the result is split on them: `isolate` in `ui/i18n.js`
wraps an insert in FSI/PDI only when it contains a letter, so the two sentinels pass
through clean and land exactly where that language puts its halves.

The language list is fifty entries on a phone, which found a latent bug: the menu was
written for two items, given a `top` and no ceiling, and grew straight off the bottom
of the screen. It has a `max-block-size` now.

### Half speed, and a path that had never been pressed

The engine has had `RATES = { normal, slow }` since the keypad went in and **nothing
ever called it with `slow`**. A half-speed control sits beside Speak now, smaller, its
face a numeral that needs no catalogue and its accessible name a sentence that does.
The rate moved 0.7 to 0.5, because a button that names a number has to be that number.

Testing it needed the utterance stubbed as well as the voice list, and that is why it
had never been tested: `speak` assigns `utterance.voice = chosen`, and assigning a
plain object to a real `SpeechSynthesisUtterance` throws — so the existing test could
check the labels and nothing else. With a fake utterance class the two presses record
rate 1 and rate 0.5 on the same text.

### Eight thousand six hundred voices, and the alphabet picking between them

Reported as "the English voice sounds pretty weird — sort of a demonic whisper", and
the cause is countable. `spd-say -L` on this machine lists **8612 voices**, because
speech-dispatcher exposes every espeak *variant* as an entry of its own:
`English (America)`, then a hundred of `English (America)+Andrea`, `+croak`,
**`+whisper`**. All local, all matching `en` equally well, none flagged default — so
every term in the sort tied and the pick fell through to `name.localeCompare`, which
has no opinion about whether a voice sounds like a person.

A name containing a `+` now sorts behind one that does not. It costs nothing on a
platform without the convention: no name has one, every voice scores 0, and the order
is what it always was — which is the other half of the test.

And the reader can choose. `speak` has accepted a `voiceId` all along and no surface
ever supplied one; there is a picker now, per language, defaulting to the automatic
pick.

### Five things about the message screen, which were five fixed decisions

A fixed decision is wrong for somebody: a learner wants the pronunciation on screen, a
reader handing the phone to a stranger wants nothing on it but the sentence, a reader
whose device has no usable voice wants Speak gone rather than dead. So the owner's
wording, Speak-and-half-speed, and the turn control can each be switched off, and two
new lines switched on — how to say it in the reader's own letters, and the same in
IPA. The three that were always there default to on; the two new ones to off.

**The pronunciation rides with the phrase from the same row**, added in
`resolvePhrase` rather than looked up in the view, and that is what keeps it correct
under a speaker variant: `say` has already swapped the row for the reader's own gender
where that matters. Hebrew's "I am sick" is the case that proves it — the script is
identical for both genders and the romanisation and the IPA are not.

The separator between the three is a border between spans, not a pipe character in the
text. A pipe inside one element takes the direction of whatever it lands beside, and a
Hebrew gloss next to a Latin romanisation put it at the wrong end of the line.

### Smaller things

**The landing page** was a heading over a paragraph saying what the brand two lines
above already said. One sentence now, which moved the language grid **74px up** a
phone screen. The two old keys were retired rather than reworded, because changing the
English under 52 translations strands them silently — a new key leaves a visible gap
instead.

**Export left the cards.** They offer the two things you do next; exporting is what the
customise page's own header is for. Checked before removing: the card lightbox still
links to the quick page, so nothing was orphaned.

**On a phone the header keeps PNG and folds PDF away**, the reverse of the desktop.
Both are right: a PDF is what you print and printing happens at a desk, while the
export that is any use on a phone is the picture — it goes to the camera roll and can
be held up to a person. They swap emphasis too, or the header's only export would be
the one drawn as an afterthought.

### A board that cannot load now says so

`showFatal` prepends its box to `<body>`, which on every other page is a column that
grows. The board's body is a `100dvh` flex column, so the box became a fourth row and
squeezed the header, the grid and the controls into what was left: a short board under
a message, which reads as the board being broken in some new way rather than as the
board having failed to load. The board is removed first now, and the message — which
names the file and the status — has the page to itself.

This was found by causing it. Adding `ui/board-display.js` without rebuilding
`data/shell.json` left the module out of the precache, and the two offline board tests
went from passing to a thirty-second wait for a `.board-cell` that never came. The
symptom was a blank grid; the cause was one file returning 504; and the message that
would have said so was being squeezed off the screen by the board it was about.

That is not yet a demonstrated explanation of the reported blank grid, which did not
reproduce on a fresh profile against the live site. It is the same shape, and the
board will now name the file if it happens again.

## Case histories moved out of summary.md (2026-09-22)

This file's own header says `summary.md` describes the architecture as it is and
this file records how it got there, and that the two should not duplicate each
other. By September the summary carried a thousand lines that were plainly the
second kind -- how the twenty-sixth language came in, what the Hebrew translator
decided about vowels, which three defects a new test found on its first run. They
are moved here word for word rather than rewritten, so nothing a future agent might
need is lost, and `summary.md` is a third shorter and about the present tense.

### Twenty-six languages, and the procedure that got the last three there

`content/PROMPTS/add-a-language.md` is the addition procedure and the roadmap to
fifty. It exists because the first twenty-three additions each rediscovered some of
the same traps — the CRLF corpus, `make_todo.py` filtering notes out of its own todo,
`clean()` eating U+200C, a new IPA symbol costing every *other* reader a rule, the
`_frame` preposition that twenty-two of twenty-three languages rejected — and writing
them down once is cheaper than twenty-seven more agents finding them.

**Bengali, Urdu and Polish came in as the twenty-fourth, fifth and sixth**, and how
they came in is the part worth recording: all three agents were killed mid-flight by a
rate limit, and **all three packs survived** — 824, 820 and 827 rows, every one with
provenance, plus 188 lines of Urdu findings. The briefs required writing findings and
output to disk as the work happened rather than reporting at the end, and that is the
whole reason there was anything to pick up. What was lost was the *cheap* part: three
sets of registry rows, which a Sonnet agent then wrote in one pass.

**Urdu's script question was settled by a crash, not a preference.** Nastaliq is a
style rather than a script — ISO 15924 calls it `Aran` — and Noto Nastaliq Urdu is a
separate face with a much taller line box, so the roadmap flagged this as the batch's
real decision. The answer is that **fontkit throws on Noto Nastaliq Urdu for 84 of 86
real Urdu rows**, in both copies of the shaper this project uses: the one
`core/measure.js` measures with and the one `render/pdf.js` hands to pdf-lib. So Urdu
reuses the `arabic` stack at Naskh with `script: Arab`, which is also what most Urdu on
phones and signage is set in. Its extra letters `ٹ ڈ ڑ ھ ں ے` were already in the
shipped subset, as Persian's four had been.

**Bengali is the first new script since Hebrew**, `Beng` at a measured 1.45 leading
against Devanagari's — its vowel signs go on all four sides of a consonant, including
the two-part ো and ৌ that wrap around it, so the block is subset whole rather than by
the letters the corpus happens to use today. It also demonstrated the trap its own
procedure names: adding Bengali as a *target* grew the Hindi reader's respelling
charset past what the `deva` subset shipped, and `tests/fonts.test.mjs` caught it.

**Polish's `_frame` and its language names are the same grammar problem twice.** Its
frame `Nie mówię {target}` has no `po` built into it, so every one of its twenty-six
subjects needed a hand-written `po X-u` adverbial in `language-names.csv` — a real
defect that no amount of ICU data reveals, because ICU's nominative is correct and
still ungrammatical in the slot. Bengali's frame went the other way and took
apposition, counted rather than defaulted: of 57 region names, 34 take the locative
`-এ` as a plain vowel sign, 15 need an inserted glide য়, and 8 need a different
syllable `-তে` — so **23 of 57 do not take the suffix's own shape at all**, which is
Hungarian's and Turkish's problem rather than Hebrew's.

**Two silent defects surfaced in the existing tables**, both of the same shape: a
sequence whose halves each have a rule, so `--gaps` cannot see it. The Hindi reader had
no rule for `ʋ`, which 81 Urdu rows needed, and **no rule for any aspirated stop** —
`dʰ bʰ ɡʰ ɖʰ cʰ ʈʰ qʰ tʃʰ ɟʰ` — so ধন্যবাদ came back as দ-ন্য়-ভাদ with the
aspiration quietly dropped, because `d` and `ʰ` both matched individually. Five tables
carry those nine phonemes and four do not, which makes it a corpus inconsistency
rather than one table's bug.

And one gap the validator caught exactly as designed, in words worth quoting: the
złoty was "scoped to pl but has no gloss in ar, bn, de, …, so it prints on **0 of its
25 pairs**". A scoped concept still needs a gloss wherever it is the *source*, and 47
rows later it prints on 23 of 25 — the two short ones being the packs that are short
everywhere.

**Tamil and Ukrainian came in as the twenty-seventh and eighth**, and each proved a
different thing.

**Tamil's script refuses to say what the sound is, so the `ipa` column is the only
column in the row that knows.** Tamil writes one letter per place of articulation and
lets position decide voicing: `pōkalām` is read [poːɡalaːm] and `paṭu` is [paɖu], and
neither `text` nor `romanization_iso15919` can carry that. So espeak was chosen *for*
the ambiguity rather than in spite of it — its `ta` voice implements the positional
rule, probed across all four environments (word-initial voiceless, intervocalic voiced,
geminate voiceless, post-nasal voiced) before being trusted. That plus a shallow
orthography with no schwa deletion is why `GRADE["ta"]` is **B+**, the best Indic grade
in the file against Hindi's and Bengali's C.

**The mirror problem is that a Tamil *reader* has to spell aspiration its own alphabet
does not distinguish.** Hindi, Bengali and Urdu are full of `k kʰ ɡ ɡʰ`, and the bare
alphabet merges all four onto க — seven-to-one once /x q ɣ/ arrive. The answer is the
published Sanskrit-in-Tamil notation, `ப` pa / `ப²` pha / `ப³` ba / `ப⁴` bha, and the
*fonts* confirm it independently: Noto Sans and Serif Tamil each carry exactly `² ³ ⁴`
and `₂ ₃ ₄` out of the whole Superscripts block, six codepoints that are precisely the
two written forms of this notation and nothing else. Read as features rather than as
letters — ² breath, ³ voice, ⁴ both — it extends to the sibilants at no glyph cost.
Tamil's own gemination device was rejected on a measurement: it collides with the 243
real `Cː` sequences Italian, Japanese, Hindi and Arabic already carry, so /t/ and /tː/
would spell identically.

`Taml` came in at a measured 1.40 leading and a `min_size_pt` of 5.0, and both numbers
were argued against the alternative rather than picked. Bengali's 1.45 and Devanagari's
1.35 were rejected **on mechanism, not on number**: those scripts stack, and modern
Tamil has two conjuncts in the whole orthography and no vertical mark stack — its
extenders run sideways, which is `measure.js`'s problem and not the line box's. The
floor was set by the closest confusable pair in the script, க against க் — letter
against letter-plus-pulli — whose distinguishing contour is 0.134em, larger than
Devanagari's nuqta and 1.8× Hebrew's hiriq; 5.4 was rejected for giving the *least*
confusable non-Latin script here the same floor as the most confusable one. The Tamil
digits `௦–௯` were deliberately left out, Hindi's answer rather than Bengali's, because
ASCII has supplanted them in Tamil education and government while Bengali's `০–৯` are
still on live price boards.

**Ukrainian's reader table is Russian's structural sibling and diverges in exactly the
four places its own script forces a different answer** — the и/і split for /ɪ/ against
/i/, a genuine three-way г/ґ/х (Ukrainian г is a fricative where Russian's is a stop),
в carrying v/ʋ/w as one letter, and no ё/ы/э/ъ. Building it turned up an **espeak
dictionary defect**: шв- comes back as /ɬβ/, and /ɬ/ is not a Ukrainian sound at all —
it is the Klingon lateral, and it would have printed a bare IPA letter on Polish's
table.

**Both took apposition for the `_frame`, which is now twenty-six of twenty-eight, and
both counted rather than defaulted.** Ukrainian's count: of ICU's 58 region names,
roughly 39 are feminine nouns whose locative is mechanical, 12 are masculine nouns
whose locative alternates between `-і` and `-у` *lexically* (Ірані but Іраку), 4 do not
decline at all (Чилі, Перу, Марокко, Сан-Марино), and Єгипет has a fleeting vowel on
top of the ending — so about 19 of 58 cannot be derived from the nominative at all,
before reaching the fact that `emergencyNote` never sees the name. Tamil's is sharper
still: its locative has five surface shapes over 60 names, 35 of which do not take
`-இல்`'s own form, and **even the 25 that do are not concatenation** — the final
consonant's pulli has to be deleted first, which no substitution frame can do. Hindi's
and Urdu's escape, a separate-word postposition, does not exist in Tamil.

Three defects came out of this batch, all of the same family — something that is
internally consistent and still wrong.

- **A scope names the *target*, so a pack needs a gloss for every scoped concept it is
  not in.** This is the złoty's bug read from the other end, and Ukrainian shipped
  fifty-two of them empty: every foreign currency, the four Chinese classifier rows,
  and the three tropical-disease rows. The reasoning that produced the gap was "Ukraine
  is temperate and does not use the baht" — true, and beside the point, because
  `pharmacy-symptoms.i-think-i-have-malaria` is scoped to the countries *being
  visited*. The hryvnia then needed the same fifty rows in the opposite direction, each
  derived from the wording that pack had already chosen for the zloty's symbol.
- **`espeakng-loader` is not a settling tool.** Ukrainian has no voice in this
  machine's espeak-ng 1.50 — it landed upstream in 1.52 — so its column is built
  against a newer library pointed at by two environment variables. Leaving those set
  while rebuilding the other twenty-four languages is not a rebuild, it is a different
  phonemiser: about 320 cells moved, Russian worst and German most legibly, where
  `Frühstück` reads frˈyːʃtʏk under the newer library and frˈyːʃtyk under 1.50.
  Nothing close to the change caught it — `build_ipa.py --check` was clean, because a
  re-derived column is internally consistent, and it is only wrong against the grade a
  reviewer gave it. **`tests/fonts.test.mjs` caught it, on the second-order
  consequence**: /ʏ/ is a symbol only five of the twenty-eight reader tables have a
  rule for, so it fell through as a literal and six scripts were asked to draw a letter
  they do not have. Rebuilding the same twenty-four with the system library restored
  every one byte-for-byte, which is also what proved the revert complete.

  Worth keeping separately: **the newer library is the more accurate one here.**
  `Frühstück` really is [ˈfʁyːʃtʏk] with a lax second vowel, so the shipped German
  column writes /y/ where the language has /ʏ/. Fixing that is a deliberate pass of its
  own — 320 cells re-derived, twenty-two reader tables each gaining a rule modelled on
  their own `y`, and German regraded — and not something to fold into a language
  addition, which is why it is written down here rather than done.
- **Two shared files were being written by two agents at once.** The Tamil agent edited
  the registry directly while the Ukrainian one staged its rows, and nothing was lost
  only because both *appended*. The rule now in the procedure file is the general one:
  edit a shared file in place and append, and never regenerate it from a script that
  rewrites the whole thing, because the result is still a valid file and the validator
  will not notice.

Two smaller things closed on the way. `language-names.csv` had twelve blank
romanization cells left behind by the Persian, Bengali, Polish and Urdu additions, and
`ru,bn`/`ru,fa` were missing the prepositional name their frame needs — a blank cell
there blanks a whole printed line, so the file is now at zero across all sixteen
romanising locales. And the Hindi reader gained three `ɳ` rules: /ɳ/ occurs only in
Hindi's own column, so Hindi's table had never been asked for it, and Tamil arrived
with 185 cells of it.

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
318 of 827 concepts and Quenya 206, because the bank is pharmacy symptoms and ATM
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

**Quenya names all forty-nine, and every name is a coinage rather than a
transcription.** "Transcribe rather than coin" was never on offer, and the reason is
sharper than "no source": the Quenya reader table deliberately spells /b d ɡ/ as
`b d g` and says of `thl` that it "is not a possible Quenya cluster", which is right
for a *respelling* and fatal for a name, because Quenya's orthography has none of
those letters. The obvious repair is worse — the CSUR block does have ando, anga and
thúle, but **in the classical mode those spell `nd`, `ng` and `s`**, so borrowing
their general-use values would make `Deutsch` read as `ndooty`. A mode is a mapping
and half a mapping is not a transcription.

So each row reads `<adapted endonym> lambë`, which is the construction the Klingon
rows already use with `Hol`, and it puts the invention in one place. `lambë` is
attested for "language, tongue, dialect" (WJ/394) and is the word Tolkien reserves
for the speech *of a particular country or people*, so the head noun is given rather
than coined; the stem is the only coined element per row. Each stem is the language's
own endonym read through Quenya's own sound laws instead of through English spelling
— \*b > `v` (√BAL > *Vala*), initial \*d > `l`, medial \*ð > `l` (*Elda* against S.
*Edhel*), /kr/ > `hr` on Tolkien's own *Hristo* for *Christus*, medial `sp` > `ps`,
/ʃ ʒ z θ/ > `s`, and a final consonant dentalised because Quenya ends a word in
l n r s t and nothing else. Thirteen arrive all but unchanged — `Nihon`, `Suomi`,
`Hindi`, `Tamil`, `Hayeren`, `Fársi`, `Melayu`, `Hausa`, `Filipino`, `Indonesia`,
`Rossia`, `Cartuli`, `Castellano`. **Five had to give the endonym up altogether**,
because its cluster has no Quenya resolution that leaves the word recognisable and
the pack's own rules forbid inventing an epenthesis to break one: `English` (`ngl`)
is `Alvion` after Albion, `Polska` (`lsk`) is `Polonia`, `Nederlands` (`rl`) is
`Hollanda`, `Svenska` (initial `sv`, then `nsk`) is `Suecia`, and Khmer's own
`khmae` — an onset Quenya cannot begin a word with at all — is `Cambolia`. `Quenya`
itself takes no `lambë`, being already the attested name of the language.

`languageName` needed the same fix, and it is what keeps a *missing* row from being
papered over. It fell through to `Intl.DisplayNames`, and for a
locale ICU has no display data *for* — `tlh` and `qya` are CLDR subjects and neither
is a display locale — that answers in **English**, which is how English in Latin
letters was going to arrive inside a tengwar cell. It now returns nothing for such a
locale and `fillLanguageSlots` blanks the cell, which is the rule its own comment
already made for `ipa`. `scripts/build_ipa.py` had refused that fallback all along and
says so at length; **the two disagreeing was the defect**, and the renderer is now in
line with the pipeline. It remains the rule that catches a *missing* row, and the
invariant `write_names` states — "the file never grows a row of five empty cells" —
is now met from the other side: all fifty `qya` rows carry a name, a romanisation and
an `ipa`.

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

**`speak_label` is the third cell in that row and the last one that was still Latin.**
It is not chrome, which was the argument for leaving it romanised: it labels no
control, it is one cell per language holding that language's own words for "I speak",
and `renderSpeakCollage` draws it in the same `.reader-picker` div as the `endonym`
above it — so `jIjatlh` and `quetin` were the only two of fifty printed in an
alphabet their own row had otherwise left behind. Both are now `speak_label_roman`
plus a derived native cell, `ROW_TABLES` has the fourth entry that re-derives them,
and the mode is the same classical mode the endonym commits to: `quetin` is quesse
with the e-tehta, tinco with the i-tehta and a bare númen, U+E003 U+E046 U+E000
U+E044 U+E010, which is the tehta-on-the-preceding-consonant reading that gives
`Quenya` its own five codepoints. `data/i18n/{tlh,qya}.json` stays romanised, and so
does `gallery.wantLabel`, because those really are the controls a reader operates.

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
`ʰ`, which the other eighteen all map to nothing. All twenty-three readers are at zero
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

### Persian, and the script it shares with a language it is not

Persian (`fa`) is the twenty-third language and the **third right-to-left** one, and
unlike either of the first two it shares a *script* with a language already in the
corpus while differing from it substantially. That overlap is the whole of what is
interesting about it, and almost every decision came out the opposite way from the one
a reading of the Arabic pack would predict.

**The four letters Arabic does not have cost nothing, and the reason is that
`ARABIC_RANGES` is not a corpus union.** `subset_fonts.py` gives the `arabic` stack the
whole of U+0600–06FF, U+0750–077F, U+08A0–08FF and both presentation-forms blocks
unconditionally, with the corpus added *on top* rather than instead — so `پ چ ژ گ`,
Persian's `ی` U+06CC and `ک` U+06A9, and the Eastern Arabic-Indic digits U+06F0–06F9
were all already in the shipped faces. Verified against the cmaps of `arabic-400.ttf`
**and** `arabic-700.ttf`, which is the intersection `validate_data.py` checks, and then
proved by the build: **both Arabic faces came back byte-identical at 2,823 glyphs.**
The Arabic *reader table* had in fact been emitting `پ چ ژ گ ڤ` for two language
generations, which `tests/fonts.test.mjs` already said in a comment. The real font cost
of the twenty-third language is **one Korean syllable** — `랼`, outside KS X 1001, from
the French gloss of the new `numbers-money.toman` concept, so from a *currency* rather
than from Persian's script.

**`Arab` is reused rather than given a Perso-Arabic row of its own, and the measurement
is why.** `direction`, `needs_shaping`, `word_break` and `font_stack` are the same claim
for both. The two that could differ were measured with the same method that produced
Hebrew's recorded 1.149em: over the letter repertoire in all four positional forms,
Arabic spans 1.3610em/1.4390em against Persian's **1.3340em/1.3700em**, and the cause is
exactly the codepoint difference — Arabic's floor is `ي` U+064A isolated, whose deep
tail carries *two dots below*, where Persian's `ی` U+06CC has none, so Persian's floor
is `ج`. **The ی/ک substitution is worth 2.0% of the line box in the regular face and
4.8% in the bold**, always in Persian's favour, so a row of its own could only carry a
smaller number than the 1.30 both already sit under. `min_size_pt` is 5.4, the same as
Arabic, arrived at from a different feature: Persian's finest distinction is the
**three-dot cluster** that separates `پ` from `ب`, and the gap between two adjacent dots
in it is 0.037em = **0.200pt at 5.4pt**, exactly the ink this paper holds. And ISO 15924
has no code to use — `Arab` covers the Perso-Arabic form and `Aran` is the Nastaliq
*style*, which this project does not typeset.

**The short vowels go the other way from Hebrew, and that is the decision the pack
turns on.** Hebrew earns a pointed `text_alt` because pointing is a second orthography
an Israeli meets in children's books, dictionaries and a newspaper's partial pointing.
Persian vocalisation is not that: outside a first-grade primer and a dictionary's
pronunciation bracket, no Iranian sees a vocalised Persian sentence, so a pointed column
would be a picture of something that does not exist. There is also much less to write —
Persian spells /ɑ i u/ with ا ی و, so only /a e o/ are missing — and the column a
learner actually needs is already there, because BGN's own Note 6 makes the
romanisation write the ezāfe. So `text_alt` is spent the way Arabic and Portuguese spend
it, on the **colloquial Tehrani** form (`آن‌ها`/`اون‌ها`, `نمی‌دانم`/`نمی‌دونم`,
`چند است؟`/`چنده؟`), and `script_alt` in `languages.csv` stays empty because a register
is not a script.

**What *is* pointed is two marks, each fixing something unrecoverable.** The **ezāfe
kasra** is written on every row that needs one, because the linking /e/ is in neither
the script nor espeak's output — `آب معدنی` comes back `ɑb maʔdani` where Persian says
*āb-e ma‘dani* — and one character fixes the `ipa` column, all twenty-two readers'
respellings and the agreement with the romanisation at once. And a **damma or a tashdid
on the three words where the unpointed spelling is two words and espeak takes the
wrong one**: `خُرد` against `خِرَد`, `مسکّن` (painkiller) against `مسکن` (housing) —
which is a safety row — and `دِنگی` against *dongi*.

**espeak has a Persian voice and it is much better than the Arabic one, for a
structural reason.** `GRADE["fa"]` is **B+** against Arabic's D, because Persian writes
its three "long" vowels with letters, so the vowels Arabic leaves to a guess are on the
page and only /a e o/ are unwritten — right in all fifty of a probe chosen for exactly
that ambiguity. Two artefacts are repaired: espeak writes Persian's one voiced uvular
as the two characters **`q1`**, which refused every row containing ق or غ, and it writes
a spelling-driven length mark on vowels Persian does not distinguish. `q1` becomes `q`
rather than `ɢ` deliberately: **Persian adds no new IPA symbol to the corpus at all**, so
no other reader table needed a rule, where `ɢ` would have cost twenty-two edits — the
lesson Klingon's /ɬ/ taught. **Stress is not written**, and that is a decision: Persian
stress is rule-governed rather than lexical, espeak places it in the *opposite*
direction from the rule (`kˈetɑb` for *ketā́b*), and deriving it the way `hu_stress`
does is impossible because the rule runs one way for nominals and the other for verbs.
Persian vowels do not reduce, so an unmarked respelling stays intelligible — the trade
Russian could not have made.

**The reader table is the Arabic table with its hardest argument deleted and its
tightest constraint lifted.** `fa__fa-IR.json` reaches zero gaps over 16,854 rows. The
whole longest `deviations` entry in `ar__ar-MSA.json` — ar.wikipedia's policy walling
`پ چ ژ گ ڤ` off inside parentheses, the region-gating the survey leaves unverified, the
counted cost of every plain-letter fallback — is about letters **Persian already owns**,
and `ڤ` is not needed because Persian `و` *is* /v/. So **the legend has nothing to
teach**: it says only that the marks are written on purpose. And the vowel ceiling the
Arabic entry records as unliftable is lifted, because Persian's harakat are /a e o/
rather than /a i u/ and it has three mad letters as well: all six of the corpus's basic
qualities are writable, *merci* is `مِرْسِی` rather than Arabic's `مِرْسِي`, and English
*sit* does not merge with *set*. Persian also needs **one** hamza seat where Arabic
chooses between five, because Persian writes its word-internal hamza on `ی` whatever
surrounds it (`سوئد`, `تئاتر`, `مسئله`), and writes a bare alef word-initially where
Arabic writes `أ` and `إ`. What Arabic's reasoning it *keeps* is the empty
`syllable_separator` — Persian is cursive and a hyphen or a thin space breaks the join
identically, which is what makes Hebrew's hyphen the exception rather than the rule —
and `stress: none`, for Arabic's bidi reason plus a third one: Persian dictionaries do
not mark stress either, so there is nothing to borrow.

**The emergency frame is the second one in twenty-three that takes a preposition, and
for a different reason from the first.** Hebrew's `ב{region}:` works because its
preposition is one letter whose vowel is unwritten. Persian's **`در {region}:`** is a
whole written word and works anyway, because Persian has no definite article and does
not oblique-mark or case-mark a proper noun — which is Hindi's reason with a
*pre*position instead of a postposition. Right for all 55 region names, compounds
included. The two escapes are therefore disjoint, and a future translator has to check
which one their language has.

**The digit rule binds Persian and Hebrew's escape from it does not.** `str.isdigit()`
is true of U+06F0–06F9, and Iran writes every price board and platform number in
`۰۱۲۳۴۵۶۷۸۹` where Israel writes 0–9 as Europe does — so where Hebrew's number rows
carry the *word*, Persian takes Arabic's answer exactly: **0–9 carry the numeral in
`text`**, which the one-digit rule permits and which is the most useful thing on an
Iranian card, and 10 and up carry the word with the numeral in `text_alt`. espeak reads
`۵` as *panj*, so the `ipa` follows for free. The four notes and the `lakh`/`crore`
glosses spell every number out, because a note is prose and two adjacent digits in it
would reverse.

**Two currency concepts, and the second is the expensive thing to get wrong.**
`numbers-money.rial` is a named row like the shekel, because Iran is one country with
one currency — and it is the second currency in the bank with **no symbol row**, for a
new reason: Iran prints no currency sign at all, so U+FDFC would teach a Saudi and
Yemeni convention nobody uses there. `numbers-money.toman` takes its place, at 0.795
against 0.740 for every symbol row, because Iranian notes are denominated in rial while
every shop, taxi and menu quotes in **toman** at ten rial to one: read it wrong and you
pay ten times. It is a `num` row so its reader side is the equivalence `10 rial`,
exactly as `numbers-money.lakh`'s is `100,000` — no prose to compose in twenty
languages, and Arabic and Hebrew spell the numeral out while the three CJK glosses use
native numerals, because an Arabic digit is a character the Pinyin, Hepburn and RR
routes have no reading for.

**Three scopes widened on the evidence rather than on the pattern.**
`communication.please-write-it-in-roman-letters` takes `fa` because Persian is exactly
what that scope names, an abjad a traveller cannot sound out. Both malaria rows take it
because Iran is **not** WHO-certified malaria-free — a 2022 resurgence reset the
four-year clock and it is in the E-2025 group, with residual transmission in the
south-east. And `i-think-i-have-dengue` takes it on the strongest evidence of the
three: **Iran reported its first autochthonous dengue transmission in June 2024** (WHO
DON 2024-DON526, Hormozgan), which is newer than any of the six packs already in that
scope.

**One bug found and fixed outside the pack, and it was silent.** `clean()` in
`scripts/build_ipa.py` keeps characters whose Unicode category starts with L, M or N,
and the **zero-width non-joiner is Cf**. In Perso-Arabic the ZWNJ is not punctuation
but a letter-level part of the spelling — the نیم‌فاصله the Academy prescribes before
`می`, `ها` and the enclitics — so stripping it handed espeak a different word:
`بچه‌ام` (*bachche-am*, "my child") became `بچهام` and came back `batʃhɑm`. Wrong on
195 rows, `lost-rescue.my-child-is-missing` among them. U+200C is now kept and U+200D
deliberately is not, because nothing in the corpus uses it; verified to move no other
language, since `fa` is the only pack that contains one.


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

### A header and a footer, and a band that is a tab

`RunningHead.at` was `'none' | 'top' | 'bottom'`, which made a header and a footer
mutually exclusive for no reason but the shape of the type — and a folio at the foot
with the emergency number at the head is an obvious thing to want. **Position is which
field the band sits in, not a value inside it**, so `spec.head` is the top band and
`spec.foot` the bottom one, each absent when it is off. `headBands` migrates the old
form, keyed on `at`: the new shape has no such field, so its presence identifies the
old one exactly, and an `at: 'bottom'` becomes the foot rather than a header nobody
asked for. `contentBox`'s third argument stopped being a signed number and became two
heights, which cost one call site — every other caller omits it.

`span` gives a band a fourth choice beside its three positions: `full` spreads them
across the width as a running head normally is, and `left`, `center` or `right`
gather all three into one edge for a reader who wants a tab rather than a rule across
the face. The distinction is where the content sits, not how tall the band is — a tab
still costs its line, because the columns above or below it end where they end.

`colour` names a theme key for a whole band, which is a different question from
emphasis: "make the emergency number red" is not "make it bold". Where it is set the
band takes that colour and emphasis is left to the weight; where it is not, the
existing rule holds and an emphasised part is promoted from muted to ink, because a
bold grey number at 5.2pt is not much louder than a plain one.

**The wonky bullet spacing had a specific cause.** `measurer.width` drops a trailing
space, so a space at a join has to sit on the *leading* side of the part that follows
it — that was already known and already handled by shifting spaces forward. What was
not handled is that the emergency slot's own parts already end in spaces: its regex
captures the digits *and* the run after them, so `"police "` is one part. Shifting
that space onto a separator carrying its own leading space produced `"  •"` — two
spaces before the bullet and one after — on some joins and not others, depending
entirely on whether the slot to the left happened to end in whitespace. So the spaces
are **normalised** rather than shifted, collapsed to exactly one wherever either side
had any, which makes every join identical whatever meets there. A separator also
cannot ask for the space on its right by carrying it, since that space would be
trailing and would not measure, so `spaceParts` states that rule rather than encoding
it in the string.

The folio that arrives pre-ticked moved with all this. It used to be carried by the
odd idiom of an `at: 'none'` band that still held slots — off, but remembering what it
would say — and with two independent bands the off state is simply absence, so the
memory is `headControl`'s own seed.

### Three panel controls that did not say what they did

Small, and all three were the same failure: a control whose meaning was in `title` and
`aria-label`, reaching a screen reader and a patient hover and nobody else.

**The custom colour swatches were six bare squares.** The one thing a reader needs to
know there is which of the five section roles they are about to change, and the names
already existed — the same strings the theme and ink-mode glyphs are labelled from.
Two columns rather than a row of six, because the names are words and a six-across row
of "Getting around" and "Places and time" wraps into rubble in a 260px panel.

**The flag wash read the registry's first two countries unconditionally**, so a Spanish
card was always Spain and Mexico and an Arabic one always Saudi Arabia and Egypt,
however far from either you were standing. `background.flagRegions` is the reader's
choice, defaulting to those two, and for the eight-country languages it is a decision
only they can make. Toggles rather than a menu, because more than one is the
interesting case and the wash blends them; and the swatch is the flag's own colours
rather than its emoji, both because regional-indicator pairs do not render on Windows
and because here the colours *are* the setting. The background strength slider gained
the visible caption its neighbour already had.

**The export-resolution glyph was a grid of dots** whose step shrank with the dpi — so
at 600 the step was 2 and the dot 1, and it read as a single field of grey rather than
as a fine grain. It is a checkerboard now, which covers half its area at every
density, so the three glyphs differ only in cell size, which is the one thing they are
meant to say. It is also the idiom every image editor uses for the same quantity.

### Give back paper the glue cannot fill

Quenya arrived with 206 rows and printed on four faces at the full nominal 1.00 with
**every one of its sixteen columns carrying 82 to 137pt of slack** — 1971pt in total,
five and a half columns of blank card, and the bottom third of every face empty. Every
other pack measured zero to 65pt.

That is not the airiness `AUTO_SCALE_MAX` hands to the glue on purpose. The per-gap
ceilings exist so leftover space cannot open a canyon, and with thirteen rows to a
column there are not enough gaps: `13 × MAX_STRETCH_ROW` is about a third of what there
was to absorb. The face-count rule had only half of what it needed — it gave up a pair
when the paper was *free*, and never when the paper was merely *empty*.

Two ratios, and each blocks a different mistake. `BLANK_GIVEBACK` is a quarter of the
card, and without it a dense sheet sheds paper it is using: `es ← en` at eight faces
fits six at better than three quarters of its scale. `KEEP_GIVEBACK` is three quarters
of the type, and without it a merely thin sheet sheds paper it should keep: an Arabic
sheet read by a Quenya reader fits one pair less only at 0.45 against 1.00, which is
half the type for half the paper and the wrong way round. Ratios rather than lengths,
so neither depends on the page size or the column count, and each states a sentence.

Measured over every pair: the rule moves **only the Quenya ones**, 4 faces to 2, none
takes a pair, and `qya ← en` goes from 34% blank at 1.00 to zero residual at 0.77 with
ink reaching 98% down the face.


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


## Batch N — a stale page, a summary a third shorter, and a rule the checker can hold

### `Cannot read properties of null (reading 'replaceChildren')`, on some pairs only

Reported from the studio on a desktop, Bengali to Swahili: an error over a page whose
header, panels and tree had all drawn, whose status line said twelve pages, whose
canvas still said "arranging your sheet", and whose tree rows had checkboxes and
pencils and **no labels**. It did not reproduce locally on a fresh profile, nor
against the live site on a fresh profile, with the same pair.

The blank labels are what placed it. `createTree` inserts the row skeletons first,
then calls `createSectionPicker`, whose first act is `root.replaceChildren(...)` on
`#section-picker`, and only after that does the label fill run. So the crash sat
between skeleton and fill — and `#section-picker` was added to `customize.html` on
2026-09-15 (`cb68543e`). The page that was running had been cached before that date;
the modules it loaded had not.

How a page can be older than its own modules: `caches.match` searches every cache,
the pack cache outlives a deploy on purpose, and an earlier worker keyed pages by
their full URL — so each pair first opened before the fifteenth carried a
`customize.html?target=…` of its own, sitting where no deploy replaced it, and got
it back under this week's JavaScript. Pairs opened since had no such copy. That is
the pair-dependence.

The fix is a rule, not a guard. **A navigation is answered from the version-scoped
shell cache alone**; every other request may still be looked up across both. A page
and its modules from the same shell agree by construction, and a miss falls to the
network. Pinned by a test that plants a stale `customize.html?…` in `plg-packs`,
navigates, and asserts the page served has `#section-picker` in it.

### `summary.md` was carrying a thousand lines of the other file's job

The log's own header states the convention: *`summary.md` stays a description of the
architecture as it actually is; this file is the running account of getting there,
and the two should not duplicate each other.* By September the summary had 221KB,
and its "Themes and accessibility" section alone ran 1,045 lines under thirteen
sub-headings, seven of which were language case histories — how the twenty-sixth
language came in, where the Hebrew translator put the vowels, why Persian is not
Arabic — and five sub-headings under "Testing" narrated a fix.

They are **moved, not rewritten**: 1,094 lines to this file, word for word, so no
decision a future agent might need is lost and nothing had to be paraphrased to be
kept. Four card-layout subsections that had also been filed under "Themes" now sit
beside "Pages" as "Details of the printed face". The summary is 2,172 lines and
144KB, a third shorter, and every `###` still sits under a `##`. One reference had to
follow the text: `add-a-language.md` sent readers to the `_frame` discussion "in
`summary.md`", which is now the Hebrew and Persian histories here.

What remains is dense description rather than narrative — the "used to be" markers
left are two per section at most — so a further cut would be an editorial judgement
about depth rather than a separation of concerns, and that is a decision for the
owner of the document. `content/PROPOSED-CONCEPTS.md` was checked and left: it strikes
through proposals as they ship (eleven of its first thirteen), so it is a live backlog
with its own lifecycle, not a record of experiments.

### Fifty-eight English grammar notes printed where a translation belonged

The `literal` column prints, when a reader switches it on. Croatian shipped
`building-help.i-am-lost` as `Izgubio sam se` with the literal
`man speaking / woman speaking` — a note about a gender distinction that
`variants.csv` already handles, printed on the card in place of a back-translation.
Fifty-eight such cells across hr, ro, pt and mr, and the rule that finds them had to
be made exact before it was safe: *the literal is nothing but gender vocabulary, a
variant row exists for the concept, and the text itself has no slash.* The last
clause is what spares the three rows where the literal is doing real work because the
text shows both forms (`ผม/ดิฉัน`). Cleared mechanically — the change touches no
`text`, `ipa` or romanisation, so no rebuild — on the seventeen files `csv.writer`
reproduces byte for byte, which is all of them.

### The pronunciation line said "your own letters" and showed pinyin

Found by a translator, not a test. Asked to render `display.roman` -- "How to say it,
in your own letters" -- the he/ja/ko group traced the toggle to the code and found it
read the `romanization_*` column: always Latin, so for eight of its thirteen
languages the English was simply false, and it reworded the key as "in Latin letters"
to match. That was the right reading of the wrong code. The card has always answered
this question with its `say` column, the owner-orthography respelling from
`core/respell.js`: katakana for a Japanese reader learning Swahili, Bengali letters
for a Bengali one, `ching` rather than `qǐng` for an English one. The board now builds
the same respeller the sheet does -- the reader's rule table keyed on language *and*
accent, bound to the listener's whole `ipa` column, curated sheet first -- and hands
it to `resolvePhrase` as a hook, so the variant-merged IPA is what gets respelled. The
English stays as it was, because it is now true; the thirteen "Latin" wordings were
sent back to the agent that wrote them.

## Batch O — three corpus defects the translators had named, closed

### A woman's card no longer makes her do grammar at a counter

Twenty-eight base rows in cs, el and hr carried both genders with a slash —
`Ztratil jsem se / ztratila jsem se` — although `variants.csv` already held the
feminine for every one of them, so the reader who had set her profile got the clean
row and everyone else got the slash. Every variant was checked to carry the full
feminine sentence with its own IPA before the base was cut to the masculine, which is
the unmarked citation form and the declared default. Rows where the slash separates two
genuinely different words (`já / mě`) and rows about a *third* party's gender were left
exactly as the convention says they must be.

### Ten Hebrew rows that were right on the page and wrong out loud

Hebrew does not write its vowels, so `אני חולה` is the same string for a man and a
woman and nothing looked wrong. Its vocalised `text_alt`, its romanisation `ani ẖole`
and its IPA `anˈi xolˈe` were all masculine, and the card taught a woman to say the
wrong thing while showing her the right one. The sweep found **ten** such rows, not one:
`חולה` and nine `רוצה` "I want" rows — the police report, the embassy, the lawyer, "I do
not want to go with you". Each now has a feminine variant with pointed spelling,
romanisation and IPA. The validator had to be obeyed on one point: a variant may not
leave `text` blank, so it repeats the base string and the difference lives in the three
columns that differ.

### Hausa: 191 rows, and a premise of mine that was wrong

The hooked letters ɓ, ɗ, ƙ were written bare across the pack — `kudi` for *kuɗi*,
`kafa` for *ƙafa*, `daki` for *ɗaki* — while the same pack wrote `ɓace` and `ƙarfi`
hooked elsewhere, so it contradicted itself. My first sizing named six words and 68
rows; the sweep, done with each occurrence read in context, found **191 rows and 196
cells**, and left bare the ones that are bare — `Kashi!` beside `ƙashi`, `shan taba`
beside `Kada a taɓa`, `ya kasa` "failed" beside `jirgin ƙasa` "train".

I had also written that "espeak's Hausa voice drops the implosives". **Hausa has no
espeak voice.** `build_ipa.py` routes it through a hand-authored table that already
maps ɗ→ɗ and ƙ→kʼ, so fixing the text fixed the pronunciation of both: 180 IPA cells
followed the text. Only ɓ→b is folded, deliberately, because when the table was
written no reader table had a rule for ɓ. Five of 53 do now. Unfolding it is a
one-character edit plus 48 reader-table rules or a literal ɓ in 48 font subsets — a
corpus-wide decision, left as one.

### "Is walking possible?" was a dodge stated as a template

The concept note authorised the impersonal wording because a direct second person is
gendered in Arabic, Hebrew, Polish and Indo-Aryan, and carved out exactly one
language: "Mandarin has no such hazard". Turkish, Uzbek, Georgian and Armenian have no
grammatical gender at all and had taken the dodge anyway, and on a triage board "is
walking possible" and "can *you* walk" are different questions. The note now states
the rule by property — direct wherever the second person does not mark the
addressee's gender, impersonal only where it does — and lists that set. It also pulls
Bengali and Odia *out* of it: Indo-Aryan, but genderless. Six rows changed, each
against a reference grammar; `stay-here` got the same treatment and Armenian's
predicate superlative its definite `-ն`.

Twenty-five more languages still carry the impersonal form with no hazard (fi, hu,
ru, uk, fa, the Romance five, the South-East Asian set, the Dravidian four, bn, or, sw,
jv). One concept, one wave, not started.

### The checker, briefly wrong in the other direction

Widening `check_i18n` to read a bare `key:` as a reference — to stop it calling the
five display checkboxes unreferenced — made it read `key: 'gloss'` and
`key: 'roles.alert'` in two other constant tables as *referenced and undefined*, and
the gate failed on it. Reverted; `board-display.js` says `labelKey`, which is the
convention the scanner already knew.

### "Can you walk?" in the twenty-five that had no reason to dodge

Twenty rows changed across twenty languages; five were already direct and the earlier
count had misread them. What the rewrite turned up is that several of the old
impersonals were not stilted but **wrong in meaning**: Russian and Ukrainian's "may
one go?" asked permission to leave, and Hungarian, Finnish and Romanian asked whether
the *route* was walkable. Indonesian, Malay and Vietnamese were left as they were,
correctly -- a zero-pronoun question is the direct form in all three, and the natural
spoken address to a stranger there is a gendered kin term, which is exactly why those
packs drop the pronoun. Vietnamese is now named in the concept note's hazard set for
that reason. Every `stay-here` row in the set was left: verbal-noun-plus-"best" is how
each of these languages gives advice, and the note says an idiom is not a dodge. One
Persian `stay-here` was the exception -- an infinitive-as-subject calque -- and became
the ordinary *behtar ast* plus subjunctive.

## Batch P — nine more notes from using it

### The speed is a setting on Speak, not a second Speak

The `0.5×` beside Speak spoke by itself, which made two buttons that both talk. It
is now the multiplier Speak will use — `1×` by default, opening the list
`0.25× 0.5× 1× 2×` — and it never speaks. The engine's rate became a plain number
handed straight to the voice, so there is no name in between to drift from the
numeral on the button. It is a setting, stored with the other display choices, so it
holds across the page going away. Two agents' worth of `board.slow` translations
became dead with it and were removed; `board.rate` replaces them and is English-only
until the next wave.

### End punctuation hangs, and the fitter had to learn three things about that

Lines are centred on their words, and a final full stop or question mark is not a
word: counted, it shifts the last line half a glyph off the lines above, which the
eye reads as an error before it reads the sentence. The trailing marks now sit in a
zero-width box after the last character — centred as if absent, drawn where they
fell. Three consequences, each found by a test rather than foreseen:

1. **The fitter could not see the mark.** A full-width `！` is a whole em of glyph
   in a zero-wide box, so `救命！` was sized at 150px and the mark went 105px off a
   390px phone. The mark is measured as ink and must land inside the text's box.
2. **The wrong line.** The first check was `widest line + 2 × mark ≤ room`, and the
   browser fills every wrapped line to the room — so the only size that satisfied it
   was one where nothing wrapped, and an eight-character question came out at 30px.
   The mark hangs off the *last* line; where it actually falls is what is measured.
3. **Fitting is not monotone.** At 63px the eight characters wrap 4+4 and the full
   last line pushes the mark off; at 95px they wrap 3+3+2 and the short last line
   leaves it room; at 110px it is 2+2+2+2 and off again. The fitter stopped at the
   first miss and left the question at 58px. While a mark hangs, the walk now runs
   to the cap and keeps the largest size that fitted — 100px for that row, three
   lines, mark inside. With nothing hanging the landscape is monotone and the early
   stop stays, so the common case pays nothing.

### Reply is drawn like the message; the owner's controls are not

Every other button on the message row is the owner's — Speak, the speed, the turn —
and stays outlined on the coloured stage. Reply is the one the stranger presses, so
it now takes the stage's own colour, darkened, with the same bold white the sentence
is set in: two things addressed to one person read as one thing.

### The beacon: three times thicker, and a second streak half a lap behind

At the distance a beacon is for, the streak's width is most of what carries. It is
4rem where it was 1.35rem, and a second streak travels half a lap behind the first,
so there is always light on the far side of the screen: two points going round read
as a rotating beacon where one reads as a thing being chased. The perimeter placement
became one function called twice rather than the four cases written out again.

### SOS reaches for the lamp

A screen is what the reader has; a torch is what carries. The web reaches the lamp
only through the camera — a rear track whose capabilities include `torch`, then
`applyConstraints` to switch it — so SOS now asks for the camera, which is a
permission prompt the first time and a fair ask in an emergency. The screen starts
flashing at once and the lamp joins when the camera answers; where the platform has
no lamp, refuses, or does not expose `torch` (iOS Safari today) the screen flashes
alone, exactly as before. Released with the beacon. **Not verifiable here** — the
test browser has no camera — so this is the one change in the batch that waits on a
phone.

### The quiz can give up, and can be heard

A learner stuck on a row could only guess or close the quiz, and either way left
without the one thing they came for. "See answer" shows it where they would have
typed it, says only what it is — a reveal is not "not quite" — and counts the
question as missed, which is what it was; the button goes after one use. "Speak"
reads the row's target text through the board's own engine: at once when that text
is one of the columns shown, and only after grading when it is the column being asked
for, or the button would read the answer to someone still typing it.

### Smaller

The pronunciation line is on by default — it is the reason most people open the
card. The landing sentence is smaller and closer on a phone, which moved the
language grid 35px up. And its wording is under discussion: the second clause of the
one that shipped read as a solitary exercise rather than as something shown to a
person, and a candidate that says so is in `en.json`, held back from the 51 other
catalogues until the English is agreed.

### The logo, in three places from one file

A logo arrived — a speech bubble in front of a phrase card, in green — with the
instruction to use it subtly. Three places, one file. `favicon.svg` *is* the mark
now, cleaned of its editor cruft and two hidden layers and cropped to its ink, so
a pinned tab shows the thing the header shows. The header's brand link carries the
same file at the height of the word beside it, 17px next to a 21px "Phraselet" and
14px on the board, with an empty `alt` because the word is the name; the wordmark
moved into a span, since `applyStatic` overwrites the `data-i18n` element's text
and would have wiped an image inside it. And the PWA manifest, whose `icons` had
been `[]` since the start, now names launcher icons rendered from it — 192, 512
and a 512 maskable on white at the 72% safe zone — in a `data/brand` the shell
precaches, because an icon the worker never cached is a broken install offline.

The colour stays the logo's. The app's accent is blue and the mark is green; at
these sizes that is a small accent beside the name, not a palette change.

One tool lied on the way. ImageMagick's plain `-trim` reported the mark's bounds
at the image origin on a page render and again on a canvas 600 units larger, so
the first crop began at (−17, −17) instead of (42, 34) and the mark drew shifted,
cut on the right and below. The alpha channel's bounding box is what to trust for
a transparent render, and it put the ink at (59.5, 51.5) — inside the page all
along.
