# The questions the correction and register passes left for the owner

The passes in `row-corrections.md` and `register-variants.md` settled what a source could
settle and set aside what looked like a matter of taste. This brief is for researching those
questions properly: each one is either settled by a source after all, in which case fix it
by the rules of `row-corrections.md` (its general rules are binding here, and so is
`add-a-language.md`'s source policy), or it is genuinely a choice, in which case write the
evidence and the options so the owner can choose in a sentence.

The test for "settled": a dictionary of record, the language's own Wikipedia (by revision),
a statutory or professional style guide, or a grammar says which form a traveller should
use in the situation the concept names. A preference of the agent who wrote the row, or of
this one, is not a source.

## The questions

1. **`quick-responses.please-go-ahead` where no offering word was found.** The concept's
   note (`data/concepts/social.csv`) is the offering *please*: after you, here you are,
   please do. Hindi, Urdu, Bengali, Gujarati, Nepali, Odia, Telugu, Tamil, Malayalam,
   Kannada, Marathi and Yoruba rows say "say it", "certainly" or the request word
   (`tmp/notes/agents/row-corrections-13b.md`, `-15.md`). For each, find how the language
   offers -- a word, or the act's own polite imperative the notes mention (*आइए*, *लीजिए*) --
   and say which reading of the concept the row can honestly carry. If none can, say so; the
   owner may scope the concept away from those languages.
2. **`utility-templates.how-much-is` with a typed quantity.** Italian *Quanto costa {}*,
   Spanish *¿Cuánto cuesta {}?* and Portuguese *Quanto custa {}* agree with one thing; a
   traveller writing *2 biglietti* needs *costano*. What do the languages' phrasebooks and
   shop usage do, and is there a wording right for both (a label, *Prezzo di {}*, or the
   impersonal *Quanto viene {}*)?
3. **The register switch's own labels.** The switch shows the two words it chooses between
   (`data/registry/listener-axes.csv`, the `label` cells): Polish shows *pan/pani / ty*, a
   slash inside a label, which the owner avoids in anything a reader sees; Japanese shows
   *です / だ*. For each, what would a speaker recognise as the name of the two ways of
   speaking, in one word each, with no slash?
4. **Register calls the passes made on their own judgement** (`tmp/notes/agents/register-3.md`,
   `-4.md`, `-5.md`, `-6.md`, "Coordinator calls"): Polish *Proszę* + infinitive treated as polite
   and given *ty* imperatives (German's *Bitte ... zeigen* was judged register-free); Greek *Γεια
   σου* on both the hello and the goodbye button; Czech goodbye *Čau* and Polish *Na razie*,
   chosen to differ from hello; Dutch *alstublieft* -> *alsjeblieft* in 21 rows; Hungarian rows
   that change only *kérem* -> *kérlek*; Persian and Malay greetings left polite where
   Indonesian's changed; the Vietnamese system (drop *ạ*, *xin* -> *nhé*, keep *tôi*), cited
   only to vi.wikipedia and vi.wiktionary because Hoàng Phê was unreachable. For each, does a
   source support the call, contradict it, or leave it open?
5. **Greetings the owner was asked about**: Portuguese `social-basics.hello-polite` *Olá* with
   *Oi* as its alternative (the pack is European Portuguese); Turkish `social-basics.hello`
   *Merhaba* and whether the polite row should differ from it; Urdu's polite hello against
   Hindi's (*नमस्कार* / *नमस्ते*); Chinese `introductions.how-are-you` *你好吗？*, which the
   Wikivoyage phrasebook calls understood but stilted (`tmp/out/crosscheck/zh-Hans.csv`).
6. **Amharic `quick-responses.please-go-ahead`** *ይኸው / ይለፉ* (here it is / pass), written
   from Leslau with no general offering word found and Kane unavailable.

Arabic rows are out of scope here: another agent is rebuilding the Arabic IPA at the same
time. List any Arabic finding in your notes instead.

## What to write

Notes go to `tmp/notes/agents/open-questions.md`, one section per question: what each source
says (with its URL or revision), the verdict (settled and fixed / settled and left / a
choice), and for a choice, the options in a line each with what each would change. Fix
settled rows as `row-corrections.md` says, with `open-questions-v1` in their provenance, one
question at a time, running `python3 scripts/validate_data.py` after each. Do not edit
boards, concepts, catalogues or code; do not commit.
