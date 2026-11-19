"""Attach source-backed geographic attributes and references to the expanded Stravl catalog."""

import argparse
import html
import json
import math
import re
import struct
import unicodedata
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import unquote, urlencode, urlsplit
from zipfile import ZipFile

from osgeo import gdal, ogr, osr

from prepare_recognition import article_info, collect, file_info, sparql

ROOT = Path(__file__).resolve().parent
COUNTRY_ALIASES = {
    "Czech Republic": "CZ",
    "St. Kitts and Nevis": "KN",
    "St. Lucia": "LC",
    "St. Vincent and the Grenadines": "VC",
    "Cape Verde": "CV",
    "Palestine": "PS",
    "Netherlands": "NL",
    "Greenland (Denmark)": "GL",
}


def normalized(name):
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", name).casefold() if ch.isalnum()
    )


def locations(geo, items):
    countries = {
        row[4]: row[0]
        for row in (
            s.split("\t")
            for s in (geo / "countryInfo.txt").read_text().splitlines()
            if s and s[0] != "#"
        )
    }
    countries.update(COUNTRY_ALIASES)
    # Only use an unambiguous match in the named country. Explicit states in the source must also match.
    states = {
        r[0]: {normalized(s) for s in r[1:3]}
        for r in (
            s.split("\t")
            for s in (geo / "admin1CodesASCII.txt").read_text().splitlines()
        )
    }
    region = {}
    page = (geo / "m49.html").read_text()
    for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", page, re.S | re.I):
        cells = re.findall(r"<td\b[^>]*>\s*([^<>]*?)\s*</td>", row, re.S | re.I)
        if (
            len(cells) >= 12
            and cells[0] == "001"
            and cells[1] == "World"
            and re.fullmatch("[A-Z]{2}", cells[10])
        ):
            region[cells[10]] = html.unescape(cells[5])
    if len(region) < 200:
        raise ValueError("Missing UN M49 country subregions")
    # Taiwan does not have its own ISO entry in the UN M49 table.
    region["TW"] = "Eastern Asia"
    gdp = {
        r["country"]["id"]: round(r["value"])
        for r in json.loads((geo / "gdp.json").read_text())[1]
        if r["date"] == "2023" and r["value"] is not None
    }
    wanted = defaultdict(list)
    annotations = {}
    for item in items:
        parts = [s.strip() for s in item["title"].split(",")]
        cc = countries[parts[-1]]
        annotations[item["itemId"]] = {"country": parts[-1], "region": region[cc]}
        if cc in gdp:
            annotations[item["itemId"]]["gdp"] = gdp[cc]
        wanted[(cc, normalized(parts[0]))].append(
            (item["itemId"], [normalized(s) for s in parts[1:-1]])
        )
    candidates = defaultdict(dict)
    with ZipFile(geo / "cities500.zip") as source, source.open("cities500.txt") as rows:
        for line in rows:
            r = line.decode().rstrip("\n").split("\t")
            if r[6] != "P" or r[7] in {"PPLX", "PPLH", "PPLQ", "PPLW"}:
                continue
            for n in {normalized(r[1]), normalized(r[2])}:
                for key, admins in wanted.get((r[8], n), []):
                    if not admins or any(
                        a in states.get(r[8] + "." + r[10], set()) for a in admins
                    ):
                        candidates[key][r[0]] = r
    matches = {k: next(iter(v.values())) for k, v in candidates.items() if len(v) == 1}
    return annotations, matches


def climate_and_coast(geo, matches, annotations):
    paths = [f"/vsizip/{geo}/climate.zip/wc2.1_10m_bio_{k}.tif" for k in (1, 12)]
    climate = [gdal.Open(path) for path in paths]
    coastline = ogr.Open(f"/vsizip/{geo}/coast.zip/ne_10m_coastline.shp")
    if not coastline or not all(climate):
        raise ValueError("Natural Earth coastline or WorldClim BIO1/BIO12 is missing")
    layer = coastline.GetLayer()
    source = layer.GetSpatialRef().Clone()
    source.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    origin = ogr.CreateGeometryFromWkt("POINT (0 0)")
    for key, r in matches.items():
        lat, lon = map(float, r[4:6])
        ann = annotations[key]
        ann["placeId"] = r[0]
        if int(r[14]) > 0:
            ann["population"] = int(r[14])
        for field, grid in zip(("temperature", "precipitation"), climate):
            x, y = gdal.ApplyGeoTransform(
                gdal.InvGeoTransform(grid.GetGeoTransform()), lon, lat
            )
            band = grid.GetRasterBand(1)
            sample = band.ReadRaster(
                math.floor(x), math.floor(y), 1, 1, buf_type=gdal.GDT_Float64
            )
            if sample:
                v = struct.unpack("=d", sample)[0]
                if v != band.GetNoDataValue() and math.isfinite(v):
                    ann[field] = round(v, 1)
        # Clip each potentially continental feature before reprojecting to a local metric CRS.
        margin = 0.36 / math.cos(math.radians(lat))
        crs = osr.SpatialReference()
        crs.ImportFromProj4(
            f"+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m"
        )
        transform = osr.CoordinateTransformation(source, crs)
        coastal = False
        for shift in (0, -360, 360):
            lo, hi = max(-180, lon - margin + shift), min(180, lon + margin + shift)
            if lo >= hi:
                continue
            top, bottom = lat + 0.36, lat - 0.36
            layer.SetSpatialFilterRect(lo, bottom, hi, top)
            box = ogr.CreateGeometryFromWkt(
                f"POLYGON (({lo} {bottom},{lo} {top},{hi} {top},{hi} {bottom},{lo} {bottom}))"
            )
            for feature in layer:
                clipped = feature.GetGeometryRef().Intersection(box)
                if clipped and not clipped.IsEmpty():
                    clipped.Transform(transform)
                    if clipped.Distance(origin) <= 25000:
                        coastal = True
                        break
            if coastal:
                break
        ann["coast"] = "Within 25 km of coast" if coastal else "Over 25 km from coast"


def wikidata_places(ids, cache):
    values = " ".join(json.dumps(v) for v in ids)
    query = (
        "SELECT DISTINCT ?id ?item ?article ?description WHERE { VALUES ?id { "
        + values
        + " } ?item wdt:P1566 ?id . ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>. "
        'OPTIONAL { ?item schema:description ?description. FILTER (lang(?description)="en") } }'
    )
    matches = defaultdict(set)
    for r in sparql(cache, query):
        matches[r["id"]["value"]].add(
            (
                r["item"]["value"].rsplit("/", 1)[-1],
                r["article"]["value"],
                r.get("description", {}).get("value", ""),
            )
        )
    return {k: next(iter(v)) for k, v in matches.items() if len(v) == 1}


def wiki_cards(matches, cache):
    with ThreadPoolExecutor(max_workers=2) as pool:
        ids = collect(
            pool, {r[0] for r in matches.values()}, 65, wikidata_places, cache
        )
        titles = {
            k: unquote(urlsplit(entry[1]).path.removeprefix("/wiki/")).replace("_", " ")
            for k, entry in ids.items()
        }
        articles = collect(pool, set(titles.values()), 30, article_info, cache)
        leads = {
            k: articles[t][1].replace("_", " ")
            for k, t in titles.items()
            if articles[t][0] == ids[k][0] and articles[t][1]
        }
        photos = collect(pool, set(leads.values()), 16, file_info, cache)
    out = {}
    for k, (qid, url, desc) in ids.items():
        if articles[titles[k]][0] != qid:
            continue
        cue = dict(description=desc)
        if k in leads and leads[k] in photos:
            cue["image"] = photos[leads[k]]
        out[k] = dict(wikipedia=url, recognition=cue)
    return out


def generate(geo, catalog, output):
    items = catalog["items"]
    annotations, matches = locations(geo, items)
    historical = json.loads((ROOT / "destination-links.json").read_text())
    # Historical mappings include locations that need manual disambiguation, such as the island of Milos.
    matches = {k: r for k, r in matches.items() if k not in historical}
    climate_and_coast(geo.resolve(), matches, annotations)
    print(
        "GeoNames matches",
        len(matches),
        "of",
        len(items),
        "before historical additions",
        flush=True,
    )
    links = {}
    for item in items:
        key = item["itemId"]
        if key in historical:
            links[key] = historical[key]
        else:
            label = item["title"]
            target = label
            ref = {}
            if key in matches:
                row = matches[key]
                target = row[4] + "," + row[5]
                ref.update(
                    openStreetMap="https://www.openstreetmap.org/?"
                    + urlencode({"mlat": row[4], "mlon": row[5]}),
                    sourceUrl="https://www.geonames.org/" + row[0] + "/",
                    label="GeoNames",
                )
            ref["googleMaps"] = "https://www.google.com/maps/search/?" + urlencode(
                {"api": 1, "query": target}
            )
            ref["appleMaps"] = "https://maps.apple.com/?" + urlencode(
                {"ll": target, "q": label} if key in matches else {"q": label}
            )
            links[key] = ref
    output.mkdir(parents=True, exist_ok=True)
    for item in items:
        item["annotations"].update(annotations[item["itemId"]])
    wiki = wiki_cards(matches, geo / "cache")
    for key, row in matches.items():
        links[key].update(wiki.get(row[0], {}))
    (output / "destinations.json").write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    (output / "destinations-links.json").write_text(
        json.dumps(links, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    print(
        "Articles",
        sum("wikipedia" in v for v in links.values()),
        "new sourced images",
        sum("image" in v.get("recognition", {}) for v in links.values()),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "geo",
        type=Path,
        help="Directory containing source tables and archives; used to cache API responses",
    )
    parser.add_argument(
        "catalog",
        type=Path,
        help="A preliminary destinations.json for the same source panel",
    )
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    generate(args.geo, json.loads(args.catalog.read_text()), args.output)
