# Fill-in frames: sentences that take the reader's own detail

A conversation-board button can say one of the phone owner's own details -- their name,
and next their country -- in the slot a template row leaves for it. The row is a corpus
sentence like any other, with `{}` where the detail goes, in all three of its cells:

```
introductions.my-name-is,我叫{},,wǒ jiào {},wɔ˧˩˧ tɕjɑʊ˥˩ {},...
```

At display time `resolvePhrase` (`core/conversation.js`) replaces `{}` with the detail
in the script cell, the romanisation and the IPA alike; the respeller passes `{}`
through, so the owner's "how to say it" line carries it too. The source policy and the
corpus conventions are `content/PROMPTS/add-a-language.md`'s; everything below is what
is different about a frame.

## The insert cannot inflect

What arrives in the slot is fixed text: a name as the owner typed it, or a country
name in its citation form. Nothing agrees with anything and no case ending is added.
So a frame is only correct if the slot is a place where the bare, nominative form is
grammatical. Russian `Я из {}.` is not -- *из* governs the genitive (*из России*) and
`Я из Россия` is wrong -- while Japanese `{}から来ました` is fine, the postposition
standing after the insert unchanged.

The dodges that work, in order of preference -- the same three the interface-strings
brief uses for its placeholders:

1. **A frame where the insert is the subject or a predicate nominative.** Finnish
   `Nimeni on {}.` ("my name is"), Russian `Моя страна -- {}.` ("my country is").
2. **Hang the case on a fixed head noun.** "I am from the country {}", where the language
   allows an apposition in the nominative.
3. **A colon.** Finnish `Olen kotoisin täältä: {}.` -- "I am from here:" -- which is what
   the Finnish row already does because *kotoisin* governs the elative.

A frame must still be a sentence a person says. Prefer a natural nominative frame over
a colon; use the colon only where there is no natural one, and say so.

## What to check and how to change a row

For each language, every row a fill-in button uses: `introductions.my-name-is` (the
name) and `introductions.i-am-from` (a country, once the country detail exists). For
each, decide whether the slot takes a bare nominative. If it does, leave the row. If it
does not, rewrite the row with one of the dodges above, keeping:

- `{}` exactly once in the script cell, the romanisation cell and the IPA cell, in the
  same position in the sentence;
- the row's `provenance` extended to say it was rewritten for a fill-in, and why;
- the IPA regenerated with `python3 scripts/build_ipa.py --only <code>` afterwards.

Do not touch a row that is right. Names in some languages take case in some positions;
if the language's grammar inflects personal names in the frame's position, treat the
name frame like the country frame.

## Report

Per language: each row checked, whether it passed, and for each rewrite the old row,
the new row, the grammatical reason and its source. Quote the output of the checks the
add-a-language brief lists, plus `python3 scripts/build_ipa.py --check --only <codes>`.
