# Media Ratings API

The page, `window.MediaRatings.submit`, and the Node 22 CLI use the same prediction code. The browser reads individual ratings and imported catalogs locally. Training takes place in R. See the [fitting and dataset guide](README.md).

From the repository root, predict after a five-star rating of *The Matrix* and a two-star rating of *Forrest Gump*.

```sh
jq '{catalog: ., model: "ordinal", ratings: {"2571": 5, "356": 2}, threshold: 4}' media-ratings/movielens.json |
  node media-ratings/cli.mjs
```

The CLI reads one JSON file or stdin. The required fields are `catalog` (the entire fitted object) and `model` (a key in its `models` map). Optional `ratings` maps catalog item IDs to numeric values on its scale. Omit it to calculate population predictions. The inclusive `threshold` must be a scale value and defaults to the nearest category three quarters of the way up the scale. `samples` controls numerical integration for the ordinal model, from 16 to 8192 per component, default 256.

The result includes the rating scale, cutoff and each component’s prior and posterior probability. For ordinal observations it also reports the effective number of importance samples per component. Unrated items appear in descending expected-rating order. Each has an ID, title, probability vector in scale order, expected rating, unconditional expectation (`prior`), signed difference (`shift`), standard deviation (`sd`), and probability of reaching the cutoff (`chance`). For the biggest surprises, sort by the absolute shift. The precision-weighted ranking uses `expected / max(sd², 0.01)`.

A catalog contains a name, sorted numeric `scale`, optional `scaleLabels`, unique `items` with string `itemId` and `title`, and named `models`. An ordinal or logit model has a `kind`, strictly increasing finite category `cuts`, and one or more components with positive weights summing to one, mean vectors in item order and symmetric positive-definite covariance matrices. The `logit-point` family requires one component and an `endpoint` for the highest observed rating. See [the destination catalog](stravl.json) for a small complete example. Individual training records never enter the catalog.

The `latent-class` family has positive component weights and an item-by-rating `probabilities` matrix for each component. Each row sums to one in scale order. Its posterior class weights and target probabilities are exact. `samples` affects the ordinal integration only. The fitted catalog’s optional `selection.model` identifies the CV pick. To use it in the example above, set `model: .selection.model` in the jq expression. Existing ordinal and reference model keys remain available. [Fitting and cross-validation](README.md)

The ES module exports `submit(request)`, or `validateCatalog(catalog)` and `predict(catalog,request)` for repeated calls on a validated catalog. Errors carry `code`, `message` and `issues`. The CLI writes errors to stderr and exits 1 for a bad request or 2 for a usage or file error.

The browser interface also exposes `window.MediaRatings.tasteProfile(catalog, ratings)` for categorical class information in bits and the projected class centers, and `gaussianProjection(catalog, request)` for the projected conditional latent mean, covariance and component weights. Import the same functions from `taste.mjs` and `core.mjs` for use in Node. Pass a validated catalog. The projection uses the same model key and rating map as a prediction. The CSV readers and writers are exported from `exchange.mjs`.
