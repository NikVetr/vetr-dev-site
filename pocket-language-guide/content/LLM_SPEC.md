# Editing a sheet outside the app

The studio's **Export CSV** button gives you the whole sheet as one row per item.
Change it in a spreadsheet, or paste it into a chat with this file, then use
**Import CSV** to bring it back. Rows are matched on `concept_id`, so a re-import
updates in place rather than duplicating anything.

This is the intended way to do things the app cannot: a dialect the corpus does
not cover, a respelling tuned to how *you* hear it, your own vocabulary.

## Columns

| Column | Meaning |
|---|---|
| `concept_id` | Stable identifier. **Do not change it** for an existing row — that is what makes a re-import an edit rather than a duplicate. A row with an id the corpus does not know becomes a new custom item. |
| `section_id` | Which section the item belongs to. Must be one of the ids in `data/registry/sections.csv`. Only consulted for new items. |
| `template` | `entry` for a phrase row, `ref` for a dense reference-table row, `refphrase` for a short phrase in a table, `num` for a number-table row. Defaults to `entry`. |
| `include` | `yes` or `no`. Controls whether the item appears on the sheet. |
| `target_text` | The phrase in the language you are learning, in its own script. |
| `romanization` | The official transliteration (Pinyin, Hepburn, …). Leave blank if the language has none. |
| `ipa` | Pronunciation in IPA. Optional. |
| `gloss` | The phrase in your own language. |
| `respell` | Pronunciation spelled the way a reader of *your* language would say it — `nee how`, not `ni hao`. Hyphens mark syllables and are good line-break points. |
| `importance` | 0 to 1. Used when the app proposes items to fill whitespace. |
| `notes` | Free text. Not printed. |

## Rules

1. **Keep the header row and the column order.** Both are checked on import.
2. **UTF-8.** The export includes a byte-order mark so spreadsheets open it
   correctly; keep it or drop it, either reads back fine.
3. **A blank cell means "leave this alone", not "delete it".** Clearing a column
   by accident will not wipe content.
4. **New items need both `target_text` and `gloss`.** Anything else is optional.
5. **A cell starting with `=`, `+`, `-` or `@` is exported with a leading
   apostrophe** so spreadsheets do not treat it as a formula. Import strips it.
6. Import reports every row it skipped and why. Nothing is applied silently.

## Prompt to paste alongside the CSV

> Here is a CSV of a pocket phrase guide. Please rewrite the `respell` column so
> it reflects <the accent or dialect you want>, keeping every other column
> exactly as it is, including `concept_id` and the header row. Respellings should
> use only the ordinary spelling conventions of <your language>, with hyphens
> between syllables. Do not add, remove or reorder rows. Return the complete CSV
> and nothing else.

For adding vocabulary, invent ids in the form `<section_id>.<short-slug>` and set
`section_id` to a section that already exists.

## What is not editable this way

Layout, colour and type are properties of the sheet, not of an item, so they live
in the studio's Format panel and are not represented in the CSV.
