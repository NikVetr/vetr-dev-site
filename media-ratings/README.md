# Rating Prediction

**Films** opens 500 titles with **Title choice + rating year** as the default predictor. The header switches between fourteen domains. Recipes offers both Food.com and Taste of Home. **Destinations** includes 1,419 places rated No, Maybe or Yes. Books opens Book-Crossing’s 1–10 edition scores, with Goodreads 1–5 stars available for a broader and more recent catalog. TV, anime, podcasts, albums, tabletop games, recipes and cocktails use their source rating scales. Video games opens Metacritic player scores from 0 to 10. Amazon editions (1–5 stars) and Steam (thumbs) have separate shelves. Web fiction opens Royal Road Kindle-edition ratings, with AO3 kudos available for original works. Fanfiction opens Goodreads stars for works on AO3 and FanFiction.net. Licensed Kindle editions and AO3 kudos have their own shelves. Subreddits predict recorded replies. You can bookmark or share any built-in catalog, including a specific source. During a visit, each category remembers your source and ratings. Opening a shared link starts on its exact source with a fresh sheet.

Rate a film in half-star increments. The main shelf keeps every title, including ones you have rated. Your rated shelf gives you a second, synchronized place to edit those answers. Search and sort the full catalog on the left. Creator filters and alphabetical sorts appear for catalogs with credits, including cast, directors, studios, authors and publishers. The question mark beside **Recommendations** opens the dataset citation and current model details. Click a title in either ratings shelf to open its information panel. For an already-rated title, the panel compares your answer with a forecast computed from your other applied ratings, omitting that title, score and submission date. The linked artwork card and Quick rate share the same externally hosted poster or photo where available. [Artwork coverage and credits](catalog-artwork.md) Use **Filters** by the prediction model to narrow recommendations. Select multiple alternatives within a field and combine fields. Dated catalogs offer an inclusive year range. Where counts are available, enter a minimum or maximum number of ratings, reviews or recorded actions. Enable **Also filter items to rate** to narrow the ratings shelf, Quick rate and Most informative to rate. Already rated always shows all your answers. Every supplied rating still contributes to predictions. Drag the divider, or focus it and use the arrow keys, to give either shelf more space. With **Auto-update** off, use **Update predictions** to apply your edits.

Each ranking scrolls independently. Select a title to focus its controls in the ratings shelf. Hover over a forecast value to reveal **Rate**, or tap the value to open its rating scale. Escape closes the floating scale. The chance header accepts the same half-stars or labeled choices as the catalog and gives the cutoff in parentheses. **Rating change** opens with the largest gains in predicted score. Both change panels start with gains. Click the paired carets to switch to falls. **Rank change** measures places among the same unrated entries in the current category. Equal means share a place.

**Scatterplot** beside Filters opens one point per visible, unrated entry. The horizontal axis shows its expected rating (positive-answer probability on binary scales). Choose score change, rank change within the filtered entries, or predicted rating standard deviation for the vertical axis. Point colors compare the personalized score with its catalog mean. Hover for values, select a point to inspect it, or use the arrows and Enter. The title below the plot takes you to its information panel.

**Most informative to rate** measures how much a new answer would reduce uncertainty about the categorical taste class, averaged over possible answers. The **Familiarity weight** slider mixes the percentile ranks of information gain and estimated familiarity, starting at 50%. At 0% it orders questions by information alone. At 100% it orders by familiarity alone. At every weight, the number beside an entry is its expected information gain in bits. Familiarity starts from the number of people who responded and increases for titles similar to ones you have rated. On activity catalogs, a recorded positive action supplies that signal. Counts and similarity are proxies for recognition. See the [held-out film evaluation](validation/familiarity.json). The panel uses the categorical fit even when a Gaussian forecast is selected. Rating here fades the row out of the list.

**Match my picks** controls the order of recommendations from explicit-review catalogs. At 0% the list ranks by predicted rating. At 100% it ranks by review context. Steam uses games reviewed by the same players and starts at 75%, selected on held-out players. Other eligible catalogs start at 0% and can use item metadata and review counts. Choosing a title voluntarily contributes to review context even if you dislike it. Answering a suggestion supplies only the rating. The displayed values are predicted ratings or thumbs-up chances at every setting. For Steam, the information panel also shows review counts and a credible interval for approval among reviewers. [Steam ranking study](discovery-study.md) · [Steam approval model](game-catalog.md)

**Group picks** compares two or more people on the current catalog and model. Add each person's exported ratings CSV, or combine your applied shelf with one or more CSVs. Each person keeps a separate forecast and equal weight. Rank jointly unrated entries by the chance that everyone meets a chosen threshold or by average expected rating. The joint probability assumes independent answers across people. The group fingerprint shows positions on a common set of axes, observed disagreements, and the largest gaps between one person's answer and other people's forecasts. Recommendations follow the current filters.

**Exploratory** opens Cocktails and Subreddits. Four supplied answers gave little improvement in held-out predictions for those catalogs; the alternative Taste of Home recipe source has a similar limitation. Information in bits describes how much an answer distinguishes the model's classes. The held-out checks measure how well those answers forecast other items. [Information and predictive utility by catalog](information-audit.md) · [Reader tendency and metadata experiments](metadata-transfer.md)

**Quick rate** opens one eligible unrated entry at a time. Its question queue shares the familiarity slider with the recommendations panel. You can also choose rating count, expected rating or alphabetical order. Film keys 0–9 run from half a star through five stars. Holding a shortcut lights its button and releasing it records the answer. On a 0–10 scale, T enters ten. Each other catalog displays its shortcuts on the buttons. The highlighted value starts in the middle of the scale. Arrow keys change it, Enter rates, S skips and B undoes the last rating or skip. **Done** or Escape returns your answers to the shelf. Quick rate adapts its suggestions as you answer, including when **Auto-update** is off. **Clear all** and **Undo clear** act on the current catalog under **Already rated**.

Film cards prefer the poster on the verified English Wikipedia article. A second Wikimedia image supplies a fallback, including a labeled cast portrait where available. Images load from the external host when the card opens. The cast follows billing order in the TMDB metadata snapshot. Each Wikimedia image links to its file description and rights information. [Card sources and regeneration](prepare_recognition.py)

Select a recommendation to inspect the model and observed distributions. **Title details** expands its collection, tags, finances and other available metadata. The colored co-rating grid counts respondents who rated both entries. Pearson’s correlation uses their **recorded numeric ratings**. The scatterplot takes up to 350 observed pairs and samples plausible Gaussian coordinates conditional on both recorded rating bins. It uses stratified importance resampling for the first coordinate and a conditional truncated normal for the second. The logit model uses the inverse logit to return to stars. Ordinal models interpolate between rating midpoints at their cutpoints. The categorical model uses its companion Gaussian fit for this display. The chart labels the fit and axes.

The **preference fingerprint** compares your average with the catalog expectation for the titles you actually rated. The small chart counts your answers at each rating level. The category comparison uses a recurring field such as genre, region or platform. It shows the largest positive and negative group shifts after subtracting your average shift across unrated entries. Each group includes a representative title with a shift near its mean. Expand **Class probabilities and model details** to inspect the fitted groups. Hover or focus a class on the map or in the list to compare its catalog prevalence and current probability. Click to pin it, and click again or press Escape to return to your own ratings.

**Your unexpected ratings** ranks your applied answers by absolute difference from a forecast using all the other answers. A positive gap means you rated the entry higher than forecast. **Least likely answer** sorts by the probability assigned to the exact answer you gave, which takes the full predictive distribution into account. The panel shows up to five entries and compares your average with the held-out forecast average. With one answer, the comparison uses the catalog forecast. Larger comparisons offer a cancellable background calculation.

Each stacked line names a distinct principal component that explains at least 1% of the variance in the current projection. Labels describe recurring catalog traits associated with both the signed item loadings and their ordering. Release year, popularity or agreement among reviewers can also distinguish a component. The app skips unsupported contrasts and avoids reusing a pole. Hover over a label to see its supporting evidence. The dot marks your posterior mean position, with the catalog center in the middle and three population standard deviations on either side. Hover, tap or use the arrow keys on a line to explore example titles.

**Remove overall rating level** starts on. For categorical models this subtracts each viewer group’s mean across titles before PCA. For Gaussian models it projects out the average across titles from the population latent covariance. Both are display choices. Predictions use the full model. The map starts with the leading components. Enable **Include map components below 1%** to select any measurable pair, including components without descriptive labels. The Gaussian contours use the posterior covariance for that plane. Click a group to see its mean, half-star usage where relevant and how much your supplied answers favor it.

The default model combines film similarities from ratings, tags and shared credits, volunteered title choice and rating year. Picking a film from the ratings shelf supplies its identity and stars. Rating a suggestion from a recommendation panel or **Quick rate** supplies its stars. The workspace records how a title was selected automatically. Entering or changing a rating records today’s UTC date. Imported ratings keep their supplied dates. Each dated answer uses its own submission year. Forecasts and their catalog comparisons use the year of your latest dated answer, clamped to the 1995–2019 archive. Undated answers use the pooled fit. The ratings CSV preserves dates and sources. A legacy CSV with neither field preserves previously recorded metadata and leaves new entries unspecified.

The comparison with four volunteered films per person improved held-out log loss from 1.5955 for **Ratings + tags** to 1.5702 for the combined model and 1.5699 after adding shared credits. [Film and TV credits](creator-credits.md) · [Book and anime credits](book-anime-data.md). The model forecasts recorded stars. MovieLens provides no complete viewing or posting history. **Ratings + tags** and **Latent class · K=8** are available in the film menu for comparison. The API also exposes the historical logit reference, date-only and title-choice-only adjustments. [Predictor comparison and reproduction](predictor-comparison.md)

**Import / export CSV** saves supplied ratings or the predictions from the last update. Importing ratings merges by item ID and validates the entire file before applying it. Importing a prediction snapshot opens a comparison table with current means. It adds no ratings. Each bundled film links directly to its IMDb title, Rotten Tomatoes film page and English Wikipedia article. The film link builder resolves the MovieLens IMDb ID through Wikidata, verifies the English article’s entity and reads the publisher’s canonical film URL. All twelve destinations link to an English Wikipedia article and identified places in OpenStreetMap, Google Maps and Apple Maps. The Apple Maps link for Milos opens a labeled island pin. The [JSON API](api.md) supplies the forecasts.

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

The default film predictor starts with the eight-class forecast. Select **Latent class · K=8** to use its class probabilities alone. Changing the model preserves your ratings. Each supplied rating contributes a residual against its prediction from the other supplied ratings. Kernel ridge regression with a 0.5 diagonal penalty transfers those residuals to similar films. An exponential tilt of each target’s category probabilities shifts mass according to the predicted residual. Before testing, validation log loss selected the feature family and tilt strength. The best candidate combined a 32-dimensional embedding of training-only item correlations with a 32-dimensional embedding of centered MovieLens Tag Genome relevance. Their cosine kernels receive equal weight. The tilt strength was 0.5. The fixed, catalog-wide Tag Genome is external side information and may reflect activity from the wider MovieLens population. Evaluation describes predictions for these known films and rating behavior among respondents who saw them.

| Matched test, four supplied ratings | Log loss | RMSE | Brier for ≥4 |
| --- | ---: | ---: | ---: |
| Eight classes | 1.6070 | 0.9215 | 0.1973 |
| Classes + rating similarity | 1.5968 | 0.9103 | 0.1946 |
| Classes + tag similarity | 1.5990 | 0.9121 | 0.1951 |
| Classes + ratings and tags | **1.5955** | **0.9083** | **0.1943** |

The paired improvement for the selected candidate was 0.0115 log-loss units (95% CI 0.0090–0.0140). To test the value of the remaining films, a separate exploratory comparison streamed **all 25,000,095 records**. After excluding every reserved respondent, it used 24,199,240 ratings across 58,851 titles to learn alternative film factors. It centered observed ratings on regularized item and user biases, then used randomized rank-32 SVD of the sparse residual matrix. In the same SVD model, extending the training films from 500 to all titles improved validation log loss from 1.59057 to 1.58986. The earlier ratings-and-tags candidate scored 1.58941 on those same users. [All-title experiment](validation/all-titles.json)

A conservative normalized-title and exact-year join found dialogue for 173 of the 500 films in Cornell’s corpus. A TF-IDF/LSA dialogue kernel gave test log loss 1.59584 when added to ratings and tags. A separate contextual experiment encoded up to sixteen evenly spaced passages per film with MiniLM, mean-pooled their embeddings, and centered the film vectors. Adding this kernel changed validation log loss from 1.58941 to 1.58999. Films without matched dialogue had zero dialogue features. These are dialogue excerpts with partial catalog coverage. [Contextual comparison](validation/dialogue.json) · [Cornell Movie-Dialogs Corpus](https://www.cs.cornell.edu/~cristian/Cornell_Movie-Dialogs_Corpus.html) · [MiniLM model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)

#### Film annotations and reproduction

The catalog shows genres, release year and the top four relevance tags from MovieLens. IMDb IDs connect 195 films to a named TMDB collection. The fitted catalog carries 422 content certificates. The web app fills 74 missing certificates from the linked Rotten Tomatoes film pages, bringing filter coverage to 496 of 500 films. Release order ranks dated entries within the source collection, including entries outside this app. Missing collection data leaves membership unspecified. Certificates describe the source snapshot. [MovieLens 25M data and research terms](https://files.grouplens.org/datasets/movielens/ml-25m-README.html) · [Content rating source](https://github.com/sundeepblue/movie_rating_prediction/blob/4fc1952e2f43624f23aa612c5d223c08d4fed3f3/movie_metadata.csv) · [TMDB metadata extract](https://huggingface.co/datasets/gaygaaa/TheMoviesDataset/blob/287abcb9999f332e13d93b17c9b0352b96875941/movies_metadata.csv)

The film filters and sorting options also cover reported box office and production budget in nominal US dollars. The July 2017 TMDB snapshot provides usable budgets for 479 films and grosses for 481. The source permits domestic gross where worldwide gross is unavailable. Missing amounts stay blank. Rating counts cover all 500 films and come directly from MovieLens 25M. [Metadata snapshot](https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset) · [TMDB contribution guide](https://www.themoviedb.org/bible/movie#59f73b759251416e71000007)

A comparison added similarity in log budget and log reported gross to the ratings-and-tags kernel. Among 0%, 10%, 25% and 50% finance weight, 2,000 validation respondents favored 0%. On the existing 3,000-person holdout, the strongest positive candidate (10%) changed log loss by +0.000018 (paired 95% CI −0.000304 to +0.000339, lower is better). The production predictor therefore keeps its validated ratings-and-tags weights. Reproduce the comparison with the commands in the data preparation and evaluation scripts. [Finance data preparation](prepare_film_context.py) · [Evaluation script](evaluate_finance.py) · [Validation and test results](validation/finance.json)

Release-year similarity and a short-lived personal rating offset both raised held-out error. Accounting for the year people submitted their stars improved forecasts in the 1995–2019 MovieLens archive. In a separate time holdout, carrying 2017 calibration forward for new 2019 respondents improved log loss from 1.8045 to 1.8006. [Rating dates, film eras and calendar holdout](rating-dates.md)

Regenerate the film link and certificate table with `python3 media-ratings/prepare_film_links.py media-ratings/expanded-evidence.json media-ratings/film-links.json tmp/agent/media-links/cache`. The cache retains the individual verification records.

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

The expanded catalog fits 812,990 explicit swipes from 61,130 respondents across 1,419 places. With four answers supplied, eight learned preference classes reduced held-out log loss from 0.7302 to 0.5799. Location filters include country, region, coastal proximity and climate. Old exported ratings retain their original Stravl IDs. [Sources, validation and reproduction](destination-catalog.md)

The earlier 12-place catalog is available for reproducing the ordinal and geographic comparisons. [Pilot catalog](stravl.json) · [Pilot transfer experiments](city-transfer.md)

### Video games, albums, podcasts and tabletop games

The Video games tab offers 1,136 Steam games with 16,654,154 thumbs-up or thumbs-down reviews, 180 Metacritic games with 255,386 player scores on a 0–10 scale, and 1,184 Amazon platform editions with 596,548 individual ratings from 1 to 5 stars. All 180 Metacritic games have externally hosted artwork in the information panel and Quick rate. The associated [artwork and game metadata](metacritic-artwork.md) also supply genre, developer, publisher and series where available. Each source keeps its own ratings and predictions. The 2,057 albums, 3,670 podcasts and 1,095 tabletop games use individual one-to-five-star reviews. Filter albums by artist or genre, podcasts by topic, and tabletop products by game type. [Steam and Metacritic sources](game-catalog.md) · [Amazon edition sources and validation](amazon-game-editions.md) · [Album and tabletop sources and validation](album-tabletop-catalogs.md) · [Podcast source and validation](podcast-catalog.md)

### TV shows, cocktails and online communities

The 383 TV shows use MovieLens ratings linked to series by IMDb ID. The 1,777 cocktail recipes use reviews of individual mixed drinks on Food.com. [TV and cocktail datasets](tv-cocktail-catalogs.md)

**Fanfiction → Goodreads** opens 365 fan works matched to their originals on AO3 or FanFiction.net. The model learns from 4,103 individual 1–5-star Goodreads ratings. The academic demo publishes fitted probabilities and omits the individual records and co-rating grid. **Licensed worlds** offers 508 licensed fanfiction editions across 29 worlds, with 7,273 individual Kindle ratings. The Goodreads model improved held-out log loss. On Kindle, personalization reduced star error slightly and held-out log loss was effectively tied with the catalog baseline. [Goodreads evaluation and archive matching](granular-source-audit.md) · [Licensed editions and evaluation](kindle-worlds.md)

The **AO3** option for fanfiction and original web fiction uses public kudos. A work can lack kudos because the reader never saw it. The joint fanfiction model covers 10,466 works, with at least 200 works available in 42 of its 56 fandoms. Search the Fandom filter to see counts and select one or more. Ratings from other fandoms still inform the recommendations. Original web fiction covers 320 works. [Source, selection and held-out evaluation](ao3-catalogs.md)

**Web fiction → Royal Road · Kindle edition stars** forecasts whole-star ratings for Kindle editions linked to Royal Road serials. Each entry links to the publication and the serial. The AO3 option uses kudos and maintains its own rating shelf. A separate offline importer fits native Royal Road half-star reviews when an authorized review export is available. [Sources, data requirements and import instructions](royalroad-data.md)

Subreddits model whether an active account recorded a reply in one of 500 communities in a four-week period in 2014. The highest-probability ranking and both change rankings use this binary event. [Reddit data and validation](subreddit-catalog.md)

### Rebuild the observed-rating summaries

From the repository root, run these commands with the same source files and selected catalogs used above. The outputs contain marginal rating counts and joint counts for every unordered pair in catalog order. Each joint grid stores the lower item index on its rows and the higher index on its columns. The MovieLens summary also keeps the published IMDb IDs, including leading zeros. Only these aggregates and the fitted catalogs are served to the browser.

```sh
python3 media-ratings/prepare_evidence.py media-ratings/movielens.json ml-latest-small/ratings.csv media-ratings/movielens-evidence.json --links ml-latest-small/links.csv
python3 media-ratings/prepare_evidence.py media-ratings/stravl.json stravl-input/ratings.csv media-ratings/stravl-evidence.json
```

### Books, anime and recipes

Book-Crossing covers 1,000 editions reviewed by 24,874 readers in 2004. The original ten response levels improved held-out predictions relative to five paired response levels on the same readers. The Goodreads option has 3.41 million scores and more recent books. Each source has its own rating shelf. [Book-Crossing methods and evaluation](book-crossing.md)

The Goodreads and anime catalogs keep their original 500 most-rated works and include at least 200 titles in each of twelve genres. They cover 1,369 books and 1,487 anime. The book fit uses every Goodbooks rating of these titles, and the anime fit uses a 1/32 sample of whole respondents. Both use a cross-validated similarity adjustment on top of categorical taste classes. [Genre selection, licenses and held-out forecasts](book-anime-data.md)

The Recipes tab opens 1,600 Food.com recipes with 200 entries per course. The catalog selector also opens the separate 100-recipe Taste of Home study. [Recipe sources and validation](recipe-catalog.md)

## Model and ranking

The historical reference fits one Gaussian to logit-transformed ratings using pairwise-complete covariances and a nearest positive-definite projection. The port applies the same top-end adjustment in training and prediction (4.875 for MovieLens), including singleton observations. For reported star probabilities, it bins the predicted latent normal at transformed midpoints between adjacent ratings. Its expected star value is the probability-weighted sum of those bins.

The ordinal extension models an entire respondent’s latent vector as a draw from one Gaussian mixture component. Each observed rating constrains its coordinate to an interval. With L categories, the L−1 interior cutpoints are fixed at standard-normal quantiles j/L. Stochastic-approximation EM alternates truncated-normal Gibbs updates, class draws and updates of complete-data sufficient statistics. Each covariance estimate includes d+2 identity pseudo-observations for d items. Missing coordinates are latent and sampled. Rating and exposure patterns may be selective, and the fit treats that missingness as ignorable. Component numbers are local to a particular fit.

For prediction, the browser factors the observed covariance block once per component. The triangular solves give the conditional means and Schur-complement variances for unrated items. Stratified sequential truncated-normal importance sampling integrates over the observed intervals. Its likelihood weights update the class probabilities. Subsequent normal interval probabilities are averaged over both latent draws and components. Increasing `samples` in the API checks integration sensitivity. The returned standard deviation describes the predicted rating distribution with fitted parameters held fixed.

A surprise is the personalized mean minus the catalog mean. The cutoff ranking maximizes the probability of scoring **at least** the chosen value. That allows a concentrated distribution to outrank a more polarizing title with a higher mean. The optional mean/variance score is sensitive to rating units and has a variance floor of 0.01.

## Choosing the model by cross-validation

Choose a **Prediction model** above the recommendations. **Model scores** previews its held-out log loss. On Films it also shows the calibration gap for a rating of at least four stars. Expand it for prediction error, 90% predictive coverage, interval width and the size of the evaluation sample. Other catalogs show the available held-out scores and identify gaps in the evaluation.

On Films, **Compare validation scores** compares all three menu options, the historical Gaussian and a recalibration fitted on 2020–21 respondents. Their scores use the same 2022–23 people and targets. **Check my film recommendations** samples up to five of your top twenty for a rating, “Haven’t seen it” or “Skip”. Export the local checks to measure the fraction answered and compare forecasts on those answers. [Temporal evaluation](film-calibration.md) · [Film check exports and analysis](api.md#randomized-film-recommendation-checks)

The film menu marks the default selected in the four-rating validation experiment. Its taste projection and informative-to-rate panel describe the underlying eight classes. On other catalogs **CV pick** marks the lowest cross-validated category log loss. **Compare validation scores** shows every candidate and the separate holdout results. Destinations open with the eight-class categorical model. Select an ordinal probit model for Gaussian-mixture conditioning on the underlying rating intervals.

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
