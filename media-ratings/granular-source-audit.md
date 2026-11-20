# Individual ratings for fanfiction, web serials and subreddits

## Goodreads stars for fanfiction

Select **Fanfiction → Goodreads stars** to use the [365-story fitted catalog](goodreads-fanfiction.json). Each entry links to its Goodreads rating page and its independently verified original on AO3 or FanFiction.net. This noncommercial academic demo publishes fitted rating probabilities, the number of ratings per story, and factual metadata. Individual review histories and co-rating grids stay out of the public files.

The UCSD Book Graph records individual Goodreads reviewers’ whole-star scores. A Goodreads edition can represent a fan work posted on AO3 or FanFiction.net. The story link identifies the original, while the Goodreads link identifies where people rated it. AO3 kudos and FanFiction.net audience certificates measure different things from those Goodreads stars. The source snapshot covers public shelves collected in late 2017. [Wan and McAuley, RecSys 2018](https://doi.org/10.1145/3240323.3240369) · [Wan et al., ACL 2019](https://aclanthology.org/P19-1248/) · [UCSD Goodreads Book Graph](https://cseweb.ucsd.edu/~jmcauley/datasets/goodreads.html)

### Matching ratings to stories

1. Start with all 2,360,655 Goodreads edition records and the complete 228,648,342-row public shelf file. A known fan-work shelf, an archive publisher or a direct AO3/FFN story URL nominates a candidate. Exclude ISBN-bearing editions and named trade publishers to reduce confusion with commercially rewritten fanfiction. Generic fanfiction shelf tags alone nominate several commercially published books in Goodbooks-10k. [Goodreads metadata](https://sites.google.com/eng.ucsd.edu/ucsdbookgraph/books) · [Goodbooks-10k](https://github.com/zygmuntz/goodbooks-10k)
2. Require agreement on the complete story title and at least one credited author in an independent archive. Match case, punctuation and diacritics insensitively, preserving word order. Support named account aliases and a trailing Goodreads series label such as “(Series, #2)”. Collection ranges stay attached. If Goodreads supplies an archive URL, the numerical ID must also agree. Fandoms, scope and canonical story links come from the independent metadata. The FFN snapshot contains approximately 6.6 million records. Some stories also appear on AO3. [AO3 metadata](https://huggingface.co/datasets/yrtsk/archiveofourown-meta/tree/2e516813e7718b4979aae12a88feeec060fd4623) · [FFN metadata schema](https://huggingface.co/datasets/mrzjy/fanfiction_meta/tree/9ec00845c9621244e4e3da52936e9d08ae0578ee)
3. Group editions that share a corroborated original or Goodreads work ID. Exclude groups with conflicting IDs within an archive, conflicting source metadata or an ineligible cross-post. Keep named, English-language fanfiction of at least 100 words with a recorded fandom. Qualifying AO3 works were published by the end of 2017 with General, Teen or Mature certificates. FFN works have K, K+, T or M certificates. The FFN archive omits publication dates. The contemporaneous Goodreads edition attests to the existence of the rated title. Archival links can subsequently change or disappear.
4. Use only stored scores from one to five. Unrated shelf entries, including the source value zero, contribute no response. Collapse repeated identical grades from one reader on the same original. Omit that reader–work pair if edition grades disagree. Each displayed work has at least three distinct scoring readers. This threshold uses counts at the catalog-selection stage. The evaluation describes predicting new people’s ratings within that fixed catalog.

### Held-out prediction

The matched catalog has **365 stories, 4,103 ratings and 1,368 readers**. The primary original links point to 227 works on AO3 and 138 on FanFiction.net. There are 447 readers with two or more scored works and 162 with five or more. A typical story has seven scores (median), and 128 have just three or four. Teen Wolf (137 stories), Harry Potter (118) and Twilight (52) dominate coverage. Goodreads readers who graded multiple stories provide the strongest basis for interpreting these results.

| Four supplied stars per reader | Log loss | RMSE in stars | Brier score for at least four stars |
| --- | ---: | ---: | ---: |
| Per-story baseline | 1.1858 | 0.8848 | 0.1481 |
| Eight-class mixture | 1.1455 | 0.8635 | 0.1416 |

Three development folds selected eight classes from 1, 2, 4 and 8 by mean reader-level log loss. The separate 20% reader holdout contributed 36 eligible readers and 184 unseen scores. Each person supplies four randomly chosen grades and is scored on up to 12 different stories. Repeated editions of the same story never count as separate questions or targets. These are voluntary Goodreads reviews on a historically and thematically narrow sample. [Evaluation](validation/goodreads-fanfiction.json)

A five-fold nested evaluation held out every eligible reader once, reselecting the number of classes on three inner folds. On 880 withheld scores from 162 people, log loss fell from 1.2581 to 1.2247, RMSE from 0.8872 to 0.8735 stars and Brier score from 0.1788 to 0.1740. Four or eight classes won in each training partition. The paired mean change in log loss was −0.0335, with a 95% bootstrap interval of −0.0445 to −0.0229 resampling readers. That interval describes variation across these held-out people for these fitted folds and prompts.

Before the three-reader cutoff, 714 independent originals were verified and 703 had any individual scores. Sixty-six matched works had an edition with a literal original-archive link in the Goodreads metadata. Those works yielded 186 reader–work scores, and four readers scored five or more. Requiring literal links alone would leave very little overlap for validation. The independent title, byline and canonical archive ID check makes the larger catalog possible.

### Reproduction and terms

Obtain the four files listed below from the UCSD source. The authors specify academic use only and prohibit redistribution and commercial use of their datasets. The builder reads locally supplied files and writes the catalog and aggregate validation report for the noncommercial research demo. The AO3 metadata archive is by yrtsk under CC BY-NC 4.0. The FFN archive publisher, mrzjy, labels the release “cc” without a license version. Original authors retain rights to their stories. [UCSD terms and files](https://cseweb.ucsd.edu/~jmcauley/datasets/goodreads.html) · [AO3 release](https://huggingface.co/datasets/yrtsk/archiveofourown-meta) · [FFN release](https://huggingface.co/datasets/mrzjy/fanfiction_meta)

Run from the repository root. The command reads only account and story metadata from the two archive snapshots. Approximately 15 GB of space accommodates the inputs. No chapter text or live crawling is required.

```sh
raw=tmp/agent/granular-audit
mkdir -p "$raw"
base=https://mcauleylab.ucsd.edu/public_datasets/gdrive/goodreads
for name in goodreads_books.json.gz goodreads_book_authors.json.gz goodreads_interactions.csv book_id_map.csv
do
  curl --fail --location "$base/$name" --output "$raw/$name"
done
curl --fail --location \
  https://huggingface.co/datasets/yrtsk/archiveofourown-meta/resolve/2e516813e7718b4979aae12a88feeec060fd4623/combined_metadata.jsonl \
  --output "$raw/ao3_metadata.jsonl"
ffn=https://huggingface.co/datasets/mrzjy/fanfiction_meta/resolve/688bf465f615f11b62c746251c53b7f82eb92497/default/train
for n in 0000 0001 0002 0003 0004
do
  curl --fail --location "$ffn/$n.parquet" --output "$raw/ffn-$n.parquet"
done
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 uv run --no-project --python 3.13 \
  --with duckdb --with pandas --with numpy --with scipy \
  media-ratings/prepare_goodreads_fanfiction.py --goodreads "$raw" --ao3 "$raw/ao3_metadata.jsonl" \
  --ffn "$raw"/ffn-*.parquet --out "$raw/out"
```

The checked UCSD files had the following SHA-256 digests.

| File | SHA-256 |
| --- | --- |
| `goodreads_books.json.gz` | `95429b566e68e713746251f14d36e727adc676a2088e940909d19c47c865a480` |
| `goodreads_book_authors.json.gz` | `85e6628dee5102c70a4a296f6d68c10ff60b0cf72714444b1e721abeffe9f22d` |
| `book_id_map.csv` | `491d0362a769a9c93e8e61fc075286fa25f402d21c5c179564c9b9d81c57b472` |
| `goodreads_interactions.csv` | `a204bcd79e3dec594b3d8da6cbff68598d121c087ff38e7a05589c019ec830eb` |

## Other source checks

Checked November 19, 2026. A reproducible recommendation benchmark needs a stable respondent key, item key and individually recorded score. These public sources preserve different parts of that evidence.

| Source | Available signal and remaining gap |
| --- | --- |
| Royal Road | Two observational studies analyzed authentic reviews. Chizhov counted 71,956 reviews by 32,942 people. ProgressReads analyzed 19,440 reviews on 100 top-rated titles, 88.6% five-star. Both publish summaries. Neither publication provides a download of pseudonymous reviewer, fiction ID and individual score. The Breakout data have one row per work. The chapter archive repeats aggregate work scores across chapters. Native review pages were excluded from crawling in this audit. [Chizhov](https://stepan.chizhov.com/do-review-swaps-influence-top-1000-books-and-other-adventures-of-ratings-on-royal-road/) · [ProgressReads](https://progressreads.com/blog/why-readers-quit-web-novels) · [existing source and access audit](royalroad-data.md#reviews-posted-on-royal-road) |
| SpaceBattles and FicHub | FicHub supports exporting individual SpaceBattles threads as stories. Its public SQL and API describe exports and downloads. I found no public numerical score table linking readers across stories from either project. [FicHub](https://fichub.net/) · [FicHub SQL](https://github.com/FicHub/fichub.net/tree/master/sql) |
| NovelUpdates and Scribble Hub | The NovelUpdates release includes 24,639 titles with work-level statistics. The 17K Scribble Hub release provides story metadata and chapters. Neither release supplies an individual numerical rating history for each reader. [NovelUpdates dataset](https://github.com/shaido987/novel-dataset) · [Scribble Hub corpus](https://huggingface.co/datasets/RyokoAI/ScribbleHub17K) |
| Reddit Community Values | The public UW file has 5,950 rows across 2,138 subreddit names, with granular questions on content quality, safety and other values. Respondents rated multiple communities in the study, but the downloadable table omits a cross-community respondent identifier. Those scores can describe a community in aggregate. They cannot support this respondent-disjoint prediction task. [Survey and public schema](https://behavioral-data.github.io/reddit_values_surveys_public/quant_survey.html) |
| Stanford Human Preferences | SHP records relative preferences between answers to questions from Reddit. The rated objects are responses, so a preference cannot serve as a rating of the subreddit itself. The existing subreddit catalog measures recorded replies. [SHP dataset](https://huggingface.co/datasets/stanfordnlp/SHP) · [reply dataset](https://snap.stanford.edu/data/reddit-reply-networks.html) |
