# Translating the interface itself

`data/i18n/<bcp47>.json` is the app's own chrome — button labels, headings, status
lines, error messages — as distinct from `data/lang/<bcp47>/*.csv`, which is the
phrasebook the reader shows to a stranger. Both are translation work and the source
policy in `content/PROMPTS/add-a-language.md` governs both. Everything below is what
is different about the chrome, and almost all of it was learned the expensive way
during the conversation-board wave, when six agents hit the same eight problems.

`en.json` is the schema: every other catalogue is a subset of its keys, appended in
its order. A key that is absent falls back to English at `ui/i18n.js:97` and the
reader sees an English word in a Georgian interface — which is the failure this work
exists to remove, and also the reason it is safe to leave one key out on purpose.

## First, work out whose screen the string is on

The conversation board draws two surfaces at once. `t('x')` reads the **interface**
catalogue — the language of the person holding the phone. `theirs.t('x')` reads a
second catalogue loaded by `loadCatalogue`, in the language of the person being
spoken to, and `ui/conversation.js` uses it fifteen times. Grep for the key before
choosing a register: the same English word is a quiet label on one surface and
signage on the other.

Greek makes the distinction visible. `beacon.help` is rendered through `theirs.t`
as a full-screen flashing signal, so it is `ΒΟΗΘΕΙΑ` — caps, unaccented, because
that is how Greek signage is set. The board's own labels are read at normal size by
their owner, so they are sentence case with monotonic accents. Neither is wrong; a
catalogue that used one style for both would be.

## Reuse beats translation, and disagreement is the bug

Most keys you are asked to add have already been answered somewhere in the repo.
Before writing a word, look for it in:

- **the same catalogue**, under a different key — `colour.move`, `colour.alert` and
  `quiz.interest.social` turned out to be exactly three of the eight board titles,
  and were taken verbatim rather than re-translated;
- **`data/registry/section-titles/<code>.csv`**, which is what the *printed sheet*
  calls that section. A label naming a section must match the sheet, or the app and
  the card in the reader's pocket disagree about what the thing is called;
- **the corpus rows themselves** — body-part words belong to `body-parts.*` and
  `massage-spa.focus-on-*`, not to your own judgement. Finnish *niska* over *kaula*,
  Russian *стопы* over *ступни*, Bengali পায়ের পাতা over পা: in each case the corpus
  had already decided and the catalogue only had to agree.

Where English itself diverges from its own section name — `emergency-medical` is
titled "Emergency", `transit-rides` is "Getting around" — you are naming a situation
rather than a section, and may do the same. Say so in your report. Where the
translated section title is an adjective that works as a colour-group name but not
as a tile ( ru «Экстренное», or ଜରୁରୀ ), prefer the noun the corpus already uses.

## Placeholders are substituted raw and cannot inflect

`lookup` does `template.replace(/\{(\w+)\}/g, …)` and wraps any insert containing a
letter in FSI/PDI. That is the whole mechanism. `{count}` arrives as a bare numeral,
`{language}` and `{board}` as names in *their own* script. Nothing agrees with
anything.

So a sentence that requires the insert to carry case, number or gender cannot be
written. The three dodges that worked, in order of preference:

1. **Hang the case on a fixed head noun.** `dalam bahasa {language}`,
   `{language} மொழியில்`, `Ο πίνακας «{board}»`, `«{board}» вահանակը`. The noun
   inflects, the insert sits in the nominative, and the sentence is grammatical
   whatever lands in it. Each catalogue's `_note` usually records the file's own
   form already — follow it rather than inventing a second one.
2. **Move the count out of the agreement.** Russian and Finnish both agree a noun
   with a numeral and neither can do it from a substitution, so both put it after a
   colon: «Не переведено фраз на этой доске: {count}». A parenthetical works the
   same way.
3. **Use the language's numeral-invariant construction** where it has one — the
   Bengali and Odia classifiers টি/ଟି, or a language that does not mark number at
   all.

## Verb-final languages break a heading that its buttons complete

Several headings are sentence fragments finished by the grid beneath them: "Please
focus on…" over *the shoulders / the back / the neck*. In SVO and VO languages this
survives translation and is the better rendering, because the preposition or article
can ride on the buttons and do the case work there (el `στους ώμους`, fi illative
*hartioihin*, hy accusative `ուսերը`).

In a verb-final language it cannot. A heading ending in its verb is not completed by
a following object; it reads backwards. Re-cast **both halves**: the heading becomes
a question or a noun phrase, the buttons become its case-marked answers — ta
`அதிகமாக மசாஜ் எங்கே?` + locative, ja 「中心にしてほしい部位」 + bare nouns, hi
「कहाँ मालिश करनी है」. This is safe because the label is owner-facing only:
`labelOf` in `ui/conversation.js` uses `labelKey` for the *cell*, and tapping it
still shows the listener the full corpus sentence. There is precedent in the same
set — `boards.time.whenTitle` is already a bare question over a grid of answers.

## Leaving a key out is a legitimate answer

English showing through is honest. A Yoruba word with guessed tone marks is not, and
neither is a Klingon verb coined for "flash". Omit the key, and record what you
omitted and why in the file's own `_note`. Two rules make this safe rather than lazy:
the omission must be a *sourcing* failure, not an effort one, and it must be reported
so someone can close it later.

Rewording is the middle path and is usually better than omitting: drop the untethered
modifier and keep the sentence ("turn the words" without *sideways*, "sound the
alarm" for "get attention"). Report every one of these too.

## Do not collide with vocabulary the corpus has already spent

The chrome and the phrasebook ship together, so a word used for a UI object must not
be the word a sign in the phrasebook uses for something else. Greek `πίνακας` for the
board, because `πινακίδα` is a sign; Gujarati and Urdu `બોર્ડ`/`بورڈ`, because
`પાટિયું`/`تختی` already appear in `common-signs`. Armenian `Սպա` is the word for a
military officer, so the spa board is `Մերսում` and the borrowed word is not used at
all — while Khmer `ស្ប៉ា` is attested in Cambodian commercial use and is fine.

## Each file's `_note` is binding

It is not commentary; it is the accumulated ruling on that language's orthography and
house style, and it usually answers the question you are about to get wrong: which
placeholder frame the file uses, whether labels are verbal nouns or imperatives,
which letters are forbidden (Urdu: no U+064A, U+0643, U+0647 or ZWNJ; `ے`/`ں`
word-final only), how tone marks are sourced. Extend it when you make a decision the
next agent would otherwise re-litigate.

## Mechanics, and the three things that have broken a file

Append new keys in `en.json` order, after the file's last existing key. Then:

- **Preserve the file's own indentation.** It is 2 spaces in 50 catalogues and
  **1 space in `kn.json`, `ml.json` and `or.json`**. A reformatted file turns a
  55-line diff into a 533-line one and hides the actual change. Do not take that
  list on trust either — derive it, the way the agent who corrected this paragraph
  did after being handed a version of it that named only `or.json`:

  ```
  python3 -c "
  import pathlib
  for p in sorted(pathlib.Path('data/i18n').glob('*.json')):
      for ln in p.read_text().split(chr(10))[1:]:
          if ln.startswith(' ') and '\":' in ln:
              print(p.stem, len(ln) - len(ln.lstrip(' '))); break"
  ```
- **Preserve the trailing newline — or its absence.** `ha.json` and `ml.json` have
  none; the other 51 do. All catalogues are LF; none has a CR anywhere. The
  `data/registry/section-titles/*.csv` files are the opposite kind of trap: those
  are a mix of CRLF and LF *per file*, so there is no rule to remember, only the
  file in front of you.
- **Round-trip before you write.** Load, re-serialise, compare bytes with the
  original; only then apply your change. This catches an indentation or escaping
  surprise before it reaches the file rather than after.

NFC for every value. Do not touch `en.json`.

## Verification, and what to report

Run all three, and quote the actual output:

```
node scripts/check_i18n.mjs --check     # exit 0; prints each catalogue's coverage
npx tsc -p jsconfig.json                # exit 0, no output
python3 -c "import json,pathlib;[json.loads(p.read_text()) for p in pathlib.Path('data/i18n').glob('*.json')]"
```

`check_i18n` reads `ui/`, the root HTML, `data/presets.json` and every
`data/boards/*.json`; a key referenced only through a computed string is invisible to
it and will be listed as unreferenced. That list is informational. The failing
condition is the opposite one — a key *referenced* but not defined.

Report, separately from the translations themselves: every key you left out; every
string you reworded rather than translated; every choice where a native reviewer
might reasonably differ; and **any corpus row you found to be wrong on the way past**.
That last one is not a distraction — the Malay board work is what established that
`data/lang/ms/emergency.csv` glosses "back" as *punggung*, which Kamus Dewan tags as
the Indonesian sense and which the Malay corpus already contradicts three rows later.
