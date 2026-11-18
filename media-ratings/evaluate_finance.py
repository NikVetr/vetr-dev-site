"""Compare finance similarity against the published ratings-and-tags kernel.

After prepare_film_context.py and the train-only fits used by evaluate_full.py:
    OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/evaluate_finance.py \
        tmp/agent/media-full media-ratings/expanded.json media-ratings/film-context.json \
        media-ratings/validation/finance.json

Prespecified comparison: keep the eight taste classes, rating/tag factors,
four revealed stars, regularization, and tilt from evaluate_full.py. Add equal
parts budget and reported box-office similarity. Each is a Gaussian kernel on
log nominal dollars with the catalog's observed log standard deviation as
bandwidth, centered and cosine-normalized among films with the field. A film
with a missing field gets zero finance similarity in that feature. Mix finance
with the validated rating/tag kernel at weights 0, 0.10, 0.25, or 0.50,
returning missing features' weight to the existing kernel. Select by lowest
validation respondent-mean log loss, preferring the smaller weight on ties.
Compare the selected model and best nonzero validation candidate with baseline
on the previously established held-out respondents. The test set is reused from
prior architecture experiments; no finance weights are chosen on its results.
Rating count is descriptive and is never used as a prediction feature.
"""

import argparse
import csv
import json
from pathlib import Path

import numpy as np

from evaluate_full import evaluate, film_vectors, paired, profiles, read, summary


WEIGHTS = (0.0, 0.1, 0.25, 0.5)


def amount_kernel(values):
    values = np.asarray(values, dtype=float)
    known = np.isfinite(values)
    if np.count_nonzero(known) < 2 or (values[known] <= 0).any():
        raise ValueError("Need at least two positive observed amounts")
    logged = np.log(values[known])
    bandwidth = logged.std()
    if bandwidth == 0:
        raise ValueError("Cannot build a kernel from constant amounts")
    distance = (logged[:, None] - logged) / bandwidth
    affinities = np.exp(-0.5 * distance**2)
    means = affinities.mean(axis=0)
    centered = affinities - means[:, None] - means[None, :] + means.mean()
    norms = np.sqrt(centered.diagonal())
    kernel = np.zeros((len(values), len(values)))
    kernel[np.ix_(known, known)] = centered / np.outer(norms, norms)
    return kernel


def benchmark(root: Path, catalog: Path, context: Path, output: Path) -> None:
    ids = [it["itemId"] for it in read(catalog)["items"]]
    metadata = read(context)
    if set(ids) != set(metadata):
        raise ValueError("Finance metadata does not cover the benchmark catalog")
    fields = ("budget", "revenue")
    finance = sum(
        amount_kernel([metadata[i].get(field, np.nan) for i in ids]) for field in fields
    ) / len(fields)
    covariance = read(root / "large-reference.json")["components"][0]["covariance"]
    ratings, tags = film_vectors(covariance, np.load(root / "genome.npy"))
    baseline = (ratings @ ratings.T + tags @ tags.T) / 2
    candidates = {}
    for weight in WEIGHTS:
        # The two row scalings preserve positive semidefiniteness with missing data.
        scale = np.sqrt(1 - weight * np.diag(finance))
        mixed = baseline * np.outer(scale, scale) + weight * finance
        name = f"finance {weight:.0%}"
        candidates[name] = (name, mixed, 0.5)

    matrix = np.memmap(root / "ratings.u8", dtype=np.uint8, mode="r").reshape(
        -1, len(ids)
    )
    with (root / "split.csv").open() as src:
        split = list(csv.DictReader(src))
    if len({entry["row"] for entry in split}) != len(split):
        raise ValueError("Expected disjoint validation and test respondents")
    val, test = [
        list(
            profiles(
                matrix,
                [int(row["row"]) for row in split if row["partition"] == part],
                seed,
            )
        )
        for part, seed in (("validation", 307), ("test", 308))
    ]
    train = read(root / "large.json")
    if train["users"] + len(val) + len(test) != len(matrix):
        raise ValueError(
            "Training and evaluation user counts disagree with the full matrix"
        )
    validation = evaluate(train["model"], val, candidates)
    baseline_name, *challengers = candidates
    finalist = min(challengers, key=lambda name: validation[name][:, 0].mean())
    selected = min(
        [baseline_name, finalist], key=lambda name: validation[name][:, 0].mean()
    )
    tests = evaluate(
        train["model"], test, {k: candidates[k] for k in (baseline_name, finalist)}
    )
    report = dict(
        given=4,
        trainingUsers=train["users"],
        validationUsers=len(val),
        testUsers=len(test),
        testRatings=sum(len(targets) for _, _, targets, _ in test),
        fields=list(fields),
        coverage={
            field: sum(field in row for row in metadata.values()) for field in fields
        },
        baseline=baseline_name,
        selected=selected,
        bestPositiveWeight=finalist,
        validation=[summary(name, validation[name]) for name in candidates],
        holdout=[summary(name, tests[name]) for name in (baseline_name, finalist)],
        finalistMinusBaselineLogLoss=paired(tests[finalist], tests[baseline_name]),
    )
    output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("root", "catalog", "context", "output"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    benchmark(args.root, args.catalog, args.context, args.output)
