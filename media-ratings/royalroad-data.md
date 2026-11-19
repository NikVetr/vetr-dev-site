# Royal Road review scores

A review carries an individual overall star score on a 0.5–5 scale, in half-star steps. An advanced review can also rate style, story, grammar, and characters. The model uses the review's overall score. Anonymous star-only ratings feed a work's published statistics, but do not identify which other works the same person rated. [Review score fields](https://api.sh/docs/royalroad-reviews), [Royal Road ratings discussion](https://www.royalroad.com/forums/thread/143749)

## Available sources

Stepan Chizhov's top-1,000 analysis counted 71,956 reviews from 32,942 reviewers. The study identifies at least 28 people with five or more reviews, confirming overlap across works. His published results give summary statistics and describe request timing agreed with Royal Road moderators. They do not supply a reusable reader-by-work table or establish how many readers would qualify for each split of this model's four-rating evaluation. The Royal Road Breakout release contains one row per work, including aggregate follower counts. The RoyalRoad-1.61M fields include work scores repeated across chapters. The mining-royal-road repository contains scraper code. [Chizhov's study](https://stepan.chizhov.com/do-review-swaps-influence-top-1000-books-and-other-adventures-of-ratings-on-royal-road/), [Breakout dataset](https://huggingface.co/datasets/syuanbo/royalroad-breakout), [chapter corpus schema](https://huggingface.co/datasets/OmniAICreator/RoyalRoad-1.61M), [mining-royal-road](https://github.com/p-manivannan/mining-royal-road)

As checked on November 19, 2026, Royal Road’s robots file disallows `/fictions/review/` for general crawlers and lists additional restrictions for named crawlers. The Terms of Service link in Royal Road's footer returned HTTP 403 during this check. A published API response example confirms the necessary review fields but does not grant permission to harvest and republish site data. An authorized export containing stable pseudonymous reviewers, fiction IDs and individual overall scores would support an ordinal catalog. [Official robots file](https://www.royalroad.com/robots.txt), [official terms](https://www.royalroad.com/tos), [Royal Road support](https://www.royalroad.com/support/knowledgebase/100)

## Using an authorized review export

`prepare_royalroad.py` reads a local UTF-8 CSV. Use one consistent snapshot and a stable pseudonym for each reviewer across all works. The four required column names are:

| Column | Value |
| --- | --- |
| `reviewer_id` | Nonempty stable reviewer ID or pseudonym |
| `fiction_id` | Positive numerical Royal Road fiction ID |
| `title` | Work title, consistent for a given fiction ID |
| `overall_score` | Individual reviewer's overall score, from 0.5 to 5 in half-star steps |

The adapter collapses repeated identical scores. Conflicting scores for one reviewer and work, missing fields, or invalid stars produce an error with the CSV line number. If the export includes revisions, resolve the current review in the source before fitting. Missing reviews contribute no score. Titles with different fiction IDs remain distinct. The overlap audit counts readers with at least two or five reviewed works. Its within-reader pair count gives a reviewer with *n* works one contribution per pair, *n(n–1)/2*.

Supply a source JSON with `title` (export name), `author` (attributed provider), `url` (public HTTPS source reference), `license` (applicable permission or license), and `notes` (collection dates, coverage and intended use). An optional HTTPS `licenseUrl` can link to published terms. Keep private agreements, reviewer identifiers, and raw reviews outside the public site.

```sh
python media-ratings/prepare_royalroad.py /path/to/reviews.csv --audit-only
OPENBLAS_NUM_THREADS=1 python media-ratings/prepare_royalroad.py /path/to/reviews.csv \
  --source /path/to/source.json --out tmp/agent/royalroad-fit
```

The fit uses the app's shared respondent-disjoint three-fold selection and 20% holdout. Each scored reader supplies four reviews and has at least one other review to predict. The program reports an error if the export has inadequate overlap in any evaluation split. The validation file compares candidate class counts and the pooled baseline. In Rating Prediction, **Import fitted catalog** opens the resulting `royalroad.json`. The optional catalog contains aggregate model probabilities and title metadata. The preparer also writes `royalroad-validation.json` beside it. The unit tests exercise the adapter with synthetic reviews.
