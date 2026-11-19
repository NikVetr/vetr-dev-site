# Film and TV credits

| Catalog | Titles | Director | Lead cast | Production company |
| --- | ---: | ---: | ---: | ---: |
| Films | 500 | 500 | 500 | 500 |
| TV series and miniseries | 383 | 291 | 312 | 119 |

Film credits come from Rounak Banik’s July 2017 TMDB extract, published under CC0. Each MovieLens film has a unique IMDb ID in the metadata, which supplies the TMDB movie ID used in the credits table. Directors have the explicit crew job `Director`. Cast follows billing order, retaining the first five distinct names or the complete cast when shorter. Studios are credited production companies. For example, *The Matrix* credits both Lana and Lilly Wachowski. In this shelf, every distinct name within a role maps to one TMDB person or company ID. [The Movies Dataset and attribution](https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset) · [Film credits](film-creators.json)

TVmaze supplies up to five members of each show’s main cast in its published order, which reflects appearances. Its show metadata is adapted under CC BY-SA 4.0. Each TV entry links to its source show. Wikidata supplies series-level director and production-company statements, joined by exact IMDb ID. Ambiguous entity matches and missing English labels are omitted. A series may credit multiple directors who worked on different episodes. Production companies have a distinct role from broadcast networks. Missing credits produce an empty list. [TVmaze API, attribution and licensing](https://www.tvmaze.com/api#licensing) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) · [Wikidata CC0](https://www.wikidata.org/wiki/Wikidata:Licensing) · [TV credits](tv-creators.json)

## What the credits add to film predictions

People who rate one film unusually highly or poorly sometimes give related films a similar rating. The personalized model transfers that rating difference between films with the same director, cast members or production companies. A purely descriptive match can already be explained by the existing rating correlations and MovieLens tags. The comparison tests the additional predictive value of the credits.

Within each role, similarity is the number of shared credits divided by the geometric mean of the two list sizes. The three roles receive equal weight for films with complete records. This similarity is added to the existing film kernel for distinct film pairs. The original diagonal and ridge of 0.5 are preserved. With all tested weights below 0.5, the regularized matrix stays positive definite. Companies and people have separate ID sets for each role. November 2026 TV credits support browsing. The predictive comparison uses only the film credits available in the 2017 extract.

The comparison fixed the existing title-choice and calendar model, varied only the credit weight across 0, 0.05, 0.15 and 0.30, and selected the smallest weight attaining the best validation respondent-average category log loss. **0.30** performed best on 2,000 validation respondents (1.56618 versus 1.56649). A matched test used four ratings from each of 3,000 other respondents. A second test applied the locked weight to respondents new in 2019 after training through 2017. That historical fit uses the rating-correlation kernel alone as its starting similarity because the available MovieLens tags postdate the cutoff. Both tests use the project’s established respondent splits. [Personalization benchmark](predictor-comparison.md) · [Complete results](validation/creator-credits.json)

| Four supplied ratings | People | Target ratings | Log loss, previous → with credits | Paired difference, 95% CI | RMSE, previous → with credits |
| --- | ---: | ---: | ---: | ---: | ---: |
| Random volunteered titles | 3,000 | 196,480 | 1.570207 → 1.569924 | −0.000283 [−0.000471, −0.000095] | 0.904286 → 0.904026 |
| First titles in 2019, strictly later targets | 5,657 | 357,068 | 1.776580 → 1.775940 | −0.000640 [−0.000818, −0.000461] | 0.915257 → 0.914475 |

The intervals use paired respondent-level differences. The gains are small and consistent across these two tests. The film default uses the selected weight. Its population forecasts and class membership calculations still use the original class distributions. Shared credits adjust predictions for unrated films after the user supplies ratings.

## TV series holdout

The TV comparison recovered all 49,275 catalog ratings from MovieLens 32M and reproduced the published 16-class baseline. Each test respondent supplied four series ratings. An additional adjustment transferred the difference from the leave-one-out predicted rating to series with explicitly shared cast, directors or production companies. Credit names were matched within role, weighted by inverse frequency and cosine-normalized. Across 383 series, 186 credits recur and 245 series have at least one recurring credit. On the holdout, 386 of 1,808 targets shared a credit with at least one of the respondent’s four inputs.

Three-fold validation on 650 respondents selected a tilt of 1 from 0, 0.125, 0.25, 0.5 and 1. Validation log loss improved from 1.64521 to 1.63693. On the separate 451-person holdout, the adjustment increased log loss from 1.66896 to 1.67465 across 1,808 target ratings. The paired difference was +0.00569 (95% CI −0.01285 to +0.02423). RMSE increased from 0.86111 to 0.86740 stars. The TV catalog keeps its 16-class predictor and exposes credits for browsing. [Complete TV comparison](validation/tv-credits.json) · [TV source and respondent splits](tv-cocktail-catalogs.md)

## Reproduction

Use the input archives and train-only fits from the [film fitting guide](README.md), [forward holdout](rating-dates.md) and [TV catalog](tv-cocktail-catalogs.md). The uncompressed `credits.csv` SHA-256 is `b968359c8e77aebcb7329608378b3b11cc1834726e157aae934bc89f291458ec`. The `movies_metadata.csv` SHA-256 is `37ec322786b136a24604564e55160be75f8937546f11cb1a990076971fa895fd`. The preparation script accepts plain or gzip-compressed credits. TV preparation caches Wikidata queries and TVmaze responses, so the same cache reproduces the same output. A fresh cache reads the latest provider credits. [Pinned CSV mirror](https://huggingface.co/datasets/gaygaaa/TheMoviesDataset/tree/287abcb9999f332e13d93b17c9b0352b96875941)

```sh
python3 media-ratings/prepare_creator_credits.py film \
  tmp/agent/media-full/movies_metadata.csv tmp/agent/media-recognition/credits.csv.gz \
  media-ratings/film-creators.json
python3 media-ratings/prepare_creator_credits.py tv \
  tmp/agent/tv-drinks/ml-32m.zip tmp/agent/media-creators/cache media-ratings/tv-creators.json
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/evaluate_tv_credits.py \
  tmp/agent/tv-drinks/ml-32m.zip media-ratings/validation/tv-credits.json
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/evaluate_creator_credits.py \
  tmp/agent/media-full tmp/agent/media-expanded/ml-25m.zip media-ratings/expanded.json \
  media-ratings/film-creators.json tmp/agent/media-dates/through2017 media-ratings/validation/creator-credits.json
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/package_full.py \
  tmp/agent/media-full tmp/agent/media-expanded/ml-25m.zip media-ratings/expanded.json media-ratings/validation/full.json
node --test media-ratings/creator-credits.test.mjs
```
