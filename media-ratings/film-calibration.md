# Film forecast calibration on newer respondents

## Evaluation protocol

Freeze the published MovieLens 25M film fits and the 500 film IDs. Use MovieLens 32M only for evaluating these fits and learning a post-processing correction. Verify the movie IDs against the catalog's IMDb links. The first observed rating anywhere in 32M determines the respondent's cohort. User IDs are used only within a release.

* **Development:** first rating in 2020 or 2021, with inputs and targets before 2022.
* **Confirmation:** first rating in 2022 or 2023, with inputs and targets through the October 2023 archive endpoint.
* Within each cohort select up to 3,000 eligible respondents by a deterministic hash of their ID. Reveal the first four in-catalog ratings with their dates and volunteered identities. Break timestamp ties deterministically by a hash of the respondent and item, and score only strictly later submissions. Weight respondents equally, then targets equally within a respondent.
* Fit one correction on development probabilities from the published default. Multiply the log probability of each star category by a common positive slope and add one intercept per category, then normalize across all ten categories. Minimize respondent-weighted category log loss with a fixed quadratic penalty of 0.0005 times the sum of squared deviations from the identity transform. Freeze this mapping before producing any confirmation forecasts.
* Compare the corrected distribution, the published default, the historical Gaussian and the eight-class model on identical targets. Report category log loss, RMSE, Brier error at four stars, normalized ranked probability score, reliability at every nontrivial star cutoff, and central range width and coverage at 50%, 80%, 90% and 95%. Estimate paired differences and uncertainty using respondents as the independent units.

The experiment tests four dated, volunteered inputs on films people rated. A correction learned for that protocol needs further validation before applying it to other profiles. The archive only supplies retained ratings and anonymized IDs. A person's first record in 32M is the available proxy for when they joined.

## Confirmation results

The development cohort contributed 186,901 targets from 3,000 of 13,974 eligible people. Confirmation used 172,936 targets from 3,000 of 7,216 eligible people.

| Model | Category log loss | RMSE in stars | Four-star Brier | Four-star calibration gap | 90% tie-adjusted coverage | Central range width in stars |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Published default | 1.7859 | 0.9185 | 0.2007 | 4.21 pp | 88.79% | 2.52 |
| Ratings + tags | 1.8154 | 0.9231 | 0.2021 | 4.08 pp | 89.21% | 2.55 |
| Historical Gaussian | 1.8864 | 0.9185 | 0.2003 | 2.08 pp | 87.21% | 2.69 |
| Eight classes | 1.8204 | 0.9317 | 0.2038 | 3.17 pp | 89.37% | 2.62 |
| Recalibrated default | 1.7703 | 0.9114 | 0.1990 | 2.08 pp | 89.92% | 2.68 |

The correction improved log loss by 0.01562 per rating (paired respondent-level 95% interval 0.01282–0.01843). Its fitted slope was 0.772. The recalibrated 90% coverage interval across respondents was 89.57%–90.27%. The normalized ranked probability score fell from 0.10511 to 0.10423. The interface labels the fitted correction as experimental because this test covered four dated, volunteered inputs. The shipped default also serves different numbers of ratings, prompts and undated histories. Ratings + tags was scored afterward on the same frozen confirmation sample to cover every model offered in the film dropdown.

Each calibration gap averages absolute observed-minus-predicted differences over ten fixed probability bands using respondent weights. Coverage integrates over ties at the discrete category boundaries. The JSON also reports the actual probability mass and empirical hit rate of the inclusive whole-category range. Width is its upper endpoint minus its lower endpoint. All intervals for performance describe sampling variation over respondents, conditional on these fitted models.

Use the project’s Python environment with NumPy and SciPy and the same Node runtime as the app, from the repository root:

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/evaluate_film_calibration.py ml-32m.zip scores.json
```

[Scores, interval diagnostics and frozen mapping](validation/film-calibration.json) · [MovieLens 32M, GroupLens](https://grouplens.org/datasets/movielens/32m/) · [MovieLens research terms and attribution](MOVIELENS-LICENSE.txt)
