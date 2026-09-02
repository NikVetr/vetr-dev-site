# Concepts the translators asked for

Every pack in this project is written by someone reading the bank against a real
country, and the most valuable thing they produce is not always a translation. Eight
of them flagged a concept that does not exist, with a reason and usually a source.
This file is where those go, so the finding is not lost between the report and the
next batch.

Adding a concept is not free: a universal one costs every one of the fifteen packs a
row, and until they have it the validator names them in its coverage warning. So
these are staged rather than added, and the note beside each is the argument for
where it belongs.

Four are already in the bank rather than staged here. `dietary-needs.no-pork` and
`dietary-needs.is-this-halal` were raised by the Indonesian translator, are universal
and are filled in every pack. `numbers-money.shilling` and its symbol came from the
Swahili translator, who pointed out that no currency concept applied to Swahili at
all while every other pack had its pair; that one is scoped `sw` and prints
`TSh · KSh · USh`, because the concept serves three countries and a Kenyan card
saying `TSh` is simply wrong. Those are the precedent for the shape of an entry
here.

## Strong cases

### The pork rows are three concepts wearing one hat

Worth stating together, because five translators arrived at it independently and the
shape is now clear. `dietary-needs.no-pork` names the *meat*, and three different
invisible vectors defeat it in three different regions:

- **Broth**, in east and southeast Asia. Japanese 豚骨, Korean 돼지 육수, Thai
  น้ำซุปหมู. The Thai translator's point is the sharpest: nearly all Thai
  `ก๋วยเตี๋ยว` and the free soup beside a rice dish are pork-bone stock, so a bowl of
  *chicken* noodles is routinely served in pork broth.
- **Fat**, in Europe and southern China. `manteca`, `lardons`, `Schmalz`, 猪油,
  น้ำมันหมู. The Thai pack also supplies the evidence that these are separately
  claimed in practice: `ไม่มีหมู ไม่มีน้ำมันหมู` — "no pork no lard", NPNL — is an
  established southeast Asian food-court category *because* the first phrase does not
  imply the second.
- **Cured pork as seasoning**, in Europe. Chorizo, lardons, Speck, presunto — the
  case the Spanish, French, German and Portuguese packs solved by naming the offenders
  inside `text`.

Three packs shipped the coverage in `text` and paid a wrapped line for it; the rest
kept the short form. A `does-it-contain-pork-stock` concept and a
`does-it-contain-pork-fat` concept would let every pack carry the local words in
printed `text` instead of choosing between length and safety on one row.

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

### A `note` explaining the romanisation column's own diacritics

Raised by the Vietnamese translator, and it is the one request none of the four
existing `note` concepts can absorb. Pinyin's caron `ǎ` and Vietnamese's breve `ă`
are near-identical at 5pt, and pinyin's macron is not a Vietnamese mark at all — so a
Vietnamese reader is uniquely primed to read the tone marks in the romanisation
column as vowel-quality marks. They will not misread the words; they will misread
the *tones*, silently.

The translator declined to smuggle it into the numbers note, correctly: it is a fact
about the whole card's romanisation column rather than about numbers, classifiers or
money, and the brief for that note was to spend its space on words. So it wants
either a fifth `note` concept scoped to `zh-Hans` — where the trap is worst, and
which is the pattern the Thai particle note already establishes — or a line in the
romanisation column's own header, which no template has.

Worth noting the same shape recurs across the readerships from the other direction:
Thai and Chinese readers read any superscript mark as a tone, which is why both
dropped macron Hepburn in favour of doubled vowels. A legend would let those packs
keep the standard romanisation instead of routing around the ambiguity.

## Worth doing, lower urgency

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

### ~~A `note` row for a language's one unavoidable warning~~ — built

Three packs asked for the same thing in different words. Two of them now have it:
`social-basics.politeness-particles` scoped to `th` and `time-words.clock-offset`
scoped to `sw`, both `note`-template concepts alongside the Chinese and Japanese
number notes that were already there.

What building them exposed is worth more than the notes. A `note` is prose about the
target in the *reader's* language, so it renders from the **source** row — and
coverage is scored against a language as a sheet's *target*. So nothing was checking
the source side at all: nine languages had no row for the Chinese classifier note and
silently dropped it, five had the row blank and drew an empty bordered box, and
Spanish had a note about *Spanish numerals* in a concept scoped to Chinese. The
validator has two rules for this now, and its warning list is the remaining work.

The original request, kept for the record:

- **Thai**: "add ครับ (m) / ค่ะ (f) to soften anything." The pack deliberately omits
  the politeness particles from 739 of 741 rows, because printing both correctly
  needs two different pairs (`ค่ะ` on statements, `คะ` on questions) and picking one
  is wrong for half its readers. One legend line recovers all of it.
- **Swahili**: the clock is offset six hours — `saa moja` is seven o'clock. The pack
  routes around it by keeping `saa` out of the wake-up-call frame, which works and is
  invisible.
- **Hindi**: `तुम` is on the card as the reference word for familiar "you" with
  `literal: familiar`, which is as much warning as a cell allows.

A `scope: language` note concept per pack, or a `notes` column on `languages.csv`
rendered at the head of `social`, would serve all three. Thai's is the one that
changes what a reader can say.

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

## From the Italian pack

### `food-ordering.is-it-cheaper-at-the-counter` and a `common-signs` pair for it

The single most common concrete surprise for a visitor to Italy, and the bank has
nothing that reaches it. An espresso taken standing `al banco` is priced by the
`tariffa al banco` posted at the till; the same espresso carried to a table is
`servizio al tavolo` and legally may cost several times as much. Nothing on the
sheet warns a reader that choosing a seat changes the price, and no existing row
gets there: `shopping.how-much-is-this` asks about the object, not about where you
consume it, and `etiquette.is-service-included` asks about the bill after the fact.

Two shapes, and the second is the cheaper one. As a phrase,
`food-ordering.is-it-cheaper-at-the-counter` — `Costa meno al banco?` — is one row
that works anywhere the two-tier price exists. As reference words, a
`common-signs.at-the-counter` / `.table-service` pair puts `al banco` and
`al tavolo` on the card so a reader can match them against the two price lists
actually posted on the wall, which is what they will be looking at.

Not Italy-only, which is the argument for a universal concept rather than a scoped
one: Portugal and Spain price a coffee the same way at the counter versus the
terrace, and France's `au comptoir` / `en terrasse` is the same distinction with a
statutory price list behind it.

### `payment-receipt.what-is-the-cover-charge`

Italy's `coperto` is a fixed per-person charge that appears on a restaurant bill and
is neither a service charge nor a tip. `etiquette.is-service-included` does not find
it — the honest answer to that question in Italy is usually "no", and the bill still
carries a line the traveller did not order. `Quant’è il coperto?` is the question,
and it is asked before sitting down rather than after eating.

The same concept serves Portugal's `couvert`, Greece's and Turkey's bread-and-cover
lines, and the `pane e coperto` of a menu written before 2000. It belongs beside
`is-service-included` rather than replacing it, because they are different money.

### `time-scheduling.what-time-do-you-reopen`

`common-signs` carries open, closed and temporarily-closed, and `time-scheduling`
carries opening and closing time — but a shop that is shut at two in the afternoon
in Italy is neither closed nor temporarily closed, it is on `riposo` and will reopen
at four. The useful question is the reopening time, and there is no row for it.
`A che ora riapre?` is the Italian; the concept applies wherever a midday break is
normal, which is Italy, Spain, Greece, much of Latin America and most of the Gulf.

`common-signs.orario-continuato` — the sign a shop puts up to say it does *not*
close at midday — is the sign-side half of the same fact, and is the weaker half:
it is the absence of the problem rather than the problem.

### Weaker: a restricted-traffic-zone sign

Driving into an Italian historic centre through a `ZTL` (zona a traffico limitato)
is an automatic fine issued by camera, and the sign is a bare white circle with a
red border plus three letters. It is a real and expensive harm to visitors, and the
Italian pack cannot carry it: the bank has no driving content at all, so a single
`common-signs` row would be orphaned among words about trains and trails. Recorded
so the next person who proposes a driving section has the strongest argument for one
already written down.

## Notes that are facts about a country, not concepts (Italian pack)

- **Italy's `112` answers everywhere, but the unified response does not.** The NUE
  112 model routes 112, 113, 115 and 118 into one `Centrale unica di risposta`, and
  the Ministero dell'Interno's own prefecture pages count the CUR as operational in
  sixteen regions and two autonomous provinces — about 82% of the population — with
  calls elsewhere answered by Carabinieri operations rooms. Veneto and Campania,
  which hold Venice and Naples, are among those without one. So unlike Indonesia,
  `112 all services` is not an overclaim: the number always reaches a human. But
  `113 police`, `115 fire` and `118 medical` are kept on the card behind it, because
  outside a CUR region they are what reaches the right corps directly, and because
  they are what every Italian sign and every Italian still uses.
- **`118` is a medical dispatch service, not an ambulance number.** It is staffed
  the way France's `15` is, which is why the Italian labels use `soccorso sanitario`
  rather than `ambulanza` — the same word the prefecture pages use when they list
  who answers a CUR call.
- **San Marino runs one interforce centre for 112, 113 and 115**, at the Gendarmeria
  command, and a separate `118` under the ISS for medical calls. `113` and `115`
  reach exactly the same room as `112`, so the card prints `112` and `118` only:
  listing all four would spend two entries of a 1.66in column to say the same thing
  twice, which is the Kenya problem without Kenya's excuse.
- **Vatican City is deliberately not in the registry.** Italian is one of its
  working languages, but the Gendarmerie publishes a full landline rather than a
  short code and Italian `112`/`118` serve the territory in practice, so a `VA` row
  would add a flag to the Italian header collage and no number to any card.
- **In Italy the invisible pork is cured, not stock.** The new
  `dietary-needs.does-it-contain-pork-stock` row is filled (`Contiene brodo di
  maiale?`) but Italian broth is beef or chicken; what defeats `no-pork` here is
  `guanciale` in carbonara, amatriciana and gricia, `pancetta` in half the sauces,
  and `strutto` in bread and pastry. The Italian `no-pork` row names them inside
  `text` — `Senza maiale, salumi, pancetta o guanciale` — under the same rule the
  Spanish pack established, and it is further evidence for the staged
  `does-it-contain-pork-fat`.
- **Tipping in Italy is a fourth country where "how much should I tip?" is wrong.**
  `etiquette.is-tipping-expected` is already worded as a neutral yes/no for Japan,
  China and South Korea; Italy belongs on that list for a different reason. The
  `coperto` and, where charged, the `servizio` are already on the bill, so a tip is
  optional and often just the coins left behind. `Si usa lasciare la mancia?` is
  answerable with "no" without anyone being offended.
