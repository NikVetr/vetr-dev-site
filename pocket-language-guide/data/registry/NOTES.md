# speaker-axes.csv — survey notes

Working notes for `data/registry/speaker-axes.csv`: which of the 53 `ready` languages
inflect **first-person** speech for a property of the **speaker**, and what the app
would have to ask to get it right.

## What I concluded, in one paragraph

One axis is declared: **`speaker_gender`**, values `masculine` (default) and `feminine`,
for **22 of 53** languages. No other axis survived the test. In particular **no
politeness/register axis is declared for any language**, because every politeness system
in this set (Japanese, Korean, Javanese, Thai, Khmer, Vietnamese, Filipino, Bengali,
Persian, and the European T–V distinctions) is oriented to the *addressee*, and a
phrasebook card shown to a stranger has exactly one correct setting — the polite one.
That is a content invariant for the per-language packs, not a question to put to the
traveller. Nothing about the *listener's* gender is recorded as an axis; where second-person
forms are gendered it is recorded below as a hazard for reply content.

## Method, and what I am not

I am not a fluent speaker of any of these languages except English. What I did was:

1. Extract every first-person concept in the corpus (`data/lang/en/*.csv`, 134 of them:
   `I am lost`, `I am sick`, `I lost my passport`, `I am a tourist`, `Thank you`, …) so the
   question was always "does *this* corpus change", not "does the language have gender".
2. For each language, check a grammar of record or the language's own
   Wikipedia grammar article for **first-person** agreement specifically — most
   descriptions only illustrate third person, and several summaries I pulled were wrong
   about first person until I read the paradigm itself.
3. Cross-check against the repo's own packs (`data/lang/<bcp47>/*.csv`), which already
   carry both forms in a number of places (`ru`, `pl`, `hr`, `uk`, `cs`, `es`, `pt`, `it`,
   `ro`, `el`, `de`, `hi`, `gu`, `mr`, `ne`, `fr`, `th`, `km`). Where a pack already prints
   a slashed or doubled form, that is independent evidence that the variance is real *in
   this corpus* and not just in the abstract.

Sources consulted are listed per language below. Where I give a feminine form that is not
already in the pack, I derived it by applying the documented rule (Arabic tāʾ marbūṭa,
Hebrew benoni feminine, Indo-Aryan `-ī` participle, Thai female particle) — those five are
flagged and should be confirmed in the per-language pass. **I did not write any translations
into the packs.**

Excluded per the brief: glosbe, wordhippo, languagedrops, translate.com, kaikki, forum
threads. Three sources I cite at second hand and could not read directly are marked
*(indirect)*: Iwasaki & Ingkaphirom 2005 (Thai), Huffman 1970 (Khmer), Enfield 2007 (Lao).

## The 53 languages

`axis` = what is declared in `speaker-axes.csv`. Confidence is my confidence in the
**declare / don't declare** decision, not in the exact wording of any example.

| bcp47 | language | axis | why | conf. |
|---|---|---|---|---|
| en | English | — | No gender agreement anywhere in first-person predication. | high |
| es | Spanish | `speaker_gender` | Predicative adjectives/participles agree with the speaker. | high |
| zh-Hans | Chinese (Simp.) | — | Almost no inflection; 我 is invariant, gender appears only in written 3rd-person 他/她. | high |
| ja | Japanese | — | 私 *watashi* is gender-neutral in polite register; gendered pronouns (僕/俺/あたし) and final particles belong to casual speech, which a card should not use. | high |
| ar | Arabic | `speaker_gender` | Adjectives/participles agree with the speaker (1sg verbs do not). | high |
| fr | French | `speaker_gender` | Adjective and *être* participle agreement; always written, often audible. | high |
| de | German | `speaker_gender` | Narrow: predicative adjectives never inflect, but "Ich bin *Tourist/Touristin*" role nouns do. **My least confident inclusion** — see below. | medium |
| pt | Portuguese | `speaker_gender` | Adjective/participle agreement, including *obrigado/obrigada*. | high |
| ko | Korean | — | No gender marking; 저 is neutral. Speech levels are addressee-oriented. | high |
| hi | Hindi | `speaker_gender` | Participles carry gender-number agreeing with the subject. | high |
| th | Thai | `speaker_gender` | Polite final particle and polite 1sg pronoun are chosen by the speaker's sex. | high |
| ru | Russian | `speaker_gender` | Past-tense l-participle and predicative adjectives agree. | high |
| id | Indonesian | — | "Malay does not make use of grammatical gender"; *saya* neutral. | high |
| sw | Swahili | — | Noun classes, not sex; 1sg subject prefix *ni-* is invariant. | high |
| tr | Turkish | — | "Turkish lacks grammatical gender." | high |
| vi | Vietnamese | — | *tôi* is neutral; pronoun choice varies by age/relationship to the addressee, not speaker sex. | high |
| it | Italian | `speaker_gender` | Adjective and *essere* participle agreement. | high |
| el | Greek | `speaker_gender` | Threefold adjective declension, agreeing in predicative position. | high |
| hu | Hungarian | — | No grammatical gender anywhere in the paradigms. | high |
| tlh | Klingon | — | Noun classes are semantic (language-users / body parts / other); no gender, no sex-conditioned forms. The `-neS` honorific is addressee-oriented. | high |
| qya | Quenya | — | "There is no gender"; late-Quenya adjectives do not even agree in number. | medium |
| he | Hebrew | `speaker_gender` | Present tense inflects for gender but not person — the largest hit rate of any language here. | high |
| fa | Persian | — | "Persian nouns and pronouns have no grammatical gender." Formality is 2nd-person only. | high |
| bn | Bengali | — | "Adjectives do not inflect for case, gender, or number"; verbs inflect for person and honour, not gender. | high |
| ur | Urdu | `speaker_gender` | Same participial agreement as Hindi. | high |
| pl | Polish | `speaker_gender` | Past tense carries gender *and* person (-łem/-łam). | high |
| nl | Dutch | — | Predicative adjectives never inflect; feminine role nouns are a style recommendation, not agreement. Nearest excluded neighbour to German — see below. | medium |
| ta | Tamil | — | Person endings mark gender only in 3rd person (`-āṉ`/`-āḷ`); 1sg is `-ēṉ`. | high |
| uk | Ukrainian | `speaker_gender` | Past tense "agrees in number and gender (but not person)". | high |
| te | Telugu | — | "Genders in marking on the Telugu verb only occur in the third person." | high |
| mr | Marathi | `speaker_gender` | Gender distinction exists in first-person verb agreement, including simple present. | high |
| ro | Romanian | `speaker_gender` | Adjective/participle agreement (DEX: *pierdut, -ă*). | high |
| cs | Czech | `speaker_gender` | l-participle "express[es] gender which must correspond with the gender of the subject". | high |
| pa | Punjabi | `speaker_gender` | Participles take `-ā`/`-ī` gender terminations agreeing with the nominative subject. | medium‑high |
| fil | Filipino | — | "Native nouns are genderless." *pô/hô* politeness is not gendered. | high |
| sv | Swedish | — | Gender is common/neuter on the noun, not sex; no feminine derivation for *turist*, *vegetarian*, *diabetiker*. | high |
| ms | Malay | — | Same as Indonesian. | high |
| gu | Gujarati | `speaker_gender` | Declinable adjectives/participles take `-o`/`-ī`; agreement is with the nominative subject. | medium‑high |
| ne | Nepali | `speaker_gender` | Agreement is "attenuated… restricted to female animates, optional or loose even then", but the `-eko/-ekī` participle does take the feminine. **Weakest inclusion.** | medium |
| am | Amharic | — | 1sg verb has a single form; gender is 2nd/3rd person only. See gap below on predicative adjectives. | medium‑high |
| kn | Kannada | — | "conjugated for … gender (in the third person)"; 1sg is `-ēne`. | high |
| ha | Hausa | — | 1sg pronouns and TAM markers are ungendered; gender surfaces only in predicate nominals, and the invariant agentive *mai-* avoids it (the pack already does). See gap. | medium |
| ml | Malayalam | — | Verbs inflect for TAM "and not for number or gender"; adjectives are invariant. | high |
| yo | Yoruba | — | "Yoruba has no grammatical gender." | high |
| lo | Lao | — | No gendered pronoun or particle found; *khoy*/*khanoy* are register variants, *dae*/*doe* are ungendered. **Not a Thai.** See gap. | medium |
| km | Khmer | `speaker_gender` | Narrow: the polite particle *baat* (m) / *chaa* (f), which is also the ordinary spoken "yes". | medium‑high |
| hr | Croatian | `speaker_gender` | Perfect l-participle agrees in gender and number with the subject. | high |
| ka | Georgian | — | "Georgian has no grammatical gender; even the pronouns are ungendered." | high |
| fi | Finnish | — | "Finnish does not have grammatical gender, not even in personal pronouns." | high |
| hy | Armenian | — | Lacks a feminine gender entirely. | high |
| uz | Uzbek | — | "has no noun classes (gender or otherwise)". | high |
| jv | Javanese | — | No grammatical gender. Speech levels are real and pervasive but addressee-determined; the pack is already uniformly krama (*kula*). See "politeness" below. | medium‑high |
| or | Odia | — | "There is no grammatical gender, and usage of gender is semantic." | medium‑high |

**Totals:** 22 declared, 31 empty.

## Worked examples for every declared axis

One first-person concept per language that actually differs. "pack" means the form is
already present in `data/lang/<bcp47>/`; "derived" means I applied the documented rule and
it needs a native check.

| lang | concept | masculine | feminine | source for the rule |
|---|---|---|---|---|
| es | `building-help.i-am-lost` | Estoy perdido | Estoy perdida | RAE, *Nueva gramática* / *El buen uso del español*: adjectives "adoptan el género que corresponde al hablante", e.g. "Yo no estoy en absoluto {preocupado ~ preocupada}". pack (`perdido/a`) |
| pt | `social-basics.thank-you` | Obrigado | Obrigada | Ciberdúvidas da Língua Portuguesa (ISCTE‑IUL), *obrigado/a e obrigados/as*: the participle agrees with the person thanking. pack |
| fr | `dietary-needs.i-am-vegetarian` | Je suis végétarien | Je suis végétarienne | Wikipedia, *French grammar*: "The participle agrees with the subject when the auxiliary is être"; adjectives agree in gender and number. pack |
| it | `building-help.i-am-lost` | Mi sono perso | Mi sono persa | Wikipedia, *Italian grammar*: with *essere* "the past participle always agrees with the subject". pack (`perso/a`) |
| ro | `emergency-medical.i-am-sick` | Sunt bolnav | Sunt bolnavă | dexonline.ro, *PIERDUT, ‑Ă* paradigm; adjectives inflect for gender. pack |
| el | `emergency-medical.i-am-sick` | Είμαι άρρωστος | Είμαι άρρωστη | Wikipedia, *Modern Greek grammar*: "Adjectives agree with nouns in gender, case and number", including as predicates. pack |
| ru | `building-help.i-am-lost` | Я заблудился | Я заблудилась | Wikipedia, *Russian grammar*: "to say 'I slept', a male speaker would say я спал, while a female speaker would say я спала́". pack |
| uk | `building-help.i-am-lost` | Я заблукав | Я заблукала | Wikipedia, *Ukrainian grammar*: "the past tense agrees in number and gender (but not person) with the subject". pack |
| pl | `building-help.i-am-lost` | Zgubiłem się | Zgubiłam się | Wikipedia, *Polish grammar*: "The past tense agrees with the subject in gender as well as person and number" (byłem/byłam). pack |
| cs | `building-help.i-am-lost` | Ztratil jsem se | Ztratila jsem se | Wikipedia, *Czech conjugation*: participles "express gender which must correspond with the gender of the subject". pack (slashed) |
| hr | `building-help.i-am-lost` | Izgubio sam se | Izgubila sam se | Wikipedia, *Serbo-Croatian grammar*: perfect "sam radio/la". pack |
| he | `communication.i-do-not-understand` | אני לא מבין | אני לא מבינה | Wikipedia, *Hebrew verb conjugation*: present tense agrees in gender and number and "does not inflect by person" (אני כותב / אני כותבת). **derived** |
| ar | `building-help.i-am-lost` | أنا تائه | أنا تائهة | Wikipedia, *Arabic grammar*: adjectives "agree with the noun in case, gender, number, and state"; 1st person has no verbal gender. **derived** |
| hi | `building-help.i-am-lost` | मैं रास्ता भटक गया हूँ | मैं रास्ता भटक गई हूँ | Wikipedia, *Hindustani grammar*: "Finite verbal agreement is with the nominative subject"; the *honā* table gives 1P *maĩ* huā/huī. pack |
| ur | `building-help.i-am-lost` | میں راستہ بھول گیا ہوں | میں راستہ بھول گئی ہوں | same (Hindustani grammar covers Urdu). **derived** |
| pa | `building-help.i-am-lost` | ਮੈਂ ਰਾਹ ਭੁੱਲ ਗਿਆ ਹਾਂ | ਮੈਂ ਰਾਹ ਭੁੱਲ ਗਈ ਹਾਂ | Wikipedia, *Punjabi grammar*: gender-number terminations `-ā`/`-ī` on the participle; agreement "is with the nominative subject". **derived** |
| mr | `introductions.i-am-traveling-alone` | मी एकटा प्रवास करत आहे | मी एकटी प्रवास करत आहे | Wikipedia, *Marathi grammar*: "There is gender distinction in the first- and second-persons when the pronouns act as agreement markers on verbs". pack |
| gu | `building-help.i-am-lost` | હું રસ્તો ભૂલી ગયો છું | હું રસ્તો ભૂલી ગઈ છું | Wikipedia, *Gujarati grammar*: declinable adjectives take `-ો`/`-ી`; agreement is with the nominative subject. pack |
| ne | `introductions.i-am-traveling-alone` | म एक्लै यात्रा गरिरहेको छु | म एक्लै यात्रा गरिरहेकी छु | Masica, *The Indo-Aryan Languages* (1991) 220–221, via Wikipedia *Nepali grammar*: accord "restricted to female animates… optional or loose". pack |
| de | `introductions.i-am-a-tourist` | Ich bin Tourist | Ich bin Touristin | Duden, *Vegetarier*: "männliche Person, die…", with a separate *Vegetarierin* entry; de.wikipedia *Movierung*. pack |
| th | `social-basics.thank-you` | ขอบคุณครับ | ขอบคุณค่ะ | Wikipedia, *Thai language*: "Thai pronouns are selected according to the gender and relative status of speaker and audience"; Iwasaki & Ingkaphirom, *A Reference Grammar of Thai* (CUP 2005), speech-level particles connote "social status and sex of the speaker" *(indirect)*. pack has `ขอบคุณครับ/ค่ะ` |
| km | `quick-responses.yes-right` | បាទ | ចាស | Huffman, *Modern Spoken Cambodian* (Yale 1970): men say *baat*, women say *chaa*, optionally preceding a sentence to mark politeness *(indirect)*; Headley et al., *Cambodian-English Dictionary* (CUA 1977). pack already prints both |

Five feminine forms are **derived**, not taken from the packs: `he`, `ar`, `ur`, `pa`, `th`.
They are regular applications of the cited rule, but I am not a speaker and they should be
confirmed when the per-language variant wordings are written.

## Reply hazards (not axes)

Recorded here rather than as axes, because the answer is to write the supplied replies so
they are naturally gender-neutral in both languages — not to ask about the listener.

**Second-person forms are gendered — a reply that addresses the traveller directly will
out-gender them:**

- **Arabic** — pronouns, verbs and imperatives all split in 2nd person (أنتَ/أنتِ,
  تفضّل/تفضّلي). Prefer impersonal/nominal replies ("من هنا", "الطبيب قادم") over
  2nd-person verbs.
- **Hebrew** — 2nd-person present and imperatives split (אתה/את, חכה/חכי). Prefer
  infinitival or impersonal replies (…לחכות, יש/אין).
- **Amharic** — 2nd person is gendered (አንተ/አንቺ) even though the 1st person is not, so
  Amharic has **no axis but a real hazard**. This is the schema's blind spot: a language
  with no rows in `speaker-axes.csv` still needs the reply-content rule.
- **Hausa** — same shape: 1st person ungendered, but *kai/ke*, *ka/ki*, *-nka/-nki* are
  gendered. No axis, hazard only.
- **Hindi / Urdu / Punjabi / Marathi / Gujarati / Nepali** — आप + a participle is still
  gendered (आप खो गए हैं / गई हैं). Safe replies use invariant adjectives (ठीक, घायल) or
  नाम-based constructions.
- **Polish** — polite address forces *pan/pani*, which is explicitly sexed, plus a gendered
  participle. The worst European case; replies should avoid direct address entirely.
- **Czech** — *vykání* keeps the participle singular, so it is gendered: *byl jste* /
  *byla jste*.
- **Croatian** — polite *Vi* takes a masculine-plural participle as standard, so it is
  effectively neutral. Low hazard.
- **Russian / Ukrainian** — polite *вы/ви* takes a plural participle, which is gender-neutral.
  Low hazard, provided replies never use *ты/ти*.
- **Romance / Greek** — a predicate adjective addressed to the traveller is gendered
  (*¿Está perdido/perdida?*). Prefer verb-only replies (*¿Necesita ayuda?*, *Χρειάζεστε βοήθεια;*).
- **Thai / Khmer** — the *responder's* particle reveals the responder's sex, not the
  traveller's. Not a hazard; the reply should simply omit the particle or the pack should
  pick one and say so.

**Third-party gender — a separate, unsolved problem.** Five corpus concepts inflect for the
gender of someone who is neither speaker nor listener: `lost-rescue.my-friend-is-hurt`,
`lost-rescue.my-companion-is-missing`, `lost-rescue.my-child-is-missing`,
`children.cannot-find-my-child`, `introductions.this-is-my-friend`. In Arabic
صديقي/صديقتي, Hebrew חבר/חברה, Slavic and Romance these cannot be rendered without knowing
that person's gender. I deliberately did **not** declare a `companion_gender` axis — the
brief is about speaker properties and warns against extra questionnaires — but the packs
need a rule. The usual escape works: many languages have a grammatically fixed neutral word
(Russian *ребёнок* is masculine regardless of the child's sex; Arabic طفلي works for
either), so this should be handled as a wording constraint in the per-language pass.

## Why no politeness axis

Every politeness system I checked in these 53 is selected by who you are talking to, not by
a property of the traveller:

- **Japanese** — です/ます is addressee honorification; a card to a stranger is always polite.
  In polite register 私 is neutral, so even the famous gendered pronouns drop out.
- **Korean** — Wikipedia, *Korean speech levels*: levels "show respect towards a speaker's or
  writer's **audience**". 해요체 vs 합쇼체 is a style preference between two correct options.
- **Javanese** — the biggest case: *aku* → *kula*, and most content words change. But krama
  is what you use to a stranger, full stop, and `data/lang/jv/` is already uniformly krama.
  Declaring `{krama, ngoko}` would expose a choice whose second value is always wrong here.
  If a register axis is ever wanted, Javanese is the one language where it would be worth
  the question.
- **Thai / Khmer** — politeness is mandatory, but the *form* it takes is chosen by speaker
  sex, so it is already captured by `speaker_gender`.
- **Bengali, Persian, Vietnamese, Filipino, and all the European T–V languages** — the
  formality choice lands on second-person forms, which are not first-person speech.

So: politeness is a **content invariant** for the packs (always the polite/formal register,
never the familiar second person), not a registry axis.

## Other findings that are not axes

- **Clusivity.** Indonesian/Malay (*kami* vs *kita*), Filipino (*kami* vs *tayo*), Javanese
  and Vietnamese force a choice on every "we" concept — `introductions.we-are-traveling-together`,
  `lost-rescue.we-are-here`, `children.car-seat`, `taxi.we-need-to-catch-the-high-speed-train`.
  The correct value is always **exclusive** (*kami*/*kami*), since the listener is not part of
  the traveller's party. That is determined by the phrase's meaning, not by the speaker, so
  it is a content rule, not an axis — but it is easy to get wrong.
- **Vietnamese self-reference.** *tôi* is correct but slightly distant; an idiomatic speaker
  would pick *cháu/em/chú* by their age relative to the listener. Unresolvable without asking
  about the listener, so *tôi* is the right fixed choice. Worth a line in the app's Vietnamese
  notes rather than an axis.
- **Default value choice.** `masculine` is the default on every declared language because it
  is the unmarked/citation form in all 22. For Thai and Khmer that is weaker — there is no
  unmarked form, so the default is genuinely arbitrary and the question should be asked
  before anything is shown.

## Least confident calls

1. **`de` German — the one I would most expect to be argued with.** German has no first-person
   agreement at all; the entire axis rests on role nouns in four concepts
   (`introductions.i-am-a-tourist`, `border-customs.i-am-a-tourist`,
   `dietary-needs.i-am-vegetarian`, `dietary-needs.i-am-vegan`,
   `medical-conditions.i-am-diabetic`). I included it because Duden defines the base noun as
   "männliche Person", the `-in` feminine is fully standard, and the German pack *already*
   carries "Ich bin Tourist. / Ich bin Touristin." and "Ich bin Vegetarier/-in." — someone hit
   this before me. Three of the five also have a neutral paraphrase that is arguably better
   anyway ("Ich habe Diabetes", "Ich esse kein Fleisch"), so dropping the axis and rewording is
   a legitimate alternative. Two rows to delete if you disagree.
2. **`nl` Dutch — the nearest thing I excluded.** *toerist/toeriste* exists, and Taaladvies
   (Nederlandse Taalunie) recommends the feminine where one is established. I excluded it
   because Dutch predicative adjectives never inflect, the masculine is normal for women
   ("Ik ben toerist"), *vegetariër* has no current feminine, and the Dutch pack carries no
   variants. If German is kept and Dutch is excluded, that asymmetry is deliberate but thin.
3. **`ne` Nepali.** Masica's "optional or loose even then" means the masculine is never
   *wrong*, only less natural for a woman. The pack already carries
   गरिरहेको छु / गरिरहेकी छु, which tipped me to include it, but a Nepali reviewer could
   reasonably say the axis is not worth a question.
4. **`km` Khmer scope.** *baat/chaa* is solidly sourced, but I could not settle how far it
   spreads: is it only the "yes" row, or should every polite card carry it the way Thai carries
   ครับ/ค่ะ? I declared the axis at the narrow reading. Needs a Khmer-speaking check.
5. **`pa`, `gu`** — the principle ("agreement is with the nominative subject", participle takes
   `-ā`/`-ī`) is well sourced and the pack forms are consistent with it, but the Wikipedia
   paradigm tables illustrate third person only, so my first-person claim is an inference from
   the rule rather than a quoted first-person paradigm. Same inference that is *explicitly*
   confirmed for Hindi and Marathi, so I am fairly comfortable.
6. **`qya` Quenya.** Declared nothing. Wikipedia notes "special male and female pronouns" whose
   applicability to late Quenya "is debated". Not corpus-relevant (they described persons, not
   speakers), but I did not chase it into the Vinyar Tengwar / Parma Eldalamberon corpus.

## Gaps I could not close

These are named as gaps rather than guessed at.

- **`lo` Lao — the gap I most want closed.** Lao is areally and structurally close to Thai, and
  Thai's gendered polite particles are the model case. Wikipedia's *Lao grammar* lists
  ຂ້ອຍ/ຂ້ານ້ອຍ as register variants with no sex restriction and ແດ່/ເດີ້/ດອກ as ungendered,
  and says nothing about a khráp/khâ analogue. I could not read Enfield, *A Grammar of Lao*
  (Mouton 2007) — the grammar of record and the one the `lo` pack already cites — and it is the
  book that would settle whether ເຈົ້າ / ໂດຍ are sex-selected in practice. **Declared nothing;
  if Enfield says otherwise, Lao should get the same two rows as Thai.**
- **`am` Amharic predicative adjectives.** The 1sg verb is certainly ungendered
  (ሰበርኩ for any speaker). What I could not source is whether a woman saying "I am X + ነኝ" takes
  a feminine adjective (the `-it`/`-t` feminine exists in Amharic). Every corpus phrase I
  checked in the `am` pack uses a verb or an ungendered loan (ጎብኚ ነኝ, ታሜያለሁ, ጠፍቻለሁ), so the
  practical exposure looks nil, but I could not prove it.
- **`ha` Hausa predicate nominals.** "I am a tourist" can be *Ni mai yawon shakatawa ne*
  (invariant agentive *mai-*, which is what the pack uses) or *Ni ɗan… ne* / *Ni 'yar… ce*,
  which is sexed and takes the matching stabiliser. I could not find an authority saying which
  is idiomatic for a self-description, and Wikipedia's *Hausa language* paradigm does not cover
  the stabiliser. Declared nothing on the strength of the avoidable-by-*mai-* reading.
- **`or` Odia higher register.** Wikipedia is unambiguous that Odia has no grammatical gender,
  but tatsama (Sanskritic) adjectives in formal register sometimes carry feminine forms. Low
  impact for a traveller phrasebook; not chased.
- **`th` primary source.** I could not fetch the Royal Society of Thailand dictionary
  (dictionary.orst.go.th is not a static page) and read Iwasaki & Ingkaphirom only at second
  hand. The fact is not in doubt; the citation is weaker than I would like.
- **`km` primary source.** Same situation: Huffman 1970 at second hand (the Michigan State
  *Basic Khmer* open textbook that quotes it returned 403). The `km` pack's own provenance
  independently cites Headley et al. 1977 and Huffman 1970 for exactly this point.
- **Fetch failures worth recording** so nobody repeats them: `dle.rae.es` 403,
  `hebrew-academy.org.il` 403, `openbooks.lib.msu.edu` 403, `taaladvies.net/toerist-toeriste/`
  404, `en.wikipedia.org/wiki/Hausa_grammar` 404 (no such article). RAE content was obtained
  via rae.es gramática pages instead.

## Notes on the file itself

- `speaker-axes.csv` is CRLF: 45 CR and 45 LF (44 data rows + header), verified by byte count,
  not by `file`.
- Not every file in `data/registry/` is CRLF, contrary to what I was told: on disk today
  `sections.csv`, `roles.csv` and `redundancy.csv` are CRLF, while `languages.csv`,
  `language-names.csv`, `paper.csv`, `regions.csv`, `romanizations.csv` and `scripts.csv` are LF.
  I wrote CRLF as instructed.
- Every `language` value is a bcp47 present in `languages.csv`; exactly one `default=1` per
  (language, axis).
- Row order is value order: `masculine` first, then `feminine`, on every language. Since
  `masculine` is also the default, the base `text` in the packs stays as it is today and only
  feminine wordings need authoring — a variant key is only produced for a non-default answer.
  The axis slug and both value slugs are identical across all 22 languages, so one question
  covers a mixed pair.
- Romanisations in the `notes` column are parenthetical after the native form, per the project
  convention that the native script leads.
