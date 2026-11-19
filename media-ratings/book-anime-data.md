# Books and anime

Each catalog contains the 500 works with the most positive, explicit rating records in its source release. Ties use ascending source item ID. Frequency measures how often participants rated a work. It supplies a reproducible proxy for recognition across genres and series, including older releases. The catalogs cover historical snapshots and do not measure sales.

| Catalog | Fitted people | Fitted ratings | Scale | External reference |
| --- | ---: | ---: | --- | --- |
| Books | 53,342 | 2,399,375 | 1–5 stars | Goodreads work's representative edition |
| Anime | 55,252 | 2,480,995 | 1–10 | MyAnimeList entry for the series, film or season |

**Books.** Zygmunt Zając's Goodbooks-10k contains 5,976,479 ratings for 10,000 popular Goodreads works. Its work IDs consolidate editions. Every published score for the selected 500 works contributes to the fit. The release supplies credited authors and other contributors, original publication years, edition links, and cover URLs for 434 of the 500. Up to four genre facets come from the most frequent matching shelves in a fixed genre vocabulary. The source includes series information in some titles. The larger UCSD Goodreads release specifies academic use only and asks users to avoid redistribution. Goodbooks publishes the [source data](https://github.com/zygmuntz/goodbooks-10k) under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). [UCSD terms](https://cseweb.ucsd.edu/~jmcauley/datasets/goodreads.html)

**Anime.** Ramazan Turan's User Animelist Dataset combines public lists from MyAnimeList, AniList, and Kitsu. The release has 148,170,496 records. The CSV contains positive integer scores through 10 and 106,281 zeros, which we exclude because they fall outside that scale. The top 500 entries account for 80,506,558 positive records. Genre, format, episodes, year, names, links and poster addresses come from the same release. The Shikimori RecSys alternative has 28,129 positive scores across its entire release, including only 12 for its 500th most-rated entry. [User Animelist release](https://huggingface.co/datasets/mramazan/User-Animelist-Dataset), [collector and source platforms](https://github.com/MRamazan/User-Animelist-Dataset), [Shikimori RecSys](https://huggingface.co/datasets/kdduha/shikimori-recsys)

The anime fit and co-rating grids use a deterministic 1/32 sample of whole respondents. This bounds the memory and repeated sparse matrix passes for cross-validation on the shared machine. No learning-curve experiment established saturation. Selection of the 500 titles uses the entire source release. Repeated identical user–title scores collapse to one in the fit. In the sampled cohort, 1,100 remaining rows belonged to user–title combinations with conflicting scores and were excluded. The app's familiarity counts and observed co-ratings describe the fitted cohort.

**Attribution and distribution.** The published Books catalog, its derived validation statistics, and its aggregate rating grids adapt Goodbooks-10k by Zygmunt Zając, licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and are distributed under that same license. The corresponding Anime artifacts adapt User Animelist Dataset by Ramazan Turan, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes comprise item and respondent selection, metadata normalization, probabilistic modeling and aggregate counts. Cover and poster URLs reference their external hosts. Artwork remains with its respective rights holders. [Goodbooks license](https://github.com/zygmuntz/goodbooks-10k/blob/6dd165b555a7b47b2dd36743a425776e641ff50c/LICENSE), [User Animelist license](https://huggingface.co/datasets/mramazan/User-Animelist-Dataset)

## Held-out results

EM estimates the class proportions and the distribution of each title's score in each class. Each class–title distribution receives 16 pseudo-ratings proportional to that title's pooled rating frequencies. An absent rating supplies no likelihood term. The fitted distributions predict the scores people leave on these services.

| Catalog | Selected classes | Held-out people | Held-out scores | Log loss, pooled → personalized | RMSE, pooled → personalized |
| --- | ---: | ---: | ---: | ---: | ---: |
| Books | 16 | 10,521 | 122,180 | 1.2773 → 1.1956 | 0.9772 → 0.9150 |
| Anime | 16 | 10,531 | 97,223 | 1.6536 → 1.3285 | 1.8791 → 1.6157 |

A seeded 20% holdout isolates entire respondents. On the other 80%, three-fold respondent-disjoint cross-validation compares 1, 2, 4, 8 and 16 classes. All respondents from the training folds enter each fit. Up to 2,000 randomly ordered people per validation fold are considered for scoring. Eligible respondents have at least five observed titles. Four random ratings condition each forecast, with up to 12 other random ratings as targets. Each person's average score receives equal weight. The selected count minimizes category log loss. Both domains selected the largest count tested, so the results do not establish an optimum above 16 classes. The chosen and single-class models refit on the development people for testing. Only after evaluation does the production fit include the test respondents. The reports include the full grid and threshold Brier scores, with thresholds 4 for books and 8 for anime. [Books metrics](validation/books.json), [anime metrics](validation/anime.json)

## Rebuild

Use Python with NumPy, pandas and SciPy. From the repo root, these commands retrieve pinned source revisions into ignored scratch and regenerate the model JSON, validation metrics, and packed marginal/co-rating counts. The anime source CSV is approximately 2.25 GB.

```sh
raw=tmp/agent/new-catalogs
mkdir -p "$raw"
books_url=https://raw.githubusercontent.com/zygmuntz/goodbooks-10k/6dd165b555a7b47b2dd36743a425776e641ff50c
for name in books book_tags tags; do
    curl -fLsS "$books_url/$name.csv" -o "$raw/$name.csv"
done
curl -fLsS "$books_url/ratings.csv" -o "$raw/book-ratings.csv"

anime_url=https://huggingface.co/datasets/mramazan/User-Animelist-Dataset/resolve/c3707b279e80d7e79a84c78dc7b302b9f15c9975
curl -fLsS "$anime_url/animes.csv" -o "$raw/animes.csv"
curl -fLsS "$anime_url/ratings.csv" -o "$raw/animelist-ratings.csv"

for domain in books anime; do
    OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/prepare_reading_viewing.py "$domain" "$raw"
done
python3 media-ratings/test_catalog_fit.py
```

The source ratings SHA-256 checksums are `1ee8a97172bd6d97147a30d9cfb3029ac240bd27ba2aa9365981c051c65113f8` for Goodbooks and `2ee00f83262cd4cdb2d4a0f1661545307ccc956b01314df0d5e5232433339e68` for User Animelist. The sparse fitter is also callable from another domain using a CSR respondent-by-item matrix containing one-based integer category indices. `fit_catalog` returns the catalog and metrics. `write_evidence` exports the unordered item-pair histograms in the browser's little-endian 16-bit format.
