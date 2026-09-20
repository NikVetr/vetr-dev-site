# Writing speaker variants, and keeping replies neutral

Two jobs that look like one and are not. **Speaker variants** are the wordings a
language needs when the traveller speaking is a woman rather than a man. **Reply
neutrality** is a constraint on what the *listener* is offered to tap, and it exists
precisely so that no second question about gender ever has to be asked.

Read `data/registry/NOTES.md` first — it is the survey this file acts on, with the
source for every call and the six gaps it could not close.

## The problem, stated once

A woman holds up a Russian card that says `Я заблудился`. It is a man's sentence. A
general translation tool cannot do better: it is handed one sentence and no speaker,
and it picks the citation form, which is the masculine in all 22 languages here. This
app's phrases are a fixed set, so it can ask once, in a settings screen, before
anything is shown — and then every phrase resolves in the right voice with no menu at
the moment of use. That is the entire advantage a small inflexible board has over a
flexible translator, and it is why this file exists.

## Three rules, each ruling out an obvious design

**Only meaningful choices are offered.** Axes are declared per language in
`data/registry/speaker-axes.csv`. A reader whose two languages have no first-person
agreement is never asked their gender — 31 of the 53 declare nothing, and for those
pairs the settings control is not rendered at all. Do not add an axis because a
language "has gender"; add one only if a **first-person** phrase **in this corpus**
changes. Third person is irrelevant here and is what most grammar summaries
illustrate, which is how several of the survey's first drafts were wrong.

**Nothing is inferred.** Not from a name, not from `navigator.languages`, not from an
answer given for another language. Unset is a real state and resolves to the row on
disk, which is the masculine — and where that is what is happening, the app *says so*
under the grid rather than letting the default pass silently.

**An incoming reply is never inflected for the owner.** What the listener taps is
theirs to say. Bending it to the traveller's gender would put words in a stranger's
mouth and leak the traveller's profile to someone who never asked.
`core/speaker.js`'s `variantOf` refuses a phrase marked `incoming`, so this is
structural rather than remembered — but the structure only buys you the *refusal*.
The content still has to be writable neutrally, which is the second half of this file.

## `data/lang/<bcp47>/variants.csv`

Same columns as that language's section files, plus a leading `variant`:

```
variant,concept_id,text,text_alt,romanization_<system>,ipa,literal,confidence,provenance
speaker_gender=feminine,building-help.i-am-lost,Я заблудилась,,ya zabludilas,,,2,ru-variants-v1
```

- **`variant`** is a key from `core/speaker.js`'s `variantKey`: `axis=value` pairs
  joined by `|`, **sorted**. With one axis declared anywhere today, every row in
  practice reads `speaker_gender=feminine`.
- **A blank cell inherits.** Only write the cells that actually change. The Russian
  row above changes the script and the romanisation and leaves the IPA alone.
- **Never write a row for the default value.** `masculine` is the default on all 22
  languages, so the masculine wording stays in the section file where it already is
  and `variantKey` returns `null` for it — a `speaker_gender=masculine` row would
  never be read.
- **The pronunciation moves with the wording.** If `text` changes, check
  `romanization_*`; a card that varies the script and leaves the respelling masculine
  teaches her to say the wrong thing out loud. This is the single most common defect
  in this file.
- CRLF, like the rest of `data/lang/**`.

### Clean up the base row while you are there

The corpus handled this ad hoc before the mechanism existed, three different ways,
all of them bad on a card:

| how | example | what to do |
|---|---|---|
| a slash inside `text` | `es` `Estoy perdido/a`, `cs` `Ztratil jsem se / ztratila jsem se`, `it` `Mi sono perso/a` | `text` becomes the masculine alone; the feminine becomes a variant row |
| the feminine parked in `text_alt` | `ru`, `pl`, `hr`, `uk`, `pt`, `hi`, `de` | move it to a variant row and clear `text_alt` |
| a bare ending in `text_alt` | `fr` `végétarienne` | write the whole sentence in the variant row |

A slash makes the reader do grammar at a hotel counter in bad light, and `text_alt`
means "a second *wording*" everywhere else in the corpus — Traditional forms for
`zh-Hans`, a periphrasis for a construction that will not take a slot — so using it
for gender both hides the variant from the mechanism and blocks the cell's real use.
**Do not touch a `text_alt` that is not a gender form**; most of them are not.

## Reply neutrality, per language

Supplied replies — anything in a `replySets` entry, and the `board-answers` section —
must be naturally neutral **in both languages**, with no paired alternatives, no
slash, and no paraphrase that changes the meaning. These are the traps, from the
survey. A language absent here still needs the rule; it just has no known trap.

**Second-person forms are gendered — a reply that addresses the traveller directly
will out-gender them.**

- **Arabic** — pronouns, verbs and imperatives all split (أنتَ/أنتِ, تفضّل/تفضّلي).
  Use impersonal or nominal replies: `من هنا`, `الطبيب قادم`.
- **Hebrew** — second-person present and imperatives split (אתה/את, חכה/חכי). Use
  infinitival or existential forms: `…לחכות`, `יש`/`אין`.
- **Amharic** and **Hausa** — **no axis but a real hazard.** The first person is
  ungendered, so neither appears in `speaker-axes.csv`, but አንተ/አንቺ and *kai/ke*,
  *ka/ki*, *-nka/-nki* are gendered. This is the schema's blind spot: an empty
  registry does not mean a language is safe to write replies in carelessly.
- **Hindi, Urdu, Punjabi, Marathi, Gujarati, Nepali** — आप plus a participle is still
  gendered (आप खो गए हैं / गई हैं). Use invariant adjectives (ठीक, घायल) or nominal
  constructions.
- **Polish** — the worst European case: polite address forces the explicitly sexed
  *pan*/*pani* **and** a gendered participle. Avoid direct address entirely.
- **Czech** — *vykání* keeps the participle singular, so it is gendered: *byl jste* /
  *byla jste*.
- **Romance and Greek** — a predicate adjective addressed to the traveller is
  gendered (*¿Está perdido/perdida?*). Prefer verb-only: *¿Necesita ayuda?*,
  *Χρειάζεστε βοήθεια;*
- **Russian, Ukrainian, Croatian** — low hazard: polite *вы*/*ви*/*Vi* takes a plural
  participle, which is neutral. Provided replies never use *ты*/*ти*.
- **Thai, Khmer** — the particle reveals the *responder's* sex, not the traveller's.
  Not a hazard. Omit the particle, or pick one and say so in the provenance.

## "We" is a third party too

**Never write a variant for a concept whose subject is *we*** —
`introductions.we-are-traveling-together`, `lost-rescue.we-are-here`,
`children.car-seat`, `taxi.we-need-to-catch-the-high-speed-train`.

This is the third-party rule below wearing a plural, and it is easy to miss because
the sentence *is* about the speaker: they are one of the "we". But the agreement is
with the whole group, and in Hindi, Urdu, Punjabi and the Romance and Slavic languages
a mixed group takes the masculine plural. So a feminine variant selected by the
*speaker's* gender says "we, all of us women", which is false for a woman travelling
with her husband — and the base row's masculine plural was already correct for her.

Two such rows were written in the first pass (`hi` and `ur`, both re-filed from a
`text_alt` the packs already carried) and removed. Punjabi's would have needed the
distinct feminine plural ਰਹੀਆਂ, which is what made it visible.

Where a language distinguishes an all-female plural and you think a traveller might
want it, that is a *companion* question and the answer is still no — see below.

## Third-party gender

Five concepts inflect for the gender of someone who is neither speaker nor listener:

`lost-rescue.my-friend-is-hurt`, `lost-rescue.my-companion-is-missing`,
`lost-rescue.my-child-is-missing`, `children.cannot-find-my-child`,
`introductions.this-is-my-friend`.

**No `companion_gender` axis will be added.** It would be a second questionnaire
about a third party, at the moment of an emergency, to produce a sentence whose
gender the listener can see for themselves. Instead, **write these with a
grammatically fixed word**, which every affected language has: Russian *ребёнок* is
masculine whatever the child's sex, Arabic طفلي works for either, Hebrew
ילד שלי likewise in the generic. Where a language genuinely has no neutral option,
say so in `provenance` and leave the masculine — do not invent a doubled form.

## Sources

As `add-a-language.md`: encyclopaedias, dictionaries of record, each language's own
Wikipedia, statutory or industry guidance. **Not** glosbe, wordhippo, languagedrops,
translate.com, kaikki, or forum threads. Cite the rule you applied in `provenance`,
and mark a form you derived from a rule rather than read in a source — five of the
survey's worked examples (`he`, `ar`, `ur`, `pa`, `th`) are derivations and are
flagged as such in `NOTES.md`.

## What "done" means

```bash
npm run validate                       # variants.csv schema, keys, orphan concept ids
node --test tests/speaker.test.mjs     # the resolution rules, including the refusal
node scripts/speaker_coverage.mjs      # which declared languages still have no rows
npx tsc -p jsconfig.json
```

`speaker_coverage.mjs` reports gaps rather than failing on them: a declared axis with
no variant rows yet is an honest, known state — the reader sees the default wording
and is told that is what they are seeing. What is *not* acceptable is a variant row
whose base row no longer exists, or a key no language declares; `validate_data.py`
fails on both.
