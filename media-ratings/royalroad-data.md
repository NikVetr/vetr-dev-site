# Royal Road web fiction

## Kindle editions in Rating Prediction

In **Web fiction**, select **Royal Road · Kindle edition stars** to predict whole-star scores for 258 Kindle editions linked to original Royal Road serials. Titles identify the edition being rated, such as *Mother of Learning: ARC 1*. Each item links to both the edition and the original serial. The model learns from individual Amazon reviews through September 2023. [Amazon Reviews 2023](https://amazon-reviews-2023.github.io/)

The fit uses 16,496 ratings from 11,394 readers. Of those readers, 2,273 reviewed at least two matched works and 332 reviewed at least five. There are fewer than five observed reviews for 81 editions. The estimates are most relevant to people who review Kindle editions, particularly those who review several. The number of observed reviews describes the research archive, which can differ from an edition's current Amazon rating count.

| Four supplied ratings per reader | Held-out log loss | Held-out RMSE in stars |
| --- | ---: | ---: |
| Per-edition baseline | 0.8294 | 0.716 |
| Two taste classes | 0.7399 | 0.646 |

Using seed 42, the shared fitter assigned 9,116 readers to development and 2,278 to the holdout. Three development folds included all 273 eligible validation readers. Two classes minimized average reader-level log loss among 1, 2, 4 and 8. Across the 59 eligible holdout readers, the model predicted 243 withheld ratings from four supplied per person. Both methods used identical cases. A preliminary development run capped each validation fold at 2,000 readers. The cap was removed to include every eligible reader. Since the fitter draws test prompts after the development prompts from the same random stream, this also changed the within-reader prompts for the same holdout people. Both runs selected two classes using development data alone. [Full evaluation](validation/royalroad-kindle.json)

### Joining the editions

The published Royal Road Breakout metadata snapshot contains 45,245 works. We searched for original works released by 2023 with a matching author byline in the Kindle metadata, normalizing punctuation, spacing and written aliases. Title agreement identified the same work or its first volume. We reviewed ambiguous first-volume matches, excluded later installments, box sets and unresolved duplicates, and kept a single fiction ID and Kindle parent ASIN per pair. Royal Road tags and series names describe the serial. Publication dates and publisher names describe the Kindle edition. Serials without a matched, reviewed edition are outside this catalog. [Pinned Royal Road source](https://huggingface.co/datasets/syuanbo/royalroad-breakout/tree/188fda4f440ec4a020b8ed76e21fe6e0eca51266), [edition crosswalk](royalroad-kindle-crosswalk.csv)

Several matches illustrate why an exact title search alone misses books or selects the wrong volume.

| Royal Road serial | Matched edition | Independent edition record |
| --- | --- | --- |
| [Emerilia](https://www.royalroad.com/fiction/8262) | [The Trapped Mind Project](https://www.amazon.com/dp/B01MZD5RQX) | [Michael Chatfield's series listing](https://michaelchatfield.com/collections/books/products/the-trapped-mind-project-paperback) |
| [Awaken Online](https://www.royalroad.com/fiction/6597) | [Catharsis](https://www.amazon.com/dp/B01J0E8Z8A) | [Travis Bagwell's reading order](https://www.travisbagwell.com/books/) |
| [Chrysalis](https://www.royalroad.com/fiction/22518) | [The Antventure Begins](https://www.amazon.com/dp/B09T7ZN7NC) | [Aethon Books](https://aethonbooks.com/book/the-antventure-begins/) |
| [Mother of Learning](https://www.royalroad.com/fiction/21220) | [ARC 1](https://www.amazon.com/dp/B09M2R6QLF) | [Google Play Books](https://play.google.com/store/books/details/Mother_of_Learning_ARC_1?id=uj1UEAAAQBAJ) |

### Reproducing the fit

Download the [Royal Road work metadata](https://huggingface.co/datasets/syuanbo/royalroad-breakout/resolve/188fda4f440ec4a020b8ed76e21fe6e0eca51266/embedding/out/books_meta.parquet), [Kindle product metadata](https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/meta_categories/meta_Kindle_Store.jsonl.gz) and [Kindle 0-core ratings](https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/benchmark/0core/rating_only/Kindle_Store.csv.gz). The Royal Road source labels its release MIT. McAuley Lab publishes the Amazon files as a research benchmark and provides a citation. Its dataset card does not specify a redistribution license. The app publishes edition identifiers, factual metadata, model parameters and aggregate counts. Covers load from the source host. [McAuley Lab dataset card](https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023)

```sh
OPENBLAS_NUM_THREADS=1 uv run --no-project --python 3.12 --with pyarrow --with scipy \
  python media-ratings/prepare_royalroad_kindle.py \
  /path/to/books_meta.parquet /path/to/meta_Kindle_Store.jsonl.gz /path/to/Kindle_Store.csv.gz \
  tmp/agent/royalroad-kindle
```

The script validates each crosswalk ID against the source metadata, retains the latest dated review per reader and edition, and fits a sparse reader-by-edition matrix. It writes the browser catalog, the validation report, and the observed per-edition and co-rating counts.

| Source file | SHA-256 of the downloaded file |
| --- | --- |
| `books_meta.parquet` | `fb2df0e5ef5463688d7b62d861b9d6e8b81c34a13c496d8c2d3a988e37ca702d` |
| `meta_Kindle_Store.jsonl.gz` | `743be77d95e16cc341e9b3a005325a89ec327e93ff86255b32232967d7f8a9ca` |
| `Kindle_Store.csv.gz` | `ff546c451edfb403d10099912b816b11600e689a599621167d4847331fdc0a0d` |

## Reviews posted on Royal Road

A review carries an individual overall star score on a 0.5–5 scale, in half-star steps. An advanced review can also rate style, story, grammar, and characters. The model uses the review's overall score. Anonymous star-only ratings feed a work's published statistics, but do not identify which other works the same person rated. [Review score fields](https://api.sh/docs/royalroad-reviews), [Royal Road ratings discussion](https://www.royalroad.com/forums/thread/143749)

### Available sources

Stepan Chizhov's top-1,000 analysis counted 71,956 reviews from 32,942 reviewers. The study identifies at least 28 people with five or more reviews, confirming overlap across works. His published results give summary statistics and describe request timing agreed with Royal Road moderators. They do not supply a reusable reader-by-work table or establish how many readers would qualify for each split of this model's four-rating evaluation. The Royal Road Breakout release contains one row per work, including aggregate follower counts. The RoyalRoad-1.61M fields include work scores repeated across chapters. The mining-royal-road repository contains scraper code. [Chizhov's study](https://stepan.chizhov.com/do-review-swaps-influence-top-1000-books-and-other-adventures-of-ratings-on-royal-road/), [Breakout dataset](https://huggingface.co/datasets/syuanbo/royalroad-breakout), [chapter corpus schema](https://huggingface.co/datasets/OmniAICreator/RoyalRoad-1.61M), [mining-royal-road](https://github.com/p-manivannan/mining-royal-road)

As checked on November 19, 2026, Royal Road’s robots file disallows `/fictions/review/` for general crawlers and lists additional restrictions for named crawlers. The Terms of Service link in Royal Road's footer returned HTTP 403 during this check. A published API response example confirms the necessary review fields but does not grant permission to harvest and republish site data. An authorized export containing stable pseudonymous reviewers, fiction IDs and individual overall scores would support an ordinal catalog. [Official robots file](https://www.royalroad.com/robots.txt), [official terms](https://www.royalroad.com/tos), [Royal Road support](https://www.royalroad.com/support/knowledgebase/100)

### Using an authorized review export

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
