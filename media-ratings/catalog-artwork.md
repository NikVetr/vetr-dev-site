# Recognition artwork

The Rating Prediction app loads artwork from the publisher, community or image archive when a reader opens a title. Both Quick rate and Selected recommendation use the same item and credit link. The published supplement contains external URLs, recipe photographer credits and public community topic labels. It contains no image files, user profiles or reviewer data.

## Identity and credit

- **Recipes.** The Taste of Home recipe code from the review archive must also occur as the publisher's content ID. The photo comes from that page's Recipe structured data. Its supplied photo credit remains visible, including named photographers. Five historical recipes lack a confirmed current publisher page. [UCI recipe dataset](https://doi.org/10.24432/C5FG95) · [Example publisher photo and credit](https://www.tasteofhome.com/recipes/creamy-white-chili/)
- **Community icons.** The small identifier index uses public community names and IDs from two historical directories. A case-insensitive exact subreddit name identifies the community in the Arctic Shift archive. The builder uses its native Reddit CDN icon or custom header and omits shared graphics, generic defaults, private or quarantined communities and adult-marked images. A published topic such as *Sports* or *Technology* comes directly from Reddit's historical advertiser category. The category can be broad, surprising or absent. Topic labels do not alter the reply-prediction model. [Arctic Shift metadata API](https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md#subreddits) · [Popular community ID index](https://huggingface.co/datasets/cochiseruhulessin/reddit-subreddits/tree/48f312f1a54a99d3113aa378e3345612a0b64baa) · [Archived community ID index](https://huggingface.co/datasets/alessiosavi/subreddits-v0/tree/38385536f320d5a6c8020015fc78086049d20b34)
- **Books.** A check-digit-verified ISBN-10 from the Goodbooks representative edition joins to the Open Library Books API. The image links to the specific Open Library edition page. Eight other valid ISBNs supply covers from the corresponding Amazon product listings. *The Opal Deception* uses its exact Goodreads edition's current cover. A work with several editions can have several genuine covers. [Goodbooks source](https://github.com/zygmuntz/goodbooks-10k) · [Open Library Books API](https://openlibrary.org/dev/docs/api/books) · [Goodreads edition](https://www.goodreads.com/book/show/114954)
- **Royal Road editions.** Each additional image uses the exact Kindle ASIN from the rated edition and links back to that Amazon edition. Royal Road serial links remain separate. [Rating data and edition crosswalk](royalroad-data.md)
- **Albums.** A MARD edition carrying the catalog's MusicBrainz release-group ID at confidence 1 supplies the corresponding Amazon product cover. Amazon-only releases use the catalog ASIN. Where that cover is unavailable, the MusicBrainz release-group ID identifies an approved front cover in the Cover Art Archive. Its thumbnail links to the release's cover-art page. The edition can differ in packaging from another issue of the same release group. [Cover Art Archive API](https://musicbrainz.org/doc/Cover_Art_Archive/API) · [MARD](https://www.upf.edu/web/mtg/mard)
- **Games and television.** The Steam catalog's final missing header uses Valve's CDN and the catalog's app ID. The remaining television thumbnail is Apple TV's publisher artwork for Charles Haid's 2000 miniseries *Sally Hemings: An American Scandal*. Its original TVmaze listing has no poster. The separate Metacritic art manifest records edition-specific matches and credits. [Steam store listing](https://store.steampowered.com/app/91700/) · [Apple TV show page](https://tv.apple.com/us/show/sally-hemings-an-american-scandal/umc.cmc.4s70bc7s73sumu194sugttpm5) · [Metacritic artwork](metacritic-artwork.md)

The builder checks the image response, decodes the dimensions and rejects images smaller than 32 pixels on either side. This catches Amazon's one-pixel JPEG for unknown products. The provider can remove or change its image after validation. Source links identify where the artwork is credited. Artwork rights remain with their respective holders.

## Coverage

Counts include identity-matched Wikipedia recognition cards for films and destinations, source artwork already present in each catalog and the supplements. The snapshot was checked on November 19, 2026.

| Catalog | Items with artwork | Catalog items |
| --- | ---: | ---: |
| Films | 500 | 500 |
| Destinations | 1,014 | 1,419 |
| TV | 383 | 383 |
| Goodreads books | 1,369 | 1,369 |
| Book-Crossing editions | 1,000 | 1,000 |
| Anime | 1,487 | 1,487 |
| Podcasts | 3,267 | 3,670 |
| Albums | 2,042 | 2,057 |
| Tabletop games | 1,095 | 1,095 |
| Metacritic games | 180 | 180 |
| Amazon game editions | 1,184 | 1,184 |
| Steam games | 1,136 | 1,136 |
| Food.com recipes | 1,575 | 1,600 |
| Taste of Home recipes | 95 | 100 |
| Cocktails | 1,571 | 1,777 |
| Royal Road Kindle editions | 577 | 577 |
| AO3 original web fiction | 0 | 320 |
| Goodreads fanfiction | 0 | 365 |
| Licensed fanfiction Kindle editions | 508 | 508 |
| AO3 fanfiction | 0 | 10,466 |
| Subreddits | 451 | 500 |

All 500 community names were queried. Reddit supplied a usable topical label for 338 across 12 historical categories. The five unmatched Taste of Home titles currently redirect to recipes carrying different publisher IDs.

The two AO3 source releases provide work IDs, bylines and tags, with no work-cover field. The app preserves those text cues. The 403 podcast IDs without US artwork also yielded no current covers through the UK, Canadian and Australian Apple lookup endpoints. The destinations catalog requires a verified place-to-article match and a credited Wikimedia image. Food.com can return its generic site logo when an individual recipe lacks a photo. [AO3 catalog and sources](ao3-catalogs.md) · [Apple lookup API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html) · [Destinations provenance](destination-catalog.md)

## Reproduction

Use Python 3 with Pillow, the original Goodbooks `books.csv` and the MARD `mard.zip` linked above. Run from the repository root. Network results stay in the project cache. A new cache directory refreshes an earlier snapshot.

```sh
python3 media-ratings/prepare_catalog_artwork.py \
    --goodbooks tmp/agent/new-catalogs/books.csv \
    --mard tmp/agent/music-tabletop/mard.zip \
    --cache tmp/agent/item-art
python3 media-ratings/prepare_catalog_artwork.py --cache tmp/agent/item-art --offline
python3 -m unittest discover -s media-ratings -p test_catalog_artwork.py
```

The offline invocation exports only records whose image checks are present in that cache. The checked-in file is a snapshot. New external records can change the coverage of a fresh run.
