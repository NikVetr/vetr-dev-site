"""Package the all-respondent fit with film metadata and the independent evaluation summary."""

import argparse
import ast
import csv
import io
import json
import re
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from evaluate_full import film_vectors
from evaluate_selection import reveal_models


def title_choice_model(root, data):
    items = data["items"]
    if [item["itemId"] for item in items] != list(
        json.loads((root / "film-annotations.json").read_text())
    ):
        raise ValueError("Film IDs do not match the training matrix column order")
    matrix = np.memmap(root / "ratings.u8", dtype="uint8", mode="r").reshape(
        -1, len(items)
    )
    if (
        len(matrix) != data["fit"]["users"]
        or np.count_nonzero(matrix) != data["fit"]["ratings"]
    ):
        raise ValueError("Rating matrix and packaged fit counts disagree")
    components = data["models"]["latentClass"]["components"]
    ratios, eligible = reveal_models(
        matrix,
        np.arange(len(matrix)),
        np.array([c["probabilities"] for c in components]),
        np.array([c["weight"] for c in components]),
        items,
    )
    return {
        "kind": "class-similarity",
        "base": "latentClass",
        "similarityFrom": "ratingsTags",
        "titleChoice": {
            "strength": 0.5,
            "logRatios": ratios["title"].tolist(),
            "trainingUsers": eligible,
        },
    }


def package(root, archive, catalog, report):
    data = json.loads(catalog.read_text())
    annotations = json.loads((root / "film-annotations.json").read_text())
    with ZipFile(archive) as z, z.open("ml-25m/links.csv") as src:
        imdb = {
            r["movieId"]: "tt" + r["imdbId"]
            for r in csv.DictReader(io.TextIOWrapper(src))
        }
    groups = defaultdict(dict)
    membership = {}
    with (root / "movies_metadata.csv").open() as src:
        for row in csv.DictReader(src):
            if not row["belongs_to_collection"] or not row["imdb_id"].startswith("tt"):
                continue
            collection = ast.literal_eval(row["belongs_to_collection"])
            if row["release_date"]:
                groups[collection["id"]][row["imdb_id"]] = row["release_date"]
            membership[row["imdb_id"]] = collection
    certificates = {}
    with (root / "content-ratings.csv").open() as src:
        for row in csv.DictReader(src):
            mid = re.search(r"/title/(tt[0-9]+)", row["movie_imdb_link"])
            if mid and row["content_rating"]:
                certificates[mid[1]] = row["content_rating"]
    for it in data["items"]:
        a = annotations[it["itemId"]]
        mid = imdb[it["itemId"]]
        if mid in certificates:
            a["certificate"] = certificates[mid]
        if mid in membership:
            group = membership[mid]
            a["collection"] = group["name"]
            dates = groups[group["id"]]
            if mid in dates:
                a["releaseOrder"] = 1 + sum(d < dates[mid] for d in dates.values())
        it["annotations"] = a
    fitted = json.loads((root / "release.json").read_text())
    data["models"]["latentClass"] = fitted["model"]
    data["models"]["reference"] = json.loads(
        (root / "release-reference.json").read_text()
    )
    data["fit"].update(
        users=fitted["users"],
        ratings=fitted["ratings"],
        iterations=fitted["model"]["iterations"],
    )
    data["selection"]["full"] = json.loads(report.read_text())
    if data["selection"]["full"]["selected"] != "ratings+tags × 0.5":
        raise ValueError("The selection report does not match the approved film model")
    ratings, tags = film_vectors(
        data["models"]["reference"]["components"][0]["covariance"],
        np.load(root / "genome.npy"),
    )
    # A row dot product is the mean of the two cosine similarities.
    features = np.concatenate((ratings, tags), axis=1) / np.sqrt(2)
    data["models"]["ratingsTags"] = {
        "kind": "class-similarity",
        "base": "latentClass",
        "features": features.tolist(),
        "ridge": 0.5,
        "strength": 0.5,
    }
    data["models"]["titleChoice"] = title_choice_model(root, data)
    data["defaultModel"] = "ratingsTags"
    catalog.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ("root", "archive", "catalog", "report"):
        p.add_argument(arg, type=Path)
    args = p.parse_args()
    package(args.root, args.archive, args.catalog, args.report)
