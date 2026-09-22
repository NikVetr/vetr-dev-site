# Writing the massage and spa rows

Sixteen sentences in `massage-spa`, and the last board pinned to one language. Every
other conversation board reaches 51 listeners; this one reaches **one**, because all
sixteen of its concepts carry `applies_to: zh-Hans` and were written for a Mandarin
massage parlour. Nothing else about the board is narrow — the tree, the reply sets and
the grid are the same machinery as the other seven.

Read `content/PROMPTS/add-a-language.md` for the corpus conventions and the source
policy before starting. This file is what is different about *these* rows.

## Who is speaking, and from what position

**Ten of the sixteen are said face down on a table, by someone who cannot see the
person they are speaking to, and often cannot move.** That is not colour; it decides
the wording:

- **They have to be short.** Someone reaching for a phone with one hand, cheek in a
  face cradle, is not reading a subordinate clause. `please-stop` in Mandarin is 停,
  not a polite request to conclude the treatment.
- **They have to be unmistakable at a glance and out of focus.** `stronger-pressure`
  and `more-gently` are the pair most likely to be confused, and the board puts them
  side by side. Choose wordings whose *shapes* differ, not only their meanings.
- **`please-stop` is deliberately not softened.** It ends the session. A language whose
  ordinary polite register would pad it should still keep it blunt here, and say so in
  `notes` if that is a departure from how that language usually asks for something.
  Compare `please-pause`, which must say *temporarily* on its own — a reader who taps
  the wrong one of those two gets the opposite of what they meant.

**Six are the therapist's replies**, tapped by them and read by the traveller. Those
follow `content/PROMPTS/board-answers.md` in full: the register is the trade's, not a
phrasebook's, and they must be **naturally gender-neutral**, because the app never asks
a stranger anything about themselves. `reply-ask-supervisor` is the uncertainty answer
the specification requires and it names a person; check that your language can do that
without gendering them.

## What is culturally particular, and what is not

The massage trade is not the same trade everywhere, and this is the main risk in the
set. Before writing, establish from sources of record how the service is actually
described where your language is spoken:

- **`focus-on-feet` is a service of its own** in much of East and Southeast Asia and a
  part of a full-body massage elsewhere. The concept means *spend the time on my feet*
  either way, but the natural sentence differs.
- **`focus-on-neck` and `focus-on-shoulders`** are grouped by the trade itself in some
  languages under one term. They are still two concepts — the board offers both — but
  if your language has a single ordinary word covering both, say so in `notes` rather
  than inventing a distinction speakers do not make.
- **Pressure vocabulary is technical.** "Stronger" and "gentler" here are about
  *pressure*, not about speed, force of character or water temperature. Several
  languages have a specific pair the trade uses; find it rather than translating the
  English adjectives.
- **`that-pressure-is-good` must read as a confirmation, not as praise.** *Keep it
  there.* A sentence that reads as "you are doing well" is the wrong act.

## Widening the scope is part of the job

Each concept currently carries `applies_to: zh-Hans` in `data/concepts/hotel.csv`.
When a concept has been written in enough languages, **remove its `applies_to`** — the
board index recomputes reach from the rows that exist, so the scope is what is holding
the board at one listener even after the rows land. Removing it before the rows exist
does the opposite of helping: `missingPhrases` will then report the board as broken for
every language that is short.

`scripts/build_board_index.mjs` is the arbiter. Run it and read the number.

## The two that are not really spa rows

`massage-spa.reply-none-of-these` is a byte-identical copy of
`board-answers.none-of-these` and the board no longer uses it — the general row
generalises it, as that concept's own note says. Do not translate it. If you find other
rows in this section that duplicate a `board-answers` row exactly, report them rather
than translating twice; an entry is a per-language realization of a
language-independent concept, and two concepts with one meaning drift.

`emergency-medical.it-hurts-here` is on this board and is **not** in this section. It
is already written in every language, which is the indexing-rather-than-copying rule
working as intended.
