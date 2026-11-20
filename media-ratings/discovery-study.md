# Steam review choice and discovery

A Steam thumbs-up forecast estimates how likely a person would be to recommend a game if they reviewed it. A game can have near-unanimous approval among a small group of enthusiasts. Other games can appeal to a broader audience while dividing the people who review them. The Steam graph contains volunteered thumbs-up and thumbs-down reviews. It has no record of which other games a player saw, considered, bought or tried without reviewing. [Steamworks review documentation](https://partner.steamgames.com/doc/store/reviews) · [Review graph and fitting](game-catalog.md)

The **review context** ranking adds evidence about the titles a player would select for review. A voluntarily selected thumbs-down supplies evidence about their choice of game and negative evidence about their approval. A rating of an app suggestion supplies its approval evidence alone. Imported ratings can supply choice evidence when their source explicitly records a voluntary choice. A missing vote stays unknown. Forecasts, probabilities and class weights retain their ordinary rating-model values at every slider setting.

## Measuring a shared audience

The Steam model estimates a title’s share of recorded reviews across the catalog. For each game a player reviewed, it also counts the other games they reviewed. A player with ten games contributes one ninth to each of the nine other games, giving each reviewer one unit of weight per anchor game. The conditional distribution is shrunk toward the catalog share with 50 prior reviews. The released table keeps the 64 largest positive excesses above the catalog share for each anchor. The number is a storage bound. Estimates are stored to seven decimal places. [Data preparation](prepare_steam_discovery.py)

For a new profile, the affinity score starts at the candidate’s catalog share and adds the mean excess for the games the person selected voluntarily. Multiple inputs can therefore support different kinds of games. With at least four choices and one outside the most-reviewed tenth of the catalog, Steam also adjusts affinity for the popularity of the selected games, as evaluated below. This score is relative. In particular, a title appearing in 1% of the review graph does not imply that 1% of people would choose it. The interface blends the percentile rank of this affinity with the percentile rank of modeled approval among the candidate predictions. Ties keep the original forecast ordering. At 100% review context, even a game likely to attract criticism could rank highly.

Other explicit-rating catalogs can use review count and proximity to the selected titles in fitted features or catalog metadata. Film proximity previously increased the share of top-20 suggestions with another recorded rating from 37.3% to 40.0%. Other domains have no Steam-style calibration for the slider. With no volunteered titles or useful context, the existing forecast order is used. Recorded-action catalogs already model events such as replies or kudos. Stravl respondents rated destinations offered in a survey. These catalogs keep their original ordering. [Film familiarity benchmark](validation/familiarity.json)

## Held-out review retrieval

The comparison used the 1,136-game catalog and the existing Steam respondent split. The approval predictor and co-review statistics used 8,343,234 training players. Each evaluation player had at least five recorded reviews. Four randomly revealed reviews, regardless of vote, supplied the profile. We ranked all 1,132 remaining games and counted how many of the player’s other actual reviews appeared among the first twenty. Recall is averaged per player. Positive-review recall conditions on having at least one held-out thumbs up. An unreviewed game supplies no vote in either metric.

On 4,000 validation players, all volunteered identities produced 35.91% review recall at full context, versus 35.24% using only thumbs-up identities. The ordering therefore uses all voluntarily selected titles. A first 8,000-player test compared the entire tradeoff curve. At full context, review recall was 36.26%, versus 25.84% using review popularity alone and 3.75% using predicted approval alone.

We subsequently chose the recommendation preset by maximizing **positive-review recall** subject to a 95% floor on the mean *predicted* approval of the top twenty. The criterion was applied to validation and locked before scoring a fresh, disjoint 8,000-player confirmation group. This approval floor expresses a recommendation preference. It does not measure the actual approval of titles the player left unrated. [Complete validation, test and confirmation results](validation/steam-discovery.json)

| Review context | Validation positive-review recall at 20 | Mean predicted approval at 20 |
| --- | ---: | ---: |
| 0% | 3.58% | 98.86% |
| 25% | 16.95% | 97.42% |
| 50% | 21.85% | 96.97% |
| **75%** | **26.20%** | **96.52%** |
| 100% | 36.44% | 87.25% |

| Confirmation ranking | All-review recall at 20 | Positive-review recall at 20 | Mean predicted approval at 20 |
| --- | ---: | ---: | ---: |
| Predicted approval | 3.77% | 4.10% | 98.87% |
| Review popularity | 25.19% | 24.95% | 87.29% |
| **75% review context** | **24.26%** | **26.28%** | **96.57%** |
| 100% review context | 36.02% | 36.37% | 87.36% |

The 75% preset recovered **1.33 percentage points more positive reviews than popularity** (paired 95% interval +0.50 to +2.16), while all-review recall was 0.93 points lower (−1.73 to −0.13). Its gain in positive-review recall over approval-only ranking was 22.19 points (+21.45 to +22.92). The retrospective cohort favors frequent reviewers and uses an inventory selected with the full archive. Putting these titles in front of new players would be a different experiment.

An independent change to the Steam approval predictor introduced a beta-binomial game prior. On the same confirmation players, the frozen 75% mix with that fit recovered 26.21% of hidden positive reviews at 96.56% mean modeled approval. Popularity recovered 24.95%. The paired difference was +1.26 points (+0.42 to +2.09). [Approval pooling study](validation/games-pooling.json)

For a profile voluntarily recommending *Portal*, *Portal 2*, *Half-Life 2*, *Half-Life 2: Episode Two*, *Borderlands 2* and *Grand Theft Auto V Enhanced*, approval-only ranked *Shooters, Ready!* and *Meddl Dash* first. The 75% ranking started with *Schedule I*, *Left 4 Dead 2*, *Baldur’s Gate 3*, *Half-Life* and *Half-Life 2: Episode One*. This example illustrates the two orderings and was excluded from parameter selection.

Exposure-aware models can estimate latent exposure when interaction data are sparse. Propensity-weighted evaluation can correct for selective observations when inclusion probabilities are known or credibly estimated. The available Steam graph cannot distinguish a person who never saw a game from one who saw it and deliberately passed. Inferring enjoyment after an unfamiliar recommendation would require evidence about exposure, ideally from logged randomized offers and subsequent responses. [Liang et al., Modeling User Exposure in Recommendation](https://www.cs.columbia.edu/~blei/papers/LiangCharlinMcInerneyBlei2016.pdf) · [Schnabel et al., Recommendations as Treatments](https://proceedings.mlr.press/v48/schnabel16.html)

## Do four popular games predict a preference for more?

Yes, to a degree. Of 8,000 fresh test players, 1,431 volunteered four games all in the most-reviewed tenth of the catalog (114 games with at least 23,159 training reviews each). On average, **70.4%** of those players’ remaining reviews also fell in that tenth, compared with **59.3%** across all test players. Four popular reviews still left considerable room for less widely reviewed titles in the same person’s history.

We compared the 75% review-context preset with an adjustment for the popularity of each person’s four reviewed titles. We standardized the natural logarithm of each game’s training review count using the mean and standard deviation across recorded training reviews. For a player with four revealed titles, the sum of their standardized values divided by eight gives a mean shrunk halfway toward zero. We multiplied the existing affinity by `exp(strength × player mean × candidate standardized popularity)` before percentile ranking. This favors less-reviewed games for a person who chose unusually obscure games, and more-reviewed games for a person who chose unusually popular ones. The review predictions and 75% blend were fixed.

All tested strengths (0, 0.25, 0.5 and 1) met the existing 95% modeled-approval floor on the original 4,000 validation players. Strength 1 maximized positive-review recall there. We compared that setting with the released ranking on the next 8,000 unused players, separately considering those whose four revealed titles were all in the most-reviewed tenth. Before testing, we specified an overall gain of at least 0.5 percentage points with a paired 95% interval above zero as a material improvement. [Study and paired intervals](validation/steam-popularity-affinity.json)

| Test group | Ranking | Review recall at 20 | Positive-review recall at 20 | Mean predicted approval at 20 |
| --- | --- | ---: | ---: | ---: |
| All 8,000 | Co-review baseline | 24.61% | 26.75% | 96.54% |
| All 8,000 | Popularity adjustment | 25.15% | 27.32% | 96.52% |
| Four popular games (1,431) | Co-review baseline | 30.59% | 32.75% | 96.83% |
| Four popular games (1,431) | Popularity adjustment | 30.15% | 32.21% | 96.82% |

The adjustment gained **0.57 percentage points** of positive-review recall overall (95% interval +0.37 to +0.78). For players who revealed four popular games, it lost **0.54 points** (−0.85 to −0.24). The baseline already uses game review counts and audiences shared across titles. An extra boost for popular picks reduced retrieval for that group.

We then fixed the rule used in the app. A profile consisting entirely of top-decile titles keeps its co-review ranking. Other profiles with four choices receive the adjustment at strength 1. We evaluated this rule on the next 8,000 unused players, using the same overall criterion. Positive-review recall rose from **25.68% to 26.29%** (+0.62 points, paired 95% interval +0.45 to +0.78). All-review recall rose from 23.49% to 24.06% and modeled approval moved from 96.48% to 96.46%. The 1,324 players who revealed four top-decile games received identical rankings and retained 32.26% positive-review recall.

| Ranking on the final 8,000 players | Positive-review recall at 20 | Mean predicted approval at 20 |
| --- | ---: | ---: |
| Predicted approval alone | 2.09% | 99.13% |
| Review popularity alone | 25.07% | 87.17% |
| 75% review context, co-review baseline | 25.68% | 96.48% |
| **75% review context, released adjustment** | **26.29%** | **96.46%** |

The released rule gained 1.22 points of positive-review recall over population popularity on those players (+0.38 to +2.06) and 24.20 points over predicted approval alone (+23.46 to +24.95).

The implementation leaves profiles with fewer than four choices at the co-review baseline. With more than four choices, it uses half their mean standardized popularity, keeping shrinkage as strong as in the four-choice evaluation. Performance for other profile lengths was not measured. The six-game *Portal* example above consists entirely of top-decile titles. These counts describe review activity in the fitted catalog. The study measured retrieval of other recorded reviews and gives no direct measure of sales, unreviewed play or response to a future recommendation.

## Reproduction

Start with the full `profiles.npz` and `inventory.json` produced by the [Steam preparation script](prepare_games.py). The released table uses all reviewers. The evaluation refits co-review associations and approval parameters on development users only. Its original withheld fifth is partitioned into validation, test and confirmation cohorts. No individual review history is distributed in the ranking table.

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/prepare_steam_discovery.py \
  tmp/agent/games-depth/full media-ratings/steam-discovery.json
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/evaluate_discovery.py \
  tmp/agent/games-depth/full media-ratings/validation/steam-discovery.json
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/evaluate_popularity_affinity.py \
  tmp/agent/games-depth/full media-ratings/validation/steam-popularity-affinity.json
python3 -m unittest discover -s media-ratings -p test_discovery.py
node --test media-ratings/discovery.test.mjs
```
