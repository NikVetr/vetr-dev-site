# Amazon video game edition ratings

The **Amazon · edition stars** source in Video games predicts whole-star customer ratings for 1,184 game editions across 29 platforms, including console exclusives and older systems. It uses 596,548 recorded reviews from 436,436 people. A reviewer who never scored an edition contributes a missing value. Steam and Metacritic use their own review scales and separate rating shelves. [Amazon Reviews 2023](https://amazon-reviews-2023.github.io/)

A rating belongs to an Amazon parent product listing. This distinction matters for ports, remasters and collector's editions. Two listings for the same game can differ in performance, packaging, included content, price and customer experience. Amazon can also group product variants on one listing. The displayed platform is the one identified in the source listing. The published rating count counts the individual ratings in this research archive through September 2023.

| Edition example | Observed 1–5 star ratings |
| --- | ---: |
| [Super Mario Odyssey for Nintendo Switch](https://www.amazon.com/dp/B087SHFL9B) | 3,369 |
| [Halo 4 for Xbox 360](https://www.amazon.com/dp/B00BQVXUOA) | 2,145 |
| [Minecraft Java Edition for PC/Mac](https://www.amazon.com/dp/B010KYDNDG) | 1,754 |

## Selecting playable editions

The full product file includes 137,269 listings, and the 0-core ratings file contains 4,555,500 reviews. We required the Video Games department, a console or computer category path ending in Games, a game-compatible product format, and at least 25 distinct reviewers. We excluded explicit add-ons, game currency and equipment. Reviewing the actual shelf identified additional miscategorizations, including power adapters, replacement cases, console bundles, standalone expansions and a disk utility. Digital storefront listings needed a recognizable hardware platform. The builder drops conflicting explicit platforms and keeps the most-reviewed listing when two entries would have exactly the same display title. [Audited product exclusions](amazon-games-excluded.csv)

Of the 6,837 eligible listings with at least 25 reviews, the shelf takes the 500 most-reviewed editions first. It then includes up to 45 per platform, with ties broken by the stable parent ASIN. The smallest included edition has 25 reviews and the largest has 11,836. Platform coverage ranges from one Atari 2600 title to 79 PlayStation 3 titles. All editions link directly to their Amazon listing and have externally hosted cover images. The product metadata supplies edition release years for 994. [Platform inventory and validation](validation/amazon-games.json)

## Evaluation

The fit compares smoothed categorical taste-class models with 1, 2, 4, 8 and 16 classes. Each class learns a distribution over the five star values for every edition. The seed-42 split reserves one fifth of the reviewers for the test. Three development folds compare models using average reviewer-level log loss, with each eligible reviewer supplying four ratings to predict up to twelve others. All 8,882 reviewers with five or more rated editions are available across these development and test partitions. The baseline predicts from each edition's rating distribution. The final catalog fits all 436,436 reviewers, including 80,183 who rated at least two editions.

Four classes achieved the lowest validation log loss across 7,145 eligible development reviewers. In a separate group of 1,737 reviewers, four supplied scores per person helped predict 6,032 other ratings. The paired holdout results use identical supplied and target ratings for each model. They measure recorded Amazon ratings among reviewers with enough cross-title history. [Complete cross-validation and holdout metrics](validation/amazon-games.json)

| Model | Average log loss | RMSE in stars | Brier score for ≥4 stars |
| --- | ---: | ---: | ---: |
| Per-edition baseline | 1.0815 | 1.1128 | 0.1475 |
| Four taste classes | 0.9951 | 1.0367 | 0.1337 |

## Reproduce

Download the [product file](https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/meta_categories/meta_Video_Games.jsonl.gz) and [0-core rating-only file](https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/benchmark/0core/rating_only/Video_Games.csv.gz) into project scratch. The source file records the reviewer ID, listing ID, whole-star rating and timestamp. Preparation keeps the most recent response for a reviewer and edition and checks that equal latest timestamps agree. The site serves the model, item metadata and aggregate co-rating tables. The source download links and prepared respondent matrix are only needed for the offline fit. [McAuley Lab's data format and citation](https://amazon-reviews-2023.github.io/data_processing/0core.html), [Hou et al.](https://arxiv.org/abs/2403.03952)

```sh
game_data=tmp/agent/game-editions
OPENBLAS_NUM_THREADS=1 uv run --no-project --with duckdb --with scipy \
  python media-ratings/prepare_amazon_games.py prepare \
  "$game_data/meta_Video_Games.jsonl.gz" "$game_data/Video_Games.csv.gz" "$game_data"
OPENBLAS_NUM_THREADS=1 uv run --no-project --with duckdb --with scipy \
  python media-ratings/prepare_amazon_games.py fit "$game_data" "$game_data/output"
```

| Input file | SHA-256 |
| --- | --- |
| `meta_Video_Games.jsonl.gz` | `ced9696b0874121327a438bfe9d3d01aba45da158e58f94f4920352d75fc1fc9` |
| `Video_Games.csv.gz` | `30692f9806e33a7b5d8b599b73d7ca33dbfefb0abdfc1578052a101f2e64b3cd` |

McAuley Lab publishes Amazon Reviews 2023 as a research benchmark and requests attribution. Its dataset card does not name a redistribution license. Raw reviewer records, written reviews and cover files remain outside the public site. [Source dataset card](https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023)
