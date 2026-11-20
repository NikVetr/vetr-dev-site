# Video games

The Steam catalog predicts whether a player would give a game a thumbs up when reviewing it. It contains 1,136 games and 16,654,154 explicit positive or negative reviews from 10,429,042 players. Unreviewed games remain missing. A thumbs down in the app means that the player would recommend against the game. The model learns from people who chose to post reviews, so it estimates approval among reviewers. Console exclusives, free-to-play games, and games released after the review collection are underrepresented or absent. [Steam review graph](https://huggingface.co/datasets/diegodvv/steam-games-reviews-and-users-graph/tree/af875246d6f72dcfbbd89335b437853ca159fb77) · [Collection code](https://github.com/diegodvv/mc859-game-market-concentration-with-steam-data/tree/main/steam-applist-scraper)

## Coverage and annotations

The source review table contains 18,421,343 distinct review IDs. We exclude all 68,811 IDs attached to multiple edges in the player–game graph, collapse agreeing duplicate player–game pairs, and exclude eight pairs with conflicting votes. An exact Steam app ID joins the resulting reviews to store metadata. The final fit uses every cleaned review on a catalog title. Single-review players with the same game, vote and initial class assignment can be combined with exact frequency weights during training.

The catalog starts with the 500 most-reviewed eligible games and continues down the popularity order to fill each of ten Steam genres to 200 games where possible. Eligibility requires at least 20 cleaned reviews and a matching genre. In the full graph, 6,600 games clear this threshold. These include 220 racing games, 280 sports games and 84 massively multiplayer games. Games can belong to several genres.

| Steam genre | Games | Steam genre | Games |
| --- | ---: | --- | ---: |
| Action | 546 | Simulation | 394 |
| Adventure | 389 | Strategy | 271 |
| Casual | 361 | Racing | 200 |
| Indie | 597 | Sports | 215 |
| RPG | 278 | Massively Multiplayer | 84 |

All games have a release year, supported desktop platforms and a direct Steam store link. The catalog includes play modes for 1,135, developers for 1,131 and publishers for 1,116. Steam's CDN hosts the 1,135 referenced header images. An earlier FronkonGames snapshot supplies up to eight community tags per game after removing source genres. Tags are available for 921 games. The current FronkonGames store snapshot and review graph are marked MIT by their publishers. The archived tags are from FronkonGames under CC BY 4.0 and have been filtered, joined and shortened here. [Store snapshot](https://huggingface.co/datasets/FronkonGames/steam-games-dataset/tree/6c21457b9ebf0a6a7f5b91e11281d65d456ea30e) · [Community tags and attribution](https://huggingface.co/datasets/FronkonGames/steam-games-dataset/tree/1143d95ec71f34f1bed06d4f3a5d8ff513e810fc) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Fitting and evaluation

Players are randomly divided into an 80% development group and a 20% test group. Three folds within the development group compare pooled game approval probabilities with 2, 4, 8 and 16 latent classes. The classes are initialized by noisy within-player approval rate, then estimated by penalized EM. Different initial approval rates help classes separate on a sparse binary scale. Training uses every scored review in the training partition, including profiles with fewer than five reviews. Evaluation uses players with at least five reviews, revealing four randomly chosen reviews and predicting up to twelve others. Model selection minimizes the mean per-player binary log loss across up to 2,000 eligible validation players per fold.

A second set of candidates adjusts the chosen class probabilities with 32-dimensional similarities learned from correlations of training reviews. Each candidate predicts from the discrepancies between the four given votes and their leave-one-out class expectations. A ridge penalty of 0.5 stabilizes the adjustment. One version uses review similarities alone. A second combines those features with game genres, modes, developers and community tags in a 70:30 cosine kernel. Three strengths of the resulting log-odds adjustment (1, 2, 4) compete against the unadjusted model in the same folds. The test set is scored once the class count and best similarity candidate are chosen. The released model is refitted on all catalog respondents. The site serves model parameters and aggregate evidence. [Machine-readable validation](validation/games.json)

Cross-validation selected 16 classes with review and metadata similarity (strength 1). On 289,294 test reviews from 79,372 held-out players, the similarity adjustment reduced mean player log loss by 0.00149 (paired standard error 0.00013). Holding the game list, test players and chosen model settings fixed, using the full development group instead of a random quarter changed log loss from 0.31326 to 0.31179 (paired standard error of the difference 0.00014). Players who left at least five reviews may have different tastes and reviewing habits from occasional reviewers.

| Held-out predictor | Binary log loss | Brier score |
| --- | ---: | ---: |
| Game approval rate | 0.34306 | 0.10094 |
| 16 taste classes | 0.31328 | 0.09279 |
| 16 taste classes, review similarity and game metadata | 0.31179 | 0.09223 |

### Sparse games and unanimous reviews

Five games have exclusively positive reviews in this snapshot. Of the 1,136 games, 165 have at most 100 reviews and 251 have at most 250. Each game has a public estimate of approval among its reviewers. A shared beta prior fitted across games by beta-binomial marginal likelihood gives an estimated 6.414 positive and 1.380 negative prior votes. With `u` thumbs up and `d` thumbs down, the posterior mean is `(u + 6.414) / (u + d + 7.794)`. The displayed interval spans the 2.5th and 97.5th percentiles of that posterior, conditional on the fitted prior. It describes uncertainty about the population rate of *recorded* thumbs up under a stable rate and independent review draws. Who buys or reviews a title, when they play it, and how their tastes differ can all affect that rate. [Beta-binomial likelihood](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.betabinom.html)

| Game | Positive / total reviews | Estimated approval | 95% credible interval |
| --- | ---: | ---: | ---: |
| Seafrog | 45 / 45 | 97.39% | 91.74–99.84% |
| Meddl Dash | 235 / 235 | 99.43% | 98.18–99.97% |
| Shooters, Ready! | 484 / 484 | 99.72% | 99.10–99.98% |
| A Short Hike | 19,819 / 19,983 | 99.17% | 99.04–99.29% |

The personalized model uses the game's posterior mean as the center of each taste class's binary distribution. The class pseudo-count controls how far a class can depart from that estimate. We fit the 16-class mixture anew for seven candidate strengths from 0.0625 to 256, an additional count-dependent strength, and the earlier fixed prior. All model and prior fits used training reviewers alone. The validation and test groups each contain 20% of respondents. After four supplied reviews, validation compared the mean per-player log loss, then the mean per-game loss for titles with at most 250 training reviews among models within one paired standard error of the best overall score. This selected a class strength of 0.25. The release refits that model on all 16.65 million reviews.

| Independent test measure | Earlier model | Updated model |
| --- | ---: | ---: |
| Mean player log loss, 79,372 players and 289,294 reviews | 0.30907 | 0.30879 |
| Mean player Brier score | 0.09139 | 0.09126 |
| Mean game log loss, 699 held-out votes on 203 sparse games after four supplied reviews | 0.57548 | 0.54662 |
| Mean game log loss, all 5,517 held-out votes on 267 sparse games with zero to four other reviews available | 0.52453 | 0.50387 |

The paired standard error was 0.000086 for the overall log-loss difference and 0.01442 for the four-input sparse-game difference. This comparison drew fresh four-review contexts for the original test respondents. A further experiment on separate reviewers used the number of votes on the less common side to attenuate taste-class differences. All five positive attenuation strengths worsened validation log loss for the 150 games with at most ten minority votes, from 0.45085 to 0.45245–0.46418. The deployed model uses the unattenuated class estimates. [Pooling study](validation/games-pooling.json) · [Minority-vote study](validation/games-extremes.json)

**Highest expected** orders games by the personalized probability of a positive review. Someone giving six positive votes can still see unanimously praised niche titles first. For example, positive votes on Portal, Portal 2, Half-Life 2, Half-Life 2: Episode Two, Borderlands 2 and Grand Theft Auto V Enhanced give Shooters, Ready! a 99.998% forecast and A Short Hike a 99.686% forecast. The forecasts concern the direction of a hypothetical submitted thumb. The review counts and intervals above show how much direct evidence supports a game's marginal approval rate.

## Reproduce

Use Python with NumPy, SciPy, DuckDB and ijson. The release used NumPy 2.5.5, SciPy 1.18.1, DuckDB 2.0.0 and ijson 3.6.0. Run these commands from the repository root.

```sh
game_dir=tmp/agent/games-depth
mkdir -p "$game_dir"
graph=https://huggingface.co/datasets/diegodvv/steam-games-reviews-and-users-graph/resolve/af875246d6f72dcfbbd89335b437853ca159fb77
store=https://huggingface.co/datasets/FronkonGames/steam-games-dataset/resolve
curl -fL "$graph/edges_details_by_review_id.json" -o "$game_dir/votes"
curl -fL "$graph/edges_review_id_game_id_pairs_by_user_id.json" -o "$game_dir/edges"
curl -fL "$store/6c21457b9ebf0a6a7f5b91e11281d65d456ea30e/data/train-00000-of-00001.parquet" -o "$game_dir/games.parquet"
curl -fL "$store/1143d95ec71f34f1bed06d4f3a5d8ff513e810fc/data/train-00000-of-00001-e2ed184370a06932.parquet" -o "$game_dir/metadata-old.parquet"
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/prepare_games.py prepare "$game_dir"
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/prepare_games.py fit "$game_dir" --out media-ratings
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/evaluate_game_extremes.py "$game_dir" media-ratings/games.json media-ratings/validation/games-extremes.json
```

| Source file | SHA-256 |
| --- | --- |
| votes | `8ec5e5cd976aa9c9dd5ef94542b11918a4d7d279347a0ec3621f45e231ee9996` |
| edges | `791904ae2665540f8240e4d4abda64a904c7784c1a03c107f401064ad91ce7e2` |
| games.parquet | `775b17f2a5a52b96a8441739cd0dd4939916335b6edeebbfc4a1b238388c5a77` |
| metadata-old.parquet | `ca508f6240901d0d225228e8d3efb8a18833d06a0af0e1374128f080bd4842e9` |

## Metacritic player scores

The Game ratings menu also offers 180 titles scored from 0 to 10. The two game sources keep independent answers. Wada1's Metacritic snapshot contains 260,768 reviews for 200 game titles. We group by source title across platforms, count each exact reviewer alias once per title, omit conflicting scores for the same pair, and require 20 distinct reviewers per title. A zero is an explicit score. An unreviewed game has no score. The resulting fit uses 255,386 scores from 178,833 reviewers. The platform filter identifies platforms reviewed in this snapshot. Remasters with separate source titles keep separate entries. [Metacritic data and attribution](https://huggingface.co/datasets/Wada1/Metacritic_Games_Reviews_Dataset/tree/9109e48069fe4509421b71a98c7b6ef104253913)

Three-fold validation over held-out reviewers chose four taste classes from 1, 2, 4, 8 and 16. After four supplied scores, the model predicted 3,744 further scores from 978 separate test reviewers. Mean reviewer log loss fell from 1.8761 for game-specific frequencies to 1.7106, and RMSE fell from 2.623 to 2.448 on the 0–10 scale. These results apply to posted scores by people who reviewed at least five catalog titles. [Validation results](validation/metacritic.json)

To reproduce the catalog and aggregate co-ratings, use the same Python environment as the Steam fit. The Parquet file has SHA-256 `ea4d4163e20f63e2d088a9014bd3b960ae0e203dedf88aa7076dbfd85c6fd18a`. The source release is attributed to Wada1 under CC BY 4.0. The public artifacts contain fitted probabilities and aggregate counts. [License](https://creativecommons.org/licenses/by/4.0/)

```sh
curl -fL https://huggingface.co/datasets/Wada1/Metacritic_Games_Reviews_Dataset/resolve/9109e48069fe4509421b71a98c7b6ef104253913/data/train-00000-of-00001.parquet -o "$game_dir/metacritic.parquet"
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/prepare_metacritic.py "$game_dir/metacritic.parquet" media-ratings
```
