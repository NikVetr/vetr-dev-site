# Licensed fanfiction on Kindle

The **Licensed fanfiction · Kindle stars** source predicts Amazon readers’ 1–5 star reviews for 508 stories in 29 fictional worlds. Reader overlap is concentrated in romantic suspense. Susan Stoker’s Operation Alpha accounts for 326 stories and 4,255 of the 7,273 reviews. Miss Fortune contributes 78 stories, the World of de Wolfe Pack 38, and Montana Sky 19. Several smaller worlds have a single story, including *Veronica Mars* and *The Vampire Diaries*. The review snapshot ends in September 2023. [Amazon Reviews 2023](https://amazon-reviews-2023.github.io/) · [Counts by world](validation/kindle-worlds.json)

## What qualifies

Amazon licensed specific properties for commercial fanfiction through Kindle Worlds. It closed the program in 2018, and some of the original edition links have since stopped working. A participating author preserved the notice that Amazon sent to authors. [Amazon’s launch announcement](https://press.aboutamazon.com/2013/6/now-open-kindle-worlds-store-and-self-service-submission-platform) · [Author’s copy of the closure notice](https://samknight.com/?p=2867)

| Publication program in the catalog | Stories | Evidence used for inclusion |
| --- | ---: | --- |
| Kindle Worlds | 67 | The edition title explicitly names Kindle Worlds and identifies the licensed franchise. |
| Kindle Worlds reissues | 8 | The edition identifies itself as a Kindle Worlds story, or the publication note identifies the specific work, franchise and earlier edition. |
| Aces Press | 323 | The individual edition names Special Forces or Police and Fire: Operation Alpha and credits the fanfiction program alongside the writer. Both branches belong to the same Operation Alpha world. |
| J&R Fan Fiction | 78 | The edition names the Miss Fortune world and credits Jana DeLeon’s J&R Fan Fiction as publisher. |
| de Wolfe Pack Connected World | 32 | The edition carries the connected-world title and the owner’s WolfeBane or Dragonblade imprint, with a writer other than the original series creator. |

Susan Stoker describes how other writers use her characters in their stories. Jana DeLeon explains that her company licenses Miss Fortune characters to individual authors for reissues and new stories. WolfeBane publishes the rules defining its relationship to Kathryn Le Veque’s characters and families. Debra Holland maintains a catalog of Montana Sky fanfiction. [Susan Stoker on her program](https://www.ingramspark.com/blog/tips-for-authors-writing-fanfiction) · [J&R Fan Fiction](https://janadeleon.com/jr-fan-fiction/) · [WolfeBane’s connected-world guidelines](https://wolfebanepublishing.com/guidelines/) · [Montana Sky Publishing](https://debraholland.com/kindle-worlds.html)

A story advertised on the back of a different novel supplies no rating for the story. We also exclude clearly identified bundles and ambiguous editions. Four works appeared both in the historical imprint and in an authorized reissue under the same title and writer. For these the catalog keeps the successor edition and counts only its reviews. Contributors come from the edition’s credited roles, which distinguish the writer from the franchise, publisher and foreword author. The catalog provides an external cover URL for all 508 works. For 50 missing from the metadata, the publisher’s ASIN-addressed cover was matched visually to the title. [Verified cover identifiers](kindle-worlds-cover-asins.txt)

## How well the stars predict other ratings

Of the 3,854 reviewers, 245 rated five or more works, 101 rated at least two worlds, and 28 met both criteria. Five stars account for 5,242 of 7,273 ratings. Three-fold cross-validation on development readers selected eight latent classes from 1, 2, 4 and 8 by reader-mean categorical log loss. The separate test set shares no readers with training or selection. Each reader supplied four scores. [Evaluation and all class counts](validation/kindle-worlds.json)

| Held-out prediction | Readers | Targets | Pooled log loss | Personalized log loss | Pooled RMSE | Personalized RMSE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Another story | 50 | 271 | 0.5636 | 0.5639 | 0.570 | 0.564 |
| A story from a world absent from all four supplied ratings | 7 | 7 | 0.3129 | 0.3116 | 0.520 | 0.506 |

The paired reader-bootstrap 95% interval for the gain in log loss was −0.0092 to +0.0072 overall. The test did not establish a log-loss advantage for personalization. For the cross-world check, one eligible target world was chosen per reader and four source ratings came from other worlds. Only seven test readers qualified. Predictions describe published Amazon reviews from this largely single-world population.

## Reproduce

Use the Kindle Store metadata and **0-core** rating-only CSV from the same Amazon Reviews 2023 release. Unreviewed stories remain missing. The program keeps the last dated rating per reader and edition. All distributed model parameters and co-rating counts are aggregates. Raw review text, account histories and cover files stay outside the site. McAuley Lab published the inputs as a research benchmark and requests attribution. Its dataset card specifies no redistribution license. [Product metadata](https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/meta_categories/meta_Kindle_Store.jsonl.gz) · [Rating-only CSV](https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/benchmark/0core/rating_only/Kindle_Store.csv.gz) · [Dataset card](https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023)

```sh
OPENBLAS_NUM_THREADS=1 uv run --no-project --python 3.12 --with pyarrow --with scipy \
  python media-ratings/prepare_kindle_worlds.py \
  /path/to/meta_Kindle_Store.jsonl.gz /path/to/Kindle_Store.csv.gz \
  tmp/agent/kindle-worlds/results
```

The output includes the model JSON, packed co-rating evidence and validation report. The training and split seed is 42. A separate audit of the 2018 Amazon Kindle metadata found only 43 explicitly branded editions, 41 also identified in 2023. The fitted reader profiles use the 2023 release throughout. [2018 source](https://cseweb.ucsd.edu/~jmcauley/datasets/amazon_v2/)
