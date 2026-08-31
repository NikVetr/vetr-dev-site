# Task template: translate one section into one language

Fill in the placeholders and hand this to a model, one section at a time. One
section per task keeps the output reviewable and keeps a single bad row from
contaminating a whole language.

---

You are producing travel-phrase translations for a printed pocket reference.

**Target language:** `<endonym> (<bcp47>)`, written in `<script name>`.
**Register:** neutral-polite — what a visiting adult would say to a stranger.

Below is a CSV of concepts with their English glosses. For each row, return the
same `concept_id` plus:

- `text` — the phrase in `<language>`, in its own script, as a fluent speaker
  would actually say it. Not a word-for-word rendering of the English.
- `romanization_<system>` — the standard transliteration.
- `ipa` — broad IPA, no narrow allophonic detail.
- `literal` — a literal back-translation, only where it differs usefully from the
  gloss. Otherwise leave blank.

Rules:

1. Return only the CSV, with the header row, one row per input row, same order.
2. Never change a `concept_id`.
3. `{}` in a gloss is a blank the traveller fills in. Keep exactly one `{}` in
   your `text`, positioned where the language wants it.
4. If a concept does not exist naturally in `<language>`, or would be rude or
   misleading to say, leave `text` blank and explain in `literal`. Do not
   invent a calque.
5. Set `confidence` to `0` and `provenance` to your model name. Do not claim a
   human review.
6. Flag anything you are unsure of in `literal` rather than guessing silently.

**Concepts:**

```
<paste the section's concepts CSV here>
```
