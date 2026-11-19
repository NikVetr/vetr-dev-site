# Books and anime

Both catalogs preserve the original 500 most-rated works and add widely rated works from twelve genres apiece. Works are ranked by positive rating records across the full source release, with ties resolved by ascending source item ID. Each additional work needs at least 40 distinct, unambiguous respondent scores in the fitted cohort and increases coverage for at least one genre below 200 titles. A title can contribute to several genres. The same fitted model handles recommendations and responses across the whole domain.

| Catalog | Works | Fitted people | Fitted ratings | Scale | External reference |
| --- | ---: | ---: | ---: | --- | --- |
| Books | 1,369 | 53,408 | 3,411,488 | 1–5 stars | Goodreads representative edition |
| Anime | 1,487 | 55,365 | 3,251,551 | 1–10 | MyAnimeList series, film or season |

**Books.** Zygmunt Zając's Goodbooks-10k contains 5,976,479 ratings for 10,000 popular Goodreads works. Work IDs consolidate editions. Every published score for the selected works enters the fit. The release supplies author and contributor credits, original publication years, edition links and cover URLs for 1,056 selected works. Up to four genre facets per work come from the most frequent matching shelves in a fixed genre vocabulary. Series names are extracted where available from the source title. The twelve deep genres range from 200 biographies to 407 fantasy works. [Goodbooks-10k source and documentation](https://github.com/zygmuntz/goodbooks-10k)

**Anime.** Ramazan Turan's User Animelist Dataset combines public lists from MyAnimeList, AniList and Kitsu. Its 148,170,496 records include 106,281 zeros, which fall outside the 1–10 score scale. The selected works account for 105,492,587 positive source records. The catalog includes 200 or more examples of all twelve selected genres, including sports, horror, slice of life and action. Genre, format, episode count, year, names, links and poster addresses come from the same release. [User Animelist release](https://huggingface.co/datasets/mramazan/User-Animelist-Dataset), [collector and source platforms](https://github.com/MRamazan/User-Animelist-Dataset)

The anime fit and co-rating grids use a deterministic 1/32 sample of whole respondents to bound the repeated sparse matrix passes. Predictive saturation at this sample size is untested. After identical user–title scores collapse to one, 5,325 conflicting rows across the sampled source are excluded before selecting the final works. The app's familiarity counts and observed co-ratings describe the fitted cohort. Both catalogs predict the explicit scores that readers or viewers leave in historical snapshots.

**Attribution and distribution.** The published Books catalog, its derived validation statistics, and its aggregate rating grids adapt Goodbooks-10k by Zygmunt Zając, licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and are distributed under that same license. The corresponding Anime artifacts adapt User Animelist Dataset by Ramazan Turan, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Changes comprise item and respondent selection, metadata normalization, probabilistic modeling and aggregate counts. Cover and poster URLs reference their external hosts. Artwork remains with its respective rights holders. [Goodbooks license](https://github.com/zygmuntz/goodbooks-10k/blob/6dd165b555a7b47b2dd36743a425776e641ff50c/LICENSE), [User Animelist license](https://huggingface.co/datasets/mramazan/User-Animelist-Dataset)

## Author, publisher and production credits

The Goodreads XML archive has a record for each of the 1,369 selected editions. Its recorded contributor roles separate main bylines from illustrators (79 titles), translators (76), editors (21) and additional contributors (10). Named author credits are available for 1,366 works. Of the 1,365 editions with identified publishers, 1,039 use the publisher in the original archive and 326 use an Open Library edition whose stored ISBN matches the source ISBN-13 or its checksum-equivalent ISBN-10. The published credit describes that edition. The app keeps the work’s original publication year as a separate field. The book credits adapt Goodbooks under CC BY-SA 4.0. Open Library requests CC0 for its catalog contributions. [Goodbooks XML](https://github.com/zygmuntz/goodbooks-10k/tree/6dd165b555a7b47b2dd36743a425776e641ff50c/books_xml), [Open Library edition identifiers](https://openlibrary.org/dev/docs/api/books), [Open Library data](https://openlibrary.org/help/faq/using)

Studio credits cover 1,483 of the 1,487 anime, from lyfesan's MIT-licensed MyAnimeList metadata joined on the exact anime ID. The same identifier links to Wikidata for directors (672 titles), voice cast (696), credited creators (25) and credited authors (17). We omit staff where more than one Wikidata entity carries the identifier. Source credits can cover different voice-language versions. Cast names are in alphabetical order. These named roles identify public credits on the linked anime item; the original manga's author may have a different credit. The anime credits adapt the MIT-licensed MAL dataset and Wikidata’s CC0 statements. [MAL dataset](https://huggingface.co/datasets/lyfesan/myanimelist-top-anime-dataset/tree/7f4266c4c021d71dfa2a6612792eb21f215f9132), [MyAnimeList ID on Wikidata](https://www.wikidata.org/wiki/Property:P4086), [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)

## Held-out results

The base model estimates class proportions and a discrete distribution over each title's scores in every class. EM uses the observed ratings and a prior of 16 pseudo-ratings proportional to that title's pooled score frequencies. The default model also uses the degree to which each supplied score differs from its expected value given the other supplied scores. A ridge regression spreads those differences to similar titles and exponentially tilts the base score probabilities. The original latent-class option remains available.

Collaborative similarity uses 32 principal directions of title-centered co-rating agreement. A second 32-dimensional space represents genre and decade, plus authors and series for books or format and episode-count bins for anime. Metadata shared by fewer works receives more weight. Validation compared a ratings-only kernel with a kernel weighted 70% by collaborative similarity and 30% by metadata. Six tilt strengths from 0.125 to 4 were tested on a five-star scale, converted to the equivalent units for each source scale. Both domains selected the hybrid and a relative tilt of 0.5. A second comparison kept this tilt and the collaborative weight fixed. A 32-dimensional embedding of shared role-qualified credits replaced 0%, 25%, 50%, or 100% of the original metadata kernel. The same reader-disjoint three folds selected 50% for both domains. The final models assign 70% to rating similarity, 15% to established metadata and 15% to the new credits.

| Catalog | Held-out people | Held-out scores | Log loss, pooled / 16 classes / prior similarity / with credits | RMSE, pooled / 16 classes / prior similarity / with credits |
| --- | ---: | ---: | --- | --- |
| Books | 10,648 | 126,237 | 1.2772 / 1.1983 / 1.1929 / **1.1923** | 0.9678 / 0.9086 / 0.9036 / **0.9030** |
| Anime | 10,813 | 100,265 | 1.6691 / 1.3577 / 1.3417 / **1.3411** | 1.9028 / 1.6684 / 1.6005 / **1.5980** |

A seeded 20% split holds out entire respondents. Three-fold cross-validation on the other 80% compares 1, 2, 4, 8 and 16 classes by respondent-mean category log loss. Both selected 16, the largest count tested. The same training and validation folds select the similarity family and tilt. Each fold fits its collaborative features and class probabilities from its training people. Up to 2,000 randomly ordered people per fold are considered for scoring. Eligible respondents supply four random observed scores and have up to 12 other scores withheld as targets. Each person's average score receives equal weight. Test fits use every development respondent before forecasting the reserved respondents. The published fits then use the full fitted cohorts.

The improvement from credits over the preceding similarity model is small. Paired holdout log loss changed by −0.000528 for books (95% interval −0.000713 to −0.000343) and −0.000560 for anime (−0.000915 to −0.000206). Intervals summarize variability across held-out respondents. The reports retain both scores and the zero-credit comparison. [Books metrics](validation/books.json), [anime metrics](validation/anime.json)

## Rebuild

Use Python with NumPy, pandas and SciPy. From the repo root, these commands retrieve pinned source revisions into ignored scratch and regenerate the model JSON, validation metrics, and packed marginal/co-rating counts. The anime source CSV is approximately 2.25 GB. Model fitting reads the released credit sidecars. To refresh them from the pinned archives first, run the optional credit commands below with Python 3.11 or later. Open Library and Wikidata responses are cached, and future database updates can change coverage.

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


To refresh the credit sidecars from their source archives:

```sh
credits=tmp/agent/literary-credits
mkdir -p "$credits"
curl -fLsS https://raw.githubusercontent.com/zygmuntz/goodbooks-10k/6dd165b555a7b47b2dd36743a425776e641ff50c/books_xml/books_xml.zip -o "$credits/goodbooks.zip"
curl -fLsS https://huggingface.co/datasets/lyfesan/myanimelist-top-anime-dataset/resolve/7f4266c4c021d71dfa2a6612792eb21f215f9132/mal_top_anime_dataset.csv -o "$credits/mal-top.csv"
python3 media-ratings/prepare_literary_credits.py books "$credits"
python3 media-ratings/prepare_literary_credits.py anime "$credits"
python3 media-ratings/test_literary_credits.py
```
