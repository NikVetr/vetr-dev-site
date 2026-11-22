# What transfers between ratings on sparse catalogs?

A reviewer who awards three stars to a nearly universally five-star recipe gives information about how they use the scale. A reader who rates a Kindle Worlds novel well above its usual score may also like other books by that author or in that franchise. We tested both effects on six catalogs where the original mixture gave small improvements over the item averages. The updated defaults improve forecasts for previously unseen reviewers in four catalogs. [Development and test results](validation/metadata-transfer.json)

## Four supplied ratings per reviewer

Log loss measures the probability assigned to the actual score. Lower is better. Each person receives equal weight regardless of how many target ratings they contributed. The pooled column uses a single population distribution per item. The next two columns use the original selected class model, first with no answers and then with four. The final column gives the development-selected transfer model with the same four answers. All columns use identical withheld targets. Bold values identify the released defaults.

| Catalog | Test reviewers / scores | Pooled | Classes without answers | Classes with answers | Transfer with answers | Default |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Kindle Worlds | 50 / 271 | 0.5636 | 0.5659 | 0.5639 | **0.4904** | Reader tendency + authors and worlds |
| Amazon tabletop | 230 / 656 | 0.8531 | 0.8528 | 0.8479 | **0.8081** | Reviewer tendency + game categories and collections |
| Book-Crossing | 605 / 3,309 | 1.8418 | 1.8231 | 1.8136 | **1.7420** | Reader tendency + authors |
| Food.com recipes | 1,577 / 10,077 | 0.6624 | 0.6566 | 0.6477 | **0.6377** | Personal rating tendency |
| Food.com cocktails | 66 / 501 | 0.6565 | 0.6399 | **0.6399** | 0.6547 | Eight classes |
| Taste of Home | 38 / 120 | 0.4971 | 0.4969 | **0.4968** | 0.4811 | Eight classes |

The four adopted models also reduced RMSE. It went from 0.564 to 0.492 stars on Kindle Worlds, 0.810 to 0.761 on tabletop, 1.611 to 1.495 points on the 1–10 Book-Crossing scale and 0.648 to 0.640 stars on Food.com recipes. For Taste of Home, the paired 95% interval for the change in log loss was −0.0341 to +0.0026. The small test set leaves the gain uncertain. For cocktails, the development winner lost accuracy on the test respondents. [All candidates, paired intervals and Brier scores](validation/metadata-transfer.json)

**How much did metadata add?** Rating tendency alone attained log losses of 0.5038 on Kindle Worlds, 0.8069 on tabletop and 1.7417 on Book-Crossing. The three combined models won on development data. Their differences from tendency alone included zero in all three paired test intervals. The data support personalizing these scores, with much of the measured improvement available from how generously or severely someone rates. The Kindle Worlds test predominantly covers ratings within a reader's familiar franchises. Only seven test readers could supply four scores outside a target franchise in the original cross-world evaluation. [Kindle Worlds source and sampling](kindle-worlds.md)

## Forecast calculation

The original product-categorical mixture still infers class probabilities from the exact rating categories. For each supplied rating, predict its mean using the other supplied answers and subtract that mean from the observed score. A ridge regression with penalty 0.5 transfers those residuals to a new target. The model multiplies each target category probability by an exponential tilt in the category's score, then renormalizes the distribution. With no supplied scores, it returns the original class-weighted item distribution. The resulting forecasts describe explicitly recorded ratings of the selected items.

Three candidate kernels determine how residuals transfer.

- **Rating tendency** uses a constant feature. The predicted residual is the sum of the supplied residuals divided by the number supplied plus 0.5. Each extra answer helps estimate the reviewer's overall tendency and the amount of shrinkage decreases.
- **Shared metadata** uses the cosine between item vectors of role-specific labels. Each label's weight is the logarithm of one plus catalog size divided by the number of items carrying it. Labels unique to a single item contribute no transferable information. Recipes and cocktails include actual FoodRS ingredient names. The Kindle Worlds vectors use credited authors and named franchises, tabletop uses categories, tags and available collections, and Book-Crossing uses authors.
- **Both** uses an equal-weight average of the two kernels. A source item can influence another through overall rating tendency even when the items share no labels. Matching labels give it more weight. The item-familiarity ranking omits the constant rating-tendency feature when comparing item identities.

The held-out studies concern future scores from reviewers with at least five recorded ratings in the given catalog. People who rate everything they try and people who post only favorites can use the same scores differently. The source records cover items these reviewers chose to rate. When the interface reports information **about taste classes**, that quantity measures only the class component of these forecasts.

## Evaluation and reproduction

We reconstructed each original respondent split and verified that both its three-fold development log loss and its 20% respondent holdout matched the published baseline. Each reviewer belongs to one partition, together with all of their ratings. Each eligible held-out person supplied four uniformly drawn ratings to predict up to twelve others. The underlying class count, item inventory, metadata and ridge penalty stayed fixed. We chose the kernel and tilt minimizing development log loss, testing strengths of 0.125, 0.5, 1 and 2 in five-star units, rescaled for Book-Crossing. On the test respondents, we also evaluated the strongest development-selected tendency-only and metadata-only variants to distinguish the effects.

Adoption required improved development log loss, a lower test RMSE or a tie, and a negative one-sided upper bound for the paired change in test log loss against both the original class model and the pooled item model. The upper bound uses the standard error across reviewers and a one-sided Bonferroni adjustment across the six catalog decisions. Unadjusted, two-sided 95% paired intervals are also reported. Each catalog has its own scale and reviewer population, so the score differences apply within a catalog.

From the repository root, run with NumPy, SciPy, DuckDB and PyArrow. The Kindle script accepts the full 2023 0-core CSV or its row subset for catalog ASINs. The catalog documentation details the source downloads and filters. [Food.com](tv-cocktail-catalogs.md) · [Taste of Home](recipe-catalog.md) · [Kindle Worlds](kindle-worlds.md) · [Tabletop](album-tabletop-catalogs.md) · [Book-Crossing](book-crossing.md)

```sh
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
work=tmp/agent/metadata-transfer
study=media-ratings/evaluate_metadata_transfer.py
python "$study" kindle-worlds tmp/agent/royalroad-editions/Kindle_Store.csv.gz --output "$work"
python "$study" food tmp/agent/tv-drinks/foodrs.duckdb --output "$work"
python "$study" cocktails tmp/agent/tv-drinks/foodrs.duckdb --output "$work"
python "$study" recipes tmp/agent/media-recipes/source.zip --output "$work"
python "$study" boardgames tmp/agent/music-tabletop/toy_meta.json.gz \
  tmp/agent/music-tabletop/toy.csv tmp/agent/music-tabletop/toys-2018.csv --output "$work"
python "$study" book-crossing tmp/agent/granular-sources/book-crossing.zip --output "$work"
```

Each invocation writes a `<catalog>-transfer.json` report to the requested output directory. The combined report is a JSON object keyed by catalog, with each corresponding transfer report as its value. An accepted model additionally produces its updated browser catalog and source-specific validation file. The fitted class weights and emissions are preserved and the alternate class-only forecast remains available. [Shared browser and CLI scoring](api.md)
