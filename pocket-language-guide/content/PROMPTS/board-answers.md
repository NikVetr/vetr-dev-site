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

   The English has already been steered for this where English itself has the
   hazard. "I will show **the way**" rather than "show you"; "One moment, please"
   rather than the imperative "wait"; "What is the name?" rather than "your name".
   Where English has no hazard the English is direct and the dodge is a per-language
   decision: `can-you-walk` is "Can you walk?" in English, Turkish, Georgian and
   Japanese and the impersonal "Is walking possible?" only where a second person
   aimed at the traveller carries their gender -- the concept note in
   `data/concepts/social.csv` lists that set by property, not by name.

   **That steering records a hazard; it is not a template.** A concept in this corpus
   is a language-independent *meaning*, and each language renders it the way that
   language actually says it — so where the hazard does not exist, say the natural
   thing. German and Dutch address a stranger with *Sie* / *u* and neither the pronoun
   nor the imperative carries gender, so `Können Sie gehen?` and `Bleiben Sie hier`
   are right there, and forcing `Ist Gehen möglich?` would be a stilted sentence
   bought for nothing. Where the hazard *is* real — Arabic, Hebrew, Polish, Czech,
   the Indo-Aryan languages — keep the steering, because there the English wording is
   the whole reason the row is sayable at all. A second-person pronoun, an imperative, or an object clitic
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
| `can-you-walk` | Can you walk? | 您能走路吗？ |
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

## Eighteen more, from the answers audit

An audit of every reply set found answers offered to questions they do not answer --
*yes* and *no* to "What is your name?", *I do not know* to "Water, please" -- and
questions a listener could not answer at all. Most of the fix reuses concepts the
corpus has. These eighteen are what nothing said. Everything above binds them: they
are the other person's words, in their ordinary spoken register, gender-neutral about
the traveller *and* about the speaker.

Each concept's `notes` in `data/concepts/social.csv` (and, for the taxi row,
`data/concepts/travel.csv`) says what it means, when it is said and which forms to
avoid, often with the word a counter or a label actually uses in a few languages.
**Read the note before writing the row** -- several of these are one everyday word in
most languages (満席です, 免费, 饭后), and the English is only a gloss for it.

| concept_id | English | file |
|---|---|---|
| `board-answers.my-name-is-blank` | My name is {} | social.csv |
| `board-answers.i-would-rather-not-say` | I would rather not say | social.csv |
| `board-answers.what-happened` | What happened? | social.csv |
| `board-answers.understood` | Understood | social.csv |
| `board-answers.i-will-check` | I will check | social.csv |
| `board-answers.we-have-it` | We have it | social.csv |
| `board-answers.we-are-full` | We are full | social.csv |
| `board-answers.it-is-free` | It is free | social.csv |
| `board-answers.it-does-not-matter` | It does not matter | social.csv |
| `board-answers.only-for-customers` | It is only for customers | social.csv |
| `board-answers.where-to` | Where to? | social.csv |
| `board-answers.at-the-next-stop` | At the next stop | social.csv |
| `board-answers.pay-on-board` | You pay on board | social.csv |
| `board-answers.see-a-doctor` | It is better to see a doctor | social.csv |
| `board-answers.prescription-only` | Only with a prescription | social.csv |
| `board-answers.before-food` | Before food | social.csv |
| `board-answers.after-food` | After food | social.csv |
| `taxi.please-turn-around` | Please turn around | travel.csv |

Particular to these:

- **`my-name-is-blank` has a blank.** `{}` is where the listener's own name goes; the
  screen draws it as a space to fill, and they say it or write it. Keep exactly one
  `{}`, where your language puts a name, and in the romanisation too. It is the
  listener introducing themselves, so no gendered first-person pronoun or polite
  particle: Thai `ชื่อ {}`, not ผม/ดิฉัน or ครับ/ค่ะ.
- **`understood`, `we-have-it`, `i-will-check`** are first person or first plural:
  choose the form that does not show the speaker's gender (a nominal, an impersonal,
  a present). Hindi `समझ गया/गई` is the trap the note names.
- **`taxi.please-turn-around`** is the traveller's own request to a driver, like
  `taxi.please-stop-here` beside it -- the one row here in the traveller's voice. Use
  the everyday U-turn word where there is one.
- **`before-food` / `after-food`** are the words on a medicine label, verbless.

**Two existing rows address a man by default** in some languages and are offered as a
listener's answers now: `introductions.where-are-you-from` (Hebrew, Arabic) and
`introductions.how-are-you` (Hindi, Urdu). If your group has any language where either
row carries the addressee's gender, reword that row in place so it does not -- Polish
"Z jakiego kraju?" and Hebrew "מה המצב?" show the kind of form -- keeping its meaning
and register, and say what you changed and why in your notes. Touch no other existing
row.

**Mechanics.** Append each language's seventeen `board-answers.*` rows to
`data/lang/<code>/social.csv` and its taxi row to `data/lang/<code>/travel.csv`, as
"Where the rows go" above says: the file's exact header, its romanisation column in its
own system, `ipa` blank, `confidence` 2, CRLF. Provenance as the pack's neighbouring rows
do it, ending in this batch's tag `answers-audit-v1`. A row you cannot source is left
out and reported, never guessed. Do not run the builders; run
`python3 scripts/validate_data.py` after each language and fix what it reports about
your rows. Write each language's rows as you finish it, and add its notes -- choices a
native reviewer might question, forms avoided and why, anything left out -- to
`tmp/agent-notes/answers-concepts-<group>.md` then, not at the end.
