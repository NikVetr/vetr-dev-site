# Respelling systems in nineteen languages

The say-it-like column is hand-curated per language *pair*, which is why it exists for
16 of 306 pairs and will never exist for the other 290. The replacement is O(N): one
`ipa` column per target language and one rule set per source language and accent, with
`respell(ipa, sourceLang, accent)` generating every pair. This file answers the
question that decides how expensive that is — for each of the eighteen reader
languages, is there already a system to borrow, and is it the right *kind* of system?

Six of the eighteen hand us a usable system. Four hand us one doing a neighbouring job
that has to be bent. Eight hand us nothing — and of those seven, three are cheap to
invent because their orthographies are nearly phonemic, while four are expensive because
the reader's own spelling rules fight a naive substitution. Two findings cut across all
of them. **The capitals-for-stress convention in the
existing sheets is an English device that does not port**, and in five languages the
reader's own orthography already has a better one. And **the *shape* of the feature — a
bracketed or parenthesised pronunciation beside the real spelling — is already native in
six of the seventeen**, sanctioned variously by a state language authority, a
government decree, an academy dictionary and a Wikipedia community policy. Even where we
must invent the contents, we are rarely inventing the gesture.

## What changes the plan

**One standard is keyed on IPA throughout, and it is Korean.** The National Institute
of Korean Language's 외래어 표기법 opens with a `국제 음성 기호와 한글 대조표` — an
IPA-to-Hangul correspondence table — and the regulation says that table is the basis of
all the others and the default for any language not separately tabulated. That is
`respell(ipa, 'ko')` as a government notification. Nothing else is shaped that way
throughout. Japan's is keyed on sounds but described in kana. China's tables are keyed
on the source language's spelling *except* the English one, which is keyed on IPA
precisely because English spelling is irregular — so the one table we would want first
is the one that already has the right index. Russia's carries an IPA column beside a
spelling index. Thailand's is keyed on English letters outright.

**Spanish has a published respelling that documents its own method, and the method is
ours.** The RAE and ASALE's *Diccionario panhispánico de dudas* has a section headed
*Representación de los fonemas y de la pronunciación de voces o expresiones* whose
opening sentence could have been written for this project:

> Dado que esta obra se dirige a lectores no necesariamente especializados, se ha
> evitado deliberadamente en la representación de los fonemas el uso de los símbolos
> empleados para ello por los lingüistas —en la actualidad los del alfabeto fonético
> internacional (AFI)— y se han usado en su lugar letras del abecedario, cuya
> correspondencia fónica es inmediatamente reconocible por cualquier hablante de
> español.

An academy standard that deliberately rejects IPA for a general reader and substitutes
its own alphabet's letters. That is the whole argument of this feature, already made and
already published.

**Vietnamese has one too, and it is codified in law.** The 2000 *Quy tắc chính tả tiếng
Việt và phiên chuyển tiếng nước ngoài*, adopted under a Prime Minister's Office letter,
opens by requiring transcription "bằng các âm, vần và chữ Việt **dựa vào cách đọc trực
tiếp của nguyên ngữ**" — using Vietnamese sounds, rhymes and letters, based on the
direct pronunciation of the source language.

**And Turkey's language authority sanctions this exact feature, with the exact example
one would have guessed.** The TDK *Yazım Kılavuzu*, §08 *Yabancı Özel Adların Yazılışı*,
says Latin-script names keep their original form — and then: *"Ancak Batı dillerinde
kullanılan adların okunuşları ayraç içinde gösterilebilir: **Shakespeare (Şekspir)**"*.
The pronunciation of names used in Western languages may be shown in parentheses. That
is the say-it-like column, authorised by the Türk Dil Kurumu.

**The shape of the feature is native in six of the seventeen.** Worth pulling together,
because it means the column will not read as an alien import in most of the set:

| Source | The native slot | Form |
|---|---|---|
| `es` | the DPD's pronunciation brackets | `[shéspir]` |
| `tr` | TDK §08's parentheses | `Shakespeare (Şekspir)` |
| `vi` | QĐ 1989/2018 and *Báo Nhân Dân* | `Vladimir Putin (V.Pu-tin)` |
| `ar` | ar.wikipedia policy: extended letters permitted *only* in parentheses, to clarify pronunciation | `وِلْيَمْ شكسبير (William Shakespeare)` |
| `id` | KBBI's slash field, for the `e` qualities only | `mer.de.ka /mêrdéka/` |
| `hi` | Bhargava's *Standard Illustrated Dictionary* respelling column | `Academy — ॲ-कॅड्'-ऍ-मि` |

**The official standards mostly do loanword adoption rather than pronunciation
hinting, and they say so.** This is the finding that inverts the instinct to defer.
A loanword-orthography standard optimises for a *stable, memorable, permanently
reusable spelling*; a say-it-like column optimises for *closest audible approximation,
thrown away after one use*. Where they diverge the standards choose stability,
explicitly:

- Korea's 제4항 forbids the tense consonants ㄲㄸㅃㅆㅉ for plosives. The Institute's own
  newsletter concedes that French and Japanese voiceless stops are closer to Korean
  된소리 than to the aspirated series it mandates, and gives consistency across the many
  languages a rule must cover as the reason. So 파리, not 빠리 — the standard knowingly
  picks the worse sound.
- Japan's notification splits kana into 第1表, "generally used", and 第2表, for writing
  "as close as possible to the original sound". Policy prefers the first. In 2019 the
  Diet amended a statute to strike ヴ from official country names, and the Ministry of
  Foreign Affairs' stated reason was that the ヴ-less spelling is more familiar to the
  public today — familiarity beating fidelity, by act of parliament.
- Thailand's rule 5 omits tone marks unless the result would collide with an existing
  Thai word. In a language where tone is lexical, the standard discards the information
  a pronunciation hint most needs. Its rule 1 states the wrong job outright:
  transcription shall "transliterate the letters of the original language sufficiently
  to show the origin of the word form, and be written in a form that reads conveniently
  in Thai" — provenance first, sound second.
- India's Central Hindi Directorate standard tells you to drop the nuqta from
  assimilated Perso-Arabic words (`कलम`, `किला`, `दाग`), erasing exactly the consonant
  distinctions a foreign phrase needs.

So borrow the standards for their *inventories* — which letter for which sound, in a
form the reader's eye accepts — and overrule them on their *restrictions*. That
distinction should be explicit in each rule file: a derivation, plus a short list of
named deviations with reasons.

**The 12,001 existing cells are a test set, and that decides the build order.** Every
one of the sixteen sheets is a `<target>__en__en-US` file, so the corpus already holds
12,001 human judgments of the form *(target phrase → English respelling)*. Once `ipa`
is filled these become 12,001 labelled examples of `respell(ipa, 'en', 'en-US')`.
English is the only rule set that can be validated against anything, and it should be
built first even though its pairs are the ones already served — because building it
measures the IPA column too. Where the transducer disagrees with a curated cell, either
the rule or the IPA is wrong, and the disagreement list is the review queue that
`summary.md` says the deep-orthography languages need.

**Nothing exists as software.** Every open-source tool found runs *orthography → IPA*,
which is the other direction: epitran, phonemizer/espeak-ng, `ipa-transcriber`,
`IPA-Transcribers`. Wikipedia's `Module:Respell` is a formatter — it italicises
pre-split syllables — and the Manual of Style requires a respelling to *follow* an IPA
template rather than replace it, so there is no official automation to lift. CLDR and
ICU ship `Latin-Katakana`, `Latin-Hangul`, `Latin-Devanagari` and friends under the
permissive Unicode licence, but CLDR's own guidelines say a transform should work from
"the letters themselves (without any knowledge of the languages written in that
script)" — spelling-in, not sound-in — and CLDR contains no pronunciation-transcription
data at all. There is one hobby implementation of Wikipedia's English key
([Attacktive/ipa-to-pronunciation-respelling](https://github.com/Attacktive/ipa-to-pronunciation-respelling))
worth reading for edge cases. For the other sixteen languages this is a thing that does
not exist.

One honest caveat about the English source we are borrowing from: Wikipedia's own
Manual of Style says "respelling non-English pronunciations into English is inadequate
and misleading". It is right about the *inadequate*. The column is a hint, not a
transcription, and the project already knows this — but the disclaimer belongs in the
record.

### The verdict per source language

| Source | What exists | Kind | Keyed on | Verdict |
|---|---|---|---|---|
| `ko` | 외래어 표기법 (NIKL, 문교부 고시 제85-11호) | respelling | **IPA** | **Borrow**, with 제3항/제4항 relaxed |
| `es` | *Diccionario panhispánico de dudas*, §Representación de los fonemas | respelling | **sounds, in Spanish letters** | **Borrow** the method and the four extra signs |
| `vi` | *Quy tắc chính tả… phiên chuyển tiếng nước ngoài* (2000) + three MOET decisions | respelling | **source pronunciation, explicitly** | **Borrow**, near as written |
| `en` | Wikipedia's respelling key (CC BY-SA); BBC text spelling as design reference | respelling | **IPA** | **Borrow**, merge two vowel pairs |
| `ja` | 外来語の表記 (内閣告示第2号, 1991) | respelling | sounds, described in kana | **Borrow**, re-key to IPA; prefer 第2表 |
| `tr` | TDK *Yazım Kılavuzu* §08; the Güncel Türkçe Sözlük's `:` `'` `^` notation | respelling in parentheses | source spelling, for Greek and Russian | **Borrow** the slot, the syllabification rule and the length mark |
| `it` | DOP (non-IPA, commercial); the ANSA/Lepri press convention | respelling (press); scholarly notation (DOP) | source spelling and ear | **Adapt** the press convention |
| `ru` | практическая транскрипция (ГУГК instructions; Гиляревский & Старостин) | hybrid | spelling, with an RP-IPA column | **Adapt**: read the middle column |
| `zh-Hans` | 译音表 in 世界人名翻译大辞典 + GB/T 17693; 谐音 in popular use | respelling | IPA for English, spelling elsewhere | **Adapt**: take the inventory, emit pinyin |
| `th` | หลักเกณฑ์การทับศัพท์ (Royal Society, Royal Gazette) | transliteration | English letters | **Adapt heavily**: add tone, drop ทัณฑฆาต |
| `hi` | Central Hindi Directorate standard (nativisation); Bhargava's dictionary (a real respelling) | both, opposed | spelling | **Invent**, on Bhargava's pattern, against the standard |
| `ar` | sound-based practice, no table; ar.wikipedia's parenthetical policy | practice | — | **Invent**, with a reviewer |
| `pt` `de` `fr` | IPA-only lexicography | — | — | **Invent** (`pt` cheap, `de` and `fr` not) |
| `el` | nothing sound-keyed; Babiniotis LNEG §7(δ)'s parenthetical pronunciations, ELETO Ορόγραμμα 62, el.wikipedia's Ονοματοδοσία σελίδων, the EU guide §10.5 | worked examples, not a table | — | **Invent** on those four patterns. ΕΛΟΤ 743 is the wrong direction |
| `hu` | Magay, *Idegen nevek kiejtési szótára* (Akadémiai 1974); AkH. 12 rule 13's own brackets; the MTA's *Keleti nevek magyar helyesírása* and the Cyrillic/Modern-Greek volume; **Kontra, *Magyar Nyelvőr* 99 (1975)** | respelling in Hungarian letters | **sounds** — and Kontra's chart is keyed on **IPA** | **Borrow.** The best key of any reader here, and the only one whose author says he built it from IPA |
| `id` `sw` | spelling-adaptation standards that say so in writing | — | — | **Invent**, cheaply — near-phonemic orthographies |
| `he` | **כללי התעתיק מלועזית לעברית** (Academy of the Hebrew Language, approved 21 May 2007, amended 30 October 2017) | respelling in Hebrew letters | **sounds** — the rules' own founding principle | **Borrow.** The second key in the set whose authority states the method this column needs, in its own words |

## The typographic constraint that settles the stress question

Before the linguistics: the sheet can only mark stress with *characters*. A respell cell
is one text run with one style. `styleFor()` in `core/solve/atoms.js:138` builds one
`RunStyle` per field — `weight: fs.bold ? 700 : 400`, `italic: fs.italic`, lines
154–155 — from a single per-field entry in the theme, and the theme sets respell once
per template:

```
entry:      respell  5.22pt  italic  muted
ref / num:  respell  5.2pt   italic  muted  condensed
refphrase:  respell  5.3pt   italic  muted  condensed
```

So **bold-for-stress, italic-for-stress and spacing-for-stress are all unavailable**
without changing the renderer. That matters more than it looks, because bold is the
device three of the research threads independently recommended for the scripts with no
letter case. It is not on the table today. Everything below has to fit inside the
string.

Two consequences, and both cut against diacritics:

- **5.2pt, italic, muted is the worst possible home for a mark.** This is the argument
  `summary.md` already makes against printing IPA — "a third 5.22pt muted line whose
  distinguishing marks are the first thing to go in bad light". A capital survives it,
  because `SEE` against `see` is letterform shape at full size. An acute accent, a Thai
  tone mark, an Arabic fatha, a German Unterpunkt and a Vietnamese hook do not.
- **The non-Latin scripts are physically bigger.** `data/registry/scripts.csv` sets
  `min_size_pt` per script and `core/solve/atoms.js:141` floors the field at it: Latin
  and Cyrillic 4.4, CJK 5.0, Arabic, Devanagari and Thai 5.4 — *above* the 5.22pt the
  field asks for. Leading floors go the same way (`leading_factor` 1.30–1.40 for
  Arabic, Devanagari and Thai against 1.02 for Latin). And `condensed` is honoured only
  for Latin (`atoms.js:145`), so the dense reference tables cannot narrow a Thai or
  Arabic respelling at all. A non-Latin say-it-like column is wider and taller than the
  curated English ones, and the solver will discover that by dropping rows.

Cyrillic is the outlier and the good news: `Cyrl` routes to the `latin` stack at 4.4pt
with `leading_factor` 1.02, so a Russian respelling costs what an English one costs, has
real italics, has a condensed face, and has letter case. Of the seven non-Latin sources
it is the only one with all four.

## Stress: the native device beats capitals almost everywhere

`mair-SEE` is a specifically English convention. Wikipedia's key says so — it is an
English-Wikipedia device — and the survey found no language outside English where
capitals are the local way to write stress. In five of the seventeen the reader's own
orthography already has a device they were taught in school, and using it costs no
learning at all:

| Source | Native stress device | Evidence it reads as stress |
|---|---|---|
| `es` | acute on the tonic vowel | The DPD's *rule*: "se señala siempre con una tilde la vocal tónica, incluso si a la palabra… no le corresponde llevar acento gráfico" — `[kása]`, `[gérra]`, `[sapáto]` |
| `it` | grave or acute on the stressed vowel, mid-word | Treccani prints its own headword as `pronùncia`, which is not legal ordinary spelling; ordinary Italian accents only ever fall word-finally, so a mid-word accent is unambiguously metalinguistic |
| `pt` | acute or circumflex, chosen by vowel quality | Same convention, and it encodes open versus close as well |
| `ru` | acute (знак ударения) | The official orthography rules prescribe it in dictionary headwords "и в текстах, предназначенных для изучающих русский язык как иностранный" — precisely this register |
| `de` | Unterpunkt for a stressed short vowel, Unterstrich for a stressed long one | Duden's own convention: `Wẹtter`, `Pe̲ter`. One mark carrying stress *and* length |

Against that stands the typography: every one of those five devices is a mark that dies
at 5.2pt italic muted, and four of the five are the exact marks the sheet is worst at.
The resolution is not to pick one globally. It is that **there is a cited precedent for
capitals as the fallback when the accent is unavailable for technical reasons** — that
is standard Russian, Ukrainian and Belarusian dictionary practice. So:

> **Default to the reader's native device; expose capitals as the legibility fallback.**
> A reader with no key on the card can only interpret their own convention, so the
> native device is right whenever it is legible — and when it is not, the fallback is
> already the documented one.

That is a control with a better default rather than a silent retune, and it is the
honest reading of a genuine conflict.

Three languages get capitals as the *primary* device, for positive reasons:

- **`en`** — it is the native convention, and it is what the 12,001 cells use.
- **`tr`** — and here marking is provably necessary rather than merely nice. Turkish
  default stress is *word-final* for ordinary words but *penultimate for foreign names
  regardless of the original accent* — `Kenedi`, `Vaşington`, `Mendelson`, `Mandela`,
  `Afrika`, `İngiltere`. So an unmarked polysyllable gets one of two different stresses
  depending on whether the reader takes it for a Turkish word or a foreign name. English
  trochaic disyllables survive by luck; anything longer breaks. Turkish accent is
  realised largely as pitch, so a marked syllable comes out as a pitch peak, which
  serves most targets. Turkish *does* have an official stress mark — the Güncel Türkçe
  Sözlük prints `'` immediately after the stressed vowel (`ko'kteyl`, `tiya'tro`,
  `loka'nta`) — but it is unavailable in practice, because the same apostrophe is the
  *kesme işareti* marking a suffix boundary on a proper noun (`Ankara'dan`,
  `TDK'nin`), which is exactly the environment a phrasebook prints. Offer it as an
  alternative; default to capitals.
- **`sw`** — capitals are load-bearing rather than decorative, and they also want care.
  Swahili stress is invariably penultimate, so a reader will place it on the penult of
  whatever we write; and both of Swahili's other devices *add* syllables and thereby
  move the penult — vowel doubling for length (written `VV` counts as two syllables:
  `ma-a-na`, `hi-i`) and epenthesis to break clusters. So the stronger lever is to
  **engineer the syllable count so the penult lands on the foreign stress**, which the
  rule set controls, and use capitals as reinforcement. The hazard: **all-caps reads as
  an acronym in Swahili.** The official word-division rules single out *finyazo* —
  `BAKITA`, `TAKUKURU`, `TATAKI` — as never to be divided, so the `SEE` in `mair-SEE`
  risks parsing as an initialism. Small caps would avoid it and the renderer cannot do
  them; this is a real cost to note rather than a reason to abandon capitals.
- **`id`** — capitals with the weakest justification in the set. There is no stress in
  Malay, "neither phonemic nor predictable", and nothing in KBBI, EYD V or PUPI marks
  stress on an Indonesian word. So capitals here are a *new instruction*, not a borrowed
  convention, and they need a legend.
- **`fr`** — with a caveat. French has no lexical stress and no stress-marking
  tradition, so a capital is a genuine import that carries no native meaning. An acute
  would be worse: in French `é` means "this vowel is /e/", so it would be read as a
  vowel-quality change. The research thread's preferred answer was bold, which the
  renderer cannot do. Capitals it is, as a documented choice rather than an inherited
  assumption.

And six sources cannot capitalise at all, because Han, Kana, Hangul, Thai, Arabic and
Devanagari have no letter case. For those, **do not invent a stress mark. Mark length
precisely and let the reader's own stress rules place the stress** — which works
because in four of the six the reader's language assigns stress from syllable weight,
and that is exactly what precise length notation encodes:

- **Arabic** stress is weight-governed — the rightmost heavy syllable, with
  dialect-specific fallbacks — and long vowels are already written with `ا و ي`. A
  correctly vocalised Arabic respelling is a stress-marked one for free. Arabic stress
  is also not meaning-bearing: *"في العربية لا يغيِّر النبر المعنى، لكنه يساعد السامع
  على الفهم"*.
- **Hindi** is the exception, and it has a real device. Hindi stress is not lexically
  contrastive and its description has been contested for a century, which is why no
  notation was conventionalised in the standards — but **Bhargava's *Standard
  Illustrated Dictionary (Anglo-Hindi)* marks stress with a superscript prime after the
  stressed syllable**: `Academy — ॲ-कॅड्'-ऍ-मि`, and `Accent — ऍक्'-सॅन्ट्` as a noun
  against `ऍक्-सॅन्ट्'` as a verb. The prime sits *between* letters, so unlike every
  other Devanagari mark it never collides with a मात्रा or the शिरोरेखा — which makes it
  the one stress mark in the caseless six that the typography can actually carry.
  Use it. Avoid the Vedic udātta and anudātta marks (U+0951/U+0952): Unicode names them
  "stress sign" but its own text says they "are tone marks used in the representation of
  Vedic text", they are combining marks in the crowded positions, and they are
  unattested for foreign stress.
- **Japanese** has no stress. What a Japanese reader needs is mora count, and the
  長音符号 ー and 促音 ッ are the two devices the notification already supplies. The
  native prosodic notation — NHK's downstep marks — describes Japanese pitch accent, not
  foreign stress, and is a proprietary dictionary convention.
- **Korean** has neither stress nor, for younger Seoul speakers, a live vowel length
  contrast. No device and no need. The standard marks nothing either.
- **Thai** cannot write a toneless syllable: tone is fully determined by consonant
  class, tone mark, vowel length and live/dead syllable. Omitting a tone mark does not
  give a neutral syllable, it gives whatever tone the consonant class dictates. Thai's
  stress device is therefore a tone mark, and it is not optional — the rule set must
  choose consonant *and* mark together. This is the one place where the official
  standard's silence is actively harmful.
- **Chinese** in characters has no device. Chinese in **pinyin** has capitals, because
  pinyin is Latin — one of the reasons to prefer it.

Two sources should mark nothing at all. **Vietnamese**: not a stress language; the
official rule already gives each name component an initial capital, so a capitalised
syllable would read as a name boundary; and while uppercase Vietnamese letters carry
tone marks in Unicode (`Ộ Ế Ắ`), real-world all-caps loses them — one Vietnamese essay
documents a single name printed four ways, including `YEC XANH` on a street sign with
the tones gone. **Indonesian**: instrumental work finds no stress in Malay, "neither
phonemic nor predictable", so capitals have no native anchor; keep them because they
are legible and harmless, but expect them to do no phonetic work.

## Length: free in four scripts, invented in the rest

Vowel length should be **optional per source**, as the owner suggested, but the switch
is not really a reader preference — it is a fact about whether the script writes length
with full-size letters or with a mark.

| Script | Device | Cost |
|---|---|---|
| Kana | ー for length, ッ for gemination | free — full-width, native, official |
| Devanagari | मात्रा (`आ ई ऊ`) | free — full letter size. Gap: `ए` and `ओ` are long-only, so short /e o/ cannot be written distinctly |
| Arabic | `ا و ي` for long vowels; harakat only to pin short ones | length free; harakat are the expensive half |
| Thai | distinct short and long vowel symbols | mostly free — the fragile marks in Thai are the tone marks, not the vowels |
| German | `ie` for /iː/, doubling otherwise — phonemic and native | free, but see the `h` trap: reserve `h` for /h/ and never use it post-vocalically |
| Swahili | doubling (`kondoo`) — native | free to write, but it moves the penult and therefore the perceived stress |
| Latin (`en` `it` `tr`) | doubling; the Italian press convention already does it (`àa`, `ùu`) | free |
| Cyrillic, `es`, `pt`, `id`, `vi` | no native length contrast to lean on | invented; better omitted. Italian doubling is phonemic for *consonants*, so never double a consonant for length |
| Hangul | none | do not mark |

**Turkish is the one language with a sanctioned length mark that is not a letter, and it
is a colon.** The Güncel Türkçe Sözlük's own front matter: *"**:** Uzun okunan heceyi
gösterir: *elâ:, ka:til, a:let*"*. That is an official Turkish metalinguistic notation
for length, in Turkish letters, printed by the national language authority. Use it.

Do *not* use the circumflex, and the case is now airtight rather than merely cautious.
`â î û` have three live and incompatible readings: disambiguating a long-vowel homograph
(`adet`/`âdet`, `hal`/`hâl`), marking the nisbet suffix (`askeri`/`askerî`), and —
fatally — **marking palatalisation of a preceding `k`, `g` or `l`** (`dergâh`, `dükkân`,
`kâğıt`, `Lâle`). There is a minimal pair: `kar` /kaɾ/ "snow" against `kâr` /caɾ/
"profit", two separate TDK headwords. Respell French *car* as `kâr` and you get a
palatal [c] *and* an existing Turkish word. TDK is itself retreating from the mark —
`lâzım` is now `lazım` with the pronunciation field reading `la:zım, l ince okunur`.

Do not double vowels in Turkish either: TDK adjudicates `aa` inconsistently — `maalesef`
→ `ma:lesef` (one long vowel) but `cemaat` → `cema:at` (hiatus, second syllable long) —
and leaves `saat`, the most famous case, blank. `ğ` is no help: silent, or a syllable
break, or lengthening, or /j/ after /e/, depending on context.

### The card has no room for a key — so borrow Bhargava's legend

The constraint that rules out Merriam-Webster also rules out any respelling whose
symbols must be looked up. But there is a middle path, and a printed precedent for it.
Bhargava's Anglo-Hindi dictionary sets a **four-word legend at the foot of every page**:

```
Age एज् ; Edge ॲज् ; Pen पॅन् ; Pain पेन्
```

Four words, teaching *only the one contrast the system adds* to what the reader already
knows — here, the candra vowels against the plain ones. Everything else in the notation
is ordinary Devanagari and needs no gloss. That is the right shape for this card: not a
key, but a one-line legend per source language covering the two or three glyphs that are
not already ordinary orthography. For English that is nothing at all. For Spanish it is
`[h]` and `[sh]`. For Turkish it is the colon. For Hindi it is the candra series and the
prime. For Indonesian it is `ê`. Anything that needs more than one line is the wrong
notation.

## Respelling or transliteration: the test

Worth stating once, because several systems fail it and the failure is not obvious from
their names. The test is a counterfactual: **change the source language's spelling
without changing its sound, and see whether the output changes.**

- English `Zhongwen` → `Chungwen` changes a transliteration and not a respelling.
- Thai ทับศัพท์ of English *knight* keeps the silent letters and marks them with
  ทัณฑฆาต, so the reader is shown the *spelling* of a sound that is not there. Fails.
- Russian practical transcription is indexed by English letter sequences — `-ough`,
  `-ea`, `-igh` — so the same phoneme string spelled differently gets different
  Cyrillic. Fails, but recoverably: the tables carry an RP-IPA column, so the mapping we
  want is the second-to-third column projection.
- The RAE *Ortografía*'s adaptation list is keyed to the foreign romanised spelling —
  it answers "how do I respell *Djibouti*", not "how do I write /dʒ/". Fails. But the
  DPD's bracket alphabet is a target alphabet for *sounds*, and that half passes.
- China's 译音表 are keyed on the source language's Latin spelling for most languages
  and on IPA for English, because English spelling is irregular. Half passes, and the
  half that passes is the half we need first.
- Korea's, Japan's and Vietnam's are indexed by sound. Pass.

Systems that pass are usable as-is; the rest are inventories wearing a
transliteration's index.

## The six to borrow

### English (`en`) — Wikipedia's key, with the corpus's own vowels

English has a whole family and they split on one axis: **does the reader need a
pronunciation key on the same page?** The card has no room for one, so that decides it.

- **Merriam-Webster is out.** Its own *Guide to Pronunciation* uses `\ … \` delimiters,
  a raised `ˈ` and lowered `ˌ` *preceding* the stressed syllable, and diacritic vowels
  (`ä ā ē ō ə`). Unreadable without the key, and the key is four pages. Proprietary too.
- **The American Heritage key is out** for the same reason: macron for long vowels,
  breve for short, circumflex for pre-rhotic.
- **Wikipedia's respelling key is the pick.** It is a published IPA-to-respelling
  table — the left column is literally IPA — it divides syllables with hyphens and marks
  primary stress with CAPITALS, giving `prə-NUN-see-AY-shən` for /prəˌnʌnsiˈeɪʃən/.
  Almost all of it is bare ASCII digraphs a native reader guesses right with no key:
  `sh zh ng th dh ch j ee ay ah oh oo ow oy air ar`. CC BY-SA, so encoding the table is
  clean if the derivation is credited.
- **The BBC Pronunciation Unit's "text spelling"** is the best design reference and the
  worst licensing story. Same shape — hyphens, CAPITALS — but built for exactly our
  problem, since the Unit's remit is "any language", so it has conventions Wikipedia's
  key lacks: `uh` for schwa, `uu` for the FOOT vowel, `kh` for a velar fricative, `hl`
  for Welsh *ll*, and a parenthesised `(ng)` after a vowel for nasalisation. Its
  published form is the *Oxford BBC Guide to Pronunciation*, which uses OUP's scheme.
  Borrow the ideas, not the table.

Two deliberate deviations from Wikipedia's key, both of which the corpus already made:

1. **Write schwa as `uh`, not `ə`.** Wikipedia distinguishes `ə` /ə/ from `u` /ʌ/. The
   distinction is native to English and absent from almost every target, so it carries
   no information here — and `ə` is a non-ASCII glyph whose bowl closes at 5.2pt italic.
   The 12,001 cells are pure ASCII apart from fourteen ellipses, and use `uh` for both.
2. **Merge `oo` /uː/ and `uu` /ʊ/ to `oo`.** FOOT–GOOSE is rare in the targets and `uu`
   is the least guessable symbol in the BBC set. The corpus already writes `oo`
   throughout (`boo yow`, `roo-koh`).

One improvement to take *from* the BBC set: nasal vowels. The French sheet writes
`bohn-ZHOOR` and `sahn VYAHND`, which an English reader reads with a real /n/.
`boh(n)-ZHOOR` is the documented convention and costs two characters. Worth raising as
an option rather than a silent retune, since it changes 700-odd existing cells.

Sources: [Help:Pronunciation respelling key](https://en.wikipedia.org/wiki/Help:Pronunciation_respelling_key) ·
[Template:Respell](https://en.wikipedia.org/wiki/Template:Respell) ·
[Module:Respell](https://en.wikipedia.org/wiki/Module:Respell) ·
[MoS/Pronunciation](https://en.wikipedia.org/wiki/Wikipedia:Manual_of_Style/Pronunciation) ·
[Pronunciation respelling for English](https://en.wikipedia.org/wiki/Pronunciation_respelling_for_English) ·
[the BBC key, as posted to ADS-L](https://listserv.linguistlist.org/pipermail/ads-l/2009-July/091768.html) ·
[BBC Pronunciation Unit](https://en.wikipedia.org/wiki/BBC_Pronunciation_Unit) ·
[John Wells on the BBC scheme's ambiguities](http://phonetic-blog.blogspot.com/2011/12/bbc-pronunciation-unit.html) ·
[Merriam-Webster's Guide to Pronunciation](https://www.merriam-webster.com/assets/mw/static/pdf/help/guide-to-pronunciation.pdf) ·
[Phonetic notation of the American Heritage Dictionary](https://en.wikipedia.org/wiki/Phonetic_notation_of_the_American_Heritage_Dictionary).
The Associated Press publishes a pronunciation guide whose examples look like ours
(`shee jihn-ping`), but its notation is documented only inside the paid Stylebook —
**unverified**, and not usable as a source in any case.

### Korean (`ko`) — the standard that is already the right shape

**외래어 표기법**, promulgated as 문교부 고시 제85-11호 on 7 January 1986 and since
maintained by the National Institute of Korean Language. Chapter 2 opens with the
`국제 음성 기호와 한글 대조표`: roughly forty IPA symbols, each mapped to a Hangul jamo in
onset position and again in coda or word-final position — `p → ㅍ / ㅂ, 프`, `f → ㅍ / 프`,
`ʃ → 시 / 슈, 시`, `ə → 어`. The 1986 notification carried five tables; language-specific
ones for around nineteen more have been added since, and the regulation says the IPA
table is the basis of all of them and the default for anything not tabulated.
A respelling, sound-keyed, IPA-in. Borrow it.

Chapter 1's five articles are the constraints, and two should be relaxed:

- **제1항** — only the 24 current jamo. Keep. Extended jamo are not in the shipped fonts
  and not in a reader's competence.
- **제2항** — one phoneme, one symbol. Keep, and note the cost: /f/ and /p/ both become
  ㅍ, /v/ and /b/ both ㅂ, /θ/ and /s/ both ㅅ, /z/ becomes ㅈ. Korean output is the
  coarsest in this survey and no rule set fixes it; it is the reader's inventory.
- **제3항** — only seven codas (ㄱㄴㄹㅁㅂㅅㅇ). Relax where a target genuinely has another
  coda, since we are not producing a word anyone will reuse.
- **제4항** — no tense consonants for plosives. **Relax.** The Institute's own newsletter
  grants that French and Japanese voiceless stops are nearer 된소리, and says the rule
  exists so a transcriber need not adjudicate the aspirated/tense boundary across Greek,
  Turkish, Dutch, Arabic, Thai and Hindi. We are a program with a per-language rule file,
  so that cost does not apply, and Spanish, French, Italian, Japanese, Thai and
  Vietnamese targets all read better with ㅃㄸㄲ.
- **제5항** — respect established forms. Keep, as an override list, which is what
  `data/respell/overrides/` already is.

Mark neither stress nor length. The zero-capitals convention on the `ko__en` sheet is
the mirror image of the same fact.

Sources: [규정 보기 — 외래어 표기법](https://www.korean.go.kr/front/page/pageView.do?page_id=P000104&mn_id=97) ·
[국제 음성 기호와 한글 대조표](https://www.korean.go.kr/front/page/pageView.do?page_id=P000105&mn_id=97) ·
[the ko.wikipedia mirror of the table](https://ko.wikipedia.org/wiki/%EC%9C%84%ED%82%A4%EB%B0%B1%EA%B3%BC:%EC%99%B8%EB%9E%98%EC%96%B4_%ED%91%9C%EA%B8%B0%EB%B2%95/%EA%B5%AD%EC%A0%9C_%EC%9D%8C%EC%84%B1_%EA%B8%B0%ED%98%B8%EC%99%80_%ED%95%9C%EA%B8%80_%EB%8C%80%EC%A1%B0%ED%91%9C) ·
[국립국어원 on 된소리 and 파리/빠리](https://www.korean.go.kr/nkview/news/91/news6_7.htm) ·
[the seven permitted codas (KDI 나라경제)](https://eiec.kdi.re.kr/publish/naraView.do?fcode=00002000040000100012&cidx=11044&sel_year=2017&sel_month=05) ·
[한국민족문화대백과사전, for 문교부 고시 제85-11호, 1986-01-07](https://encykorea.aks.ac.kr/Article/E0039235) ·
[Korean phonology](https://en.wikipedia.org/wiki/Korean_phonology) and
[the vowel-length merger in Seoul Korean](https://www.degruyterbrill.com/document/doi/10.1515/lp-2015-0014/html).

### Spanish (`es`) — the DPD's method, more or less verbatim

The *Diccionario panhispánico de dudas* is the closest thing in this survey to a
finished specification for a say-it-like column. Its own rules:

- **Pronunciation goes in square brackets.**
- **The tonic vowel always carries a tilde, even where ordinary spelling would not
  require one** — `[kása]` for *casa*, `[gérra]` for *guerra*, `[sapáto, zapáto]` for
  *zapato*. This is the stress convention, prescribed, with no learning cost.
- **The *seseante* pronunciation is listed first**, "por ser la mayoritaria en el
  conjunto de los países hispanohablantes". A dialect-policy decision we inherit free —
  and it means emitting `s` for /s/ dodges the whole `z`/`c`+*e,i* problem.
- **Four extra signs for non-Spanish sounds**: `[h]` an aspirate as in English *home*,
  `[sh]` as in English *shampoo*, `[v]` a voiced labiodental as in German *Wagner*, and
  a fourth for the voiced palatal fricative of French *Jean*. That fourth glyph is
  rendered as an image on the RAE page and could not be read — **unverified**, though
  `[zh]` is the obvious guess and should not be encoded on a guess.

Worked examples from the RAE's own text: *quiche* French `[kísh]` → recommended Spanish
`[kíche]`; *airbag* English `[érbag]` → `[airbág]`; *geisha* `[géisha]`; *ballet*
`[balé]`; *blues* `[blús]`; and — correcting the guess in the brief — *Shakespeare* is
`[shéspir]`, not `[séikspir]`.

The Spanish letter choices are attested rather than invented: `sh` for /ʃ/, `h` for /h/,
`v` for /v/, `j` for /x/ (*Khartum* → **Jartum**), `y` for /dʒ ʒ/ (*Djibouti* →
**Yibuti**), `ch` for /tʃ/, `u` for /w/ in a diphthong (*Rwanda* → **Ruanda**), `f`
never `ph`, `i` never `ee`, `u` never `ou`, geminates simplified.

Two things to keep straight. First, that adaptation list is **keyed to the foreign
romanised spelling**, so it is a sanity check on our IPA→Spanish table, not an engine
input; the DPD's bracket alphabet is the IPA-compatible half. Second, the *Ortografía*
warns that `sh` and etymological `h` are "secuencias que resultan a veces extrañas a
nuestra lengua" — but that is advice about *permanent Spanish spellings of loanwords*,
and the DPD uses `[sh]` and `[h]` freely inside pronunciation brackets. Our column is
the second thing. Use `sh`.

Traps: `h` and `v` are only licensed by the bracket-or-column context, since ordinary
Spanish `h` is silent and `v` is /b/; never emit `x` (it is /s/, /ks/, /gs/ and /x/
depending on the word); prefer `y` over `ll` because of yeísmo; and `r` is positional,
so word-initial `r` will be trilled with no clean fix. Spanish readers also epenthesise
before initial `s`+consonant (*Stockholm* → *Estocolmo*), which in a phrasebook is
arguably a feature.

Free seed material, and this is the best in the survey: **es.wikipedia's `Ayuda:AFI/*`
pages carry a third column, "Aproximación en español"** — /ʃ/ → "**sh**ow, su**sh**i";
/ʁ/ → "similar a **j**amón"; /ɑ̃/ → "sin equivalente" — for Inglés, Francés, Alemán,
Italiano, Checo and Vietnamita, under CC BY-SA 4.0. **FundéuRAE** is CC BY-SA 3.0 and
publishes pronunciation guides described as "una transcripción fonológica sencilla e
intuitiva usando los sonidos del español". And the Spanish term of art already exists:
*pronunciación figurada*, attested at least to Mantilla's 1876 *Cartera de la
conversación en inglés con la pronunciación figurada*.

Sources: [DPD, Representación de los fonemas y de la pronunciación](https://www.rae.es/dpd/ayuda/representacion-de-sonidos) ·
[DPD, Tratamiento de los extranjerismos](https://www.rae.es/dpd/ayuda/tratamiento-de-los-extranjerismos) ·
[DPD, *geisha*](https://www.rae.es/dpd/geisha) ·
[*Ortografía*, extranjerismos crudos](https://www.rae.es/ortograf%C3%ADa/extranjerismos-crudos) ·
[*Ortografía*, transcriptions from non-Latin scripts](https://www.rae.es/ortograf%C3%ADa/las-transcripciones-de-voces-procedentes-de-lenguas-que-no-utilizan-el-alfabeto-latino-en-su-escritura) ·
[RAE on *Shakespeare*](https://x.com/RAEinforma/status/844489198723891200) ·
[Ayuda:AFI/Inglés](https://es.wikipedia.org/wiki/Ayuda:AFI/Ingl%C3%A9s) and [Ayuda:AFI/Francés](https://es.wikipedia.org/wiki/Ayuda:AFI/Franc%C3%A9s) ·
[FundéuRAE's licence footer](https://www.fundeu.es/como-se-pronuncian-los-apellidos-de-los-nuevos-miembros-de-la-comision-europea/) ·
[Mantilla 1876](https://www.bvfe.es/es/ejemplar/11698-cartera-de-la-conversacion-en-ingles-con-la-pronunciacion-figurada.html) ·
[Acentuación del idioma español](https://es.wikipedia.org/wiki/Acentuaci%C3%B3n_del_idioma_espa%C3%B1ol).

### Vietnamese (`vi`) — codified, sound-based, and hyphens are already the native device

The **Quy tắc chính tả tiếng Việt và phiên chuyển tiếng nước ngoài**, adopted by the
Hội đồng Quốc gia Chỉ đạo Biên soạn Từ điển Bách khoa Việt Nam at its plenary of
3–4 May 2000 under Prime Minister's Office letter 1635/VPCP-KG, requires transcription
"dựa vào cách đọc trực tiếp của nguyên ngữ" — based on the direct pronunciation of the
source language. It comes with machinery close to a specification:

- **Hyphens between syllables**, stated verbatim in QĐ 07/2003/QĐ-BGDĐT: *"Đối với mỗi
  bộ phận tạo thành tên riêng, viết hoa chữ cái đầu và có gạch nối giữa các âm tiết"* —
  `Phơ-ri-đơ-rích Ăng-ghen`, `Mát-xcơ-va`, `An-giê-ri`. Our hyphen convention is not an
  import into Vietnamese; it is the prescribed form, and in modern Vietnamese the hyphen
  has become a marker of foreignness, which is exactly the signal this column wants.
- **A permitted coda list** `n, m, p, l, c, ch, ng, nh, t` — which includes `l`, beyond
  native Vietnamese phonotactics. A deliberate licence, not an error.
- **Permitted two-consonant onsets** `br, khr, xc, đr` (`Đruyông`, `Xcaclati`).
- **`f j w z` authorised** for phiên âm (`Frăngxoa Busê`, `Jêm Biucanơn`) though they
  are not letters of the Vietnamese alphabet.
- Per-source notes: English, French and German by direct reading; Russian direct and
  *"không nhược hoá lược bỏ trọng âm"*; Chinese via Sino-Vietnamese with a pinyin gloss.

**The decline helps rather than hurts.** QĐ 240/QĐ (1984) already said Latin-script
names keep their original form, and QĐ 1989/QĐ-BGDĐT (2018) extends that to non-Latin
scripts "as in English usage" — *but* requires primary-school textbooks to use
*"hình thức phiên âm, có gạch nối các âm tiết"* (`Tô-mát Ê-đi-xơn`, `Pa-ri`) with the
original parenthesised. And from 15 June 2021 *Báo Nhân Dân* prints the English spelling
**with the phiên âm in parentheses for the reader's reference** — *Vladimir Putin
(V.Pu-tin)*. So what has declined is phiên âm *as a name's orthography*; what survives,
in law and in the national newspaper, is phiên âm *as a parenthetical pronunciation
aid*. That is precisely our column.

**Tone.** The 2000 rule says *"không đánh dấu thanh điệu"*, and that is only satisfiable
for open and nasal-coda syllables: a syllable ending in /p t k/ admits only *sắc* or
*nặng*. That is why `Mát-xcơ-va` and `Tô-mát` carry *sắc* — there is no toneless option.
Read the rule as **unmarked *ngang* wherever phonotactics permit, *sắc* as the default on
checked syllables.** Tone is therefore mostly *determined* rather than chosen, which is
good news for a generator and the opposite of Thai.

The residual difficulty is instability, and it is honest to name it: Dickens becomes
`Đích-ken-xơ`, and Shakespeare is attested as `Xếch-xpia`, `Sếch-xpia` and
`Sếch-xơ-pia`, partly because Hanoi speech does not distinguish `s` from `x`. A generated
column will at least be self-consistent, which the tradition is not.

Sources: the 2000 rules, reproduced at [thuviendethi](https://thuviendethi.com/quy-tac-chinh-ta-tieng-viet-va-phien-chuyen-tieng-nuoc-ngoai-47153/) and [vndoc](https://vndoc.com/quy-tac-viet-chinh-ta-tieng-viet-va-phien-chuyen-tieng-nuoc-ngoai-203085) ·
[QĐ 240/QĐ (1984)](https://thuvienphapluat.vn/van-ban/Giao-duc/Quyet-dinh-240-QD-nam-1984-chinh-ta-thuat-ngu-tieng-Viet-sach-giao-khoa-bao-van-ban-nganh-giao-duc-216818.aspx) ·
[QĐ 07/2003/QĐ-BGDĐT, the hyphen rule](https://ngonngu.net/qd_bogd_viethoa/335) ·
[QĐ 1989/QĐ-BGDĐT (2018)](https://thuvienphapluat.vn/van-ban/Giao-duc/Quyet-dinh-1989-QD-BGDDT-2018-quy-dinh-chinh-ta-Chuong-trinh-sach-giao-khoa-giao-duc-pho-thong-445355.aspx) ·
[VnExpress on its effect on textbooks](https://vnexpress.net/quy-dinh-khien-sach-giao-khoa-phien-am-ten-rieng-nuoc-ngoai-4380606.html) ·
[Báo Nhân Dân's parenthetical policy](https://vtcnews.vn/bao-nhan-dan-thay-doi-cach-phien-am-ten-rieng-nuoc-ngoai-ar618508.html) ·
[Vietnamese phonology, on the tone constraint](https://en.wikipedia.org/wiki/Vietnamese_phonology) ·
[Vietnamese alphabet, on hyphens](https://en.wikipedia.org/wiki/Vietnamese_alphabet) ·
[Đào Tiến Thi on syllabification and the Shakespeare variants](https://corling.wordpress.com/2010/06/08/phien-am-ten-rieng-n%C6%B0%E1%BB%9Bc-ngoai-khong-d%C6%A1n-gi%E1%BA%A3n-th%E1%BA%BF-trao-d%E1%BB%95i-v%E1%BB%9Bi-ts-thanh-ha/) ·
[Cánh Buồm on the four renderings of one name](https://canhbuom.edu.vn/2023/01/23/nhac-lai-van-de-phien-am-ten-nuoc-ngoai-nhan-doc-sach-tieng-viet-tieu-hoc).
All four instruments are public Vietnamese law.

### Japanese (`ja`) — settled rules, sound-keyed, needs re-keying to IPA

**外来語の表記**, Cabinet Notification No. 2 of 28 June 1991, superseding all earlier
guidance. 第1表 is "the kana generally used to write loanwords and foreign place and
personal names"; 第2表 is "the kana used when one wants to write as close as possible to
the original sound or the original spelling", and holds イェ, ウィ/ウェ/ウォ, クァ, ツィ and
the ヴ series. A respelling, sound-keyed.

The cheap adaptation: some 留意事項 are keyed on English *spelling* — "word-final -er,
-or, -ar and the like are written as an ア-row long vowel with ー, though the ー may be
dropped according to established usage". For an IPA-in transducer that is just
`/ɚ/ → アー`, and nothing is lost by dropping the orthographic framing.

The real decision: **use 第2表, against official preference.** Policy prefers 第1表, and
the state has acted on that preference — in 2019 the Diet amended the
在外公館名称位置給与法 to remove ヴ from official country names (カーボヴェルデ →
カーボベルデ), MOFA explaining that the ヴ-less form is more familiar to the public. Good
reasoning for a permanent place name; bad for a column read once whose entire purpose is
closeness to the original sound. Write ヴ, ティ, トゥ, ウィ, and say in the rule file that
this is a knowing departure.

Length is free and idiomatic — ー and ッ. Stress should not be marked at all.

Sources: [外来語の表記 (文化庁)](https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/gairai/index.html) ·
[第1表・第2表](https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/gairai/honbun01.html) ·
[留意事項その2](https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/gairai/honbun06.html) ·
[外来語の表記 (ja.wikipedia)](https://ja.wikipedia.org/wiki/%E5%A4%96%E6%9D%A5%E8%AA%9E%E3%81%AE%E8%A1%A8%E8%A8%98) ·
[国名表記「ヴ」消える (日本経済新聞)](https://www.nikkei.com/article/DGXMZO43067710Z20C19A3EA3000/) ·
[MOFA's stated reason (J-CAST)](https://www.j-cast.com/2019/03/29353982.html) ·
[NHK日本語発音アクセント新辞典, for the downstep notation](https://www.monokakido.jp/ja/dictionaries/nhkaccent2/index.html) ·
[Latin-Kana chart (CLDR)](https://www.unicode.org/cldr/cldr-aux/charts/25/transforms/Latin-Kana.html).

### Turkish (`tr`) — the authority sanctions the feature by name

The TDK *Yazım Kılavuzu* §08 *Yabancı Özel Adların Yazılışı* gives the rule the brief
guessed at, and then gives us the feature outright:

> 1. Latin harflerini kullanan dillerdeki özel adlar özgün biçimleriyle yazılır:
> Beethoven, Byron, Cervantes, Chopin… Molière, Rousseau, Shakespeare… **Ancak Batı
> dillerinde kullanılan adların okunuşları ayraç içinde gösterilebilir: Shakespeare
> (Şekspir) vb.**

Names from Latin-script languages keep their spelling — **but their pronunciations may be
shown in parentheses.** The other clauses fill in the rest: long-settled Western names
are written *"Türkçe söylenişlerine göre"* (`Napolyon`, `Atina`, `Londra`, `Marsilya`,
`Münih`); Arabic and Persian names follow *"Türkçenin ses ve yapı özelliklerine göre"*;
and Greek and Russian names use *"Yunan/Rus harflerinin ses değerlerini karşılayan Türk
harfleri"* — Turkish letters matching the *sound values of the source letters*, which is
a phonemic transliteration rather than a from-the-ear respelling, and the one place the
Turkish rule is keyed to the source script.

Three further gifts, all quotable:

- **A syllabification spec, and it is not onset-maximising.** *"Batı kökenli kelimeler,
  Türkçenin hece yapısına göre hecelere ayrılır: band-rol, kont-rol, port-re,
  prog-ram, sant-ral, sürp-riz, tund-ra, volf-ram."* A Turkish reader expects
  `prog-ram`, not `pro-gram`; two medial consonants split VC.CV and three split VCC.CV.
  Our hyphens must obey this or they will not look native. TDK already hyphenates the
  syllables of Chinese given names (`Sun Yat-sen`), so the convention is in place.
- **Clusters survive, against the folk claim.** *"Çift ünsüz harfle başlayan Batı
  kökenli alıntılar, ünsüzler arasına ünlü konulmadan yazılır: kral, kredi, plan,
  problem, spiker, spor, staj, stüdyo, trafik, **tren**"* — so `tren`, not `tiren`;
  epenthesis is lexicalised in a short closed list (`iskarpin`, `istasyon`, `kulüp`).
  Final clusters too: *"İki ünsüzle biten Batı kökenli alıntılar, ünsüzler arasına ünlü
  konmadan yazılır: film, form, lüks, modern, slayt, teyp."* Turkish orthography carries
  far more foreign structure than a phonotactics-first instinct would allow.
- **Vowel harmony is explicitly waived** for loanwords — *"Alıntı kelimelerde büyük ünlü
  uyumu aranmaz"* — so a disharmonic respelling is legitimate and expected.

The traps are few and sharp. **`c` is /dʒ/ and `j` is /ʒ/**, swapped relative to English
intuition, so a respelling of *merci* spelled `merci` reads *merdʒi* — the single worst
trap in the language. **Final devoicing is prescribed**: *"alıntı kelimelerin özgün
biçimlerinin sonlarında bulunan yumuşak ünsüzler sertleşir: kitap, bant, etüt, metot,
standart"* — from `kitab`, `band`, `etüd`, `metod`, `standard`, so a respelling ending
in `b d c g` is against the orthography and will be read devoiced — write the voiceless
letter or accept the loss. **`/ŋ/ has no representation at all**: the alphabet's 21
consonants are `b c ç d f g ğ h j k l m n p r s ş t v y z`, and the loan solution `ng`
(`miting`, `kamping`, `doping`) buys an unavoidable extra [ɡ]. And `v` is only a decent
/w/ beside a rounded vowel, where it is [β]; before `a e i` it is firmly [v], so `vayn`
for *wine* comes out [vajn].

The assets are better than expected. Attested TDK loan mappings give us /ɜː/ → `ö`
(`tişört`), /x/ → `h` (`Şolohov`, `otoban`), /ks/ → `ks` (`faks`, `taksi`), /kw/ → `kuv`
(`kuvars`). Turkish /e/ is [ɛ]~[æ] before a coda `m n l r`, so `e` is a good /æ/ in a
closed syllable and mediocre in an open one. And **`ı` is the best schwa in any
Latin-script source here** — tr.wikipedia's IPA key glosses /ə/ as "[e] ve [ɯ] arası" —
an asset English respelling simply lacks.

Two anti-precedents to know about. tr.wikipedia's *Adlandırma kuralları* diverges from
TDK, preferring original spellings and systematised transcriptions "like Pinyin" for
non-Latin scripts; follow TDK, not tr.wikipedia. Worse, tr.wikipedia carries a
*Yardım:Telaffuz yeniden heceleme anahtarı* — Turkish title, Turkish column headers,
**English respelling values** — and it is live in articles: *Al Pacino* renders
`pə-CHEE-noh`, *Illinois* renders `IL-i-NOY`. For a Turkish reader `CHEE` is wrong, `noh`
is nonsense, `ə` is not a Turkish letter, and `IL` reads [ɯl] because capital dotless I
is `ı`. **A Turkish reader who has met that page has been trained wrong**, which is both
the sharpest available illustration of why the English convention does not port and a
reason the Turkish legend line needs to distinguish itself from it.

Casing: dotted and dotless I are separate letters with their own case pairs (`i`↔`İ`,
`ı`↔`I`), so an all-caps syllable is unambiguous **provided the casing runs in the
Turkish locale**. A plain `toUpperCase()` maps `i` → `I`, a different letter and a
different vowel. That is the "Turkish-I problem", it is a real bug rather than a
nicety, and it wants a test case.

Licensing: TDK is a state institution and the *Yazım Kılavuzu* is published free on a
`gov.tr` site, but the dictionary footer reads **"© 2022 - TDK Tüm hakları saklıdır"**
and no terms of use grant reuse. Quote briefly, cite, and do not bulk-copy rule text or
dictionary data. The *conventions* — `:` for length, `'` for stress, the syllabification
rule — are not copyrightable and are safe to adopt.

Sources: [TDK Yazım Kılavuzu §08, Yabancı Özel Adların Yazılışı](https://yazim.tdk.gov.tr/content/08-yabanci-ozel-adlarin-yazilisi.html) ·
[§07, Alıntı Kelimelerin Yazılışı](https://yazim.tdk.gov.tr/content/07-alinti-kelimelerin-yazilisi.html) ·
[§01, Ses, Harf ve Alfabe](https://yazim.tdk.gov.tr/content/01-ses-harf-ve-alfabe.html) and
[§02, Sesler ve Ses Uyumları](https://yazim.tdk.gov.tr/content/02-sesler-ve-ses-uyumlari.html) ·
[hece yapısı ve satır sonunda kelimelerin bölünmesi](https://tdk.gov.tr/icerik/yazim-kurallari/hece-yapisi-ve-satir-sonunda-kelimelerin-bolunmesi/) ·
[kesme işareti](https://tdk.gov.tr/icerik/yazim-kurallari/kesme-isareti/) ·
[Sözlükte Kullanılan İşaretler (PDF) — the `:` `'` `^` notation](https://eski.sozluk.gov.tr/dosyalar/SozlukteKullanilanIsaretler.pdf) ·
[Turkish alphabet](https://en.wikipedia.org/wiki/Turkish_alphabet) ·
[Turkish phonology — Sezer on penultimate stress in foreign names](https://en.wikipedia.org/wiki/Turkish_phonology) ·
[Artdamaksıl genizsil ünsüz — /ŋ/ has no Turkish representation](https://tr.wikipedia.org/wiki/Artdamaks%C4%B1l_genizsil_%C3%BCns%C3%BCz) ·
[Yardım:IPA (tr.wikipedia), CC BY-SA — the seed table](https://tr.wikipedia.org/wiki/Yard%C4%B1m:IPA) ·
[Yardım:Telaffuz yeniden heceleme anahtarı — the anti-precedent](https://tr.wikipedia.org/wiki/Yard%C4%B1m:Telaffuz_yeniden_heceleme_anahtar%C4%B1) ·
[Vikipedi:Adlandırma kuralları](https://tr.wikipedia.org/wiki/Vikipedi:Adland%C4%B1rma_kurallar%C4%B1) ·
[Akdağ, *PESA* 6(1) 2020, on the drift of loan spellings toward Turkish pronunciation](https://dergipark.org.tr/tr/pub/pesausad/issue/53466/686562).
Two leads neither research pass reached, and both are where a Turkish respelling
standard for foreign names would live if one exists: **TRT's *Telaffuz Sözlüğü*** and the
**Anadolu Ajansı style book**. Also unchecked: Dil Derneği's competing *Yazım Kılavuzu*.
The claim that `Nevyork` was ever an official prescription is **unverified**.

## The four to adapt

### Italian (`it`) — ignore the dictionary, borrow the newsroom

Italy has two traditions and the useful one is not the prestigious one.

The **DOP — *Dizionario d'ortografia e di pronunzia*** (Migliorini, Tagliavini and
Fiorelli; ERI-RAI 1969, editions 1981 and 2010) is the one Western European reference
work in this survey that rejects IPA: it uses "una trascrizione fonetica studiata
appositamente per il pubblico italiano, tipologicamente affine… al sistema che in Italia
è comunemente denominato Ascoli-Merlo o trascrizione romanistica", across about 140,000
entries including *forestierismi*. That is encouraging as evidence that Italian readers
accept a native-letters pronunciation column, and useless as a source. Ascoli-Merlo is a
Romance philologist's alphabet with its own diacritics — nearer to "IPA in Italian
letters" than to `nee HOW` — the work is commercial, and the online edition never
loaded the foreign entries ("non è ancora stata immessa nel sito, in particolare, la
maggior parte delle voci appartenenti a lingue straniere"). Every DOP host and path
tried on 2 September 2026 returned 404, so its sign inventory is **unverified**.

**The borrowable tradition is the press convention**, best documented in Sergio Lepri's
*Consigli pratici per la grafia e la pronunzia di lingue straniere* — Lepri was long
ANSA's editorial director, and this is the "si pronuncia …" convention written down for
working journalists. It is a respelling, in Italian orthography, in italics. Read off his
examples:

- **Stress: a grave or acute accent on the stressed vowel, mid-word** — `ròusvelt`,
  `scikàgou`, `hiùuston`, `vagliadolìd`, `bèibi`, `sciòu`, `màniger`.
- **Length: vowel doubling** — `abdallàah`, `vàaslaf`, `crùus`, `ùuc` for Łódź.
- /ʃ/ = `sc` before *i/e*, `sci` before *a/o/u* (Bush → `busc`, Warszawa → `varsciàva`);
  /ʒ/ = `sg(i)`; /ʎ/ = `gl(i)`; /ɲ/ = `gn`; /dʒ/ = `g(i)` (Hoxha → `hògia`); /ts/ = `z`.
- **`h` as an aspirate** — `hògia`, `hiùuston`, `bahràin`. Italian `h` is otherwise mute,
  but the press convention presses it into service and readers cope. So Italian *can*
  write /h/ after all, contrary to what the orthography alone suggests.
- Schwa in parentheses (`bèibi sit(e)`), and an ad-hoc `®` for English r-colouring
  (`péis meike®`) — the latter shows a real need but would be illegible at 5.2pt.

**Stress: the accent, not capitals.** Ordinary Italian only ever accents a *final* vowel
(`città`, `caffè`), so a mid-word accent is unambiguously metalinguistic — and Italian
dictionary practice has trained readers to read it as stress: Treccani prints its own
headword as `pronùncia`. Pick grave against acute deliberately and you get the open/close
`e` and `o` contrasts for free, which is what the DOP and Treccani both do.

The traps are all context-sensitivity on the *following* vowel, and they are the main
source of generator bugs: `c` and `g` are affricates before *i/e*, so /k/ and /ɡ/ before
a front vowel need `ch` and `gh`, while /tʃ/ and /dʒ/ before *a/o/u* need `ci` and `gi`;
`sc` is /ʃ/ before *i/e* but /sk/ before *a/o/u*; `gn` is /ɲ/ so a real /gn/ cluster needs
Lepri's `ghn`; `gl` before *i* is /ʎ/. And **double consonants are phonemically long in
Italian**, so doubling is not a neutral device — reserve it for genuine geminates and use
vowel doubling only for length. Every written vowel is pronounced, so do not add a final
`e` to prop up a consonant the way French requires; it would be read.

it.wikipedia gives less free material than es.wikipedia: `Aiuto:IPA per l'inglese` has
only "IPA | Esempi" columns, with no Italian-approximation column. Zingarelli, DiPI and
Treccani's *Vocabolario* are all proprietary (Treccani's pronunciation pages carry
"Riproduzione riservata"); De Mauro and Sabatini-Coletti are **unverified**.

Sources: [Dizionario d'ortografia e di pronunzia (it.wikipedia)](https://it.wikipedia.org/wiki/Dizionario_d%27ortografia_e_di_pronunzia) ·
[Sergio Lepri, *Consigli pratici per la grafia e la pronunzia di lingue straniere*](https://www.sergiolepri.it/consigli-pratici-per-la-grafia-e-la-pronunzia-di-lingue-straniere/) ·
[Treccani, *Nomi stranieri: prontuario*](https://www.treccani.it/enciclopedia/nomi-stranieri-prontuario_(Enciclopedia-dell'Italiano)/) ·
[Treccani, *pronuncia*](https://www.treccani.it/vocabolario/pronuncia/) ·
[Accento grafico](https://it.wikipedia.org/wiki/Accento_grafico) ·
[Aiuto:IPA per l'inglese](https://it.wikipedia.org/wiki/Aiuto:IPA_per_l%27inglese).

### Russian (`ru`) — a real tradition, keyed the wrong way, cheaply recoverable

**Практическая транскрипция** is a century-old per-language tradition with published
tables, in two tiers. Official: ГУГК, the USSR's Main Directorate of Geodesy and
Cartography, issued a per-language *Инструкция по русской передаче … географических
названий* — the English one edited by L. I. Anenberg in 1975, descended from a 1955
edition, and still hosted by Rosreestr. Scholarly: Гиляревский and Старостин,
*Иностранные имена и названия в русском тексте* (3rd ed. 1985), eighteen European
languages with summary tables and an appendix table for transmitting English phonemes.

The catch is the indexing. ru.wikipedia's *англо-русская практическая транскрипция* — the
most convenient consolidated form, and CC BY-SA — is a three-column table:
**Орфография** (the English letter sequence), **Произношение в RP** (IPA), **Передаётся
по-русски**. The primary key is spelling, but the IPA column is right there, and the
projection we want is columns two-to-three. A cheap adaptation, not an invention.

Stress: the acute **знак ударения** is Russian's native device and the official
orthography rules prescribe it in dictionary headwords and "в текстах, предназначенных
для изучающих русский язык как иностранный" — exactly this register. It is more idiomatic
than all-caps, which Russian typography does not use for intra-word emphasis. But it is a
mark at 5.2pt italic muted, and Cyrillic has case. The tiebreak is that Russian
lexicography *already documents the fallback*: "if the acute accent sign is unavailable
for technical reasons, stress can be marked by making the vowel capitalized or italic".
So `мер-си́` is the default and `мэр-СИ` is the sanctioned low-light alternative, and this
is the clearest place in the survey to ship the choice as a control.

Length: Russian has no vowel length contrast to borrow, so any length notation is
invented. Doubling is the least surprising choice; mark it as invented.

Licensing splits by tier: Article 1259(6) of the Russian Civil Code excludes "официальные
документы государственных органов… иные материалы законодательного, административного и
судебного характера", and a ГУГК instruction is administrative. Гиляревский & Старостин
is an in-copyright book; ru.wikipedia's tables are CC BY-SA.

Sources: [Англо-русская практическая транскрипция](https://ru.wikipedia.org/wiki/%D0%90%D0%BD%D0%B3%D0%BB%D0%BE-%D1%80%D1%83%D1%81%D1%81%D0%BA%D0%B0%D1%8F_%D0%BF%D1%80%D0%B0%D0%BA%D1%82%D0%B8%D1%87%D0%B5%D1%81%D0%BA%D0%B0%D1%8F_%D1%82%D1%80%D0%B0%D0%BD%D1%81%D0%BA%D1%80%D0%B8%D0%BF%D1%86%D0%B8%D1%8F) ·
[index of the per-language ГУГК instructions](https://arhiiv.eki.ee/knab/kbcyryl3.htm) ·
[Гиляревский & Старостин, 1985 (URSS)](https://urss.ru/cgi-bin/db.pl?lang=Ru&blang=ru&page=Book&id=106062) ·
[Знак ударения, Правила русской орфографии и пунктуации (Грамота.ру)](https://gramota.ru/biblioteka/spravochniki/pravila-russkoy-orfografii-i-punktuatsii/znak-udareniya) ·
[the same in Лопатин's academic reference](http://orthographia.ru/orfografia.php?sid=62) ·
[Stress (linguistics), for the capitalise-or-italicise fallback](https://en.wikipedia.org/wiki/Stress_(linguistics)) ·
[ГК РФ ст. 1259](https://www.consultant.ru/document/cons_doc_LAW_64629/be05678dc42ddc67aae5be9ba9beebd367fb9a3f/).

### Chinese, Simplified (`zh-Hans`) — take the inventory, emit pinyin

Three traditions; take the sound inventory from the official one and the notation from
none of them.

**The official one** is the 译音表 appended to the 世界人名翻译大辞典, compiled by Xinhua's
译名室 (1993, revised 2007), plus the national standard series **GB/T 17693 《外语地名汉字
译写导则》**, with a part per source language — .1 English, .2 French, .3 German, .4
Russian, .5 Spanish, .6 Arabic, .7 Portuguese, on through Japanese at .10. The tables are
consonant × vowel matrices whose cells hold a Chinese character: /b/ + /ɑː/ → 巴,
/b/ + /iː/ → 比, /b/ + /uː/ → 布. A respelling, with a deliberately restricted inventory of
semantically neutral graphs, notes telling you to substitute homophones where a literal
meaning intrudes, and a separate set reserved for female names. On the IPA question the
dictionary's own account is exact and favourable: the tables are generally laid out by
each language's Latin spelling, **but English is laid out by IPA because English
pronunciation is irregular.**

**The popular one** is 谐音 — writing a foreign phrase with characters read as homophones,
which is what every Chinese travel phrasebook does: ありがとう as 阿里嘎脱, さようなら as
撒腰那拉, こんにちは as 口你七哇. Chinese sources note its limits themselves: 谐音 cannot
express long vowels, gemination or 拗音.

**Emit Hanyu Pinyin instead.** In order of weight:

1. **The syllable inventory is identical**, so nothing is lost. A 译音表 cell and a 谐音
   character are both just a Mandarin syllable; pinyin writes the same syllable without
   the character's semantic freight, and can be pushed slightly *past* Mandarin
   phonotactics (`mer`, `set`, `bur`), which characters cannot.
2. **Capitals come back.** Pinyin is Latin, so `mair-SEE` transfers with no new device
   invented. This is the only way any of the six caseless sources gets stress marking.
3. **It is the legally designated tool for exactly this job.** Article 18 of the
   国家通用语言文字法 (2001) makes the 汉语拼音方案 the state's "拼写和注音工具" — spelling
   *and phonetic-annotation* tool — and requires pinyin be taught in primary education;
   the 义务教育语文课程标准 puts it in grade one.
4. **It is narrower and it breaks.** Pinyin sets in the condensed Latin face at a 4.4pt
   floor rather than the CJK stack's 5.0, and the corpus's hyphens are break
   opportunities.

The honest cost: 谐音 is what a Chinese reader *expects* in a phrasebook, so pinyin will
read as schoolroom rather than street. Worth exposing as a per-source option; worth
defaulting to pinyin regardless. This is also a mainland-reader decision — a 注音符號
reader would not be served by it.

Licensing needs care. The 世界人名翻译大辞典 is a commercial book; do not copy its tables.
Article 5 of China's Copyright Law excludes laws, regulations and the "resolutions,
decisions and orders of state organs and other documents of a legislative, administrative
or judicial character", which plainly covers the 国家通用语言文字法 and the 汉语拼音方案;
whether a *recommended* national standard (GB/T, as against a mandatory GB) falls inside
that exclusion is contested and was not resolved — **unverified**. The safe route is what
we would want anyway: derive our own IPA→pinyin-syllable table from the phonetics, cite
GB/T 17693 and the zh.wikipedia tables as the cross-check, copy neither.

Sources: [世界人名翻译大辞典 (zh.wikipedia), incl. the "English is by IPA" statement](https://zh.wikipedia.org/zh-hans/%E4%B8%96%E7%95%8C%E4%BA%BA%E5%90%8D%E7%BF%BB%E8%AD%AF%E5%A4%A7%E8%BE%AD%E5%85%B8) ·
[Wikipedia:外語譯音表/英語 — the IPA × IPA matrix](https://zh.wikipedia.org/wiki/Wikipedia:%E5%A4%96%E8%AA%9E%E8%AD%AF%E9%9F%B3%E8%A1%A8/%E8%8B%B1%E8%AA%9E) ·
[中文译名, for the GB/T 17693 part list](https://zh.wikipedia.org/zh-hans/%E4%B8%AD%E6%96%87%E8%AF%91%E5%90%8D) ·
[GB/T 17693.5-2009 西班牙语](http://guifan.ocsyun.com/ocsstandardinfo/info_462992) ·
[GB/T 17693.10-2019 日语](https://ndls.org.cn/standard/detail/8c7eedff9191928f188d58f021b5ca75) ·
[国家通用语言文字法, Art. 18](http://www.npc.gov.cn/npc/c2/c30834/202512/t20251227_450731.html) ·
[汉语拼音方案 (教育部)](http://www.moe.gov.cn/jyb_sjzl/ziliao/A19/195802/t19580201_186000.html) ·
[日语常用句中文谐音, an example of the popular practice](https://zhuanlan.zhihu.com/p/258598818) ·
[常用泰语100句（中文+泰文拼音+谐音+英文对照版）](https://www.nihaohaizi.com/thread-612-1-1.html) ·
[著作权法 (最高人民法院知识产权法庭)](https://ipc.court.gov.cn/zh-cn/news/view-405.html).

### Thai (`th`) — an official standard that does the opposite of what we need

**หลักเกณฑ์การทับศัพท์** are announcements of the Prime Minister's Office published in the
Royal Gazette: English in vol. 106 pt. 153, 14 September 1989, and French, German,
Italian, Spanish, Russian, Japanese, Arabic and Malay together in vol. 109 pt. 56, 1 May
1992. A real standard, per source language, government-issued and freely usable — and of
everything here the least suited to the job.

Rule 1 states the goal outright: transcription shall transliterate the letters of the
original language sufficiently to *show the origin of the word form*, and be written in a
form that reads conveniently in Thai. Provenance, then convenience; sound is not in the
sentence. The mechanics follow: the consonant table's left column is **English letters**,
not IPA; **rule 3.1** puts ทัณฑฆาต, the killer mark, over consonants not pronounced in
Thai — writing letters down in order to visibly silence them, which is the purest
transliteration behaviour available; and **rule 5** omits tone marks unless the result
would collide with an existing Thai word (*coma* → โคม่า, to stay clear of โคมา).

Rule 5 is the fatal one, and not merely because tone is missing. **A Thai syllable cannot
be toneless.** Tone is fully determined by consonant class (mid, high, low), tone mark,
vowel length and whether the syllable is live or dead, and the mapping is deterministic.
So declining to write a tone mark does not produce a neutral reading; it produces
whichever tone the chosen consonant's class dictates. A rule set for Thai readers must
choose consonant letters and tone marks *together and on purpose* — more work than any
other language here, and it cannot be delegated to the standard.

That is also where Thai gets its stress device. Since tone is unavoidable, use it: give
the stressed syllable of a stress-language target a mark landing on a high or falling
tone and let the unstressed syllables sit at mid. Thai learner material does this in
practice, and assigning tones to loanwords from non-tonal languages is a studied
phenomenon rather than folk practice. Capitals are unavailable; Thai has no case. Length
is free — short and long vowels use different, mostly full-size vowel symbols.

Licensing is clean: Section 7 of Thailand's Copyright Act excludes "regulations, bylaws,
notifications, orders, explanations and official correspondence of the Ministries,
Departments or any other government or local units", and separately excludes "facts
having the character of mere information".

Sources: [หลักเกณฑ์การทับศัพท์ของราชบัณฑิตยสถานและสำนักงานราชบัณฑิตยสภา](https://th.wikipedia.org/wiki/%E0%B8%AB%E0%B8%A5%E0%B8%B1%E0%B8%81%E0%B9%80%E0%B8%81%E0%B8%93%E0%B8%91%E0%B9%8C%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%97%E0%B8%B1%E0%B8%9A%E0%B8%A8%E0%B8%B1%E0%B8%9E%E0%B8%97%E0%B9%8C%E0%B8%82%E0%B8%AD%E0%B8%87%E0%B8%A3%E0%B8%B2%E0%B8%8A%E0%B8%9A%E0%B8%B1%E0%B8%93%E0%B8%91%E0%B8%B4%E0%B8%95%E0%B8%A2%E0%B8%AA%E0%B8%96%E0%B8%B2%E0%B8%99%E0%B9%81%E0%B8%A5%E0%B8%B0%E0%B8%AA%E0%B8%B3%E0%B8%99%E0%B8%B1%E0%B8%81%E0%B8%87%E0%B8%B2%E0%B8%99%E0%B8%A3%E0%B8%B2%E0%B8%8A%E0%B8%9A%E0%B8%B1%E0%B8%93%E0%B8%91%E0%B8%B4%E0%B8%95%E0%B8%A2%E0%B8%AA%E0%B8%A0%E0%B8%B2) ·
[the 1989 English criteria (orst.go.th PDF)](http://legacy.orst.go.th/wp-content/uploads/2015/03/%E0%B8%AB%E0%B8%A5%E0%B8%B1%E0%B8%81%E0%B9%80%E0%B8%81%E0%B8%93%E0%B8%91%E0%B9%8C%E0%B8%97%E0%B8%B1%E0%B8%9A%E0%B8%A8%E0%B8%B1%E0%B8%9E%E0%B8%97%E0%B9%8C%E0%B8%AD%E0%B8%B1%E0%B8%87%E0%B8%81%E0%B8%A4%E0%B8%A92532.pdf) ·
[the Royal Gazette citation (Parliament library)](https://dl.parliament.go.th/handle/20.500.13072/135199) ·
[the 1992 announcement (Thai Wikisource)](https://th.wikisource.org/wiki/%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B8%81%E0%B8%B2%E0%B8%A8%E0%B8%AA%E0%B8%B3%E0%B8%99%E0%B8%B1%E0%B8%81%E0%B8%99%E0%B8%B2%E0%B8%A2%E0%B8%81%E0%B8%A3%E0%B8%B1%E0%B8%90%E0%B8%A1%E0%B8%99%E0%B8%95%E0%B8%A3%E0%B8%B5_%E0%B9%80%E0%B8%A3%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%87_%E0%B8%AB%E0%B8%A5%E0%B8%B1%E0%B8%81%E0%B9%80%E0%B8%81%E0%B8%93%E0%B8%91%E0%B9%8C%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%97%E0%B8%B1%E0%B8%9A%E0%B8%A8%E0%B8%B1%E0%B8%9E%E0%B8%97%E0%B9%8C%E0%B8%A0%E0%B8%B2%E0%B8%A9%E0%B8%B2%E0%B8%9D%E0%B8%A3%E0%B8%B1%E0%B9%88%E0%B8%87%E0%B9%80%E0%B8%A8%E0%B8%AA_%E0%B8%AF%E0%B8%A5%E0%B8%AF_%E0%B8%A1%E0%B8%A5%E0%B8%B2%E0%B8%A2%E0%B8%B9) ·
[rules 3 and 5 restated (th.wikipedia MoS)](https://th.wikipedia.org/wiki/%E0%B8%A7%E0%B8%B4%E0%B8%81%E0%B8%B4%E0%B8%9E%E0%B8%B5%E0%B9%80%E0%B8%94%E0%B8%B5%E0%B8%A2:%E0%B8%84%E0%B8%B9%E0%B9%88%E0%B8%A1%E0%B8%B7%E0%B8%AD%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%80%E0%B8%82%E0%B8%B5%E0%B8%A2%E0%B8%99/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%97%E0%B8%B1%E0%B8%9A%E0%B8%A8%E0%B8%B1%E0%B8%9E%E0%B8%97%E0%B9%8C%E0%B8%A0%E0%B8%B2%E0%B8%A9%E0%B8%B2%E0%B8%AD%E0%B8%B1%E0%B8%87%E0%B8%81%E0%B8%A4%E0%B8%A9) ·
[Thai tone rules, deterministic from four inputs](http://www.thai-language.com/ref/tone-rules) ·
[a study of tone assignment in Thai loanwords (วารสารศิลปศาสตร์ มธ.)](https://so03.tci-thaijo.org/index.php/liberalarts/article/view/64200) ·
[Copyright Act B.E. 2537, s. 7 (DIP Thailand)](https://www.ipthailand.go.th/images/3534/2564/Copyright/Copyright_Act_ENG.pdf).

## The seven to invent

Three of these — Portuguese, Indonesian and Swahili — are cheap, because the orthography
is nearly phonemic, and Merriam-Webster's own *Guide to Pronunciation* makes the argument
in passing: "For some languages, such as Spanish, Swahili, and Finnish, the
correspondence between orthography and pronunciation is so close that a dictionary need
only spell a word correctly to indicate its pronunciation." The other four — French,
German, Arabic and Hindi — are expensive, because the reader's own spelling rules apply
themselves and overrule a naive substitution.

### Portuguese (`pt`) — no notation, good letters, and a genuine two-way fork

Portuguese lexicography offers nothing to borrow. Michaelis gives **IPA**, including for
loanwords, and gives the *source*-language pronunciation rather than a Brazilianised one
(*croissant* `[kʀwaˈsɑ̃]`) — the opposite of what this column needs — and it is
copyrighted. Priberam gives **no transcription at all**: what looks like pronunciation is
syllable division with mid-dots (`o·bri·ga·do`), and its help pages contain no mention of
*pronúncia* or *fonética*. Infopédia gives only a TTS audio link. Houaiss, Aulete, the
Academia das Ciências de Lisboa dictionary and the ABL's *VOLP* are **unverified**. There
is **no Portuguese counterpart to the DPD** — that is a finding held with moderate
confidence rather than exhaustively verified, and *"pronúncia figurada"* as an attested
Portuguese term is **unverified**.

What Portuguese does have is the best grapheme inventory of any Latin-script source here:

| Sound | Write | Note |
|---|---|---|
| /ʃ/ | `x` | Natively /ʃ/, and the RAE cites Portuguese `xerife` ← *sheriff*, `gueixa` ← *geisha*; `Xangai` ← Shanghai. Prefer `x` over `ch`, which risks an English reading |
| /ʒ/ | `j` | native |
| /dʒ/ | `dj` | pt-BR readers also get it free from `di` |
| /tʃ/ | `tch` | `ch` is /ʃ/ |
| /ɲ/ /ʎ/ | `nh` `lh` | native — so a real /nh/ or /lh/ cluster cannot be written naively |
| /h/ | `r`/`rr` in **pt-BR** | word-initial `r` and `rr` are [h~x] in most of Brazil. A genuinely useful Brazilian resource that pt-PT does not share |
| /s/ | `ss` or `ç` | single `s` between vowels voices to [z] |
| open/close vowels | `á é ó` / `â ê ô` | the accent encodes quality *and* stress in one mark |
| nasal vowels | `ã õ` | the tilde is native — which makes Portuguese the best-equipped source in the survey for French and Vietnamese targets |

**pt-PT and pt-BR are a real fork, not an accent knob.** `ti` is read *tchi* by a
Brazilian and *ti* by a Portuguese reader; final `-l` is [w] in pt-BR (`mal` → [maw]);
final `-e` is [i] in pt-BR and reduced or dropped in pt-PT, so the French trick of adding
a final `e` to prop up a consonant does not transfer — it buys a spurious /i/; final `-s`
is [ʃ] in pt-PT and [s] in pt-BR; word-initial `r` is [h~x] in pt-BR and [ʁ] in pt-PT;
and unstressed-vowel reduction is far stronger in pt-PT (unstressed `e` → [ɨ] or zero,
`o` → [u]). Budget two rule sets or declare a variety. The `accent` key in the filename
already supports this.

Stress: the acute or circumflex on the stressed vowel, chosen by target vowel quality.
No evidence was found of a Portuguese capitals-for-stress tradition — **unverified**, and
not worth introducing. Length is not phonemic; omit it.

pt.wikipedia's `Wikipédia:Alfabeto fonético internacional` is CC BY-SA and gives prose
analogies to Portuguese sounds per IPA symbol, falling back to English, French, German
and Spanish examples for what Portuguese lacks. Weaker than es.wikipedia's
"Aproximación" columns, but usable seed material.

Sources: [Michaelis, *show*](https://michaelis.uol.com.br/busca?r=0&f=0&t=0&palavra=show) and [*croissant*](https://michaelis.uol.com.br/busca?r=0&f=0&t=0&palavra=croissant) ·
[Priberam, *obrigado*](https://dicionario.priberam.org/obrigado) and [Como consultar](https://dicionario.priberam.org/consultar.aspx) ·
[Infopédia, *obrigado*](https://www.infopedia.pt/dicionarios/lingua-portuguesa/obrigado) ·
[Portuguese orthography](https://en.wikipedia.org/wiki/Portuguese_orthography) ·
[RAE *Ortografía*, on `xerife` and `gueixa`](https://www.rae.es/ortograf%C3%ADa/extranjerismos-crudos) ·
[Wikipédia:Alfabeto fonético internacional](https://pt.wikipedia.org/wiki/Wikip%C3%A9dia:Alfabeto_fon%C3%A9tico_internacional) ·
[Lepri, on pt-PT final `-s` and unstressed `o`](https://www.sergiolepri.it/consigli-pratici-per-la-grafia-e-la-pronunzia-di-lingue-straniere/).

### French (`fr`) and German (`de`) — IPA-only, and the traps do the work

Both confirmed. **TLFi** uses IPA (*merci* → `[mεʀsi]`), and the *Académie française*'s
9th edition entry retrieved gave etymology and definition with **no pronunciation at
all** (generalising that to the whole dictionary is **unverified**, though consistent
with known practice). Le Petit Robert and Larousse online are **unverified** — 403 and a
wrong entry respectively. **Duden's own help page** states pronunciation is given "in
Lautschrift using the character system of the International Phonetic Association (IPA)",
and documents its length convention: a colon applies to the vowel immediately before it,
`Chrom [kroːm]`. The German Wikipedia's *Lautschrift* article says IPA is "das in den
meisten Wörterbüchern sowie auch in der Wikipedia verwendet wird" and names only
Teuthonista — a dialectologist's notation — as an alternative. Neither de.wikipedia nor
fr.wikipedia has a respelling convention: `Hilfe:IPA` redirects to `Vorlage:IPA`, a bare
display span; French `Aide:API` redirects to *Aide:Interface de programmation*, and
`Modèle:Prononciation` inserts an **audio file**, not a text respelling.

The one French tradition worth pointing at is dead but real: Pierre Larousse's 1856
*Nouveau dictionnaire de la langue française* carried a ten-page *Dictionnaire de la
prononciation figurée* (`bourg` → *bourk*, `cep` → *cè*), folded into the main entries
from 1878 so that the *Nouveau Larousse illustré* carries them inline. That is a French
respelling, sound-keyed — **specifics unverified**, from search results rather than
fetched pages. And the *Kauderwelsch* series, which the brief suspected of a documented
German respelling, does not confirm it: the one readable front-matter sample (Laotian)
uses **magenta type**, a **colon for length**, six tone marks, `kh/ph/th` against `k/p/t`
with an explicit instruction to German speakers to suppress their aspiration — and
non-German letters `ɛ œ y`, so it is a German-oriented IPA hybrid rather than a
German-orthography respelling. Whether the European volumes use something plainer, and
whether stress is marked at all, are **unverified**. It is commercial with no published
key, so it could not be faithfully encoded even setting copyright aside.

**German traps, in order of damage.** German is expensive despite being Latin-script and
phonemically shallow, because the map is almost entirely *substitution away from the
obvious letter*:

| Trap | What a naive respelling gets | Fix |
|---|---|---|
| syllable-initial `s` before `p`/`t` is /ʃ/ | `stop` → [ʃtɔp] | use `ß`/`ss`, or break the syllable (`s-top`) |
| `s` before a vowel is /z/ | `sam` → [zam] | write /s/ as `ss` or `ß` |
| `v` is /f/ in native words and /v/ in loans | ambiguous either way | **never emit `v`** — `w` for /v/, `f` for /f/ |
| `w` is /v/ | `wain` → [vaɪn] | write /w/ as `u` before a vowel |
| `z` is /ts/ | `zoo` → [tsoː] | write /z/ as `s` |
| `ch` is /x/ or /ç/, never /tʃ/ | `chek` → [çɛk] | /tʃ/ = `tsch`, /dʒ/ = `dsch`, /ʃ/ = `sch`, /ʒ/ = `j` |
| post-vocalic `h` is silent and lengthens | `aha` → [aːa] | **`h` only syllable-initially, never post-vocalically** — this is the collision the brief flagged, and it is severe, because `h` is simultaneously the best glyph for /h/ and a length marker |
| `ie` is /iː/, `ei` is /aɪ/, `eu`/`äu` is /ɔʏ/ | `mei` for /meɪ/ → [maɪ] | /eɪ/ as `eh`; use `ie` for /iː/ deliberately |
| `qu` is /kv/ | never emit `qu` | `kv` or `kw` |
| Auslautverhärtung devoices final `b d g` | `-d` reads [t] | write the voiceless letter; final voicing is unobtainable |
| post-vocalic `r` vocalises to [ɐ] | a benefit for non-rhotic targets, a problem for rhotic ones | accept |

Assets: `sch tsch dsch ng ü ö` all work, and phonemic length is native. Cleanest scheme —
**`ie` for /iː/, doubling for other long vowels, `h` reserved exclusively for /h/** — one
job per glyph. Capitals are the wrong stress device for German: German capitalises every
noun's initial, so a reader scanning `guh-TEN TAHK` has to sort grammatical capitals from
prosodic ones. Prefer Duden's own Unterpunkt and Unterstrich, which carry stress and
length in one mark and which German readers were taught, and treat their survival at
5.2pt (combining U+0323 / U+0331) as a thing to prototype rather than assume.

**French traps are fewer and worse**, because two are unconditional:

| Trap | What a naive respelling gets | Fix |
|---|---|---|
| any vowel before `n`/`m` in the same syllable nasalises | `kan` → [kɑ̃], not [kan] | double the nasal (`kann`), add a following vowel, or place the syllable hyphen after the nasal (`ka-na`). **Hyphenation and nasalisation are coupled** — the syllabifier is not cosmetic in French |
| final consonants are silent | `mert` → [mɛr] | add a final `e` (costs a schwa), or use one of the finals that *are* pronounced — `c r f l`, the "CaReFuL" set. No cost-free option; the trailing schwa is usually the lesser evil because the reader still lands on the right consonant |
| `ou` = /u/, `u` = /y/, `oi` = /wa/ | `mur` for /mur/ → [myr] | /u/ is always `ou`; `oi` can never be /oɪ/ |
| `ill` = /ij/ | avoid entirely | `y` initially, `ï` after a vowel |
| `c`/`g` before *e,i* are /s/, /ʒ/; `qu` = /k/ | | /k/ = `k`, /ɡ/ = `gu` |
| single `s` between vowels = /z/ | | /s/ = `ss` |
| `ng` nasalises the preceding vowel | /ŋ/ unwritable naively | `ngg` or `nng` |
| `h` is silent | /h/ cannot be written at all | drop it, say so in the legend; `kh` for /x/ |
| French has no lexical stress | a capital carries no native meaning | capitals with a legend line — an acute would be misread as a vowel-quality change |

Sources: [TLFi, *merci*](https://www.cnrtl.fr/definition/merci) ·
[Académie française, 9th ed.](https://www.dictionnaire-academie.fr/article/A9M1846) ·
[Aide:Alphabet phonétique international (fr.wikipedia)](https://fr.wikipedia.org/wiki/Aide:Alphabet_phon%C3%A9tique_international) ·
[Duden, Aussprache](https://www.duden.de/hilfe/aussprache) ·
[Lautschrift (de.wikipedia)](https://de.wikipedia.org/wiki/Lautschrift) ·
[Vorlage:IPA](https://de.wikipedia.org/wiki/Vorlage:IPA) ·
[Unterpunktakzent](https://de.wikipedia.org/wiki/Unterpunktakzent) ·
[Ayuda:AFI/Francés (es.wikipedia), as independent corroboration of the French reflexes](https://es.wikipedia.org/wiki/Ayuda:AFI/Franc%C3%A9s) ·
on the *prononciation figurée*: [books.openedition.org/pum/10529](https://books.openedition.org/pum/10529?lang=fr), [Nouveau Larousse illustré scans](https://fr.wikisource.org/wiki/Nouveau_Larousse_illustr%C3%A9/1898/A) ·
[the Kauderwelsch Laotisch front matter](https://download.e-bookshelf.de/download/0009/8790/91/L-X-0009879091-0019787235.XHTML/index.xhtml) ·
[Reise Know-How's product pages, which do not publish the key](https://www.reise-know-how.de/de/produkte/kauderwelsch-buch/katalanisch-wort-fuer-wort-69165).
Duden Band 6's own wording on IPA subsetting could not be verified from a legitimate
source — **unverified**. Langenscheidt, Wahrig, PONS and the DAWB are **unverified**.
Note also that the **Duden-Transkription** for Cyrillic is a German-sound-based mapping
but a *transliteration*, spelling-in and spelling-out, so it is not an engine.

### Arabic (`ar`) — no table, but the shape is already policy

The tradition is sound-based and says so: التعريب is defined as *"رسمُ لفظةٍ أجنبيةٍ
بحروفٍ عربية"* — drawing a foreign word with Arabic letters — with Ibn Khaldūn's method
of bracketing an unfamiliar consonant between the two nearest Arabic ones. But the
academies' output is nativisation: the same source's first sense of التعريب is fitting a
foreign name to Arabic *موازين*. The one attempt at a transcription decision failed — the
Cairo Academy's committee on sounds Arabic lacks proposed the Persian kāf **گ** for
non-affricated /ɡ/, the council approved it, and the decision *"لم ينفذ"*: never
implemented, no unification followed. ALECSO's Rabat bureau coordinates *terminology*
only; its own guide PDF failed on a self-signed certificate, so its contents are
**unverified**. The Damascus Academy coins terms from classical lexica; whether it has
ever issued transcription rules is **unverified**. Practitioners describe the state of
affairs as *"غياب القاعدة الحاكمة"*, the absence of a governing rule.

**What can be borrowed is the shape.** ar.wikipedia's adopted policy
ويكيبيديا:استخدام حروف غير عربية bans non-Arabic letters and harakat in article *titles*
but permits `پ چ ژ گ ڤ ڠ` in body text *"لتوضيح اللفظ"* — **only inside parentheses
following the word being clarified**. A parenthetical, extended-letter,
pronunciation-only rendering, walled off from the real spelling. The naming-conventions
policy illustrates the same with *"Thermometer تُعَرّب إلى ثِرْمُومِتْر"* — fully vocalised —
and the Shakespeare article opens **وِلْيَمْ شكسبير (William Shakespeare)**. A companion
*خاطرة* (essay, explicitly not policy) tries to build the full letter table and leaves
question marks in its vowel rows. Nobody has finished this job.

**Harakat are the natural device and the expensive one.** Ordinary Arabic runs
unvocalised; full vocalisation is the marked, pedagogical register — Qur'an, poetry,
children's books — and "some Arabic textbooks for foreigners now use ḥarakāt as a
phonetic guide". W3C's `alreq` confirms it: "In Arabic script text it is unusual to use
diacritics for vowel information and for consonant lengthening." So a fully vocalised
respelling reads unmistakably as a pronunciation guide. The cost is purely typographic —
`Arab` at `min_size_pt` 5.4, `leading_factor` 1.30, no condensed face, and harakat are
small marks stacked above and below a cursive script. **Write long vowels with `ا و ي`
always, and make harakat the "on" position of the length switch.**

Three Arabic-specific corrections to the general design:

- **No hyphens.** Arabic is not hyphenated — `alreq` §7.1 says text that does not fit is
  "wrapped to the next line between words" — and a hyphen breaks the cursive join. So
  `mair-SEE` is not merely unidiomatic in Arabic, it is visually wrong. Use a thin space
  or no divider, and let the sukūn and harakat carry the syllabification. This is the one
  source language where the project's hyphen convention must be suspended.
- **No mid vowels.** Kasra is /i/, ḍamma is /u/, and long /eː oː/ are written with `ي`
  and `و`. *Merci* becomes مِرْسِي, read *mirsī*. Every /e/ and /o/ in every target is lost
  or distorted; this is the quality ceiling for Arabic and no rule set fixes it. Readers
  also over-lengthen — "when transliterating names and loanwords, Arabic language
  speakers write out most or all the vowels as long" — so a naive mapping produces
  all-long output.
- **No onset clusters**, so epenthesis (`/ʔi/` initially, `/i/` after a consonant-final
  word) is compulsory and changes the syllable count.

**The extended letters are a regional bet, and a worse one than it looks.** `پ` /p/ and
`ڤ` /v/ are the safest and are conventionally used for foreign names. `گ` is not: /ɡ/ has
competing letters by region — `گ` in Iraq and parts of the Levant, `ݣ`/`ڭ` in Morocco,
`ڨ` in Tunisia and Algeria — while MSA otherwise falls back on `ج غ ق ك`. `چ` is worse: it
is used in Egypt for /(d)ʒ/ but is /tʃ/ in Gulf and Mesopotamian Arabic, so one glyph
means two phonemes depending on the reader. `ڤ` competes with `ڥ` in Tunisia and Algeria,
where `ڨ` is needed for /ɡ/. And plain `ج` is /ɡ/ in Egypt against /ʒ/ in the Levant and
Maghreb. **Use `پ` and `ڤ`, always with the plain-letter fallback beside them, and
region-gate or avoid `گ` and `چ`.** Which letters a general reader in each pack's region
actually accepts is **unverified** and is a reviewer question rather than a search
question.

Stress: MSA stress is weight-governed and not meaning-bearing — *"في العربية لا يغيِّر
النبر المعنى، لكنه يساعد السامع على الفهم"* — so a faithful vocalisation places it by the
reader's own rules. Where the foreign stress contradicts those rules there is no device:
no case, and every slot above and below the letter is occupied by harakat. Teaching
materials reportedly use colour and typographic weight, which the renderer cannot do
inside a cell. Accept that Arabic gets no stress marking.

Sources: [تعريب (لغة)](https://ar.wikipedia.org/wiki/%D8%AA%D8%B9%D8%B1%D9%8A%D8%A8_(%D9%84%D8%BA%D8%A9)) ·
[Al Jazeera Learning Arabic, on the Cairo Academy's unimplemented گ decision](https://learning.aljazeera.net/en/node/21998) ·
[ALECSO's مكتب تنسيق التعريب](https://www.alecso.org/nsite/ar/%D9%85%D9%83%D8%AA%D8%A8-%D8%AA%D9%86%D8%B3%D9%8A%D9%82-%D8%A7%D9%84%D8%AA%D8%B9%D8%B1%D9%8A%D8%A8-%D8%A8%D8%A7%D9%84%D8%B1%D8%A8%D8%A7%D8%B7) ·
[ويكيبيديا:استخدام حروف غير عربية](https://ar.wikipedia.org/wiki/%D9%88%D9%8A%D9%83%D9%8A%D8%A8%D9%8A%D8%AF%D9%8A%D8%A7:%D8%A7%D8%B3%D8%AA%D8%AE%D8%AF%D8%A7%D9%85_%D8%AD%D8%B1%D9%88%D9%81_%D8%BA%D9%8A%D8%B1_%D8%B9%D8%B1%D8%A8%D9%8A%D8%A9) ·
[ويكيبيديا:تسمية المقالات](https://ar.wikipedia.org/wiki/%D9%88%D9%8A%D9%83%D9%8A%D8%A8%D9%8A%D8%AF%D9%8A%D8%A7:%D8%AA%D8%B3%D9%85%D9%8A%D8%A9_%D8%A7%D9%84%D9%85%D9%82%D8%A7%D9%84%D8%A7%D8%AA) ·
[Arabic diacritics — harakat as a phonetic guide](https://en.wikipedia.org/wiki/Arabic_diacritics) ·
[W3C alreq — the vocalisation register and Arabic line breaking](https://www.w3.org/TR/alreq/) and [w3c/alreq #108](https://github.com/w3c/alreq/issues/108) ·
[Arabic phonology](https://en.wikipedia.org/wiki/Arabic_phonology) ·
[نبر — stress does not change meaning](https://ar.wikipedia.org/wiki/%D9%86%D8%A8%D8%B1) ·
[Arabic alphabet](https://en.wikipedia.org/wiki/Arabic_alphabet), [Gaf](https://en.wikipedia.org/wiki/Gaf), [Ve](https://en.wikipedia.org/wiki/Ve_(Arabic_letter)), [Varieties of Arabic](https://en.wikipedia.org/wiki/Varieties_of_Arabic) ·
[Help:IPA/Arabic, a usable seed for Arabic's own phonemes](https://en.wikipedia.org/wiki/Help:IPA/Arabic).
The one system that does exactly what we want — Kalmasoft's MOLTRANS, which "transfers
names phonetically (as pronounced)", pivots through IPA and outputs vocalised Arabic
(`أرْكادِي`) — is [commercial](https://www.kalmasoft.com/KMAPS/amoltrns.htm) and not usable.

### Hindi (`hi`) — follow the dictionaries, against the standard

Hindi has both a government standard and a real respelling tradition, and they point in
opposite directions. **Follow the tradition.**

**The standard.** «देवनागरी लिपि तथा हिंदी वर्तनी का मानकीकरण», केंद्रीय हिंदी निदेशालय,
Ministry of Education, revised edition **2024**, marked `© भारत सरकार` and `निःशुल्क`;
the 2003 seminar version was promulgated as **IS 16500:2012**. Its §3.15 *आगत शब्द* is
two paragraphs, and it gives us one thing and takes another away:

- **§3.15.2 prescribes `ऑ`** for English /ɒ/ — *"…उनके शुद्ध रूप का हिंदी में प्रयोग
  अभीष्ट होने पर 'आ' की मात्रा के ऊपर अर्धचंद्र ( ॅ ) का प्रयोग किया जाए, जैसे—कॉलेज, हॉल,
  मॉल, टॉकीज, ऑफिस"* — and gives `ऑ` formal status under §2.1.4 *आगत चिह्न*. It also
  states the fidelity aspiration outright: *"सभी विदेशी भाषाओं से आगत शब्दों का देवनागरी
  लिप्यंतरण यथासंभव विदेशी भाषाओं के मानक उच्चारण के अधिक से अधिक निकट होना चाहिए।"* An
  aspiration with no mechanism.
- **§3.15.1 says to drop the nuqta**, and the 2024 edition *deleted the escape clause*.
  IS 16500 §2.14.1 had one — nuqta may be used *"जहाँ उनका शुद्ध विदेशी रूप में प्रयोग
  अभीष्ट हो"*, with `खाना : ख़ाना`, `राज : राज़`, `फन : फ़न`. The 2024 text replaces it
  with *"नुक्ता हिंदी में प्रचलित नहीं है। अतः, देवनागरी की मूल हिंदी वर्णमाला में नुक्ते
  को नहीं रखा जाना चाहिए।"* and confines `क़ ख़ ग़ ज़ फ़` to a *परिवर्धित देवनागरी* table
  under Urdu.
- **`ऍ` for /æ/ is absent**, not deprecated — it appears only in the extended table under
  Kashmiri. And Hindi phonology settles the `बैंक` question: English /æ/ is nativised as
  /æː/ and written `ऐ` (`बैट` for /bæːʈ/). `बैंक` is right.
- The standard also carries a 1962 Terminology Commission instruction *against inventing
  new diacritics*, which is worth knowing before proposing any.

**Follow practice on the nuqta anyway**, and the reason is phonological rather than
contrarian: /f/ and /z/ are established in educated Hindi, while /q x ɣ/ are converted to
/k kʰ g/ and /ʒ/ is "very rare and… considered to fall under the domain of Urdu". So
**`फ़` and `ज़` carry real information and every real respelling source uses them, while
`क़ ख़ ग़` do not.** Hindi Wikipedia's own naming conventions flatly contradict the
standard — *"लेख का नाम नुक्तायुक्त सही वर्तनी में लिखा जाना चाहिये"*.

**The real tradition is in the dictionaries, and it is a complete respelling.**
**Bhargava's *Standard Illustrated Dictionary (Anglo-Hindi)*, 12th ed. 1973**, subtitled
"Comprising correct pronunciation and accents in Devanagari script": `Academy —
ॲ-कॅड्'-ऍ-मि`, `Algebra — ऍल्'-जॅ-ब्रॅ`, `Alibi — ऍल्'-इ-बाइ`. Hyphens divide syllables,
a superscript prime marks stress, the candra family carries the English vowels, final
consonants take halant, and a four-word legend runs at the foot of every page. Every
design decision this column needs, already made and printed. At the other end,
**Rapidex English Speaking Course (Hindi)** — the book an ordinary reader has actually
met — respells with no stress marks, no hyphens and no final halant, relying on automatic
final-schwa deletion (`फ़ेमस`, `स्टमक`, `हाउसहोल्ड`, `डिसाइपल`), maps both V and W to `व`,
and names the aspiration problem before declining to notate it. Both are commercial:
reuse the method, not the word lists. The CC-0 stamp on the 1973 Bhargava scan is a
digitiser's claim and doubtful for a 1973 commercial work.

Traps. Devanagari is unicameral, so capitals are impossible. Final schwa deletion
*helps* — write final consonants bare and omit the halant word-finally (the standard
warns against restoring lost halants), keeping conjuncts word-internally — but you then
cannot write a genuine final /ə/. Retroflex `ट ड` for English /t d/ against dental `त द`
for French and Spanish is a native phonemic contrast and therefore free; hi.wikipedia
already does it (`नोत्र दाम`, `ओलांद`, `व्लादिमीर`, against `एफ़िल टावर`). `व` covers both
/v/ and /w/, so a device there would be inert. And the diphthong trap is the one that will
bite: **/aɪ/ must be `आइ` not `ऐ`, and /aʊ/ must be `आउ` not `औ`** — a naive Sanskritic
map reads those as [ɛː] and [ɔː]. For nasal vowels, candrabindu is the principled choice
(§2.6.0); anusvāra before a stop reads as a full nasal consonant, right for *bank*
(`बैंक` = [bæŋk]) and wrong for a bare French nasal.

Length is free for `अ/आ`, `इ/ई`, `उ/ऊ` — carrying quality as well as length, [ɪ] against
[iː] — and **impossible for /e/ and /o/**; the standard says so itself: *"दक्षिण भारतीय
भाषाओं एवं कश्मीरी में ह्रस्व 'ए' और 'ओ' उपलब्ध हैं किंतु देवनागरी में वे स्वनिमिक स्तर पर
उपलब्ध नहीं हैं"*. `ऎ`/`ऒ` exist and are sanctioned for South Indian languages, but their
glyphs are near-identical to `ए`/`ओ` at 5.4pt — accept the collapse. One warning about the
free seed material: hi.wikipedia's `विकिपीडिया:IPA for Spanish` has a
**निकटतम हिन्दी ध्वनि** column of about 36 rows (b→ब, θ→थ़, x→ख़, ɲ→न्य, t→dental त),
CC BY-SA and directly usable — but it over-lengthens all five Spanish vowels. Do not
replicate that; use `अ इ उ` for genuinely short vowels.

Typographically Hindi is the most expensive source in the set: `Deva` at `min_size_pt`
5.4 with the registry's highest `leading_factor`, 1.35, and no condensed face.

Sources: [«देवनागरी लिपि तथा हिंदी वर्तनी का मानकीकरण», 2024 (chd.education.gov.in PDF)](https://www.chd.education.gov.in/sites/default/files/devanagarilipiandhindivartanikamankikaran.pdf) and its [landing page](https://www.chd.education.gov.in/devanagari-lipi-tatha-hindi-vartani-manakikaran) ·
[the 1983 scan](https://archive.org/details/dli.language.1543) ·
[मानक हिंदी वर्तनी (hi.wikipedia), mirroring IS 16500:2012](https://hi.wikipedia.org/wiki/%E0%A4%AE%E0%A4%BE%E0%A4%A8%E0%A4%95_%E0%A4%B9%E0%A4%BF%E0%A4%82%E0%A4%A6%E0%A5%80_%E0%A4%B5%E0%A4%B0%E0%A5%8D%E0%A4%A4%E0%A4%A8%E0%A5%80) ·
[Bhargava's Standard Illustrated Dictionary (Anglo-Hindi), 1973](https://archive.org/details/rhuh_bhargavas-standard-illustrated-dictionary-of-the-english-language-anglo-hin) ·
[Rapidex English Speaking Course (Hindi)](https://archive.org/details/rapidex-english-speaking-course_202406) ·
[Hindustani phonology — /f z/ established, /q x ɣ/ converted, /æː/ written ऐ](https://en.wikipedia.org/wiki/Hindustani_phonology) ·
[Schwa deletion in Indo-Aryan languages](https://en.wikipedia.org/wiki/Schwa_deletion_in_Indo-Aryan_languages) ·
[Devanagari — unicameral, the mātrā length distinctions](https://en.wikipedia.org/wiki/Devanagari) ·
[विकिपीडिया:IPA for Spanish, with the निकटतम हिन्दी ध्वनि column](https://hi.wikipedia.org/wiki/%E0%A4%B5%E0%A4%BF%E0%A4%95%E0%A4%BF%E0%A4%AA%E0%A5%80%E0%A4%A1%E0%A4%BF%E0%A4%AF%E0%A4%BE:IPA_for_Spanish) ·
[A Systematic Review of Hindi Prosody (arXiv)](https://arxiv.org/pdf/1705.03247) and [Syllables and word-stress in Hindi (JIPA)](https://www.cambridge.org/core/journals/journal-of-the-international-phonetic-association/article/abs/syllables-and-wordstress-in-hindi/5E214548CF3EE05A78C83BC7005DCA79) ·
[Unicode ch. 12, on the Vedic marks](https://www.unicode.org/versions/Unicode16.0.0/core-spec/chapter-12/).
Ignore hi.wikipedia's `विकिपीडिया:ध्वन्यात्मक देवनागरी लिपि`, which claims official
recognition but is a 2007 stub with no IPA correspondences. The frequently repeated claim
that Unicode designates `ऍ`/`ऑ` "for English" is **unverified** — the standard says no
such thing.

### Indonesian (`id`) and Swahili (`sw`) — no tradition, cheap to invent, and avoid the standards

Both orthographies are near-phonemic, so the mapping table is a day's work. Both national
standards are loanword-adaptation documents that state the wrong optimisation *in their
own words*, which is convenient: anyone reviewing this will suggest them, and the quotes
below are the rebuttal.

**Indonesian.** EYD Edisi V (Keputusan Kepala Badan Bahasa No. 0424/I/BS.00.01/2022) has
a *Penulisan Unsur Serapan* part of some 95 numbered rules, nearly all of the form
"*foreign letters* menjadi *Indonesian letters*", and its stated principle is
*"Unsur bahasa sumber diserap ke dalam bahasa Indonesia dengan memprioritaskan
**bentuk**"* — prioritising *form*. It prints the source IPA and then declines to follow
it: *voucher* [vaʊtʃə] → **voucer**; *cyber* [sʌɪbə] → **siber**; *brochure* [brəʃʊə] →
**brosur**. PUPI is more explicit still: §6.5 aims that *"ejaan bahasa asing hanya diubah
seperlunya sehingga bentuk Indonesianya masih dapat dibandingkan dengan bentuk aslinya"*,
§6.6 that clusters should *"sedapat-dapatnya dipertahankan bentuk visualnya"* — hence
`pneumonia`, `tmesis`, `knebelit`, clusters Indonesian phonotactics cannot produce, kept
because they *look* like the original — and §6.3 defines transliteration as *"lepas dari
bunyi lafal yang sebenarnya"*, detached from the actual pronunciation.

The usable precedent is **KBBI's slash field**, which is this feature at miniature scale:
*"Garis miring dipakai untuk lafal kata yang mengandung unsur bunyi /è/, /é/, dan /ê/"* —
`mer.de.ka /mêrdéka/`, `tab.let /tablèt/`, `ban.teng /banténg/`. Ordinary Indonesian
spelling plus diacritics on `e` only, because everything else is already unambiguous.
Scoped to Indonesian headwords, no stress, no length, no foreign words — and the data is
copyright-asserted and login-gated, so reuse the convention rather than the content.

Design consequences, several of which correct a first instinct:

- **Only `ê` survives.** PUEBI 2015 had three diacritics (`é` = [e], `è` = [ɛ],
  `ê` = [ə]); EYD V keeps only `ê`, optionally: *"Untuk membedakan pengucapan, pada huruf
  e pepet **dapat** diberikan tanda diakritik (**ê**)"*. So the sanctioned minimal scheme
  is `e` for /e/ and /ɛ/, `ê` for /ə/.
- **/ɛ/ and /ɔ/ are allophones** of /e/ and /o/ in closed final syllables, so writing `e`
  and `o` lands within range for free — the reader applies them automatically.
- **Digraphs are guaranteed single sounds by rule** (`kh ng ny sy`), and `ngg` is /ŋg/
  against `ng` for /ŋ/ — but **there is no device for /n/ + /g/**.
- `v` exists but "is virtually always pronounced as [f]", so it does not buy /v/. `q` and
  `x` are restricted to proper names; do not emit them. `c` is /tʃ/ and `j` is /dʒ/, and
  EYD/PUPI's own `c` → `k`/`s` rewrites are the best evidence readers apply that. Final
  `k` is [ʔ]. **`eu` is taken** — EYD V calls it a monophthong /ɘ/ — so it cannot serve
  French *feu*. Gaps needing invention: /θ ð ʒ æ ʌ ɜː ø y/ and the approximant /ɹ/.
- **Do not double vowels for length.** EYD V's *pemenggalan* rules split adjacent vowels
  (`bu-ah`, `ma-in`, `sa-at`), so doubling reads as an *extra syllable* — a wrong reading
  rather than a neutral one.
- **Use a dot, not a hyphen, as the syllable divider.** The Indonesian hyphen carries four
  competing readings: line break, reduplication (`anak-anak`), prefix and compound joining
  (`se-Indonesia`, `KTP-mu`), and — dangerously — **letter-by-letter spelling-out**
  (`p-a-n-i-t-i-a`), so `n-i-h-a-o` would read as "spell it out". KBBI's separator is the
  full stop (`ke.pa.la`, `a.nar.kis.me`), it uses both when it needs both (`a.nai-a.nai`),
  and the dot also solves the digraph-boundary problem (`mas·yhur` against `ma·syhur`).

**Swahili.** The absence is verified rather than a search failure. BAKITA's publications
area has four categories — none of them orthography or pronunciation — and its
Terminology and Lexicography Section's duties never mention *tahajia* or *matamshi*; its
actual style authority is a print-only 57-page 1994 booklet, *Mwongozo kwa waandishi wa
Kiswahili sanifu*, whose contents are **unverified**. CHAKITA's domain has lapsed and now
serves a lottery site. The 1928 Mombasa conference and the ILC produced spelling
*normalisation* — collapsing nine spellings of *asubuhi* — and nothing on foreign
pronunciation. And the loanword rule that does exist admits the wrong optimisation:
*"Neno lolote lisiishie na konsonanti **hata kama halitakuwa na matatizo katika
utamkwaji wake**"* — no word may end in a consonant *even where that would cause no
pronunciation difficulty*.

The clinching evidence for the vacuum is a single Swahili Wikipedia article: *Robin
Quaison* reads `(matamshi: KWAY-sən)` — **English Wikipedia's `{{respell}}` output copied
verbatim**, unreadable in Swahili, where `y` is /j/ and `ə` is not a letter. Nobody
localised it because there was nothing to localise it into. Elsewhere sw.wikipedia gives
bare IPA (`Lourdes (matamshi: [luʀd])`). And the flagship TUKI English–Swahili dictionary
tells a Swahili reader nothing about English pronunciation — no IPA, no respelling, no
stress. *Kamusi ya Kiswahili Sanifu* 3rd ed. does print pronunciation, but it is the
orthography re-printed between slashes with **a colon for length**
(`angalau/angalau/ pia angaa/anga:/`) — commercial, and Kamusi Project is CC BY-NC-SA
plus a prior-permission clause, so also unusable.

There is one genuine precedent and it is exactly our distinction, occurring natively:
**Mdee (Lexikos 9, 1999)** identifies two competing routes for English loans in Swahili —
adopted *"as they are pronounced"* (`edita`, `eproni`, `pensheni`, `eksidenti`, `spitali`)
against *"as they are written in their original language"* (`editori`, `aproni`,
`hospitali`, `aksidenti`). The respelling/transliteration split, inside one language —
and Mdee treats the sound-based forms prescriptively as variants to be corrected. The
instinct exists in usage and is disfavoured in the standard. Press usage confirms the
split: proper names stay verbatim (`Washington`, `Shakespeare`, `Xi Jinping`, the last
keeping an `x` that is not a Swahili letter) while common nouns are nativised by sound —
BBC Swahili's **"Ligi Kuu ya Primia"** tracks /ˈprɛmɪə/ rather than the spelling.

What the orthography gives us is generous. English Wikipedia's key puts it best: "where
not shown, the orthography is the same as IPA". Five vowels /ɑ ɛ i ɔ u/, **never reduced
regardless of stress**, so an unstressed syllable reads at full value. **Swahili does have
/ʃ/, written `sh`** — a widely cited page claiming otherwise is wrong. Native digraphs
`ch sh ng' ny`; `q` and `x` unused and therefore available; `th dh gh kh` exist as
Arabic-loan digraphs, though "many speakers outside of ethnic Swahili areas have trouble
differentiating" them. **The prenasalised clusters `mb nd nj ng mv nz` and syllabic `m`
and `n` are a major asset** — `mtoto` [m̩ˈtɔtɔ], `nchi` [ˈn̩tʃi] — letting us write /m/ and
/n/ before a consonant with no epenthesis at all. Non-identical vowel sequences give
`ai au ei ou` ≈ /aɪ aʊ eɪ oʊ/ free. The gaps are /ʒ/ (no letter and no `zh`), /ə/ ("the
featureless [ə] does not exist in Swahili"), front rounded vowels, and tone — a hard gap
for a Mandarin target. And /l/ against /r/ "is a recent one, and many speakers have only a
single sound".

For the cluster problem there is an implementable rulebook: Harvey (2014) on epenthetic
vowels in Swahili loanwords — **word-finally, coronal or dorsal → `i`, labial → `u`,
pharyngeal → `a`; word-medially, copy a nearby vowel** — grounded in the stress rule,
"since stress in Swahili always lands on the penultimate syllable… after the stressed
vowel, vocalic features cannot be spread". Attested: `stempu`, `koti`, `nibu`, `filamu`,
`burashi`, `sukurubu`, `picha`.

Swahili's syllable divider is a hyphen and it is native — the official *ukataji wa
maneno* notation is exactly that (`ma-ne-no`, `ste-she-ni`, `al-fa-ji-ri`, `m-tu`) — with
two conditions. **Never lead with a hyphen**: a leading hyphen means "bound stem"
(`-soma`, `-zuri`). And **syllabify Swahili's way**: prenasals belong to the *onset*
(`ng'o-mbe`, not `ng'om-be`; `mbo-ni`, not `m-bo-ni`), or the reader parses a syllabic
/m̩/ where /ᵐb/ was meant. One device is unavailable: the `ng'` apostrophe is
load-bearing — English *-ing* must be `ng'` or a /ɡ/ appears — so the apostrophe cannot
double as a separator, and **no native device exists** for the `s`+`h`, `n`+`y` and
`n`+`g` boundaries. That gap needs a decision.

Sources for Indonesian: [EYD Edisi V, huruf vokal](https://ejaan.kemendikdasmen.go.id/eyd/penggunaan-huruf/huruf-vokal/) ·
[gabungan huruf konsonan](https://ejaan.kemendikdasmen.go.id/eyd/penggunaan-huruf/gabungan-huruf-konsonan/) ·
[unsur serapan: pengantar](https://ejaan.kemendikdasmen.go.id/eyd/unsur-serapan/) and [umum](https://ejaan.kemendikdasmen.go.id/eyd/unsur-serapan/umum/) ·
[pemenggalan kata](https://ejaan.kemendikdasmen.go.id/eyd/penulisan-kata/pemenggalan-kata/) ·
[tanda hubung](https://ejaan.kemendikdasmen.go.id/eyd/penggunaan-tanda-baca/tanda-hubung/) ·
[PUPI (Badan Bahasa PDF)](https://badanbahasa.kemendikdasmen.go.id/resource/doc/files/Pedoman_Umum_Pembentukan_Istilah_PBN_0.pdf) ·
[KBBI, Petunjuk Pemakaian](https://kbbi.kemendikdasmen.go.id/Beranda/PetunjukPemakaianKBBIPDF) ·
[Malay phonology — six vowels, allophony, and the absence of stress](https://en.wikipedia.org/wiki/Malay_phonology) ·
[Indonesian orthography](https://en.wikipedia.org/wiki/Indonesian_orthography) ·
[Sitanala 2023 (UvA), reviewing 22 studies on Malay stress](https://www.fon.hum.uva.nl/archive/2023/2023-BA-SvenFlemmingSitanala.pdf) ·
[Batais & Wiltshire on cluster repair (LSA)](https://journals.linguisticsociety.org/proceedings/index.php/ExtendedAbs/article/download/2998/2739/3322).
Sources for Swahili: [BAKITA publications](https://www.bakita.go.tz/publications) and [Terminology and Lexicography Section](https://www.bakita.go.tz/pages/terminology-and-lexicography-section) ·
[Mdee, *Dictionaries and the Standardization of Spelling in Swahili*, Lexikos 9 (1999)](https://lexikos.journals.ac.za/pub/article/view/918/437) ·
[SIS Africa, quoting BAKIZA and BAKITA on loan spelling](https://africa.sis.gov.eg/kiswahili/afrika-leo/makala-na-ripoti/tahajia-katika-kiswahili-sanifu/) ·
[sw.wikipedia, Robin Quaison — the copied English respelling](https://sw.wikipedia.org/wiki/Robin_Quaison) ·
[TUKI English–Swahili dictionary (PDF)](https://somabiblia.com/wp-content/uploads/2019/12/kamusi-tuki-english-swahili-1.pdf) ·
[Oluoch's review of KKS³, Lexikos 24, on the slash-and-colon notation](https://lexikos.journals.ac.za/pub/article/download/1273/786) ·
[Help:IPA/Swahili](https://en.wikipedia.org/wiki/Help:IPA/Swahili) · [Swahili phonology](https://en.wikipedia.org/wiki/Swahili_phonology) · [Swahili language](https://en.wikipedia.org/wiki/Swahili_language) ·
[Harvey, *Epenthetic Vowels in Swahili Loanwords*, JLLE 8(2) 2014](https://andrewdtharvey.com/wp-content/uploads/2019/01/harvey-andrew-2014-epenthetic-vowels-in-swahili-loanwords.pdf) ·
[sw.wikipedia, Silabi — written VV counts as two syllables](https://sw.wikipedia.org/wiki/Silabi) ·
[barabara, the stress minimal pair](https://en.wiktionary.org/wiki/barabara).
Whether Indonesian's *Penulisan Unsur Serapan* is keyed to spelling throughout is
**unverified** in detail, though the quoted principle and worked examples leave little
doubt. BAKITA's 1994 booklet, CHAKITA's output, and any Swahili press style guide are
**unverified**.

## Licensing, in one table

The general position is favourable, and for a structural reason: the systems worth
borrowing are mostly government products, and Berne Article 2(4) leaves official texts to
national law — "It shall be a matter for legislation in the countries of the Union to
determine the protection to be granted to official texts of a legislative, administrative
and legal nature" — which the relevant jurisdictions legislated the permissive way.
Berne 2(8) separately withholds protection from "miscellaneous facts having the character
of mere items of press information", the family a phoneme-to-letter correspondence
belongs to. And in US law 17 U.S.C. §102(b) excludes "any idea, procedure, process,
system, method of operation, concept, principle, or discovery" — which is the practical
key to all of this: **encode conventions, not content.** Re-implementing the DPD's method
or Lepri's convention in our own tables is the intended reading; bulk-copying anyone's
entry data is not.

| Source | Safely usable | Not usable |
|---|---|---|
| `en` | Wikipedia's respelling key and `Module:Respell` (CC BY-SA, attribute) | Merriam-Webster's key; the American Heritage key; OUP's scheme in the *Oxford BBC Guide*; the AP Stylebook's guide |
| `ko` | 외래어 표기법 in full — Copyright Act art. 24-2 / KOGL | — |
| `ja` | 外来語の表記 in full — Copyright Act art. 13(ii) covers a 内閣告示 | NHK's accent-dictionary notation (proprietary, and the wrong prosody) |
| `th` | หลักเกณฑ์การทับศัพท์ in full — Copyright Act s. 7 covers Royal Gazette notifications | — |
| `es` | the DPD's *method* and letter–sound table; the *Ortografía*'s recommendations; **FundéuRAE (CC BY-SA 3.0)**; es.wikipedia's `Ayuda:AFI/*` "Aproximación" columns (CC BY-SA 4.0) | bulk DPD entry text or its transcribed data |
| `vi` | all four government instruments — public Vietnamese law | — |
| `tr` | the *conventions* — `:`, `'`, `^`, the syllabification rule; `Yardım:IPA` (CC BY-SA) | verbatim rule text or dictionary data: **"© 2022 - TDK Tüm hakları saklıdır"** |
| `ru` | the ГУГК instructions — Civil Code art. 1259(6); ru.wikipedia's tables (CC BY-SA) | Гиляревский & Старостин, and Ермолович — in-copyright books |
| `it` | the DOP's *approach* as described on CC BY-SA it.wikipedia; Lepri's *convention* | the DOP's key; Treccani ("Riproduzione riservata"); Zingarelli and DiPI (Zanichelli); Lepri's specific tables and example lists as expression |
| `hi` | the Central Hindi Directorate standard — a Government of India publication marked `निःशुल्क`; hi.wikipedia's `IPA for Spanish` column (CC BY-SA) | Bhargava's and Rapidex's word lists — commercial. Reuse Bhargava's *method* only; the CC-0 stamp on the 1973 scan is a digitiser's claim and doubtful |
| `pt` | pt.wikipedia's IPA page (CC BY-SA) | Michaelis ("Todos os direitos reservados") |
| `de` `fr` | Duden's *convention* of Unterpunkt and Unterstrich | Duden entry data; Kauderwelsch (commercial, and its key is not public) |
| `id` | EYD V and PUPI — government publications; KBBI's slash *convention* | KBBI data — copyright-asserted and login-gated |
| `ar` | Wikipedia policy and content (CC BY-SA); `Help:IPA/Arabic` as a seed | Kalmasoft MOLTRANS — commercial |
| `sw` | Mdee (Lexikos, open access); Harvey (open access); `Help:IPA/Swahili` (CC BY-SA) | TUKI and *Kamusi ya Kiswahili Sanifu* — commercial; Kamusi Project — CC BY-NC-SA plus a prior-permission clause |
| `zh-Hans` | 汉语拼音方案 and the 国家通用语言文字法 — Copyright Law art. 5. GB/T 17693's status **unverified** | 世界人名翻译大辞典 — a commercial book |
| all | CLDR and ICU transforms (Unicode Licence v3, permissive) — though they contain no pronunciation data | any phrasebook publisher's in-house key |

`LICENSE-DATA` should name whichever standards each rule file derives from, the same way
`data/registry/regions-sources.md` names an emergency number's source.

## What the rule sets should look like

Four things fall out of the survey and are worth fixing in the file format before the
first rule set is written, because retrofitting them across sixteen files is the
expensive version.

**A rule set is a borrowed table plus named deviations.** Every borrowable standard needs
overruling somewhere, and always for the same reason — the standard is producing a
permanent spelling and we are producing a disposable hint. So `data/respell/<src>/rules.yaml`
wants a `derives_from:` naming the standard and a `deviations:` list where each entry
carries the rule it breaks and why. `ko` breaks 제3항 and 제4항; `ja` prefers 第2表 against
policy; `th` adds the tone marks rule 5 omits and drops the ทัณฑฆาต of rule 3.1;
`zh-Hans` emits pinyin instead of the 译音表's characters; `hi` uses `फ़` and `ज़` against
the 2024 §3.15.1; `es` uses `[sh]` and `[h]` which the *Ortografía* discourages in
permanent spellings and the DPD itself uses in brackets. Six files, six documented
departures — that is the honest shape, and it is also the answer to "why does our Korean
not match the official transcription".

**The syllable divider is per-source, not universally a hyphen.** `content/CONTRIBUTING.md`
currently says hyphens between syllables "are both conventional and useful", and for
English that is true. It is not true everywhere, and three sources need something else:

| Source | Divider | Why |
|---|---|---|
| `en` `vi` `tr` `sw` `es` `it` `fr` `de` `pt` `ru` | hyphen | native or harmless. For `vi` and `tr` it is *prescribed*; for `sw` it is the official *ukataji wa maneno* notation |
| `id` | **full stop** | the hyphen already means reduplication, compounding, *and* letter-by-letter spelling-out, so `n-i-h-a-o` reads as "spell it out". KBBI uses the dot |
| `ar` | **thin space or nothing** | Arabic is not hyphenated and a hyphen breaks the cursive join |
| `zh-Hans` `ja` `ko` `th` | hyphen, but for a different reason | these scripts break anywhere or by dictionary, so the hyphen buys nothing structurally — but it buys the *visual* syllable grouping, and for Thai (`word_break: dict`, where the measurer currently falls back to breaking anywhere) it supplies the only good break point the row will have |

Two per-source constraints go with it. Swahili must **never lead with a hyphen** (a
leading hyphen marks a bound stem) and must syllabify prenasals into the onset
(`ng'o-mbe`, not `ng'om-be`). Turkish must follow TDK's non-onset-maximising rule for
Western words (`prog-ram`, not `pro-gram`).

**Stress and length are two independent switches set by different sides of the pair.**
Whether to *mark* stress is a fact about the target language — the corpus already encodes
it, capitals on eleven sheets and none on `ja ko vi zh-Hans`. Which *device* is available
is a fact about the source. So it is a two-argument decision:

| | target has lexical stress | target has none |
|---|---|---|
| source has a native stress device (`es it pt ru de`) | that device, with capitals as the low-light fallback | nothing |
| source is Latin with no device (`en fr id sw tr`) | capitals | nothing |
| source is caseless (`ar ja ko th zh-Hans`) | Thai: a tone mark. Hindi: Bhargava's prime. Chinese-in-pinyin: capitals. Arabic, Japanese, Korean: nothing — mark length instead | nothing |

Vowel length is the source-side switch, and it should default *on* wherever the script
writes length with full-size letters — kana, Devanagari, Arabic, Thai, German, Swahili,
Latin doubling — and *off* for Hangul, Indonesian and Turkish-by-doubling, where the
device either does not exist or reads as an extra syllable. Turkish gets the colon
instead. The owner's instinct to make length optional is right; the default should be
script-derived rather than a global preference.

**Every rule set ships a one-line legend.** Bhargava's four words at the foot of the page
are the pattern: teach only the glyphs that are not already ordinary orthography, and
nothing else. If a source language's legend needs more than one line, the notation is
wrong.

## Build order

1. **`en`** — Wikipedia's key, `uh` for schwa, `oo` merged. First, because the 12,001
   curated cells are a test set and the disagreement list doubles as the review queue for
   the `ipa` column itself. Nothing else can be validated against anything.
2. **`ko`, `es`** — the two whose published tables are already sound-keyed and
   IPA-compatible. Mostly transcription of a public table plus the documented deviations,
   and `es` additionally has the best free seed corpus in the survey.
3. **`ja`, `ru`** — a table each, cheaply re-keyed. `ru` also because Cyrillic is the only
   non-Latin script that is typographically free: the `latin` stack, a 4.4pt floor, real
   italics, a condensed face and letter case.
4. **`vi`, `tr`** — a sanctioned parenthetical slot, a prescribed syllabification, and a
   native length mark each; only the IPA-to-grapheme table has to be written, and both
   orthographies are shallow. `tr` needs the locale-aware casing test.
5. **`it`, `pt`, `id`, `sw`** — no table, near-phonemic orthographies, one substantial
   design decision each: Italian's context-sensitivity on the following vowel, the
   pt-PT/pt-BR fork, Indonesian's dot separator and `ê`, Swahili's epenthesis rulebook and
   penult engineering.
6. **`zh-Hans`, `fr`, `de`** — real decisions rather than research: pinyin against 谐音,
   French nasalisation and silent finals, German's `s`+`p/t`, post-vocalic `h`, and the
   `v`/`w` swap.
7. **`ar`, `hi`, `th`** — each needs a native reviewer more than a table. Arabic's harakat
   at 5.4pt and the regional acceptance of `پ ڤ گ چ`; Devanagari's nuqta against its own
   standard; Thai's unavoidable tone.

That ordering is also an ordering by pairs unlocked per unit of work, since each new
source language turns on sixteen pairs regardless of how hard it was.

## What remains unverified

Carried forward deliberately, because the next person should not have to rediscover which
questions are open. Each of these would change a detail rather than a verdict.

- **The DOP's own inventory of signs.** Every `dop.rai.it` and `dizionario.rai.it` path
  returned 404 on 2 September 2026. It is a commercial key we should not encode anyway.
- **The DPD's fourth extra sign**, for the voiced palatal fricative of French *Jean* — it
  is rendered as an image on the RAE page. `[zh]` is the obvious guess and should not be
  encoded as a guess.
- **Duden Band 6's own wording** on subsetting IPA; the notations used by Langenscheidt,
  Wahrig, PONS and the DAWB; and whether *Kauderwelsch*'s European volumes use a plainer
  German-based respelling than its Laotian one, and whether they mark stress at all.
- **Whether Portuguese has any DPD equivalent.** Held with moderate confidence as "no",
  not exhaustively checked; Houaiss, Aulete, the Academia das Ciências de Lisboa
  dictionary and the *VOLP* were not reached, and *"pronúncia figurada"* as an attested
  Portuguese term is unconfirmed.
- **GB/T 17693's copyright status** — whether a *recommended* Chinese national standard
  falls inside the Copyright Law art. 5 exclusion is contested.
- **Which three nuqta consonants** the Central Hindi Directorate standard admits to the
  core वर्णमाला; the OCR of the older scan is not legible on that point. The 2024 text's
  blanket rejection is clear, so this affects the historical account rather than the
  recommendation.
- **Whether the extended Arabic letters are accepted by a general reader in each pack's
  region.** A reviewer question, not a search question, and the single most consequential
  open item in the survey.
- **Whether Indonesian's *Penulisan Unsur Serapan* is spelling-keyed throughout.** The
  quoted principle and the worked examples leave little doubt, but the 95 rules were not
  read in full.
- **BAKITA's 1994 *Mwongozo kwa waandishi wa Kiswahili sanifu***, which is print-only, and
  CHAKITA's output, whose domain has lapsed. Also any Swahili press style guide, probably
  not public.
- **TRT's *Telaffuz Sözlüğü* and the Anadolu Ajansı style book.** A state broadcaster's
  announcer guide is exactly where a Turkish respelling standard for foreign names would
  live if one exists, and neither research pass reached them. Also Dil Derneği's competing
  *Yazım Kılavuzu*. This is the highest-value remaining lead in the whole survey.
- **Turkish `Nevyork`** as an official prescription — no source found; treat as false
  until shown otherwise.
- **The AP Stylebook's pronunciation notation**, documented only behind its paywall.


## The eighteenth: Greek, and why it is in the invent tier

Searched properly before the table was written, and the negative is the finding. Greece's
normative literature on foreign words is a **spelling** argument — απλογράφηση against
αντιστρεψιμότητα — rather than a pronunciation-hinting tradition, and its one official
standard, **ΕΛΟΤ 743, runs the other way**: Greek to Latin, which is the direction this
project needs for the *romanisation* column and not for this one. Three plausible sources
were checked and are not it: the Academy of Athens' **Χρηστικό Λεξικό** marks pronunciation
only for synizesis (and its *μεταγραφή* means polytonic respelling of a Greek headword);
**ΛΚΝ** uses IPA rather than Greek letters; **Τριανταφυλλίδης (1941)** is spelling-based
(Μασσαχουσέττη, Σίλλερ). There is no dedicated Greek Wikipedia μεταγραφή guideline either
— the rule is one section of *Βικιπαίδεια:Ονοματοδοσία σελίδων*.

What does exist is four patterns, and the table derives from them:

1. **Babiniotis, ΛΝΕΓ §7(δ), σ. 26** — *«σημειώνεται σε παρένθεση πώς προφέρονται»*, used
   about 128 times: `de jure (ντε γιούρε)`, `Zeppelin (Τσέπελιν)`, `alter ego (άλτερ έγκο)`.
   Note that the same dictionary's *headword* policy is the opposite — σ. 37–38,
   *«ίσχυσε, κατά κανόνα, η αρχή τής αντιστρεψιμότητας»* (Βολταίρος, Ρουσσώ, Γκαίτε) — so
   only the minority device is borrowed, and the deviation list says so.
2. **ΕΛΕΤΟ, Ορόγραμμα 62** — transcribe *«με τη μεγαλύτερη δυνατή προσέγγιση της προφοράς
   του»*: `George Bush → Τζορτζ Μπους`, `Facebook → Φέισμπουκ`.
3. **Βικιπαίδεια:Ονοματοδοσία σελίδων** — an explicit sound-first hierarchy with a
   Προφορά column: `Άιζαακ Νιούτον`, `Πλέη Στέησιον`, `Νέντερλαντ`.
4. **The EU Interinstitutional style guide §10.5**, which *«απορρίπτει την επιλογή της
   αντιστρεψιμότητας και τάσσεται υπέρ της απλογράφησης»* and supplies the one hard
   orthographic rule taken here: /ŋɡ/ is **νγκ**, never γκ — *«Χονγκ Κονγκ και όχι Χογκ
   Κογκ, Σένγκεν και όχι Σέγκεν»*.

**Two things Greek hands us that no other reader did.** Stress is free and obligatory: the
monotonic orthography accents every polysyllable exactly once, and all four sources above
put the τόνος on the *source*-stressed syllable, so `stress: acute` is not a device the
table chooses but one the script insists on — an unaccented Greek respelling is an
impossible word, not merely an unmarked one. And the **μπ/ντ/γκ prenasalisation problem has
a published fix that costs nothing**: Babiniotis separates the digraph with a hyphen
(`α κον-τράριο`, `ντε προφούν-τις`), ΕΛΕΤΟ does the same (`Λίνκτ-ιν`), and our syllable
separator *is* that hyphen — a medial voiced stop opens its own syllable, so the fix falls
out of the syllabification.

**One thing it takes away, and it has no answer anywhere.** /ʃ/ is **σ** in every Greek
source (σοφέρ, Σέξπιρ, `Station → Στέησιον`); none of them uses σι or ς. So /ʃ/ and /s/
merge, and with /ʒ/ → ζ that costs Mandarin the s/sh/x three-way, English *sea*/*she*, and
Japanese, Korean and Thai their postalveolars. el.wikipedia's own *Οδηγός προφοράς ΔΦΑ*
confirms the vowel side of the same gap by printing a literal `-` against ɪ, e, æ, y, yː,
ʏ, ø, øː, œ, ɨ and ə. Those are documented approximations in the table's own
`approximations` block rather than gaps: `--gaps` is zero.


## The nineteenth: Hungarian, and the best key in the set

Hungarian is the reverse of Greek's position one language earlier. Greek had nothing
sound-keyed and went in the invent tier; Hungarian has **a normative, sound-keyed,
Academy-published pronunciation dictionary, and the Academy prints this very column
itself.** AkH. 12 rule 13 is, verbatim and in full:

> angol: **Greenwich [grinics], joule [dzsúl]** · cseh: **Dvořák [dvorzsák], Škoda
> [skoda]** · francia: **Eugène [özsen], Nîmes [nim]** · német: **Schäfer [séfer],
> Werther [verter]** · olasz: **Bologna [bolonya], quattrocento [kvatrocsentó]** ·
> portugál: **Guimarães [gimarajs], você [vuszé]** · román: **Sighişoara [szigisoára],
> piaţa [piaca]**

Square brackets, all lowercase, vowel length by the ordinary acute, no stress mark.
AkH. 11 wrote the same thing as `[e.: grinics]` — *ejtsd*, "say it as" — and the idiom
is alive: `insource:/ejtsd:/` returns **1,356 hu.wikipedia articles**, `Sydney (ejtsd:
szidni)`, `Marseille (ejtsd: marszej)`, `The Times (ejtsd: dö tájmz)`. Rule 219 states
the reading contract the whole feature needs: a Hungarian transcription is to be read
*«a bennük szereplő betűk magyar hangértéke szerint»*.

**Four sources, and the order they are used in matters.**

1. **Magay Tamás (szerk.), *Idegen nevek kiejtési szótára*, Akadémiai Kiadó 1974** —
   40,000 names from 25 Latin-script languages, in Hungarian letters, lektorált by
   Deme, Fábián and Országh. This is the inventory. And its Bevezető §3(d) is the
   single best find in the survey:

   > „A szótár eredeti kéziratában minden egyes névnek a kiejtését **a ma
   > leghasználatosabb nemzetközi hangjelölési rendszer, az APhI jeleivel is
   > leírtuk. Ez képezte — a magyar hangképzési lehetőségek figyelembevételével — a
   > helyes kiejtés megállapításának, a magyarra való »áthangolásnak« az alapját.**
   > […] úgy döntöttünk, hogy ebben a kiadásban az APhI-jelölés közlésétől
   > eltekintünk. Egy későbbi, tudományos igényű kiadványban azonban már az
   > APhI-rendszer szerinti fonetikus átírási formákat is fel fogjuk tüntetni."

   **IPA for every one of the 40,000 entries, used as the pivot into Hungarian, then
   suppressed in print for a general readership — and a promised IPA edition that
   never appeared.** `respell(ipa, 'hu')` is that edition. No other reader in this set
   has a key whose author states the pipeline.
2. **Kontra Miklós, "Javaslat orvosi nyelvünk angol szavainak fonetikai átírására",
   *Magyar Nyelvőr* 99 (1975), 29–33**, written *«az Idegen nevek kiejtési szótárát
   szerkesztő Magay Tamás tanácsaira támaszkodva»* and free from the Academy's own
   journal archive. **A complete English-phoneme → Hungarian-letter chart, indexed on
   IPA.** It is where /ʌ/ → `á`, /ɜː/ → `őr`, /eɪ aɪ oʊ aʊ/ → `é áj ó áu` and the
   uniform /ə/ → `e` come from, against the Hungarian tendency to spell the schwa
   (`dollár`, `Byron`). His §4 — *«csak rövid mássalhangzókat lehet az átírásban
   használni»* — is the one rule taken and then put back; see below.
3. **The MTA transcription volumes AkH. 12 rule 220 delegates to**: Ligeti (főszerk.),
   *Keleti nevek magyar helyesírása* (1981), and Hadrovics (főszerk.), *A cirill betűs
   szláv nyelvek neveinek magyar helyesírása / Az újgörög nevek magyar helyesírása*
   (1985). These cover the non-Latin half, and KNMH's Előszó supplies the design
   principle the whole table is restricted by:

   > „Mi nem kevesekhez, de mindenkihez akarunk szólni, olyan egyszerű írásmóddal,
   > **amelynek megértéséhez anyanyelvünk ismerete egymagában elégséges.** […] a
   > nyelvünkből hiányzó magánhangzók és mássalhangzók helyett a hozzájuk közel álló
   > magyar megfelelőket választottuk."

   That is the argument for the plain alphabet, and it is *the other Academy answer to
   the same question* rather than a convenience.
4. **`Wikipédia:Újind nevek átírása`** (CC BY-SA 4.0), whose columns are literally
   `Átírás (Tud. | IPA | Magyar)` — 76 IPA rows, and the only openly-licensed
   IPA-to-Hungarian table anywhere. With `IPA magyar nyelvre` for the 40 letters.

**Three things Hungarian hands a reader that nothing else in the set does.**

- **Palatal stops.** `ty` is /c/ and `gy` is /ɟ/, and `ny` and `ly` are there too — so
  KNMH's Cyrillic chart maps Russian palatalisation *one to one*, in ordinary letters:
  `день` is `gyen`, `Рязань` `Rjazany`, `Вася` `Vaszja`. Every other reader spells that
  contrast away. The glide is written only before a back vowel, which is why `Szibir`
  and `Szergej` carry none.
- **A three-way sibilant.** `sz` is /s/, `s` is /ʃ/, and KNMH's Chinese chapter gives
  `hsz` for /ɕ/ — `Hszian`, `Hszincsiang`. That keeps the Mandarin *s / sh / x*
  distinction a Greek or Spanish reader has to collapse, and it costs an audible [h].
- **Vowel length in full-size letters.** `á é í ó ú ö ő ü ű` are what a Hungarian was
  taught in school, so length survives 5.22pt italic muted where a mark would not.

**And one it takes away, which is the sharpest judgment call in the set.** *Every*
Hungarian source refuses to mark stress, and Magay devotes a titled section to why:

> „**A magyar szöveg épségének érdekében mondtunk le a hangsúly jelöléséről is.
> Rendkívül szaggatottá tenné ugyanis a folyamatos magyar beszédet a tőle idegen
> hangsúlyozás.** […] A magyar nyelvművelés hagyományos és mai állásfoglalása szerint
> a magyar szövegbe kerülő idegen szavaknak és neveknek **a magyaros hangsúlyformát
> kell viselniük.**"

Kontra's §1 agrees, the MTA volumes never mark it across some 35 languages (`hangsúly`
occurs eleven times in KNMH and never as a marking rule), and AkH. rule 13's brackets
and hu.wikipedia's 1,356 notes carry no mark either. There is also a phonetic reason:
**Hungarian avoids duration as a prominence cue precisely because length is phonemic**
(Vogel, Athanasopoulou & Pincus 2015; Kallio, Suni & Šimko 2022), and the acute is
therefore unavailable — `a` is a rounded [ɒ] and `á` an unrounded [aː], two different
vowels rather than one vowel twice, so an acute for stress would print a different word.

The table marks it anyway, with capitals, and the warrant is the one Hungarian source
whose situation is ours. **Tótfalusi's *Kiejtési szótár* (Tinta 2006) does mark
stress — by italicising the stressed vowel — and only for multi-word foreign phrases,
and only where the stress is not initial:** *«dőlt betű jelzi a hangsúlyos szótag
magánhangzóját – már ha a hangsúly nem az első szótagra esik»*. For single names he
follows Magay. Every source that refuses is governing a foreign *name embedded in a
Hungarian sentence*; this column is a multi-word foreign phrase with no Hungarian
around it. Italics are unavailable because the whole field is already italic, and
`RESPELL-SYSTEMS.md` already carries the cited precedent for capitals as the fallback
when the native mark cannot be set. `policy.stress` is one field, so a reviewer who
reads the balance the other way can set it to `none`.

One caveat on capitals that is Hungarian's own: Szigetvári's practice on *nyest.hu*
uses **capitals as extra symbols** rather than for stress — `cause` [kóz] against `cos`
[kOsz] — so a reader who has met that page has been taught a different meaning for
the same device. It is a small readership and a divergent notation, but it is the
Turkish `Yardım:Telaffuz` problem in miniature.

**What was borrowed and put back.** Magay's notation adds seven symbols to the
alphabet — `ȧ` for short unrounded [a], `ā` and `ē` for the two marginal long vowels,
`u̯`/`ü̯` for a diphthong's weaker half, and a **boldface** `h` for [x] against a plain
one for [h]. None is taken: seven symbols is a seven-line legend, and the rule here is
that a legend longer than one line means the notation is wrong. KNMH's "szűkebb magyar
ábécé" is the warrant, and one substitution is better than the original — Magay could
only separate [x] from [h] with a second weight, where **`ch` is a Hungarian letter
(AkH. 228) that every loanword reads as [x]** (`pech`, `Bach`, `technika`). Word-final
`h` needs it: AkH. 74 makes a final `h` ambiguous three ways and says the choice is
lexical, and Siptár shows the silent class is down to one live item (`cseh`) while
every new `h`-final loan is [x] (`Hezbollah`, `APEH`). Magay's parentheses go too, on
his own instruction to exactly our reader: *«aki magyar környezetben akarja kimondani a
nevet, a zárójelbe tett betűt vagy betűket ejtse úgy, mintha a zárójel ott sem lenne»*.

Kontra's no-geminates rule (§4) was taken and then put back, and the reason is the
input. His source is English *spelling*, where a doubled consonant marks the vowel
before it and no length is there to lose; ours is a phonemic `ipa` column, where a
geminate can only have come from a real length contrast — Italian `fatto`, Arabic
`mudarris`. Hungarian writes length by doubling and reads it that way, so the
information survives. What *is* borrowed from that neighbourhood is AkH. 7b's
simplified doubling — `ssz`, `ccs`, `zzs`, `ddzs`, never `szsz` — and AkH. 226 f)'s
full form across a break, `ösz-sze`, which falls out of the engine for free because a
two-phoneme geminate is a coda plus an onset.

**Syllabification is prescribed and it is not onset-maximising.** AkH. 224: *«A szótag
magánhangzóval vagy – legalábbis szó belsejében – egyetlen rövid mássalhangzóval
kezdődik»*. Two medial consonants split VC.CV (226 d: `am-per`, `mor-zsa`), three split
VCC.CV (226 g: `cent-rum`, `ost-rom`, `prog-ram`, `abszt-rakt`). So `max_onset: 1`, and
`reader_onsets` is left out rather than filled in: Hungarian's word-initial clusters are
an *appendix* rather than an onset in Siptár & Törkenczy's analysis — Törkenczy 1994
argues the other way, so the representation is contested, but both agree on the medial
facts, which is what the predicate would be asked about.

**Licensing.** Conventions only, and the reason is statutory rather than cautious:
**Szjt. 1999. évi LXXVI. tv. 1. § (6)** puts an *«ötlet, elv, elgondolás, eljárás,
működési módszer»* outside copyright, which is exactly what a phoneme-to-letter
correspondence is; §1 (4) exempts *jogszabály* text, and AkH. is not one, so its prose
**is** protected. Magay, KNMH and the 1985 volume are all `© Akadémiai Kiadó` and
freely *readable* on the MTA library's REAL-EOD repository under a policy that permits
personal, educational and not-for-profit reproduction *«provided the content is not
changed in any way»* and forbids commercial sale and robot harvesting — so read, cite,
re-implement, never copy. Kontra 1975 is on the Academy's own open journal archive.
The MEK/Wikisource copy of AkH. 11 carries a **non-commercial, no-derivatives** notice
despite living on Wikisource; do not treat it as CC. hu.wikipedia is CC BY-SA 4.0 and
is the only openly-licensed source in the list.

**Two hu.wikipedia pages are wrong and one is right.** `IPA magyar nyelvre` and
`Wikipédia:Újind nevek átírása` are usable. **`Magyar hangtan` lists /ŋ/ and /ʎ/ as
phonemes**, which contradicts every scholarly source — /ŋ/ is an allophone of /n/
before /k g/ with no letter of its own, and `ly` has been /j/ since about 1800.

**Sources.** [AkH. 12](https://helyesiras.mta.hu/helyesiras/default/akh12) ·
[Magay 1974, REAL-EOD](https://real-eod.mtak.hu/15195/) ·
[Kontra 1975, *Magyar Nyelvőr* 99](https://real-j.mtak.hu/6042/1/MagyarNyelvor_1975.pdf) ·
[*Keleti nevek magyar helyesírása* (1981)](https://real-eod.mtak.hu/12204/) ·
[the Cyrillic and Modern-Greek volume (1985)](https://real-eod.mtak.hu/15460/) ·
[REAL-EOD terms of use](https://real-eod.mtak.hu/policies.html) ·
[Tótfalusi, *Kiejtési szótár* (Tinta 2006)](https://tinta.hu/Kiejtesi_szotar) ·
[Szigetvári, *Hogy írjunk át?*](https://www.nyest.hu/hirek/hogy-irjunk-at) ·
[Kenesei–Vago–Fenyvesi, *Hungarian*](https://publicatio.bibl.u-szeged.hu/4969/1/) ·
[Siptár & Törkenczy, *The Phonology of Hungarian*](https://global.oup.com/academic/product/the-phonology-of-hungarian-9780199228904) ·
[IPA magyar nyelvre](https://hu.wikipedia.org/wiki/IPA_magyar_nyelvre) ·
[Wikipédia:Újind nevek átírása](https://hu.wikipedia.org/wiki/Wikip%C3%A9dia:%C3%9Ajind_nevek_%C3%A1t%C3%ADr%C3%A1sa) ·
[Szjt. 1999. évi LXXVI. tv.](https://net.jogtar.hu/jogszabaly?docid=99900076.tv)

### Still unverified, carried forward

- **The Magyar Rádió Nyelvi Bizottság's *Az idegen szavak és betűszók ejtése.
  Irányelvek az idegen szavak kiejtéséhez.*** The title and the committee are
  confirmed; the text is not online. KNMH's own preface says it was written *for*
  announcers, which may be why no separate guide was needed.
- **Országh László's dictionaries** — whether the pronunciation column is IPA. The
  claim is secondhand; the scans are lending-restricted and szotar.net is login-gated.
- **Bakos, *Idegen szavak és kifejezések szótára*** uses `[e.: …]` with no diacritics,
  no parentheses and no stress marks — coarser than Magay, and the reference for
  foreign *common nouns* rather than names. Not read in full.
- **Three works named in earlier briefs do not appear to exist**: Fábián–Szathmári–
  Terestyéni *Hogy is mondjuk?*, a Bőzsöny Ferenc pronunciation guide, and a Magay
  edition after 1986. Treat all three as false until shown otherwise.
- **Whether Hungarian avoids duration as a prominence cue** is established for F0 by
  two studies and contradicted by a third (Szalontai et al. 2016); what is not in
  doubt is that stress position is fixed and length is phonemic.


## The twentieth reader: Hebrew, and a key that states the method itself

Hebrew is in the borrow tier, and its key says the thing the survey usually has to
argue for. **כללי התעתיק מלועזית לעברית** — the Academy of the Hebrew Language's rules
for transcribing from foreign languages, redebated in the plenum's 5764–5767 sessions,
approved on 4 Sivan 5767 (21 May 2007) and amended in session 355 on 30 October 2017 —
is built on one stated principle:

> אין מתעתקים את השמות על פי כתיבם במקורם כי אם על פי הגייתם הנשמעת לנו

*Names are not transcribed by their spelling in the source but by how they sound to
us.* That is a sound-keyed respelling standard, published by a national academy, for
exactly the direction this column runs. Only Korean, Hungarian and Vietnamese arrived
with that much. Where the Academy's rules and this table differ, the four departures
are in the table's own `deviations` block; the two that matter are recorded here
because they are general questions rather than Hebrew ones.

**The vowels have to be pointed, and the argument is the same one Arabic made.**
Hebrew's rules are written for names in *running text*, which is unpointed, and
unpointed Hebrew writes /a/ and /e/ with nothing at all while `י` writes both /i/ and
/e/ and `ו` writes both /o/ and /u/. So the rules' own output cannot tell `ken` from
`kin` — perfectly good for a name a reader already knows, useless as a pronunciation.
The Academy permits the niqqud as an option and this table takes it, on the register
argument the Arabic entry sets out: full pointing is the marked, pedagogical form in
Hebrew as full vocalisation is in Arabic, so a pointed string reads unmistakably as a
pronunciation rather than as a spelling. What Hebrew has that Arabic does not is
**mid vowels** — segol is /e/ and holam is /o/ — so the ceiling that caps Arabic at
three vowel qualities does not apply, and Hebrew gets five.

**The hyphen: Arabic's reason does not generalise to the other right-to-left script.**
`content/CONTRIBUTING.md`'s separator table gives Arabic no hyphen because it breaks
the cursive join. Hebrew is not cursive, has no joining forms and loses nothing to a
break; Israeli teaching material divides syllables with exactly this hyphen, and
`core/measure.js` treats it as a line-break opportunity, which a column setting a
four-syllable Russian word at 5pt needs. The maqaf U+05BE was the native alternative
and was rejected twice: it is Hebrew's mark for *joining* two words rather than
dividing one, and it sits at letter-top height, where at 5pt it reads as one more mark
on the letter before it.

**Stress has no device, and the reasoning is worth keeping because three candidates
looked available.** The script is caseless, so `caps` is out. `acute` and `grave` are
byte-identical no-ops: `VOWEL_LETTERS` in core/respell.js is a list of *letters* a
diacritic may land on, and a Hebrew vowel is not a letter but a mark under the
consonant — with both the slot above and the slot below already occupied. `prime`
would work mechanically and is rejected on collision: U+02B9 is indistinguishable
from the geresh at 5pt, and this table puts a geresh on five letters to mean *this is
a foreign consonant*. The closest call was the **meteg** U+05BD, which is Hebrew's own
dictionary mark for stress; it needs a new device in `core/respell.js` for one reader,
and a general Israeli reader does not decode it. Arabic reached `stress: none` by a
different route and the same conclusion.

**What Hebrew costs the corpus: six Hangul syllables.** Every earlier language added as
a target grew somebody's charset. Hungarian gave the Korean table 37 new syllables,
five of them outside KS X 1001. Hebrew gives it six — 묵 욤 촛 헴 효 힛 — and gives no
other reader anything at all, because its phoneme inventory is a subset of what the
corpus already carried: /ʔ b v ɡ d h z x t j k l m n s p f ts ʁ ʃ/ over /a e i o u/,
with /dʒ tʃ ʒ/ from loanwords. `respell_check he --gaps` was zero on the second draft
and the first was ten symbols, every one of them found by running the table over the
real column rather than by reading the format.

**Sources.** [כללי התעתיק, האקדמיה ללשון העברית](https://hebrew-academy.org.il/%D7%9B%D7%9C%D7%9C%D7%99-%D7%94%D7%AA%D7%A2%D7%AA%D7%99%D7%A7/) ·
[התעתיק מלועזית לעברית (2020 PDF)](https://hebrew-academy.org.il/wp-content/uploads/taatik-loazit-2020.pdf) ·
[התעתיק מלועזית לעברית, ויקיפדיה](https://he.wikipedia.org/wiki/%D7%94%D7%AA%D7%A2%D7%AA%D7%99%D7%A7_%D7%9E%D7%9C%D7%95%D7%A2%D7%96%D7%99%D7%AA_%D7%9C%D7%A2%D7%91%D7%A8%D7%99%D7%AA) ·
[BGN/PCGN 2018 Romanization of Hebrew](https://assets.publishing.service.gov.uk/media/5e4d10d886650c10ee32f51f/ROMANIZATION_OF_HEBREW.pdf),
which is the same Academy system in the other direction and is what the pack's
`romanization_bgn` column and its `ipa` route read.

### Still unverified, carried forward

- **The 2020 PDF of the transcription rules would not download** (HTTP 403 to a
  non-browser client), so the letter table here is from the Academy's own summary
  pages and the Hebrew Wikipedia article that reproduces it. The five letters this
  table uses that a reader might question -- `ת׳` /θ/, `ד׳` /ð/, `נג` /ŋ/, `ט` for /t/
  and `ק` for /k/ -- are consistent across both, but the *optional* variants the rules
  admit (`דז׳` for /dʒ/, `טש` for /tʃ/, `ח׳` for /x/) are known only from the summary.
- **Whether a general Israeli reader decodes a meteg as stress** is the question the
  stress decision turns on, and it is a reviewer question rather than a search one.
