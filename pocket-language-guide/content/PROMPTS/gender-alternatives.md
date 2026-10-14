# A template's words that agree with what fills its blank

A template row leaves a blank, `{}`, that the traveller writes a word into on the printed
card -- *¿Dónde está el {} más cercano?* -- and in many languages the words around it
agree with that word's gender: *el / la*, *cercano / cercana*. The card cannot know which
word will go there, so a row can now offer one form per gender, and the card prints them
joined, each in its gender's colour:

    ¿Dónde está [el|la] {} más cercan[o|a]?   ->   ¿Dónde está el/la ___ más cercano/a?

`core/alternation.js` and `summary.md` describe the mechanism; `python3
scripts/validate_data.py` holds its rules. This brief is for the data: which rows need it,
and what colour each gender prints in. `content/PROMPTS/add-a-language.md`'s source policy
and the general rules of `content/PROMPTS/row-corrections.md` bind it.

## The notation

- `[a|b]` is one group: the forms in the order `data/registry/genders.csv` gives the
  language's genders, as many as it gives. Every group in a row has that many forms.
- A group may sit inside a word (`cercan[o|a]`) in Latin, Cyrillic and Greek script; in
  every other script, and in any word where the forms share nothing, write the whole
  word (`[el|la]`, `[قريب|قريبة]`). A run cut inside an Arabic or Devanagari word loses
  its joins and its vowel signs, and the validator refuses it.
- Only in a row with a `{}` blank, and not in one that also names a language
  (`{target}`, `{source}`). Never in a concept a board says (the validator lists them): the
  board's blanks are filled with a whole sentence of their own.
- The same groups, in step, in `text_alt` and the `romanization_*` column where those
  carry the agreeing words. The `ipa` column is rebuilt by the builder from the groups;
  never write groups into it by hand. A curated respelling
  (`data/respell/overrides/<code>__en__en-US.csv`) of a changed row is rewritten with the
  same groups (`DOHN-deh es-TAH [el|lah] {} mahs ser-KAH-n[oh|ah]`) and its `text` column
  set to the new text, or removed.

## What to do

1. **`data/registry/genders.csv`** (`language,gender,color,notes`; LF line endings, as
   the file has). For every language that gets a group: its genders in the order its
   groups are written, counting only the forms a singular word in the blank makes the
   template take (Romanian's neuter takes the masculine in the singular, so Romanian has
   two; German and Russian have three). Masculine first, then feminine, then any other,
   unless the language's own grammars order them otherwise -- say so where they do.
2. **The colours.** For each language, the colours its own culture reads as masculine and
   feminine, from evidence a reader can check: public-toilet signage conventions in the
   countries that speak it, national or industry signage standards, children's-goods
   conventions documented in that language's own Wikipedia or a published study. Most
   will be blue and red; where a culture's convention differs, use its colours and cite
   it. A third gender (neuter, or a common gender) has no such convention anywhere you are
   likely to find: choose one colour for it, the same in every language, distinct from the
   other two. Every colour must read as text on white paper at 5pt (contrast ratio at least
   4.5:1 against #ffffff), and the colours of one language must stay distinguishable to a
   reader with red-green colour blindness (a blue against a red does; two greens do not).
   Where conventions agree, use the same hex in every language rather than a slightly
   different shade per pack.
3. **The rows.** Every template row (`{}` in `text`) in every pack: find the words whose
   form depends on the gender of the word in the blank -- articles, adjectives,
   demonstratives, participles, verbs -- and write their groups. Start from
   `directions.where-is-the-nearest` and `utility-templates.is-there-nearby`
   (`tmp/notes/agents/row-corrections-14.md` lists the packs where the fourteenth pass
   left them because no wording agreed with any filler), then survey the rest. A row whose
   words do not agree with the filler stays as it is; a row whose agreement depends on
   number or case as well as gender is out of scope -- list it in your notes.
4. **Speaker-gender slashes left over from before the variants.** A few rows still write
   the speaker's gender as a slash in the text or its alternative: Spanish
   `etiquette.dressed-appropriately` *¿Voy vestido/a apropiadamente?*, and Spanish and
   Italian `text_alt` cells such as *Estoy perdido/a*, *Sono diabetico/a*. That is the
   speaker's gender, which `variants.csv` already serves (`speaker_gender=feminine`): give
   the base row its masculine form and a feminine variant row where it has none, and
   clear the slashed alternatives the variants now cover, as the Russian `text_alt` pass
   did. Find any others the same way.

Afterwards rebuild IPA for every language whose rows changed
(`python3 scripts/build_ipa.py --only <codes>`; a row whose genders' readings do not line
up word for word makes the builder stop with the row named: reword it so they do), run
`python3 scripts/validate_data.py` (0 errors, no new warnings), and
`node --test tests/alternation.test.mjs tests/pack.test.mjs tests/speaker.test.mjs`.

## What to write

Notes go to `tmp/notes/agents/gender-alternatives.md`: the colours per language with the
evidence for each, the neuter colour and why, every row changed (old -> new), and every
row surveyed and left, with why. Provenance `fix=`/`was=`/`rule=`/`gender-alternatives-v1`.
Do not edit code, boards, concepts or catalogues; do not commit.
