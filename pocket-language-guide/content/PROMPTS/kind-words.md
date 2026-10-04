# Kind words: eight sentences a traveller says to be kind

The "Meeting people" board gets a "Kind words" screen -- and the sheet a section it
leaves off unless the reader turns it on -- for the things a visitor says to thank or
compliment the people they meet. The corpus
had almost none -- its only compliments were in `slang` ("Delicious!", "I love it"),
the wrong register for a stranger's kitchen. The source policy, the row format,
`confidence`, `provenance` and every check are `content/PROMPTS/add-a-language.md`'s;
this is only what is particular to this job.

```
kind-words.you-are-very-kind              You are very kind
kind-words.thank-you-for-your-help        Thank you for your help
kind-words.this-is-delicious              This is delicious
kind-words.it-is-beautiful-here           It is beautiful here
kind-words.i-like-it-very-much            I like it very much
kind-words.i-had-a-wonderful-time         I had a wonderful time
kind-words.thank-you-for-everything       Thank you for everything
kind-words.thank-you-for-your-hospitality Thank you for your hospitality
```

## Writing them

- **Neutral-polite, to a stranger or a host**: what a visiting adult says to the person
  who cooked the meal, gave directions or put them up for the night. Not slang, not
  the formal register of a letter. Where the language marks politeness in the verb or
  pronoun (T-V, keigo, Korean speech levels), use the level the language's other
  `social-basics` rows use, and say which.
- **Said to one person** where the language must choose; "You are very kind" is to the
  one who helped.
- **The speaker's gender**: where a sentence agrees with the speaker (Hebrew, Arabic,
  Hindi, Russian, Polish, Portuguese *obrigado/obrigada* and the rest of the 22
  languages in `data/registry/speaker-axes.csv`), the base row is the declared default
  and the other form goes in `data/lang/<code>/variants.csv`, exactly as
  `content/PROMPTS/speaker-variants.md` says. Never a slash.
- **"It is beautiful here"** is about the place, not a person, and must not read as a
  remark about someone's looks. "I like it very much" is about a thing or a place
  being shown -- a dish, a view, a room.
- **Punctuate as the pack punctuates its other statements** -- English leaves them
  bare, German ends them with a stop -- not as the list above happens to.
- Where a sentence has no natural equivalent, or would be odd or rude to say, leave the
  row out and say why rather than calque it.
- Rows go at the end of `data/lang/<code>/social.csv`, `ipa` left empty for the builder,
  keeping the file's `\r\n` line endings (read and write it with `newline=''`).
  Romanised packs author their romanisation cell as the brief says.

## The section's title

Add `kind-words,<title>` after the `board-answers` row of
`data/registry/section-titles/<code>.csv`: a short heading for kind and grateful
things to say, in the language's own words.

## Checks

For your languages only -- other agents write other languages in the same tree at the
same time, so never run a builder without `--only`:

```
python3 scripts/build_ipa.py --only <codes>
python3 scripts/build_ipa.py --check --only <codes>
python3 scripts/validate_data.py            # no errors in your languages
node scripts/respell_check.mjs --charset --check
node scripts/speaker_coverage.mjs <code>    # for a language with a speaker axis
```

`uk` and `mr` need the eSpeak environment `content/PROMPTS/family-intros.md` gives.
Do not run `build_board_index.mjs` or `build_shell.mjs`, and do not commit.

## Report

Per language: the eight sentences (and any variant rows), the register chosen, a source
for anything that needed deciding, and the title. Write it to
`tmp/notes/agents/kind-words-<group>.md` after each language, not at the end.
