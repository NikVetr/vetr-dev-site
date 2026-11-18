# Fitting and using rating catalogs

**Films** opens 500 titles and **Destinations** opens 12 places rated No, Maybe or Yes. Rate a film in half-star increments. The main shelf keeps every title, including ones you have rated. Your rated shelf gives you a second, synchronized place to edit those answers. Search the catalog by title, change its sort order, or choose a category to filter both the catalog and recommendation panels. Drag the divider, or focus it and use the arrow keys, to give either shelf more space. With **Auto-update** off, use **Update predictions** to apply your edits.

Each ranking shows its result count and scrolls independently. The chance ranking includes the selected cutoff. Choose another value directly in its heading. Rise and fall rank positive and negative changes from the unconditional mean. **Most informative to rate** estimates how much a new answer would reduce uncertainty about the categorical taste class given your applied ratings. Its score is mutual information in bits, computed by averaging over all possible answers. This panel uses the catalog’s categorical fit even when a Gaussian forecast is selected. Rate directly in the first panel. Its row fades out and the catalog scrolls to your rating. Each rise or fall shows the catalog mean → personalized mean. Selecting it brings its catalog rating controls into focus. A profile can lower every forecast, leaving an empty rise list.

Select a recommendation to inspect the model and observed distributions. The colored co-rating grid counts respondents who rated both entries. Pearson’s correlation uses their **recorded numeric ratings**. The scatterplot takes up to 350 observed pairs and samples plausible Gaussian coordinates conditional on both recorded rating bins. It uses stratified importance resampling for the first coordinate and a conditional truncated normal for the second. The logit model uses the inverse logit to return to stars. Ordinal models interpolate between rating midpoints at their cutpoints. The categorical model uses its companion Gaussian fit for this display. The chart labels the fit and axes.

The projection uses the active prediction model. For Gaussian models, the axes are population principal components of the full mixture covariance. For each component we condition the two projected coordinates on the supplied ratings using the same triangular solves, interval draws and weights as the prediction engine. The user's contour shows one projected standard deviation, including within- and between-component uncertainty. For categorical models the PCA uses the class mean rating profiles weighted by prior membership. The diamond then marks the posterior-weighted class center. The view identifies each axis by its variance share and its smallest and largest item loadings. Group summaries compare average loadings for genres represented by at least ten films, or regions with at least two destinations. They describe these fitted axes.

**Import / export CSV** saves supplied ratings or the predictions from the last update. Importing ratings merges by item ID and validates the entire file before applying it. Importing a prediction snapshot opens a comparison table with current means. It adds no ratings. Movie links use IMDb IDs and Rotten Tomatoes title searches. Destination links use location searches on OpenStreetMap, Google Maps and Apple Maps. The [JSON API](api.md) supplies the forecasts.

## Fit a catalog

From the repository root, use R with `Matrix` and `jsonlite` installed. Provide a long CSV with `userId,itemId,rating` and a catalog CSV with `itemId,title`. MovieLens’s `movieId` column is also accepted. IDs are strings. Supply one explicit rating per user and item, omit missing ratings, and specify at least three ordered numeric levels. The fitter rejects conflicting or duplicate records. Choose items with enough co-ratings to estimate their correlations.

```sh
Rscript media-ratings/fit.R ratings.csv items.csv catalog.json 'My catalog' '1,2,3,4,5' 50 2 180 417
```

The last four arguments set the maximum number of items (by rating count), number of components, iteration count and random seed. An optional final comma-separated argument names the scale levels. Open the result using **Import fitted catalog**. Catalog selection defines the prediction universe. Fitting uses dense covariance matrices per component, so the item count affects memory quadratically. The browser downloads fitted summaries only.

### Movies

The saved R script `side_projects/movieRatingPersonalization.R` at `249e278` reads `IDMB_top250.csv` and then selects the 500 most frequently rated MovieLens titles independently of that file. Its worked example enters high ratings for titles starting with “Harry”. The original browser pilot used the 100 most-rated films in MovieLens small, with 16,185 ratings from 592 respondents.

The **500-film** catalog selects the most-rated titles across the complete [MovieLens 25M release](https://grouplens.org/datasets/movielens/25m/). It includes the eight Harry Potter films. The release fits every in-catalog rating, **10,944,737 ratings from 161,913 respondents**. The 1/32 hash sample originally shortened fitting. Four-fold respondent-grouped CV on that sample selected eight categorical classes with prior strength 8 from the prespecified grid. The observed co-rating plots still use MovieLens small and are labeled accordingly. The browser downloads fitted parameters and aggregate counts. [Original selection report](validation/expanded.json) · [MovieLens small terms](MOVIELENS-LICENSE.txt)

#### Does more training data help?

The learning curve fixes the film list, class count, regularization and seed. Two thousand validation respondents and 3,000 test respondents were drawn outside the original 1/32 sample. Each supplied four randomly chosen ratings, and the test scored their other 196,480 ratings. Scores give each respondent equal weight. All three training sets excluded both reserved groups.

| Training respondents | Training ratings | Category log loss | RMSE (stars) | Brier for ≥4 |
| ---: | ---: | ---: | ---: | ---: |
| 5,165 | 357,181 | 1.6395 | 0.9339 | 0.2001 |
| 39,248 | 2,650,088 | 1.6100 | 0.9229 | 0.1975 |
| 156,913 | 10,594,494 | 1.6070 | 0.9215 | 0.1973 |

The full-training improvement over the original sample was 0.0326 log-loss units per person (paired 95% CI 0.0285–0.0367). Most of that gain occurred by the middle training size. The final model includes the reserved respondents after evaluation. [Matched learning curve and candidate scores](validation/full.json)

#### Does film similarity add information beyond the classes?

The research comparison starts with the eight-class forecast. Each supplied rating contributes a residual against its prediction from the other supplied ratings. Kernel ridge regression with a 0.5 diagonal penalty transfers those residuals to similar films. An exponential tilt of each target’s category probabilities shifts mass according to the predicted residual. Before testing, validation log loss selected the feature family and tilt strength. The best candidate combined a 32-dimensional embedding of training-only item correlations with a 32-dimensional embedding of centered MovieLens Tag Genome relevance. Their cosine kernels receive equal weight. The tilt strength was 0.5. The fixed, catalog-wide Tag Genome is external side information and may reflect activity from the wider MovieLens population. Evaluation describes predictions for these known films and rating behavior among respondents who saw them.

| Matched test, four supplied ratings | Log loss | RMSE | Brier for ≥4 |
| --- | ---: | ---: | ---: |
| Eight classes | 1.6070 | 0.9215 | 0.1973 |
| Classes + rating similarity | 1.5968 | 0.9103 | 0.1946 |
| Classes + tag similarity | 1.5990 | 0.9121 | 0.1951 |
| Classes + ratings and tags | **1.5955** | **0.9083** | **0.1943** |

The paired improvement for the selected candidate was 0.0115 log-loss units (95% CI 0.0090–0.0140). To test the value of the remaining films, a separate exploratory comparison streamed **all 25,000,095 records**. After excluding every reserved respondent, it used 24,199,240 ratings across 58,851 titles to learn alternative film factors. It centered observed ratings on regularized item and user biases, then used randomized rank-32 SVD of the sparse residual matrix. In the same SVD model, extending the training films from 500 to all titles improved validation log loss from 1.59057 to 1.58986. The earlier ratings-and-tags candidate scored 1.58941 on those same users. [All-title experiment](validation/all-titles.json)

A conservative normalized-title and exact-year join found dialogue for 173 of the 500 films in Cornell’s corpus. A TF-IDF/LSA dialogue kernel gave test log loss 1.59584 when added to ratings and tags. A separate contextual experiment encoded up to sixteen evenly spaced passages per film with MiniLM, mean-pooled their embeddings, and centered the film vectors. Adding this kernel changed validation log loss from 1.58941 to 1.58999. Films without matched dialogue had zero dialogue features. These are dialogue excerpts with partial catalog coverage. [Contextual comparison](validation/dialogue.json) · [Cornell Movie-Dialogs Corpus](https://www.cs.cornell.edu/~cristian/Cornell_Movie-Dialogs_Corpus.html) · [MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

#### Film annotations and reproduction

The catalog shows genres, release year and the top four relevance tags from MovieLens. IMDb IDs connect 422 films to a recorded content certificate and 195 to a named TMDB collection. Release order ranks dated entries within the source collection, including entries outside this app. Missing collection data leaves membership unspecified. Certificates describe the source snapshot. [MovieLens 25M data and research terms](https://files.grouplens.org/datasets/movielens/ml-25m-README.html) · [Content rating source](https://github.com/sundeepblue/movie_rating_prediction/blob/4fc1952e2f43624f23aa612c5d223c08d4fed3f3/movie_metadata.csv) · [TMDB metadata extract](https://huggingface.co/datasets/gaygaaa/TheMoviesDataset/blob/287abcb9999f332e13d93b17c9b0352b96875941/movies_metadata.csv)

From the repository root, download MovieLens 25M and put the Cornell archive, the linked collection CSV and certificate CSV under a working directory as `dialogues.zip`, `movies_metadata.csv` and `content-ratings.csv`. The main fit uses R with Matrix and jsonlite, and Python with NumPy. The commands reuse the shipped catalog's 500 ordered IDs. Use a separate output copy when regenerating the catalog.

```sh
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
python3 media-ratings/prepare_full.py ml-25m.zip media-ratings/expanded.json work
Rscript media-ratings/fit_full.R work media-ratings/expanded.json
Rscript media-ratings/full_reference.R work media-ratings/expanded.json
python3 media-ratings/evaluate_full.py work media-ratings/expanded.json work/validation.json
cp media-ratings/expanded.json work/catalog.json
python3 media-ratings/package_full.py work ml-25m.zip work/catalog.json work/validation.json
```

The all-title comparison additionally uses SciPy and runs via `evaluate_all_titles.py work ml-25m.zip work/catalog.json work/all-titles.json`. The contextual experiment uses onnxruntime 1.22.1 and tokenizers 0.21.4, with `onnx/model_quint8_avx2.onnx` and `tokenizer.json` from MiniLM revision `c9745ed1d9f207416be6d2e6f8de32d1f16199bf` saved as `work/minilm.onnx` and `work/tokenizer.json`. Run `dialogue_embeddings.py work work/catalog.json work/dialogue.json`. To regenerate observed counts, use `prepare_evidence.py` with MovieLens small and `--pack-pairs`.

For the 100-film pilot, download and extract the archive, then run the following commands from the repository root. The included parameters are distributed under the [MovieLens terms and citation](MOVIELENS-LICENSE.txt). [GroupLens data and file descriptions](https://files.grouplens.org/datasets/movielens/ml-latest-small-README.html) · [MovieLens archive](https://files.grouplens.org/datasets/movielens/ml-latest-small.zip)

```sh
Rscript media-ratings/fit.R ml-latest-small/ratings.csv ml-latest-small/movies.csv movielens.json 'MovieLens · 100 most-rated films' '0.5,1,1.5,2,2.5,3,3.5,4,4.5,5' 100 2 180 417
Rscript media-ratings/evaluate.R ml-latest-small
```

The archive used here has SHA-256 `696d65a3dfceac7c45750ad32df2c259311949efec81f0f144fdfb91ebc9e436`.

### Destinations

Stravl records lists of destinations each respondent swiped no, maybe and yes. A row represents a respondent. Destination IDs are zero-based line numbers in the released name list. The preparation script collapses repeated identical swipes and omits respondent–destination pairs with conflicting answers. It uses only the three explicit swipe lists. Feedback on subsequently recommended destinations has different coding and selection. The provider permits academic and commercial use. [Stravl data, field descriptions and terms](https://github.com/Stravl/Stravl-Data)

Destination filters cover country, UN M49 country subregion, coastal proximity and annual climate. Population comes from the matched GeoNames populated place. Milos omits population because the destination could refer to the island. GDP per capita is the 2023 national value in current US dollars. Coastal means the place is within 25 km of the Natural Earth ocean coastline. Temperature and annual precipitation come from the containing 10-arc-minute WorldClim grid cell averaged over 1970–2000. Country subregions classify entire countries, including Türkiye. [GeoNames](https://www.geonames.org/export/) · [Natural Earth](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-coastline/) · [WorldClim 2.1](https://www.worldclim.org/data/worldclim21.html) · [World Bank GDP per capita](https://data.worldbank.org/indicator/NY.GDP.PCAP.CD) · [UN M49](https://unstats.un.org/unsd/methodology/m49/)

To regenerate, give `annotate_destinations.py work catalog.json` a copy of the destination catalog and the Python GDAL bindings. In `work`, use the GeoNames `cities500.zip` extract, Natural Earth `ne_10m_coastline.zip` as `coast.zip`, WorldClim `wc2.1_10m_bio.zip` as `climate.zip`, and the World Bank response for `AUT;CYP;CZE;DEU;ESP;FRA;GRC;HRV;ITA;TUR/indicator/NY.GDP.PCAP.CD?date=2023&format=json` as `gdp.json`.

An offline geographic-similarity model used country, region, coast, temperature, precipitation and national income to transfer residual preferences between destinations. Validation selected its tilt strength on 894 people. On a separate 873-person test, log loss improved from 0.61786 to 0.61345 and RMSE from 0.80575 to 0.80198 on the 0–2 scale. Run `Rscript media-ratings/evaluate_geography.R ratings.csv items.csv media-ratings/stravl.json scores.json` to reproduce. [Geography experiment](validation/geography.json)

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

The model menu marks the lowest cross-validated category log loss as **CV pick**. **Compare validation scores** shows every candidate and the separate holdout results. Destinations open with the cross-validated full-covariance ordinal model. Select the latent-class model to use the categorical probabilities directly.

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
