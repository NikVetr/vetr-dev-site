# Media Ratings API

The page, `window.MediaRatings.submit`, and the Node 22 CLI use the same prediction code. The browser reads individual ratings and imported catalogs locally. Training takes place offline in R and Python. See the [fitting and dataset guide](README.md).

From the repository root, predict after a five-star rating of *The Matrix* and a two-star rating of *Forrest Gump*.

```sh
jq '{catalog: ., ratings: {"2571": 5, "356": 2}, threshold: 4}' media-ratings/expanded.json |
  node media-ratings/cli.mjs
```

The CLI reads one JSON file or stdin. Send `catalog` (the entire fitted object). Omit `model` to use its declared `defaultModel`, or pass a key from its `models` map. Catalogs without a declared default require a model key. Optional `ratings` maps catalog item IDs to numeric values on its scale. Omit it to calculate population predictions. The inclusive `threshold` must be a scale value and defaults to the nearest category three quarters of the way up the scale. `samples` controls numerical integration for the ordinal model, from 16 to 8192 per component, default 256.

The result includes the rating scale, cutoff and each component’s prior and posterior probability. For ordinal observations it also reports the effective number of importance samples per component. Unrated items appear in descending expected-rating order. Each has an ID, title, probability vector in scale order, expected rating, unconditional expectation (`prior`), signed difference (`shift`), standard deviation (`sd`), and probability of reaching the cutoff (`chance`). For the biggest surprises, sort by the absolute shift. The precision-weighted ranking uses `expected / max(sd², 0.01)`.

A catalog contains a name, sorted numeric `scale`, optional `scaleLabels`, unique `items` with string `itemId` and `title`, and named `models`. An ordinal or logit model has a `kind`, strictly increasing finite category `cuts`, and one or more components with positive weights summing to one, mean vectors in item order and symmetric positive-definite covariance matrices. The `logit-point` family requires one component and an `endpoint` for the highest observed rating. See [the destination catalog](stravl.json) for a small complete example. Individual training records never enter the catalog.

The `latent-class` family has positive component weights and an item-by-rating `probabilities` matrix for each component. Each row sums to one in scale order. Its posterior class weights and target probabilities are exact. `samples` affects the ordinal integration only. The optional `selection.model` records the original cross-validation pick. Bundled items also carry descriptive `annotations` for browsing and interpreting the projections. An integer `annotations.year` enables exact-year and decade filters and newest-first sorting. For a book catalog use its publication year. The destination catalog defaults to `latentClass` and also includes one-, two- and four-component ordinal-probit models. [Fitting and cross-validation](README.md)

The film catalog defaults to `personalized`, which combines the `ratingsTags` predictor with volunteered-title evidence and annual calibration. The `class-similarity` model references a categorical fit by `base` and carries one feature vector per item. Vector dot products give the film similarities. Ridge regression transfers leave-one-out rating residuals between films, and `strength` controls the tilt of the predicted category probabilities. Class membership and the population distribution come from the reference categorical fit. Select `latentClass` for the eight-class forecast alone or `reference` for the historical logit model.

For the title-choice film model, pass `model: "titleChoice"` and a `volunteered` array of distinct IDs from `ratings`. Include a title if the person picked it independently. Supply only its stars when the app prompted it or its source is unknown. Omitting `volunteered` uses stars alone. The combined model uses the same evidence. Models without a title-choice term ignore valid volunteered IDs. This example records five stars for a film the user picked and two stars for an app suggestion.

```json
{"model":"titleChoice","ratings":{"2571":5,"356":2},"volunteered":["2571"]}
```

Add the fitted `catalog` to send this request to the CLI or `submit`. The model reuses the feature vectors and tilt parameters from `similarityFrom`. For each volunteered film, it adds `titleChoice.strength × titleChoice.logRatios[class][item]` to the log class weight. The leave-one-out calculation omits both terms for the held-out input film.

For submission-year calibration, select `ratingYear` and supply an optional `ratedOn` map of rated item IDs to valid `YYYY-MM-DD` dates. Each dated answer uses the category distribution for its submission year. Undated answers use the pooled fit. Both the target forecast and its catalog `prior` use the year of the latest dated answer. Years below 1995 or above 2019 use the nearest fitted year. With no dated answers the predictions equal `ratingsTags`. The combined model uses the same calendar calibration. Models without a date term ignore valid dates.

```json
{"model":"ratingYear","ratings":{"2571":5,"356":2},"ratedOn":{"2571":"2004-06-12"}}
```

Send both signals in a single request by choosing `personalized` or omitting `model` with the bundled film catalog. Here the user volunteered *The Matrix* and entered an undated response to a *Forrest Gump* suggestion. A suggested film’s identity still determines which rating distribution to evaluate. Only a volunteered identity supplies separate selection evidence. The app offers the combined model and the ratings-and-tags baseline. The `titleChoice` and `ratingYear` keys remain available through the API for controlled comparisons.

```json
{"ratings":{"2571":5,"356":2},"volunteered":["2571"],"ratedOn":{"2571":"2004-06-12"}}
```

The ES module exports `submit(request)`, or `validateCatalog(catalog)` and `predict(catalog,request)` for repeated calls on a validated catalog. Errors carry `code`, `message` and `issues`. The CLI writes errors to stderr and exits 1 for a bad request or 2 for a usage or file error.

The browser interface also exposes `window.MediaRatings.tasteProfile(catalog, ratings)` for categorical class information in bits and the projected class centers, and `gaussianProjection(catalog, request)` for the projected conditional latent mean, covariance and component weights. Import the same functions from `taste.mjs` and `core.mjs` for use in Node. Pass a validated catalog. The projection uses the same model key and rating map as a prediction. The categorical projection returns every nonzero between-class PC. Pass `centerClassMeans: true` to `preferenceFingerprint` to project deviations from each class’s overall rating level. Gaussian requests accept optional zero-based `axisIndices` selecting one or two distinct PCs. The default plane comprises the leading two when available. The returned `spectrum` contains the variance fraction of every latent axis.

The CSV readers and writers are exported from `exchange.mjs`. In `ratingsCSV(catalog, ratings, sources, ratedOn)`, the optional maps add `source` and `ratedOn` columns respectively. `importRatingEntries(text, catalog)` returns the `ratings`, `sources` and `ratedOn` maps. When merging film ratings, the app preserves existing dates if the file omits the column. A blank date in an included column clears that date. Valid source values are `volunteered`, `suggested` and `unknown`. Missing or blank CSV sources yield no source entry. `importRatings` returns the ratings map alone.

`preferenceFingerprint(catalog, {model, ratings, volunteered, ratedOn, samples})` from `fingerprint.mjs` is also available on `window.MediaRatings`. It returns class numbers (zero-based `index`), labels, priors and posterior probabilities in descending order. `match` is the unique leading class once ratings have been applied, or `null`. The result includes projected scores with axis poles and variance fractions, class-weighted mean and category probabilities on the recorded scale, and genre or region shifts centered on the catalog-wide shift. An optional catalog `domain` of `books`, `movies`, `cities`, `music`, `anime` or `games` sets the fingerprint heading for imported fits.

`rankChanges(predictions)` from `core.mjs` or `window.MediaRatings` returns a map keyed by item ID with unconditional rank (`from`), conditional rank (`to`), and their signed difference (`change`). Pass the same visible unrated entries shown in the rankings. `tasteProfile` also returns `weightedInformation`, a map of information gain multiplied by each item’s response count divided by the number of respondents. This field is null unless every item supplies a valid `annotations.ratingCount` and `fit.users` is positive. For the bundled films, merge each entry from [film context](film-context.json) into the corresponding item annotations. For destinations, the response count is the sum of the item’s marginal counts in [Stravl evidence](stravl-evidence.json).
