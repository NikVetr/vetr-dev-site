# Fanfiction and original web fiction

Both catalogs predict a recorded action on Archive of Our Own (AO3). A reader can answer **Gave kudos** or **No kudos**, or leave the work unanswered. The estimate is the probability that a reader with this response profile had a public kudos on that work in the snapshot. Readers may never have encountered a work that lacks their kudos. The data do not distinguish exposure, enjoyment, and the decision to post.

Kovacs, Chee and Dean collected 45,936,871 public reader–work kudos during March–May 2024, replacing usernames with numerical IDs. Their release covers a subset of the Webis corpus and requires at least three public interactions per user and per work in the source. We collapse repeated reader–work pairs and join AO3 work IDs to the separate metadata archive. Guests' kudos do not identify a reader and do not enter the model. The deployed files contain work metadata, fitted parameters, marginal counts and pair tables. [Research project](https://github.com/sdean-group/Navigating-Sensitivity), [kudos release](https://huggingface.co/datasets/sdeangroup/NavigatingSensitivity), [metadata release](https://huggingface.co/datasets/yrtsk/archiveofourown-meta)

## Catalogs

The inventory covers English works of at least 1,000 words with a single fandom, an author-assigned **General Audiences**, **Teen And Up Audiences**, or **Mature** rating, and at least 10 distinct public readers giving kudos in the research release. The 300 fanfiction slots include up to 35 each for Harry Potter, Naruto and Worm. Remaining slots go to the highest-kudos eligible titles across fandoms. A few source aliases map to each of these three fandoms. The separate original-fiction catalog selects up to 150 of the most-kudosed eligible works whose sole fandom is **Original Work**. These are published AO3 works, which may range from one-shots to serials. The final inventory contains 35 Harry Potter, 35 Naruto, and four Worm works. The original-fiction catalog contains 146 works. Both populations and popularity counts refer to the research snapshot.

FanFiction.net's Flipper project offers a substantial offline recommendation database as part of a server bundle. Its instructions describe local hosting, and do not specify a separate data license. The AO3 research archive supplies both a data license and a collection window. Royal Road Breakout publishes one row per book, including aggregate followers and text embeddings. The mining-royal-road project supplies collection code. Neither of these Royal Road sources supplies a release of pseudonymous reader-by-title responses. [Flipper](https://github.com/Zeks/flipper), [Royal Road Breakout data card](https://huggingface.co/datasets/syuanbo/royalroad-breakout), [Royal Road mining project](https://github.com/p-manivannan/mining-royal-road)

## Model and evaluation

Each domain samples up to 50,000 whole readers without replacement from those with at least one public kudos on the selected titles. A complete binary reader profile records kudos on each catalog title. A Bernoulli latent-class mixture estimates a separate event probability per title per class, with 16 pseudo-observations centered on the title's pooled probability. The fit uses a sparse indicator matrix for kudos, accounting for zeroes algebraically. Supplying volunteered kudos can otherwise favor classes that give many kudos across the board. A calibration step shrinks the class-specific expected number of kudos toward the pool on a log scale with strength 0, 0.5, or 1. A per-title logit adjustment then restores each work’s pooled event frequency. Cross-validation selects this strength along with the class count. When a user enters responses, the app conditions the class weights on those responses and marginalizes over the classes for every remaining title.

A seeded 20% test split holds out entire readers. Three-fold cross-validation on the remaining readers compares 1, 2, 4, 8, 16 and 32 classes using reader-mean binary log loss. Each validation fold scores up to 2,500 randomly ordered readers, subject to having at least two positive events. Each eligible test or validation reader supplies up to four randomly chosen kudos, leaving at least one positive as a target. The model predicts the status of every remaining title. Recall@10 measures the fraction of each reader's remaining kudos that appear among the ten highest-ranked suggestions. The fixed inventory and familiarity counts use the source snapshot's marginal work totals. These checks assess predictions for unseen readers of that inventory, without testing future time periods or new works.

| Domain | Eligible readers | Readers in final fit | Held-out readers scored | Hidden kudos | Log loss, pooled → personalized | Recall@10, pooled → personalized |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fanfiction | 352,021 | 50,000 | 5,229 | 16,941 | 0.0582 → 0.0498 | 11.9% → 38.7% |
| Original web fiction | 6,276 | 6,276 | 232 | 252 | 0.0396 → 0.0318 | 43.7% → 66.9% |

Both catalogs selected 32 classes, the largest count in the grid. Fanfiction selected full activity shrinkage, while original web fiction selected the uncalibrated mixture. The web-fiction result comes from a much smaller test cohort. [Fanfiction metrics](validation/fanfiction.json), [web fiction metrics](validation/webfiction.json)

## Rebuild

Run with Python, pandas, NumPy and SciPy from the repository root. The two raw inputs occupy approximately 8 GiB and remain in ignored scratch. The interaction file's SHA-256 is `55c3cf2ec53be556562e26f7d9b6d6a6e574ffb598c1f3a38174c0d3dfa56c80`. The metadata file's SHA-256 is `efb74198cc8fe2b20d0b45e9adb328da48bb4b80e95157901f0c42468fb43fdd`.

```sh
raw=tmp/agent/fiction-catalogs
mkdir -p "$raw"
curl --fail --location --output "$raw/ao3_interaction_table.csv" \
  https://huggingface.co/datasets/sdeangroup/NavigatingSensitivity/resolve/ca339b1c8f0652d4f22a5b41fe60c98578e63917/ao3_interaction_table.csv
curl --fail --location --output "$raw/ao3_metadata.jsonl" \
  https://huggingface.co/datasets/yrtsk/archiveofourown-meta/resolve/2e516813e7718b4979aae12a88feeec060fd4623/combined_metadata.jsonl
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python media-ratings/prepare_ao3.py "$raw"
python media-ratings/test_ao3.py
```

The catalogs, fitted aggregates, and evidence tables adapt *Navigating Sensitivity* by Amelia Kovacs, Jerry Chee and Sarah Dean and *Archive Of Our Own (metadata only)* by yrtsk. Both datasets and these adaptations use CC BY-NC 4.0. Changes comprise deduplication, joining, cohort and catalog selection, fandom aliases, statistical fitting, and aggregate evidence generation. Individual works remain with their respective creators. [Navigating Sensitivity](https://huggingface.co/datasets/sdeangroup/NavigatingSensitivity), [AO3 metadata](https://huggingface.co/datasets/yrtsk/archiveofourown-meta), [license](https://creativecommons.org/licenses/by-nc/4.0/)
