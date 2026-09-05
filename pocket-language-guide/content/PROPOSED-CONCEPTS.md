# Concepts the translators asked for

Every pack in this project is written by someone reading the bank against a real
country, and the most valuable thing they produce is not always a translation. Eight
of them flagged a concept that does not exist, with a reason and usually a source.
This file is where those go, so the finding is not lost between the report and the
next batch.

Adding a concept is not free: a universal one costs every one of the twenty-two
packs a row, and until they have it the validator names them in its coverage
warning. So these are staged rather than added, and the note beside each is the
argument for where it belongs.

An entry that has landed keeps its argument and gains a `— shipped` heading, because
the argument is the record of why the row is shaped the way it is. Everything under
`## Strong cases` is now shipped, the romanisation legend included -- that one turned
out to be a decision rather than a row, and its entry records the decision.

Four are already in the bank rather than staged here. `dietary-needs.no-pork` and
`dietary-needs.is-this-halal` were raised by the Indonesian translator, are universal
and are filled in every pack. `numbers-money.shilling` and its symbol came from the
Swahili translator, who pointed out that no currency concept applied to Swahili at
all while every other pack had its pair; that one is scoped `sw` and prints
`TSh · KSh · USh`, because the concept serves three countries and a Kenyan card
saying `TSh` is simply wrong. Those are the precedent for the shape of an entry
here.

## Strong cases

### ~~The pork rows are three concepts wearing one hat~~ — shipped

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

**Both exist now.** `dietary-needs.does-it-contain-pork-stock` went in with the
malaria pair, universal, rank 1009 beside the fish-stock row at 1008.
`dietary-needs.does-it-contain-pork-fat` is in as well, universal, rank 1010, and the
two share the cluster `dietary-needs.hidden-pork`: they are the same question about a
different vector, so a card that already has one gains less from the second, and
stock sits above fat on importance because broth reaches more of the countries this
corpus covers than lard does. The third vector, cured pork as seasoning, stays inside
`no-pork`'s own `text` under the rule that only `text` is guaranteed to print --
`Senza maiale, salumi, pancetta o guanciale` is the model.

Two rows were **narrowed** rather than added, and they are the rows a reviewer should
read first. Greek and Hungarian had already folded the fat into their stock row
(`Έχει ζωμό ή λίπος χοιρινού;` and `Van benne sertésalaplé vagy zsír?`) because there
was nowhere else to put it; leaving them would have printed "broth or fat" and "fat"
as two rows of one card, which reads as a mistake. They ask about the broth now, and
the fat rows (`Έχει χοιρινό λίπος ή λαρδί;`, `Van benne sertészsír vagy szalonna?`)
carry what they gave up.

### ~~`pharmacy-symptoms.i-think-i-have-malaria` and `.i-need-a-malaria-test`~~ — shipped

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

**Shipped** at that scope, ranks 4 and 5 straight after `i-have-a-fever`, cluster
`pharmacy-symptoms.malaria` at ranks 0 and 1 so a card with the claim gains less from
the test row. Rows are in all nineteen natural packs, sourced per language against
health ministries and national programmes; the reader-side glosses carry
`malaria-reader-v1`.

### ~~`dietary-needs.does-it-contain-pork-stock`~~ — shipped

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

**Shipped** exactly there, with that Japanese row. See the pork entry above for what
the fat row did to its cluster.

### ~~`common-signs.pork-code`~~ — shipped

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

**Shipped** at that scope, rank 1004, importance 0.700. `text` is
`B2 · BPK · samcan · bakut · cu nyuk` with `siobak · saksang · char siu` in
`text_alt`. The two warnings went to the id row's `literal` and to the gloss rather
than into `text`, which needed one thing checked first: a `ref` row draws neither
`literal` nor `text_alt`, so nothing parked there reaches the card. That is
acceptable *here specifically* because both warnings prevent over-avoidance rather
than exposure -- a reader who wrongly reads `B1` as pork, or `bak-` as pork, avoids
food they did not need to avoid. Had either warning pointed the other way it would
have had to go in `text`.

### ~~A `note` explaining the romanisation column's own diacritics~~ — shipped, as furniture rather than a note

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

**Shipped as neither a fifth `note` nor a template change.** The card already had a
card-level slot for it, and what was missing was two data fields and one default. The
argument for that shape is kept below because it is the record of why the feature is
where it is.

*A `note` is a section device and this is a card fact.* `noteAtom` draws a note in a
bordered box at the head of its section, and all four existing notes are about their
own section's content -- Chinese classifiers and Japanese counters in `numbers-money`,
Thai particles in `social-basics`, the Swahili clock in `time-words`. The
romanisation column is on every row of every section, so a note about it would be
parked under one arbitrary heading. That is the objection the requester raised against
smuggling it into the numbers note, and giving it its own concept does not answer it.

*And a note is scoped the wrong way round for this.* `applies_to` on a note names the
language the note is *about*, while the row is read from the **source**, so a fifth
note scoped `zh-Hans` costs a paragraph of prose in all 21 other packs -- the rule the
validator now enforces, and the one nothing passed for a while -- plus a bordered box
on every Chinese sheet. The trap is not Chinese-only either: Hepburn's macron and
IAST's macron-and-dots collide with a Vietnamese reader's own marks the same way. As
notes that is eight concepts and 168 paragraphs.

*The slot exists.* `spec.head`'s `legend` prints the reader's own pronunciation key,
in the reader's own language, from the `legend` field of
`data/respell/rules/<reader>__<accent>.json`. `core/solve/index.js` says why in its
own comment: "It is the one thing on the card that explains the card, so it belongs
in furniture rather than taking a column." What shipped, in the order it was costed:

1. **The thirteen missing reader `legend` fields.** Nine tables had one --
   `ar he hi hu ko th zh-Hans tlh qya`, one more than the survey found -- and the
   thirteen that did not (`de el en es fr id it ja pt ru sw tr vi`) now do, `vi`, whose
   reader raised this, included. Each is a transcription of a decision already taken
   rather than a new one: every table's own `note` already states what its legend
   should say, per RESPELL-SYSTEMS.md's rule that a legend teaches only the glyphs that
   are not already ordinary orthography and that anything needing a second line means
   the notation is wrong. **They are authored here from those notes and want a native
   speaker's pass**, the same as any other string in a pack.

   **And `th`'s existing legend was English prose *about* the legend rather than a
   legend** -- "None. Every glyph in the output is ordinary Thai used for its ordinary
   sound…" -- so it printed in English in the head band of every sheet a Thai reader
   built. It is Thai now, and `th__th-TH.json`'s `note` records what it said.

2. **A target-keyed second part in the same slot**, from
   `data/registry/romanizations.csv`, joined into the `legend` slot beside the reader's
   own and selected by `fieldSet`, which repairs the defect recorded above: the slot
   printed the respelling key whether or not the respelling column was shown.

   **Keyed on (target, system), not on the system alone.** `bgn` names two different
   systems in `languages.csv`, and read off the corpus they share no mark: Russian's
   `ʼ ˮ ë` against Hebrew's `ẖ ‘ ’` and its acute. That is the same ambiguity
   `romanization_bgn` already has in `data/lang/ru` and `data/lang/he`.

   **And the line is a prose-free glyph equation, so one string serves all twenty-two
   readers** -- `ā á ǎ à = 1 2 3 4`, `ā ī ū ē ō = aa ii uu ee oo`. A per-reader prose
   line was costed and rejected: six systems by twenty-two readers is 132 strings, it
   would be longer in a band whose cost is the whole issue, and it could not be
   reviewed in most of the languages it would ship in. The equation is also this
   project's own precedent -- Bhargava's four-word legend, which RESPELL-SYSTEMS.md
   holds up as *the* pattern, is a glyph equation and not a sentence. The right-hand
   side is what to say when you cannot make the distinction, which for `iast` is the
   mark-free Hunterian the registry already names as Hindi's second system.

   Rows exist only where a mark carries a *misreading* hazard: `pinyin`, `hepburn`,
   `iast`, `ala-lc`. **Rejected: `bgn` (ru and he) and `appendix-e` (qya).** Their marks
   are native stress or vowel-quality marks that a reader misreads in the benign
   direction -- dropping information rather than adding error -- and a line for them
   would have to introduce a word for "stress", which is exactly what breaks the
   prose-free property. `elot`, `rr`, `rtgs` and `okrand` carry no diacritic at all,
   which was measured off the corpus rather than assumed.

   **The romanisation half is set in the Latin face, not the reader's**, which the
   recommendation did not anticipate: the band is one run in the source script's stack,
   and Noto Sans Thai, Devanagari and Hebrew draw none of `ǎ ǐ ǒ ǔ ṭ ḍ ṇ ṣ` -- so the
   pinyin caron, the glyph this whole request is about, would have been an empty box in
   the PDF for three of the readers who most need it. It costs nothing, because
   `stacksFor` already loads `latin` for every pair to set the romanisation and IPA.

3. **The quiz ticks the slot**, and the band's default stays off. Re-measured rather
   than taken on trust: 1.5 lines of the smallest type, 0.05-0.09 of type scale on most
   pairs, and a whole extra *pair* of faces on `es ← en` -- one more sheet of photo
   paper per card set. So the quiz ticks it only where the card's romanisation carries a
   mark, which is four of the twenty-two targets; `es` has no romanisation at all and
   therefore never pays. It is added to the band rather than replacing it, so a reader
   who had put the local emergency number in the middle keeps it.

   **A third defect came out of that measurement.** `headSize` was the theme's smallest
   field size flat, with no floor, so an `ar`, `hi` or `th` reader's band printed at
   5.20pt against its own 5.40pt -- and `tests/solve.test.mjs`'s floor test missed it
   because every spec it solves has `head.at: 'none'`, which is the "passes by having
   nothing to check" failure mode that test's own comment warns about. It is floored on
   the reader's script now, and a test asserts the band specifically.

*One cheaper answer exists for some targets and not for this one.* The romanisation
system is already a control -- `languages.csv` carries `romanizations` per language
and the format panel offers the menu, so `ja` has `hepburn;kunrei` and `ko` has
`rr;mccune`. Where a system's marks are the problem, a mark-free system for that
target is a data answer rather than an explanation, which is what the Thai and Chinese
packs did by hand when they dropped macron Hepburn for doubled vowels. It cannot
answer pinyin, because the tone marks *are* pinyin -- which is why the legend is still
the right fix for the case that was actually raised.

### ~~Every currency concept, checked against `regions.csv`~~ — shipped, with four left staged

The euro was scoped `de;fr;es;pt` and shipped the Italian pack without it; the Indian
rupee did not exist. Both were found by reading a concept's `applies_to` against the
countries the registry gives its language, so the whole table was read that way once.
Two gaps were filled -- **English had no currency concept at all**, which is the
Swahili shilling's case exactly and worse for being the most-used target: eighteen
pairs, eight countries, six currencies, nothing. `numbers-money.dollar` covers the
US, Canada, Australia and New Zealand, which all write `$`, and
`numbers-money.pound` covers the UK. The rest are staged here, worst first:

- **`ar` has no currency concept either**, and cannot take one the way English did:
  its six countries use four different words (`ريال` SAR, `جنيه` EGP, `درهم` AED and
  MAD, `دينار` JOD and IQD). This is the shilling's shape rather than the dollar's --
  one scoped concept whose `text` enumerates, as `TSh · KSh · USh` does -- and it
  wants an Arabic speaker to choose the order.
- **`es` has the euro and not the peso**, which is four of its six countries (MX, AR,
  CO, CL). Peru is a fifth word again (`sol`). This is the Italian euro case with the
  scope pointing the other way: the concept that exists covers the one country the
  language is *not* mostly spoken in.
- **`pt` has the euro and not the real**, and Brazil is the larger half of the
  readership. AOA and MZN are a third and fourth word.
- **`de`, `fr` and `it` all name Switzerland**, and none of them has the franc.
- **`ru` has the ruble only**; BYN, KZT and KGS are its other three countries.
  **`zh-Hans` has the yuan only**; SGD and MYR are the other two.
- **`tr` names Cyprus, and is not in the euro scope.** Arguable rather than wrong --
  the north uses the lira -- but it is the one remaining scope that a reading of
  `regions.csv` flags.

**The table was re-read row by row against `regions.csv` and mostly shipped.** Two
places where the reading disagrees with the list above, and the reading wins:

- **BYN is a ruble.** The Belarusian ruble is `рубль` and `numbers-money.ruble`
  already covers it, so Russian's gap is two countries rather than three -- and they
  are two different words, `тенге` and `сом`.
- **Singapore prices are 元 and 块 in Chinese** exactly as China's are, so
  `numbers-money.yu-n` and `.ku-i` already reach SGD and the Chinese gap is MYR alone.

Four new concepts, and three widened scopes:

| concept | scope | covers |
|---|---|---|
| `numbers-money.franc` + `.franc-symbol` | `de;fr;it;sw` | CHF for all three European packs, XOF for French (SN, CI), CDF for Swahili (CD). One word, five countries, four languages -- the shilling's shape, with the per-country abbreviation in the symbol row |
| `numbers-money.peso` + `.peso-symbol` | `es` | MX, AR, CO, CL. `sol` for Peru rides in `text_alt` |
| `numbers-money.real` + `.real-symbol` | `pt` | BR |
| `numbers-money.local-currency` | `ar;ru` | the enumerating shape: `ريال · جنيه · درهم · دينار` and `тенге · сом` |
| `numbers-money.euro` + symbol | `+tr` | CY |
| `numbers-money.rupee` + symbol | `+en` | IN, which is one of the eight countries the registry gives English |
| `numbers-money.dollar` + symbol | `+fr` | CA, which is one of the six it gives French |

Three things that came out of doing it, all of which would otherwise be rediscovered:

- **`numbers-money.local-currency` has no symbol row**, alone among the currencies,
  and the reason is measured. A symbol row's respelling is blank where the text is a
  bare sign (`€`, `₹`, `$` -- twelve such cells in this batch), and *junk* where it is
  an abbreviation: espeak read `ر.س · ج.م · د.إ · د.أ` as `rs dʒˈamm dʔ dʔ`, with the
  two dinars indistinguishable, and `₸ · с` as `ˈɛs`, a respelling of one Cyrillic
  letter. Both would have printed on 36 pairs. `text_alt` gets no IPA by design, so
  the abbreviations ship there.
- **Widening a scope is not free.** An in-scope symbol row carries the symbol (`€`)
  and an out-of-scope one carries the gloss (`euro (symbol)`), so the three widenings
  each flipped one row's shape -- and on the pairs where that language is the *source*,
  the gloss column loses the words and shows the symbol twice. That is already the
  status quo among the six euro packs, and it is the reason **`en` was left out of the
  euro scope** (below) while `tr` went in: Ireland is one of eight English countries
  and English is the source on eighteen pairs, so the trade runs the other way.
- **Hebrew joined `languages.csv` while this was being written**, with `regions=IL`
  and ILS in `regions.csv`, so **the Hebrew pack has no currency concept at all** --
  the Arabic case again. `numbers-money.shekel` is not added, because the target rows
  have to be Hebrew and that pack belongs to another author; the note is in
  `tmp/new-concepts.md` for them. `₪` U+20AA is in none of the shipped faces today.

**Left staged, with the reading recorded so nobody has to redo it:**

- **`en` and the euro (IE), and a `rand` for South Africa (ZA).** English serves eight
  countries and five currency words; the dollar covers four countries and the pound
  one, and the rupee now covers India. Ireland and South Africa are each one of eight.
  The euro is declined on the gloss trade above; the rand would be a new concept and
  38 rows for one country of eight, on the pack that pays for every row eighteen times.
- **`es` and the sol (PE).** In `text_alt` on the peso row rather than a concept: it
  is one country of six and a different currency, not a variant of the peso.
- **`pt` and the kwanza (AO) and metical (MZ).** Two more words for two more countries,
  neither of which is the larger half of anything.
- **`zh-Hans` and the ringgit (MY).** 令吉 is real and 1 of 3 countries; 元 and 块
  already reach Singapore, so this is the smallest remaining gap in the table.

### ~~`numbers-money.lakh` and `.crore`~~ — shipped

The unit gap of the same kind, and the corpus already accepts the shape: `万` is
`numbers-money.y-w-n`, universal, glossed "ten thousand", because a myriad-grouped
number is a thing a Western reader cannot parse. India groups the same way and one
step further up. The Hindi pack stops at `दस हज़ार`, so a reader who can count to
ten thousand still cannot read `₹5 लाख` on a price board, which is how every Indian
price above about a hundred thousand is written -- along with the digit grouping
that goes with it, `1,00,000` rather than `100,000`.

Scope `hi`. The gloss is the awkward part rather than the target text: most languages
have no word for either, so the reader side is a numeral -- and Arabic cannot print
one, because the validator refuses more than one digit in a right-to-left row. So
`مئة ألف` spelled out, which is the same repair the five existing Arabic numeral rows
took.

**Shipped** at ranks 16 and 17 -- in the number line, between 一万 at 15 and 半, which
moved to 18 along with 元 and 块 -- because 100,000 and 10,000,000 belong in the
sequence rather than at the end of the section. `1,00,000` and `1,00,00,000` ride in
the Hindi rows' `text_alt`, so the digit grouping ships with the words.

Three details worth keeping. The gloss turned out **not** to be a numeral in most
languages: the number line's own rows are words (`dix mille`, `zehntausend`,
`десять тысяч`), and only English uses digits, from the reference sheet -- so lakh is
`cien mil`, `十万`, `십만`, `แสน`, and `100,000` in English alone, matching each pack.
Arabic took the spelled-out repair as predicted. And Swahili already had the word:
**`laki` is the Hindi lakh**, borrowed, and `Laki moja` is ordinary Tanzanian and
Kenyan Swahili for a hundred thousand.

They are in their own cluster rather than `numbers-money.misc`, which is the number
line: eighteen items of cluster decay would have made `solve/weights.js` value a lakh
at nothing, which is the same trap the priority ladder avoids by not using the decayed
score at all.

### ~~`pharmacy-symptoms.i-think-i-have-dengue`~~ — shipped

The disease gap beside the malaria pair, and it reaches more of the corpus than
malaria does: dengue is endemic in Thailand, Vietnam, Indonesia and India, has been
transmitted locally in Italy and Greece, and its first days are indistinguishable
from malaria's, which is exactly why naming it separately gets the right test. Unlike
malaria there is no treatment to ask for, so the second row would be the warning
rather than the test -- the standard advice is paracetamol and *not* ibuprofen or
aspirin, which the bank already has words for in `pharmacy-symptoms.analgesic`.
Scope roughly `th;vi;id;hi;pt;es`, with `it` and `el` a judgement call.

**Shipped** at exactly `th;vi;id;hi;pt;es`, rank 6 -- directly after the malaria pair,
which pushed the rest of `pharmacy-symptoms` up one -- importance 0.862, and its **own
cluster** rather than a third rung of `pharmacy-symptoms.malaria`. That is the load-
bearing choice: the two diseases are complements, not alternatives, since the first
days are indistinguishable and naming the second is what gets the right test, so a
card that already carries the malaria pair must not value this row at 55% of itself.

`it` and `el` are **out**, and that is the judgement rather than an oversight: local
transmission in Italy and Greece is sporadic where it is endemic in the six, and a
scoped concept still costs a row on every card in its scope. One row rather than two,
for the reason the entry gives -- there is nothing to ask for.

Each row is its own pack's reviewed malaria frame with the name the country's health
service uses: ไข้เลือดออก, sốt xuất huyết, demam berdarah, डेंगू, dengue, dengue.

## Worth doing, lower urgency

### `dietary-needs.jain` and `dietary-needs.no-onion-garlic`

Raised by the Hindi translator. Indian kitchens are set up to answer exactly these
two, and `शुद्ध शाकाहारी` does not cover either. `no-onion-garlic` is currently
reachable by filling `utility-templates.please-do-not-add {}` with प्याज़-लहसुन,
which works but buries it. Scope `hi`, possibly `hi;th;id` for the Buddhist
vegetarian overlap.

### ~~`rail-station-words.fare`~~ — shipped. `.conductor` staged, and the split is the finding

Raised by the Swahili translator: `nauli` and `kondakta` are the two words you need
on a *daladala* or a *matatu*, and there is nowhere to put them. Universal — a fare
and a conductor exist everywhere this corpus goes.

**`fare` shipped**, universal, rank 15, importance 0.700. **`conductor` did not**, and
the reason is the half of the argument that does not hold: a fare names the same thing
in all nineteen, and a conductor does not. The person the Swahili request means is the
one you hand money to on a minibus -- `kondakta`, `kondektur`, `cobrador` -- and in
Japan, Korea, Germany and Italy that person does not exist; the nearest word is a
ticket *inspector* (`車掌`, `Schaffner`, `controllore`, `revisor`), who checks what you
already bought. Printing 車掌 glossed "conductor" teaches a word for an interaction the
traveller will never have, and printing `cobrador` in Spain is wrong the way `manteca`
is wrong in Argentina. It wants either a scope, which would be arbitrary, or a
different concept -- "who do I pay on the bus?" is a phrase rather than a word, and it
would earn its row.

One incidental finding from filling `fare`: the Thai printed term `ค่าโดยสาร` triggers
the `thaig2p` phantom-syllable defect (`kʰaː˥˩doːj˧saːn˩˩˦ra˦˥`, four syllables where
Thai has three), the same class as `ขอบคุณ` → *kop-kun-na*. `ค่ารถ` is what a passenger
says, comes back clean, and carries `ค่าโดยสาร` in `text_alt`.

### `payment-receipt.can-i-pay-by-mobile-money`

Also Swahili. Mobile money is how East Africa pays, and it sits next to a QR-code
row that the region barely uses. Scope `sw` at minimum; Indonesian and Indian
readers would use it too.

### ~~`dietary-needs.does-it-contain-pork-fat`~~ — shipped

Raised by the Spanish translator, and it is the European half of the pork problem
the Japanese and Korean ones raised for stock. `manteca`, `grasa de cerdo`,
`lardons`, `Schmalz` and `Speck` go into beans, stews, pastry and quiche as
*seasoning*, so a cook who hears "no pork" does not count them. The bank solves this
exact shape once already, for fish, in `dietary-needs.does-it-contain-fish-stock`.

Note the translator's warning about `manteca`: it means *lard* in Spain and *butter*
in Argentina and Uruguay, so the Spanish row cannot simply name it. That is an
argument for a concept each pack fills locally rather than a longer shared string.

**Shipped**, universal, rank 1010, cluster `dietary-needs.hidden-pork` beside the
stock row -- see the pork entry at the top of this file for what that clustering
buys and for the two rows it narrowed. The `manteca` warning is why the Spanish row
is `¿Lleva manteca de cerdo?` and not `¿Lleva manteca?`.

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

## From the slang round

`data/concepts/slang.csv` is fourteen concepts that name a **function** — the mild
positive, the intensified positive, the reply to thanks — and let each language
supply its own idiom for it. Everything below came out of filling them and is
recorded so it is not rediscovered.

### Functions considered and rejected

Named because each looks obviously right until you try to fill nineteen cells.

- **`wow`** — a surprise exclamation. Rejected because in a majority of the
  nineteen the answer is either an international onomatopoeia that teaches nothing
  (`wow` / `¡guau!` / `哇` / `واو`), or the same word as "that's great" (`すごい`,
  `Wahnsinn`), or ambiguous between admiration and dismay (`やばい`, `¡Madre mía!`).
  `slang.seriously` carries the surprise function with far more information per row.
- **A casual greeting** (`what's up` / `¿qué pasa?` / `Wie geht's?`). Rejected on
  register: a traveller's *first* words to a stranger are the one place where the
  familiar register is guaranteed to be noticed, and `introductions.how-are-you`
  already covers the neutral form. The same argument rejects a clipped casual
  **thank-you**.
- **An intensified negative** ("that's awful"). Rejected because it is where the
  obscenities live in most of the nineteen — and because a traveller has almost no
  use for saying it to a stranger. `slang.thats-bad` keeps one mild negative.
- **`got-it`** — redundant against four existing flavours of okay in
  `quick-responses` (`okay-can`, `okay-fine`, `works-okay`, `yes-right`).
- **`hurry-up`**, **`never-mind`**, **`I'm exhausted`**, **`good luck`**,
  **`that's crazy`**, **`cute`** — all either address the hearer in the imperative,
  or duplicate a neighbour, or are too rare to earn a row on a card this size.

### The empty cells, which are findings rather than gaps

- **`slang.thats-pricey` has no Arabic row.** The colloquial intensifier is the most
  regionally split word in the language — `أوي` (EG), `كتير` (LV), `وايد` (Gulf),
  `مرة` (MA) — so no single form serves the six countries the pack claims, and
  `shopping.that-is-too-expensive` already prints `هذا غالي جدّاً`. The bare
  adjective on its own adds nothing.
- **`slang.youre-welcome` has no Hindi row.** Hindi's casual reply to thanks *is*
  `कोई बात नहीं`, which `social-basics.you-are-welcome` already prints; there is no
  second register above it, and `स्वागत है` means "welcome to a place" rather than
  "don't mention it".
- **`slang.youre-welcome` has no Indonesian row**, for the same reason:
  `Sama-sama` is both the textbook answer and the real one.
- **`slang.cheers` has no Swahili row.** Urban Kenya and Tanzania use the English
  word; the Swahili alternatives are occasion-specific wishes rather than a
  conventional toast, and a confidence-0 guess here is worse than a blank.
- **Klingon supplies only ten of the fourteen**, and three of the four blanks are
  the same finding: `qay'be'`, `Qo'` and `Qapla'` are already on the card under
  Social + basics and Quick responses, because **Klingon has no register layer
  above its dictionary** — the slang and the lexicon are the same words. The fourth,
  `youre-welcome`, is a form the language does not have.
- **Quenya supplies six**, and that is the strongest "decline the concept" case in
  the corpus. The attested Quenya corpus is high-style verse, liturgy and
  nomenclature; Tolkien wrote no colloquial register, so there is nothing for a
  slang cell to be faithful to. Inventing one would be the calque problem with no
  speech community to be strange in front of.

### Concepts this round would like, staged rather than added

- **`slang.thats-annoying` / a mild complaint about a *situation*.** Five packs had
  a natural idiom for it (`Qué rollo`, `Che palle` — no, obscene-adjacent — `Was
  für ein Mist`, `Какая ерунда`) and it was cut because the safe forms and the
  common forms are different forms in about half the nineteen. Worth revisiting with
  a translator per pack rather than one designer.
- **A `note` at the head of `slang` in the reader's own language**, saying in one
  sentence that these are for people you are already friendly with. Rejected for
  this round on the requester's own instruction — a warning in a note is a warning
  nobody reads — and the section title carries it instead (`Slang (casual)`,
  `Umgangssprache`, `くだけた表現`, `Bahasa gaul`). Recorded because if the section is
  ever widened past the "about a thing, never about a person" rule, a note becomes
  necessary rather than optional.
- **`literal` on the `refphrase` template.** This is a design question rather than a
  concept, and slang is where it bites hardest: the most memorable content in the
  section is the literal sense — `Biraz tuzlu` "a bit salty", `Ça coûte un bras`
  "it costs an arm", `꿀맛이에요` "honey taste", `Bayıldım!` "I fainted", `Ez borsos`
  "this is peppery" — and no reference template defines the field, so all 121 of
  those cells are written and none of them draws. `entry` would draw them but only
  behind a toggle that is off by default, at twice the height per row. The cells are
  in the corpus and correct; they are waiting on either a fifth `refphrase` column
  or a per-section field override.

### Two corpus defects found while filling this

- **`registry/section-titles/hu.csv` was the one file of nineteen written with LF
  line terminators.** Harmless where it is read — `core/csv.js` and Python's `csv`
  both accept it — but `load_rows` in `scripts/build_ipa.py` splits on `\r\n` and
  would have read the whole file as a single row had it ever been a `data/lang/`
  file. Normalised to CRLF with this change.
- **The English reader has no rule for German `/ɔø/`.** `teuer` is `tˈɔøɜ` in the
  `de` column and respells as `TAW-ur-uh` — three syllables where German has two,
  and `aw` where the diphthong wants `oy`. It already prints on the shipped
  `shopping.that-is-too-expensive`, so this is a `data/respell/rules/en__en-US.json`
  nucleus rule rather than anything about the data.

## Two the Hebrew pack asked for

Both are Israel's version of a trap the bank already handles for somewhere else, and
both are staged rather than added for the usual reason: a universal concept costs
every one of the twenty-two packs a row, and a scoped one costs twenty-one gloss rows.

- **`dietary-needs.is-this-kosher`, the mirror of `is-this-halal`.** The halal row is
  *universal* and argues for itself: "askable anywhere -- a traveller who needs it
  needs it in Japan too". Every word of that applies to kosher, which is also a
  certification with a visible mark (a הכשר badge) rather than a judgement a cook
  makes, so the answer is checkable and the question is worth asking. Scoping it to
  `he` would be wrong for the same reason scoping halal would be. The Hebrew is
  `זֶה כָּשֵׁר?` and the other twenty-one need a word they mostly already have as a
  loan (`kosher`, `коше́рный`, `コーシャ`, `کوشر`).
- **`dietary-needs.no-sesame`.** Sesame is one of the fourteen allergens Israeli
  labelling names, and tehina is in or beside a very large share of what a visitor
  is served -- the same shape as the Vietnamese fish-sauce case that got
  `does-it-contain-fish-stock` its own row, and as the Hungarian `zsír` case. It is
  also the one major allergen with no row of its own: `no-nuts` and `no-peanuts`
  have one each, and sesame has to go through `i-am-allergic-to {}`, which is a slot
  the traveller has to fill in a language they do not write. `בְּלִי שֻׁמְשוֹם`.
