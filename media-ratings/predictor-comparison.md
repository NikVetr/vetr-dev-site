# Predicting stars from volunteered and suggested films

The film default, **Title choice + rating year**, uses the stars you supply, which films you picked yourself, and the date attached to each rating. The two additional signals share the eight classes and film similarities of **Ratings + tags**. A film suggested by the app contributes its stars and any supplied date. Skipping it contributes no evidence. A profile containing only undated, suggested ratings reproduces the **Ratings + tags** forecast exactly.

## What happened to the Schur complement?

The original R script logit-transformed each star value, estimated a single multivariate Gaussian, then conditioned on the supplied coordinates. For observed indices $o$ and target indices $t$, the conditional mean adds $\Sigma_{to}\Sigma_{oo}^{-1}(z_o-\mu_o)$ to $\mu_t$. Its conditional covariance is the Schur complement $\Sigma_{tt}-\Sigma_{to}\Sigma_{oo}^{-1}\Sigma_{ot}$. **Historical logit** retains this approach for films. The ordinal-probit fits in **Destinations** apply Gaussian conditioning within each component, integrate over the latent intervals implied by the observed categories, and average forecasts using posterior component probabilities. The public fitter and scorer support these models for imported catalogs as well. [Original R function](https://github.com/NikVetr/side_projects/blob/249e278/movieRatingPersonalization.R#L79-L87) · [Shared scoring code](core.mjs)

The default film model represents each class by a discrete distribution over the ten star categories for every film. It updates eight class weights by Bayes’ rule. Volunteered titles add a learned class-specific title likelihood ratio. Submission dates calibrate category probabilities for each observed film and the forecast year. A regularized regression then transfers the difference between each input rating and its leave-one-out prediction to similar films. The feature vectors combine rating correlations with MovieLens tags. This final adjustment is an exponential tilt of the categorical forecast. It has no multivariate Gaussian liability or Schur-complement covariance. [Title choices](selection-study.md) · [Calendar calibration](rating-dates.md) · [Film similarities](README.md#does-film-similarity-add-information-beyond-the-classes)

## Measured differences

We selected the default by mean category log loss across a 2,000-person validation set with four randomly revealed, volunteered ratings. Each person has equal weight. The comparisons included the two individual signals, their combination, and three strengths of a person-specific half-star response effect. Validation favored their combination with zero additional half-star effect. The model and signal strengths were then held fixed across the test protocols below. The retrospective test respondents had also been used in earlier model comparisons. [All validation and held-out metrics](validation/personalized.json)

| Input protocol | Test people | Target ratings | Ratings + tags log loss | Default log loss | Ratings + tags RMSE | Default RMSE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Four volunteered | 3,000 | 196,480 | 1.5955 | 1.5702 | 0.9083 | 0.9043 |
| First four volunteered, later targets | 2,998 | 191,266 | 1.6365 | 1.6072 | 0.9289 | 0.9255 |
| Two volunteered, two popular prompts | 3,000 | 196,480 | 1.6104 | 1.5892 | 0.9127 | 0.9099 |
| Four popular prompts | 3,000 | 196,480 | 1.6255 | 1.6158 | 0.9177 | 0.9165 |
| Four informative prompts weighted by familiarity | 3,000 | 196,480 | 1.6100 | 1.6047 | 0.9155 | 0.9145 |
| Twenty informative prompts weighted by familiarity | 2,394 | 152,218 | 1.5230 | 1.5274 | 0.8553 | 0.8527 |

For four volunteered ratings, title choice alone scored 1.5736 and submission year alone scored 1.5876. The paired 95% interval for the improvement over the original baseline with both signals was 0.0221–0.0284 log-loss units. All-prompted forecasts equal the year-only model. In the simulated sessions, the person answers questions for films they rated in MovieLens. The informative policy recomputes familiarity-weighted information gain after each answer. Unrecorded films are skipped. This tests the behavior of the ranking algorithm on the archive. Actual app users can answer and skip differently.

After twenty informative prompts, the default had higher category log loss (difference +0.0044, paired 95% interval +0.0020 to +0.0069) and lower star RMSE and four-star Brier error. That retrospective test scores earlier as well as later ratings from the person, using the latest answer’s calendar year for each prediction. **Ratings + tags** remains available for a source- and date-independent forecast. [Protocol and scoring code](evaluate_personalized.py)

### Forecasting strictly later stars

The forward test fits through December 2017 and predicts strictly later 2019 submissions from new respondents, using each film’s 2017 category calibration. Both arms use collaborative similarities only because the available tag snapshot is from 2019. Four volunteered ratings gave a log loss improvement of 0.0279 (paired 95% interval 0.0255–0.0304). Carrying the last MovieLens calibration forward to ratings made today extends beyond the two-year gap tested here. [Calendar split and training data](rating-dates.md#predicting-in-a-later-calendar-year)

| First inputs in 2019 | Test people | Later targets | Baseline log loss | Default log loss | Baseline RMSE | Default RMSE |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Four, identities volunteered | 5,657 | 357,068 | 1.8045 | 1.7766 | 0.9191 | 0.9153 |
| Twenty, identities volunteered | 4,631 | 271,643 | 1.7156 | 1.7005 | 0.8440 | 0.8405 |
| Same twenty, identities withheld | 4,631 | 271,643 | 1.7156 | 1.7149 | 0.8440 | 0.8415 |

## What can selection explain?

The default conditions on the identities of *supplied* titles a person chose. A separate experiment also reweighted the classes for each *target* by their relative propensity to record that film. It improved the four-volunteered score from 1.5702 to 1.5695. This comparison assumes the person has already chosen the target film for rating. A recommendation in the app selects the target before the person chooses whether to watch or rate it. We kept this target-side correction in the offline experiment.

Someone’s unreported score may affect whether they post, even after conditioning on the observed films and stars. MovieLens records neither complete viewing histories nor randomized opportunities to rate. It cannot identify an extreme-score posting effect from these data alone. A randomized elicitation study with Yahoo Music users could compare ordinary volunteered scores with responses to randomly requested songs. That kind of evidence distinguishes accuracy on recorded ratings from accuracy on a broader set of items. [Marlin et al., randomized elicitation](https://people.cs.umass.edu/~marlin/research/papers/cfmar-uai2007.pdf)

Ordinal factor models with respondent-specific thresholds are another candidate when people use the star scale differently. OrdRec learns the ordinal category probabilities around an underlying preference score. Comparison studies on MovieLens and Netflix also distinguish the ability to predict a star distribution from ranking titles by their chance of clearing a threshold. Those methods need a matched test with unseen respondents, as few as four inputs, and predictions for all ten categories to establish whether they outperform the app’s default. [Koren and Sill, ordinal feedback](https://www.ijcai.org/Proceedings/13/Papers/449.pdf) · [Coscrato and Bridge, uncertainty and ranking](https://www.cs.ucc.ie/~dgb/papers/Coscrato-Bridge-2023.pdf)

## Destination choices

The destination default uses eight categorical classes. On the original independent holdout it scored 0.6184 log loss versus 0.6907 for the selected four-component ordinal-probit fit. A country, region, coastal, climate and income similarity kernel improved the original 873-person comparison from 0.6179 to 0.6135, with a paired 95% interval for the difference spanning zero. A second five-fold check using the locked kernel and one out-of-fold prediction profile for each of 5,894 eligible people gave 0.6134 for classes alone and 0.6142 with geography. Geography remains available for filtering, while the ordinal-probit variants remain in the prediction menu. The destination data are explicit responses to offered items and provide no volunteered-title fit. [Class comparison](validation/stravl.json) · [Geographic comparison](validation/geography.json)

## Reproduce

Start from the respondent-level train/validation/test splits in the film fitting guide. Use the through-2017 fit produced by the calendar experiment for the forward test.

```sh
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
python3 media-ratings/evaluate_personalized.py work ml-25m.zip media-ratings/expanded.json scores.json --cutoff-work work-through-2017
python3 media-ratings/check_rating_year.py media-ratings/expanded.json
Rscript media-ratings/evaluate_geography.R stravl-input/ratings.csv stravl-input/items.csv media-ratings/stravl.json destination-scores.json
```
