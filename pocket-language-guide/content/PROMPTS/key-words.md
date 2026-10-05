# Marking key words, so a button is found at a glance

A board is a grid of short sentences, and a reader holding a phone out in a taxi does
not read six of them to find "Could you make it colder?". The setting this file feeds
sets the **key words** of each button in bold -- *colder*, *warmer*, *stop* -- so the
eye lands on the one that differs. Optionally they are coloured too: colder in a cold
blue, warmer in orange, stop in red.

This is a reading aid on the reader's own buttons. It changes nothing that is said,
shown to the stranger, spoken or printed.

## What you write

`data/emphasis/<bcp47>.csv`, one row per concept that has a key word:

```
concept_id,key
taxi.could-you-make-it-colder,colder
taxi.please-stop-here,stop
directions.where-is-the-toilet,toilet
```

- **`key` is an exact substring of that language's `text` for the concept** -- same
  case, same diacritics, same script. `scripts/validate_data.py` fails a key that is
  not in the sentence. For languages written without spaces (Chinese, Japanese, Thai,
  Lao, Khmer, Burmese) the key is simply the characters that carry the meaning.
- **Usually one key, at most two**, separated by ` | ` when the sentence genuinely
  turns on two words ("two tickets" might be `two | tickets` in a language where the
  number and the noun are apart). Never the whole sentence.
- **Skip a concept whose label is already one or two words** (`Thank you`, `Taxi`):
  everything on the button is the key, and bolding all of it says nothing.
- Rows sorted by `concept_id`, header exactly `concept_id,key`, UTF-8, **CRLF** like
  the packs. The files sit in `data/emphasis/`, beside the packs rather than in them:
  every tool that reads a pack reads each of its files as a section of rows. The file need not list every concept: absent means no
  key word, and that is a fine answer for a sentence with no single essence.

## Which concepts

`python3 tmp/scripts/board_concepts.py > tmp/data/emphasis/board-concepts.tsv` lists
every concept a board puts on a button, with the screen it first appears on and its
English. That is the set to mark (about 390). Concepts on no board do not need a key.

## How to choose the key

**The word that tells this button apart from the others on its screen.** Open the
board file (`data/boards/<board>.json`) and look at the neighbours: on the taxi
screen, "Could you make it colder?" and "Could you make it warmer?" share everything
except *colder* and *warmer*, so those are the keys -- not *make*, not *could*.

- **Content, not politeness or grammar.** *Please*, *could you*, *excuse me*, *I*,
  question particles and copulas are never keys. A sentence's key is almost always a
  noun, a verb or an adjective the reader would look for: *toilet*, *stop*, *colder*,
  *allergic*, *hospital*.
- **The same idea in every language, in that language's word for it.** The key for
  `taxi.please-stop-here` is the word for *stop* in each pack, wherever its grammar
  puts it: German `Halten`, Japanese `止め`. Do not translate the English key; find
  the word in that language's own sentence that carries the same meaning.
- **A key may belong to one wording.** The board bolds the keys a label contains, so
  where a variant changes the very word that carries the sentence, list both:
  German `Arzt | Ärztin`. The validator wants every key in some wording, and warns
  about a wording that contains none.
- **Present in every wording of the sentence.** Where the concept has rows in
  `variants.csv` (a woman speaking, or said to a man or a woman), the validator warns
  if the key is missing from a variant's text. Prefer a span every form shares -- a
  stem, if the language's inflection changes the ending (Arabic `مباشرة` is in both
  `امشِ مباشرة` and `امشي مباشرة`). When no shared span exists, keep the base form's
  key and say so in your notes; the variant simply shows no bold.
- **Short.** A key is what the eye looks for, so the shortest span that carries the
  meaning: `toilet`, not `the toilet`.

## Tones (the optional colours)

`data/registry/key-tones.csv` gives a concept a colour for its key, the same in every
language: `cold` (blue), `warm` (orange), `stop` (red), `go` (green). It is short on
purpose -- a colour is worth having only where the meaning *is* the colour's: the
temperature requests, stopping, going on. Do not add tones for anything else, and do
not add a fifth one without asking. The owner's own three examples are already there.

## Sources and checks

The words are already in each pack; this job only says which of them carry the
sentence, so it needs a reader's judgement more than a dictionary. Where you are not
certain which word of a sentence means *stop* or *colder* -- an agglutinating verb, a
compound, a particle you do not recognise -- check that language's own Wikipedia or a
dictionary of record, under the source policy in `add-a-language.md` (never glosbe,
wordhippo, languagedrops, translate.com, kaikki or forums), and note it.

Before you finish a language:

1. `python3 scripts/validate_data.py` -- **0 errors**, and read every key-word warning
   for your files.
2. `node scripts/build_shell.mjs` -- the offline manifest and `coverage.json` list the
   new file (`validate_data.py` writes `coverage.json`'s `emphasis` list).
3. Write your notes to `tmp/notes/agents/key-words-<group>.md` **as you go**, a line
   per language: how many keys, the judgement calls, anything skipped and why. A
   session limit can stop you mid-batch; the finished languages and their notes must
   already be on disk.

Do not commit; the coordinator reviews and commits. Do not edit any file other than
your languages' files in `data/emphasis/`, your notes, and -- for the English pilot only --
`data/registry/key-tones.csv`.
