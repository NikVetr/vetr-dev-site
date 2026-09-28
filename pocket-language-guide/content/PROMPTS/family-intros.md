# Family, one by one: four board sentences from two sheet rows

The printed sheet carries two rows that hold both people at once, so a traveller can
point into them:

```
introductions.this-is-my-husband-wife    This is my husband / wife
introductions.this-is-my-daughter-son    This is my daughter / son
```

A conversation-board button says one thing, and the board shows only the part of a
row before ` / `. So on every board "wife" and "son" could not be said at all, and in
languages where the slash falls inside the sentence the half that was shown was not
a sentence (Indonesian `Ini suami / istri saya` showed as `Ini suami`, without
*saya*). The board now uses four concepts of its own, in the `family-intros` section,
which is off on the sheet by default:

```
family-intros.this-is-my-husband     This is my husband.
family-intros.this-is-my-wife        This is my wife.
family-intros.this-is-my-son         This is my son.
family-intros.this-is-my-daughter    This is my daughter.
```

The source policy, the row format, `confidence`, `provenance` and every check are
`content/PROMPTS/add-a-language.md`'s. What follows is only what is particular to
this job.

## Writing the four rows

- **Start from the language's own two combined rows**, their `text_alt` and their
  `literal` notes, in `data/lang/<code>/intro.csv`. They were researched; the four
  new rows split them, in the same register and the same construction, rather than
  being translated afresh from English.
- **Each is a whole sentence a person says** while introducing that one person to
  a stranger, with its own possessive, copula and final punctuation where the
  language uses them. Check the half after the slash especially: `mume / mke wangu`
  is *mume wangu* and *mke wangu*.
- **Agreement belongs to the person introduced**, never to the speaker: French *mon
  mari* but *ma femme*. Where the language uses a humble or honorific word for one's
  own family (Japanese 夫・妻・息子・娘 rather than ご主人), use the word the combined
  row uses, or say why not.
- **Leave the two combined rows exactly as they are.** The sheet still prints them.
- Append the four rows after `introductions.this-is-my-daughter-son`, leave `ipa`
  empty for the builder, and keep the file's `\r\n` line endings (it is written by
  Python's `csv` module; read and write it with `newline=''`).
- Romanised packs (`zh-Hans` pinyin, `ja` Hepburn, `ko` RR, `he` BGN, `am`, `tlh`
  Okrand, `qya` Appendix E) author the romanisation cell as the brief says, and
  `tlh` and `qya` then derive `text` with `python3 scripts/transliterate_native.py`.

## The section's title

Add `family-intros,<title>` after the `board-answers` row of
`data/registry/section-titles/<code>.csv`, keeping its line endings. The English is
"Family, one by one": a short heading, in the language's own words, for a list of
sentences introducing one's family members one at a time. "Family" alone is fine
where that is the natural heading.

## Checks

For your languages only -- other agents are writing other languages in the same
tree at the same time, so never run a builder without `--only`:

```
python3 scripts/build_ipa.py --only <codes>
python3 scripts/build_ipa.py --check --only <codes>
python3 scripts/validate_data.py            # no errors in your languages
node scripts/respell_check.mjs --charset --check
```

`uk` and `mr` phonemise through a separately loaded eSpeak; run their builds with
`env PHONEMIZER_ESPEAK_LIBRARY="$(python3 -c 'import espeakng_loader as e; print(e.get_library_path())')" PHONEMIZER_ESPEAK_DATA_PATH="$(python3 -c 'import espeakng_loader as e; print(e.get_data_path())')" python3 scripts/build_ipa.py --only uk`.

Do not run `build_board_index.mjs`, `build_shell.mjs` or anything that writes a file
shared by every language, and do not commit.

## Report

Per language: the four sentences, where each came from (the combined row, or a
source for anything the combined row did not settle), and the title. Write it to
`tmp/agent-notes/family-intros-<group>.md` **after each language**, not at the end.
