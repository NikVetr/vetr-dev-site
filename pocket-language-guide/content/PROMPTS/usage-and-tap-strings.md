# Twenty-six interface strings: Most used, speaking on tap, and lines under the buttons

The general rules are `content/PROMPTS/interface-strings.md`'s and they are binding --
whose screen a string is on, reuse before translation, placeholders that cannot inflect,
leaving a key out when it cannot be sourced, each file's `_note`, and the mechanics
(indentation, trailing newline, a one-line insertion rather than a re-serialised file,
round-trip before writing). This is only what is particular to these keys.
`data/i18n/en.json` has every English value; add the new keys in its order, beside the
same neighbours.

Every key here is read by the **owner** -- the person holding the phone -- through `t()`,
at the size of the interface. None is shown to the stranger.

## Most used

A new context on the list of contexts gathers the buttons the reader presses most, from
every context, most first. It is counted on the device only.

| key | English | note |
|---|---|---|
| `boards.mostUsed.title` | Most used | the context's name on the list, beside `boards.*.title` -- match their form (a noun phrase, not a sentence). It is also the heading of its section in the settings. |
| `mostUsed.empty` | The buttons you press most gather here, from every context. | shown on the context while nothing has been pressed |
| `usage.lede` | The Most used screen puts first the buttons you press most. It is counted on this device only. | the section's explanation; name the screen as `boards.mostUsed.title` does |
| `usage.window` | Count over | the name of a row of choices of time window |
| `usage.week` / `usage.month` / `usage.year` / `usage.all` | Past week / Past month / Past year / All time | the windows: the last 7, 30 and 365 days, and every press ever. Also the column headings of the counts table, so keep them short |
| `usage.scope` | Count | the name of the second row of choices, which follows it: "Count: in X only / in every language" |
| `usage.scopeOne` | In {language} only | `{language}` is the listener language's name, in the nominative from `language-names.csv`; hang any case on a fixed noun as `interface-strings.md` says |
| `usage.scopeAll` | In every language | |
| `usage.stats` | See the counts | a button opening a table of how often each button was pressed; also that table's dialog title |
| `usage.button` | Button | the table's first column heading: which button. Use the file's own word for *button* (`editor.*`, `board.*`) |
| `usage.none` | Nothing has been pressed yet. | the table's empty state |
| `usage.reset` | Reset the counts | a button |
| `usage.resetTitle` | Reset the counts? | the title of the dialog it opens |
| `usage.resetBody` | Every count of how often you pressed a button is deleted from this device, and Most used starts again empty. Your buttons and settings stay. | |
| `usage.resetYes` / `usage.resetNo` | Reset / Keep them | the dialog's two answers; `Keep them` keeps the counts, and is the safe answer |

## Speaking on tap

A setting, and a switch in the bar under the buttons: a button says its sentence aloud
where it is, without opening the full-screen message, so the reader can give a driver
one direction a tap without the driver having to look.

| key | English | note |
|---|---|---|
| `board.tapSpeaks` | Speak on tap | the switch's accessible name and tooltip; a short name for the mode. Use the word the file uses for Speak (`board.speak`) |
| `display.buttonsHeading` | The buttons | heads the settings group about how the buttons behave, beside `display.heading` "What the message screen shows" |
| `display.tapSpeaks` | Speak on tap: a button says its sentence and the grid stays | the setting itself; begin with the same words as `board.tapSpeaks` |
| `display.tapAnswers` | …and a question then opens its answers | a follow-on setting shown indented under the last, completing it; keep the leading ellipsis in the file's own form |
| `display.tapNoVoice` | Speak on tap needs a voice for {language} on this device. | shown when the device has no voice for the listener's language; `{language}` as above |

## Lines under the buttons

The same settings group offers extra lines under each button's own words: the other
language's words, and how to say them. The last two reuse the existing `display.roman` and
`display.ipa` labels, so only two keys are new.

| key | English | note |
|---|---|---|
| `display.cellsCaption` | Under each button’s words: | introduces the three checkboxes that follow |
| `display.cellWords` | The other language’s words | the first of them: on the reader's buttons, the listener's sentence; on the listener's answers, the reader's meaning |

## Report

Per language: any key left out and why, any string reworded, and every choice a native
reviewer might question. Write it to `tmp/agent-notes/strings-ah-<group>.md` after each
language, not at the end.

## Found while writing these: existing keys to fix

The agents that wrote this batch read their files' neighbouring keys and found these
wrong. Check each against the file's own words and rules, fix it in place (one line
each, nothing re-serialised), and record old and new values in
`tmp/agent-notes/strings-ah-fixes.md`. A finding is a lead, not an instruction: where
it does not hold up, leave the key and say why.

- **hi, ur `gallery.wantLabel`** ("…and I want to speak") is masculine (चाहता हूँ /
  چاہتا ہوں), so it assumes a male reader; find a form that does not mark the reader's
  gender, as `interface-strings.md` requires. ur also drops the leading ellipsis.
- **cs, pl, hr `check.voiceUnknown`** tells the reader to press *Mluvit* / *Mów* /
  *Govori*, but the Speak button (`board.speak`) says *Vyslovit* / *Odtwórz* / *Izgovori*:
  name the button as it is labelled.
- **pl `check.voice`** produces *dla języka angielski*; **hr `check.writing`** produces
  *jezika engleski*; **fr, it `check.voice`** produce *pour anglais* / *per inglese*
  without the article. Each file's own rule for an inserted language name (a fixed noun
  carrying the case, or the colon form) says how to fix them.
- **fr `check.*`** use a plain space before ":" and straight apostrophes, against the
  file's rule of a non-breaking space and curly apostrophes.
- **ne `check.voiceUnknown`** holds a zero-width joiner and **or `signal.lede`,
  `check.noWorker`, `boards.transport.transitTitle`** zero-width non-joiners, though each
  file's note says it uses none: remove them where the word is the same without.
- **kn `check.voice`** attaches its suffix to the inserted name (`{language} ಗಾಗಿ`) rather
  than to the word for "language", against the file's own rule.
- **sw `signal.lede`** has *mgusa*, probably a slip for *mguso* ("a touch").
- **uz**: the file's `{language} tilida` frame produces *inglizcha tilida* where Uzbek says
  *ingliz tilida*, because ICU's name ends in *-cha*; say whether a frame fixes it, and fix
  it only where one does without breaking the other keys.
