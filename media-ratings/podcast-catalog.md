# Apple Podcasts

The catalog contains 3,670 shows from 19 Apple Podcasts topics. The source records one-to-five-star scores attached to written listener reviews from December 2005 through September 2022. Every item links to its Apple Podcasts page by its numeric iTunes ID. The November 2026 Apple lookup supplied external artwork for 3,267 shows, matched by iTunes ID. Topic and subtopic filters use the historical classifications. [Source tables](https://huggingface.co/datasets/stanford-star/the-join/tree/03bb55dd34a96f227586bc3c3b02fab962843719/join-bird-music-platform-2/db) · [Apple lookup API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html)

The archived tables contain 1,964,856 reviews of 108,578 shows. A listener can edit a review, so the importer keeps the latest timestamp per reviewer and iTunes ID. For ties it keeps the higher score. Each show needs at least 20 distinct reviewers and a top-level topic. For an exact title shared by multiple iTunes entries, the most-reviewed entry takes precedence. The 250 most-reviewed eligible shows in each topic form the catalog, and a show appearing in multiple topics contributes once to the fit. Society & Culture has 671 shows, Comedy has 453 and 17 other topics range from 110 (Government) to 384 (Education). [Topic counts and validation](validation/podcasts.json)

## Predictive check

The full fit uses 1,056,345 ratings from all 845,984 reviewers with a score for a selected show. Three respondent-disjoint validation folds covering 7,196 eligible listeners selected 2 classes from 1, 2, 4, 8 and 16. On the separate test of 1,787 listeners and 5,386 withheld scores, category log loss changed from 0.9057 for the population model to 0.8437 for the selected model. Star RMSE changed from 1.3542 to 1.2529 and the Brier score for at least four stars changed from 0.1625 to 0.1412.

After a respondent supplies four scores, the test predicts up to twelve other recorded scores and weights each respondent equally. Self-selected written reviews emphasize the people and programs that elicited a response. The score estimates apply to this reviewing population. The site ships model parameters, metadata and aggregate counts. Raw text and reviewer identifiers stay offline. [Model implementation](fit_catalog.py)

## Reproduction

Use Python with DuckDB, NumPy and SciPy. Download `podcasts.parquet`, `categories.parquet` and `reviews.parquet` into an untracked directory named `raw` from the [pinned archive](https://huggingface.co/datasets/stanford-star/the-join/tree/03bb55dd34a96f227586bc3c3b02fab962843719/join-bird-music-platform-2/db). Run from the repository root.

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/podcast_catalog.py \
  raw/podcasts.parquet raw/categories.parquet raw/reviews.parquet media-ratings
python3 media-ratings/podcast_artwork.py media-ratings/podcasts.json
```

The artwork step makes batched requests to Apple's US lookup service. Deleted and delisted shows keep their historical title and topic metadata. Refreshes depend on the current Apple catalog. Images are served by Apple and their rights remain with the publishers. [Apple search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)

The source database is BIRD's `music_platform_2`, packaged as Parquet by Stanford STAR in *The Join*. BIRD attributes its benchmark to Jinyang Li et al. and distributes the database under CC BY-SA 4.0. The source is Stuart Axelbrooke's archive of Apple Podcasts listener reviews. The derived rating catalog, validation summary and aggregate counts are provided under the same license. Changes include catalog selection, review deduplication, metadata normalization, model fitting and count aggregation. The enrichment uses Apple's identifiers and links. [BIRD benchmark and license](https://bird-bench.github.io/) · [The Join dataset card](https://huggingface.co/datasets/stanford-star/the-join) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
