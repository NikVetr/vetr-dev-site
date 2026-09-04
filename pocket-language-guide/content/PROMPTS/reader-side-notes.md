# Task template: one language's reader-side text

Everything a sheet prints is in one of two languages. The rows are in the one being
learned; three things are in the reader's own — the section headings, the notes, and
the emergency line — and this is the template for the last two.

**All sixteen languages are done.** The template is kept because the work recurs —
a seventeenth language needs exactly this, and so does any new `note` concept — and
because the findings folded in below cost sixteen translators a great deal of reading
to arrive at. Fill in the placeholders and hand it to a model, one language per task.
`npm run validate` names exactly which languages are missing what.

---

Write the `<LANGUAGE>` text for the printed notes and the eleven emergency-service
labels.

This is a different job from translating a phrase pack. Everything here is prose **a
`<LANGUAGE>` reader reads**, about a language they are learning. It appears on the
card only when `<LANGUAGE>` is the *gloss* language, so it is read, not shown to
anyone. It needs no respelling and no romanisation of its own — it is `<LANGUAGE>`
for `<LANGUAGE>` readers.

## Deliverable 1 — `data/registry/emergency-labels/<code>.csv`

Header exactly `label,text`, CRLF, UTF-8 no BOM, NFC. Copy
`data/registry/emergency-labels/en.csv` and translate the `text` column; **keep the
`label` column byte-identical** — it is the join key and must stay Latin.

Ten of the eleven are the service words as they appear in `data/registry/regions.csv`:
`all services`, `police`, `ambulance`, `fire`, `also works`, `fire and ambulance`,
`medical`, `tourist police`, `police and ambulance`, `gendarmerie`. They print on the
**emergency line of every card glossed into `<LANGUAGE>`** — 15 of the 240 pairs —
directly under the Emergency heading, so they are the highest-stakes eleven strings in
the language. Keep them short: they share a line with the numbers in a 1.66in column.

Four findings from the languages already done, so you need not repeat the work:

- **`fire` names the service, not the event.** The number reaches people, so the word
  is the one for the fire brigade, never the one for a blaze.
- **`gendarmerie` earns its own label.** Morocco prints 190 for the urban police and
  177 for the Gendarmerie Royale, and they cover different places; collapsing both to
  "police" tells a reader outside a city to call the wrong one. Hindi renders it
  descriptively as "rural police", which conveys the distinction better than a
  transliteration would.
- **No national institution in a service label.** `INEM`, `SAMU` and
  `delegacia do turista` were all rejected: the `medical` label prints on the French
  and Senegalese cards, so naming your own country's agency there is actively wrong.
- **`all services` needs its quantifier.** Bare "emergency" reads as "the emergency
  line", which does not distinguish a single-number country from one printing three.
  Russia's `единый номер` ("single number") says the thing the label means.

Kenya is the awkward one to compose — `999 all services · 112 also works · 911 also
works` — so whatever you choose for `also works` gets read twice in a row there.

### The `_frame`, which is the interesting part

`_frame` is the sentence the note is built from. Both `{region}` and `{numbers}` must
survive; `{region}` arrives already in your language from `Intl.DisplayNames`.

English is `{region}: {numbers}` with **no preposition**, and that is a settled
finding rather than a shortcut. Every language that tried one found it unusable,
because the frame never sees the name it is filling in:

| | why a preposition fails |
|---|---|
| English | wrong for 3 of 49 — "In United States" |
| Portuguese | 41 of 49 take an article, split across `na` / `no` / `nos` |
| French | `en` for 29, `au` for 16, `aux` for 2, `à` for 2 — no single one beats 29 |
| German | 7 ungrammatical; ICU returns bare nominatives, German wants article + case |
| Turkish | five surface forms of the locative suffix, two names not decidable at all |
| Russian | prepositional case on a name supplied in the nominative |

Most took apposition. Two found something better and you may be able to as well:
Turkish `{region} için:`, a **postposition governing the bare nominative**, and Hindi
`{region} में:`, which works because Hindi does not oblique-mark proper nouns.
Vietnamese `Tại {region}:` needs no agreement either. Spanish kept `En {region}:`
deliberately, on the grounds that Spanish label register drops the articles English
cannot. Hungarian took bare apposition and had two reasons rather than one: the
inessive `-ban/-ben` picks its vowel from the region name's *last* vowel and the
definite article `a`/`az` from its *first sound*, so `a Magyarországon` and `az
Egyesült Államokban` cannot come from one frame. **Say what you chose and why.**

**If your language inflects, the escape is a head noun of your own, not a cleverer
preposition.** Put a word you control immediately before the insert and let the
grammar attach to that: Thai's frame supplies `ภาษา`, Indonesian's `bahasa`, and the
Hungarian pack uses `nyelven` for all six language-slot cells (`Nem beszélek {target}
nyelven`) and a demonstrative in the required case plus a colon for its 44 blank-slot
rows (`Allergiás vagyok a következőre: {}`). It reads a little more formally than a
suffixed form would, and it is right for every fill instead of some.

One trap: ICU's name for Côte d'Ivoire contains U+2019, so any punctuation you attach
to `{region}` lands next to an apostrophe already in the string.

## Deliverable 2 — the note rows

A `note` concept is one paragraph in a bordered box at the head of its section. Each
is about a *different* language and is scoped to it, so your reader meets it only on
that language's card. There are four; **you write only the ones not scoped to your own
language**, because a language is never its own sheet's source.

| concept | file | about |
|---|---|---|
| `numbers-money.number-and-classifier-notes` | `data/lang/<code>/numbers.csv` | Chinese numbers, measure words, money |
| `numbers-money.number-and-classifier-notes-2` | same | Japanese numbers, counters, phone readings |
| `social-basics.politeness-particles` | `data/lang/<code>/social.csv` | the Thai sentence-final particles |
| `time-words.clock-offset` | `data/lang/<code>/time.csv` | the Swahili six-hour clock |

English versions are in `data/lang/en/{numbers,social,time}.csv` and are the model for
scope and length. Match each file's exact header (they differ — some carry a
romanization column), CRLF, NFC, `confidence: 2`, provenance `<code>-notes-v1`. Where
a row already exists, edit it in place rather than appending a duplicate — five
languages had the row present and blank, which drew an empty bordered box.

Three things the finished languages learned about the content:

- **Say the rule, not just the list, if your language has no classifiers.** Spanish,
  German, French and Portuguese all independently added a sentence stating that the
  measure word is *obligatory* between numeral and noun, because a reader with no such
  category cannot infer it from a labelled list. If your language *does* have
  classifiers — Vietnamese, Thai, Indonesian, Japanese, Korean — invert that: the
  reader needs the words, not the concept, so spend the space on the list.
- **Before a classifier, Chinese 2 is `liǎng`, not `èr`.** English, Hindi, Thai and
  Indonesian all shipped `er zhang piao` for "two tickets", which is ungrammatical;
  the corpus even carries the row (`numbers-money.li-ng`, glossed "2 + classifier"),
  so the note contradicted a card it sits on. Korean turned this into its note's best
  sentence by observing that it is the same alternation as Korean's own 둘 → 두 --
  leaning on a change the reader already performs is what makes a rule stick.
- **State the clock arithmetic twice, in both directions.** "Six hours off" is exactly
  the ambiguity that makes someone six hours late, and words like `adiantado` /
  `atrasado` do not resolve whether the *number* or the *time* is displaced. Portuguese
  says both "the Swahili count is six lower" and "add six to what you hear".
- **The Thai note is a legend, not trivia.** That pack omits the politeness particle
  from 743 of its 745 rows, because printing it correctly needs two different pairs —
  one for statements, another for a woman's questions — and choosing one is wrong for
  half its readers. This note is what makes that a decision rather than an omission.

## The one hard constraint

**A note prints in your own face, so it may use your own script and whatever else
that face happens to carry.** Quoting Chinese characters, kana or Thai script inside
one renders as a row of empty boxes — which is exactly what the shipped Mandarin card
did before it was caught. Romanise everything you quote: pinyin for Chinese, Hepburn
for Japanese, RTGS-ish for Thai.

`npm run validate` now checks every string against the **actual cmap** of the faces
that will draw it, intersected across the variants of a stack, so it names a
codepoint your face cannot draw. It did not always: it used to compare against
Unicode range tables far more permissive than what `scripts/subset_fonts.py` builds,
and three translators independently found text that passed validation and printed a
box. Trust the validator now — but the habit that caught it is still the right one, so
load the shipped TTFs with fontTools and check anything unusual yourself.

**Whether to mark tones is a real decision, and it went both ways.** German, Korean,
Indonesian, Russian, Swahili and Vietnamese kept tone-marked pinyin; English,
Japanese, Thai and Mandarin did not. The arguments are not about taste:

- *Keep them* if the tones appear nowhere else the reader will look. That was
  German's case (`gè`, `wèi`, `zhāng` appear nowhere else on a German card, so
  toneless would hand the reader a pronunciation with no tone on it anywhere).
  Swahili's version is sharper: `bei` is a live Swahili word meaning "price" and is
  on the same sheet, so a bare `bei (cups)` reads as "price (cups)".
- *Keep them* if the pack's own romanisation column is marked, so the note agrees
  with the rows printed a few millimetres below it. That is why Korean, Indonesian
  and Vietnamese kept them, and why Korean also took macron Hepburn.
- *Drop them* if a mark above the line already means something else in your script.
  A Thai or Chinese reader reads a superscript mark as a tone, so a macron standing
  for Japanese vowel length is a false cue; both used doubled vowels instead.
- *Drop them* if your face cannot draw them. The Thai faces carry 446 glyphs and no
  `ǎ ǐ ǒ ǔ`, so `jiǎo` alone rules the whole set out for Thai.

## Deliver

Run `npm run validate`: 0 errors, and your language gone from both the `concepts:`
and the `registry/emergency-labels:` warning families. Then **compose the real line**
for a few countries by calling `emergencyNote` through `loadEmergencyLabels` — that is
how you find a label that is too long, and every finished language did it. Render one
sheet if your script has anything unusual about it.

Report the eleven labels, the paragraphs, your `_frame` decision, and anything that
did not fit.
