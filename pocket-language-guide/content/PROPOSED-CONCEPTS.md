# Concepts the translators asked for

Every pack in this project is written by someone reading the bank against a real
country, and the most valuable thing they produce is not always a translation. Six
of them flagged a concept that does not exist, with a reason and usually a source.
This file is where those go, so the finding is not lost between the report and the
next batch.

Adding a concept is not free: a universal one costs every one of the fourteen packs
a row, and until they have it the validator names them in its coverage warning. So
these are staged rather than added, and the note beside each is the argument for
where it belongs.

Two are already in the bank: `dietary-needs.no-pork` and
`dietary-needs.is-this-halal`, both raised by the Indonesian translator, both
universal, both now filled in every pack. They are the precedent for the shape of
an entry here.

## Strong cases

### `pharmacy-symptoms.i-think-i-have-malaria` and `.i-need-a-malaria-test`

Raised by the Swahili translator, who called it the biggest gap in that pack.
Malaria is the most likely serious illness for a visitor to any of the four
countries Swahili serves, and it is the one where hours matter. The bank has
`i-have-a-fever`, `i-need-medicine-for {}` and `i-am-vomiting`, so a traveller can
fill a slot with "malaria" — which is not the same as being able to say the two
sentences that get you tested and treated.

Should be **scoped**, not universal: `sw;hi;th;id;vi;pt;es`. A card for Japan or
Russia has no use for it, and a scoped concept costs only the packs it applies to.

Swahili rows are ready and verified against Swahili clinical sources
(`kipimo cha malaria` is the standard term for the test, including the rapid
diagnostic):

- `Nadhani nina malaria` — `nah-THAH-nee NEE-nah mah-LAH-ree-ah`
- `Nahitaji kipimo cha malaria` — `nah-hee-TAH-jee kee-PEE-moh chah mah-LAH-ree-ah`

### `dietary-needs.does-it-contain-pork-stock`

Raised independently by the Japanese and Korean translators, and the Mandarin one
was asked the same question. `no-pork` names the *meat*; it does not reach 豚骨
broth, ラード, 豚エキス, 猪油, or the pork base under 김치찌개 and 부대찌개. Japan's
own tourism-agency guide for Muslim visitors spells this out: 豚肉だけではなく…豚由来の
製品・調味料等をすべて除く必要があります.

The Japanese translator's argument for a separate concept rather than a longer
`no-pork` is the right one, and it is the argument the bank already accepts: this
is a *question* to a cook rather than a *request*, which is exactly why
`dietary-needs.no-seafood` and `dietary-needs.does-it-contain-fish-stock` are two
concepts and not one. And it will not fit — `no-pork` is a `ref` row in a
four-column table, where the worst existing case already wraps to four lines.

Japanese row ready: 豚のだしは入っていますか？ *buta no dashi wa haitteimasu ka?*,
respell `bu-tah noh dah-shih wah hah-it-teh-i-mahss kah?`. Universal, next to rank
1008 with the fish-stock row.

### `common-signs.pork-code`

Raised by the Indonesian translator, then verified in depth. In Indonesia pork is
routinely signed with a **code rather than the word**: `B2` (from *babi*, two B's),
`BPK` (*babi panggang karo*), `samcan`, `bakut`, `cu nyuk`, `siobak`, `char siu`.
A traveller can read `Tanpa babi` off the card perfectly and still walk into a
restaurant whose sign says `Lapo B2`. Attested on real shopfronts in Jakarta,
Medan, Yogyakarta, Semarang and Kalimantan, and `B2` is in LPPOM MUI's own glossary
of pork terms.

Two warnings that belong with it, because both are easy to get backwards:

- **`B1` is dog, not pork** (from Batak *biang*, one B). Indonesian sources call the
  `B1 = babi` reading a *salah kaprah* — a widespread error. `RW` (*rintek wuuk*)
  is dog in Manado, though `bumbu RW` on chicken or fish is only the seasoning.
- **`bak-` in `bakso`, `bakmi`, `bakpao` is Hokkien for "meat", not "pork"** —
  most Indonesian *bakso* is beef. But `bakut` (*bak kut teh*) *is* pork.

This is a `common-signs` concept, scoped `id`, and probably wants `text_alt` and a
short ASCII `literal` doing the disambiguation rather than a second row.

## Worth doing, lower urgency

### `numbers-money.shilling`

Raised by the Swahili translator: **no currency concept applies to Swahili at all**,
so the sheet has no money word, while every other pack has its pair. One concept
scoped `sw` serves TZ, KE and UG together — three of the four countries — and
`Shilingi` is the most-used noun at any counter.

### `dietary-needs.jain` and `dietary-needs.no-onion-garlic`

Raised by the Hindi translator. Indian kitchens are set up to answer exactly these
two, and `शुद्ध शाकाहारी` does not cover either. `no-onion-garlic` is currently
reachable by filling `utility-templates.please-do-not-add {}` with प्याज़-लहसुन,
which works but buries it. Scope `hi`, possibly `hi;th;id` for the Buddhist
vegetarian overlap.

### `rail-station-words.fare` and `.conductor`

Raised by the Swahili translator: `nauli` and `kondakta` are the two words you need
on a *daladala* or a *matatu*, and there is nowhere to put them. Universal — a fare
and a conductor exist everywhere this corpus goes.

### `payment-receipt.can-i-pay-by-mobile-money`

Also Swahili. Mobile money is how East Africa pays, and it sits next to a QR-code
row that the region barely uses. Scope `sw` at minimum; Indonesian and Indian
readers would use it too.

### `dietary-needs.does-it-contain-pork-fat`

Raised by the Spanish translator, and it is the European half of the pork problem
the Japanese and Korean ones raised for stock. `manteca`, `grasa de cerdo`,
`lardons`, `Schmalz` and `Speck` go into beans, stews, pastry and quiche as
*seasoning*, so a cook who hears "no pork" does not count them. The bank solves this
exact shape once already, for fish, in `dietary-needs.does-it-contain-fish-stock`.

Note the translator's warning about `manteca`: it means *lard* in Spain and *butter*
in Argentina and Uruguay, so the Spanish row cannot simply name it. That is an
argument for a concept each pack fills locally rather than a longer shared string.

### `dietary-needs.no-dried-fish`

Swahili again: `dagaa` (dried sardines) is used across Tanzanian and Kenyan cooking
the way fish sauce is used in southeast Asia, and
`dietary-needs.does-it-contain-fish-stock` will not catch it. The same concept would
serve `th` (`กะปิ`) and `id` (`terasi`), both of which their translators flagged
separately — so this is one concept three packs want.

### `pharmacy-symptoms.jeotgal` — or a wider "hidden animal ingredient" concept

The Korean translator's version of the same problem: 젓갈, salted fermented seafood,
is in most 김치, which is a shellfish trap in a dish nobody thinks of as seafood.
Along with the unasked 반찬 that arrives anyway. Together with `no-dried-fish` and
the pork-stock row above, this suggests the real gap is one concept shaped like
"what is in this that I would not expect", filled per language — which is a design
question rather than a row.

## One design question, not a concept

The Spanish translator's closing point: `dietary-needs` is safety-critical in the
validator, but the only cell guaranteed to print is `text` — `script_alt` and
`literal` are both toggles, and the default field set is `script`, `roman`, `gloss`,
`respell`, `numeral`. So a row whose safety margin lives in `literal` has no margin
on a default card. Options, none free: force `literal` on for that one section
(there is no per-section field override today), widen the default set (costs a line
on 60–110 rows a pack), or keep the rule that safety content goes in `text` and
accept that it makes those rows longer. The `no-pork` rows shipped under the third
reading, and the Spanish one is the model: `Sin cerdo ni jamón ni embutidos`.

## Notes that are facts about a country, not concepts

Recorded because they came out of the same work and would otherwise be lost.

- **The Swahili clock is offset six hours.** `saa moja` is seven o'clock. The
  Swahili pack routes around it — `hotel-requests.wake-up-call` deliberately omits
  `saa` so a digital time reads correctly, and `what-time-is-it` carries
  `Saa ngapi za kizungu?` in `text_alt`. A `note`-template row in `time-words`
  would state it properly; the bank's only two `note` concepts are scoped to
  Chinese and Japanese.
- **Indonesia's `112` is not nationwide** — roughly 180 of 514 kabupaten/kota, run
  per local government. `119` (Kemenkes PSC) reaches all of them. `regions.csv`
  already prints all three numbers, which is why it is correct; printing `112` alone
  would not be.
- **Peru's `106` ambulance line covers 16 regions**, not Cusco or Arequipa.
  Already reflected in `regions.csv`.
- **Indonesia's non-halal labelling regulation changed in 2026.** BPJPH Reg. 3/2026
  standardises `MENGANDUNG BABI` in red with a pig icon on packaged goods, with a
  compliance deadline of July 2027. It does not apply to restaurant service, which
  is where a phrase card is used.
