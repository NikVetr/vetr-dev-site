# Royal Road web fiction

## Kindle editions in Rating Prediction

**Web fiction** opens 577 individually rated Kindle editions from 504 original Royal Road serials. Each entry links to the specific edition and to the author's serial. The ratings are Amazon reviewers’ whole-star scores through September 2023. For example, *The Perfect Run* has three separately rated books. [Amazon Reviews 2023](https://amazon-reviews-2023.github.io/)

The fit uses 32,459 ratings from 17,062 readers. Of these, 4,364 reviewed at least two different serials and 871 reviewed at least five. There are fewer than five observed reviews for 163 editions. The model shrinks sparse estimates toward the pooled rating distribution. The count in the app describes the research archive, which can differ from today's Amazon count.

| Four ratings supplied per reader | Test readers | Withheld ratings | Log loss, catalog → personalized | RMSE in stars, catalog → personalized |
| --- | ---: | ---: | ---: | ---: |
| Predict another edition | 214 | 1,035 | 0.950 → 0.871 | 0.916 → 0.847 |
| Predict a different serial | 169 | 730 | 1.051 → 0.972 | 1.018 → 0.931 |

Three-fold cross-validation selected two taste classes among 1, 2, 4, 8 and 16 on 13,650 development readers (856 eligible for scoring). Evaluation then used readers held out from all training and selection. For the second test, each reader supplied one rating from each of four distinct serials. Every target came from a further serial, with one randomly chosen edition per serial. The paired reader-bootstrap 95% interval for the improvement in log loss was 0.042–0.115. This measures performance for readers who review multiple serials. [Full evaluation](validation/royalroad-kindle.json)

### Joining the editions

The pinned Royal Road Breakout snapshot contains 45,245 works. The [main crosswalk](royalroad-kindle-crosswalk.csv) identifies one reviewed Kindle edition for each serial. Matching used edition ASINs supplied by the author, agreement between the archived serial and published synopsis, author names and pen names, and publisher or author records where needed. The [alias and renamed-edition audit](royalroad-kindle-aliases.csv) records the evidence for 247 matches, including *Dungeon Crawler Carl* and *The Legend of Randidly Ghosthound*. Box sets and ambiguous matches are excluded. Tags and series names describe the serial. Publication dates and publishers describe the Kindle edition. [Royal Road snapshot](https://huggingface.co/datasets/syuanbo/royalroad-breakout/tree/188fda4f440ec4a020b8ed76e21fe6e0eca51266)

The [numbered editions](royalroad-kindle-volumes.csv) identify separately reviewed installments. For each match we checked the author's serial listing or the publisher's series record against the Kindle title, byline and volume. The author of *The Path of Ascension*, for example, gives the chapter ranges for each collected book. *Threadbare* names all six published volumes. The *Riyria Chronicles* author identifies published books three through five as the works he could post, so *The Death of Dulgath* enters as volume three. The Volume filter uses documented publication order. [The Path of Ascension](https://www.royalroad.com/fiction/40920) · [Threadbare](https://www.royalroad.com/fiction/15130) · [The Riyria Chronicles](https://www.royalroad.com/fiction/71578) · [The Primal Hunter, publisher's series record](https://aethonbooks.com/book/the-primal-hunter/)

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
