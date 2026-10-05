# Writing familiar variants: the register switch

The boards address a stranger, so every sentence the traveller says is in the polite
register a stranger is owed: German *Sie*, French *vous*, Japanese *desu/masu*, Korean
*-yo*, Hindi *āp*. That stays the default and the base row. But the same traveller
also talks to a child, a friend made on the trip, a fellow backpacker, a host family --
and saying *Könnten Sie...* to a six-year-old is as wrong as saying *du* to a border
officer. A reader who wants it turns on a switch on the board, and where a sentence
addressed to the listener has a familiar form, the switch shows it.

This file is the brief for writing those familiar forms. It works exactly like the
listener-gender variants that came before it (read `speaker-variants.md` and the
"Whom a request is said to" paragraph of `summary.md` first): a second axis in
`data/registry/listener-axes.csv`, and rows in `data/lang/<code>/variants.csv`.

## What you write

1. **The axis**, in `data/registry/listener-axes.csv` (CRLF), two rows per language:

   ```
   language,axis,value,default,label,notes
   de,register,polite,1,Sie,"The base rows: Sie with the third-person plural verb, as to any adult stranger."
   de,register,familiar,0,du,"du with the second-person singular verb, to a child, a friend or a fellow traveller."
   ```

   `label` is what the board's switch shows at each end, **in the language itself**:
   the polite and familiar word for *you* where the language has one (*Sie / du*,
   *vous / tu*, *usted / tú*, *вы / ты*), or the shortest marker that tells the two
   apart where it does not (Japanese *です / だ*, Korean *요 / 반말*-style endings
   written as the language writes them). Keep it to a word or two; it sits on a switch.
   (The `listener_gender` rows leave `label` empty: their switch shows Mars and Venus.)

2. **The rows**, in `data/lang/<code>/variants.csv`, keyed `register=familiar`:

   ```
   register=familiar,taxi.please-stop-here,Halt hier bitte an,,…ipa…,"stop here please -- du, the imperative to someone you say du to",2,de-register-v1;fix=…
   ```

   Same columns as the language's variant file, a blank cell inherits, **CRLF**. Never
   write a `register=polite` row: polite is the base row.

   Where a language also declares `listener_gender` and the familiar form differs by
   the listener's gender too (Arabic, Hebrew, Hindi-family, Czech), write the combined
   keys -- `listener_gender=feminine|register=familiar` and
   `listener_gender=masculine|register=familiar`, the parts sorted as shown -- and
   check whether a plain `register=familiar` row is still needed for when the gender
   switch is off (it is: the switch may be off, and the familiar row must then be the
   neutral familiar form, or be omitted if no neutral familiar form exists).

## Which concepts

Only sentences the traveller says **to the listener** whose wording changes with the
register: requests and imperatives (*please stop here*, *could you make it colder*),
questions addressed to them (*do you speak English?*, *where are you from?*), and
greetings or thanks that take a different form (*Danke* does not change; *Dankeschön*
neither; Korean *감사합니다 / 고마워* does). Start from
`tmp/data/emphasis/board-concepts.tsv` (`python3 tmp/scripts/board_concepts.py` writes
it): only board concepts matter, because only the board has the switch.

**Never**:

- a sentence about the traveller themselves that addresses no one (*I am lost*) --
  unless the language marks the hearer even there (Japanese and Korean do, through
  the sentence ending, and those *are* in scope);
- an incoming reply (anything in a `replySets` entry or `board-answers`): what the
  stranger taps is theirs, and `variantOf` refuses incoming phrases anyway;
- a sentence for a situation where familiar address would never be used: anything on
  the emergency, pharmacy, medical, police or border boards. A familiar row there is a
  trap a reader could switch into by accident when it matters most. Skip those boards
  entirely.

## How to write the familiar form

- **The form a native speaker would use to a friend of the same age**, not slang and
  not childish: *Kannst du hier anhalten?* rather than *Halt mal an!*.
- **The same meaning**, the same slots (`{}` count must match -- the validator fails a
  mismatch) and, where the base row has one, a matching `romanization_*` and `ipa`.
  The IPA can be left blank for `python3 scripts/build_ipa.py --only <code>` to fill
  (run it afterwards; it fills variant rows), but a romanization column, where the
  language has one, is yours to write.
- **A language without a register distinction in a sentence gets no row for it.**
  Most English-like sentences in Germanic and Romance languages change only in the
  verb and pronoun; many Chinese sentences do not change at all (*您* to *你* is the
  one common case -- check it). Do not invent a difference.

## Sources

The register system of each language is well documented: that language's own
Wikipedia article on it (*Siezen und Duzen*, *Vouvoiement*, *T–V distinction*, 敬語,
높임법), the national language institute (Duden, Académie française, RAE, ÚJČ, the
National Institute of Korean Language), and the corpus's own `data/registry/NOTES.md`
politeness survey. Source policy as in `add-a-language.md`: never glosbe, wordhippo,
languagedrops, translate.com, kaikki or forums. Cite in `provenance` as the other
variant rows do.

## Checks, and writing as you go

After each language:

1. `python3 scripts/validate_data.py` -- **0 errors**; read the warnings for your files.
2. `python3 scripts/build_ipa.py --only <code>` to fill the IPA of your rows (for
   `uk` and `mr` the espeak library environment in `add-a-language.md` is needed),
   then the validator again.
3. A paragraph in `tmp/notes/agents/register-<group>.md`: the register system in one
   sentence, how many rows, the judgement calls, anything skipped and why.

A session limit can stop you mid-batch, so each finished language and its notes must
be on disk before you start the next. Do not commit; the coordinator reviews and
commits. Touch only `data/registry/listener-axes.csv`, your languages'
`variants.csv`, and your notes.
