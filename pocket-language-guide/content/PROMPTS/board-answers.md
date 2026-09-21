# Translating the answers a stranger taps

Twenty-two short sentences in `board-answers`, and the single highest-leverage
content task in this project: every conversation board is built from concepts that
already exist in nearly every language, so **these twenty-two are the only thing
standing between Converse and roughly 2,550 language pairs per board.** They exist in
Mandarin and English today. `scripts/build_board_index.mjs` recomputes the reach the
moment a language gains them.

Read `content/PROMPTS/add-a-language.md` for the corpus conventions and the source
policy before starting. This file is what is different about *these* rows.

## What makes them different from every other row in the corpus

**They are said by the other person, not by the traveller.** Every other row is the
traveller speaking: they hold up the phone and show a sentence. These are tapped by
the shop assistant, the taxi driver, the passer-by, the nurse — and read by the
traveller. Three consequences, and all three are easy to get wrong by writing the
sentence the way a phrasebook would:

1. **Register is theirs, not the traveller's.** A phrasebook writes the careful form
   a learner should use. These are what a person behind a counter actually says.
   Mandarin's `关门了` for "It is closed" is right; a full `这家店已经关门了` is not
   what anyone says. Prefer the short, ordinary, spoken form.

2. **They must be naturally gender-neutral in your language**, with no slash, no
   paired alternatives, and no paraphrase that changes the meaning. This is the rule
   in `content/PROMPTS/speaker-variants.md`, and it binds here absolutely: the app
   never asks a stranger anything about themselves, so a reply that has to know their
   gender cannot be offered at all.

   The English has already been steered for this. "I will show **the way**" rather
   than "show you"; "One moment, please" rather than the imperative "wait"; "What is
   the name?" rather than "your name"; "Is walking possible?" rather than "Can you
   walk?"; "Staying here is best" rather than "Stay here". **Keep that steering in
   your language.** A second-person pronoun, an imperative, or an object clitic
   pointing at the traveller is what out-genders them in Arabic (أنتَ/أنتِ,
   تفضّل/تفضّلي), Hebrew (אתה/את, חכה/חכי), Polish (pan/pani plus a gendered
   participle), Czech (byl jste / byla jste) and the Indo-Aryan languages
   (आप + a gendered participle). If your language forces a choice anyway, say so in
   your report rather than picking one.

3. **The speaker's own gender must not show either.** "I am calling an ambulance" and
   "I will find someone" are first person, and in Russian, Polish, Arabic, Hebrew,
   Hindi and the rest that can inflect for who is speaking. The traveller has no idea
   who is holding the phone. **Choose the construction that does not inflect** — a
   present tense rather than a past, a future auxiliary rather than a participle, a
   nominal rather than a verb — and if there is genuinely none, say so.

## The twenty-two

| concept_id (after `board-answers.`) | English | Mandarin |
|---|---|---|
| `can-you-walk` | Is walking possible? | 您能走路吗？ |
| `card-or-cash` | Card or cash? | 刷卡还是现金？ |
| `help-is-coming` | Help is coming | 救援马上就到 |
| `how-many` | How many? | 要多少？ |
| `i-am-calling-an-ambulance` | I am calling an ambulance | 我要叫救护车了 |
| `i-am-calling-the-police` | I am calling the police | 我要报警了 |
| `i-do-not-have-a-phone` | I do not have a phone | 我没有手机 |
| `i-will-find-someone` | I will find someone who can help | 我去找能帮忙的人 |
| `i-will-show-you` | I will show the way | 我带路 |
| `i-will-write-it-down` | I will write it down | 我写下来 |
| `it-is-closed` | It is closed | 关门了 |
| `it-is-over-there` | It is over there | 在那边 |
| `none-of-these` | None of these is what I want to say | 这里面没有我想说的 |
| `not-possible` | That is not possible | 这个没办法 |
| `please-wait` | One moment, please | 请稍等 |
| `say-it-again` | One more time, please? | 麻烦再说一遍 |
| `stay-here` | Staying here is best | 您最好待在这里 |
| `the-hospital-is-close` | The hospital is close by | 医院就在附近 |
| `there-is-no-wait` | There is no wait, you can go in now | 不用等，现在就可以 |
| `we-do-not-have-it` | We do not have it | 我们没有这个 |
| `what-is-your-name` | What is the name? | 您叫什么名字？ |
| `where-does-it-hurt` | Where does it hurt? | 哪里疼？ |

`none-of-these` is the refusal every answer grid ends with. It means "I do not want to
say any of these", said by someone declining to use the board — not "I do not
understand". Word it so it does not read as confusion.

## Where the rows go

One file per language: **`data/lang/<code>/social.csv`**, which is the `social`
concept group and where `board-answers` lives. Append the twenty-two rows; do not
touch anything else in the file, and do not touch `data/concepts/` — the concepts
already exist and are universal.

- Copy the **exact header** of that language's own `social.csv`; the romanisation
  column is named differently per language and some have none.
- Fill the romanisation column where the pack has one, in that pack's own system and
  conventions. Read several neighbouring rows before writing one.
- **Leave `ipa` blank.** `scripts/build_ipa.py` fills it; the coordinator runs it.
- `confidence`: `2`. `provenance` as neighbouring rows in that pack do it.
- **CRLF**, like everything under `data/lang/`. Verify by byte count, not by `file`.

## What "done" means

```bash
python3 scripts/validate_data.py            # 0 errors
node scripts/build_board_index.mjs          # your languages should now appear
npx tsc -p jsconfig.json
```

The index is the scoreboard: a language that gains all twenty-two moves from serving
no board to serving seven.
