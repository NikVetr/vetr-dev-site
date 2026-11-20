"""Resolve the reviewed edition identifiers in metacritic-artwork-sources.csv.

See metacritic-artwork.md for input snapshots, the regeneration command and rights.
Source responses and decoded image dimensions are cached in project scratch.
"""

import argparse
import csv
import gzip
import json
import re
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from io import BytesIO
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlsplit

import duckdb
from PIL import Image

from prepare_film_links import cached, fetch
from prepare_recognition import plain, query, resolved_pages, sparql

ROOT = Path(__file__).resolve().parent


def key(s):
    words = unicodedata.normalize(
        "NFKD", s.replace("™", "").replace("®", "").casefold()
    )
    return "".join(c for c in words if c.isalnum())


def batches(values, size):
    values = sorted(values)
    return [values[i : i + size] for i in range(0, len(values), size)]


def artwork(image, source, label, rights=None, **fields):
    if any(urlsplit(u).scheme != "https" for u in (image, source, rights or source)):
        raise ValueError(f"Expected secure image and source: {image}, {source}")
    return dict(
        imageUrl=image,
        sourceUrl=source,
        linkLabel=label,
        imageRightsUrl=rights or source,
        **fields,
    )


def steam_rows(refs, path):
    with duckdb.connect(config={"threads": 1}) as db:
        games = db.execute(
            "SELECT appID,name,header_image,developers,publishers,genres FROM read_parquet(?) "
            "WHERE appID IN (SELECT unnest(?))",
            [str(path), list(refs)],
        ).fetchall()
    out = {}
    for app, name, image, developers, publishers, genres in games:
        if key(name) != key(refs[app]) or f"/apps/{app}/" not in urlsplit(image).path:
            raise ValueError(f"Steam title or header does not match app {app}: {name}")
        out[refs[app]] = artwork(
            image,
            f"https://store.steampowered.com/app/{app}/",
            "Steam",
            developers=developers,
            publishers=publishers,
            genres=genres,
        )
    return out


def amazon_rows(refs, path):
    out = {}
    with gzip.open(path, "rt") as stream:
        for line in stream:
            row = json.loads(line)
            asin = row["parent_asin"]
            if asin not in refs:
                continue
            title = refs[asin]
            platform = title.split(": ")[1].removesuffix(" Edition")
            if key("Minecraft") not in key(row["title"]) or key(platform) not in key(
                row["title"]
            ):
                raise ValueError(f"Retail edition mismatch: {title} and {row['title']}")
            url = next(p["large"] for p in row["images"] if p.get("variant") == "MAIN")
            out[title] = artwork(
                url,
                f"https://www.amazon.com/dp/{asin}",
                "Amazon",
                developers=["4J Studios"],
                series=["Minecraft"],
                developerUrl="https://4jstudios.com/about-us/",
            )
    return out


def apple_rows(refs, cache):
    url = "https://itunes.apple.com/lookup?" + urlencode(
        {"id": ",".join(sorted(refs)), "country": "US"}
    )
    doc = cached(cache, "apple", url, lambda: fetch(url, json.load))
    out = {}
    for row in doc["results"]:
        app = str(row["trackId"])
        if row.get("kind") != "software" or key(row["trackName"]) != key(refs[app]):
            raise ValueError(f"Unexpected App Store result: {app}, {row['trackName']}")
        link = row["trackViewUrl"].split("?")[0]
        if not link.endswith("/id" + app):
            raise ValueError(f"App Store source and ID disagree: {link}")
        out[refs[app]] = artwork(
            row["artworkUrl512"],
            link,
            "App Store",
            publishers=[row["sellerName"]],
            genres=[g for g in row["genres"] if g not in ("Games", "Entertainment")],
        )
    return out


class PublisherCard(HTMLParser):
    def __init__(self):
        super().__init__()
        self.og = {}

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if tag == "meta" and data.get("property") in ("og:title", "og:image"):
            self.og[data["property"]] = data["content"]
        if tag == "img" and "hero-large__image" in (data.get("class") or "").split():
            sizes = dict(
                pair.strip().split()[::-1]
                for pair in (data.get("srcset") or "").split(",")
                if pair.strip()
            )
            self.og["gameHero"] = sizes.get("640w", data["src"])


def publisher_art(source, title, cache):
    def parse(response):
        card = PublisherCard()
        card.feed(response.read().decode("utf-8"))
        return card.og

    studio = urlsplit(source).hostname
    group = "publisher-game-hero" if studio == "double11.com" else "publisher"
    doc = cached(cache, group, source, lambda: fetch(source, parse))
    if key(title) not in key(doc["og:title"]):
        raise ValueError(f"Publisher title mismatch: {title}, {doc['og:title']}")
    label = {
        "www.nintendo.com": "Nintendo",
        "www.alanwake.com": "Remedy",
        "double11.com": "Double Eleven",
    }
    # Double Eleven uses a company-wide social card. Its game page identifies the
    # Rust title artwork separately in the hero picture.
    asset = doc["gameHero"] if studio == "double11.com" else doc["og:image"]
    return artwork(urljoin(source, asset), source, label[studio])


def article_rows(refs, cache):
    articles = {}
    for names in batches(refs, 12):
        result = query(
            cache,
            "en.wikipedia",
            dict(
                titles="|".join(names),
                prop="info|pageprops|revisions",
                inprop="url",
                ppprop="wikibase_item",
                rvprop="content",
                rvslots="main",
                rvsection=0,
            ),
        )
        for name, page in resolved_pages(result, names):
            text = page["revisions"][0]["slots"]["main"]["content"]
            if page["title"] != name or not re.search(
                r"{{infobox video game\s*\n", text, re.I
            ):
                raise ValueError(f"Expected the selected video game article: {name}")
            image = re.search(
                r"^\|\s*image\s*=\s*([^\n|{}<>]+?\.(?:jpe?g|png|svg|webp))\s*(?:<!--[^\n]*?-->)?\s*$",
                text,
                re.I | re.M,
            )
            if not image:
                raise ValueError(f"Unrecognized game infobox image on {name}")
            articles[name] = (
                image[1].strip().removeprefix("File:").replace("_", " "),
                page["fullurl"],
                page["pageprops"]["wikibase_item"],
            )
    files = {}
    for names in batches({"File:" + a[0] for a in articles.values()}, 20):
        result = query(
            cache,
            "en.wikipedia",
            dict(
                titles="|".join(names),
                prop="imageinfo",
                iiprop="url|extmetadata",
                iiurlwidth=330,
                iiextmetadatalanguage="en",
                iiextmetadatafilter="LicenseShortName|LicenseUrl|Artist|Attribution",
            ),
        )
        for name, page in resolved_pages(result, names):
            if not page.get("imageinfo"):
                raise ValueError(f"Missing cover file: {name}")
            info = page["imageinfo"][0]
            md = {k: plain(v["value"]) for k, v in info.get("extmetadata", {}).items()}
            rights = info["descriptionurl"]
            if not isinstance(rights, str) or not rights.startswith("https://"):
                raise ValueError(f"Missing rights page for {name}")
            fields = {}
            # Local non-free cover pages document each owner's artwork and its use on the article.
            # A Commons file's attribution and license travel with the artwork.
            if page.get("imagerepository") == "shared" and md.get("LicenseShortName"):
                fields["imageLicense"] = md["LicenseShortName"]
                fields["imageLicenseUrl"] = (md.get("LicenseUrl") or rights).replace(
                    "http://", "https://"
                )
                if md.get("Attribution") or md.get("Artist"):
                    fields["imageCredit"] = md.get("Attribution") or md["Artist"]
            url = info.get("thumburl", info["url"]).split("?")[0]
            files[name[5:]] = (url, rights, fields)
    out = {}
    entities = {}
    for name, (file, source, qid) in articles.items():
        image, rights, fields = files[file]
        out[refs[name]] = artwork(image, source, "Wikipedia", rights, **fields)
        entities[qid] = refs[name]
    return out, entities


def wikidata_fields(refs, cache, steam=False):
    records = {}
    for batch in batches(refs, 40):
        if steam:
            match = (
                "VALUES ?id { "
                + " ".join(json.dumps(x) for x in batch)
                + " } ?game wdt:P1733 ?id."
            )
            fields = '(wdt:P179 "series")'
        else:
            match = (
                "VALUES ?game { "
                + " ".join("wd:" + x for x in batch)
                + " } BIND(STRAFTER(STR(?game), '/entity/') AS ?id)"
            )
            fields = '(wdt:P136 "genres") (wdt:P178 "developers") (wdt:P123 "publishers") (wdt:P179 "series")'
        result = sparql(
            cache,
            "SELECT DISTINCT ?id ?game ?key ?value WHERE { "
            + match
            + " VALUES (?predicate ?key) { "
            + fields
            + " } ?game ?predicate ?obj. ?obj rdfs:label ?value. FILTER (LANG(?value)='en') }",
        )
        games = {}
        for row in result:
            ref, entity, field, value = [
                row[k]["value"] for k in ("id", "game", "key", "value")
            ]
            games.setdefault(ref, {}).setdefault(entity, {}).setdefault(
                field, set()
            ).add(value)
        for ref, entities in games.items():
            if len(entities) == 1:
                entity, values = next(iter(entities.items()))
                records[refs[ref]] = {
                    **{k: sorted(v) for k, v in values.items()},
                    "wikidataUrl": entity.replace("http://", "https://"),
                }
    return records


def check_image(url, cache):
    def decode(response):
        if not response.headers.get_content_type().startswith("image/"):
            raise ValueError(f"Expected an image: {url}")
        with Image.open(BytesIO(response.read())) as image:
            image.load()
            if min(image.size) < 32:
                raise ValueError(f"Image too small: {url}")
            return [image.format, image.width, image.height]

    return cached(cache, "decoded", url, lambda: fetch(url, decode))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("steam", type=Path)
    p.add_argument("amazon", type=Path)
    p.add_argument("cache", type=Path)
    p.add_argument("output", type=Path)
    args = p.parse_args()
    catalog = {
        it["title"]: it["itemId"]
        for it in json.loads((ROOT / "metacritic.json").read_text())["items"]
    }
    with (ROOT / "metacritic-artwork-sources.csv").open() as f:
        rows = list(csv.DictReader(f))
    if len(rows) != len(catalog) or {r["title"] for r in rows} != catalog.keys():
        raise ValueError("Artwork manifest and catalog titles must be one-to-one")
    groups = {}
    for r in rows:
        group = groups.setdefault(r["provider"], {})
        if r["reference"] in group:
            raise ValueError(f"Duplicate source reference: {r['reference']}")
        group[r["reference"]] = r["title"]
    records = steam_rows(groups["steam"], args.steam)
    records.update(amazon_rows(groups["amazon"], args.amazon))
    records.update(apple_rows(groups["apple"], args.cache))
    for source, title in groups["publisher"].items():
        records[title] = publisher_art(source, title, args.cache)
    wiki, ids = article_rows(groups["article"], args.cache)
    wiki["Shadow of the Colossus"]["imageCaption"] = "Original 2005 cover"
    records.update(wiki)
    for sources, steam in ((ids, False), (groups["steam"], True)):
        for title, fields in wikidata_fields(sources, args.cache, steam).items():
            records[title].update(fields)
    if records.keys() != catalog.keys():
        raise ValueError(f"Missing games: {catalog.keys() - records.keys()}")
    with ThreadPoolExecutor(4) as pool:
        list(
            pool.map(
                lambda row: check_image(row["imageUrl"], args.cache), records.values()
            )
        )
    output = {item: records[title] for title, item in catalog.items()}
    args.output.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    print({provider: len(entries) for provider, entries in groups.items()})
    print(
        {
            k: sum(bool(a.get(k)) for a in records.values())
            for k in ["imageUrl", "genres", "developers", "publishers", "series"]
        }
    )


if __name__ == "__main__":
    main()
