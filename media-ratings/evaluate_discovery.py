"""Evaluate which other catalog games a held-out Steam player reviewed.

All training ratings and co-review statistics exclude the original fifth of
players reserved for testing. Split eligible people in that fifth into separate
validation and final test samples, with four randomly supplied reviews each.
The candidate inventory is the full catalog minus the four inputs. Unobserved
games are never given a negative vote. See discovery-study.md for the protocol.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.special import expit, logit, softmax
from scipy.stats import rankdata

from fit_games import content_vectors, fit_classes, similarity_features
from game_pooling import approval_prior, class_prior, votes
from prepare_steam_discovery import co_reviews, load


def approval(given, values, weights, emissions, kernel):
    terms = np.log(emissions[:, given, values])
    joint = np.log(weights) + terms.sum(axis=1)
    base = softmax(joint) @ emissions[:, :, 1]
    residual = values - (
        softmax(joint[:, None] - terms, axis=0) * emissions[:, given, 1]
    ).sum(axis=0)
    beta = np.linalg.solve(
        kernel[np.ix_(given, given)] + 0.5 * np.eye(len(given)), residual
    )
    return expit(logit(base) + kernel[:, given] @ beta)


def interval(values):
    values = values[np.isfinite(values)]
    mean = values.mean()
    width = 1.96 * values.std(ddof=1) / np.sqrt(len(values))
    return dict(difference=mean, ci95=[mean - width, mean + width])


def score(cohort, matrix, model, popular, bumps, seed, rules):
    rng = np.random.default_rng(seed)
    weights, emissions, kernel = model
    results = {}
    for i in cohort:
        begin, end = matrix.indptr[i : i + 2]
        items, votes = matrix.indices[begin:end], matrix.data[begin:end] - 1
        reveal = rng.permutation(len(items))
        given, values = items[reveal[:4]], votes[reveal[:4]]
        hidden, truth = items[reveal[4:]], votes[reveal[4:]]
        raw = approval(given, values, weights, emissions, kernel)
        # Literal scorer tie break: preserve the raw forecast ordering and use
        # the catalog order for identical predicted scores.
        order = np.argsort(-raw, kind="stable")
        ids = order[~np.isin(order, given)]
        relevance = rankdata(raw[ids])
        pop = popular[ids]
        rankings = {
            "approval": ids[:20],
            "popularity": ids[np.argsort(-pop, kind="stable")[:20]],
        }
        for rule in rules:
            anchors = given if rule == "all" else given[values == 1]
            near = (
                bumps[anchors].mean(axis=0)[ids] if len(anchors) else np.zeros(len(ids))
            )
            affinity = rankdata(pop + near) if near.any() else relevance
            for w in (0.25, 0.5, 0.75, 1.0):
                mix = (1 - w) * relevance + w * affinity
                rankings[f"{rule} {w:g}"] = ids[np.argsort(-mix, kind="stable")[:20]]
        positives = hidden[truth == 1]
        for name, titles in rankings.items():
            hits = np.isin(hidden, titles)
            positive_hits = (hits & (truth == 1)).sum()
            results.setdefault(name, []).append(
                [
                    hits.mean(),
                    positive_hits / len(positives) if len(positives) else np.nan,
                    raw[titles].mean(),
                    hits.any(),
                    hits.sum(),
                    positive_hits,
                ]
            )
    return {name: np.asarray(rows) for name, rows in results.items()}


def summarize(results):
    return {
        name: dict(
            recallAt20=float(rows[:, 0].mean()),
            positiveRecallAt20=float(np.nanmean(rows[:, 1])),
            modelApprovalAt20=float(rows[:, 2].mean()),
            hitRateAt20=float(rows[:, 3].mean()),
            retrievedReviews=int(rows[:, 4].sum()),
            retrievedPositiveReviews=int(rows[:, 5].sum()),
        )
        for name, rows in results.items()
    }


def benchmark(raw, fit_path, pooled_path):
    matrix, items = load(raw)
    seed = 42
    rng = np.random.default_rng(seed)
    order = rng.permutation(matrix.shape[0])
    held, dev = np.split(order, [len(order) // 5])
    include = np.zeros(len(order), dtype=bool)
    include[dev] = True
    eligible = held[np.diff(matrix.indptr)[held] >= 5]
    validation, test, confirmation = (
        eligible[:4000],
        eligible[4000:12000],
        eligible[12000:20000],
    )
    if len(confirmation) != 8000:
        raise ValueError(
            "Expected original full Steam split and adequate held-out viewers"
        )
    sidecar = co_reviews(matrix, items, include)
    popular = np.asarray(sidecar["counts"]) / sum(sidecar["counts"])
    bumps = np.zeros((len(items), len(items)))
    for i, row in enumerate(sidecar["excess"]):
        bumps[i, row[::2]] = np.asarray(row[1::2]) / sidecar["units"]
    if fit_path:
        with np.load(fit_path) as fit:
            weights, emissions, features = (
                fit["weights"],
                fit["emissions"],
                fit["features"],
            )
    else:
        train = matrix[dev]
        weights, emissions, _ = fit_classes(train, 16, seed)
        features = similarity_features(train, content_vectors(items))[
            "reviewsAndMetadata"
        ]
    if emissions.shape != (16, len(items), 2) or features.shape != (len(items), 64):
        raise ValueError(
            "Expected the original train-only Steam 16-class approval fit and 64 features"
        )
    model = weights, emissions, features @ features.T
    valid = score(validation, matrix, model, popular, bumps, 2601, ["all", "favorable"])
    # Only validation chooses the anchor rule and the approval-constrained mix.
    selected = max(["all", "favorable"], key=lambda r: valid[f"{r} 1"][:, 0].mean())
    options = {
        0.0: "approval",
        **{w: f"{selected} {w:g}" for w in (0.25, 0.5, 0.75, 1.0)},
    }
    passing = [w for w, name in options.items() if valid[name][:, 2].mean() >= 0.95]
    default = max(passing, key=lambda w: np.nanmean(valid[options[w]][:, 1]))
    final = score(test, matrix, model, popular, bumps, 2602, [selected])
    # The approval floor was requested after the exploratory test was reported.
    # This independent confirmation cohort was never used to design or tune the rule.
    confirm = score(confirmation, matrix, model, popular, bumps, 2603, [selected])
    chosen = options[default]
    # The approval model's independently validated prior changed during this
    # study. Check the already-locked recommendation rule under the released fit.
    if pooled_path:
        with np.load(pooled_path) as fit:
            pooled = (
                fit["weights"],
                fit["emissions"],
                fit["features"] @ fit["features"].T,
            )
    else:
        train = matrix[dev]
        counts = votes(train)
        prior = class_prior(counts, approval_prior(counts), 0.25)
        weights, emissions, _ = fit_classes(train, 16, seed, item_prior=prior)
        pooled = weights, emissions, model[2]
    current_validation = score(
        validation, matrix, pooled, popular, bumps, 2601, [selected]
    )
    current_test = score(confirmation, matrix, pooled, popular, bumps, 2603, [selected])
    return dict(
        trainingPlayers=len(dev),
        validationPlayers=len(validation),
        testPlayers=len(test),
        catalogGames=len(items),
        given=4,
        cutoff=20,
        selectedAnchors=selected,
        defaultMix=default,
        selection=dict(
            minimumMeanModelApproval=0.95,
            eligibleMixes=passing,
            criterion="highest validation positive-review recall at 20",
        ),
        confirmationPlayers=len(confirmation),
        confirmation=summarize(
            {k: confirm[k] for k in ("approval", "popularity", chosen, options[1.0])}
        ),
        confirmedDefaultMinus={
            b: dict(
                recallAt20=interval(confirm[chosen][:, 0] - confirm[b][:, 0]),
                positiveRecallAt20=interval(confirm[chosen][:, 1] - confirm[b][:, 1]),
            )
            for b in ("approval", "popularity")
        },
        hierarchicalApproval=dict(
            classPriorStrength=0.25,
            validation=summarize(current_validation),
            confirmation=summarize(
                {
                    k: current_test[k]
                    for k in ("approval", "popularity", chosen, options[1.0])
                }
            ),
            confirmedDefaultMinus={
                b: dict(
                    recallAt20=interval(
                        current_test[chosen][:, 0] - current_test[b][:, 0]
                    ),
                    positiveRecallAt20=interval(
                        current_test[chosen][:, 1] - current_test[b][:, 1]
                    ),
                )
                for b in ("approval", "popularity")
            },
        ),
        validation=summarize(valid),
        test=summarize(final),
        paired={
            f"{a} minus {b}": dict(
                recallAt20=interval(final[a][:, 0] - final[b][:, 0]),
                positiveRecallAt20=interval(final[a][:, 1] - final[b][:, 1]),
            )
            for a in (f"{selected} 1", f"{selected} 0.5")
            for b in ("approval", "popularity")
        },
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("raw", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument(
        "--fit",
        type=Path,
        help="Optional exact train-only weights, emissions, features from fit_games.py",
    )
    p.add_argument(
        "--pooled-fit",
        type=Path,
        help="Optional exact train-only fit with released hierarchical prior",
    )
    a = p.parse_args()
    a.output.write_text(
        json.dumps(benchmark(a.raw, a.fit, a.pooled_fit), indent=2, allow_nan=False)
        + "\n"
    )
