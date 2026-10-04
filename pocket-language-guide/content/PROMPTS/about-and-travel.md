# About me, the people with me, and three ways of getting around

Five new board screens want sentences the corpus does not have. The source policy, the
row format, `confidence`, `provenance` and every check are
`content/PROMPTS/add-a-language.md`'s; speaker gender is
`content/PROMPTS/speaker-variants.md`'s. This is only what is particular to this job.

```
about-me.i-am-a-student                     I am a student
about-me.i-am-retired                       I am retired
about-me.i-am-a-teacher                     I am a teacher
about-me.i-am-a-doctor                      I am a doctor
about-me.i-am-a-nurse                       I am a nurse
about-me.i-am-an-engineer                   I am an engineer
about-me.i-work-in-an-office                I work in an office
about-me.i-have-my-own-business             I have my own business
family-intros.this-is-my-mother             This is my mother
family-intros.this-is-my-father             This is my father
family-intros.this-is-my-brother            This is my brother
family-intros.this-is-my-sister             This is my sister
family-intros.this-is-my-partner            This is my partner
family-intros.this-is-my-colleague          This is my colleague
air-travel.where-is-check-in                Where is check-in?
air-travel.which-gate                       Which gate?
air-travel.where-is-the-security-check      Where is the security check?
air-travel.my-luggage-did-not-arrive        My luggage did not arrive
air-travel.i-would-like-a-window-seat       I would like a window seat
air-travel.i-would-like-an-aisle-seat       I would like an aisle seat
hitchhiking.can-you-give-me-a-ride          Can you give me a ride?
hitchhiking.where-are-you-going             Where are you going?
hitchhiking.i-only-need-to-go-to-the-next-town  I only need to go to the next town
hitchhiking.is-there-room-for-two           Is there room for two?
hitchhiking.i-can-pay-for-fuel              I can pay for fuel
hitchhiking.thank-you-for-the-ride          Thank you for the ride
outdoors.can-we-camp-here                   Can we camp here?
outdoors.is-it-safe-to-swim-here            Is it safe to swim here?
outdoors.are-there-dangerous-animals-here   Are there dangerous animals here?
```

## Writing them

- **Said to a stranger, neutral-polite**, in the register the pack's other rows of the
  same kind use -- `introductions.*` for the first fourteen, `transit-rides.*` and
  `taxi.*` for the travel ones, `hiking-parks.*` for the outdoor ones. Punctuate as the
  pack punctuates its other statements and questions.
- **The speaker's gender.** A profession, "a student" and "retired" agree with the
  speaker in many languages (Spanish *profesor/profesora*, German *Lehrer/Lehrerin*,
  Russian, Hindi, Hebrew, Arabic...). Where the language declares `speaker_gender` in
  `data/registry/speaker-axes.csv`, the base row is the declared default and the other
  form goes in `data/lang/<code>/variants.csv`, exactly as speaker-variants.md says --
  never a slash. Where a language does not declare the axis, use its gender-neutral
  form if it has one and say so; do not declare an axis.
- **The family rows follow the language's own `family-intros.this-is-my-husband` row**
  (already on disk): the same construction, agreement with the person introduced, and
  the humble or honorific word the language uses for one's own family when introducing
  them to an outsider (Japanese 母・父, not お母さん・お父さん, as the husband row uses
  夫). "My partner" is a romantic partner, in the most neutral respectful word the
  language has -- not a business partner; say which word and why. "My colleague" is a
  work colleague.
- **Air travel** uses the words the language's own airports sign (check-in, gate,
  security) -- the language's Wikipedia and airport or airline guidance are the
  sources. Seats are the passenger asking at check-in.
- **Hitchhiking** is said to a driver who has stopped: polite, direct, local ("fuel"
  in the word drivers use -- *petrol*, *gas*, *essence*).
- **Outdoors** is generic: wild camping, swimming in a lake or the sea, animals that
  could hurt someone.
- Where a sentence has no natural equivalent, or would be odd to say, leave the row
  out and say why rather than calque it.
- Rows go at the end of `data/lang/<code>/intro.csv` (about-me, family-intros),
  `travel.csv` (air-travel, hitchhiking) and `hike.csv` (outdoors), `ipa` left empty for
  the builder, keeping each file's `\r\n` line endings (read and write with
  `newline=''`; append new lines rather than rewriting the file, as `build_ipa.py`
  does, so no untouched line changes). Romanised packs author their romanisation cell.

## The sections' titles

Add, after the `kind-words` row of `data/registry/section-titles/<code>.csv`, one row
each for `about-me` ("About me"), `air-travel` ("Air travel"), `hitchhiking`
("Hitchhiking") and `outdoors` ("Outdoors"), in the language's own words. **Keep the
file's line endings exactly as they are** -- several of these files are LF and some
mix a CRLF header with an LF body; change nothing but the four new lines.

## Checks

For your languages only -- other agents write other languages in the same tree at the
same time, so never run a builder without `--only`:

```
python3 scripts/build_ipa.py --only <codes>
python3 scripts/build_ipa.py --check --only <codes>
python3 scripts/validate_data.py            # no errors in your languages
node scripts/speaker_coverage.mjs <code>    # for a language with a speaker axis
git diff --numstat -- data/lang data/registry   # every line of yours an addition
```

`uk` and `mr` need the eSpeak environment `content/PROMPTS/family-intros.md` gives;
`km` is authored, so write its IPA by hand as its pack does. Do not run the charset
rewrite, `build_board_index.mjs` or `build_shell.mjs`, and do not commit.

## Report

Per language: the twenty-nine sentences (and any variant rows), the register chosen, a
source for anything that needed deciding, and the four titles. Write it to
`tmp/notes/agents/about-travel-<group>.md` after each language, not at the end.
