# Video games

The Steam catalog predicts whether a player would give a game a thumbs up when reviewing it. It contains 1,001 games and 4,160,685 explicit positive or negative reviews from 2,604,759 players. Unreviewed games remain missing. A thumbs down in the app means that the player would recommend against the game. The model learns from people who chose to post reviews, so it estimates approval among reviewers. Console exclusives, free-to-play games, and games released after the review collection are underrepresented or absent. [Steam review graph](https://huggingface.co/datasets/diegodvv/steam-games-reviews-and-users-graph/tree/af875246d6f72dcfbbd89335b437853ca159fb77) · [Collection code](https://github.com/diegodvv/mc859-game-market-concentration-with-steam-data/tree/main/steam-applist-scraper)

## Coverage and annotations

The source review table contains 18,421,343 distinct review IDs. We exclude all 68,811 IDs attached to multiple edges in the player–game graph, collapse agreeing duplicate player–game pairs, and exclude eight pairs with conflicting votes. An exact Steam app ID joins the resulting reviews to store metadata. We take a deterministic one-quarter sample of players, retaining each selected player's whole profile. This keeps the multiple full training fits and the browser evidence export tractable. The 1,001 catalog games have 16,647,940 reviews before sampling.

The catalog starts with the 500 most-reviewed eligible games and continues down the popularity order to fill each of ten Steam genres to 200 games where possible. Eligibility requires at least 20 sampled reviews and a matching genre. Games can belong to several genres. The available racing, sports and massively multiplayer genres have fewer eligible games.

| Steam genre | Games | Steam genre | Games |
| --- | ---: | --- | ---: |
| Action | 487 | Simulation | 326 |
| Adventure | 349 | Strategy | 250 |
| Casual | 291 | Racing | 126 |
| Indie | 492 | Sports | 159 |
| RPG | 256 | Massively Multiplayer | 53 |

All games have a release year, supported desktop platforms and a direct Steam store link. The catalog includes play modes for 1,000, developers for 999 and publishers for 990. Steam's CDN hosts the 1,000 referenced header images. An earlier FronkonGames snapshot supplies up to eight community tags per game after removing source genres. Tags are available for 829 games. The current FronkonGames store snapshot and review graph are marked MIT by their publishers. The archived tags are from FronkonGames under CC BY 4.0 and have been filtered, joined and shortened here. [Store snapshot](https://huggingface.co/datasets/FronkonGames/steam-games-dataset/tree/6c21457b9ebf0a6a7f5b91e11281d65d456ea30e) · [Community tags and attribution](https://huggingface.co/datasets/FronkonGames/steam-games-dataset/tree/1143d95ec71f34f1bed06d4f3a5d8ff513e810fc) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Fitting and evaluation

Players are randomly divided into an 80% development group and a 20% test group. Three folds within the development group compare pooled game approval probabilities with 2, 4, 8 and 16 latent classes. The classes are initialized by noisy within-player approval rate, then estimated by penalized EM. Different initial approval rates help classes separate on a sparse binary scale. Training uses every scored review in the training partition, including profiles with fewer than five reviews. Evaluation uses players with at least five reviews, revealing four randomly chosen reviews and predicting up to twelve others. Model selection minimizes the mean per-player binary log loss across up to 2,000 eligible validation players per fold.

A second set of candidates adjusts the chosen class probabilities with 32-dimensional similarities learned from correlations of training reviews. Each candidate predicts from the discrepancies between the four given votes and their leave-one-out class expectations. A ridge penalty of 0.5 stabilizes the adjustment. One version uses review similarities alone. A second combines those features with game genres, modes, developers and community tags in a 70:30 cosine kernel. Three strengths of the resulting log-odds adjustment (1, 2, 4) compete against the unadjusted model in the same folds. The test set is scored once the class count and best similarity candidate are chosen. The released model is refitted on all sampled respondents. The site serves model parameters and aggregate evidence. [Machine-readable validation](validation/games.json)

Eight classes with the review and metadata adjustment (strength 2) won cross-validation. The 20,187 eligible test players supplied 73,928 held-out reviews. Compared with the class model, the adjustment reduced mean player log loss by 0.00210 (paired standard error 0.00047). Players who left at least five reviews may have different tastes and reviewing habits from occasional reviewers.

| Held-out predictor | Binary log loss | Brier score |
| --- | ---: | ---: |
| Game approval rate | 0.33898 | 0.09964 |
| Eight taste classes | 0.30902 | 0.09179 |
| Eight taste classes, review similarity and game metadata (default) | 0.30692 | 0.09096 |

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
```

| Source file | SHA-256 |
| --- | --- |
| votes | `8ec5e5cd976aa9c9dd5ef94542b11918a4d7d279347a0ec3621f45e231ee9996` |
| edges | `791904ae2665540f8240e4d4abda64a904c7784c1a03c107f401064ad91ce7e2` |
| games.parquet | `775b17f2a5a52b96a8441739cd0dd4939916335b6edeebbfc4a1b238388c5a77` |
| metadata-old.parquet | `ca508f6240901d0d225228e8d3efb8a18833d06a0af0e1374128f080bd4842e9` |
