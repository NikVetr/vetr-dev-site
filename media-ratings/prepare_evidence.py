"""Aggregate marginal and paired rating counts for the browser's evidence view."""
import argparse
import csv
import json
from collections import defaultdict
from itertools import combinations
from pathlib import Path


def aggregate(catalog, ratings_path, links_path=None):
    ids = [item["itemId"] for item in catalog["items"]]
    scale = catalog["scale"]
    index = {key: i for i, key in enumerate(ids)}
    levels = {float(value): i for i, value in enumerate(scale)}
    n = len(scale)
    users = defaultdict(dict)
    counts = [[0] * n for _ in ids]
    with ratings_path.open(newline="", encoding="utf-8-sig") as source:
        for row in csv.DictReader(source):
            key = row.get("movieId", row.get("itemId"))
            if key not in index:
                continue
            i, k = index[key], levels[float(row["rating"])]
            scores = users[row["userId"]]
            if i in scores:
                raise ValueError(f"Duplicate respondent/item rating for {key}")
            scores[i] = k
            counts[i][k] += 1
    if not all(map(sum, counts)):
        raise ValueError("Missing ratings for a catalog item")
    pairs = [[0] * (n*n) for _ in range(len(ids)*(len(ids)-1)//2)]
    for scores in users.values():
        for (i, a), (j, b) in combinations(sorted(scores.items()), 2):
            pairs[j*(j-1)//2+i][a*n+b] += 1
    data: dict[str, object] = dict(ids=ids, scale=scale, counts=counts, pairs=pairs)
    if links_path:
        with links_path.open(newline="", encoding="utf-8-sig") as source:
            data["imdb"] = {row["movieId"]: row["imdbId"] for row in csv.DictReader(source)
                            if row["movieId"] in index and row["imdbId"].isdigit()}
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ["catalog", "ratings", "output"]:
        parser.add_argument(arg, type=Path)
    parser.add_argument("--links", type=Path)
    args = parser.parse_args()
    result = aggregate(json.loads(args.catalog.read_text()), args.ratings, args.links)
    args.output.write_text(json.dumps(result, separators=(",", ":"))+"\n")
