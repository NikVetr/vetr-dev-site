# Letters to sounds, for guessing how a typed name is said

A traveller types their name -- *Nikolai* -- and the board's "My name is ___" shows a
Mandarin listener `我叫Nikolai`, which a stranger who does not read Latin letters
cannot say back. The app can already write a name in the listener's script: the
reader builds it from its **sounds** on the sound keyboard ("How it sounds" under
About you), and the listener's respelling rules turn those sounds into `尼古拉` or
`ニコライ`. What is missing is the first step done for them: a **guess** at the sounds
from the letters they typed, which they then hear in the listener's voice and correct
tile by tile.

This file is the brief for the table that makes the guess. It is a guess by design --
no orthography maps letters to sounds one-to-one, English least of all -- so it aims
at a good starting point, never at a final answer.

## What you write

`data/registry/name-letters.csv` (CRLF):

```
language,script,letters,sound,notes
,Latn,sh,ʃ,"default Latin reading: s+h as one sound"
,Latn,ch,tʃ,
,Latn,j,dʒ,
es,Latn,j,x,"Spanish j is the velar fricative: Juan"
de,Latn,j,j,"German j is a glide: Johann"
de,Latn,sch,ʃ,
,Latn,x,k s,"two sounds, space-separated"
,Latn,h,h,
fr,Latn,h,,"silent in French names: Hélène"
```

- **`script`** is the ISO 15924 code from `data/registry/scripts.csv` (`Latn`, `Cyrl`,
  `Grek`, ...). **`language`** is blank for the script's default reading and a `bcp47`
  code for a language whose reading differs. The engine tries the reader's language's
  rows first, then the script's defaults, matching the **longest** letter sequence at
  each point (so `sch` beats `s`).
- **`letters`** are lower case, NFC; a letter with a diacritic is its own row where it
  reads differently (`ñ`, `ø`, `ł`, `č`).
- **`sound`** is one or more keys of the sound keyboard, space-separated, from exactly
  this set (`SOUNDS` in `ui/board-menu.js`):

  `p b t d k ɡ m n ŋ f v s z ʃ ʒ h x tʃ dʒ ts l r ɾ j w θ ð i ɪ e ɛ a ɑ o ɔ u ʊ ə y ø aɪ aʊ eɪ oʊ ɔɪ`

  Nothing outside that set -- the guess fills keyboard tiles, and a tile for a sound
  the keyboard does not have cannot be corrected. Blank `sound` means silent.

## Scope

1. **Latin** first: the default reading (an "international" reading close to Italian /
   Spanish vowels and the common consonant digraphs), then a row only where a
   language's own reading of a name differs, for each Latin-script language in
   `data/registry/languages.csv` whose readers type names: `en de fr es it pt nl pl cs
   hr hu ro sv fi tr id ms vi fil sw ha yo jv uz`. English gets the most rows and the
   worst guesses; prefer the reading most common *in names* (`th` as `t` in Thomas is
   rarer than `θ` in Thatcher; take θ) and note the trade-off.
2. **Cyrillic** (`ru uk`) and **Greek** (`el`): near-phonemic, a short table each.
3. Stop there. Other scripts are a later batch.

## Sources

How each language reads letters in names is documented in that language's own
Wikipedia article on its orthography or alphabet, and in its national language
institute's pronunciation guidance (Duden Aussprachewörterbuch, RAE, Académie
française, ÚJČ, ...). Source policy as in `add-a-language.md`: never glosbe,
wordhippo, languagedrops, translate.com, kaikki or forums. A short source in `notes`
for each language-specific row.

## Checks, and writing as you go

- Every `sound` token is in the set above; every `script` is in `scripts.csv`; every
  `language` is in `languages.csv`. (`scripts/validate_data.py` will check this once
  the engine lands; until then check it yourself with a few lines of Python.)
- For each language, try ten common names of that country through your table by hand
  and write the guesses in `tmp/notes/agents/name-letters.md` with what a speaker
  would actually say, so the coordinator can see how good the starting point is.
- Write each script's rows and notes to disk before starting the next; a session limit
  can stop you. Do not commit; the coordinator reviews and commits. Touch only
  `data/registry/name-letters.csv` and your notes.
