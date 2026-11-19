"""Evaluate whether question ordering recovers the identities of a respondent's other recorded films."""

import argparse
import csv
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from evaluate_full import film_vectors, profiles, read


def evaluate(root, catalog_path, credits_path, output):
    items = read(catalog_path)["items"]
    ids = [it["itemId"] for it in items]
    if list(read(root / "film-annotations.json")) != ids:
        raise ValueError("Film order differs from the fitted training matrix")
    matrix = np.memmap(root / "ratings.u8", mode="r", dtype="uint8").reshape(
        -1, len(items)
    )
    with (root / "split.csv").open() as source:
        partitions = list(csv.DictReader(source))
    rows = {
        p: [int(r["row"]) for r in partitions if r["partition"] == p]
        for p in ("validation", "test")
    }
    excluded = rows["validation"] + rows["test"]
    if len(excluded) != len(set(excluded)):
        raise ValueError("Respondent holdouts must be disjoint")
    training = np.setdiff1d(np.arange(len(matrix)), excluded)
    counts = (matrix[training] > 0).sum(axis=0)
    if counts.sum() != read(root / "large.json")["ratings"]:
        raise ValueError("Training counts disagree with the train-only fit")
    credits = read(credits_path)
    for it, count in zip(items, counts, strict=True):
        it["annotations"].update(credits[it["itemId"]], ratingCount=int(count))
    covariance = read(root / "large-reference.json")["components"][0]["covariance"]
    rating, tags = film_vectors(covariance, np.load(root / "genome.npy"))
    catalog = {
        "items": items,
        "models": {
            "hybrid": {
                "kind": "class-similarity",
                "features": np.column_stack((rating, tags)).tolist(),
            }
        },
        "scale": list(np.arange(1, 11) / 2),
    }
    samples = {}
    for split, seed in (("validation", 307), ("test", 308)):
        samples[split] = [
            {"given": [ids[i] for i in given], "recorded": [ids[i] for i in targets]}
            for given, _, targets, _ in profiles(matrix, rows[split], seed)
        ]
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "questions.json"
        path.write_text(
            json.dumps(
                {"catalog": catalog, "trainingRespondents": len(training), **samples},
                separators=(",", ":"),
            )
        )
        subprocess.run(
            [
                "node",
                str(Path(__file__).with_name("score_familiarity.mjs")),
                str(path),
                str(output),
            ],
            check=True,
        )


if __name__ == "__main__":
    args = argparse.ArgumentParser(description=__doc__)
    for key in ("root", "catalog", "credits", "output"):
        args.add_argument(key, type=Path)
    opts = args.parse_args()
    evaluate(opts.root, opts.catalog, opts.credits, opts.output)
