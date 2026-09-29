# Correcting rows the research agents found wrong

While writing the answers audit's eighteen concepts into every pack, the research agents
read their packs' neighbouring rows and found some that are wrong. They were told not to
touch them, and did not; this brief is for fixing exactly those, from sources, and
nothing else. `content/PROMPTS/add-a-language.md` is binding -- its source policy above
all -- and so is `content/PROMPTS/board-answers.md` for any `board-answers.*` row: those
are the other person's words, neutral about the traveller's gender and about the
speaker's.

Each item names the rows and what the agent that found it saw. Check the finding against
a dictionary of record or the language's own statutory or professional source before
changing anything -- an agent's reading is a lead, not a source -- and where it does not
hold up, leave the row and say why. Where a row's text changes, clear its `ipa` cell (the
coordinator rebuilds it) and keep its romanisation in step, in the pack's own system.
Provenance records the correction and its source, as the pack's rows do.

## The items

- **Malay (`ms`) rows that read as Indonesian.** `transit-rides.what-is-the-next-stop`
  "Pemberhentian berikutnya apa?" -- Kamus Dewan gives *pemberhentian* as dismissal from a
  job; Malay is *perhentian seterusnya*. Also named: `social-basics.no-problem`'s
  `text_alt` "Nggak apa-apa" (Jakarta colloquial), `taxi.please-take-me-here` "Tolong
  antar" (Malaysian *hantar*), `quick-responses.does-not-work-no` "Rusak" (Malay *rosak*),
  `phone-text-power.please-confirm` "Tolong konfirmasi" (*sahkan*), and
  `communication.i-do-not-understand` "Saya tidak mengerti" (*faham* is the everyday
  word). Then search the pack for the other common Indonesian-only forms -- *mobil*,
  *sepeda*, *kantor*, *karcis*, *apotek*, *rumah sakit*, *bis*, *ponsel*, *gratis* and
  their like -- and correct each one Kamus Dewan (PRPM) shows is not the Malaysian word,
  listing every change.
- **Arabic (`ar`) `board-answers.please-wait` and `board-answers.say-it-again`** are
  romanised *min faḍlak*, which addresses a man; they are said to a traveller whose
  gender the speaker does not know. Reword both so they address nobody's gender, in
  script and romanisation.
- **Amharic (`am`) question rows that romanise አለ as *āle*.** The builder reads *āle* as
  "he said" and *ālle* (geminate) as "there is". The finder named
  `food-ordering.is-a-table-available`, `hotel-basics.are-any-rooms-available`,
  `shopping.do-you-have-this-in-stock`, `toilets.is-there-a-toilet-on-board`,
  `atm-cash.is-there-a-fee` and `hitchhiking.is-there-room-for-two`, "and more": find them
  all, and fix only those where አለ is the existential.
- **Yoruba (`yo`).** `toilets.is-it-free` "Ṣé ó fọ́fẹ́?" (the pack's
  `hotel-basics.is-wi-fi-free` has *ọ̀fẹ́ ni*); `communication.i-do-not-understand` and
  `communication.i-cannot-read-understand` "Mi ò yé mi", where the usual form is *Kò yé
  mi*; and `board-answers.i-am-calling-an-ambulance`'s untoned *alaisan*. Tone marks come
  from a source, never from memory.
- **Urdu (`ur`) `communication.i-do-not-understand-spoken`.** Its `literal` claims women
  say آ رہی, a verb that does not agree with the speaker. Correct the note.
- **Hebrew (`he`) stress on a final *-ey*.** The pack's IPA route (`scripts/build_ipa.py`,
  the `bgn` route for `he`) stresses words such as *lifney* and *aẖarey* on the wrong
  syllable. Establish the rule from a source, then make the smallest change to that route
  that fixes it, run `python3 scripts/build_ipa.py --only he`, and report every cell it
  changed. This is the one item that touches a script.

- **Nepali (`ne`).** `hotel-basics.is-wi-fi-free` writes `नि:शुल्क` with an ASCII colon
  where the visarga `ः` belongs, and romanises it `ni:śulka`. `board-answers.stay-here`'s
  `literal` says `rāmrō` is invariant, where Schmidt gives a feminine `राम्री` -- the row
  itself is right, the note is not. Six `massage-spa.*` rows cite glosbe or an aggregator,
  which the source policy bans: re-source each from a dictionary of record or the
  language's own professional usage, and change the wording only where the source does.
- **Hindi and Punjabi `hitchhiking.where-are-you-going`** address a male driver and park
  the feminine in `text_alt`. The traveller does not know who is driving: reword each so
  it addresses nobody's gender, as `board-answers.where-to` does, and clear the `text_alt`.
- **Bengali (`bn`) romanisation.** The older `board-answers.*` rows romanise with `ē/ō`
  where the rest of the pack writes `e/o`. Bring them into the pack's own system.
- **Odia (`or`).** Older rows cite "Odisha public signage" without naming a document. Name
  the document where one can be found; where none can, say so in the notes and leave the
  rows.

- **Armenian (`hy`) romanisations.** `board-answers.it-is-over-there` `Այնտեղ է։` is
  romanised `Aystegh e.`, which spells "here"; it is `Ayntegh e.`. Four more of the older
  `board-answers.*` romanisations are wrong letter for letter, the eighteen older answers
  that differ use an ASCII `'` where the pack writes `’` (U+2019), and three rows outside
  that section disagree with the pack's own romaniser, `tmp/hy/hy.py`. Run the romaniser
  over the pack, read every row whose cell it would change, and correct those that are
  wrong -- it is a lead, not an authority, where a row's own spelling is deliberate.
- **Georgian (`ka`) romanisations.** Eight disagree with the pack's own routine,
  `tmp/ka/ka.py`: `aq` for აქ in three outdoors rows, `kondicioneri` in two taxi rows,
  `bizinesi`, and a `p'roch'uli` with apostrophes the column never uses. Same method.
- **Persian (`fa`) romanisations.** Eight cells contain the zero-width non-joiner (U+200C)
  inside the Latin text, `kojā mi‌ravid?` among them. The joiner belongs to the script,
  not to its romanisation: take it out of every romanisation cell, and nothing else.
- **Russian (`ru`) `text_alt`.** Ten rows still keep the feminine form in `text_alt`
  although each already has its row in `data/lang/ru/variants.csv`, which is how the
  speaker's gender is served now. Clear those `text_alt` cells where the variant row
  says the same thing, and list any where it does not.

- **Tamil, Telugu and Malayalam romanisations** that disagree with their packs' own
  romanisers. Tamil: `board-answers.how-many` romanises `எத்தனை` as `etaṉai` (the pack's
  romaniser and the row's own IPA say `ettaṉai`), and `about-me.i-am-retired` writes
  `peṭṟēṉ` for `பெற்றேன்` (`peṟṟēṉ`). Telugu: `board-answers.stay-here` writes `mancidi`
  and `uṇḍaṭaṁ`, where the pack's other cells write the anusvara `ṁ`, and the `about-me.*`
  and `family-intros.*` rows have similar hand spellings (`īmē` for `ఈమె`). Malayalam:
  `board-answers.i-will-find-someone` writes `orāḻe` for `ഒരാളെ` (`orāḷe`), the
  `kind-words.*` rows write `valare` for `വളരെ` (`vaḷare`), `about-me.i-am-a-teacher`
  writes `ṭīcaṟāṇŭ` (`ṭīccaṟāṇŭ`), and `board-answers.what-is-your-name` writes `pēru`
  where the pack's other `പേര്` cells write `pērŭ`. The notes are in
  `tmp/agent-notes/answers-concepts-south.md`; the packs' romanisers are under `tmp/<code>/`.

- **Khmer (`km`) IPA against the pack's own spec** (`tmp/km/SPEC.md`). Khmer's `ipa` is
  authored, not built -- `scripts/build_ipa.py` never fills it -- so a fix is written by
  hand in the spec's notation. Seventeen cells use letters outside its symbol list: seven
  write `c` for `tɕ` (the `air-travel.*` and `hitchhiking.*` rows), eight `v` for `w`, and
  one each `ɗ`, `ɤ`/`y` and `ɪ`, mostly in `about-me.*`. Four rows claim `ipa=km-analysis`
  with an empty cell -- three `taxi.*` rows and `medical-conditions.i-am-allergic-to-sulfa-drugs`,
  whose provenance (`km-med-v1`) names no source and which `tmp/khmer.md` §15 says was
  left out for lack of one: on a safety row, source it or take its text out, never guess.
  `ពេញ` is read `peɲ` in two hike rows and in the spec's example but `pɨɲ` in Headley; and
  `toilets.is-it-only-for-customers` and `toilets.is-it-free` lack the `?` that makes them
  questions. The notes are the Khmer section of `tmp/agent-notes/answers-concepts-south.md`.

## What to write

Fix one item at a time and write it to disk before the next. Notes go to
`tmp/agent-notes/row-corrections.md` as you go: per row, old and new text, the source,
and anything left unchanged and why. Keep helper scripts in `scratchpad/corrections/`.
Run `python3 scripts/validate_data.py` after each item. Touch only the rows named here
(and the Hebrew route); do not edit boards, concepts or catalogues, and do not commit.
