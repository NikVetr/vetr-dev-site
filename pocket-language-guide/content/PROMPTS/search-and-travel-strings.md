# Fifty-three interface strings: finding a button, checking before a trip, and new screens

The general rules are `content/PROMPTS/interface-strings.md`'s and they are binding --
whose screen a string is on, reuse before translation, placeholders that cannot
inflect, leaving a key out when it cannot be sourced, each file's `_note`, and the
mechanics (indentation, trailing newline, round-trip before writing). This is only
what is particular to these keys. `data/i18n/en.json` has every English value; append
the new keys in its order.

Every key here is read by the **owner** -- the person holding the phone -- through
`t()`, at the size of the interface. None is signage.

## One changed key

- `board.arrange` is now "Rearrange buttons" (it was "Rearrange this screen"). Replace
  the existing value: the control rearranges the buttons on the screen behind the
  settings, and the new wording names the buttons rather than the screen.

## New screens on the boards: reuse the section titles

The corpus agents have just written four section titles into
`data/registry/section-titles/<code>.csv`: `about-me`, `air-travel`, `hitchhiking` and
`outdoors`. The board keys that name the same thing must say the same thing:

| key | English | take it from |
|---|---|---|
| `boards.intro.me` | About me | section-titles `about-me` |
| `boards.transport.airTitle` | At the airport | its own wording; `air` below reuses the title |
| `boards.transport.air` | Air travel… | section-titles `air-travel`, with the file's own ellipsis as `boards.transport.taxi` has it |
| `boards.transport.hitch` | Hitchhiking… | section-titles `hitchhiking` + ellipsis |
| `boards.transport.hitchTitle` | Hitchhiking | section-titles `hitchhiking` |
| `boards.outdoors.title` | Outdoors | section-titles `outdoors` -- this is a context on the list of contexts, beside `boards.sights.title` and the rest; match their form |

The others: `boards.transport.train` "Train…" and `trainTitle` "By train" (the screen
of train questions; follow `boards.transport.taxi`/`taxiTitle`'s pattern);
`boards.outdoors.trail` "On the trail…" / `trailTitle`, and `boards.outdoors.lifts`
"Shuttles and cable cars…" / `liftsTitle` (the shuttle buses and cableways up a
mountain park -- `trail-words.cableway` and `trail-words.shuttle-bus` in the corpus
already have the words); `boards.intro.work` "My work" (professions: teacher, doctor,
student...) and `boards.intro.people` "People with me" (the screen introducing a
partner, parents, children, a colleague).

A label ending in `…` opens a further screen; the file's existing `…` labels
(`boards.transport.taxi`, `boards.emergency.lost`) show how it writes one.

## The emergency board's signals

`boards.emergency.signals` "Signal for help…" opens a screen holding the three signals
(`boards.emergency.sos` "Flash SOS", `boards.emergency.attention` "Attract attention",
and the new `boards.emergency.lights` "Red and blue lights" -- the screen alternating
red and blue, as an emergency vehicle's lights do). `boards.emergency.signalsTitle`
"Be seen and heard" is that screen's heading. Reuse the file's own words for SOS and
attention.

## Finding a button

A magnifying glass in the header opens a search field across it. `search.open` "Find a
button" is both the glass's name and the field's placeholder, so it must read as
either. `search.close` "Close the search"; `search.none` "No button says that."; and
`search.more` "Showing {shown} of {count}. Type more to narrow it down." -- two
numerals, which cannot inflect anything (the colon or parenthetical dodges apply).
Use the file's existing word for *button* (`editor.*`, `board.*`).

## A name by its sounds, in the editor

`editor.byItsSounds` "A name, spelled by its sounds" folds a keyboard of sounds into
the editor for a button of the reader's own (a hotel's or a street's name), and
`editor.insertSounds` "Add it to their sentence" puts the name, written in the
listener's letters, into the field `editor.listener` names. Reuse `about.sounds`'s
word for *sounds*.

## The check before a trip

Settings has a section `check.title` "Before you travel" with a button `check.open`
"Check that everything works offline", which opens a dialog listing six checks, each
marked as it finishes. The `check.pass` / `check.warn` / `check.fail` /
`check.running` words are what a screen reader says for the marks (short: "Passed",
"Works, with a note", "Failed", "Checking").

Each check has a label and a detail line; the placeholders are `{listener}` and
`{owner}` (language names, from `language-names.csv`, in the nominative -- hang any
case on a fixed noun as `interface-strings.md` says), `{language}` (the same),
`{count}`, `{total}`, `{shown}`, `{contexts}`, `{buttons}`, `{gaps}` (numerals) and
`{letters}` (a few characters of the listener's script, space-separated). The checks
are, in order: the sentences in both languages load; every context opens; the
listener's writing can be drawn on this device (`check.writingMissing` says which
letters show as empty boxes); a pronunciation is there for every sentence; a voice
for the listener's language is on the device (`voiceHere`, `voiceOnline`,
`voiceUnknown`, `voiceNone`); and the files are kept on the device (`saved`,
`savedDetail`, `unsaved`, `saveNow`, `noWorker` for a browser keeping nothing, and
`bundled` for the installed app, where everything is part of the app).
`check.notTried` is the detail of a check that could not run because the first did
not load. Reuse `settings.*`, `display.voice` and `gallery.*`'s words for *voice*,
*offline* and *save*.

## Report

Per language: any key left out and why, any string reworded, and every choice a
native reviewer might question. Write it to `tmp/agent-notes/strings-af-<group>.md`
after each language, not at the end.

## A second pass: thirteen more keys, one changed

After the first pass the boards were reworked, and these came with it. Same rules.

- `board.arrangeHint` changed: "Drag the buttons into the order you want, or onto the
  bin to take one off, then press Done." Replace the existing value.
- **Rearranging can take a button off.** `arrange.bin` "Drop here to remove" is the
  target in the bar while rearranging. Dropping a button on it asks
  `arrange.removeTitle` "Take “{button}” off this screen?" (`{button}` is the button's
  label, in quotation marks the file already uses), with `arrange.removeWhy` under it
  on a board's screen and `arrange.removeWhyContexts` on the list of contexts;
  `arrange.removeYes` "Take it off", `arrange.removeNo` "Keep it", and a checkbox
  `arrange.removeAgain` "Don’t ask again". `display.askRemove` is that same choice as
  a line in the settings: "Ask before rearranging takes a button off a screen". Reuse
  the file's words for *button*, *screen*, *context*, *settings* and `editor.open`'s
  "Edit buttons", which the explanation names.
- `contexts.shown` "Contexts on the list" heads the switches, in the context list's
  settings, that bring a removed context back.
- **Two screens renamed.** Getting around's station and on-board screens are one:
  `boards.transport.transit` "Train and bus…" and its heading
  `boards.transport.transitTitle` "By train or bus". The emergency board's diabetes
  sentences have a screen of their own: `boards.emergency.diabetes` "Diabetes…" and
  `boards.emergency.diabetesTitle` "Diabetes" -- the corpus's own word for the
  condition (`medical-conditions.*`, `emergency-medical.i-am-diabetic`) is the one to use.
- Four keys from the first pass are gone and must not be added back:
  `boards.transport.train`, `boards.transport.trainTitle`, `boards.emergency.signals`
  and `boards.emergency.signalsTitle` -- they have already been taken out of every file.

## A third pass: one key, shorter

- `boards.transport.taxi` is now "Taxi…" (it was "In a taxi…"). It is the button on
  Getting around that opens the taxi screen, and the owner wanted the one word: the
  screen's own heading, `boards.transport.taxiTitle` "In a taxi", keeps the fuller
  phrase and does not change. Replace each file's value with its everyday word for a
  taxi, in the file's own form of the ellipsis as its current value has it. The word is
  usually the one `data/registry/section-titles/<code>.csv` gives for `taxi` -- but that
  row can name more than the button does (Bengali's is "taxi and auto-rickshaw"), so
  take the noun for a taxi, not the whole title. Where a language's label needs a case
  or a particle on the bare noun to read as a button that opens a screen, say so in the
  report rather than adding one silently.
