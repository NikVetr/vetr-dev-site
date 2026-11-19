"""Build recognition cards for the exact articles in film-links and destination-links.

From the repository root, using MovieLens 25M links.csv and credits.csv from
Rounak Banik's 2017 TMDB movie metadata snapshot (plain or gzip-compressed):

  python3 media-ratings/prepare_recognition.py work/links.csv work/credits.csv.gz \
      tmp/agent/media-recognition/cache media-ratings/recognition.json

Wikidata descriptions and TMDB billing order supply the text cues. The image
prefers the film poster from the verified English article. The fallback comes
from Wikipedia's free lead image, the item's Wikidata logo or image,
or a labeled cast portrait joined by TMDB person ID. The Commons file page
supplies the credit, license and thumbnail. Use a fresh cache to refresh.
https://www.mediawiki.org/wiki/API:Pageimages
https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset
"""

import argparse
import ast
import csv
import gzip
import json
import re
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlencode, urlsplit

from prepare_film_links import cached, fetch

ROOT = Path(__file__).resolve().parent


class PlainText(HTMLParser):
    """Extract the displayed attribution without retaining active wiki markup."""

    def __init__(self):
        super().__init__()
        self.parts = []
        self.suppressed = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script"):
            self.suppressed += 1
        elif tag in ("br", "div", "p", "li"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("style", "script"):
            self.suppressed -= 1
        elif tag in ("div", "p", "li"):
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.suppressed:
            self.parts.append(data)


def plain(html):
    parser = PlainText()
    parser.feed(html)
    return " ".join("".join(parser.parts).split())


def query(cache, domain, params):
    url = f"https://{domain}.org/w/api.php?" + urlencode(
        {
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "redirects": 1,
            **params,
        }
    )
    result = cached(cache, domain, url, lambda: fetch(url, json.load))
    more = result.get("continue", {})
    # Only the current file revision is wanted. imageinfo can offer an older revision
    # even when the current image for every requested file is already in this batch.
    older_images = params.get("prop") == "imageinfo" and set(more) == {"iistart", "continue"}
    if "error" in result or (more and not older_images):
        raise ValueError(
            f"Incomplete MediaWiki response: {result.get('error', result.get('continue'))}"
        )
    return result["query"]


def resolved_pages(result, titles):
    aliases = {
        a["from"]: a["to"]
        for key in ("normalized", "redirects")
        for a in result.get(key, [])
    }
    pages = {p["title"]: p for p in result["pages"]}
    for title in titles:
        resolved = title
        for _ in range(len(aliases)):
            if resolved not in aliases:
                break
            resolved = aliases[resolved]
        yield title, pages[resolved]


def collect(pool, values, size, lookup, cache):
    values = sorted(values)
    batches = [values[i : i + size] for i in range(0, len(values), size)]
    out = {}
    for records in pool.map(partial(lookup, cache=cache), batches):
        out.update(records)
    return out


def article_info(titles, cache):
    doc = query(
        cache,
        "en.wikipedia",
        {
            "titles": "|".join(titles),
            "prop": "pageprops|pageimages",
            "ppprop": "wikibase_item",
            "pilicense": "free",
            "piprop": "name",
            "pilimit": len(titles),
        },
    )
    return {
        title: (page["pageprops"]["wikibase_item"], page.get("pageimage"))
        for title, page in resolved_pages(doc, titles)
    }


def film_leads(titles, cache):
    doc = query(cache, "en.wikipedia", {
        "titles": "|".join(titles), "prop": "pageimages",
        "pilicense": "any", "piprop": "name|thumbnail",
        "pithumbsize": 250, "pilimit": len(titles),
    })
    return {
        title: (page["pageimage"].replace("_", " "), page["thumbnail"]["source"].split("?")[0])
        for title, page in resolved_pages(doc, titles)
        if page.get("pageimage") and page.get("thumbnail")
    }


def infobox_posters(titles, cache):
    """Recover a poster explicitly identified in the film infobox when PageImages skips it."""
    doc = query(cache, "en.wikipedia", {
        "titles": "|".join(titles), "prop": "revisions", "rvprop": "content",
        "rvslots": "main", "rvsection": 0,
    })
    out = {}
    for title, page in resolved_pages(doc, titles):
        intro = page["revisions"][0]["slots"]["main"]["content"]
        box = re.search(r"{{infobox film\s*\n(.*?)(?:\n}})", intro, re.I | re.S)
        if not box or not re.search(r"^\|\s*caption\s*=.*poster", box[1], re.I | re.M):
            continue
        name = re.search(r"^\|\s*image\s*=\s*([^\n|{}]+?\.(?:jpe?g|png))\s*$", box[1], re.I | re.M)
        if name:
            out[title] = name[1].strip().replace("_", " ")
    return out


def poster_files(names, cache, from_infobox=False):
    titles = ["File:" + n for n in names]
    doc = query(cache, "en.wikipedia", {
        "titles": "|".join(titles), "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 250,
        "iiextmetadatafilter": "Categories|LicenseShortName|LicenseUrl|Artist|Attribution",
    })
    out = {}
    for title, page in resolved_pages(doc, titles):
        info = next(iter(page.get("imageinfo", [])), {})
        md = {k: plain(v["value"]) for k, v in info.get("extmetadata", {}).items()}
        if not from_infobox and "poster" not in (title + "|" + md.get("Categories", "")).lower():
            continue
        source = info.get("descriptionurl")
        if not source or not info.get("thumburl") or not md.get("LicenseShortName"):
            continue
        out[title[5:]] = {
            "title": "Film poster", "sourceUrl": source, "url": info["thumburl"].split("?")[0],
            "credit": md.get("Attribution") or md.get("Artist") or "Poster file and rights",
            "license": md["LicenseShortName"] if md["LicenseShortName"] != "Fair use" else "",
            "licenseUrl": md.get("LicenseUrl", "").replace("http://", "https://"),
        }
    return out


def sparql(cache, query_text):
    url = "https://query.wikidata.org/sparql?" + urlencode(
        {"format": "json", "query": query_text}
    )
    source = cached(cache, "wikidata", url, lambda: fetch(url, json.load))
    return source["results"]["bindings"]


def entities(ids, cache):
    if not all(re.fullmatch(r"Q[1-9]\d*", qid) for qid in ids):
        raise ValueError("Expected Wikidata entity IDs")
    values = " ".join("wd:" + qid for qid in ids)
    # Prefer the English article image, then the film title treatment, then
    # another image explicitly associated with this work or place on Wikidata.
    statement = (
        "SELECT ?item ?description ?logo ?image WHERE { VALUES ?item { "
        + values
        + " } "
        'OPTIONAL { ?item schema:description ?description. FILTER(LANG(?description) = "en") } '
        "OPTIONAL { ?item wdt:P154 ?logo. } OPTIONAL { ?item wdt:P18 ?image. } }"
    )
    data = {qid: {"description": "", "logo": set(), "image": set()} for qid in ids}
    for row in sparql(cache, statement):
        item = data[row["item"]["value"].split("/")[-1]]
        if "description" in row:
            item["description"] = row["description"]["value"]
        for key in ("image", "logo"):
            if key in row:
                name = unquote(row[key]["value"].rsplit("/Special:FilePath/", 1)[1])
                item[key].add(name.replace("_", " "))
    return data


def file_info(names, cache):
    titles = ["File:" + name for name in names]
    doc = query(
        cache,
        "commons.wikimedia",
        {
            "titles": "|".join(titles),
            "prop": "imageinfo",
            "iiprop": "url|mime|extmetadata",
            "iiurlwidth": 330,
            "iiextmetadatalanguage": "en",
            "iiextmetadatafilter": "Artist|Attribution|LicenseShortName|LicenseUrl|License|Copyrighted",
        },
    )
    out = {}
    for title, page in resolved_pages(doc, titles):
        if not page.get("imageinfo"):
            continue
        info = page["imageinfo"][0]
        if not info.get("thumburl") or info.get("mime") not in (
            "image/jpeg",
            "image/png",
            "image/svg+xml",
            "image/webp",
            "image/tiff",
            "image/gif",
        ):
            continue
        md = {k: plain(v["value"]) for k, v in info.get("extmetadata", {}).items()}
        credit = md.get("Attribution") or md.get("Artist", "")
        license_name = md.get("LicenseShortName", "")
        url = md.get("LicenseUrl", "").replace("http://", "https://")
        if md.get("License") == "pd" and md.get("Copyrighted") == "False":
            url = info["descriptionurl"]
        elif not (
            re.fullmatch(
                r"https://creativecommons\.org/(?:licenses/by(?:-sa)?|publicdomain/zero)/[\w./-]+",
                url,
            )
            and credit
            and license_name
        ):
            continue
        out[title.removeprefix("File:")] = {
            "url": info["thumburl"].split("?")[0],
            "sourceUrl": info["descriptionurl"],
            "credit": credit,
            "license": license_name,
            "licenseUrl": url,
            "title": page["title"].removeprefix("File:"),
        }
    return out


def film_credits(links, credits, films):
    with links.open() as f:
        tmdb_ids = {
            row["tmdbId"]: row["movieId"]
            for row in csv.DictReader(f)
            if row["movieId"] in films
            and row["tmdbId"]
            and films[row["movieId"]]["imdb"]
            .rstrip("/")
            .endswith("/tt" + row["imdbId"])
        }
    out = {}
    # Some ensemble credits exceed csv's default field length.
    csv.field_size_limit(4 * 1024 * 1024)
    opener = gzip.open if credits.suffix == ".gz" else open
    with opener(credits, "rt", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            film = tmdb_ids.get(row["id"])
            if not film:
                continue
            cast = sorted(
                ast.literal_eval(row["cast"]), key=lambda actor: actor["order"]
            )
            names = list(
                dict.fromkeys(
                    (str(actor["id"]), actor["name"]) for actor in cast if actor["name"]
                )
            )[:2]
            if names:
                out[films[film]["wikipedia"]] = names
    return out


def actor_portraits(person_ids, cache):
    if not all(re.fullmatch(r"\d+", person) for person in person_ids):
        raise ValueError("Invalid TMDB person ID")
    ids = " ".join(json.dumps(i) for i in person_ids)
    statement = (
        "SELECT DISTINCT ?id ?person ?image WHERE { VALUES ?id { " + ids + " } "
        "?person wdt:P4985 ?id; wdt:P18 ?image. }"
    )
    people = {}
    for row in sparql(cache, statement):
        person = people.setdefault(row["id"]["value"], {})
        filenames = person.setdefault(row["person"]["value"], set())
        filenames.add(
            unquote(row["image"]["value"].rsplit("/Special:FilePath/", 1)[1]).replace(
                "_", " "
            )
        )
    # Omit ambiguous external IDs, even when the individuals' names agree.
    return {
        k: sorted(next(iter(matches.values())))
        for k, matches in people.items()
        if len(matches) == 1
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("links", type=Path)
    parser.add_argument("credits", type=Path)
    parser.add_argument("cache", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    films = json.loads((ROOT / "film-links.json").read_text())
    places = json.loads((ROOT / "destination-links.json").read_text())
    records = [*films.values(), *places.values()]
    articles = {
        unquote(urlsplit(r["wikipedia"]).path[6:]).replace("_", " "): r for r in records
    }
    if len(articles) != len(records):
        raise ValueError("Article identities must be unique across bundled catalogs")
    cast = film_credits(args.links, args.credits, films)
    with ThreadPoolExecutor(max_workers=2) as pool:
        film_titles = [t for t, r in articles.items() if "imdb" in r]
        leads = collect(pool, film_titles, 35, film_leads, args.cache)
        posters = collect(pool, {n for n, _ in leads.values()}, 25, poster_files, args.cache)
        missing = [t for t in film_titles if t not in leads or leads[t][0] not in posters]
        extra = collect(pool, missing, 20, infobox_posters, args.cache)
        if extra:
            fallback = poster_files(sorted(set(extra.values())), args.cache, from_infobox=True)
            posters.update(fallback)
            leads.update({t: (name, fallback[name]["url"]) for t, name in extra.items() if name in fallback})
        pages = collect(pool, articles.keys(), 35, article_info, args.cache)
        data = collect(
            pool, {qid for qid, _ in pages.values()}, 80, entities, args.cache
        )
        candidates = {}
        for article, (qid, lead) in pages.items():
            if (
                "wikidata" in articles[article]
                and articles[article]["wikidata"].split("/")[-1] != qid
            ):
                raise ValueError(f"Article identity changed: {article}")
            item = data[qid]
            candidates[article] = (
                ([lead.replace("_", " ")] if lead else [])
                + sorted(item["logo"])
                + sorted(item["image"])
            )
        filenames = {name for names in candidates.values() for name in names}
        images = collect(pool, filenames, 18, file_info, args.cache)
        missing = [
            article
            for article, names in candidates.items()
            if not any(n in images for n in names)
        ]
        actors = {
            person
            for article in missing
            for person, _ in cast.get(articles[article]["wikipedia"], [])
        }
        portraits = collect(pool, actors, 70, actor_portraits, args.cache)
        portrait_names = {name for names in portraits.values() for name in names}
        images.update(
            collect(pool, portrait_names - images.keys(), 18, file_info, args.cache)
        )

    out = {}
    for title, r in articles.items():
        description = data[pages[title][0]]["description"]
        names = cast.get(r["wikipedia"], [])
        if names:
            description = (
                (description + ". " if description else "")
                + "With "
                + " and ".join(n for _, n in names)
                + "."
            )
        card = {"description": description}
        available = next(
            (images[name] for name in candidates[title] if name in images), None
        )
        if not available:
            for person, name in names:
                portrait = next(
                    (images[f] for f in portraits.get(person, []) if f in images), None
                )
                if portrait:
                    available = {**portrait, "caption": name + " · cast"}
                    break
        if title in leads:
            name, url = leads[title]
            if name in posters:
                card["poster"] = {**posters[name], "url": url}
        if available:
            card["image"] = available
        out[r["wikipedia"]] = card
    args.output.write_text(
        json.dumps(dict(sorted(out.items())), ensure_ascii=False, separators=(",", ":"))
        + "\n"
    )
    for name, domain in [("films", films), ("places", places)]:
        cards = [out[r["wikipedia"]] for r in domain.values()]
        print(
            f"{name}: {len(cards)} articles, {sum(bool(c['description']) for c in cards)} descriptions, "
            f"{sum('image' in c for c in cards)} attributed images"
        )


if __name__ == "__main__":
    main()
