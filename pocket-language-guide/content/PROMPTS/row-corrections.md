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
  that section disagree with the pack's own romaniser, `tmp/lang/hy/hy.py`. Run the romaniser
  over the pack, read every row whose cell it would change, and correct those that are
  wrong -- it is a lead, not an authority, where a row's own spelling is deliberate.
- **Georgian (`ka`) romanisations.** Eight disagree with the pack's own routine,
  `tmp/lang/ka/ka.py`: `aq` for აქ in three outdoors rows, `kondicioneri` in two taxi rows,
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
  `tmp/notes/agents/answers-concepts-south.md`; the packs' romanisers are under `tmp/lang/<code>/`.

- **Khmer (`km`) IPA against the pack's own spec** (`tmp/lang/km/SPEC.md`). Khmer's `ipa` is
  authored, not built -- `scripts/build_ipa.py` never fills it -- so a fix is written by
  hand in the spec's notation. Seventeen cells use letters outside its symbol list: seven
  write `c` for `tɕ` (the `air-travel.*` and `hitchhiking.*` rows), eight `v` for `w`, and
  one each `ɗ`, `ɤ`/`y` and `ɪ`, mostly in `about-me.*`. Four rows claim `ipa=km-analysis`
  with an empty cell -- three `taxi.*` rows and `medical-conditions.i-am-allergic-to-sulfa-drugs`,
  whose provenance (`km-med-v1`) names no source and which `tmp/notes/khmer.md` §15 says was
  left out for lack of one: on a safety row, source it or take its text out, never guess.
  `ពេញ` is read `peɲ` in two hike rows and in the spec's example but `pɨɲ` in Headley; and
  `toilets.is-it-only-for-customers` and `toilets.is-it-free` lack the `?` that makes them
  questions. The notes are the Khmer section of `tmp/notes/agents/answers-concepts-south.md`.

## What to write

Fix one item at a time and write it to disk before the next. Notes go to
`tmp/notes/agents/row-corrections.md` as you go: per row, old and new text, the source,
and anything left unchanged and why. Keep helper scripts in `scratchpad/corrections/`.
Run `python3 scripts/validate_data.py` after each item. Touch only the rows named here
(and the Hebrew route); do not edit boards, concepts or catalogues, and do not commit.

## A second pass: what the first pass saw beside its items

The first pass's agents did as asked: they fixed their items and reported what they saw
next to them without touching it. These are those rows. Everything above holds -- the
source policy, one item at a time, the notes, clearing a changed row's `ipa` -- and the
notes go to `tmp/notes/agents/row-corrections-2.md`.

- **Nepali (`ne`) romanisations that print a blank.** Three rows write the eyelash RA,
  र + ् + U+200D + य, and their `romanization_iso15919` carries `{}` where the joiner is:
  `slang.i-love-it` *mana par{}yō*, `police-consulate.someone-attacked-me` *gar{}yō* and
  `taxi.please-get-me-there-in-time-for-the-shinkansen` *pur{}yāidinuhōs*. `{}` is the
  engine's blank-slot marker, so the card's Latin line shows a space to fill in a
  sentence that has none; `validate_data.py` now fails a romanisation whose `{}` count
  differs from its concept's slots, and this item is done when it passes. Romanise the
  eyelash form as ISO 15919 writes it. The three `ipa` cells double the r (`pˈʌrrjoː`):
  `clean()` in `scripts/build_ipa.py` drops the joiner before espeak reads the word.
  Establish from a source how र्‍य is said; if the build is wrong, make the smallest change
  to the route that fixes it, run `python3 scripts/build_ipa.py --only ne`, and report
  every cell it changed.
- **Malay (`ms`), three more rows.** `transit-rides.i-went-past-my-stop` "Saya kelewatan"
  -- Kamus Dewan's *kelewatan* is lateness, so the row says "I am late";
  `hotel-requests.is-there-a-safe`, whose `text` is part English ("Ada safe deposit
  box?"); and `taxi.please-use-the-meter` "Tolong pakai argo", where *argo* is the
  Indonesian word for a taxi's meter.
- **Rows that address a driver as a man.** Hindi `hitchhiking.can-you-give-me-a-ride`
  (`देंगे`) and Punjabi (`ਦੇਵੋਗੇ`); and `hitchhiking.where-are-you-going` in Urdu (`آپ
  کہاں جا رہے ہیں؟`), Hebrew (`לאן אתה נוסע?`), Arabic (`إلى أين أنت ذاهب؟`) and Hausa
  (`Ina za ka?`, alt `Ina za ki?`). The traveller does not know who will stop. Reword
  each so it addresses nobody's gender, as the first pass did for Hindi's and Punjabi's
  `where-are-you-going`, and clear a `text_alt` that only carried the other gender.
- **Russian (`ru`) alternatives that fork a gender with no variant row.** Four
  `text_alt` cells are a masculine first-person past, so a woman who takes the
  alternative says it as a man: `lost-rescue.i-lost-my-passport` `Я потерял паспорт.`,
  `lost-rescue.i-sprained-my-ankle` `Я подвернул ногу.`, `lost-rescue.i-left-it-on-the-train`
  `Я забыл это в поезде.` and `payment-receipt.i-already-paid` `Я уже заплатил.`; their
  `text` is already neutral. Four more fork a third person:
  `introductions.this-is-my-friend`, `lost-rescue.my-friend-is-hurt` (`Моя подруга
  ранена.`), `family-intros.this-is-my-partner` and `family-intros.this-is-my-colleague`.
  `content/PROMPTS/speaker-variants.md` decides both -- its cleanup table for the first
  four, its rule that a companion has no axis for the rest.
- **Bengali (`bn`) romanisations outside the board answers.** The first pass brought the
  board answers into the pack's system and found 89 more cells the romaniser disagrees
  with, among them the eight `kind-words.*` rows (`ē`/`ō`, `khub` for খুব, `jan'ya` for
  জন্য, `y` for য়), `numbers-money.som` `sōma`, `dietary-needs.is-this-kosher` `eṭā kōśāra
  ki?`, and hand spellings such as `cek-ina`, `lifaṭa` and `peṭrolera`. The notes are the
  `bn` section of `tmp/notes/agents/row-corrections.md`. Run the romaniser, read every
  row it would change, and correct those that are wrong, listing each -- a deliberate
  spelling stays, with the reason.
- **Amharic (`am`) ኝ written `gn`.** `about-me.i-have-my-own-business` `āllegn`,
  `hitchhiking.i-only-need-to-go-to-the-next-town` `āllebign` and
  `hitchhiking.thank-you-for-the-ride` `silasaferugn`; the pack writes ኝ `ny`, and the
  build reads `gn` as /ɡ/ + /n/. `rail-station-words.maglev` `bemagnēt` is a true g + n,
  ማግኔት, and stays.

Not in this pass, because it is a design question rather than a wrong row: Arabic's 55
traveller rows that say `من فضلك` to one person the traveller can see. The letters serve
either listener; the romanisation and the IPA say *min faḍlak*, to a man.

## A third pass: what the second pass saw beside its items

Same rules as both passes above; notes go to `tmp/notes/agents/row-corrections-3.md`.

- **Malay (`ms`) IPA: a coda r comes back as a tap and a trill.** 112 cells write `ɾr`
  where the text has one r before a consonant -- `percuma` `pəɾrtʃˈumə`, `perhentian`
  `pəɾrhəntˈian` -- as Nepali's voice doubled its coda r. Establish from a source how
  a coda r is said in Standard Malay (a JIPA Illustration, a grammar of record); if the
  build is wrong, make the smallest change to the `ms` route in `scripts/build_ipa.py`,
  run `python3 scripts/build_ipa.py --only ms`, and report every cell it changed.
- **Malay words the corpus still takes from Indonesian.** `hike.csv`'s "Bas
  antar-jemput" and "Shuttle…" rows (PRPM has no *antar-jemput*; Malaysian bodies write
  *bas ulang-alik*), and the *Binatu* alternative of `laundry.laundromat`, which Kamus
  Dewan does not list. And `data/registry/section-titles/ms.csv`: "Darurat + perubatan"
  against the catalogue's *Kecemasan*, "Laundry" (*dobi*), "Rambu umum" (Kamus Dewan's
  *rambu* is a fringe or a marker post), *Kondisi* (marked Indonesian) and *mobilitas*
  (no entry). The strings that must keep matching a changed title are in the third list
  of `content/PROMPTS/usage-and-tap-strings.md`.
- **Drivers still addressed as a man.** `hitchhiking.can-you-give-me-a-ride` in Urdu,
  Arabic and Hausa, and Hausa's `taxi.please-stop-here` and `taxi.please-turn-around`.
  Reword each as the second pass did the others, keeping the reply each row's set
  expects.
- **Companions whose gender is parked in `text_alt`.** Masculine and feminine pairs for
  a friend, a partner or a colleague sit in `text_alt` in Ukrainian, Polish, Croatian and
  Arabic, and Czech writes them with a slash. `content/PROMPTS/speaker-variants.md`'s rule
  that a companion has no axis decides them, as it decided Russian's in the second pass.
- **Marathi (`mr`) writes the eyelash RA `ṟ`**, where ISO 15919:2001 has `r̆` (letter 048a,
  "used in Marathi and Nepali") and Nepali now follows it. Check which system the pack's
  column claims and bring the cells into it.

## A fourth pass: the rest of the driver's rows

The third pass fixed the rows its brief named and found more of the same on the transport
board, all said to a driver the traveller cannot choose. Same rules; notes to
`tmp/notes/agents/row-corrections-4.md`.

- **Arabic** addresses the driver with a masculine imperative in `taxi.please-stop-here`
  (توقّف), `taxi.please-take-me-here` (خذني), `taxi.could-you-make-it-colder` and
  `-warmer`, `taxi.can-you-wait-for-me-here` and `transit-rides.please-tell-me-where-to-get-off`.
  The pack's own neutral request is أرجو with a verbal noun (`أرجو التأكيد`), and a
  first-person "I want to get off here" carries no gender either.
- **Hausa**: `taxi.please-take-me-here`, `taxi.can-you-wait-for-me-here`,
  `taxi.could-you-make-it-colder` and `-warmer`, and
  `transit-rides.please-tell-me-where-to-get-off`. The third pass used the bare imperative
  (UCLA's Hausa grammar: said to a man or a woman, no less polite) and Bargery's impersonal
  *a*.
- **Urdu**: `taxi.could-you-make-it-colder` and `-warmer`.

Each row keeps the kind of answer its reply set expects: a request stays a request.

## A fifth pass: who a row addresses, on the boards a traveller uses in the street

Four passes have fixed rows said to a driver, a passer-by or the traveller in the
masculine, one list at a time, and each found more. This pass takes the class instead:
**every corpus row the `transport` and `directions` boards show** -- their message
buttons and the answers of every reply set those buttons use, 49 concepts as the boards
stand -- in each language whose verbs, pronouns or adjectives mark the gender of the
person spoken to. The taxi screen is the one a traveller uses without looking at the
phone, so it goes first.

For each language:

1. **State how it marks the listener's gender** -- imperatives, second-person verbs or
   pronouns, participles and futures that agree with the listener, adjectives in "are you
   ready?" -- from the pack's own notes and a grammar of record, and write those markers
   down before reading a row.
2. **Read every one of the boards' rows** for them, the answers included: an answer is
   the stranger's words to the traveller, and `content/PROMPTS/board-answers.md` requires
   those to be neutral about the traveller's gender as well.
3. **Reword a marked row** so it addresses nobody's gender, with the pack's own neutral
   patterns where it has them (Arabic's أرجو with a verbal noun, Hausa's bare imperative
   and impersonal *a*, the Indic passive and "can I get…?"), and keep each row the kind of
   utterance its reply set expects. A direction given as an answer can be a phrase with
   no verb ("straight on", "to the left") where the language says it that way.
4. **Count, and list, marked rows elsewhere** in the pack without changing them, so the
   size of what is left is known.

The languages, in two groups: Arabic, Hebrew, Hausa and Amharic; and Hindi, Urdu,
Punjabi, Marathi, Czech and Polish, with a check of the same rows in Russian, Ukrainian,
French, Spanish, Italian and Portuguese for adjectives that agree with the listener.
Notes go to `tmp/notes/agents/row-corrections-5-<group>.md`.

**And keep the natural forms.** The owner wants a switch for the listener's gender on the
boards, neutral by default, so a gendered wording is not thrown away when its row is made
neutral. For each row you reword, write its masculine and its feminine form as listener
variants, one line each in `tmp/notes/agents/listener-variants-<code>.csv`, with the columns
of `data/lang/<code>/variants.csv` and `variant` set to `listener_gender=masculine` or
`listener_gender=feminine`; leave `ipa` empty and record the source in `provenance`. The
masculine is often the row's old text. Where the neutral form is what people naturally say
anyway, write no variants and say so. The coordinator merges the file once the axis exists.

## A sixth pass: what the earlier passes saw beside their items

Same rules as above; notes go to `tmp/notes/agents/row-corrections-6.md`.

- **Slash pairs a reader is shown.** `quick-responses.*` and other answer rows in
  Russian, Ukrainian, French, Italian, Hindi and Czech show two alternatives joined by a
  slash ("Хорошо / ладно"), and so do six English board labels (`yes / right`, `okay /
  can`); English's `Hello (polite)` shows its register tag as text on a button. The owner does not want internal alternative glosses on the
  boards: a user-facing label carries one reading. For each, keep the one a stranger would
  most naturally say for the concept's meaning (read the English and the concept's
  `notes`), move a genuinely different second wording to `text_alt` only where the column
  already means "a second wording" in that pack, and say which you kept and why. A slash
  that is a gender pair is `speaker-variants.md`'s business, as the second pass found.
- **Hausa ƙ spellings.** Rows that write the hooked ƙ as a plain k (or the reverse) in
  words Bargery or the Hausa Wikipedia spell otherwise; check every `ƙi`/`ki` the pass
  can find and correct the ones a dictionary of record settles.
- **Amharic `i-will-find-someone`**: the row's text and its `literal` disagree about who
  will find whom. Settle it from the concept's English and notes, and fix whichever is
  wrong.
- **Ukrainian 'Ie' / 'Ye'**: romanised cells that write the initial Є inconsistently;
  bring them into the system the pack's column claims (the national 2010 table writes
  *Ye* word-initially and *ie* elsewhere).
- **Urdu `maiṁ` / `maiñ`**: the romanisation of میں is written two ways; bring every cell
  into the one system the column claims.
- **Spanish `apurado/a`**: a gender slash in a Spanish row the second pass did not reach;
  apply `speaker-variants.md` (or `board-answers.md` if it is an answer: answers are
  written neutral about the traveller).
- **Arabic and Hausa marked rows elsewhere**: the fifth pass counted rows outside the two
  street boards that still mark the listener's gender (Arabic 87, Hausa 38). Take the
  ones on the boards a traveller uses most -- `food`, `shopping`, `lodging`, `time` --
  and reword them the way the fifth pass did, keeping the natural forms as listener
  variants in `tmp/notes/agents/listener-variants-<code>.csv`.

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.
