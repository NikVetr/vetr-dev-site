# Do the film predictors help with destinations?

The eight-class destination model remains the default. Combining geographic similarity, correlations between city ratings and a personal tendency to answer *Maybe* reduced development log loss from 0.6164 to 0.6137. On the held-out respondents the two forecasts scored 0.6126 and 0.6127. The paired 95% interval for the candidate minus the existing model was −0.0051 to +0.0053. The wider data and alternative question orders also gave little reason to change the default. [Complete results](validation/city-transfer.json)

| Inputs for held-out traveler | Travelers | Target swipes | Eight classes | Combined model |
| --- | ---: | ---: | ---: | ---: |
| Up to four random answers | 1,157 | 1,230 | 0.6126 | 0.6127 |
| Most frequently rated first | 1,157 | 1,230 | 0.6197 | 0.6201 |
| Most informative, weighted by familiarity | 1,157 | 1,230 | 0.6078 | 0.6076 |
| Exactly four random answers, for travelers with five or more | 243 | 316 | 0.4849 | 0.4807 |

Each value is mean category log loss, averaged first over a person's targets and then over people. Lower is better. The paired intervals included zero for all four protocols. For random inputs, the combined model slightly improved RMSE (0.8106 to 0.8094 on the 0–2 scale) and Brier error for “Yes” (0.1732 to 0.1724).

## What transferred

- **Classes and training volume.** The 12 displayed destinations have 27,047 swipes from 12,905 people. We tested 8 and 16 classes on this panel, and 8 classes fitted across the wider archive, which contains 813,802 unambiguous recorded swipes from 61,130 people on 1,452 destinations. The wider fit for the held-out test used 767,653 swipes from 58,549 training respondents. At prediction time it received exactly the same inputs and predicted the same 12-item panel. On the random-input test, wide training gave 0.61262 versus 0.61261 for panel training. The resulting comparison estimates the benefit of extra training information for the 12 displayed destinations.
- **Collaborative and content similarities.** We compared pairwise rating correlations from jointly observed panel swipes, a rank-32 collaborative embedding trained across the archive after removing regularized person and destination biases, the geographic kernel, and equal-weight geographic/collaborative blends. Geography uses country, region, distance-to-coast category, annual temperature and precipitation, and national GDP per capita. All learned features exclude held-out people. As in the film model, kernel ridge regression transfers leave-one-input-out residuals, then tilts the category probabilities. The selected blend used panel correlations and geography, a ridge of 0.5 and tilt strength of 0.25. This term alone scored 0.6110 on the random-input test (paired difference −0.0017, 95% interval −0.0044 to +0.0011). [Earlier geography-only results](validation/geography.json)
- **Response style.** A shared, shrunk upward or downward adjustment tests generosity beyond the classes. A separate estimate allows a person to use the middle response more or less often than expected for their supplied destinations. Its penalized logistic intercept compares the number of “Maybe” answers with class predictions made while withholding each answer. The chosen prior variance was 1 on the log-odds scale. This adjustment by itself scored 0.6143 on the random-input test. A traveler can prefer most destinations, use “Maybe” often, or both. Class membership already captures some of these differences.
- **Title choice, dates and domain-specific content.** Stravl offered destinations for travelers to swipe. The released lists group answers by category and supply neither within-session swipe order nor per-swipe dates. They cannot support the featured film signals from volunteering an item, submission year, or temporal autocorrelation. The later smile/frown feedback about algorithmically selected recommendations has different meanings and response opportunities. Blank fields contribute no preference evidence. Film tags, scripts, release dates, budgets and box office lack direct counterparts in the swipe data. The geographic attributes above are the city content features evaluated here. [Stravl release and field definitions](https://github.com/Stravl/Stravl-Data)

The original archive supplied the fixed panel of items with good joint coverage. Four respondent-disjoint folds selected settings on 4,737 development respondents and 5,035 targets. The separate 20% holdout reuses the people from the earlier city class comparison. Within each fold, every candidate sees the same answers and targets. Simulated app questions use the baseline class model and training-only counts. A missing answer counts as a skip. Only 243 holdout respondents supplied at least five answers on this panel, which limits precision for longer profiles. [Original city selection](validation/stravl.json)

## Which parts of the film classes are learned?

Each class weight and each class/film probability vector over the ten star categories is learned. MAP-EM alternates between assigning each training viewer fractional membership and updating category counts with those fractions as weights. Each class/film vector receives pseudo-counts proportional to that film's pooled rating histogram. Two seeded starts compete by penalized objective for each multi-class fit. New users update their class probabilities by Bayes’ rule. Descriptive class labels are assigned after fitting. [Estimator](latent_class.R)

The prespecified class-count grid was 1, 2, 4 and 8. Smoothing strengths were 8 and 64 pseudo-ratings. Four-fold respondent-grouped cross-validation on the MovieLens 1/32 development sample selected eight classes and strength eight by user-mean held-out category log loss. The release refits these settings using all 10,944,737 observed ratings on the 500-film catalog. Eight was the upper end of that search. A wider class-count grid would test whether more classes improve prediction. The film default builds on those categorical distributions with learned title choice, rating-year calibration and residual item similarity. Its latent variable is discrete. The separate destination ordinal-probit fits still use conditional Gaussian liabilities within mixture components. [Film selection grid and results](validation/expanded.json) · [Scoring and film comparisons](predictor-comparison.md)

A lead from the earlier research is OrdRec, which learns a person's ordinal thresholds around a latent preference score and predicts a distribution over stars. It directly addresses different uses of the scale. Its advantage for new users with four supplied ratings remains an empirical question. A separate line of work measured the bias in volunteered ratings using randomly requested songs. Comparable elicitation data could test whether movie or city forecasts generalize to unchosen items. [Koren and Sill, OrdRec](https://doi.org/10.1145/2043932.2043956) · [Marlin et al., randomized elicitation](https://people.cs.umass.edu/~marlin/research/papers/cfmar-uai2007.pdf)

## Reproduction

Run from the repository root using the two files from the Stravl release. Python needs NumPy and SciPy. R uses Matrix and jsonlite. The shared browser/CLI scorer verifies the baseline and the residual-similarity calculations on every held-out protocol.

```sh
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
python3 media-ratings/prepare_stravl.py Stravl_Travel_Preference_Data.csv destination_ids.txt work/panel
python3 media-ratings/prepare_city_transfer.py Stravl_Travel_Preference_Data.csv destination_ids.txt work/cities
Rscript media-ratings/fit_city_transfer.R work/panel/ratings.csv work/panel/items.csv media-ratings/stravl.json work/cities
python3 media-ratings/evaluate_city_transfer.py work/cities media-ratings/stravl.json work/city-transfer.json
```
