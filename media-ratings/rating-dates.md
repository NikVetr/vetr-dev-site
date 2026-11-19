# Do film years and rating dates improve the predictions?

MovieLens records a film’s release year and the UTC timestamp when a member submitted their stars. A person can rate several films they saw years apart in the same sitting. These experiments predict the stars people recorded. The timestamp gives the date of submission. [MovieLens 25M data description](https://files.grouplens.org/datasets/movielens/ml-25m-README.html)

## What each date contributes

- **Release year.** Films ten years apart have a release-year similarity of 0.61 under a Gaussian kernel. We tried assigning this kernel 0%, 10%, or 25% of the weight in the film-similarity adjustment.
- **Rating year.** We estimated each film’s ten-category distribution in each calendar year, adding 100 pseudo-ratings drawn from its all-year training distribution. For each taste class, we multiplied its category probabilities by the ratio of the year-specific to the all-year distribution, raised to a power of 0, 0.5, or 1, and renormalized. Each supplied rating uses its own submission year. We forecast every target as of the latest of the four supplied dates. Actual target timestamps only define the scoring cohort.
- **Session effect.** We tried an additional short-lived offset common to the same person’s films. In the residual regression its covariance starts at 0.25 for simultaneous ratings and decays exponentially over one or 30 days. The comparison includes zero extra covariance. This tests whether giving unusually high or low ratings around the same time helps forecast further stars.

## Matched respondent comparisons

The baseline uses the eight-class model with learned rating and tag similarities. All 27 combinations faced the same 2,000-person validation split in the random-reveal comparison. Within each protocol we chose the lowest respondent-average category log loss on validation, then scored the selected configuration and each factor’s best nonzero setting on the test respondents. These are the same respondent splits used for earlier architecture comparisons. The table gives test log loss. Lower values indicate more probability on the stars respondents supplied. [All candidate scores and paired differences](validation/dates.json)

| Predictor | Four random inputs | First four inputs, strictly later targets |
| --- | ---: | ---: |
| Ratings and tags | 1.5955 | 1.6365 |
| With release-year similarity | 1.5958 | 1.6376 |
| With session effect | 1.5979 | 1.6420 |
| With rating year, full strength | **1.5851** | **1.6259** |
| Published rating-year option, half strength | 1.5876 | 1.6284 |

The random-reveal test scored 196,480 target ratings from 3,000 respondents. The forward ordering scored 191,266 from 2,998. It breaks timestamp ties among inputs with a fixed seed, excludes targets recorded in the same second as the fourth input, and considers films whose release year had arrived by that input. Both validations selected full-strength rating-year calibration with zero weight on the other additions. In the forward ordering RMSE fell from 0.9289 to 0.9244 stars. The paired 95% interval for the log-loss improvement was 0.0071–0.0140.

These two comparisons hold out people. Their historical fits can use other people’s ratings from calendar years after a particular forecast. Changes in how MovieLens collected stars are one reason calendar calibration can help here. MovieLens introduced half-star ratings in February 2003. In these training data fractional stars accounted for 0% of the 667,055 ratings submitted in 2000, 42.2% in 2010 and 37.1% in 2019. [Harper and Konstan, §2.2.2](https://files.grouplens.org/papers/harper-tiis2015.pdf)

The session results concern a shared short-lived shift in stars. A different temporal model can estimate changes in a person’s relative preferences across films or in a film’s overall appeal. Koren estimated these effects separately on longitudinal Netflix ratings. Four supplied stars offer limited evidence for a new respondent’s personal trajectory. [Collaborative filtering with temporal dynamics](https://doi.org/10.1145/1557019.1557072)

## Predicting in a later calendar year

The forward-calendar experiment freezes every star-derived parameter at December 31, 2017. Its baseline refits eight classes and 32 collaborative film factors on the earlier events. Both arms omit the Tag Genome because the available snapshot was compiled in 2019. The film list was selected in retrospect and all 500 films had been released by 2016. This test concerns future ratings of those particular films.

Only people whose first in-catalog rating falls in the evaluation year enter its cohort. Each person supplies their first four in-catalog ratings and the scorer evaluates strictly later ratings from that same year. The 2018 cohort chooses the calendar weight. The 2019 cohort supplies the final test. At forecast time the date-aware model carries the last available training year’s distribution forward. The baseline and candidate see identical films, input stars and targets.

The pre-2018 fit used 10,036,987 ratings from 149,913 people. The 6,239 new respondents in 2018 favored a half-strength correction on validation log loss. On 357,068 later ratings from 5,657 new respondents in 2019, that setting improved all three held-out measures. The paired 95% interval for the log-loss improvement was 0.00320–0.00462. [Forward-calendar results](validation/date-cutoff.json)

| 2019 test | Category log loss | RMSE, stars | Brier, ≥4 stars |
| --- | ---: | ---: | ---: |
| Eight classes and collaborative film factors | 1.8045 | 0.9191 | 0.19915 |
| With 2017 rating distributions at half strength | **1.8006** | **0.9160** | **0.19814** |

All 2019 profiles received the same reference year. That gain supports recent per-film calibration across a two-year gap. It gives no estimate of how tastes drifted within 2019 or how well the archive’s final year represents someone rating films today.

## Rating years in the app

The film default **Title choice + rating year** uses the half-strength adjustment selected in the forward-calendar test. Its annual tables count all 10,944,737 in-catalog ratings from MovieLens 25M across the 500 films and ten star values. It shares its eight classes, film vectors and residual regression with **Ratings + tags**. The public JSON API also supports the year-only comparison under `ratingYear`.

Each dated input uses that year’s class-specific star probabilities. An undated input uses the all-year probabilities. The latest supplied date sets the year for both the personalized forecast and the catalog mean used to measure its shift. Dates outside 1995–2019 use the nearest endpoint year. With undated inputs the default uses stars and any volunteered identities. The year-only comparison with undated inputs reproduces **Ratings + tags**. For a rating you recorded elsewhere, enter the date you gave it those stars. [Prediction API](api.md)

## Reproduce

Run from the repository root after the full MovieLens data preparation, class fitting and Gaussian reference fitting described in the [film fitting guide](README.md). The second command invokes the existing R fitters on a separate scratch copy of the ratings censored at the end of 2017. Supply a dedicated work directory for those fitted files.

```sh
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
python3 media-ratings/evaluate_dates.py work ml-25m.zip media-ratings/expanded.json dates.json
python3 media-ratings/evaluate_date_cutoff.py work ml-25m.zip media-ratings/expanded.json work-through-2017 date-cutoff.json
python3 media-ratings/check_rating_year.py media-ratings/expanded.json
```
