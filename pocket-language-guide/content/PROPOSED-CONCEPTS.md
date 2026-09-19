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

**The corpus is 53 packs now, and the cost sentence above needs one correction that
matters whenever a scope is being weighed.** A universal concept and a scoped one cost the
same number of rows -- 53 either way -- because `applies_to` decides which *target* sheets
print a row and any language can be the source that glosses another's sheet. What differs
is what the validator says about a gap. A universal concept with a missing row shows up
only in that language's coverage percentage, which is the silent case; a *scoped* one with
a missing gloss is named language by language, with the count of pairs it then fails to
print on. So a scope is the cheaper choice in warnings as well as the honest one about
printing, and a universal concept has to be filled everywhere or its gap goes unreported.
Measured on the batch below: three concepts and 153 pack rows moved the warning count from
195 to 197, and both new warnings are the two conlang packs.

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

### `body-parts.shoulder`, `.neck`, `.calf` — researched, staged, waiting on a gloss sweep

The section carries fifteen words — head, stomach, back, throat, tooth, chest, eye,
ear, leg, arm, foot, hand, knee, ankle, skin — and these three are not among them,
which is a gap on its own merits: a pharmacy row that points at where it hurts needs
a shoulder as much as it needs a knee.

They came up while building the conversation board's spa content, and were
deliberately **not** shipped with it. The board did not need them: its "please focus
on my shoulders" rows are complete idiomatic sentences rather than a template plus a
noun, because Mandarin will not take the template — 按摩背部 is idiomatic and 按摩背
is not, while 按摩脚 is right, so the noun form varies with the body part. Shipping
three *universal* words translated into two languages would have added 153
missing-gloss warnings against a baseline of 197, buying the board nothing.

So they belong in a gloss sweep with their fifty-one siblings rather than in a
feature branch. The Mandarin is researched and sourced: 肩膀 (zh.wikipedia 肩, lead
「肩，俗稱肩膀」), 脖子 (zh.wikipedia 頸, lead 「又稱脖子」 — the colloquial form, to
match this pack's 肚子, 耳朵, 眼睛 rather than the clinical 颈部), 小腿 (MOE
重編國語辭典修訂本). Importances 0.755, 0.745 and 0.690, which slot them between
`throat` and `tooth`, and between `leg` and `arm`, and just under `skin`.

**One narrowing to carry forward.** 小腿 is the *lower leg*, not the calf muscle.
Mandarin has no everyday word for the muscle alone — 腓腸肌 is anatomical and
zh.wikipedia offers no colloquial name — so the `literal` column has to say so rather
than imply a precision the word does not have. Any language added later should be
asked the same question rather than assumed to split the two the way English does.


### ~~`dietary-needs.no-onion-garlic`~~ — shipped. `.jain` refused, and the refusal is the finding

Raised by the Hindi translator. Indian kitchens are set up to answer exactly these
two, and `शुद्ध शाकाहारी` does not cover either. `no-onion-garlic` is currently
reachable by filling `utility-templates.please-do-not-add {}` with प्याज़-लहसुन,
which works but buries it. Scope `hi`, possibly `hi;th;id` for the Buddhist
vegetarian overlap.

**`no-onion-garlic` shipped**, universal, rank 1014, importance 0.650, its own cluster.
Universal rather than the `hi` the request asked for, and the reason is the halal row's:
`applies_to` names the *target*, so scoping it to Hindi prints the row only on a card for
India, and a Jain or an observant Vaishnava avoids alliums in Tokyo too. The Buddhist
overlap the entry guessed at is real and wider than `hi;th;id` -- onion and garlic are two
of the five pungent roots, and the Chinese and Vietnamese encyclopaedia articles for garlic
and the onion say so themselves (`為佛教中的五辛之一`; `một trong năm loại rau cay không
được ăn trong Ngũ tân`) -- which is an argument for universal rather than for a third code
in the scope.

**Fifty of the fifty-three filled.** Each row is the pack's own `no-pork` or `no-meat`
negation frame with the two bulbs named from the language's own encyclopaedia article for
*Allium cepa* and *Allium sativum*. Three things came out of filling it:

- **The genus word is a trap in three packs, and the row names both bulbs because of it.**
  Indonesian `bawang` is the genus and Javanese `bawang` on its own is the *garlic*, so
  `Tanpa bawang` is ambiguous in one and wrong in the other; Thai `หอม` is also the word
  for *fragrant*, so the row says `หัวหอม`. And where the kitchen's allium is the shallot
  rather than the onion the row names the shallot, because that is what is in the pan --
  `bawang merah`, `brambang`, `หอมแดง`.
- **Yoruba is blank, and it is the sesame blank again.** `yo.wikipedia` has an article for
  the onion (`Àlùbọ́sà`) and none for garlic; searched for `àyù`, `aayu`, `ata ilẹ` and
  `Allium sativum` it returns nothing, and **its own cookery articles print the English
  word `garlic` untranslated** -- `Derssa` reads *a ṣe pẹ̀lú garlic, cumin, red chili
  pepper flakes*. Everything else on offer is an aggregator, a forum thread or a
  translation site, which is the one source class this project's rule names as
  inadmissible. Half a row, the onion alone, would misstate the concept, so there is none.
- Klingon and Quenya have no row, for the same reason neither has a `no-pork` row.

**`jain` is refused, and the reason is `is-this-kosher`'s own test applied to a second
label.** The bank has taken an identity label as a row twice, for halal and for kosher, and
both times on one ground: the label names a *checkable mark* that exists in the countries
this corpus covers, so the answer is verifiable and the question is worth asking. Jain food
has no mark and no certifying body publishing in these languages. Read the way the kosher
entry read `kashrut`, the numbers are sharper than that argument needs. **`Jainism` has an
encyclopaedia article in 46 of the 53 languages and `Jain vegetarianism` in nine** -- `ar
bn es fr hi ml te th zh` -- and four of those nine are descriptive titles *about* the
religion's diet (`Vegetarianismo jaina`, `Végétarisme jaïn`, `耆那教素食主義`) rather than a
word a cook reads off a plate. That is exactly the split the kosher row found between the
name of the law and the word the food carries, and it falls the same way: scoped to the
Indian-language targets where the label does work, the concept would still need a gloss in
41 packs whose only attested form is the encyclopaedia headword for the religion, and the
validator would name all 41.

What the request needs is now covered twice over -- `no-onion-garlic` carries the allium
half in every pack, and the root-vegetable half is reachable through
`dietary-needs.i-do-not-eat {}` and `utility-templates.please-do-not-add {}`. **What is not
covered is the label itself, which really is the efficient request in an Indian kitchen**,
and the concept to propose if anyone revisits this is `dietary-needs.no-root-vegetables`:
a function rather than an identity, which is the shape `slang.csv` established and the
shape every filled row in this file has.

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

**Shipped as `transit-rides.where-do-i-pay-the-fare`, universal -- and the "who" became
a "where", which is the better argument.** "Who do I pay?" fails this entry's own test:
in Tokyo the answer is a farebox and in Berlin a ticket bought before boarding, so it
would print a question whose premise is false in four packs, which is the same defect
as printing 車掌 glossed "conductor". *Where* do I pay the fare has a true answer in
all 53 and still gets a matatu passenger pointed at the kondakta. It went in
`transit-rides` rather than `rail-station-words`, which is a table of `ref` words and
would have had to print a phrase as a noun, and each pack's row is built on the `fare`
word this same request produced one concept over.

One incidental finding from filling `fare`: the Thai printed term `ค่าโดยสาร` triggers
the `thaig2p` phantom-syllable defect (`kʰaː˥˩doːj˧saːn˩˩˦ra˦˥`, four syllables where
Thai has three), the same class as `ขอบคุณ` → *kop-kun-na*. `ค่ารถ` is what a passenger
says, comes back clean, and carries `ค่าโดยสาร` in `text_alt`.

### ~~`payment-receipt.can-i-pay-by-mobile-money`~~ — shipped, scoped `am;sw`

**Shipped, and the scope was read off the packs rather than off the argument below.**
Reading `pay-by-qr-code` across all 53 showed that wherever a wallet is paid by
*scanning*, the QR row already reaches it and the pack says so itself: `id` and `jv`
print `QRIS` in `text`, `hi` carries `यूपीआई चलेगा?` in `text_alt`, `kn` and `ml` carry
ಯುಪಿಐ/യുപിഐ, `ur`'s literal names Raast, JazzCash and Easypaisa, and `bn`'s names
bKash and Nagad. So the Indic packs and Indonesian are **out**, and UPI is a different
animal -- a bank-to-bank rail initiated by a QR -- which wants its own concept if
anyone wants one. What is different in KE/TZ/UG and ET is a till or paybill number
keyed on the phone, not a scan. `fr` (SN, CI) and `ha` (NE) were weighed and refused
on a majority-of-regions rule: unlike the franc, which a Senegal card must print
because the currency is what a traveller counts, a fourth payment method is a row
taken from something else on a card read in France or Kano.

The Swahili pack was already routing around the gap inside the QR row's `text_alt`
(`Kulipa kwa M-Pesa?`) -- exactly the burial the translator described.


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

### ~~`dietary-needs.no-dried-fish`~~ — shipped as `.does-it-contain-dried-fish`, and it absorbed the jeotgal request

Swahili again: `dagaa` (dried sardines) is used across Tanzanian and Kenyan cooking
the way fish sauce is used in southeast Asia, and
`dietary-needs.does-it-contain-fish-stock` will not catch it. The same concept would
serve `th` (`กะปิ`) and `id` (`terasi`), both of which their translators flagged
separately — so this is one concept three packs want.

**Shipped**, scoped `bn;fil;ha;id;jv;km;ko;lo;ms;sw;th;vi;yo;zh-Hans`, rank 1015,
importance 0.660, cluster `dietary-needs.hidden-fish` at rank 1 beside the fish-stock row.
Four decisions, and one finding that is worth more than any of them.

**A question rather than a request, which is what the name changed.** The entry proposes
`no-dried-fish`; the bank's own split puts a *request* in a `no-` concept and a *question
to a cook* in a `does-it-contain-` one, which is why `no-seafood` and
`does-it-contain-fish-stock` are two concepts and not one. Dagaa, กะปิ and terasi are
already in the dish by the time you are looking at it, so it is the question.

**The stock row is the liquid half of the vector and this is the paste half, so they share
a cluster.** Broth, dashi and fish sauce there; dried fish and fermented shrimp paste here
-- the same question about a different vector, which is the `hidden-pork` clustering
exactly. Stock keeps `cluster_rank` 0, because a broth reaches more of the countries this
corpus covers than a paste does.

**Scoped rather than universal, on the `conductor` test.** A row asking a Czech or a
Georgian cook about shrimp paste teaches a question with no true answer, where a fermented
fish or shrimp paste is a base seasoning of every cuisine in the scope. Two codes went in
that the entry does not name, and they are the find: **West Africa is a fifth region with
this vector**, and `yo.wikipedia`'s own cookery articles say so -- `Edikang ikong` lists
`ẹja gbígbẹ` and `edé` among its base ingredients and `Ekwang` does the same, as do
`ha.wikipedia`'s `Soup Kandia` and `Miyar Eru` with `busasshen kifi`. `ja` is deliberately
**out**: 煮干し and 鰹節 are dashi, which the stock row already has.

**Eight packs were already routing around this concept inside the stock row, and five of
them had given up the broth question to do it.** That is the strongest evidence in this
file that a concept was missing, and it is worth reading as a list: `km` asked only about
`ប្រហុក` and `ទឹកត្រី`, `lo` only about `ນ້ຳປາ` and `ປາແດກ`, `th` and `vi` only about
`น้ำปลา` and `nước mắm`, and `id`, `jv` and `ms` folded `terasi`, `trasi` and `belacan`
into `text` beside the broth. Five of those rows are narrowed to the liquid now and the
paste is here, which is the repair the Greek and Hungarian rows took when
`does-it-contain-pork-fat` shipped: leaving them would print `terasi or fish broth` and
`terasi` as two rows of one card, which reads as a mistake. `bn`'s stock row is untouched,
because it asks about the fish itself -- Bengali cooking has no stock as a separate item --
and `ko`'s and `sw`'s were already about broth.

All 51 natural packs filled. **The 37 out-of-scope glosses say *dried fish* rather than
*shrimp paste***, because that is the phrase a reader needs in order to recognise the row,
and each is the pack's own stock-row frame with the dried-fish term from the language's own
encyclopaedia. Fourteen of those terms are article titles in their own right -- `ഉണക്കമീൻ`,
`கருவாடு`, `ଶୁଖୁଆ`, `干物`, `Trockenfisch`, `Kurutulmuş balık`, `Չորացրած ձուկ`,
`سمك مجفف`, `ماهی خشک`, `Torrfisk`, `Sztokfisz`, `Stokvis`, `Pescado seco`, `Kapakala` --
and the rest are composed from the adjective the same encyclopaedia uses of dried fruit,
hay or raisins plus the pack's own word for fish. **Four were settled by asking each wiki
whether it *uses* the phrase rather than whether it has an article for it**, which is a
cheaper test than a langlink sweep and found what the sweep could not: `szárított hal` in
sixteen Hungarian articles, `quritilgan baliq` in fourteen Uzbek ones, `ხმელი თევზი` in two
Georgian ones and `सुक्खा माछा` in one Nepali one. Amharic is the one row resting on a
dictionary rather than an encyclopaedia -- `ደረቅ` in the Abyssinica Amharic-English
dictionary -- and its `provenance` says so rather than implying an encyclopaedic source
there is not.

### ~~`pharmacy-symptoms.jeotgal`~~ — shipped inside the concept above. The wider concept is refused

The Korean translator's version of the same problem: 젓갈, salted fermented seafood,
is in most 김치, which is a shellfish trap in a dish nobody thinks of as seafood.
Along with the unasked 반찬 that arrives anyway. Together with `no-dried-fish` and
the pork-stock row above, this suggests the real gap is one concept shaped like
"what is in this that I would not expect", filled per language — which is a design
question rather than a row.

**The narrow concept won, and the entry's own framing is why.** 젓갈 shipped as the Korean
row of `dietary-needs.does-it-contain-dried-fish` -- `젓갈 들어갔어요?` -- which is dagaa,
กะปิ and terasi under a fourth name.

**Two things about the request are worth correcting rather than adopting.** It is filed
under `pharmacy-symptoms` and it is not a symptom: it is a question to a cook, which is
`dietary-needs`. Both sections are safety-gated, so nothing was lost by the mistake except
the section. And the unasked 반찬 that arrives anyway is a different problem from a hidden
ingredient -- it is a dish nobody ordered, which `dietary-needs.i-do-not-eat {}` and a
pointed finger already reach.

**The wider concept is the vaguer answer rather than the better one, and the bank has
already decided this once.** The pork problem was exactly this shape, and it shipped as
*three* concepts split by vector -- meat, stock, fat -- rather than as one `hidden-pork`
question, for the reason recorded at the top of this file: only `text` is guaranteed to
print, so a row has to name a thing the cook recognises. A row asking "what is in this that
I would not expect?" asks the cook to do the traveller's thinking and returns prose the
traveller cannot read. It is also `food-ordering.does-it-contain {}` with a vaguer slot,
and that row is already in all 53 packs. The gap the three requests share is real, but it
is a gap in *coverage of vectors*, and the way to close it is one more `does-it-contain-`
row at a time -- which is what stock, fat and now dried fish are. A fourth is already
named and not taken: the European hidden fish is the anchovy, in Worcestershire sauce, in
puttanesca, in a Caesar dressing and in Janssons frestelse, and it is a *cured* fish rather
than a dried or fermented one. Whoever proposes it should read this paragraph first.

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

### ~~`food-ordering.is-it-cheaper-at-the-counter`~~ — shipped as `.does-it-cost-more-at-a-table`. The `common-signs` pair is refused

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

**Shipped**, scoped `es;fr;it;pt`, rank 1011, importance 0.690, its own cluster. Three
decisions.

**The question, not the sign pair -- and "the second is the cheaper one" is the half of
this entry that does not hold.** `common-signs.at-the-counter` and `.table-service` would
be two `ref` words in a shared-width table instead of one `entry` phrase, which is cheaper
in vertical space and more expensive in rows. But the deciding argument is the one this
file already made against `common-signs.orario-continuato`: a reference word is *the
absence of the problem rather than the problem*. `al banco` glossed "at the counter" does
not tell a reader that the price differs, and not knowing that the price differs is the
entire harm. The question contains the fact. The counter word rides in `text_alt` on the
four in-scope rows, so a reader who wants to match the posted list still can.

**Asked from the table side rather than the counter side, and the reason is countable.**
All 53 packs already carry a word for a table, from `food-ordering.table-for-two`, and
**not one carries a word for a bar counter** -- so `is it cheaper at the counter` would
have needed 47 new nouns in languages where a counter is not a priced place at all, where
`does it cost more at a table` composes out of each pack's own rows. That is the
`conductor` → `where-do-i-pay-the-fare` move again: the same fact asked through the term
every pack can already say.

**The scope rests on posted-price rules rather than on custom**, which is what let `el` and
`tr` be refused without guessing. France's *arrêté du 27 mars 1987* requires the menu to
show the `au comptoir` and the `en salle` price whenever they differ; Italy's price-display
rules for `pubblici esercizi` require the table-service component to be stated separately;
Spain's consumer authorities require any `barra`/`mesa`/`terraza` difference to be itemised
in figures rather than as a percentage; Portugal's ASAE requires the same of an
`esplanada` surcharge. Greece and Turkey have no standing-espresso tier for such a rule to
attach to, so they are out, on the reading that kept `es` out of the cover charge.

All 51 natural packs filled; the 47 glosses are each pack's own `table-for-two` and
`that-is-too-expensive` recombined, and the four in-scope rows name both tiers.

### ~~`payment-receipt.what-is-the-cover-charge`~~ — shipped, scoped `el;it;pt;tr`

**Shipped.** `es` is deliberately out: a Spanish bill charges the bread as an item you
can decline, not a fixed per-person cover. Given its own cluster rather than a rung of
`etiquette.service-charge`, on the dengue precedent -- different money, so a card with
one gains a full row from the other. One find recorded rather than acted on: Japan's
お通し代 is the same shape, and it sits in the `ja` row's `literal` rather than being
asserted into the scope.


Italy's `coperto` is a fixed per-person charge that appears on a restaurant bill and
is neither a service charge nor a tip. `etiquette.is-service-included` does not find
it — the honest answer to that question in Italy is usually "no", and the bill still
carries a line the traveller did not order. `Quant’è il coperto?` is the question,
and it is asked before sitting down rather than after eating.

The same concept serves Portugal's `couvert`, Greece's and Turkey's bread-and-cover
lines, and the `pane e coperto` of a menu written before 2000. It belongs beside
`is-service-included` rather than replacing it, because they are different money.

### ~~`time-scheduling.what-time-do-you-reopen`~~ — shipped, scoped `ar;el;es;fa;it`

**Shipped**, mapped through `regions.csv`. `fa` is in because Iran's bazaars keep the
same midday break and it is the Gulf's other shore; `pt` is out because Portugal's
lunch closing is a small-town pattern and Brazil, which most `pt` cards serve, has
none. The Greek pack was already routing around this one too --
`what-time-does-it-close` carried `Κλείνει το μεσημέρι;` in `text_alt` with the
literal "also: does it close at midday? (siesta)".


`common-signs` carries open, closed and temporarily-closed, and `time-scheduling`
carries opening and closing time — but a shop that is shut at two in the afternoon
in Italy is neither closed nor temporarily closed, it is on `riposo` and will reopen
at four. The useful question is the reopening time, and there is no row for it.
`A che ora riapre?` is the Italian; the concept applies wherever a midday break is
normal, which is Italy, Spain, Greece, much of Latin America and most of the Gulf.

`common-signs.orario-continuato` — the sign a shop puts up to say it does *not*
close at midday — is the sign-side half of the same fact, and is the weaker half:
it is the absence of the problem rather than the problem.

### Weaker: a restricted-traffic-zone sign — read, and refused. The entry was right about itself

Driving into an Italian historic centre through a `ZTL` (zona a traffico limitato)
is an automatic fine issued by camera, and the sign is a bare white circle with a
red border plus three letters. It is a real and expensive harm to visitors, and the
Italian pack cannot carry it: the bank has no driving content at all, so a single
`common-signs` row would be orphaned among words about trains and trails. Recorded
so the next person who proposes a driving section has the strongest argument for one
already written down.

**Refused, and both of the things that came out of checking it strengthen the entry's own
argument rather than weakening it.**

The first is that the orphaning is worse than "no driving content". Read against
`sections.csv`, the corpus has 59 sections and **not one of them addresses a reader who is
driving**: `taxi`, `transit-rides`, `rail-station-words` and `pickup-meeting` are all about
being carried, there is no `place-words.parking`, and `common-signs` is ten words about
doors and thresholds plus three about opening hours. A `ZTL` row would be the only row in
the bank spoken to a driver, sitting in a table a pedestrian reads.

The second is that a sign word is the wrong instrument for this harm even once the section
exists. The fine is issued by a camera at the boundary, so what a reader needs is to have
known *before getting into the car* -- which is a question to a hotel or a hire desk
("can I drive to the hotel?", "is this street a restricted zone?") rather than three
letters to recognise at speed through a windscreen. A phrase card is consulted standing
still. So this entry is evidence for a driving section's first *question*, not for a
`common-signs` row, and it already says so in as many words.

Left staged on that basis. Nothing about it is wrong; it is a row with no section to sit in
and no moment at which a reader would reach for it.

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

## ~~Two the Hebrew pack asked for~~ — shipped

Both are Israel's version of a trap the bank already handles for somewhere else, and
both are staged rather than added for the usual reason: a universal concept costs
every one of the twenty-two packs a row, and a scoped one costs twenty-one gloss rows.

- **~~`dietary-needs.is-this-kosher`, the mirror of `is-this-halal`~~ — shipped.**
  The halal row is
  *universal* and argues for itself: "askable anywhere -- a traveller who needs it
  needs it in Japan too". Every word of that applies to kosher, which is also a
  certification with a visible mark (a הכשר badge) rather than a judgement a cook
  makes, so the answer is checkable and the question is worth asking. Scoping it to
  `he` would be wrong for the same reason scoping halal would be. The Hebrew is
  `זֶה כָּשֵׁר?` and the other twenty-one need a word they mostly already have as a
  loan (`kosher`, `коше́рный`, `コーシャ`, `کوشر`).
- **~~`dietary-needs.no-sesame`~~ — shipped.** Sesame is one of the fourteen
  allergens Israeli
  labelling names, and tehina is in or beside a very large share of what a visitor
  is served -- the same shape as the Vietnamese fish-sauce case that got
  `does-it-contain-fish-stock` its own row, and as the Hungarian `zsír` case. It is
  also the one major allergen with no row of its own: `no-nuts` and `no-peanuts`
  have one each, and sesame has to go through `i-am-allergic-to {}`, which is a slot
  the traveller has to fill in a language they do not write. `בְּלִי שֻׁמְשוֹם`.

**Both shipped, both universal, and the argument above is why each is shaped the way
it is.** `no-sesame` is `refphrase`/`word`, its own cluster, rank 1006 and importance
0.690, so it reads between `no-nuts` and `no-seafood` in the allergen block by score
even though its rank sits in the appended block -- renumbering seven rows of a shared
file mid-flight is the wholesale rewrite `add-a-language.md` forbids. `is-this-kosher`
is `entry`/`phrase`, rank 14, importance 0.780, `cluster_rank` 2 in
`dietary-needs.exclude` below `no-pork` and `is-this-halal`; it scores below halal
rather than beside it, because the mark is present in far fewer of the countries this
corpus covers, so a card that already carries halal gains less from this than from a
first allergen row.

**The counts are the interesting half. `no-sesame` filled 50 of 51 packs;
`is-this-kosher` filled 35.** Sesame is a crop with a dictionary entry everywhere: the
fifteen EU languages took Annex II point 11 of Regulation (EU) 1169/2011 verbatim, the
Indic ones came from the DSAL dictionaries each pack already cites (Kittel's ಎಳ್ಳು,
Molesworth's तीळ, Brown's నువ్వులు, the Tamil Lexicon's எள், Platts's तिल, Praharaj's
ତିଳ), and the rest from the language's own encyclopaedia plus the pack's existing
sources. Only Yoruba is blank, and the finding is narrow: the only attestations for
Yoruba sesame (`ẹ̀kúkú`, `èkúkú`) are Nigerian forum threads and health blogs, which
is the one source class this project's own rule names as inadmissible -- Useful
Tropical Plants lists no Yoruba name for *Sesamum indicum* and PROTA was not
reachable.

**The kosher word is where the corpus thins out, and the pattern is sharp enough to be
worth recording.** Sixteen packs are blank -- `sw te mr pa gu ne am kn ha ml yo lo km
ka uz or` -- and in almost all of them the *concept* is attested while the *word* is
not: the only form anything has printed is a transliteration of **kashrut**, the name
of the law (Malayalam's `കഷ്‌റുത്`, Nepali's `काशृत`, Uzbek's `Kashrut`), which is an
encyclopaedia headword and not a word to show a cook. **The test that separated the
blanks from the fills was whether a source used the term of the *food* rather than of
the law**, and three packs turned on exactly that sentence: Tamil, Urdu and Armenian
all have kashrut-titled articles, but each one's lead then names the adjective --
`உணவு கோஷெர் என்றழைக்கப்படுகிறது`, `انھیں کوشر کہا جاتا ہے`, `Կաշրութ կամ կոշեր` --
so those three filled where Malayalam and Nepali did not.

**The thirty-five that filled did so because someone with standing in the language
had published the food term**: a national dictionary (Duden `koscher`,
Le Robert `casher`, Treccani `kasher`, Priberam `kosher`, PWN `koszerny`, ÚJČ `košer`,
DEX `cușer`, SAOL `kosher`, Kuznetsov `кошерный`), or the certifying body's own
localised site -- **the Orthodox Union publishes in thirteen of these languages**
(`oukosher.org/{br,cn,es,fr,hi,id,it,jp,ko,ms,th,tl,vn}`), which is the single most
useful source this entry turned up and is worth reaching for again. Two near-misses
were refused on the project's own rule rather than on doubt: Georgian has `კოშერი` and
`ქოშერი` in circulation but every instance found was machine-translated content or a
bare Wikidata label, and Swahili and Amharic have nothing but auto-translated
certification-vendor pages. **And two of the shipped rows rest on an encyclopaedia
because the national dictionary declines to carry the word**: `koşer` is absent from
TDK's Güncel Türkçe Sözlük and `κοσέρ` from the Triantafyllidis dictionary, both
queried directly, so `provenance` says so on those two rows rather than implying a
lexicographic source there is not. The Turkish row also carries a warning in
`literal` that a reader needs: `koşer` is **not** `kaşar`, which is a cheese.
