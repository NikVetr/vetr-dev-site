"""Resolve the MovieLens IMDb IDs to direct film pages and US certificates.

From the repository root:
  python3 media-ratings/prepare_film_links.py media-ratings/expanded-evidence.json \
      media-ratings/film-links.json tmp/agent/media-links/cache

Wikidata P345 joins an exact IMDb ID to a Wikidata item. English Wikipedia confirms
the item's sitelink via pageprops. Rotten Tomatoes P1258 IDs lead to the publisher's
Movie JSON-LD, which provides the canonical URL and, where available, US certificate.
The cache contains small source records; use a fresh cache directory to refresh them.
"""

import argparse
import hashlib
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit, unquote
from urllib.request import Request, urlopen

USER_AGENT = "vetr.dev Rating Prediction (https://vetr.dev/rating-prediction/)"
MOVIE_PATH = re.compile(r"/m/[A-Za-z0-9._%-]+")
CERTIFICATES = {
    "G",
    "PG",
    "PG-13",
    "R",
    "NC-17",
    "X",
    "GP",
    "M",
    "NR",
    "Not Rated",
    "Unrated",
}


def fetch(url, read_response):
    request = Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=75) as response:
                return read_response(response)
        except (TimeoutError, URLError) as err:
            if isinstance(err, HTTPError) and err.code not in {429, 500, 502, 503, 504}:
                raise
            if attempt == 2:
                raise
            delay = (
                err.headers.get("Retry-After", "") if isinstance(err, HTTPError) else ""
            )
            time.sleep(int(delay) if delay.isdigit() else 3 * (attempt + 1))
    raise RuntimeError("Request did not complete")


def cached(cache, group, key, load):
    directory = cache / group
    directory.mkdir(exist_ok=True, parents=True)
    path = directory / (hashlib.sha256(key.encode()).hexdigest() + ".json")
    if not path.exists():
        value = load()
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(value, ensure_ascii=False))
        tmp.replace(path)
        return value
    return json.loads(path.read_text())


def wikidata(ids, cache):
    rows = []
    for start in range(0, len(ids), 100):
        values = " ".join(json.dumps(s) for s in ids[start : start + 100])
        query = (
            "SELECT DISTINCT ?imdb ?item ?article ?rt WHERE { VALUES ?imdb { "
            + values
            + " } ?item wdt:P345 ?imdb. OPTIONAL { ?article schema:about ?item; schema:isPartOf "
            "<https://en.wikipedia.org/>. } OPTIONAL { ?item wdt:P1258 ?rt. } }"
        )
        url = "https://query.wikidata.org/sparql?" + urlencode(
            {"query": query, "format": "json"}
        )
        rows.extend(
            cached(cache, "wikidata", url, lambda: fetch(url, json.load))["results"][
                "bindings"
            ]
        )
    return rows


def wikipedia_titles(items, cache):
    """Verify the reverse Wikipedia → Wikidata identity and return current page names."""
    result = {}
    titles = sorted({title for it in items.values() for title in it["titles"]})
    for start in range(0, len(titles), 50):
        params = {
            "action": "query",
            "prop": "pageprops",
            "ppprop": "wikibase_item",
            "format": "json",
            "formatversion": "2",
            "redirects": "1",
            "titles": "|".join(titles[start : start + 50]),
        }
        url = "https://en.wikipedia.org/w/api.php?" + urlencode(params)
        doc = cached(cache, "enwiki", url, lambda: fetch(url, json.load))
        for page in doc["query"]["pages"]:
            qid = page.get("pageprops", {}).get("wikibase_item")
            if qid:
                title = quote(page["title"].replace(" ", "_"), safe="/(),!:$'@-")
                result[qid] = "https://en.wikipedia.org/wiki/" + title
    return result


def movie_page(response):
    # Movie data is in the document head. Stop the download after the JSON-LD.
    head = b""
    while len(head) < 1_048_576:
        chunk = response.read(16_384)
        head += chunk
        for match in re.finditer(
            rb'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            head,
            re.S | re.I,
        ):
            data = json.loads(match[1])
            if isinstance(data, dict) and data.get("@type") == "Movie":
                canonical = data["url"]
                parts = urlsplit(canonical)
                if (
                    parts.scheme != "https"
                    or parts.netloc != "www.rottentomatoes.com"
                    or not MOVIE_PATH.fullmatch(parts.path)
                    or parts.query
                    or parts.fragment
                ):
                    raise ValueError(
                        f"Unexpected Rotten Tomatoes canonical URL: {canonical}"
                    )
                return {
                    "url": canonical,
                    "title": data.get("name"),
                    "date": data.get("dateCreated"),
                    "certificate": data.get("contentRating"),
                }
        if not chunk or b"</head>" in head.lower():
            break
    raise ValueError(f"No Movie record in {response.url}")


def prepare(evidence, output, cache):
    id_map = {f"tt{imdb}": item for item, imdb in evidence["imdb"].items()}
    if len(id_map) != len(evidence["ids"]) or set(id_map.values()) != set(
        evidence["ids"]
    ):
        raise ValueError("Expected one unique IMDb ID per catalog item")
    if not all(re.fullmatch(r"tt[0-9]+", imdb) for imdb in id_map):
        raise ValueError("Invalid IMDb ID")
    items = {}
    for row in wikidata(list(id_map), cache):
        imdb = row["imdb"]["value"]
        qid = row["item"]["value"].rsplit("/", 1)[-1]
        if imdb not in id_map or not re.fullmatch(r"Q[0-9]+", qid):
            raise ValueError(f"Unexpected Wikidata result for {imdb}")
        # The 1979 movie and its 2001 Redux cut share the same IMDb ID.
        if imdb == "tt0078788" and qid == "Q3620669":
            continue
        record = items.setdefault(imdb, {"qid": qid, "titles": set(), "rt": set()})
        if record["qid"] != qid:
            raise ValueError(f"Multiple Wikidata entities for {imdb}")
        if "article" in row:
            wiki = urlsplit(row["article"]["value"])
            if wiki.netloc != "en.wikipedia.org" or not wiki.path.startswith("/wiki/"):
                raise ValueError(f"Invalid English Wikipedia sitelink for {imdb}")
            record["titles"].add(unquote(wiki.path[6:]).replace("_", " "))
        if "rt" in row:
            slug = row["rt"]["value"]
            if MOVIE_PATH.fullmatch("/" + slug):
                record["rt"].add(slug)
    if set(items) != set(id_map):
        raise ValueError(f"Unresolved IMDb IDs: {sorted(set(id_map) - set(items))}")
    slugs = sorted({slug for it in items.values() for slug in it["rt"]})

    def resolve(slug):
        url = "https://www.rottentomatoes.com/" + slug
        return cached(cache, "rotten-tomatoes", url, lambda: fetch(url, movie_page))

    with ThreadPoolExecutor(max_workers=4) as pool:
        movies = dict(zip(slugs, pool.map(resolve, slugs)))
    articles = wikipedia_titles(items, cache)
    result = {}
    for imdb, item in items.items():
        links = {
            "imdb": f"https://www.imdb.com/title/{imdb}/",
            "wikidata": "https://www.wikidata.org/wiki/" + item["qid"],
        }
        if item["qid"] in articles:
            links["wikipedia"] = articles[item["qid"]]
        pages = {movies[slug]["url"]: movies[slug] for slug in item["rt"]}
        if len(pages) > 1:
            raise ValueError(
                f"Multiple canonical Rotten Tomatoes pages for {imdb}: {list(pages)}"
            )
        if pages:
            movie = next(iter(pages.values()))
            links["rottenTomatoes"] = movie["url"]
            rating = movie["certificate"]
            if rating in CERTIFICATES:
                links["certificate"] = rating
        result[id_map[imdb]] = links
    output.write_text(
        json.dumps(result, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    )
    for name in ["imdb", "wikidata", "wikipedia", "rottenTomatoes", "certificate"]:
        print(
            f"{name}: {sum(name in r for r in result.values())}/{len(result)}",
            flush=True,
        )


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    for name in ["evidence", "output", "cache"]:
        cli.add_argument(name, type=Path)
    args = cli.parse_args()
    prepare(json.loads(args.evidence.read_text()), args.output, args.cache)
