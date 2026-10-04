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
reviewer might question. Write it to `tmp/notes/agents/strings-ah-<group>.md` after each
language, not at the end.

## Found while writing these: existing keys to fix

The agents that wrote this batch read their files' neighbouring keys and found these
wrong. Check each against the file's own words and rules, fix it in place (one line
each, nothing re-serialised), and record old and new values in
`tmp/notes/agents/strings-ah-fixes.md`. A finding is a lead, not an instruction: where
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

## A second list: found while fixing those

The agent that fixed the list above found more of the same kind, outside it, and left
them. The same rules hold: check each against the file's own words and `_note` first,
change only the named keys, one substring on one line, and record old, new and why in
`tmp/notes/agents/strings-ah-fixes-2.md` as you go. Its notes, with proposed fixes, are
`tmp/notes/agents/strings-ah-fixes.md`.

1. **"I speak" in the registry.** The header's first half is `speak_label` in
   `data/registry/languages.csv`, beside `gallery.wantLabel`. It assumes a man in Hindi
   (*मैं बोलता हूँ*), Urdu (*میں بولتا ہوں*) and Marathi (*मी बोलतो*), and says the Thai
   first person *ฉัน* (*ฉันพูด*), which the Thai note rules out because it marks the
   reader's gender. Make each neutral in the way Punjabi (*ਮੈਨੂੰ ਆਉਂਦੀ ਹੈ*) and Gujarati
   (*મને આવડે છે*) already are, keeping it a label that a language's name completes, and
   matching the now-neutral `gallery.wantLabel` of the same file. Lao, Vietnamese and
   Chinese carry a first person with no gender there; leave them. The file is a CSV that
   other scripts read: change the one cell, and keep its quoting and line endings.
2. **Thai *ฉัน* in eleven keys**, listed in item 11 of the notes. The Thai note rules out a
   first-person pronoun file-wide; a possessive *ของฉัน* ("my") may be the neutral usage
   of Thai software. Settle it from a source -- a Thai style guide of a platform, or the
   Royal Institute -- and then either reword the keys or amend the note to say what the
   rule covers.
3. **Inserted language names in older keys**, the same defect as the list's item 3 and 6:
   pl `field.title.roman` and `gallery.spokenIn`; fr `field.title.roman`; it
   `field.title.roman` and `field.title.respell`; kn `addTerm.inLanguage`,
   `field.title.gloss`, `field.title.literal`, `field.title.script`, `field.title.roman`
   and `gallery.spokenIn`; and uz `gallery.spokenIn`, whose `da` is also detached from
   `{regions}`. Render each with several of ICU's names in that locale before and after.
4. **French punctuation in 32 more keys**, listed under item 4 of the notes: the same
   mechanical swap to U+00A0 before `? ! : ;` and U+2019 for the apostrophe, nothing else.
5. **Nepali `check.voiceNone`** opens *यो डिभाइसमा कोही छैन।*: *कोही* is a person, where the
   sentence means that no voice is installed.
6. **Yoruba "read"** is spelled both *ka* and *kà* in the file. Establish the tone from a
   dictionary of record and make the file agree with it.
7. **Malay values identical to Indonesian.** Seventy `ms` values of four or more words are
   byte-identical to `id`, and some contradict the `ms` note itself -- it rules *helai* for a
   sheet, yet `cut.hint.whole`, `gallery.previewFailed` and `quick.status` say *lembar*.
   Other likely carry-overs are in the notes (*kolom*, *Pakai*, *meski*, *setidaknya*,
   *Alfabet Fonetis*, *tabel*, *kode*, *acuan*). Check each value's words in Kamus Dewan
   through DBP's PRPM and correct those that are not Malay; shared vocabulary stays.

## A third list: found while working the second

Same rules; the record goes to `tmp/notes/agents/strings-ah-fixes-3.md`.

1. **Inserted names that still take a suffix or the wrong case**: cs `gallery.spokenIn`
   ("Jazykem angličtina"); kn `check.phrases`, `quick.subtitle` and `studio.pair`; and uz
   `quick.subtitle`, `check.phrases` and `field.title.respell` ("inglizcha tiliga").
2. **fr `_note`** still records `editor.confirmDeleteScreen`'s plain space as a leftover,
   which the second list fixed: correct that sentence.
3. **Malay leftovers the audit could not touch**: `board.unit` *Menit* where the file's
   own `board.minutes` says *Minit*; *usulan* and *berbasis*, neither in Kamus Dewan;
   *setelan* and *ditumpuk* in `preview.duplexNote`, *ditumpuk* in `preview.cardPair`,
   and *lebih dulu* in `cut.hint.longEdge`. The note's sentence that the grid "is not
   named" is out of date, and its claim that Malay does not use *lembar* this way is
   contradicted by Kamus Dewan, which lists *lembar* as a classifier: keep *helai* as the
   file's choice and say why correctly. And if the corpus pass changes the Malay section
   titles, `boards.lodging.laundry*` and `quiz.interest.transit.hint` follow them.
   The audit's record is `tmp/notes/agents/strings-ms-audit.md`.

## A fourth list

- cs `quick.heading` and `gallery.thumbAlt` have the shape the third list fixed in
  `gallery.spokenIn`: *průvodce jazykem {language}*, an instrumental head noun before
  ICU's nominative name ("průvodce jazykem angličtina"). Give them the file's corrected
  frame. The record goes to `tmp/notes/agents/strings-ah-fixes-4.md`.
