# Which films a person chooses to rate

The film model forecasts stars on the scale MovieLens members used. Its eight classes differ in overall rating level, use of half-stars, and relative preferences across films. Giving both *The Matrix* and *Spirited Away* five stars moves the production model's probability on its two “Generous” classes from 26.9% to 53.9%. Across all 500 titles, the class-weighted expected score rises from 3.72 to 3.96 before the item-specific adjustment. The model also transfers a rating above or below its leave-one-out expectation to similar films. These two effects can coexist.

MovieLens 25M records ratings, tags and timestamps. The release has no complete record of which films each person saw, which titles they were offered, or which offers they declined. Randomly withholding four inputs from a person's recorded ratings tests prediction of their other recorded ratings. Predicting what they would say after watching an arbitrary film requires assumptions about selection. [MovieLens 25M data description](https://files.grouplens.org/datasets/movielens/ml-25m-README.html)

## Four-rating comparison

We kept the published 500-film catalog, eight-class fit, item-similarity correction, respondent splits and scoring protocol. We selected among 21 variants by average validation log loss on 2,000 respondents. Each finalist was then scored on the same 3,000 previously held-out respondents and 196,480 target ratings used in earlier comparisons. Each respondent contributes equally. Lower values are better. [All validation choices and held-out scores](validation/selection.json)

| What the model used in addition to the production predictor | Category log loss | RMSE, stars | Brier, ≥4 stars |
| --- | ---: | ---: | ---: |
| Baseline | 1.5955 | 0.9083 | 0.19425 |
| Shared residual generosity | 1.5974 | 0.9113 | 0.19469 |
| Genres of the four supplied films | 1.5926 | 0.9081 | 0.19415 |
| Identities of the four supplied films | **1.5736** | **0.9062** | **0.19365** |
| Supplied identities and residual generosity | 1.5755 | 0.9091 | 0.19410 |

For each of the 154,192 eligible training respondents with at least five in-catalog ratings, we assigned fractional membership to the fitted classes from their stars. Each respondent contributed a total of one count spread uniformly across their rated titles. We estimated a distribution of recorded titles for each class, with eight pseudo-respondents drawn from the pooled distribution for smoothing. The genre version pooled those probabilities within genres, dividing each film's contribution among its genres. It then mapped genre frequency ratios back onto the catalog.

At prediction time, each supplied title contributes its log frequency within a class relative to its pooled frequency, in addition to its star likelihood. Validation chose a multiplier of 0.5 for title evidence from candidates 0.25, 0.5 and 1. This tempers repeated evidence from related films. The selected model reduced log loss by 0.02184 per rating, with a paired respondent-level 95% interval for the improvement of 0.01929–0.02439. The score uses the four supplied identities only. It receives no information about which other films the person rated. [Evaluation script](evaluate_selection.py)

The generosity experiment fitted a single additional offset to the four leave-one-out residuals. A rank-one addition to the existing regularized similarity kernel shrinks that offset toward zero. The remaining residuals determine film-specific adjustments. Validation preferred zero extra offset. With four data points the eight classes already capture much of the predictable variation in rating level. Simple within-person centering would also subtract real taste if someone's few ratings came from a favorite genre. An ordinal factor model could learn a partially pooled respondent threshold and genre affinities jointly, estimate their covariance, and convert predictions back to the person's own stars. It would need its own held-out comparison. [Koren and Sill, ordinal rating distributions](https://doi.org/10.1145/2043932.2043956)

## Where this helps

The title signal is useful when someone chooses which ratings to supply. It can partly reflect genre taste, release era, popularity, or the site's earlier recommendations. A high rating for an unusual genre need not have a fixed extra weight. How diagnostic it is depends on both how likely the person was to select that title and how surprising the stars were for that title.

For a title the app picked, part of the explanation for its presence is known. Treating a click on a suggested film as a freely chosen submission could misclassify the person. A deployment could distinguish self-selected ratings from answers to prompts and evaluate each collection protocol. The film evidence here comes from the MovieLens four-reveal protocol. Extending it to other media or asking a long run of adaptive questions requires its own check.

## What the missing stars might look like

Missing not at random (MNAR) means that even after accounting for observed information, the chance a rating is recorded still depends on the unobserved score. Preferring certain genres can produce predictable differences in exposure without requiring this stronger condition. Choosing to post a rating because the film was especially good or bad can satisfy it. A study that elicited ratings for randomly selected songs found a difference between elicited and volunteered ratings. Its fitted response mechanism does not establish MovieLens members' posting probabilities. [Marlin et al., randomized elicitation study](https://www.cs.toronto.edu/~zemel/documents/cfmar-uai2007.pdf)

For an illustration, assume ratings of 0.5 and 5 stars are twice as likely to be recorded as ratings of 2.5 and 3 stars. Let log recording probability rise linearly from the middle categories to each endpoint. Dividing each observed category count by its assumed relative recording probability and renormalizing gives the following sensitivity analysis for the training sample.

| Film | Recorded mean | Mean if endpoints are 2× as likely to be recorded | Mean if endpoints are 4× as likely |
| --- | ---: | ---: | ---: |
| The Matrix | 4.15 | 3.99 | 3.81 |
| Spirited Away | 4.21 | 4.07 | 3.92 |

The observed stars alone cannot choose among these columns. Separating the decision to watch from the decision to post would require additional evidence. Logged randomized prompts, responses including “haven't seen it,” and recording declines would identify more about reporting among viewers. Estimating preferences after viewing unfamiliar films also requires evidence about exposure and outcomes. Propensity weighting can use known or defensibly estimated inclusion probabilities with sufficient coverage. Latent exposure models can encode assumptions about access or genre, while copulas or additional mixture components model dependence among ratings. Improving the latter alone cannot recover an unknown selection mechanism. [Schnabel et al., propensity-scored evaluation](https://proceedings.mlr.press/v48/schnabel16.html) · [Liang et al., latent exposure models](https://arxiv.org/abs/1510.07025)

Reproduce the comparison after the train-only fits described in the [film fitting guide](README.md).

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/evaluate_selection.py \
  tmp/agent/media-full media-ratings/expanded.json media-ratings/validation/selection.json
```
