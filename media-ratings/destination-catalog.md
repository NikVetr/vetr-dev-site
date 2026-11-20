# Destination preferences

The catalog covers 1,419 destinations across 140 country and area labels. It uses 812,990 explicit No, Maybe and Yes swipes from 61,130 Stravl respondents. The original 12 destinations were selected for dense overlap between the same travelers. The expanded catalog accepts any destination with at least 100 respondents, which retains 99.9% of the clean swipes. Each included place received between 112 and 3,220 responses. [Stravl release](https://github.com/Stravl/Stravl-Data/tree/d65ddabb912761d09fd2c417d2a5b248b7b678f6)

Stravl recorded three lists per respondent. Repeating an answer counts once. A destination with conflicting answers from one person is omitted for that person. The release names 1,486 places, 1,452 of which have at least one unambiguous response. Blank entries represent missing data. The fit uses only the three swipe lists because Stravl collected subsequent feedback on recommended destinations separately. Each item ID is the original zero-based line number in `destination_ids.txt`. This preserves the identity and answer scale of the 12 places in older exported ratings.

Stravl supplies three explicit answers for named destinations. A finer-scale lead, Spain's 2024 Residents Travel Survey, supplies satisfaction scores, but its public trip file groups destinations into provinces and broad foreign regions. Among 61,129 trip records, no respondent within a survey month rated four distinct destination groups. The finer trip-stage geography requires a separate microdata request. [INE survey files and access](https://www.ine.es/dyngs/INEbase/en/operacion.htm?c=Estadistica_C&cid=1254736176990&idp=1254735576863&menu=resultados&secc=1254736195369)

## How well the model predicts a new traveler

Given four swipes, the predictor updates the probabilities that a traveler belongs to each of eight learned preference classes. Each class has its own smoothed No/Maybe/Yes distribution for each destination. Three-fold cross-validation with respondent-disjoint folds compared 1, 2, 4, 8 and 16 classes. Eight had the lowest mean category log loss. The final fit used all 61,130 respondents. [Training code](fit_catalog.py) · [Validation records](validation/destinations.json)

On a separate holdout, 12,216 eligible travelers contributed four supplied answers each and 82,833 withheld answers in total. Every traveler had the same weight in each reported metric. RMSE uses the 0–2 response scale. The Brier score measures the error in the predicted probability of answering Yes.

| Model | Category log loss ↓ | RMSE ↓ | Yes Brier score ↓ |
| --- | ---: | ---: | ---: |
| Pooled destination probabilities | 0.7302 | 0.8984 | 0.2057 |
| Eight preference classes | 0.5799 | 0.7871 | 0.1606 |

A second set of random reveals for these same travelers checked whether the result also held for infrequently rated destinations. Destinations were grouped by their number of training respondents. Each group improved with personalization. The estimates describe recorded swipes, with the mix of places Stravl showed its users. [Earlier comparisons of geographic similarity, question order and response style on 12 destinations](city-transfer.md)

| Training responses per destination | Destinations | Held-out swipes | Pooled log loss | Eight-class log loss |
| --- | ---: | ---: | ---: | ---: |
| Fewer than 400 | 1,058 | 39,308 | 0.7331 | 0.5844 |
| 400 to 799 | 111 | 8,061 | 0.7847 | 0.6149 |
| 800 or more | 250 | 35,464 | 0.7184 | 0.5691 |

Observed co-ratings use all 812,990 catalog swipes. Of 1,006,071 possible destination pairs, 991,832 have at least one shared respondent and 418,236 have at least ten. The median pair has eight shared respondents, so a correlation for an individual pair can be noisy even when its two destinations each have hundreds of answers. The site ships only aggregate counts and model parameters.

## Geography and recognition

All 1,419 destinations carry the country label from Stravl and its geographic subregion. The expanded catalog matches populated places by normalized primary or ASCII name within the source country, checking the named state or province when present. An ambiguous or absent match leaves local statistics empty. Twelve existing manually disambiguated records are retained. In all, 1,249 have a matched location and 1,245 have a populated-place population estimate. A destination label can also denote a wider area, such as an island. Every entry has map links. Entries without a coordinate match use a search for the full Stravl label. [GeoNames](https://www.geonames.org/export/) · [UN M49 list](https://unstats.un.org/unsd/methodology/m49/overview/)

Coastal proximity uses a 25 km distance to the ocean coastline from the matched location. Temperature (°C) and annual precipitation (mm) come from the containing 10-arc-minute WorldClim 1970–2000 grid cell. GDP per capita is the country-level 2023 estimate in current US dollars, available for 1,408 entries. These fields support exploration and filtering. The fitted model learns its preference classes from swipes. [Natural Earth coastline](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-coastline/) · [WorldClim 2.1](https://www.worldclim.org/data/worldclim21.html) · [World Bank](https://data.worldbank.org/indicator/NY.GDP.PCAP.CD)

There are 1,045 English Wikipedia article links and descriptions, and 1,014 recognition images. New article matches join the GeoNames ID to Wikidata property P1566 and verify the article's own Wikidata ID. Each image uses its Wikimedia-hosted thumbnail and links to the source file and attribution. [Wikidata geographic ID](https://www.wikidata.org/wiki/Property:P1566) · [MediaWiki PageImages](https://www.mediawiki.org/wiki/Extension:PageImages)

## Reproduce the catalog

From the repository root, download the two files from the pinned Stravl release. The Python fitting environment needs NumPy and SciPy.

```sh
work=tmp/agent/destinations-wide
mkdir -p "$work"
release=https://raw.githubusercontent.com/Stravl/Stravl-Data/d65ddabb912761d09fd2c417d2a5b248b7b678f6
curl -fL "$release/Stravl_Travel_Preference_Data.csv" -o "$work/ratings.csv"
curl -fL "$release/destination_ids.txt" -o "$work/destination_ids.txt"
python3 media-ratings/prepare_city_transfer.py "$work/ratings.csv" "$work/destination_ids.txt" "$work"
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/prepare_destinations.py \
  "$work/swipes.npz" "$work/destination_ids.txt" "$work/fit"
```

The respective SHA-256 digests of the ratings CSV and destination list are `16dd0d5e83c4c2952f073c4bbdd94f25678f5a537753cee4994bb2d6f0484792` and `42ff5e887f0b582d1bd55bafa91ad26adc476b029308798b83cf4731ff778dbf`.

To reproduce the annotations, place the following downloads under `$work`. GeoNames, World Bank and Wikimedia can revise their records over time. The resolver caches API responses in `$work/cache`.

| File | Source |
| --- | --- |
| `cities500.zip`, `countryInfo.txt`, `admin1CodesASCII.txt` | [GeoNames data directory](https://download.geonames.org/export/dump/) |
| `m49.html` | [English UN M49 table](https://unstats.un.org/unsd/methodology/m49/overview/) |
| `gdp.json` | [World Bank GDP per capita in 2023](https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.CD?date=2023&format=json&per_page=1000) |
| `coast.zip` | [Natural Earth 1:10m coastline](https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_coastline.zip) |
| `climate.zip` | [WorldClim 2.1 bioclimatic variables](https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_bio.zip) |

Use a Python interpreter with GDAL and network access to populate the geographic annotations and recognition references. The packed pair counts and validation report remain in `$work/fit` alongside the enriched catalog.

```sh
python3 media-ratings/destination_geography.py "$work" "$work/fit/destinations.json" "$work/fit"
```
