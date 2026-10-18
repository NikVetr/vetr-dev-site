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
coordinator rebuilds it) and keep its romanisation in step, in the pack's own system; where
it has a curated English respelling in `data/respell/overrides/<code>__en__en-US.csv`,
rewrite that row for the new wording (its `text` column records the wording it respells) or
remove it -- the validator refuses a respelling whose `text` is no longer the row's.
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

- **What the key-words passes noticed** (each checked against a source before changing
  anything): Spanish `time-words.evening` and `time-words.night` are both *la noche*, side
  by side on the same screens; Spanish `Viajamos juntos` and other "we" rows are
  `speaker-variants.md`'s third-party case and stay masculine plural, so confirm only;
  Portuguese `Sem gergelim` uses the Brazilian word in a European pack (*sésamo*);
  Russian `Я по работе` and `Я к родственникам` lack the final full stop every other ru
  label has, and `Туалет не смывается.` should be checked for naturalness; Korean
  brother and sister are the *younger* forms where Japanese has the elder -- the concept's
  notes decide which; four Hindi replies are worded as obligation ("I have to show the
  way") where an offer is meant; Hindi's room safe and lockers are both `लॉकर`; and the
  slash alternatives on French, Italian, Russian and Hindi reply labels (`oui / c'est ça`)
  are the slash-pair item above. The third key-words batch adds: Greek
  `introductions.this-is-my-friend` shows "ο φίλος μου / η φίλη μου" (a companion, so one
  neutral form or the masculine, as `speaker-variants.md` rules); the laundromat is the wrong
  thing in Swedish (*tvättstuga* is a building's laundry room), Greek (*καθαριστήριο* is a dry
  cleaner) and Czech (*prádelna* is a laundry, not self-service); Polish `Jak się pan
  nazywa?` and Czech `Mohl byste nás vyfotit?` address a man (Czech declares the listener
  axis, so write its neutral form and keep the two as listener variants); Dutch `voorbij
  gereden` is one word; Swedish `Ring min anhörig` and `Jag hälsar på familj`, Czech `Moje
  dítě se pohřešuje` and Polish `Czy mogę prosić o zdjęcie?` (which loses "of us") need a
  reader's check; Ukrainian (and Russian) `time-words.afternoon` is the word for "day"; and
  Turkish `none-of-these` can read as a refusal to answer.

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.

## A seventh pass: Hebrew spelling, the slash rows left, and the fourth key-words batch

Same rules as above; notes go to `tmp/notes/agents/row-corrections-7.md`. Where a row
whose concept has a key in `data/emphasis/<code>.csv` changes, update the key so it is
still in the sentence (the validator fails one that is not) and list it.

- **Hebrew standard spelling.** Some of the pack's base `text` cells are the pointed
  `text_alt` with the points stripped, so they are in defective spelling where a Hebrew
  reader expects the standard unpointed spelling of the Academy of the Hebrew Language
  (כללי הכתיב המלא): `מתר` for מותר, `חרום` for חירום, `לנשם`, `דמום`, `מחסר`, `סכרת`,
  `סכר`, `לכתב`, `לעזר`, `לחזר`, `מקדם`, `להשאר`, `להכנס`, `שלחן`, `לשנים` -- and the pack
  already writes some of the same words in full elsewhere (`להישאר`, `לשניים`). Those are
  the leads; find every such cell, not only these (a cell identical to its `text_alt` with
  the points removed is the place to look), and respell by the Academy's rules. The
  pointed `text_alt` and the romanisation stay as they are unless they are wrong too.
- **Hebrew word choices**: `trail-transport.is-there-cell-signal-here` uses `קלט`
  ("input") where reception is `קליטה`; `pharmacy-symptoms.i-think-it-is-infected` uses
  `נדבק` where an infected wound is `הזדהם`; `air-travel.where-is-check-in` writes
  `הצ'ק-אין` with an ASCII apostrophe where the lodging rows use the geresh `׳`.
- **The slash rows left in the packs the sixth pass did not name**: the 54 cells in 17
  packs listed under "Slash rows left in the languages the brief does not name" in
  `tmp/notes/agents/row-corrections-6.md`, by the sixth pass's slash rule. Three need a
  choice rather than the rule, and the choice is to be made from the concept's English
  and `notes` and a source, and recorded: `ka` okay-can, `ne` `हो / हजुर`, `fi`
  `kyllä / joo`. `pharmacy-symptoms.paracetamol-acetaminophen` stays as it is everywhere.
- **What the fourth key-words batch noticed** (`tmp/notes/agents/key-words-4.md`, each
  language's "Rows to check"): Persian `دلِ درد` (one word, `دل‌درد`), `i-will-take-this`
  and `i-want-this` with the same text, the laundromat as `خشکشویی` (a dry cleaner), and
  the name reply missing the ezafe its neighbours write; Urdu's five board requests
  worded for a man with no feminine variant (`speaker-variants.md`), `which-exit` with
  which-gate's text, and replies worded as obligation (the Hindi case); Bengali
  `you-are-welcome` as the greeting `স্বাগতম`, and the fish- and pork-stock questions
  asking about the meat; Thai and Vietnamese fish stock as fish sauce, Thai `ฉันชื่อ`
  against the pack's own `ผม` and `กินเจ` beside vegan, Vietnamese juice as `nước ngọt`,
  and both packs' photo request losing "us"; Indonesian `vegetarian murni` beside
  `Saya vegan`, the bandage as `Plester`, the conditions-card label, and the polite hello
  `Selamat siang` (a midday greeting).

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.

## An eighth pass: what the seventh pass and the fifth key-words batch saw

Same rules as above; notes go to `tmp/notes/agents/row-corrections-8.md`, and keys in
`data/emphasis/<code>.csv` follow any word they name that changes, as in the seventh pass.

- **Hausa rows said only to a man.** Hausa declares the listener axis, yet six board rows
  address a man with no other wording: `can-you-help-me` (`ka`), `do-you-speak-english`
  (`Kana`), `please-write-it-down` (`ka`), `what-is-your-name` (`sunanka`),
  `nice-to-meet-you` (`kai`), `you-are-very-kind` (`Kai`). Reword each the way the fifth
  pass did the street boards -- a neutral base row where Hausa has one (the plural of
  respect, as the pack does elsewhere), and the forms to a man and to a woman as listener
  variants in `variants.csv`. Also: `which-exit` has `which-gate`'s text; ironing is
  usually *guga*, not *bugu*; `no-nuts` lists *goro*, the kola nut; fever is *zazzaɓi* and
  a student *ɗalibi* (check the hooked letters against Bargery or the Hausa Wikipedia, in
  every row that writes them).
- **Amharic `ዪህች`**: four family rows (wife, daughter, mother, sister) write U+12EA where
  the demonstrative is `ይህች` (U+12ED), eight occurrences; `you-are-very-kind` is in the
  third person; `nice-to-meet-you` has the words of `i-like-it-very-much`.
- **Hebrew pointing the seventh pass saw**: `sim-data.how-much-data-is-included` pointed
  and romanised *kolul* (כָּלוּל, *kalul*); `slang.lets-go` *nizuz* (נָזוּז, *nazuz*);
  `lost-rescue.i-sprained-my-ankle` pointed as a nif'al that cannot take את (נָקַעְתִּי).
  The text cells are right; the pointing, romanisation and IPA follow.
- **Swahili**: `board-answers.none-of-these` reads as a refusal to answer (the Turkish
  case); `please-call-my-emergency-contact` can read as the emergency services' number;
  `hello-polite` *Shikamoo* is said only to an elder.
- **Yoruba**: ironing is usually *lọ aṣọ*; `how-long-does-it-take` uses *Ìgbà mélòó*, which
  the pack uses for "how many times"; `is-this-direct` writes *taara* where go-straight
  writes *tààrà*.
- **Javanese** (a krama pack): ngoko *dibayar* in `where-do-i-pay-the-fare` and *utawa* in
  `card-or-cash`; *AC-ipun* / *AC-nipun*, *sedhèrèk* / *sedherek*, *kangge* / *kanggé*,
  *kémawon* / *kemawon*, *saé* / *sae* written both ways -- bring each into the pack's own
  system; and Indonesian's four (`vegetarian murni`, `Sugeng siyang`, *Plèster*, the
  conditions card's "list") as the seventh pass settled them for id.
- **Malay**: `outdoors.is-it-safe-to-swim-here` *Selamat berenang di sini?* reads first as
  "happy swimming"; and id's four, as above.
- **Gujarati**: four replies worded as obligation (`… પડશે`), as Hindi's were;
  `how-long-is-the-wait` has no word for waiting; `i-can-pay-for-fuel` *આપી શકતો/શકતી
  છું* where present ability is *આપી શકું છું* (which needs no variant); the in-room safe
  and the lockers are both *લૉકર*; `which-exit` is "which door?".
- **`okay-can` printing as `okay-fine`**: after the seventh pass the two rows have the same
  text in hu, hy, ka, ta, te and uz, and both print on the sheet. Give `okay-fine` its own
  wording where the language has one ("all right", "fine"), from a dictionary of record,
  and say where it has none.

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.

## A ninth pass: what the last three key-words batches saw

Same rules as above, in two halves run side by side: notes go to
`tmp/notes/agents/row-corrections-9-a.md` and `-9-b.md`. Each language's full lead is in
the "Rows to check" of `tmp/notes/agents/key-words-6.md`, `-7.md` or `-8.md` (and
`key-words-5.md` / `strings-batch-ak-3.md` for Malay and Javanese). Keys in
`data/emphasis/<code>.csv` follow any word they name that changes.

**Half a** -- Europe, the Caucasus, South-East Asia and the conlangs:

- **Hungarian**: `kind-words.thank-you-for-everything` *Köszönöm mindent* (the indefinite
  object takes *Köszönök*); `fitestvérem` against the usual *fiútestvérem*; *Csak nézek
  körül* against the set phrase *Csak körülnézek* (its key follows).
- **Croatian**: *U penziji sam* is colloquial and regional (standard *U mirovini sam*);
  *povezani let* reads as a calque.
- **Romanian**: *Este un seif?* and the washing-machine row read first as "is it a ...?";
  *Nu este așteptare* is unidiomatic.
- **Filipino**: *kasintahan* is a sweetheart, not a partner; the chest-pain row reads as
  "my chest has an illness"; `time-words.evening` and `night` are both *gabi*.
- **Armenian**: `hitchhiking.thank-you-for-the-ride` writes *տարիք* ("age") for the verb
  *տարաք*; the emergency-contact row can read as the emergency services' number.
- **Georgian**: *ბანაკი გავაშენოთ* for pitching a camp; the motion-sickness tablets read
  as anti-nausea tablets.
- **Malay and Javanese**: `social-basics.hello` *Halo* -- Kamus Dewan gives the greeting as
  *helo* (its *halo* is the ring round the sun); check Javanese against its own sources.
- **Khmer**: the nurse row is feminine only though the pack declares a speaker axis; the
  laundromat is a clothes-ironing shop; motion-sickness tablets read as dizziness
  medicine; *ឥវ៉ាន់ / អីវ៉ាន់* and *ឱ្យ / អោយ* alternate across rows (one spelling, by the
  Chuon Nath dictionary).
- **Lao**: `dietary-needs.no-nuts` *ໝາກນັດ* is pineapple; `trail-conditions.is-the-route-steep`
  writes *ຄັນ* where steep is *ຊັນ*; check *ມືນ* (slippery) and *ຂາ* for the thigh.
- **Uzbek**: `none-of-these` reads as a refusal (the Turkish case); *Benzin puli* likely
  wants the accusative *pulini*.
- **Klingon and Quenya**: `weather.is-it-safe-today` asks "is it dangerous?", so a "yes" on
  the reply screen means unsafe -- reword to ask about safety, or say why it cannot be;
  Klingon `none-of-these` reads as a refusal; Quenya `i-do-not-understand` has
  `i-do-not-know`'s text and `okay-can` is a bare stem. Check every word against the
  lexicons the packs cite (boQwI' / klingon-assistant-data, Eldamo), as the strings
  passes did.
- **French and Hebrew** give `okay-can` and `okay-fine` the same text (both print on the
  sheet): give `okay-fine` its own wording, as the eighth pass did for four packs.

**Half b** -- South Asia:

- **Punjabi**: eight first-person requests are masculine only with no feminine variant
  (check-in-early, check-out-later, store-luggage, see-room, another-night, change-rooms,
  open-window, try-it-on) -- add the speaker variants, as the seventh pass did for Urdu;
  the receipt row has the check's text; "not allowed" reads "can't be done"; "is it safe
  today?" asks if it is *ਠੀਕ*; five replies are worded as obligation (the Hindi case).
- **Kannada**: the aisle seat as *ದಾರಿ* ("road"); *ಎ.ಸಿ.* and *ಎಸಿ* both written; brother and
  sister as the elder forms (the concepts' notes decide).
- **Malayalam**: the receipt row has the check's text; `i-do-not-understand` reads as
  future or habitual; the colleague as *സഹകാരി*; `building-words.exit` *പുറത്തേക്ക്*;
  `board-answers.stay-here` reads as "sitting here".
- **Marathi**: the `introductions.i-am-from` feminine variant rewrites the sentence and
  leaves no content word (the one key-word warning); `you-are-welcome` is "welcome to a
  place"; `hello` is the casual *हाय*; `none-of-these` reads as a refusal;
  `building-words.exit` is "outside".
- **Nepali**: *पछिल्लो* ("last") for the next town; "it is beautiful here" shares
  *राम्रो* with the wonderful-time row; the rash as *दाग*; safe and lockers both *लकर*;
  `which-exit` is *कुन गेट?*.
- **Odia**: `taxi.please-stop-here` uses *ରୁହନ୍ତୁ* ("stay"); both prescription rows say
  "doctor's letter"; the in-stock row has no word for stock; the kind-words labels end in
  "." rather than the danda.
- **Tamil**: the nurse as *தாதி* (the Sri Lankan word); vegan spelled *விகன்*; the
  no-photography sign worded as a request.
- **Telugu**: `open-operating` reads as a machine working; `do-i-need-to-transfer` says
  "change trains" on a screen for buses and metro too; the tourist row is masculine only.
- **Gujarati**: `police-consulate.i-am-calling-the-police` keeps the obligation wording the
  eighth pass removed from the four replies.

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.

## A tenth pass: the same cases the ninth pass saw beside its items

Same rules as above; notes go to `tmp/notes/agents/row-corrections-10.md`. Each lead is
in the "Seen, not touched" of `tmp/notes/agents/row-corrections-9-a.md` or `-9-b.md`.

- **Punjabi**: the 20 further first-person requests worded only for a man (`… ਸਕਦਾ ਹਾਂ`)
  that the ninth pass listed -- feminine speaker variants, as it wrote the first eight.
- **Romanian**: the six further `Este un/o X?` rows that read first as "is it a ...?" --
  `Există`, as the ninth pass settled.
- **Telugu**: `border-customs.i-am-a-tourist`, the twin of the row the ninth pass reworded.
- **Tamil**: the no-smoking and do-not-touch signs worded as requests -- prohibitives, as
  the photography sign now is.
- **Hindi**: the traveller's police row keeps the obligative the Gujarati one lost.
- **Malayalam**: the brother and sister `literal`s claim there is no sibling term
  unmarked for age, which Kannada's did and was corrected.
- **Nepali**: the kind-words labels end in "." rather than the danda, as Odia's did.
- **Odia**: the kind-words romanisation writes *y* where the pack's romaniser writes *ẏ*.
- **Quenya**: `i-do-not-understand-spoken` still has `i-do-not-know`'s text (`lá istan`);
  the ninth pass gave the written row `lá hanyan`.

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.

## An eleventh pass: what the phrasebook cross-check found

Same rules as above; notes go to `tmp/notes/agents/row-corrections-11.md`. The leads, with
the phrasebook's wording and the pilot's reading, are in `tmp/notes/agents/crosscheck-pilot.md`
and `tmp/out/crosscheck/<code>.csv` (verdict `disagree`, and the variants it notes).

- **`common-signs.open-operating` across the packs.** The concept is the *open for
  business* sign on a shop or office door (zh 营业中, ja 営業中; en cites OALD "ready for
  business"), beside `common-signs.open-on` (a switch's *on*). About twenty packs wrote it
  as a machine that is running -- de *in Betrieb*, es *En servicio*, ar *يعمل*, sw *Inafanya
  kazi*, and the same reading in fr, it, pt, el, he, fa, hu, tr, id, ms, vi, ha, yo, ta, km,
  bn, mr, pa, or (check each; ru, uk and pl are right, their "works" word being the shop
  sign). Write the concept's `notes` in `data/concepts/travel.csv` -- the one concept cell
  this pass may touch -- and correct every pack whose row means "running", by the sign each
  language's shops actually hang (its own Wikipedia, signage standards, dictionaries).
- **Russian templates that cannot agree with their slot**: `hotel-basics.for-nights` *На {}
  ночей.* is wrong for one to four nights, and `utility-templates.i-need` *Мне нужен {}.* for
  any noun not masculine. Reword as label forms that agree with any filler (*Количество
  ночей: {}*, *Мне нужно: {}*); the slot count must not change. German *Ich esse kein {}.* is
  the milder case of the same problem: check and fix it the same way if it is one.
- **Thai pronouns**: `emergency-medical.i-am-sick`, `emergency-medical.i-am-injured`,
  `police-consulate.please-leave-me-alone`, `police-consulate.am-i-under-arrest` use ฉัน,
  which a man reading to a doctor or the police should not; drop the pronoun, as
  `building-help.i-am-lost` does.
- **Arabic gender gaps**: `social-basics.sorry` *آسف* lacks the feminine speaker variant
  (*آسفة*) twenty other rows have; `police-consulate.please-leave-me-alone` and the request
  rows the pilot lists (please-call-an-ambulance, please-say-it-again, please-give-me,
  keep-the-change, good-night) address a man only -- neutral base rows with listener
  variants, by the fifth pass's method, and combined keys where a row also has a speaker
  variant.
- **Punjabi**: three outgoing rows still say a request only to a man --
  `could-you-take-a-photo-for-us` (ਦਿਓਗੇ), `communication.can-you-help-me` (ਸਕਦੇ ਹੋ),
  `food-ordering.what-do-you-recommend` (ਦੱਸੋਗੇ) -- the same treatment.
- **Smaller ones**: Japanese `social-basics.hello-polite` *失礼します* is said entering a room,
  not as a greeting; Japanese zero as *零* where speech says *ゼロ*; Spanish
  `time-words.evening` *el atardecer* (dusk); Spanish *¿Estoy detenido/a?* showing a slash
  though its feminine variant exists; Swahili *Mkono / kiganja* and *Mguu / unyayo* slash
  pairs on rows a reader is shown (keep one reading per the sixth pass's slash rule if
  they are on a board; the sheet may keep both).

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.

## A twelfth pass: what the register passes and the cross-check saw beside their items

Same rules as above; notes go to `tmp/notes/agents/row-corrections-12.md`. The leads are in
`tmp/notes/agents/register-5.md`, `row-corrections-11.md` ("Seen, not touched") and
`strings-mosaic.md`.

- **Yoruba requests already familiar.** Five base rows address the stranger with the
  familiar *o / rẹ* where every other Yoruba request is polite *ẹ / yín* (can-you-help-me,
  do-you-speak-english, can-you-show-me-the-way, can-you-wait-for-me-here,
  what-is-your-name). Make each base row polite, and write its `register=familiar` row in
  `data/lang/yo/variants.csv` as the register pass did for the others (the old wording, if
  right, is the familiar one). Also check *Ẹ dárí jì mi*'s tone on the object pronoun.
- **Thai first person.** Six more rows say ฉัน with no variant, where a man would not:
  give them the speaker split the pack uses (ผม base or a neutral wording, ดิฉัน / ฉัน as
  the feminine variant), as `introductions.my-name-is` has. Combined rows where a
  register row exists.
- **"For N nights" in Ukrainian and Czech** (*На {} ночей.*, *Na {} nocí*) cannot agree with
  every number, as Russian could not; use the label form the eleventh pass gave Russian.
  German and English are wrong for one night only: check and fix the same way if so.
- **Georgian `directions.can-you-show-me-the-way`**: the base *მიმასწავლებთ* uses a stem the
  Explanatory Dictionary does not give; check it against the dictionary's paradigm (the
  register pass wrote the familiar from it).
- **Lao romanisation**: the pack's reader (`tmp/lang/lo/g2p.py`) reads ແ…ວ as *tʰwɛː* where it
  is *tʰɛːw*, and `social-basics.politeness-particles` carries the wrong romanisation; fix
  the row, and say whether the reader itself needs the fix (it is a tool, not shipped).

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.

## A thirteenth pass: what the twelfth pass and the cross-check saw beside their items

Same rules as above, in two halves for two agents: items 1-3 write their notes to
`tmp/notes/agents/row-corrections-13a.md`, items 4-7 to `row-corrections-13b.md`. The leads
are in `tmp/notes/agents/row-corrections-12.md` ("Seen, not touched") and
`tmp/out/crosscheck/<code>.csv`.

1. **"For N nights" in fifteen more packs.** `hotel-basics.for-nights` puts a plural noun
   after the slot, wrong for one night (the commonest stay) and in some for two to four: el
   *Για {} νύχτες*, es *Por {} noches*, fr *Pour {} nuits*, it *Per {} notti*, nl *Voor {}
   nachten*, pt *Para {} noites*, ro *Pentru {} nopți*, sv *I {} nätter.*, he *ל{} לילות*,
   hr *Na {} noći*, pa *{} ਰਾਤਾਂ ਲਈ*, mr *{} रात्रींसाठी*, ta *{} இரவுகளுக்கு*, te *{}
   రాత్రులకు*, ar *لمدة {} ليال* (the broken plural, right for three to ten only). Check
   each against the language's grammar; where it fails for a number a traveller would
   type, use the label form the twelfth pass gave Ukrainian, Czech, German and English
   (*Number of nights: {}*), in the pack's own colon frame. Where it is right for every
   number, leave it and say why.
2. **Italian `utility-templates.i-need`** *Mi serve {}* agrees with a singular filler only
   (*mi servono due biglietti*); *Ho bisogno di {}* takes either. Check it, and every other
   template (`{}` row) of the it, es and pt packs whose verb agrees with its filler.
3. **Portuguese `time-words.evening`** *o fim da tarde* ("the end of the afternoon"), with
   *o serão* as its alternative: check it against the pack's dictionaries of record for the
   word a speaker of the pack's variety uses for "evening" and the concept's other packs.
4. **Machine-sense alternatives on the shop signs.** Turkish `common-signs.closed` keeps
   *hizmet dışı* ("out of service") in `text_alt`, and Greek's `common-signs.open-operating`
   and `common-signs.closed` keep *Λειτουργεί* / *Δεν λειτουργεί* ("working / not
   working"): a machine's state, which the eleventh pass took out of the texts. Write
   `common-signs.closed`'s `notes` in `data/concepts/travel.csv` to match open-operating's
   (the closed sign on a shop, office or counter door; not a machine out of order, which is
   `toilets.out-of-order`, and not `common-signs.temporarily-closed`), clear the
   machine-sense alternatives, and check every pack's `common-signs.closed` text and
   `text_alt` against the note.
5. **`quick-responses.please-go-ahead`** has no concept note, and its rows read it two
   ways: the offering *please* -- after you, here you are, go ahead (de *bitte*, ja *どうぞ*,
   tr *Buyurun*, ar *تفضّل*) -- and narrower readings (hi *कहिए*, "say it"). Write its
   `notes` in `data/concepts/social.csv` for the offering sense, and check every pack's row
   against it. These two notes are the only concept cells this pass may touch.
6. **Korean `social-basics.hello-polite`** *안녕하십니까* is the deferential *hasipsio* form of
   announcements and formal address; `social-basics.hello` is *안녕하세요*. Check against
   the National Institute of Korean Language's *표준 언어 예절* and the Standard Korean
   Language Dictionary which a traveller should say to a stranger for the polite concept,
   and change it only if the source says so.
7. **Ten Yoruba rows off the boards** address the listener with the non-honorific *o / rẹ
   / ọ́*, the case the twelfth pass fixed on the board requests: `accessibility.take-your-arm`,
   `introductions.where-are-you-from`, `atm-cash.do-you-have-change`,
   `phone-text-power.do-you-have-a-power-bank`, `sim-data.do-you-have-an-esim`,
   `sim-data.do-you-need-my-passport`, `communication.i-do-not-understand-spoken`,
   `communication.i-cannot-make-out-what-you-are-saying`,
   `phone-translation.please-type-it-and-show-me` and `etiquette.photo-of-you`. Make each
   honorific (*ẹ / yín*), with tones from the twelfth pass's sources; no `register=familiar`
   rows, since the register switch acts on the boards only.

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.

## A fourteenth pass: templates whose fixed words agree with what fills them

Same rules as above; notes go to `tmp/notes/agents/row-corrections-14.md`. The leads are the
"Seen, not touched" list of `tmp/notes/agents/row-corrections-13a.md`. Only a name and a
country are ever filled in by the app; every other `{}` prints as a blank the traveller writes
a word or a number into, or points at one elsewhere on the card, so a template has to be
right for any filler a traveller would give it.

1. **A number before a plural noun**, the "for N nights" case again, in three concepts:
   `border-customs.i-am-staying-for-days` (es fr it nl pt ro sv he de en te ar, ru and uk
   right from five only, cs; mr's literal calls an oblique plural invariant),
   `children.child-age` (en de fr es it pt ru uk cs pl hr ro ar el) and
   `pharmacy-symptoms.it-started-days-ago` (it es pt). Check every pack of the three, not
   only those named. Where the wording fails for one (a child of one, a stay of one day),
   use the label form the packs' *Number of nights: {}* rows use, worded as that language's
   own forms and signs say it (an arrival card's *length of stay*, a clinic form's *age*);
   where a language keeps the noun singular after any numeral, leave it and say so.
2. **One o'clock.** `hotel-requests.wake-up-call` it *alle {}*, es *a las {}* and pt *às {}*
   are wrong for 1:00 (*all'una*, *a la una*, *à uma*). Check the concept in every pack for the
   same defect, and fix it the same way.
3. **A fixed article.** `utility-templates.is-there-nearby` (en *Is there a {} nearby?*, fr
   *Y a-t-il un {}*, it *C'è un {}*, es *¿Hay un {}*) and `directions.where-is-the-nearest` (de
   *der nächste {}*, fr *le {} le plus proche*, es, pt) fix one gender or one article for every
   filler. Check both concepts in every pack. Change a row only where the language has an
   equally natural wording that agrees with any filler; where the fix would read worse
   than the defect, leave it and say why. These are the weakest of the three items: a
   reader pointing at *pharmacie* under *un ___* is understood.

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.

## A fifteenth pass: what the thirteenth and fourteenth passes left beside their items

Same rules as above; notes go to `tmp/notes/agents/row-corrections-15.md`. The leads are
the closing lists of `tmp/notes/agents/row-corrections-13b.md` and `row-corrections-14.md`.

1. **Finnish `hotel-basics.for-nights`** *{} yötä* is wrong for one night (*yksi yö*), as its
   own literal says; give it the label form the other packs' rows have.
2. **`quick-responses.please-go-ahead` rows that still ask rather than offer**, against
   the concept note the thirteenth pass wrote: Yoruba *Ẹ jọ̀wọ́*, Croatian *molim / samo
   naprijed*, Amharic *እባክዎ / ይለፉ*, and Arabic *تفضّل*, which offers but to a man --
   word it to address nobody's gender, as the first pass did `board-answers.please-wait`.
   Quenya has no row; leave it. The South Asian rows are left for the owner.
3. **Georgian `common-signs.open-operating`** *მუშაობს* ("it is working") against the
   concept's note and the closed sign the thirteenth pass wrote (*დაკეტილია*): check which
   a Georgian shop hangs, and make the text and literal say the open-for-business sign.
4. **Korean `common-signs.closed`** keeps *휴업* in `text_alt`, which leans to "closed for a
   holiday" (`common-signs.temporarily-closed`); check it against the 표준국어대사전 and
   the note.
5. **Greek `border-customs.i-am-staying-for-days`** keeps *Θα μείνω {} μέρες* in
   `text_alt`, wrong for one day; clear it or give it the text's form.

Afterwards rebuild IPA for every language whose text changed
(`python3 scripts/build_ipa.py --only <codes>`), run `python3 scripts/validate_data.py`,
and list every cell you changed in your notes.

## A sixteenth pass: what the open questions and the Arabic route left

Same rules as above; notes go to `tmp/notes/agents/row-corrections-16.md`. The leads are in
`tmp/notes/agents/open-questions.md` ("Seen, not touched") and the Arabic route's commit
(`git show 1fdfc3fae`).

1. **German `directions.please-show-me-on-the-map`** *Bitte auf der Karte zeigen.* is the
   bare infinitive, which de.wikipedia's *Imperativ* article gives for an instruction to no
   one in particular and not for a request; its `text_alt` *Zeigen Sie es mir bitte auf der
   Karte.* is the request. Check it against Duden's grammar and the pack's other requests,
   and swap them if it holds.
2. **The Korean register switch's labels** are `해요` / `해`, two verb endings, as the Japanese
   ones were copulas until the open-questions pass gave them the styles' names (丁寧体 /
   普通体). Give Korean the names its own grammars give the two styles (the National
   Institute of Korean Language, ko.wikipedia *한국어의 높임법*), in the `label` cells of
   `data/registry/listener-axes.csv`, if a source names them in words a reader would know.
3. **Arabic rows still read by espeak.** The Arabic IPA now comes from `romanization_ala-lc`
   wherever a row has one; the 49 currency glosses in `data/lang/ar/numbers.csv` and the `km`
   language name in `data/registry/language-names.csv` have none, so they are still espeak's
   guesses. Give each its ALA-LC romanisation from the script by the LC table (the pack's
   other cells show the column's conventions), then `python3 scripts/build_ipa.py --only ar`.

Afterwards rebuild IPA for every language whose text changed, run
`python3 scripts/validate_data.py`, and list every cell you changed in your notes.

## A seventeenth pass: what the gender alternatives and the sixteenth pass left

Same rules as above; notes go to `tmp/notes/agents/row-corrections-17.md`. The leads are in
`tmp/notes/agents/gender-alternatives.md` ("Seen, not touched").

1. **Printed `literal` cells that are a translator's gender note.** 22 rows whose feminine
   now lives in `variants.csv` still gloss the base row with a note about it -- Polish's
   twelve *masculine; a woman says zgubiłam*, Gujarati's seven *... (m) — શકતી for a woman*,
   Croatian's two *man speaking / woman speaking; ...*, Portuguese `thank-you` *-o if male,
   -a if female*. `literal` prints on the card as a back-translation: rewrite each as one,
   of the base row's own words, and check the variant rows' literals the same way.
2. **Portuguese `medical-conditions.i-am-allergic-to-sulfa-drugs`** keeps the `text_alt`
   *Sou alérgica · sulfas*, which reads as garbled; the feminine is its variant row's
   business. Fix or clear it.
3. **German requests in the bare infinitive.** About twenty rows said to a person are
   *Bitte* + infinitive (*Bitte tippen und zeigen.*, the laundry, SIM and massage
   requests), the form Duden gives for official instructions and not for a request
   (the sixteenth pass's sources). Make each a *Sie* imperative request as the pack's
   other requests are, keep a sign or a notice to no one (*Bitte nicht stören*) as it is,
   and where a changed row is on a board, give it its `register=familiar` *du* row as the
   sixteenth pass did for the map.
4. **Hebrew `hiking-parks.is-this-the-way-to`** *זה הדרך* pairs the masculine
   demonstrative with the feminine *דרך*; check it against the Hebrew Academy or a grammar
   (*זו / זאת הדרך*) and fix it if so.
5. **Arabic `numbers-money.hryvnia-symbol`** is romanised *hrīfniyā* without the `(al-ramz)`
   its sibling symbol rows carry, as its script does; make it agree.

Afterwards rebuild IPA for every language whose text changed, run
`python3 scripts/validate_data.py`, and list every cell you changed in your notes.

## An eighteenth pass: the rest of the printed gender notes

Same rules as above; notes go to `tmp/notes/agents/row-corrections-18.md`. The leads are the
closing list of `tmp/notes/agents/row-corrections-17.md`.

1. **The printed `literal` cells that are still a translator's gender note** on rows whose
   other gender lives in `variants.csv`: 106 base rows the seventeenth pass counted (pl 8,
   hr 8, gu 3, pt 3, cs 8, ru 6, uk 8, el 3, he 18, hi 5, mr 6, pa 5, ne 2, ur 14, es 1) and
   pl `about-me.i-am-an-engineer`'s variant row. Rewrite each as a back-translation of its
   row's own words, as the seventeenth pass did; a back-translation that names a pronoun
   because the pronoun is the point (th, km) stays. List, for each pack, the phrasings the
   notes used (*a woman says*, *(m)*, *masculine default*), so a check can keep them out.
2. **Portuguese** penicillin and aspirin-and-ibuprofen rows park a bare *Sou alérgica* in
   `text_alt`, which their variant rows already say in full: clear them, as the
   seventeenth pass did sulfa drugs.
3. **Hebrew `utility-templates.is-this`** *זה {}?* agrees with a masculine filler only; the
   seventeenth pass's sources support *[זה|זו]*. Give Hebrew its rows in
   `data/registry/genders.csv` (masculine and feminine, with the evidence for their colours
   as `content/PROMPTS/gender-alternatives.md` asks, and the hex values the other languages
   use) and write the group, in `text`, its pointed `text_alt` and its romanisation.
4. **German** massage rows whose `literal` is a translator's note rather than a
   back-translation (please-stop, neck, feet): rewrite them. And
   `quick-directions.turn-left` / `turn-right` *Links abbiegen.* / *Rechts abbiegen.*, a
   stranger's directions in the bare infinitive: check whether a German giving directions
   says them so (they may well be right, as a navigation instruction), and leave them if so.

Afterwards rebuild IPA for every language whose text changed, run
`python3 scripts/validate_data.py`, and list every cell you changed in your notes.

## A nineteenth pass: what the eighteenth left

Same rules as above; notes go to `tmp/notes/agents/row-corrections-19.md`. The leads are the
"Status at pause" and "seen" lists of `tmp/notes/agents/row-corrections-18.md`.

1. **German massage rows** whose `literal` is a translator's note (please-stop, neck, feet):
   rewrite each as a back-translation (the eighteenth pass drafted them). And
   `quick-directions.turn-left` / `turn-right` *Links abbiegen.* / *Rechts abbiegen.*: check
   whether a German giving a stranger directions says them so, and leave them if so.
2. **Printed gender notes on the listener-gender rows.** 43 rows with listener-gender
   variants carry a translator's note in `literal` (ar 24, pa 7, ha 5, cs 3, he 2, pl 1,
   ur 1): rewrite each as a back-translation of its own words, as the seventeenth and
   eighteenth passes did for the speaker's gender.
3. **Base `text_alt` cells a woman's variant inherits.** Some are masculine (ar, ur, it)
   and some are a bare feminine parked on the man's row (fr x3, pt x2): give the variant
   row its own alternative or clear the parked one, as the earlier passes did.
4. **Khmer `quick-responses.yes-right`**'s `literal` is a gender note, not a
   back-translation, and its woman's variant prints it too: rewrite it.
5. **Punjabi spellings**: the Punjabi University dictionary writes the feminine teacher
   ਅਧਿਆਪਕਾ where the variant row has ਅਧਿਆਪਿਕਾ, and petrol ਪਟਰੋਲ where the row has ਪੈਟਰੋਲ;
   check both and correct them if the dictionary holds.

Afterwards rebuild IPA for every language whose text changed, run
`python3 scripts/validate_data.py`, and list every cell you changed in your notes.
