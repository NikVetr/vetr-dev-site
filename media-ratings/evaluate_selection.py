"""Test how supplied title identities and residual rating generosity affect four-rating forecasts.

Run after prepare_full.py, fit_full.R and full_reference.R with one BLAS thread.
The evaluation uses the same recorded targets and respondent splits as evaluate_full.py.
Only the identities of the four supplied films enter the experimental reveal likelihood.
"""

import argparse
import csv
import json
from itertools import product
from pathlib import Path

import numpy as np

from evaluate_full import SCALE, film_vectors, paired, profiles, read, summary


def softmax(scores, axis):
    weights = np.exp(scores - scores.max(axis=axis, keepdims=True))
    return weights / weights.sum(axis=axis, keepdims=True)


def reveal_models(matrix, training, emissions, prior, items):
    """Estimate which title a random eligible training user's recorded rating describes."""
    log_emissions = np.log(emissions)
    counts = np.zeros(emissions.shape[:2])
    for start in range(0, len(training), 1024):
        block = matrix[training[start : start + 1024]]
        block = block[(block != 0).sum(axis=1) >= 5]
        if not len(block):
            continue
        u, j = np.nonzero(block)
        stars = block[u, j] - 1
        logw = np.column_stack(
            [
                np.bincount(u, weights=log_emissions[k, j, stars], minlength=len(block))
                for k in range(len(prior))
            ]
        )
        post = softmax(logw + np.log(prior), 1)
        per_rating = post / np.bincount(u, minlength=len(block))[:, None]
        for k in range(len(prior)):
            counts[k] += np.bincount(j, weights=per_rating[u, k], minlength=len(items))
    pooled = counts.sum(axis=0) / counts.sum()
    if (pooled <= 0).any():
        raise ValueError("Each title needs training observations")
    # Eight pseudo-respondents per class share the pooled title-choice distribution.
    title = (counts + 8 * pooled) / (counts.sum(axis=1, keepdims=True) + 8)
    genres = sorted({g for it in items for g in it["annotations"]["genres"]})
    membership = np.array(
        [[g in it["annotations"]["genres"] for g in genres] for it in items],
        dtype=float,
    )
    if not membership.any(axis=1).all():
        raise ValueError("Expected a genre for every catalog title")
    membership /= membership.sum(axis=1, keepdims=True)
    genre_ratio = ((title @ membership) / (pooled @ membership)) @ membership.T
    genre_title = pooled * genre_ratio
    genre_title /= genre_title.sum(axis=1, keepdims=True)
    return {
        "stars": np.zeros_like(title),
        "title": np.log(title / pooled),
        "genre": np.log(genre_title / pooled),
    }, round(float(counts.sum()))


def evaluate(samples, emissions, prior, reveal, kernel, candidates):
    means = emissions @ SCALE
    scores = {candidate: [] for candidate in candidates}
    reveal_options = dict.fromkeys((mode, strength) for mode, strength, _ in candidates)
    for given, values, targets, truth in samples:
        kg = kernel[np.ix_(given, given)] + 0.5 * np.eye(len(given))
        kt = kernel[np.ix_(targets, given)]
        # GLS estimate of one shared residual offset, penalized toward zero.
        inv_ones = np.linalg.solve(kg, np.ones(len(given)))
        star_evidence = np.log(emissions[:, given, values])
        for mode, strength in reveal_options:
            evidence = star_evidence + strength * reveal[mode][:, given]
            logw = np.log(prior) + evidence.sum(axis=1)
            base = np.einsum("k,kjl->jl", softmax(logw, 0), emissions[:, targets])
            loo = softmax(logw[:, None] - evidence, 0)
            residual = SCALE[values] - (loo * means[:, given]).sum(axis=0)
            coeff = np.linalg.solve(kg, residual)
            for candidate in candidates:
                if candidate[:2] != (mode, strength):
                    continue
                variance = candidate[2]
                offset = variance * coeff.sum() / (1 + variance * inv_ones.sum())
                signal = offset + kt @ (coeff - offset * inv_ones)
                tilt = np.clip(0.5 * signal[:, None] * (SCALE - 2.75), -50, 50)
                p = base * np.exp(tilt)
                p /= p.sum(axis=1, keepdims=True)
                scores[candidate].append(
                    [
                        -np.log(p[np.arange(len(truth)), truth]).mean(),
                        np.mean((p @ SCALE - SCALE[truth]) ** 2),
                        np.mean((p[:, 7:].sum(axis=1) - (SCALE[truth] >= 4)) ** 2),
                    ]
                )
    return {candidate: np.array(values) for candidate, values in scores.items()}


def extremity_sensitivity(matrix, training, items):
    """Illustrate chosen observation mechanisms; their strengths cannot be fit here."""
    result = []
    for j, item in enumerate(items):
        if item["itemId"] not in {"2571", "5618"}:
            continue
        counts = np.bincount(matrix[training, j], minlength=11)[1:]
        distance = (np.abs(SCALE - 2.75) - 0.25) / 2
        for ratio in (1, 2, 4):
            mass = counts / ratio**distance
            mass /= mass.sum()
            result.append(
                {
                    "title": item["title"],
                    "recorded": int(counts.sum()),
                    "endpointToMiddleRecordingRatio": ratio,
                    "mean": float(mass @ SCALE),
                    "chanceAtLeastFour": float(mass[7:].sum()),
                }
            )
    return result


def benchmark(root: Path, catalog: Path, output: Path) -> None:
    items = read(catalog)["items"]
    matrix = np.memmap(root / "ratings.u8", dtype="uint8", mode="r").reshape(
        -1, len(items)
    )
    with (root / "split.csv").open() as f:
        split = list(csv.DictReader(f))
    excluded = [int(row["row"]) for row in split]
    if len(excluded) != len(set(excluded)) or set(r["partition"] for r in split) != {
        "validation",
        "test",
    }:
        raise ValueError("Expected distinct validation and test users")
    training = np.setdiff1d(np.arange(len(matrix)), excluded)
    fit = read(root / "large.json")
    if fit["users"] != len(training):
        raise ValueError("Training split and fitted class model disagree")
    comps = fit["model"]["components"]
    emissions = np.array([c["probabilities"] for c in comps])
    prior = np.array([c["weight"] for c in comps])
    covariance = read(root / "large-reference.json")["components"][0]["covariance"]
    ratings, tags = film_vectors(covariance, np.load(root / "genome.npy"))
    kernel = (ratings @ ratings.T + tags @ tags.T) / 2
    reveal, eligible = reveal_models(matrix, training, emissions, prior, items)
    val, test = [
        list(
            profiles(
                matrix, [int(r["row"]) for r in split if r["partition"] == part], seed
            )
        )
        for part, seed in [("validation", 307), ("test", 308)]
    ]
    baseline = ("stars", 0.0, 0.0)
    candidates = [
        (mode, strength, variance)
        for mode, strength in [
            ("stars", 0.0),
            *product(("genre", "title"), (0.25, 0.5, 1.0)),
        ]
        for variance in (0.0, 0.25, 1.0)
    ]
    validation = evaluate(val, emissions, prior, reveal, kernel, candidates)

    def best(options):
        return min(options, key=lambda opt: validation[opt][:, 0].mean())

    winners = {
        "baseline": baseline,
        "offsetOnly": best([c for c in candidates if c[0] == "stars" and c[2] > 0]),
        "genreOnly": best([c for c in candidates if c[0] == "genre" and c[2] == 0]),
        "titleOnly": best([c for c in candidates if c[0] == "title" and c[2] == 0]),
        "combined": best([c for c in candidates if c[0] != "stars" and c[2] > 0]),
        "selected": best(candidates),
    }
    test_scores = evaluate(
        test, emissions, prior, reveal, kernel, list(dict.fromkeys(winners.values()))
    )

    def entry(candidate, values):
        return {
            "reveal": candidate[0],
            "revealStrength": candidate[1],
            "offsetVariance": candidate[2],
            **summary(candidate[0], values),
        }

    report = {
        "given": 4,
        "trainingUsers": len(training),
        "eligibleRevealTrainingUsers": eligible,
        "validationUsers": len(val),
        "testUsers": len(test),
        "testRatings": sum(len(t[2]) for t in test),
        "criterion": "respondent-mean category log loss",
        "validation": [entry(c, validation[c]) for c in candidates],
        "holdout": {
            name: {
                **entry(c, test_scores[c]),
                "pairedLogLossVersusBaseline": paired(
                    test_scores[c], test_scores[baseline]
                ),
            }
            for name, c in winners.items()
        },
        "extremitySensitivity": extremity_sensitivity(matrix, training, items),
    }
    output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("root", "catalog", "output"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    benchmark(args.root, args.catalog, args.output)
