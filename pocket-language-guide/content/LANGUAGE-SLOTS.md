# The cards that name a language

Seven concepts in the bank are *about* a language, and every one of them is wrong on
some pair. The French card prints `Je ne parle pas français` and glosses it "I do not
speak this language", which is vaguer than the sentence the reader is about to say.
The French card also prints `Parlez-vous anglais ?`, which is not vague but simply
false for the 14 readers of that card who are not English speakers: a Spanish
traveller in Lyon holds up a card asking the waiter whether he speaks *English*.

The root cause is one line of the data model. An entry is one language's realization
of a concept, and that single cell serves as the **target** when someone is learning
the language and as the **gloss** when someone is reading it. That collapse is what
makes the corpus O(N) instead of O(N²), and it works for 767 of the 774 concepts
because they say nothing about which languages are in play. The seven that do say
something need a cell whose content depends on the *other* side of the pair, and
there is no way to write one today. So each pack's translator wrote the reading that
was in front of them — usually "my pack is the target and the reader is English" —
and the other reading was silently wrong.

This is not a translation defect. Every one of the 112 cells below is a correct
sentence in its own language; they are wrong only in combination. That is why nothing
caught them: the validator checks a cell against its language, and the whole class
lives in the join.

## The rule the mechanism needs

Two named placeholders, `{target}` and `{source}`, lexically disjoint from the
existing `{}` blank slot — `core/measure.js` splits on the literal two-character
string `{}`, which never occurs inside `{target}`, and no concept in the bank
declares a `{}` slot that means a language (all 44 slot concepts take a noun, a
number, a time or a place; the closest analogue, `introductions.i-am-from`, takes the
reader's *country* as a handwritten blank, which works precisely because a country
name survives being written in the wrong language and a language name does not).

The framing in the brief — "`{target}` in a source-side cell, `{source}` in a
target-side cell" — is one case too narrow, and the narrowing is where an
implementation would go wrong. `communication.do-you-speak-english` shows why. The
sentence is "do you speak *the traveller's* language":

- as the **target** cell, the French pack must say `Parlez-vous {source} ?`, and
  `{source}` must render in French, because the phrase is French;
- as the **gloss** for a French reader, the *same cell* must say
  `Parlez-vous français ?` — the reader's own language, named in the reader's own
  language.

One cell, and it has to satisfy both. It does, under a single rule:

> A placeholder names *which side* of the pair; the language it is **rendered in** is
> always the language of the cell it sits in.

Then `{source}` in the French cell resolves to `espagnol` when French is the target
and a Spaniard is reading, and to `français` when French is the source — because in
the second case the source *is* French, and French rendered in French is `français`.
The same rule handles `{target}` in `communication.i-do-not-speak-this-language`:
`Je ne parle pas {target}` prints `français` on a French card and `allemand` on the
French gloss of a German card.

Two properties fall out of the rule for free, and both are worth keeping:

- **It can never introduce a foreign script.** A cell only ever renders a language
  name in its own language, so the substituted string is always drawable in the
  stack `core/fonts.js` already picked for that field. `check_drawable` in
  `scripts/validate_data.py` stays satisfiable without a special case, and no pair
  can produce the row of empty boxes that the Mandarin number note once did.
- **A `note` needs neither placeholder.** A note is the one row that only ever
  prints source-side, so both placeholders would resolve to constants inside it, and
  hardcoded prose is clearer. The four existing notes are correct for exactly this
  reason: `applies_to` pins the target, so `The Swahili clock starts at dawn` is safe
  in the English cell, and the Korean politeness note's `한국어가 -요로 하는 일을`
  ("what Korean does with -요") is safe because that cell is only ever a Korean
  gloss. Nothing to change; worth a validator rule forbidding placeholders in a
  `note` so nobody adds one.

## Provenance: this was a decision, not an oversight

`scripts/merge_language_names.py` is the record. The bank was seeded from a Mandarin
sheet and then a Japanese one, so the phrases that name the language arrived twice:

    communication.i-do-not-speak-chinese     "I do not speak Chinese"
    communication.i-do-not-speak-japanese    "I do not speak Japanese"

Invisible with two languages, ruinous with three — the Spanish sheet printed both,
reading `No hablo español — I do not speak Chinese` directly above
`No hablo español — I do not speak Japanese`. The merge collapsed each pair to one
concept, which was right and is the reason the corpus is O(N). But it justified
itself with a second claim:

> The gloss is what the *reader* sees, and the reader is the one holding the card, so
> it does not need naming the language at all — "I do not speak this language" is
> both correct and universal.

That is the error, and the script implemented it literally: `if code == "en":
source["text"] = gloss` overwrote the English cell with the generic wording. Shapes A
and C below are the four concepts that script touched. The placeholder keeps the
merge and repairs the claim.

The two shape-B concepts were never merged; they carry the English-centric name
straight from the original LaTeX sheet (`provenance: latex-reference-v2`,
`expansion-v1`), where a single reader language was an assumption rather than a bug.

## The census

Seven concepts, all present in all sixteen packs. All have `slots: 0`, so no existing
`{}` machinery is involved. `ipa` and `literal` are empty in every one of these rows;
`text_alt` carries exactly one affected cell (Russian, noted below). The shapes:

| Shape | What is wrong | Concepts | Placeholder |
|---|---|---|---|
| **B** | the printed **target phrase** hardcodes one source language | 2 | `{source}` |
| **A** | the **gloss** says "this language" where the target names it | 2 | `{target}` |
| **C** | the **gloss** drops the language the target names | 2 | `{target}` |
| **D** | the **gloss** names the *wrong* language — the source's own | same rows as A and C | (fixed by the same edit) |

Shape D is the fourth shape and it is not a separate set of rows: it is what A and C
look like from a source whose own cell is specific rather than generic. It matters
because it is the severe half. A generic gloss is vague; a gloss naming the source's
own language is a *different sentence*. On a French card read by a German, the row
prints `Je ne parle pas français` under the gloss `Ich spreche kein Deutsch.` — "I
do not speak German". Nine of the sixteen packs are specific, so for
`i-do-not-speak-this-language` there are 9 sources × 15 targets = **135 pairs where
the gloss states a falsehood**, against 105 where it is merely vague. That reverses
the priority the bug report implies: the shape-A wording is the visible symptom, but
the same edit is load-bearing for more pairs in the D direction.

### Shape B — `{source}`: the printed phrase is wrong for 15 of 16 readers

Both concepts are "does someone here speak *my* language", and all 32 cells hardcode
English. Every one of the 240 pairs prints at least one of them, so this shape alone
puts a wrong sentence on 225 of the 240 pairs — every pair whose reader is not an
English speaker.

`communication.do-you-speak-english` (rank 3, importance 0.931):

| Pack | Current `text` | Frame |
|---|---|---|
| ar | `هل تتحدث الإنجليزية؟` | `هل تتحدث {source}؟` |
| de | `Sprechen Sie Englisch?` | `Sprechen Sie {source}?` |
| en | `Do you speak English?` | `Do you speak {source}?` |
| es | `¿Habla inglés?` | `¿Habla {source}?` |
| fr | `Parlez-vous anglais ?` | `Parlez-vous {source} ?` |
| hi | `क्या आपको अंग्रेज़ी आती है?` | `क्या आपको {source} आती है?` |
| id | `Bisa bahasa Inggris?` | `Bisa bahasa {source}?` |
| ja | `英語を話せますか？` | `{source}を話せますか？` |
| ko | `영어 하세요?` | `{source} 하세요?` |
| pt | `Fala inglês?` | `Fala {source}?` |
| ru | `Вы говорите по-английски?` | **rephrase** → `Вы говорите на {source}?` |
| sw | `Unasema Kiingereza?` | `Unasema {source}?` |
| th | `พูดอังกฤษได้ไหม` | `พูด{source}ได้ไหม` |
| tr | `İngilizce biliyor musunuz?` | `{source} biliyor musunuz?` |
| vi | `Có nói được tiếng Anh không ạ?` | `Có nói được {source} không ạ?` |
| zh-Hans | `你会说英语吗？` | `你会说{source}吗？` |

`emergency-medical.is-there-a-doctor-who-speaks-english` (rank 1013, importance 0.840,
`emergency-medical` is a safety-critical section):

| Pack | Current `text` | Frame |
|---|---|---|
| ar | `هل يوجد طبيب يتحدث الإنجليزية؟` | `هل يوجد طبيب يتحدث {source}؟` |
| de | `Gibt es einen Arzt, der Englisch spricht?` | `Gibt es einen Arzt, der {source} spricht?` |
| en | `Is there a doctor who speaks English?` | `Is there a doctor who speaks {source}?` |
| es | `¿Hay un médico que hable inglés?` | `¿Hay un médico que hable {source}?` |
| fr | `Y a-t-il un médecin qui parle anglais ?` | `Y a-t-il un médecin qui parle {source} ?` |
| hi | `क्या कोई डॉक्टर अंग्रेज़ी बोलता है?` | `क्या कोई डॉक्टर {source} बोलता है?` |
| id | `Ada dokter yang bisa bahasa Inggris?` | `Ada dokter yang bisa bahasa {source}?` |
| ja | `英語を話せる医師はいますか？` | `{source}を話せる医師はいますか？` |
| ko | `영어 하는 의사 있어요?` | `{source} 하는 의사 있어요?` |
| pt | `Há algum médico que fale inglês?` | `Há algum médico que fale {source}?` |
| ru | `Есть англоговорящий врач?` (+ `text_alt` `Есть врач, который говорит по-английски?`) | **`text` must be replaced by the `text_alt` construction** → `Есть врач, который говорит на {source}?` |
| sw | `Kuna daktari anayesema Kiingereza?` | `Kuna daktari anayesema {source}?` |
| th | `มีหมอพูดอังกฤษได้ไหม` | `มีหมอพูด{source}ได้ไหม` |
| tr | `İngilizce bilen doktor var mı?` | `{source} bilen doktor var mı?` |
| vi | `Có bác sĩ nói tiếng Anh không ạ?` | `Có bác sĩ nói {source} không ạ?` |
| zh-Hans | `有会说英语的医生吗？` | `有会说{source}的医生吗？` |

The Russian row is the only cell in the corpus that a placeholder cannot rescue in
place. `англоговорящий` is a fused compound, and the compounds are irregular —
`франкоговорящий`, not `французскоговорящий`; `китаеговорящий`, not
`китайскоговорящий` — so no table of nominals generates them. The fix is to promote
the existing `text_alt`, which is already a periphrasis, and drop the compound.

The concept notes on the emergency row currently say "Substitute the traveler's own
language where the sheet is built for a non-English source." That is the bug written
down as an instruction to a human who never sees it. Delete it once the slot exists.

Keep both `concept_id`s. They are the stability contract for re-imported user CSVs
and they are the keys of all fifteen `data/respell/overrides/` files; renaming them
to `do-you-speak-my-language` would invalidate both for a cosmetic gain. Fix
`slug_en` and the notes instead.

### Shape A — `{target}`: the gloss is vaguer than the phrase

Both concepts are "I (do not) speak *the local* language". Nine packs name their own
language, five say "this language", two say nothing at all. Every combination of a
specific pack and a generic pack produces shape A; every combination of two specific
packs produces shape D.

`communication.i-do-not-speak-this-language` (rank 1, importance 0.980 — the highest
in the section, and the row the bug was reported against):

| Pack | Current `text` | Status | Frame |
|---|---|---|---|
| ar | `لا أتحدث العربية` | specific | `لا أتحدث {target}` |
| de | `Ich spreche kein Deutsch.` | specific | `Ich spreche kein {target}.` |
| en | `I do not speak this language` | generic | `I do not speak {target}` |
| es | `No hablo español` | specific | `No hablo {target}` |
| fr | `Je ne parle pas français` | specific | `Je ne parle pas {target}` |
| hi | `मुझे यह भाषा नहीं आती` | generic | `मुझे {target} नहीं आती` |
| id | `Saya tidak bisa bahasa ini` | generic | `Saya tidak bisa bahasa {target}` |
| ja | `日本語は話せません` | specific | `{target}は話せません` |
| ko | `한국어 못해요` | specific | `{target} 못해요` |
| pt | `Não falo esta língua` | generic | `Não falo {target}` |
| ru | `Я не говорю на этом языке.` | generic | `Я не говорю на {target}.` |
| sw | `Sisemi lugha hii` | generic | `Sisemi {target}` |
| th | `พูดภาษาไทยไม่ได้` | specific | `พูดภาษา{target}ไม่ได้` |
| tr | `Bu dili bilmiyorum.` | generic | `{target} bilmiyorum.` |
| vi | `Tôi không nói được tiếng Việt` | specific | `Tôi không nói được {target}` |
| zh-Hans | `我不会说中文` | specific | `我不会说{target}` |

`communication.i-speak-only-a-little-of-this` (rank 2, importance 0.956):

| Pack | Current `text` | Status | Frame |
|---|---|---|---|
| ar | `أتحدث العربية قليلاً` | specific | `أتحدث {target} قليلاً` |
| de | `Ich spreche nur ein wenig Deutsch.` | specific | `Ich spreche nur ein wenig {target}.` |
| en | `I speak only a little of this language` | generic | `I speak only a little {target}` |
| es | `Hablo poco español` | specific | `Hablo poco {target}` |
| fr | `Je parle très peu français` | specific | `Je parle très peu {target}` |
| hi | `मुझे यह भाषा थोड़ी-सी आती है` | generic | `मुझे {target} थोड़ी-सी आती है` |
| id | `Saya bisa sedikit bahasa ini` | generic | `Saya bisa sedikit bahasa {target}` |
| ja | `日本語は少しだけ話せます` | specific | `{target}は少しだけ話せます` |
| ko | `한국어 조금만 해요` | specific | `{target} 조금만 해요` |
| pt | `Falo só um pouco desta língua` | generic | **rephrase** → `Falo só um pouco de {target}` |
| ru | `Я говорю совсем немного.` | names nothing | **rephrase** → `Я немного говорю на {target}.` |
| sw | `Nasema Kiswahili kidogo tu` | specific | `Nasema {target} kidogo tu` |
| th | `พูดไทยได้นิดเดียว` | specific | `พูด{target}ได้นิดเดียว` |
| tr | `Bu dili biraz biliyorum.` | generic | `{target} biraz biliyorum.` |
| vi | `Tôi chỉ nói được một chút` | names nothing | **rephrase** → `Tôi chỉ nói được một chút {target}` |
| zh-Hans | `我只会说一点儿中文` | specific | `我只会说一点儿{target}` |

### Shape C — `{target}`: the gloss drops the detail

Two concepts whose whole point is *which* language to write or show, and the seven
packs that say so are the seven whose glosses are then wrong in the D direction.
These want the slot in all sixteen packs, not just the seven: `Please show me the
text` does not ask for anything, and getting the local script written down is the
reason the row exists.

`communication.please-show-me-the-text` (rank 11, importance 0.735):

| Pack | Current `text` | Status | Frame |
|---|---|---|---|
| ar | `أرني النص بالعربية` | specific | `أرني النص ب{target}` |
| de | `Zeigen Sie mir bitte den deutschen Text.` | specific, **attributive** | **rephrase** → `Zeigen Sie mir bitte den Text auf {target}.` |
| en | `Please show me the text` | generic | `Please show me the text in {target}` |
| es | `Muéstreme el texto en español` | specific | `Muéstreme el texto en {target}` |
| fr | `Montrez-moi le texte en français` | specific | `Montrez-moi le texte en {target}` |
| hi | `वह लिखा हुआ दिखाइए` | generic | rephrase to carry `{target}` |
| id | `Tolong tunjukkan tulisannya` | generic | `Tolong tunjukkan tulisannya dalam bahasa {target}` |
| ja | `日本語の文を見せてください` | specific | `{target}の文を見せてください` |
| ko | `한국어로 보여 주세요` | specific | `{target}로 보여 주세요` |
| pt | `Mostre-me o texto, por favor` (`text_alt` `Me mostre o texto`) | generic | `Mostre-me o texto em {target}, por favor` |
| ru | `Покажите мне текст.` | generic | `Покажите мне текст на {target}.` |
| sw | `Tafadhali nionyeshe maandishi` | generic | `Tafadhali nionyeshe maandishi kwa {target}` |
| th | `ขอดูข้อความ` | generic | `ขอดูข้อความภาษา{target}` |
| tr | `Yazıyı gösterin, lütfen.` | generic | `{target} yazıyı gösterin, lütfen.` |
| vi | `Xin cho tôi xem chữ` | generic | `Xin cho tôi xem chữ {target}` |
| zh-Hans | `请给我看中文` | specific | `请给我看{target}` |

`phone-translation.please-write-the-place-name` (rank 2, importance 0.690). The same
seven packs are specific (`ar` `اكتب اسم المكان بالعربية`, `de` `Bitte den Ortsnamen
auf Deutsch schreiben.`, `es` `Escriba el nombre del lugar en español`, `fr`
`Écrivez le nom du lieu en français`, `ja` `地名を日本語で書いてください`, `ko`
`지명을 한국어로 써 주세요`, `zh-Hans` `请把地名写成中文`) and the same nine are
generic (`en` `Please write the place name here`, `hi`, `id`, `pt`, `ru`, `sw`, `th`,
`tr`, `vi`). Note that German is already prepositional here — `auf Deutsch
schreiben` → `auf {target} schreiben` — so this row needs no rephrasing where
`please-show-me-the-text` does.

### One near-miss, and one row that is fine

`communication.i-cannot-read-understand` is shape D in exactly one pack. Fifteen
packs are generic — `Ich kann das nicht lesen.`, `我看不懂`, `Okuyamıyorum.` — and
Arabic narrowed it to `لا أقرأ العربية`, "I do not read Arabic". So on any card whose
reader is an Arabic speaker, a generic target phrase carries a gloss claiming the
reader cannot read *Arabic*: fifteen pairs, one cell.

Recommendation: **genericise the Arabic cell**, do not slot the concept. The row is
said while pointing at a sign, "I cannot read this", and the language name adds
nothing a pointing finger does not already supply — which is also the reason the
other fifteen packs converged on the generic reading without being told to. One cell
changed versus sixteen.

`police-consulate.i-need-an-interpreter` is generic in all sixteen packs
(`Ich brauche einen Dolmetscher.`, `通訳が必要です`, `ขอล่าม`) and is therefore not a
bug. It is, though, the strongest candidate for a *new* `{source}` slot once the
mechanism exists: an interpreter request that does not say which language is the one
sentence in `police-consulate` that cannot do its job. Worth staging in
`PROPOSED-CONCEPTS.md` rather than folding into this fix.

## Where `Intl.DisplayNames` is not enough

It supplies 256 names for 16 × 16 and most of them are exactly right. The complete
matrix, naming language down, named language across:

| in \ of | en | fr | es | de | pt | ru | ar | hi | id | ja | ko | sw | th | tr | vi | zh |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| en | English | French | Spanish | German | Portuguese | Russian | Arabic | Hindi | Indonesian | Japanese | Korean | Swahili | Thai | Turkish | Vietnamese | Chinese |
| fr | anglais | français | espagnol | allemand | portugais | russe | arabe | hindi | indonésien | japonais | coréen | swahili | thaï | turc | vietnamien | chinois |
| es | inglés | francés | español | alemán | portugués | ruso | árabe | hindi | indonesio | japonés | coreano | suajili | tailandés | turco | vietnamita | chino |
| de | Englisch | Französisch | Spanisch | Deutsch | Portugiesisch | Russisch | Arabisch | Hindi | Indonesisch | Japanisch | Koreanisch | Suaheli | Thailändisch | Türkisch | Vietnamesisch | Chinesisch |
| pt | inglês | francês | espanhol | alemão | português | russo | árabe | hindi | indonésio | japonês | coreano | suaíli | tailandês | turco | vietnamita | chinês |
| ru | английский | французский | испанский | немецкий | португальский | русский | арабский | хинди | индонезийский | японский | корейский | суахили | тайский | турецкий | вьетнамский | китайский |
| ar | الإنجليزية | الفرنسية | الإسبانية | الألمانية | البرتغالية | الروسية | العربية | الهندية | الإندونيسية | اليابانية | الكورية | السواحلية | التايلاندية | التركية | الفيتنامية | الصينية |
| hi | अंग्रेज़ी | फ़्रेंच | स्पेनिश | जर्मन | पुर्तगाली | रूसी | अरबी | हिन्दी | इंडोनेशियाई | जापानी | कोरियाई | स्वाहिली | थाई | तुर्की | वियतनामी | चीनी |
| id | Inggris | Prancis | Spanyol | Jerman | Portugis | Rusia | Arab | Hindi | Indonesia | Jepang | Korea | Swahili | Thai | Turki | Vietnam | Tionghoa |
| ja | 英語 | フランス語 | スペイン語 | ドイツ語 | ポルトガル語 | ロシア語 | アラビア語 | ヒンディー語 | インドネシア語 | 日本語 | 韓国語 | スワヒリ語 | タイ語 | トルコ語 | ベトナム語 | 中国語 |
| ko | 영어 | 프랑스어 | 스페인어 | 독일어 | 포르투갈어 | 러시아어 | 아랍어 | 힌디어 | 인도네시아어 | 일본어 | 한국어 | 스와힐리어 | 태국어 | 튀르키예어 | 베트남어 | 중국어 |
| sw | Kiingereza | Kifaransa | Kihispania | Kijerumani | Kireno | Kirusi | Kiarabu | Kihindi | Kiindonesia | Kijapani | Kikorea | Kiswahili | Kithai | Kituruki | Kivietinamu | Kichina |
| th | อังกฤษ | ฝรั่งเศส | สเปน | เยอรมัน | โปรตุเกส | รัสเซีย | อาหรับ | ฮินดี | อินโดนีเซีย | ญี่ปุ่น | เกาหลี | สวาฮีลี | ไทย | ตุรกี | เวียดนาม | จีน |
| tr | İngilizce | Fransızca | İspanyolca | Almanca | Portekizce | Rusça | Arapça | Hintçe | Endonezce | Japonca | Korece | Svahili dili | Tayca | Türkçe | Vietnamca | Çince |
| vi | Tiếng Anh | Tiếng Pháp | Tiếng Tây Ban Nha | Tiếng Đức | Tiếng Bồ Đào Nha | Tiếng Nga | Tiếng Ả Rập | Tiếng Hindi | Tiếng Indonesia | Tiếng Nhật | Tiếng Hàn | Tiếng Swahili | Tiếng Thái | Tiếng Thổ Nhĩ Kỳ | Tiếng Việt | Tiếng Trung |
| zh-Hans | 英语 | 法语 | 西班牙语 | 德语 | 葡萄牙语 | 俄语 | 阿拉伯语 | 印地语 | 印度尼西亚语 | 日语 | 韩语 | 斯瓦希里语 | 泰语 | 土耳其语 | 越南语 | 中文 |

Five things break, in decreasing severity.

**1. The `zh-Hans` tag must be normalised to `zh` before it reaches
`Intl.DisplayNames`, in both slots.** Asked for `zh-Hans` it returns the *script*
qualification in every language: `Simplified Chinese`, `chinois simplifié`,
`Chinesisch (vereinfacht)`, `китайский, упрощенное письмо`, `Tionghoa (Sederhana)`,
`Kichina (Kilichorahisishwa)`, `중국어(간체)`, `簡体中国語`, `จีนตัวย่อ`,
`Basitleştirilmiş Çince`, `सरलीकृत चीनी`, and — for the Chinese pack's own
self-reference — `简体中文`. `Parlez-vous chinois simplifié ?` is not a sentence
anyone says; you *speak* Chinese and you *write* it simplified. Strip the script
subtag: one line, and it also future-proofs a `zh-Hant` pack. The one place the
distinction would genuinely matter is `please-show-me-the-text`, which is about
writing; if a Traditional pack ever ships, that concept is where to revisit it.

**2. Russian needs a case form, not a nominal, and it must be the same case
everywhere.** `Intl.DisplayNames` gives the nominative `английский`, and no Russian
frame in these seven concepts takes a nominative: you say `говорю по-английски` or
`говорю на английском`, and `текст на английском`. Worse, the adverbial `по-` series
is not universal — `по-английски` but `на хинди` and `на суахили`, because the
indeclinables have no adverbial. So the `по-` construction cannot be a rule.

The resolution is a design constraint rather than machinery: **each naming language
contributes exactly one form of each language name, and its frames are phrased to
take that form.** For Russian, the prepositional with `на` in the frame serves all
seven concepts idiomatically — `Вы говорите на английском?`, `Я не говорю на
французском.`, `Есть врач, который говорит на японском?`, `Покажите мне текст на
китайском.`, `Напишите название места на тайском.`, `на хинди`, `на суахили` — so
one override column of sixteen prepositional forms (`английском`, `французском`,
`испанском`, `немецком`, `португальском`, `русском`, `арабском`, `хинди`,
`индонезийском`, `японском`, `корейском`, `суахили`, `тайском`, `турецком`,
`вьетнамском`, `китайском`) closes it. If instead the mechanism grew a
per-construction form selector, Russian would be the only customer and every other
pack would pay the complexity.

The same constraint is what makes the other fifteen packs free, and it is worth
recording *why*, because each is a near miss:

- **German** works on the nominal (`kein {target}`, `auf {target}`) but not
  attributively — which is exactly why `den deutschen Text` has to become `den Text
  auf {target}`. One rephrasing, called out in the table above.
- **Turkish** takes the bare `-ce/-ca` form uninflected in every frame here, both as
  object (`{source} biliyor musunuz?`) and attributively (`{target} yazıyı`). Had a
  frame needed a case suffix, vowel harmony would have forced a per-name table.
- **Korean** is safe with the `로` particle because every CLDR Korean language name
  ends in `어` — a vowel — so the `으로` allomorph never arises.
- **Japanese** names all end in `語` and take `は`, `を`, `の`, `で` freely.
- **Arabic** names carry the definite article, and the `بـ` preposition fuses with it
  correctly by simple concatenation: `ب` + `العربية` = `بالعربية`. Write the frame
  with no space.
- **Thai** names are bare, with `ภาษา` supplied by the frame where it is wanted and
  omitted where the pack chose the colloquial `พูดอังกฤษ`.
- **Hindi** names are treated feminine, agreeing with the elided `भाषा`, so `आती है`
  holds across all sixteen.
- **Swahili** `Ki-` forms and the Romance/English nominals need nothing.

**3. Vietnamese needs an override for all sixteen.** CLDR returns `Tiếng Anh` — a
capital `T` *and* the word `tiếng` inside the name. The Vietnamese frames already
supply `tiếng` (`nói được tiếng Anh`), so substitution either doubles it
(`nói được tiếng Tiếng Anh`) or capitalises mid-sentence (`nói được Tiếng Anh`).
A lowercasing transform would fix the case but not the doubling, so this is the one
language where the sixteen names should simply be written down — which also lets the
Vietnamese translator choose between `tiếng Trung` and `tiếng Hoa`.

**4. Two single-cell overrides, both for a translator to confirm rather than for us
to assert.** Turkish `Svahili dili` embeds the word "language", so it reads oddly in
frames that also carry `dili`; Turkish also has `Svahilice`, and the Turkish
translator should pick. Indonesian `Tionghoa` names the ethnicity more than the
language — the standard term for the language is `bahasa Mandarin` — and the frames
already supply `bahasa`, so `Mandarin` is likely right. Neither is a mechanism
problem; both are rows in the override table.

**5. Do not reuse `languages.csv`'s `endonym` or `exonym_en`.** They are *display*
names for the picker and are wrong inside a sentence: `Français` (capitalised),
`Русский`, `Türkçe`, `Tiếng Việt`, `Bahasa Indonesia`, `简体中文`,
`Chinese (Simplified)`. `Je ne parle pas Français` and `Saya tidak bisa bahasa Bahasa
Indonesia` are what reusing that column produces. It is the obvious shortcut and it
has to be closed off in the comment where the new table lives.

## Capitalisation

Ten of the sixteen naming languages distinguish case. Six capitalise language names
always, and are safe in any position: **en, de, tr, id, sw, vi** (German because all
nouns are capitalised; Turkish, Indonesian, Swahili and Vietnamese because language
names are proper). Four are lowercase in CLDR and would need a capital at position 1:
**fr, es, pt, ru** — five, once the in-flight Italian pack lands. The remaining six
— ar, hi, ja, ko, th, zh-Hans — are caseless and the question does not arise.

Does any current phrasing put one at the start of a sentence? Two do, and neither is
affected:

- **Turkish**, in both shape-B rows (`İngilizce biliyor musunuz?`, `İngilizce bilen
  doktor var mı?`) and, after the rewrite, in both shape-A rows (`{target}
  bilmiyorum.`). Turkish CLDR already capitalises, so this works untouched.
- **Korean**, in `한국어 못해요` and `영어 하세요?`. Caseless.

No pack in the lowercase set puts a language name first, and none of their natural
phrasings wants to — French, Spanish, Portuguese and Russian are all verb- or
pronoun-initial here. So the cheapest correct answer is **not** a second pair of
capitalised tokens: it is a validator rule that a cell in `fr`, `es`, `pt`, `ru` or
`it` may not begin with `{target}` or `{source}`. That costs one check and no
runtime machinery, and it fails loudly at the moment a future translator writes the
phrasing that would break. If a `{Target}`/`{Source}` pair is wanted later it is a
two-line addition to the same substitution function; the point is not to build it
before a cell needs it.

The live capitalisation problem is the opposite one, and it is Vietnamese: an
*over*-capitalised CLDR name landing mid-sentence. That is item 3 above.

## Romanisation: two concepts, one 7 × 16 table

Seven packs carry a romanisation column, and it is keyed to the target alone, so it
cannot be curated per pair the way the respelling can. This is where the brief
expects trouble, and the count is the answer:

| Pack | Column | Shape-B cells needing a *source* name romanised | `{target}` cells needing the pack's *own* name |
|---|---|---|---|
| ar | `romanization_ala-lc` | 2 | 4 |
| hi | `romanization_iast` | 2 | 4 |
| ja | `romanization_hepburn` | 2 | 4 |
| ko | `romanization_rr` | 2 | 4 |
| ru | `romanization_bgn` | 2 | 4 |
| th | `romanization_rtgs` | 2 | 4 |
| zh-Hans | `romanization_pinyin` | 2 | 4 |

**Two concepts hit it**, and they are the same two everywhere: `do-you-speak-english`
and `is-there-a-doctor-who-speaks-english`. Fourteen cells. The `{target}` column is
cheaper still: it always resolves to the pack's own name, so it is seven constants,
and five of the seven are already sitting in the data — `al-ʿarabīyah`, `nihongo`,
`hangugeo`, `Zhōngwén`, `thai`. Only Hindi (`hindī`) and Russian (`russkom`) have to
be written, because those two packs are currently generic. The Arabic value composes
with the frame exactly as the script does: `arinī al-naṣṣ bi-{target}` yields the
current `bi-al-ʿarabīyah` from the same one entry.

So the registry is the right call and the mechanism does not need rethinking. Its
size, honestly stated: **112 hand-written romanisations** — 7 romanised packs × 16
named languages, of which 105 are for `{source}` and 7 for `{target}`. That sounds
like a lot next to "two concepts", and the reason it is still cheap is that it is a
table of *language names*, not of phrases: it is written once, it is independent of
how many concepts use it, and it never has to be revisited when a concept is added
or reworded. Two things to accept knowingly:

- It is the project's first O(N²) data, against a corpus that is otherwise O(N) and
  whose stated cost of a new language is "one directory". The marginal cost is
  bounded and small: a seventeenth language adds one romanised name to each of the
  seven existing romanised packs, plus sixteen if the new pack is itself romanised —
  at most 23 cells. Worth naming in `summary.md` next to the O(N) claim so the claim
  stays true rather than quietly becoming false.
- It cannot be derived. Pinyin, Hepburn and RR romanisations of `西班牙语`,
  `スペイン語`, `스페인어` require the reading, and the `ipa` column that a transducer
  would consume is empty throughout.

The natural home is one file, `data/registry/language-names.csv`, one row per
(naming language, named language) pair with columns `in,of,name,roman` — 256 rows, of
which 112 carry a `roman` and roughly 34 carry a `name` override (16 Russian, 16
Vietnamese, Turkish Swahili, Indonesian Chinese). Everything else leaves `name`
blank and takes `Intl.DisplayNames`. A `scripts/` check that regenerates the CLDR
column and reports drift would keep it honest across ICU versions.

## Respelling: already solved, and an argument against generating it

The respelling column is the one field in the project that is **already addressed by
pair**: `data/respell/overrides/<target>__<source>__<accent>.csv`. So `{target}` and
`{source}` never need substituting there at all — the curated file for a pair simply
spells the right word, because it only ever serves that pair.

Better, the fifteen files that exist today are already correct under the fix. All
fifteen are `<target>__en__en-US`, English is therefore the source in every one, and
`{source}` resolves to English for all of them — which is exactly the word their
respellings already contain:

| Pack | `do-you-speak-english` respelling | the "English" in it |
|---|---|---|
| zh-Hans | `nee hway shwaw eeng-yoo ma` | `eeng-yoo` |
| ja | `ehh-goh oh hah-nah-seh-mahss kah?` | `ehh-goh` |
| ko | `yuhng-uh hah-seh-yo` | `yuhng-uh` |
| ar | `hal ta-ta-HAD-dath al-in-ji-lee-ZEE-ya` | `al-in-ji-lee-ZEE-ya` |
| th | `POOT ang-grit DAI mai` | `ang-grit` |
| hi | `kyaa AAP-koh an-GREH-zee AA-tee hai` | `an-GREH-zee` |
| ru | `vih ga-va-REE-tye pa-an-GLEEY-ski` | `pa-an-GLEEY-ski` |
| sw | `oo-nah-SEH-mah kee-een-gheh-REH-zah?` | `kee-een-gheh-REH-zah` |
| tr | `een-gee-leez-JEH bee-lee-YOHR moo-soo-nooz?` | `een-gee-leez-JEH` |
| vi | `kaw noy duh-uk tee-ung ang khohng ah?` | `tee-ung ang` |
| de | `SHPREKH-en zee ENG-lish?` | `ENG-lish` |
| fr | `par-lay voo zahn-GLEH` | `zahn-GLEH` |
| es | `AH-bla een-GLES` | `een-GLES` |
| pt | `FAH-lah eeng-GLESH` | `eeng-GLESH` |
| id | `BEE-sah bah-HAH-sah EENG-grees?` | `EENG-grees` |

**The fix costs the respelling layer nothing.** The 225 pairs with no respelling
column at all are the pre-existing gap `summary.md` already names as the project's
largest, and this change neither widens nor narrows it.

It does, though, settle how that gap should eventually be filled, and the evidence is
in two rows of that table. The French respelling is `par-lay voo zahn-GLEH`: the `z`
is the liaison between `vous` and a vowel-initial word, and it *disappears* if the
substituted word is `espagnol` — `par-lay voo es-pah-NYOL`. The Arabic one is
`bil-a-ra-BEE-ya`, where the preposition has fused into the article. Both mean the
respelling of a slotted row is not the frame's respelling plus the name's
respelling; the boundary itself changes with what is inserted. Per-pair curation
absorbs that for free. A substitution rule would get French wrong on 14 of its 15
pairs, and would do so invisibly, in the one column a reader trusts because they
cannot check it.

## Where the mechanism meets the code

The substitution has to happen **once**, and there is exactly one place that sees
both row sets with the pair already known: `core/sheet.js`, immediately after the two
`loadLanguage` calls in `buildSheet` (lines 130–131), before `buildBlocks`. Doing it
there fixes every consumer at once, because they all read what `buildSheet` returns:

| Read site | What it renders |
|---|---|
| `core/pack.js` `itemRow()` (479–487) | the sheet's `script`, `roman`, `gloss`, `numeral` |
| `core/pack.js` note branch (385–386) | `sourceRows[...].text` for `note` blocks |
| `core/solve/weights.js` (139–140, 244–248) | the "add this row" proposal label *and* the measurement probe |
| `ui/content-tree.js` (171–172) | the content picker's target/gloss preview |
| `ui/format-panel.js` `sampleValues()` (147–151) | the field swatches in the Format panel |

Substituting inside `itemRow()` instead would leave four of those five printing a
literal `{target}`, and the `weights.js` probe is the one that would hurt: it
measures candidate rows to decide what fits, so an unsubstituted string there gives
the balance solver the wrong height and it offers a row that does not fit.

Four smaller things:

- **`{}` and `{target}` do not collide.** `core/measure.js` splits on the literal
  `{}` and draws a rule for it on target-side fields; `{target}` contains no `{}`
  substring, so an unsubstituted placeholder would print literally rather than
  corrupting a slot. That is the right failure mode — visible.
- **The concept bank should declare which placeholder a concept takes**, as a column
  beside the existing `slots`: blank, `target`, or `source`. Then
  `scripts/validate_data.py` can require that every pack's cell for that concept
  contains exactly that placeholder exactly once — which is the check that stops the
  next translator from writing `Parlez-vous anglais ?` again, and is the same shape
  as the existing `text.count("{}") != slots` rule. It should also refuse a
  placeholder in a `note`, and refuse a sentence-initial one in `fr`, `es`, `pt`,
  `ru` or `it`.
- **CSV export/import.** `ui/export.js` exports resolved values, which is right: a
  user editing their sheet should see `français`, not `{target}`. The consequence is
  that a re-imported row becomes a custom override frozen to the pair it was
  exported from. Acceptable, and worth one line in `content/LLM_SPEC.md`.
- **`tests/solve.test.mjs`** calls `loadLanguage` directly (lines 21–22, 300), so it
  will see raw placeholders unless it goes through the same helper. No test asserts
  on any of these seven strings today, so nothing else breaks.

## The Italian pack, in flight

`data/lang/it/` is untracked and being written now, and it already has five of the
seven rows in the same shapes — which is the clearest evidence that this is a
structural trap and not a translation slip. Nobody told the Italian translator to
hardcode English; the cell only has room for one reading and they wrote the one they
could see.

| Concept | Current `it` `text` | Shape | Frame |
|---|---|---|---|
| `communication.i-do-not-speak-this-language` | `Non parlo italiano` | A/D | `Non parlo {target}` |
| `communication.i-speak-only-a-little-of-this` | `Parlo poco italiano` | A/D | `Parlo poco {target}` |
| `communication.do-you-speak-english` | `Parla inglese?` | **B** | `Parla {source}?` |
| `communication.please-show-me-the-text` | `Mi mostri il testo in italiano` | C/D | `Mi mostri il testo in {target}` |
| `phone-translation.please-write-the-place-name` | `Scriva il nome del posto in italiano` | C/D | `Scriva il nome del posto in {target}` |

`communication.i-cannot-read-understand` is `Non so leggere questo` — generic, which
is the reading fifteen of the other sixteen packs also chose independently, and one
more reason to genericise the Arabic outlier rather than slot the concept.
`emergency-medical.is-there-a-doctor-who-speaks-english` is simply absent: the pack
has no `emergency.csv` yet, and `it` has no row in `data/registry/languages.csv`
either, so it ships nothing today.

Italian costs the registry almost nothing. Its own names are usable straight from
CLDR — `inglese`, `francese`, `spagnolo`, `tedesco`, `portoghese`, `russo`, `arabo`,
`hindi`, `indonesiano`, `giapponese`, `coreano`, `swahili`, `thailandese`, `turco`,
`vietnamita`, `cinese`, `italiano` — with no morphology and no embedded noun, and its
frames are all prepositional or nominal. Two consequences to fold in:

- **Italian joins the lowercase set.** `fr`, `es`, `pt`, `ru`, `it` are the five
  languages whose CLDR names begin lowercase, so the sentence-initial validator rule
  covers five packs, not four. No Italian frame above puts one first.
- **The other packs need one more name each**, and two of them need it by hand:
  Russian's prepositional `итальянском`, and Vietnamese's, where CLDR returns
  `Tiếng Italy` rather than the ordinary `tiếng Ý`. The seven romanised packs each
  gain one romanisation (`イタリア語` → `itariago`, `이탈리아어` → `itallia-eo`,
  `意大利语` → `Yìdàlìyǔ`, `الإيطالية` → `al-īṭālīyah`, `इतालवी` → `itālvī`,
  `อิตาลี` → `itali`, `итальянском` → `italyanskom`). That is the 23-cell marginal
  cost named above, measured on a real case.

## Scope of the change

- **112 `text` cells** across 7 concepts × 16 packs, plus 1 `text_alt` (Russian),
  plus 5 more in the in-flight Italian pack.
  Of those, 11 need more than a noun swapped and want a translator's eye rather than
  a mechanical edit: `de` `please-show-me-the-text`; `ru` in all seven concepts;
  `pt` and `vi` `i-speak-only-a-little-of-this`; `hi` `please-show-me-the-text`.
- **1 cell genericised** (`ar` `i-cannot-read-understand`), instead of slotting that
  concept.
- **~146 new registry cells**: 112 romanisations, ~34 name overrides.
- **All 240 prerendered pairs** in `packs/` go stale. Every pair prints at least
  `communication.do-you-speak-english` and
  `communication.i-do-not-speak-this-language`, the text changes on both, and the
  text is what the solver measures — so the PDFs, the face PNGs and the thumbnails
  all have to be rebuilt, and `data/shell.json` and the service-worker version with
  them.
