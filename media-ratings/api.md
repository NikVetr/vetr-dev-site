# Rating Prediction API

The page, `window.RatingPrediction.submit`, and the Node 22 CLI use the same prediction code. The browser reads individual ratings and imported catalogs locally. Training takes place offline in R and Python. See the [fitting and dataset guide](README.md).

The existing `window.MediaRatings` name also exposes this API.

From the repository root, predict after a five-star rating of *The Matrix* and a two-star rating of *Forrest Gump*.

```sh
jq '{catalog: ., ratings: {"2571": 5, "356": 2}, threshold: 4}' media-ratings/expanded.json |
  node media-ratings/cli.mjs
```

The CLI reads one JSON file or stdin. Send `catalog` (the entire fitted object). Omit `model` to use its declared `defaultModel`, or pass a key from its `models` map. Catalogs without a declared default require a model key. Optional `ratings` maps catalog item IDs to numeric values on its scale. Omit it to calculate population predictions. The inclusive `threshold` must be a scale value and defaults to the nearest category three quarters of the way up the scale. `samples` controls numerical integration for the ordinal model, from 16 to 8192 per component, default 256.

The result includes the rating scale, cutoff and each component’s prior and posterior probability. For ordinal observations it also reports the effective number of importance samples per component. Unrated items appear in descending expected-rating order. Each has an ID, title, probability vector in scale order, expected rating, unconditional expectation (`prior`), signed difference (`shift`), standard deviation (`sd`), and probability of reaching the cutoff (`chance`). For the biggest surprises, sort by the absolute shift. The precision-weighted ranking uses `expected / max(sd², 0.01)`.

Pass an optional unrated `targetId` to `submit` or `predict` to return only its prediction. For applied ratings, call `heldOutRatings(catalog, {model, ratings, volunteered, ratedOn, samples})` from `core.mjs` or `window.RatingPrediction`. It returns one row per supplied answer in catalog order, with `itemId`, `title`, `observed`, `expected`, `gap` (observed minus expected) and `probability` for the observed answer. Each target's rating, volunteered title evidence and submission date are excluded from its own forecast.

The browser exposes `window.RatingPrediction.discoveryRanking`. Node can import the same function from `discovery.mjs`. Call `discoveryRanking(catalog, {predictions, ratings, volunteered, weight, discovery})` with the rows returned by `predict`. Supply the catalog-matched `steam-discovery.json` as `discovery` for Steam, or omit it for metadata-based review context. The `weight` ranges from 0 for expected rating to 1 for review affinity. Pass only explicitly self-chosen rated IDs in `volunteered`. Each returned row keeps its original forecast and adds its relevance percentile, affinity percentile and blended ranking score. `mode` reports `raw`, `context` or `unavailable`. [Ranking definition and evaluation](discovery-study.md)

A catalog contains a name, sorted numeric `scale`, optional `scaleLabels`, unique `items` with string `itemId` and `title`, and named `models`. An ordinal or logit model has a `kind`, strictly increasing finite category `cuts`, and one or more components with positive weights summing to one, mean vectors in item order and symmetric positive-definite covariance matrices. The `logit-point` family requires one component and an `endpoint` for the highest observed rating. See [the 12-place Gaussian pilot](stravl.json) for a small complete example. Individual training records never enter the catalog.

The `latent-class` family has positive component weights and an item-by-rating `probabilities` matrix for each component. Each row sums to one in scale order. Its posterior class weights and target probabilities are exact. `samples` affects the ordinal integration only. The optional `selection.model` records the original cross-validation pick. Bundled items also carry descriptive `annotations` for browsing and interpreting the projections. An integer `annotations.year` enables an inclusive year filter and newest-first sorting. For a book catalog use its publication year. The expanded destination catalog uses eight categorical classes. The archived 12-place pilot also includes one-, two- and four-component ordinal-probit models. Binary activity catalogs use 0 for an observed absence and 1 for a recorded action. Leave unknown entries out of the request. On this scale, the expected value is the probability of the action. [Fitting and cross-validation](README.md)

The film catalog defaults to `personalized`, which combines the `ratingsTags` predictor with volunteered-title evidence, annual calibration and shared creator credits. The `class-similarity` model references a categorical fit by `base` and carries one feature vector per item. Vector dot products give the ratings-and-tags similarity. The optional `creatorSimilarity` adds weighted overlap for distinct films. Its `items` array has one entry per film, containing integer ID lists for directors, lead cast and production companies in this order. IDs are local to their role. Each present role has equal weight in the film’s unit vector. A positive `weight` below the ridge scales the additional cosine similarity. Ridge regression transfers leave-one-out rating residuals between films, and `strength` controls the tilt of the predicted category probabilities. Class membership and the population distribution come from the reference categorical fit. Select `latentClass` for the eight-class forecast alone or `reference` for the historical logit model.

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

The browser interface also exposes `window.RatingPrediction.tasteProfile(catalog, ratings)` for categorical class information in bits and the projected class centers, and `gaussianProjection(catalog, request)` for the projected conditional latent mean, covariance and component weights. Import the same functions from `taste.mjs` and `core.mjs` for use in Node. Pass a validated catalog. The projection uses the same model key and rating map as a prediction. The categorical projection returns every nonzero between-class PC. Pass `centerClassMeans: true` to `preferenceFingerprint` to project deviations from each class’s overall rating level. Gaussian requests accept optional zero-based `axisIndices` selecting one or two distinct PCs. The default plane comprises the leading two when available. The returned `spectrum` contains the variance fraction of every latent axis.

The CSV readers and writers are exported from `exchange.mjs`. In `ratingsCSV(catalog, ratings, sources, ratedOn)`, the optional maps add `source` and `ratedOn` columns respectively. `importRatingEntries(text, catalog)` returns the `ratings`, `sources` and `ratedOn` maps. When merging film ratings, the app preserves existing dates if the file omits the column. A blank date in an included column clears that date. Valid source values are `volunteered`, `suggested` and `unknown`. Missing or blank CSV sources yield no source entry. `importRatings` returns the ratings map alone.

`preferenceFingerprint(catalog, {model, ratings, volunteered, ratedOn, samples})` from `fingerprint.mjs` is also available on `window.RatingPrediction`. It returns class numbers (zero-based `index`), labels, priors and posterior probabilities in descending order. `match` is the unique leading class once ratings have been applied, or `null`. The fingerprint centers profiles across items by default. Set `centerClassMeans: false` to include the overall rating level. `allAxes` contains each measurable axis’s index, variance fraction, posterior mean score and score in population standard deviations. `displayAxes` is the ordered subset with distinct supported labels and at least 1% of the variance. Its `low`, `high` and `evidence` describe the poles. Unlabeled entries in `allAxes` have `interpretable: false` and null poles. Merge each built-in catalog’s annotation sidecars before requesting the same labels from Node as in the browser. `axes` describes the selected projection. `gaussianProjection` accepts `centerClassMeans` (default false) and `overview: true` to return every axis’s loadings and posterior mean while computing covariance only for the selected plane. The result of `preferenceFingerprint` also includes class-weighted mean and category probabilities on the recorded scale, and shifts by recurring catalog category, centered on the catalog-wide shift. An optional catalog `domain` of `books`, `movies`, `cities`, `music`, `anime`, `recipes` or `games` sets the fingerprint heading for imported fits.

`rankChanges(predictions)` from `core.mjs` or `window.RatingPrediction` returns a map keyed by item ID with unconditional rank (`from`), conditional rank (`to`), and their signed difference (`change`). Pass the same visible unrated entries shown in the rankings. `tasteProfile` also returns `weightedInformation`, a map of information gain multiplied by each item’s response count divided by the number of respondents. This field is null unless every item supplies a valid `annotations.ratingCount` and `fit.users` is positive. For the bundled films, merge each entry from [film context](film-context.json) into the corresponding item annotations. For activity catalogs the count measures positive actions. For destinations, the response count is the sum of the item’s marginal counts in [Stravl evidence](destinations-evidence.json).


## Group predictions

Send `catalog` and a `profiles` array of at least two people to the same CLI or `window.RatingPrediction.submit`. Each entry has a `name`, a nonempty `ratings` map, and optional `volunteered` IDs and `ratedOn` dates in the individual request format. Each forecast uses the same catalog and model. The optional `threshold` uses the catalog scale. Select `order: "joint"` (default) or `"mean"`.

```sh
jq '{catalog: ., threshold: 4, profiles: [
  {name:"Alex", ratings:{"2571":5,"260":4}},
  {name:"Sam", ratings:{"356":3,"260":2}}]}' media-ratings/expanded.json |
  node media-ratings/cli.mjs
```

The output lists titles unrated by all members, with each person's expected rating and threshold probability, the group mean, and the product of the probabilities under independent answers. The fingerprint reports positions and ranges in population standard deviations on the same axes for everyone. Cross-profile surprises compare a recorded rating with the mean forecast from the other members who have not rated that title. Shared ratings are listed with their observed range.

## Choosing the next rating

Pass a fitted categorical `tasteProfile` result to `questionScores(profile, familiarityWeight = 0.5)` in `taste.mjs` or `window.RatingPrediction`. It returns a map of unrated item IDs to scores between 0 and 1. Higher scores come first. For each item the score is `(1 − weight) × information percentile + weight × familiarity percentile`. Zero orders by raw information gain and one by estimated familiarity. The midpoint gives each ordering equal weight. Percentiles compare all remaining unrated entries, tied values share their average rank and a singleton has percentile 0.5. The raw information in bits remains in `profile.information`.

`profile.familiarity` is a map of ranking percentiles. An item starts with `log(ratingCount + 0.5)`. We add its closest positive cosine similarity to a previously rated item. Fitted item vectors and inverse-document-frequency-weighted metadata each supply a similarity when available. Shared authors, series, credits, genres, tags, country and region can contribute. In binary activity catalogs, fitted differences in action frequency across respondent classes also provide item vectors. Either a high or low explicit rating establishes that the person rated an item. For action-only data, an affirmative action establishes the connection and a recorded absence gives no familiarity evidence. The ranking uses population counts alone when there is no relevant connection. A missing count makes the familiarity map null and leaves the information order available. Merge the film count and optional credit sidecars into item annotations as the workspace does.

This is a proxy for what a person might recognize. MovieLens measures submitted ratings and has no complete viewing or recognition history. With four supplied films, the fraction of the next 20 suggestions a held-out respondent had also rated improved from 37.31% for counts alone to 40.04% with proximity. The paired 95% interval for the gain was 2.43–3.03 percentage points across 3,000 people. Another 2,000 respondents selected a similarity multiplier of 1. The study holds out people for the counts and rating-derived vectors and uses fixed tag and credit metadata. Other catalogs use this film-selected multiplier. Reproduce the comparison with `python3 media-ratings/evaluate_familiarity.py work media-ratings/expanded.json media-ratings/film-creators.json scores.json` after preparing the MovieLens training matrix and split. [Familiarity validation](validation/familiarity.json) · [MovieLens data description](https://files.grouplens.org/datasets/movielens/ml-25m-README.html)

## Aggregate co-ratings

The built-in Goodreads fanfiction catalog ships fitted probabilities and an `observationsNote` that the browser displays in the co-rating panel.

For catalogs with observed tables, the `<catalog>-evidence.json` manifest lists the item IDs, scale and per-item marginal counts. For zero-based item indices `lo < hi`, pair `hi * (hi - 1) / 2 + lo` stores rows for the lower index and columns for the higher index. Dense grids use little-endian unsigned 16-bit counts. Large catalogs split them across `packedFiles` at `pairsPerFile` pair boundaries. The browser fetches the blocks for the selected comparisons on demand. Small catalogs use one `packedFile` or inline `pairs`.

Complete binary cohorts can specify `packedLayout: "binary-overlap"` and `cohortSize`. Each pair then stores only the count of people positive on both entries. The two one-sided positive counts follow by subtracting the overlap from each positive marginal. Subtracting the positive union from the cohort size gives the double-negative count, which can exceed 65,535. This encoding applies to the complete AO3 activity cohort. Missing explicit reviews on Steam remain unobserved.
