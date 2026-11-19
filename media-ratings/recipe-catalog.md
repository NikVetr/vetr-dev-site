# Recipe ratings

The recipe catalog covers all 100 entries in the Taste of Home list archived by Amir Ali, Stanislaw Matuszewski and Jacek Czupyt in 2023. The UCI release includes the original list position and a shared identifier for reviews of the same recipe. That preserves distinctions such as Cheeseburger Soup and Cheeseburger Paradise Soup. The browser displays the archived title. Its source link opens the publisher's current page when the IDs match. The checked-in catalog includes 95 verified links and the publisher's available course labels. [UCI dataset and citation](https://doi.org/10.24432/C5FG95) · [Taste of Home collection](https://www.tasteofhome.com/collection/our-100-highest-rated-recipes-ever/)

Scores range from one to five whole stars. The archive contains 18,182 comments, including 1,696 without a star rating. The fit keeps each person's most recent explicit rating of each recipe. This yields 15,795 ratings from 12,420 people. Only 224 people rated at least five recipes, and 83.7% of the retained ratings were five stars. Predictions describe the scores these reviewers posted for these recipes.

Three-fold validation compared 1, 2, 4 and 8 latent classes on respondent-disjoint splits, supplying four ratings for each eligible reviewer. Eight classes had the lowest mean log loss across the 105 eligible validation reviewers. The held-out comparison used 120 targets from 38 additional reviewers, weighting each reviewer equally. The eight-class model reduced log loss from 0.5384 to 0.5365 and RMSE from 0.3994 to 0.3992 stars. These small differences and the small evaluation group limit what this comparison establishes about personalization. The published coefficients use all 12,420 people. [Validation results](validation/recipes.json)

The UCI dataset is licensed under CC BY 4.0. The public files adapt the data into recipe names, summary counts, pairwise rating tables and fitted probabilities. Reviewer identities, comments and photographs stay out of the public files. [Dataset license](https://creativecommons.org/licenses/by/4.0/)

## Reproduce the catalog

Run from the repository root with NumPy and SciPy installed. The source archive used here has SHA-256 `aff630962b32fb8e8fc43ba8eddf79c45e2ae70321e81dda383c95f04887b77f`. The publisher metadata cache is independent of the model fit. Use an empty cache to refresh links and course labels.

```sh
mkdir -p tmp/agent/media-recipes
curl --fail --location 'https://archive.ics.uci.edu/static/public/911/recipe+reviews+and+user+feedback+dataset.zip' -o tmp/agent/media-recipes/source.zip
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python media-ratings/prepare_recipes.py \
  tmp/agent/media-recipes/source.zip media-ratings --page-cache tmp/agent/media-recipes/pages
```
