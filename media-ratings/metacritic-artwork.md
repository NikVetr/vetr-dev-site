# Artwork for Metacritic games

Each of the 180 games has a verified, externally hosted image. The sidecar joins on the existing Metacritic item ID. The manifest records the particular listing or article used for each game. It keeps original games, remakes, remasters and console editions distinct. [Artwork and annotations](metacritic-artwork.json) · [Source identifiers](metacritic-artwork-sources.csv)

| Artwork source | Games | Identity and rights |
| --- | ---: | --- |
| Steam | 115 | The public store app ID, normalized game title and app ID in the header image path must agree with the pinned store snapshot. The link leads to the publisher’s store listing. [Store dataset](https://huggingface.co/datasets/FronkonGames/steam-games-dataset/tree/6c21457b9ebf0a6a7f5b91e11281d65d456ea30e) · [Steamworks graphical assets](https://partner.steamgames.com/doc/store/assets/standard) |
| Wikipedia | 45 | The specific game article identifies the cover or logo in its video-game infobox. The file-description page identifies the image and its rights. The three Commons files also carry their reported credit and license, including the Minecraft logo credited to Xbox México. [MediaWiki file information](https://www.mediawiki.org/wiki/API:Imageinfo) |
| App Store | 10 | Apple’s lookup service returns the game name, seller and 512-pixel icon for the selected US store ID. The resulting product link identifies the game and its publisher. [Apple lookup API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html) |
| Publisher and platform pages | 5 | Nintendo supplies images for the Switch 2 edition of Hades II, Mario Kart 8 Deluxe and Metroid Prime Remastered. Remedy supplies Alan Wake Remastered. Double Eleven’s Rust Console Edition page supplies the game’s title artwork. [Nintendo edition](https://www.nintendo.com/us/store/products/hades-ii-nintendo-switch-2-edition-switch-2/) · [Remedy](https://www.alanwake.com/remastered/) · [Double Eleven](https://double11.com/games/rust-console-edition/) |
| Amazon | 5 | The title, platform and primary product image identify the legacy Minecraft Xbox 360, Xbox One, PS3, PS4 and Wii U releases. These listings come from the McAuley Lab’s 2023 metadata archive. [Amazon Reviews 2023](https://amazon-reviews-2023.github.io/) · [Console developer](https://4jstudios.com/about-us/) |

Matching used the platforms and dates of the original reviews to distinguish games with identical names. For example, the first Resident Evil 4 score was posted in March 2023, the first Silent Hill 2 score in October 2024 and the first Until Dawn score in October 2024. All three use the corresponding remake. The Shadow of the Colossus data combine PS2, PS3 and PS4 reviews beginning in 2010. Its card identifies the original 2005 cover.

Store publishers can change their names and promotional artwork. The reviewed Steam snapshot preserves the Overwatch 2 header under app 2357570, whose storefront now uses the title Overwatch. The 2016 game has its own cover and article. [Current Steam listing](https://store.steampowered.com/app/2357570/) · [2016 game](https://en.wikipedia.org/wiki/Overwatch_(2016_video_game))

Steam supplies its store genres, developers and publishers. Apple supplies its listed game genres and seller. For game articles, Wikidata supplies available genres, developers, publishers and series through the article’s Wikidata ID. Steam series use exact Steam app IDs on Wikidata. A series appears only where the source gives it. The five named legacy Minecraft editions also carry the developer’s console credit. The resulting sidecar includes genres for 170 games, developers for 160, publishers for 166 and series for 77. Genre terminology follows each source. [Wikidata Steam identifier](https://www.wikidata.org/wiki/Property:P1733) · [Wikidata series property](https://www.wikidata.org/wiki/Property:P179)

The browser can copy each record onto the corresponding item’s annotations. `imageUrl` names the image, `sourceUrl` and `linkLabel` identify the store or game article, and `imageRightsUrl` links to the source listing or file description. Where available, `imageCredit`, `imageLicense` and `imageLicenseUrl` supply attribution. A store or article thumbnail remains subject to its individual rights terms. The review dataset’s license covers its data separately.

## Regeneration

Use the Steam store Parquet from the [Steam preparation guide](game-catalog.md) and the Amazon metadata archive from the [edition preparation guide](amazon-game-editions.md), with Python, DuckDB and Pillow available. The command uses at most four simultaneous image requests, decodes every individual image, and stores the responses and image checks in the supplied scratch cache. Reusing the cache reproduces the checked snapshot. An empty cache refreshes the external sources. The output contains URLs, credits and catalog metadata.

```sh
python3 media-ratings/prepare_metacritic_artwork.py \
  tmp/agent/games-depth/full/games.parquet \
  tmp/agent/game-editions/meta_Video_Games.jsonl.gz \
  tmp/agent/metacritic-artwork/cache \
  media-ratings/metacritic-artwork.json
```
