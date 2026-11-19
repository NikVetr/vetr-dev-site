# Fanfiction and original web fiction

Both catalogs predict a recorded action on Archive of Our Own (AO3). A reader can answer **Gave kudos** or **No kudos**, or leave the work unanswered. The estimate is the probability that a reader with this response profile had a public kudos on that work in the snapshot. Readers may never have encountered a work that lacks their kudos. The data do not distinguish exposure, enjoyment, and the decision to post.

Kovacs, Chee and Dean collected 45,936,871 public reader–work kudos during March–May 2024, replacing usernames with numerical IDs. Their release covers a subset of the Webis corpus and requires at least three public interactions per user and per work in the source. We collapse repeated reader–work pairs and join AO3 work IDs to the separate metadata archive. Guests' kudos do not identify a reader and do not enter the model. The deployed files contain work metadata, fitted parameters, marginal counts and pair tables. [Research project](https://github.com/sdean-group/Navigating-Sensitivity), [kudos release](https://huggingface.co/datasets/sdeangroup/NavigatingSensitivity), [metadata release](https://huggingface.co/datasets/yrtsk/archiveofourown-meta)

## Catalogs

The fanfiction catalog contains **10,466 works in 56 fandoms**, including the previous 2,873 titles. Within each fandom the inventory prioritizes distinct public readers who gave kudos. The catalog combines the top 300 eligible single-fandom works of at least 1,000 words and ten kudos, dedicated shelves for ten franchises, and up to 200 additional works per other fandom present in those selections. A crossover has one work ID and may qualify for several shelves. The 42 fandoms with at least 200 works include the following.

| Fandom | Works | Fandom | Works |
| --- | ---: | --- | ---: |
| Harry Potter | 564 | Naruto | 501 |
| Marvel Cinematic Universe | 478 | Batman | 290 |
| Supernatural | 274 | Teen Wolf | 272 |
| Sherlock | 259 | Star Wars | 258 |
| My Hero Academia | 254 | Game of Thrones / A Song of Ice and Fire | 251 |
| DC Universe | 236 | Merlin (BBC) | 234 |
| BTS | 218 | Star Trek | 216 |
| Hannibal (TV) | 214 | Voltron: Legendary Defender | 211 |
| One Piece | 210 | The Hobbit | 208 |

Fourteen fandoms have fewer than 200 eligible matches in this particular join of ratings and metadata. All qualifying works in those shelves are included. Examples are *Avatar: The Last Airbender* (195), *Welcome to Night Vale* (91), *The Chronicles of Narnia* (78), *Worm* (8), and *Heaven Official's Blessing* (3). The validation file lists the eligible and selected counts for all 56 fandoms under `sourceCounts.fandomInventory`. [Complete fandom inventory](validation/fanfiction.json)

The original web fiction catalog includes **all 320 eligible works** whose sole fandom is *Original Work*, including all 146 titles in the previous catalog. Both catalogs require an English-language work of at least 100 words, a title, at least three distinct public readers in the snapshot, and an author-assigned **General Audiences**, **Teen And Up Audiences**, or **Mature** rating. Work dates, word counts, chapter counts, completion status, audience ratings, source links and author credits come from the metadata snapshot. The fanfiction catalog includes 2,191 works with multiple source fandom tags. Among the 18 English Worm works identified across the joined public release, eight meet the audience scope and the other ten carry the Explicit rating.

FanFiction.net's Flipper project offers a substantial offline recommendation database as part of a server bundle. Its instructions describe local hosting and leave the database's separate redistribution terms unspecified. Royal Road Breakout publishes one row per book, including aggregate followers and text embeddings. The mining-royal-road project supplies collection code. Fitting the same kind of model for those sites would require reader-by-title observations with usable terms. [Flipper](https://github.com/Zeks/flipper), [Royal Road Breakout data card](https://huggingface.co/datasets/syuanbo/royalroad-breakout), [Royal Road mining project](https://github.com/p-manivannan/mining-royal-road)

## Model and evaluation

Each domain includes every reader with at least one public kudos on a selected work. A Bernoulli latent-class mixture estimates one event probability per work per class, with 16 pseudo-observations centered on the work's pooled probability. EM accumulates the exact counts in batches of 8,192 reader profiles. A calibration step shrinks each class's expected number of kudos toward the population average on a log scale with strength 0, 0.5 or 1. A per-title logit adjustment restores each work's pooled event frequency. A supplied kudos or absence updates the reader's class probabilities. One shared fanfiction fit uses all responses across fandoms, including when recommendations are filtered to a single fandom.

A seeded test split reserves 20% of readers, capped at 10,000, before model selection. Three reader-disjoint folds from up to 40,000 development readers compare 1, 2, 4, 8, 16, 32 and 64 classes and the calibration strengths. Each fold scores up to 2,500 randomly ordered validation readers, subject to having at least two positive events. Each eligible reader supplies up to four randomly chosen kudos, leaving at least one positive. Mean binary log loss across the other works selects the model. Recall@10 measures the fraction of each reader's hidden kudos in their ten highest-ranking suggestions. Holdout evaluation fits the selected specification on all development readers, then the published model is refit on everyone. The fixed catalog and popularity counts use snapshot-wide totals. The holdout tests unseen readers of this catalog in the same collection window.

| Domain | Readers in final fit | Public kudos | Held-out readers scored | Hidden kudos | Log loss, pooled → personalized | Recall@10, pooled → personalized |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fanfiction | 698,137 | 5,610,834 | 7,027 | 55,932 | 0.00563 → 0.00486 | 2.80% → 10.71% |
| Original web fiction | 7,160 | 9,314 | 276 | 300 | 0.01948 → 0.01509 | 38.66% → 65.06% |

Fanfiction selected 32 classes and full activity shrinkage. Original web fiction selected 64 classes and half shrinkage. Within-fandom Recall@10 rose from 14.98% to 21.00% for 1,535 Harry Potter readers and from 23.90% to 27.02% for 477 Naruto readers with at least one hidden kudos in those fandoms. Among readers supplying at least one kudos outside the target fandom, the corresponding comparisons were 15.79% → 21.33% and 24.13% → 27.11%. Across the 53 fandoms with more than ten titles and at least 20 test readers, personalization improved within-fandom Recall@10 in 42. The report gives comparisons and sample sizes for every fandom. For shelves of ten or fewer titles, Recall@10 includes the entire candidate list. [Fanfiction metrics](validation/fanfiction.json), [original web fiction metrics](validation/webfiction.json)

Each released evidence file stores a pair's count of readers who gave both kudos as a little-endian 16-bit integer. The evidence manifest stores each work's full marginal counts and the cohort size. The larger fanfiction evidence table is partitioned in triangular pair order, with at most 4 MiB of uncompressed counts per file. Selecting a comparison loads its shard on demand. The overlap and marginals suffice to reconstruct all four cells in either order, including counts greater than 65,535 for the joint absence of a kudos.

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
