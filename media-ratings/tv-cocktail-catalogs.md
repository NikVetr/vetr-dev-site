# TV shows and cocktails

Both catalogs fit the shared categorical latent-class model to explicit ratings. Each person belongs probabilistically to a class with its own score distribution for each item. Three-fold cross-validation selects the class count by mean log loss per respondent. Each evaluation case uses four supplied scores to predict up to twelve other recorded scores. Validation and test respondents are disjoint from the people used to estimate the corresponding coefficients. Final coefficients use all eligible ratings. The browser receives item information, category probabilities, and aggregate rating counts and co-rating grids.

| Catalog | Items | Ratings | People | Cross-validated classes | Held-out people / scores | Log loss, pooled → personalized | RMSE in stars, pooled → personalized |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TV shows | 256 | 48,614 | 21,671 | 8 | 443 / 1,763 | 1.7994 → 1.6909 | 0.8849 → 0.8328 |
| Cocktail recipes | 500 | 5,975 | 2,009 | 8 | 32 / 193 | 0.6959 → 0.6827 | 0.5303 → 0.5280 |

## TV shows

The source is MovieLens 32M, which includes viewer ratings for some complete series and miniseries, such as *Firefly*, *Band of Brothers* and *Planet Earth*. The catalog favors productions that people could rate on MovieLens. Long-running network and streaming shows are consequently underrepresented. Film, television episode and season-specific scores are excluded. [MovieLens 32M](https://grouplens.org/datasets/movielens/32m/)

Selection uses exact IMDb IDs shared by MovieLens and the TVmaze show index. An independent check against the IMDb title type accepts series and miniseries. Premiere years must agree within one year across TVmaze, IMDb and the MovieLens title where it includes a year. This catches some upstream links to remakes or different adaptations. Each final show has at least ten ratings. All matched viewer scores use the original half-star scale from 0.5 through 5. The held-out results measure prediction among the 2,273 viewers with five or more retained ratings. [Title type definitions](https://developer.imdb.com/non-commercial-datasets/) · [TV validation](validation/tv.json)

MovieLens ratings and their transformations are distributed under GroupLens research-use terms. Cite F. Maxwell Harper and Joseph A. Konstan (2015), *The MovieLens Datasets: History and Context*. The TVmaze title, premiere year, genre, network country, format and artwork references are a separately licensed metadata contribution adapted under CC BY-SA 4.0. Each show links back to TVmaze. Artwork loads from its external CDN. The reported country describes the network, where the source records one. [GroupLens terms and citation](MOVIELENS-LICENSE.txt) · [TVmaze API and licensing](https://www.tvmaze.com/api#licensing) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)

## Cocktails

Scores come from individually posted Food.com reviews in the raw FoodRS tables. Candidate recipes belong to the source's Beverages or Punch Beverage category and name an alcoholic ingredient. The builder checks individual ingredient names, excludes extracts, vinegars and other false matches, and removes identified mocktails, garnishes and homemade spirit preparations. It keeps the most recent explicit 1–5 score per reviewer and recipe. Selection takes the 500 recipes with the most distinct reviewers, requiring at least five, using the source ID to break ties. Identically named entries keep the most-reviewed recipe. Titled variants of a classic retain separate ratings and direct recipe links. The publication year is the year the recipe was posted. [FoodRS archive and provenance](https://huggingface.co/datasets/jiava/foodrs-data) · [Original Food.com archive](https://www.kaggle.com/datasets/irkaal/foodcom-recipes-and-reviews)

Only 193 people rated at least five of these recipes. Five stars account for 85.3% of reviews. Two additional respondent splits gave personalized-minus-pooled log loss differences of −0.0046 and +0.0057, compared with −0.0132 on the main test split. All three selected eight classes. The small gains vary with which reviewers are held out. Ratings concern individual recipes and reflect the reviewers who chose to make and rate them. [Cocktail validation and split sensitivity](validation/cocktails.json)

The source archive and FoodRS release specify CC0. Public assets contain recipe labels, source and external photo references, classifications and fitted or aggregate ratings. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

## Reproduce

From the repository root, use Python with DuckDB, NumPy and SciPy. The four inputs used for this release have the following SHA-256 checksums. IMDb refreshes its file daily. Archive that input if you need byte-for-byte reproduction.

| Input | SHA-256 |
| --- | --- |
| MovieLens 32M zip | `e4a68655d7386b8f95f2f2424b2ff975dfdd15ffd59e0d864a14dca43e99d6ee` |
| TVmaze snapshot parquet | `33983029a2f12f9d236ccdaa0af9f36b9a672de7b83e06e481655daee9672bed` |
| IMDb title.basics.tsv.gz | `dafaea71cba6da721dd5cc8c4179ff67e427b2b0e069ed07b0c49cad9a63167f` |
| FoodRS DuckDB | `e4fe48b39c9692361bf883e89967a71450217733b111e7d7454049567a5a3ac0` |

```sh
data_dir=tmp/agent/tv-drinks
mkdir -p "$data_dir"
curl -fL https://files.grouplens.org/datasets/movielens/ml-32m.zip -o "$data_dir/ml-32m.zip"
unzip -n "$data_dir/ml-32m.zip" ml-32m/links.csv ml-32m/ratings.csv ml-32m/movies.csv -d "$data_dir"
curl -fL https://huggingface.co/datasets/LeData/media-metadata-tvmaze-shows/resolve/a460b0e607ea7755b6f3c5ef77ccb867644b961c/data/train-00000-of-00001.parquet -o "$data_dir/tvmaze.parquet"
curl -fL https://datasets.imdbws.com/title.basics.tsv.gz -o "$data_dir/title.basics.tsv.gz"
curl -fL https://huggingface.co/datasets/jiava/foodrs-data/resolve/a0775011d885afc239e5758c15b4a64e0467ec92/data/foodrs.duckdb -o "$data_dir/foodrs.duckdb"
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/prepare_tv_cocktails.py tv "$data_dir/ml-32m" "$data_dir/tvmaze.parquet" "$data_dir/title.basics.tsv.gz" media-ratings
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/prepare_tv_cocktails.py cocktails "$data_dir/foodrs.duckdb" media-ratings
```
