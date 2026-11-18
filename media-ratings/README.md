# Fitting and using rating catalogs

**Films** opens a 500-title catalog. **Film pilot** opens the earlier 100-title fit, and **Destinations** uses No, Maybe and Yes. Click a star or half-star to rate a film. The sidebar sorts both shelves by catalog expectation. Drag the divider, or focus it and use the arrow keys, to give either shelf more space. With **Auto-update** off, use **Update predictions** to apply your edits.

Each ranking shows its result count and scrolls independently. The chance ranking includes the selected cutoff. Choose another value directly in its heading. Rise and fall rank positive and negative changes from the unconditional mean. **Most informative to rate** estimates how much a new answer would reduce uncertainty about the categorical taste class given your applied ratings. Its score is mutual information in bits, computed by averaging over all possible answers. This panel uses the catalog’s categorical fit even when a Gaussian forecast is selected. You can enter the suggested rating in place.

Select a recommendation to inspect the model and observed distributions. The colored co-rating grid counts respondents who rated both entries. Pearson’s correlation uses their **recorded numeric ratings**. The scatterplot takes up to 350 observed pairs and samples plausible Gaussian coordinates conditional on both recorded rating bins. It uses stratified importance resampling for the first coordinate and a conditional truncated normal for the second. The logit model uses the inverse logit to return to stars. Ordinal models interpolate between rating midpoints at their cutpoints. The categorical model uses its companion Gaussian fit for this display. The chart labels the fit and axes.

The projection uses the active prediction model. For Gaussian models, the axes are population principal components of the full mixture covariance. For each component we condition the two projected coordinates on the supplied ratings using the same triangular solves, interval draws and weights as the prediction engine. The user's contour shows one projected standard deviation, including within- and between-component uncertainty. For categorical models the PCA uses the class mean rating profiles weighted by prior membership. The diamond then marks the posterior-weighted class center. The view identifies each axis by its variance share and its smallest and largest item loadings.

**Import / export CSV** saves supplied ratings or the predictions from the last update. Importing ratings merges by item ID and validates the entire file before applying it. Importing a prediction snapshot opens a comparison table with current means. It adds no ratings. Movie links use IMDb IDs and Rotten Tomatoes title searches. Destination links use location searches on OpenStreetMap, Google Maps and Apple Maps. The [JSON API](api.md) supplies the forecasts.

## Fit a catalog

From the repository root, use R with `Matrix` and `jsonlite` installed. Provide a long CSV with `userId,itemId,rating` and a catalog CSV with `itemId,title`. MovieLens’s `movieId` column is also accepted. IDs are strings. Supply one explicit rating per user and item, omit missing ratings, and specify at least three ordered numeric levels. The fitter rejects conflicting or duplicate records. Choose items with enough co-ratings to estimate their correlations.

```sh
Rscript media-ratings/fit.R ratings.csv items.csv catalog.json 'My catalog' '1,2,3,4,5' 50 2 180 417
```

The last four arguments set the maximum number of items (by rating count), number of components, iteration count and random seed. An optional final comma-separated argument names the scale levels. Open the result using **Import fitted catalog**. Catalog selection defines the prediction universe. Fitting uses dense covariance matrices per component, so the item count affects memory quadratically. The browser downloads fitted summaries only.

### Movies

The saved R script `side_projects/movieRatingPersonalization.R` at `249e278` reads `IDMB_top250.csv` and then selects the 500 most frequently rated MovieLens titles independently of that file. Its worked example enters high ratings for titles starting with “Harry”. The original browser pilot used the 100 most-rated films in MovieLens small, with 16,185 ratings from 592 respondents.

The **500-film** catalog selects the most-rated titles across the complete [MovieLens 25M release](https://grouplens.org/datasets/movielens/25m/). It includes the eight Harry Potter films. A deterministic 1/32 hash sample of respondents contributes 357,181 in-catalog ratings from 5,165 people. Both training and validation retain each sampled person's complete in-catalog profile. The site serves fitted parameters. The observed charts and IMDb mappings for both movie catalogs use MovieLens small, distributed under the [small-release terms](MOVIELENS-LICENSE.txt). The expanded fit and the observed charts therefore describe different samples.

Four respondent-grouped folds compared the historical logit reference and categorical fits with 1, 2, 4 or 8 classes at prior strengths 8 and 64. The eight-class, strength-8 model opens by default. On 67,554 held-out ratings from 1,032 people its log loss was 1.643 and RMSE was 0.940 stars. The reference scored 1.935 and 0.923. The 100-film pilot retains the full-covariance ordinal fits. [Expanded selection report](validation/expanded.json)

To reproduce the expanded fit from the repository root, download the 25M archive and the small release linked below. Use MovieLens 25M under its [research terms](https://files.grouplens.org/datasets/movielens/ml-25m-README.html). The last command produces small-release observed counts and packs the paired grids separately.

```sh
python3 media-ratings/prepare_expanded.py ml-25m.zip expanded-input
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 Rscript media-ratings/select.R expanded-input/sample.csv expanded-input/movies.csv expanded-input/template.json media-ratings/expanded.json media-ratings/validation/expanded.json media-ratings/expanded-grid.json
python3 media-ratings/prepare_evidence.py media-ratings/expanded.json ml-latest-small/ratings.csv media-ratings/expanded-evidence.json --links ml-latest-small/links.csv --pack-pairs
```

For the 100-film pilot, download and extract the archive, then run the following commands from the repository root. The included parameters are distributed under the [MovieLens terms and citation](MOVIELENS-LICENSE.txt). [GroupLens data and file descriptions](https://files.grouplens.org/datasets/movielens/ml-latest-small-README.html) · [MovieLens archive](https://files.grouplens.org/datasets/movielens/ml-latest-small.zip)

```sh
Rscript media-ratings/fit.R ml-latest-small/ratings.csv ml-latest-small/movies.csv movielens.json 'MovieLens · 100 most-rated films' '0.5,1,1.5,2,2.5,3,3.5,4,4.5,5' 100 2 180 417
Rscript media-ratings/evaluate.R ml-latest-small
```

The archive used here has SHA-256 `696d65a3dfceac7c45750ad32df2c259311949efec81f0f144fdfb91ebc9e436`.

### Destinations

Stravl records lists of destinations each respondent swiped no, maybe and yes. A row represents a respondent. Destination IDs are zero-based line numbers in the released name list. The preparation script collapses repeated identical swipes and omits respondent–destination pairs with conflicting answers. It uses only the three explicit swipe lists. Feedback on subsequently recommended destinations has different coding and selection. The provider permits academic and commercial use. [Stravl data, field descriptions and terms](https://github.com/Stravl/Stravl-Data)

Download `Stravl_Travel_Preference_Data.csv` and `destination_ids.txt` from that release. Prepare and fit the destination pilot with Python 3 and R.

```sh
python3 media-ratings/prepare_stravl.py Stravl_Travel_Preference_Data.csv destination_ids.txt stravl-input
Rscript media-ratings/fit.R stravl-input/ratings.csv stravl-input/items.csv stravl.json 'Stravl · destination preferences' '0,1,2' 12 2 120 417 'No,Maybe,Yes'
```

Starting with the most-rated destination, the preparation script adds the destination with the largest minimum pairwise overlap with the selected set. The resulting 12 destinations have at least 125 co-raters for every pair and 27,047 responses from 12,905 respondents. The output predicts interest in an offered destination. The movie validation below evaluates a different population and outcome.

### Rebuild the observed-rating summaries

From the repository root, run these commands with the same source files and selected catalogs used above. The outputs contain marginal rating counts and joint counts for every unordered pair in catalog order. Each joint grid stores the lower item index on its rows and the higher index on its columns. The MovieLens summary also keeps the published IMDb IDs, including leading zeros. Only these aggregates and the fitted catalogs are served to the browser.

```sh
python3 media-ratings/prepare_evidence.py media-ratings/movielens.json ml-latest-small/ratings.csv media-ratings/movielens-evidence.json --links ml-latest-small/links.csv
python3 media-ratings/prepare_evidence.py media-ratings/stravl.json stravl-input/ratings.csv media-ratings/stravl-evidence.json
```

### Books and anime

| Dataset | Convert to the training schema | Selection and reuse |
| --- | --- | --- |
| [UCSD Goodreads Book Graph](https://sites.google.com/eng.ucsd.edu/ucsdbookgraph/shelves) | Map interaction `user_id,book_id,rating` to `userId,itemId,rating`, retain 1–5, and use `book_id_map.csv` to join the CSV IDs to book titles. | Zero means no explicit rating. A popular shelf or genre gives a more manageable first catalog. The authors request noncommercial use and prohibit redistribution of the dataset. |
| [MyAnimeList Database 2020](https://github.com/Hernan4444/MyAnimeList-Database) | Map `user_id,anime_id,rating` from `rating_complete.csv`; join the anime ID to the title in `anime.csv`. Use levels 1–10. | The completed-and-scored file has 57 million ratings. This selection excludes dropped shows. Use nonzero explicit scores from `animelist.csv` to study a broader population. The compiler links the distribution and its source in the README. |

For these large files, select a smaller catalog before constructing the dense training matrix. Neither dataset is bundled.

## Model and ranking

The historical reference fits one Gaussian to logit-transformed ratings using pairwise-complete covariances and a nearest positive-definite projection. The port applies the same top-end adjustment in training and prediction (4.875 for MovieLens), including singleton observations. For reported star probabilities, it bins the predicted latent normal at transformed midpoints between adjacent ratings. Its expected star value is the probability-weighted sum of those bins.

The ordinal extension models an entire respondent’s latent vector as a draw from one Gaussian mixture component. Each observed rating constrains its coordinate to an interval. With L categories, the L−1 interior cutpoints are fixed at standard-normal quantiles j/L. Stochastic-approximation EM alternates truncated-normal Gibbs updates, class draws and updates of complete-data sufficient statistics. Each covariance estimate includes d+2 identity pseudo-observations for d items. Missing coordinates are latent and sampled. Rating and exposure patterns may be selective, and the fit treats that missingness as ignorable. Component numbers are local to a particular fit.

For prediction, the browser factors the observed covariance block once per component. The triangular solves give the conditional means and Schur-complement variances for unrated items. Stratified sequential truncated-normal importance sampling integrates over the observed intervals. Its likelihood weights update the class probabilities. Subsequent normal interval probabilities are averaged over both latent draws and components. Increasing `samples` in the API checks integration sensitivity. The returned standard deviation describes the predicted rating distribution with fitted parameters held fixed.

A surprise is the personalized mean minus the catalog mean. The cutoff ranking maximizes the probability of scoring **at least** the chosen value. That allows a concentrated distribution to outrank a more polarizing title with a higher mean. The optional mean/variance score is sensitive to rating units and has a variance floor of 0.01.

## Choosing the model by cross-validation

The model menu marks the lowest cross-validated category log loss as **CV pick**. **Compare validation scores** shows every candidate and the separate holdout results. The 100-film pilot opens with the historical logit reference. Destinations open with the cross-validated full-covariance ordinal model. Select the latent-class model to use the categorical probabilities directly.

The latent-class model fits one rating distribution per item and class. A sparse respondent-by-item/category matrix supplies the observed-data likelihood and expected counts for EM. Unrated items contribute no evidence. For each item and class, a positive number of pseudo-ratings shrinks the distribution toward the pooled training distribution for that item. Class weights receive one pseudo-respondent each. Two seeded initializations compete on the penalized training objective. The browser updates class probabilities directly from observed ratings and sums the class-specific distributions for each target. This computation is exact given the fitted parameters. The dependence between items comes entirely from class membership. A class can reflect how often someone uses half-stars as well as which titles they prefer. [Polytomous latent class analysis](https://www.jstatsoft.org/article/view/v042i10)

The evaluation freezes the published item lists. It reserves 20% of respondents for a final test, then performs four-fold cross-validation on the remaining respondents. No respondent enters both training and validation in a fold. For each eligible validation or test respondent, it reveals up to four random ratings and scores every remaining observed item. Every candidate receives the same observations and targets. Scores average over targets within each respondent, then weight respondents equally. RMSE takes the square root after averaging squared errors. Brier scores use ≥4 stars for films and “Yes” for destinations. This evaluates personalization among people with at least two explicit ratings in a catalog.

The search tries full-covariance ordinal models with 1, 2 and 4 components, and categorical models with 1, 2, 4 and 8 classes at prior strengths 8 and 64. The positive movie scale also admits the historical reference. The lowest CV log loss selects the complexity within each family before its finalist is refitted and tested. The deployed estimates use all available respondents after evaluation. Eight was the largest class count tested. The selected counts describe predictive performance for this reveal protocol.

| Holdout catalog | Family finalist | Category log loss | RMSE | Cutoff Brier |
| --- | --- | ---: | ---: | ---: |
| Films · 117 respondents, 2,830 targets | Latent class, K=4, prior 8 | 1.716 | 0.948 | 0.209 |
| Films | Ordinal probit, K=1 | 1.880 | 0.914 | 0.201 |
| Films | Historical logit reference | 1.916 | 0.910 | 0.197 |
| Destinations · 1,157 respondents, 1,230 targets | Latent class, K=8, prior 8 | 0.618 | 0.816 | 0.176 |
| Destinations | Ordinal probit, K=4 | 0.691 | 0.818 | 0.179 |

The film results favor the latent-class model for full distributions and the reference for expected stars and four-star events. The destination latent-class model scores best on all three holdout measures. The complete reports include each fold and candidate. [Film validation](validation/movielens.json) · [Destination validation](validation/stravl.json)

Run the selection workflow from the repository root with a template catalog containing the item IDs, scale, iteration budget and fit seed. Use separate paths for the new catalog and the fold report.

```sh
OPENBLAS_NUM_THREADS=1 Rscript media-ratings/select.R ml-latest-small/ratings.csv ml-latest-small/movies.csv media-ratings/movielens.json selected.json validation.json
```

For a custom search, append a JSON file such as `{"ordinalK":[1,2,3],"classK":[2,4,6],"priorStrength":[8,32]}`. Set the grid before inspecting the reserved test results. For a new catalog, first make the template with `fit.R` as described above.

## Historical movie pilot

The evaluation sets aside 122 of the 610 users before selecting the 100 training films or fitting any model. For each eligible held-out user, it reveals up to four random ratings and scores the remainder. There were 2,923 target ratings from 120 eligible users. The following scores use the same targets; lower is better in each column.

| Model | RMSE with no personal ratings | Personalized RMSE (stars) | Personalized category log loss | Personalized Brier score for ≥4 stars |
| --- | ---: | ---: | ---: | ---: |
| Historical logit reference | 0.8963 | 0.8797 | 1.9100 | 0.2010 |
| Ordinal, one component | 0.8948 | 0.8683 | 1.9216 | 0.2016 |
| Ordinal, two components | 0.8959 | 0.8712 | 1.9265 | 0.2025 |

All three improved average star-rating error after conditioning. The single ordinal component had the lowest RMSE here. The historical reference had the best log loss and four-star probability score. These results describe one seeded split of the development dataset.
