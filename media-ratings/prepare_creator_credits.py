"""Build item-ID-keyed director, cast and production-company annotations.

See creator-credits.md for the sources, licenses and reproduction commands.
Film credits use exact IMDb → TMDB movie IDs. TV credits use the catalog's
verified TVmaze series IDs and their IMDb IDs, with no title matching.
"""

import argparse
import ast
import csv
import gzip
import io
import json
import re
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode
from zipfile import ZipFile

from prepare_film_links import cached, fetch

HERE = Path(__file__).resolve().parent
LEADS = 5


def unique_names(people):
    return list(dict.fromkeys(p["name"].strip() for p in people if p["name"].strip()))


def film_records(links, metadata, credits):
    films = json.loads(links.read_text())
    imdb = {row["imdb"].rstrip("/").split("/")[-1]: item for item, row in films.items()}
    records, tmdb = {}, {}
    with metadata.open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            if (item := imdb.get(row["imdb_id"])) is None:
                continue
            if item in records or row["id"] in tmdb:
                raise ValueError(f"Ambiguous film identity at {item}")
            tmdb[row["id"]] = item
            records[item] = dict(
                directors=[],
                cast=[],
                studios=unique_names(ast.literal_eval(row["production_companies"])),
            )
    if set(records) != set(films):
        raise ValueError("At least one verified film is missing from the TMDB metadata")
    csv.field_size_limit(4 * 1024 * 1024)
    opener = gzip.open if credits.suffix == ".gz" else open
    matched = set()
    with opener(credits, "rt", encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            if (item := tmdb.get(row["id"])) is None:
                continue
            if item in matched:
                raise ValueError(f"Duplicate film credit source for {item}")
            matched.add(item)
            cast = sorted(
                ast.literal_eval(row["cast"]), key=lambda person: person["order"]
            )
            crew = ast.literal_eval(row["crew"])
            records[item].update(
                cast=unique_names(cast)[:LEADS],
                directors=unique_names(p for p in crew if p["job"] == "Director"),
            )
    if matched != set(records):
        raise ValueError("Credits missing from the TMDB extract")
    return records


def series_credits(imdb, cache):
    rows = defaultdict(
        lambda: defaultdict(lambda: {"directors": set(), "studios": set()})
    )
    ids = sorted(imdb)
    for start in range(0, len(ids), 40):
        group = " ".join(json.dumps(i) for i in ids[start : start + 40])
        query = (
            """SELECT DISTINCT ?id ?item ?prop ?label WHERE {
          VALUES ?id { %s } ?item wdt:P345 ?id.
          OPTIONAL { VALUES ?prop { wdt:P57 wdt:P272 } ?item ?prop ?credit.
                     ?credit rdfs:label ?label. FILTER(LANG(?label) = "en") }
        }"""
            % group
        )
        url = "https://query.wikidata.org/sparql?" + urlencode(
            {"format": "json", "query": query}
        )
        doc = cached(cache, "wikidata", url, lambda: fetch(url, json.load))
        for row in doc["results"]["bindings"]:
            roles = rows[row["id"]["value"]][row["item"]["value"]]
            if "prop" in row:
                role = {"P57": "directors", "P272": "studios"}[
                    row["prop"]["value"].rsplit("/", 1)[-1]
                ]
                roles[role].add(row["label"]["value"])
    # IMDb-to-show mappings with multiple entities cannot uniquely establish a credit.
    return {
        item: next(iter(group.values()))
        for item, group in rows.items()
        if len(group) == 1
    }


def tv_records(catalog, archive, cache):
    shows = json.loads(catalog.read_text())["items"]
    series = {}
    for show in shows:
        match = re.fullmatch(
            r"https://www.tvmaze.com/shows/(\d+)", show["annotations"]["sourceUrl"]
        )
        if not match:
            raise ValueError(f"Expected a verified TVmaze show ID for {show['itemId']}")
        series[show["itemId"]] = int(match[1])
    with ZipFile(archive) as z, z.open("ml-32m/links.csv") as source:
        imdb = {
            "tt" + row["imdbId"]: row["movieId"]
            for row in csv.DictReader(io.TextIOWrapper(source))
            if row["movieId"] in series
        }
    if len(imdb) != len(series) or len(set(series.values())) != len(series):
        raise ValueError(
            "Expected unique TVmaze and IMDb identities for every TV entry"
        )

    lock = threading.Lock()
    last_request = 0.0

    def show_people(entry):
        imdb_id, item = entry
        tv_id = series[item]
        url = f"https://api.tvmaze.com/shows/{tv_id}?embed%5B%5D=cast&embed%5B%5D=crew"

        def get():
            nonlocal last_request
            with lock:
                time.sleep(max(0, 0.55 - (time.monotonic() - last_request)))
                last_request = time.monotonic()
            data = fetch(url, json.load)
            return dict(
                id=data["id"],
                imdb=data["externals"]["imdb"],
                cast=unique_names(p["person"] for p in data["_embedded"]["cast"])[
                    :LEADS
                ],
                directors=unique_names(
                    p["person"]
                    for p in data["_embedded"]["crew"]
                    if p["type"] == "Director"
                ),
            )

        credit = cached(cache, "tvmaze", url, get)
        if credit["id"] != tv_id:
            raise ValueError(f"TVmaze returned a different show for {tv_id}")
        # The series carries a previously verified TVmaze ID. If either site now
        # identifies a different work, avoid combining the mismatched credits.
        if credit["imdb"] and credit["imdb"] != imdb_id:
            raise ValueError(f"TVmaze and MovieLens IMDb IDs now disagree for {item}")
        return item, {field: credit[field] for field in ("cast", "directors")}

    with ThreadPoolExecutor(max_workers=3) as pool:
        pending = pool.map(show_people, imdb.items())
        wikidata = series_credits(imdb, cache)
        records = dict(pending)
    for imdb_id, item in imdb.items():
        roles = wikidata.get(imdb_id, {})
        records[item]["directors"] = sorted(
            set(records[item]["directors"]) | roles.get("directors", set())
        )
        records[item]["studios"] = sorted(roles.get("studios", set()))
    return records


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="medium", required=True)
    film = sub.add_parser("film")
    film.add_argument("metadata", type=Path)
    film.add_argument("credits", type=Path)
    tv = sub.add_parser("tv")
    tv.add_argument("archive", type=Path)
    tv.add_argument("cache", type=Path)
    for p in (film, tv):
        p.add_argument("output", type=Path)
    args = parser.parse_args()
    if args.medium == "film":
        data = film_records(HERE / "film-links.json", args.metadata, args.credits)
    else:
        data = tv_records(HERE / "tv.json", args.archive, args.cache)
    args.output.write_text(
        json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n"
    )
    print(
        args.medium,
        len(data),
        {
            k: sum(bool(row[k]) for row in data.values())
            for k in ("directors", "cast", "studios")
        },
    )
