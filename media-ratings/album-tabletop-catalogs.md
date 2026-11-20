# Albums and tabletop games

Both catalogs predict an individual reviewer's one-to-five-star score. The training data combine the McAuley Lab's 2014 and 2018 Amazon review snapshots. The snapshots overlap, and each contains observations absent from the other. Stable Amazon reviewer and product identifiers allow the importer to retain one response per person and catalog item. It uses the latest timestamp, breaking a same-day tie by product identifier and then score. The browser downloads fitted class probabilities, item metadata and aggregate co-rating counts. [2014 Amazon review data](https://cseweb.ucsd.edu/~jmcauley/datasets/amazon/links.html) · [2018 Amazon review data](https://cseweb.ucsd.edu/~jmcauley/datasets/amazon_v2/)

**Albums.** The Multimodal Album Reviews Dataset (MARD) supplies artist, album title, genre, subgenre and external cover URLs. It also supplies MusicBrainz links and release years for a subset. A MARD match with confidence 1 identifies a MusicBrainz release group. Editions without such a match inherit a group only when the complete, case-insensitive artist and title pair points to exactly one mapped group. Other unambiguous pairs have an Amazon product link. Distinctly titled special editions can appear separately. Selection includes the 500 most-reviewed eligible releases plus up to 250 per top-level genre, with at least 12 distinct reviewers each. MARD's genre inventory and 2014 catalog cutoff affect the selection. [MARD dataset and methodology](https://www.upf.edu/web/mtg/mard)

**Tabletop games.** Product metadata come from the 2014 Toys & Games release. The catalog covers the Board Games, Card Games, Tile Games and Stacking Games source categories. It includes expansions. A title screen excludes common misplaced accessories such as protective sleeves, scorepads and card holders. Products remain specific to the edition reviewed. The main score therefore also reflects packaging and component quality. Where supported by metadata or the product name, filters identify brand, game family and expansions. The catalog takes the top 650 products overall plus up to 400 per category, each with at least 12 reviewers. When products have the same display title, it keeps the most reviewed one. [Toys & Games metadata](https://snap.stanford.edu/data/amazon/productGraph/categoryFiles/meta_Toys_and_Games.json.gz)

BoardGameGeek has a ten-point player scale. Its published terms prohibit using site data to train an AI system. The tabletop predictor therefore uses the Amazon edition reviews described above. [BoardGameGeek rating scale](https://boardgamegeek.com/wiki/page/ratings) · [BoardGameGeek data terms](https://boardgamegeek.com/wiki/page/XML_API_Terms_of_Use)

## Evaluation

Model selection compares one, two, four, eight and sixteen product-categorical taste classes in three respondent-disjoint folds. The one-class model predicts each item's population distribution. Every development respondent with at least five catalog ratings contributes to selection. The final test uses a separate 20% respondent split. Four supplied scores predict up to twelve randomly withheld responses from each eligible reviewer, and each person receives equal weight. These metrics apply to people who recorded multiple reviews. The public archives give no scores for unreviewed purchases.

| Catalog | Items | Respondents | Ratings | Scored test respondents / ratings | Classes | Log loss, population → personalized | RMSE, population → personalized |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Albums | 2,057 | 125,695 | 147,285 | 210 / 808 | 2 | 1.0923 → 1.0660 | 0.9299 → 0.9136 |
| Tabletop | 1,095 | 214,641 | 252,018 | 230 / 656 | 4 | 0.8531 → 0.8479 | 0.8144 → 0.8102 |

The archive contains 1,020 album reviewers and 1,179 tabletop reviewers with at least five distinct catalog responses. Improvements are small, particularly for tabletop games. Genres and game types have uneven support. For example, albums include 311 pop releases, 251 each for rock and classical, 250 Latin music releases, and eight reggae releases, and tabletop includes 489 board, 397 card, 160 tile and 49 stacking games.

Cross-validation summaries, category coverage and final fit counts are in the [album report](validation/albums.json) and [tabletop report](validation/boardgames.json). The [common fitter](fit_catalog.py) documents the priors and scoring implementation.

## Reproduction

Use Python with DuckDB, NumPy and SciPy. Run from the repository root. Download the source files into an untracked directory.

| File | Source |
| --- | --- |
| `mard.zip` | [Universitat Pompeu Fabra MARD](https://mtg.upf.edu/system/files/projectsweb/mard.zip) |
| `albums.csv` | [2014 CDs & Vinyl ratings](https://snap.stanford.edu/data/amazon/productGraph/categoryFiles/ratings_CDs_and_Vinyl.csv) |
| `albums-2018.csv` | [2018 CDs & Vinyl ratings](https://mcauleylab.ucsd.edu/public_datasets/data/amazon_v2/categoryFilesSmall/CDs_and_Vinyl.csv) |
| `toy_meta.json.gz` | [2014 Toys & Games metadata](https://snap.stanford.edu/data/amazon/productGraph/categoryFiles/meta_Toys_and_Games.json.gz) |
| `toy.csv` | [2014 Toys & Games ratings](https://snap.stanford.edu/data/amazon/productGraph/categoryFiles/ratings_Toys_and_Games.csv) |
| `toys-2018.csv` | [2018 Toys & Games ratings](https://mcauleylab.ucsd.edu/public_datasets/data/amazon_v2/categoryFilesSmall/Toys_and_Games.csv) |

```sh
export OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1
python3 media-ratings/prepare_albums_tabletop.py albums \
  raw/mard.zip raw/albums.csv raw/albums-2018.csv media-ratings
python3 media-ratings/prepare_albums_tabletop.py boardgames \
  raw/toy_meta.json.gz raw/toy.csv raw/toys-2018.csv media-ratings
python3 media-ratings/test_albums_tabletop.py
```

Credit for the Amazon 2018 archive goes to Jianmo Ni, Jiacheng Li and Julian McAuley for *Justifying Recommendations Using Distantly-Labeled Reviews and Fine-Grained Aspects* (EMNLP 2019). The 2014 archive was compiled by Julian McAuley and colleagues. Album metadata also credit Sergio Oramas, Luis Espinosa-Anke, Andrew Lawlor, Xavier Serra and Horacio Saggion, *Exploring Customer Reviews for Music Genre Classification and Evolutionary Studies* (ISMIR 2016). MARD is distributed under the [MIT license](https://opensource.org/license/mit), copyright © 2016 Music Technology Group, Universitat Pompeu Fabra. Artwork is displayed from its external host. [Amazon references](https://cseweb.ucsd.edu/~jmcauley/datasets/amazon_v2/) · [MARD use conditions](https://www.upf.edu/web/mtg/mard)

<details>
<summary>MARD metadata license</summary>

Copyright © 2016 Music Technology Group, Universitat Pompeu Fabra.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

</details>
