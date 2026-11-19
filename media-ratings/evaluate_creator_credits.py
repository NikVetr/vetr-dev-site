"""Test shared creator credits on top of the personalized film default.

The locked grid and adoption criteria are in creator-credits.md. Reuse the
respondent splits, rating timestamps, title-choice model and scoring function
from evaluate_personalized.py. Portfolio-level credit information contains no
respondent scores. Its diagonal is zeroed in this evaluation because only
distinct-film similarities are augmented; the original ridge is preserved.
"""

import argparse
import csv
import json
from pathlib import Path

import numpy as np

from evaluate_date_cutoff import cutoff_data
from evaluate_dates import calendar_emissions, calendar_records
from evaluate_full import film_vectors, paired, read, summary
from evaluate_personalized import JOINT, evaluate, samples_for
from evaluate_selection import reveal_models

WEIGHTS = (0.0, 0.05, 0.15, 0.30)


def credit_kernel(items, credits):
    if set(credits) != {item["itemId"] for item in items}:
        raise ValueError("Creator annotations and catalog must cover the same films")
    names = [credits[it["itemId"]] for it in items]
    gram = np.zeros((len(items), len(items)))
    for role in ("directors", "cast", "studios"):
        index = {
            name: i
            for i, name in enumerate(sorted({n for row in names for n in row[role]}))
        }
        features = np.zeros((len(items), len(index)))
        for i, row in enumerate(names):
            labels = row[role]
            if labels:
                features[i, [index[n] for n in labels]] = 1 / np.sqrt(len(labels))
        gram += features @ features.T
    norm = np.sqrt(gram.diagonal())
    if np.any(norm == 0):
        raise ValueError("A bundled film has no usable creator credits")
    gram /= np.outer(norm, norm)
    np.fill_diagonal(gram, 0)
    return gram


def scores(profiles, annual, prior, title, kernel, creators, weights):
    return {
        w: evaluate(profiles, annual, prior, title, kernel + w * creators, [JOINT])[
            JOINT
        ]
        for w in weights
    }


def compare(scores):
    return [
        {
            **summary(f"Shared credits × {w:g}", values),
            "weight": w,
            "pairedLogLossVersusDefault": paired(values, scores[0.0]),
        }
        for w, values in scores.items()
    ]


def benchmark(root, archive, catalog, credits, cutoff_work):
    shelf = read(catalog)
    if shelf["defaultModel"] != "personalized":
        raise ValueError(
            "Expected title-choice and rating-year personalization as baseline"
        )
    items = shelf["items"]
    if list(read(root / "film-annotations.json")) != [it["itemId"] for it in items]:
        raise ValueError("Catalog and fitting matrix have different film orders")
    matrix = np.memmap(root / "ratings.u8", dtype="uint8", mode="r").reshape(
        -1, len(items)
    )
    users = np.loadtxt(
        root / "users.csv", delimiter=",", skiprows=1, usecols=0, dtype=int
    )
    with (root / "split.csv").open() as src:
        split = list(csv.DictReader(src))
    rows = np.array([int(r["row"]) for r in split])
    if len(set(rows)) != len(rows):
        raise ValueError("Overlapping evaluation respondents")
    train = np.setdiff1d(np.arange(len(matrix)), rows)
    fit = read(root / "large.json")
    counts, stamps = calendar_records(archive, items, users, rows, matrix)
    if fit["users"] != len(train) or fit["ratings"] != counts.sum():
        raise ValueError("Training data differ from the original split")
    prior, annual = calendar_emissions(fit, counts)
    title, _ = reveal_models(matrix, train, annual[0.0][0], np.exp(prior), items)
    rating, tags = film_vectors(
        read(root / "large-reference.json")["components"][0]["covariance"],
        np.load(root / "genome.npy"),
    )
    baseline = (rating @ rating.T + tags @ tags.T) / 2
    creator = credit_kernel(items, read(credits))
    years = np.array([it["annotations"]["year"] for it in items])
    popularity = np.argsort(-counts.sum(axis=(0, 2)), kind="stable")
    matrix = matrix[rows]
    val, test = [
        list(
            samples_for(
                "volunteered",
                matrix,
                stamps,
                np.array([i for i, r in enumerate(split) if r["partition"] == part]),
                seed,
                years,
                popularity,
            )
        )
        for part, seed in (("validation", 307), ("test", 308))
    ]
    validation = scores(val, annual, prior, title["title"], baseline, creator, WEIGHTS)
    best = min(WEIGHTS[1:], key=lambda w: validation[w][:, 0].mean())
    selected = min([0.0, best], key=lambda w: validation[w][:, 0].mean())
    tests = scores(test, annual, prior, title["title"], baseline, creator, [0.0, best])
    report: dict[str, object] = dict(
        trainingUsers=len(train),
        validationUsers=len(val),
        testUsers=len(test),
        given=4,
        testRatings=sum(len(p[2]) for p in test),
        selected=selected,
        bestPositiveWeight=best,
        validation=compare(validation),
        holdout=compare(tests),
    )
    if selected > 0 and tests[best][:, 0].mean() < tests[0.0][:, 0].mean():
        # Pre-existing chronological split, restricted to people new to the archive
        # in 2019. Its train-through-2017 kernel excludes the 2019 Tag Genome.
        _, p0, annual0, kernels, cohorts, _ = cutoff_data(
            root, archive, catalog, cutoff_work, reuse_fit=True
        )
        early = np.memmap(cutoff_work / "ratings.u8", dtype="uint8", mode="r").reshape(
            -1, len(items)
        )
        title0, _ = reveal_models(
            early, np.arange(len(early)), annual0[0.0][0], np.exp(p0), items
        )
        recent = [(*p, np.ones(4, dtype=bool)) for p in cohorts[1]]
        test2019 = scores(
            recent, annual0, p0, title0["title"], kernels[0.0], creator, [0.0, selected]
        )
        report["future2019"] = dict(
            testUsers=len(recent),
            testRatings=sum(len(p[2]) for p in recent),
            holdout=compare(test2019),
        )
    return report


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ("root", "archive", "catalog", "credits", "cutoff_work", "output"):
        p.add_argument(arg, type=Path)
    args = p.parse_args()
    result = benchmark(
        args.root, args.archive, args.catalog, args.credits, args.cutoff_work
    )
    args.output.write_text(json.dumps(result, indent=2) + "\n")
