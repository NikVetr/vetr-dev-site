# Wanderwart

Wanderwart is a static, offline-capable language app for printable pocket cards,
conversation boards and vocabulary practice. It runs entirely on the user's device.
The repository and npm package retain the working name `pocket-language-guide`.

The corpus contains 1,012 concepts in 70 sections, 54 ready targets (53 languages
plus Morse), 53 reader languages and 53 interface catalogues. The gallery contains
2,809 ordered language pairs. Quenya, Klingon and Morse have deliberately partial
coverage. Optional profanity sections start disabled.

## Architecture

The browser loads plain JavaScript ES modules; JSDoc and TypeScript check their
interfaces without compiling the app. No server, account or database is required.

| Directory | Responsibility |
| --- | --- |
| `core/` | Corpus loading, speaker variants, pronunciation, fonts, measurement and layout |
| `core/solve/` | Fitting, line breaking, column placement, page furniture and decoration |
| `render/` | SVG, PDF, PNG support and print imposition |
| `ui/` | Gallery, studio, conversation boards, quizzes and settings |
| `ui/platform/` | Browser and Capacitor storage, speech, sharing and device adapters |
| `data/` | Authored language records and registries, generated indexes and subset fonts |
| `packs/` | Generated gallery thumbnails, compressed first-face SVGs and their index |
| `scripts/` | Validation, asset generation and native packaging |
| `tests/` | Node tests, browser specs and a separate exhaustive integration suite |
| `content/` | Translation conventions, pronunciation design and contribution briefs |

`core/content.js` joins the concept bank with target and reader rows, applies
speaker variants and language slots, produces pronunciation text, and applies
selection and personal edits. Boards and quizzes can use this content without
loading fonts or running a layout solve. Language files are fetched concurrently
and cached per loader; consumers receive independent row copies. Generated
respellings are cached per content context and language/voice combination.

`core/sheet.js` combines the content with the font registry, theme and solver.
The solver produces a `LayoutPlan` containing positioned text runs, rectangles,
icons, decorative paths and hit boxes. SVG and PDF consume the same coordinates;
PNG rasterizes the SVG. `render/impose.js` transforms plans for cutting, folding
and n-up printing.

Fontkit supplies glyph metrics and PDF shaping. TTF subsets serve measurement and
PDF embedding; WOFF2 subsets serve browser rendering. Both formats are required.
Script-specific type-size floors, printable margins and phone reservations constrain
fitting. Automatic page counts and scale settings preserve selected content or
report an explicit failure. Decorative ornaments use free space; Quenya's optional
Elven frame reserves its own measured space before fitting.

## Pages and personal data

The gallery opens a language pair in the card studio, a conversation board or a quiz.
The studio selects content, edits individual rows, sets paper and typography, and
exports PDF, SVG or PNG. Named saved cards carry settings, finish, resolution and
personal row edits. CSV files support vocabulary round trips.

The starter questionnaire asks about interests, proficiency, print size, carry limits
and breadth. Optional personal details generate a translation prompt that the reader
can copy into an external model. Pasted CSV responses are validated and reviewed
before import; opening a model link sends no personal details. CSV inclusion choices
and content checkboxes agree, including custom rows and older imported exclusions.

Automatic balancing proposes additions first, then a conservative weighted replacement
or redundant-row removal when additions cannot help. Every change is selectable, and
the accepted set must fit at the current size before it is applied. Emergency,
high-importance, explicitly selected, edited, custom and merged rows are protected.
Country indicators use emoji where supported and bundled SVG flags otherwise.

Conversation boards display phrases and replies, fill personal details, and use
available platform speech and translation features. Quizzes support multiple choice,
matching and typed answers, with per-pair selections and daily/all-time results.
Hands-free practice depends on the browser's speech recognition and installed voices.
Full-auto practice needs no microphone or grading. A saved per-pair sequence chooses
source/target script, romanisation, IPA, respelling or literal text independently for
screen and audio, with phrase depth, speaking speed, repetition and a pause after
each phase. Reverse-pair content supplies the source language's representations;
missing selected representations are counted and omitted. Phonetic audio speaks the
phrase's native wording. Fullscreen displays share conversation-board colours.
`ui/recitation-plan.js` builds the timeline and `ui/platform/recitation.js` controls
playback. Browser and screen-only sessions pause when hidden. Native audio runs in
an Android foreground media service or an iOS prepared audio track, with pause/stop
media controls independent of the WebView. Preparation requires the app to stay open.
Keyword bold and color are independent. Incoming replies respect the reader's text
visibility choices after reversing the speaker and listener languages.

`ui/platform/store.js` uses localStorage on the web and Capacitor Preferences with
an in-memory mirror on native devices. Backups carry phrases, speaker answers,
personal details, sheet edits, usage counts, quiz records and saved cards.

Cards and backups are inert JSON. Shared validation checks nested settings, colors,
edit records and count records before import; SVG string attributes are escaped at
rendering. Backup restore waits for every write, including nested writes, before
attempting rollback. A rollback failure is reported. These are application-level
recovery guarantees, not a transaction spanning a device power loss.

## Offline and native operation

`scripts/build_shell.mjs` generates `data/shell.json`, `data/offline.json` and the
service-worker version. The worker installs a complete versioned shell, including
the default conversation corpus, and keeps downloaded language files in a separate
persistent cache. Opening a language caches its requested files; subsequent opens
reuse them without downloading again. Settings can save every language or explicitly
refresh saved languages. Shell upgrades retain saved packs and use content hashes
to refresh only changed cached files. Failed refreshes keep their previous bytes
for offline use and retry when opened; unchanged files need no download. Shell
files are never overwritten by the pack cache.

Each explicit save/delete request uses its own message port and a deadline that
includes service-worker registration. Downloads include all supported font variants.
Deleting a language retains faces required by other saved languages.

`scripts/build_mobile.mjs` packages the static app, language data and fonts for
Capacitor, with a smaller preview inventory and no service worker. Android and iOS
projects are generated locally. Android WebView debugging follows the platform's
debuggable build flag. See [native build and device checks](docs/native.md).
Native bundles include English and Mandarin with their fonts, plus the small shared
registries, concepts and interface data. Other languages download automatically when
opened online, with their print fonts, into Capacitor's persistent data directory.
The first native launch offers selected languages or every language, with incremental
sizes that count shared fonts once; nothing is selected by default. Deferring keeps
the starter pair and downloads other languages as they are opened. The same bulk
choices remain in Settings, with progress, cancellation and retry. Settings can delete
downloaded languages while retaining fonts shared by other installed languages.
Each app pins an immutable repository commit and SHA-256 file inventory; a pack is
installed only after every file is verified. Missing or corrupt packs require a
download or repair instead of becoming empty language content. Both byte loaders
and browser font rules resolve downloaded files from native storage.
Native settings can clear disposable export copies from the app's dedicated cache
directory. Files still being shared, saved cards and personal settings are retained.

## Development and generated files

Serve the checkout with `npm run serve`. Install JavaScript dependencies with
`npm ci`; `package-lock.json` pins that graph. `requirements.txt` records the
Python 3.10 tooling and its runtime dependencies. A scoped UUID override keeps the
Xcode project generator on the patched CommonJS-compatible release. Install Python tooling in the environment
used for this project. IPA generation also depends on the system eSpeak library;
Ukrainian and Marathi use the library supplied by `espeakng-loader`.

| Command | Purpose |
| --- | --- |
| `npm run validate` | Validate corpus structure and report coverage/review warnings |
| `npm run test:fast` | Type checking and the regular Node test suite |
| `npm run test:integration` | Exhaustive language ornament/layout comparisons |
| `npx playwright test --grep @smoke` | Compact browser smoke suite |
| `npm test` | Validation, generated-file checks, both Node suites and browser tests |
| `npm run check` | Types, indexes, preview freshness, pronunciation and publication boundary |
| `node scripts/check_all.mjs --strict` | Also fail if required phonemizer checks cannot run; CI does this automatically |
| `npm run prerender` | Regenerate missing/stale previews, then optimize thumbnails |
| `npm run prerender -- --only ar --source en` | Regenerate one selected pair |
| `npm run shell` | Refresh offline inventories and service-worker version |
| `npm run mobile` | Assemble the ignored native web bundle |

Preview metadata records SHA-256 fingerprints of rendering code, fonts, configuration
and corpus inputs, with language rows scoped to each pair. Existing output files
alone do not establish freshness. The prerenderer uses local worker processes,
preserves the published index during rendering, and replaces the index after success.
The compact JSON index avoids shipping indentation in the offline shell.

Font source URLs name immutable upstream commits. `scripts/font-sources.sha256.json`
pins their bytes; both fetching and subsetting verify them. To rebuild fonts, run
`python3 scripts/fetch_fonts.py` followed by `npm run fonts`. Regenerate
`npm run respell:charset` first when corpus or respelling changes introduce characters.
Other generators include `npm run vendor`, `icons`, `logo`, `app-icons`,
`boards`, `countries` and `timezones`. Run `npm run shell` after changing shipped
code or generated assets.

The 78 SVG flags are an MIT-licensed subset of flag-icons. Their upstream revision
and byte hashes are pinned in `scripts/flag-sources.sha256.json`;
`python3 scripts/fetch_flags.py --check` verifies them without network access.
Native download verification uses the pinned, MIT-licensed noble-hashes SHA-256
bundle, generated alongside the other vendor modules. Native release assets must
be committed and published at the exact source revision embedded in the app;
packaging refuses uncommitted language or font assets.

GitHub Pages serves the tracked site files directly. Consequently, the runtime
corpus, fonts and gallery previews are tracked. `tmp/`, dependencies, test output,
native projects and build bundles are ignored. The publication-boundary check
verifies that those directories remain untracked.

## Validation boundaries

Node tests cover layout invariants, shaping, CSV, import validation, storage recovery
and offline request handling. Browser tests exercise the real pages and exports,
including operation without a network. The exhaustive ornament matrix remains in
the full test run and can be invoked independently.

Structural validation does not establish linguistic accuracy. Pronunciation and
translation review warnings remain editorial work; native-speaker review is needed,
especially for emergency and allergy phrases. Native device behavior, speech engines
and platform signing also require their documented device/release checks.
New questionnaire, balancing, storage and download labels use English fallback until
their translations are supplied, as do full-auto controls. Model-generated phrases
require the reader's review. Quiz selections and full-auto setup preferences are local
device settings; portable backups carry quiz results, not these setup preferences.

For corpus work, start with [contribution guidance](content/CONTRIBUTING.md),
[the row format](content/LLM_SPEC.md), [language slots](content/LANGUAGE-SLOTS.md)
and [adding a language](content/PROMPTS/add-a-language.md).
