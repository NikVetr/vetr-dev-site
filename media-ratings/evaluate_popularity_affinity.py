"""Test popularity matching on the locked 75% Steam discovery ranking.

See discovery-study.md for the centering, selection and fresh test protocol.
The optional fit cache holds the released-prior model trained on development
players only. Without a cache the same fit is reconstructed from source.
"""

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.stats import rankdata

from evaluate_discovery import discovery_cases, interval, retrieval_metrics, summarize
from fit_games import content_vectors, fit_classes, similarity_features
from game_pooling import approval_prior, class_prior, votes
from prepare_steam_discovery import co_reviews, load

WEIGHTS = (0.0, 0.25, 0.5, 1.0)
MIX = 0.75


def measure(rows, matrix, model, share, excess, z, high, weights, seed, guard=False):
    metrics = {w: [] for w in weights}
    if guard:
        metrics.update({"approval": [], "popularity": []})
    concentrated, hidden_shares = [], []
    for given, _, hidden, truth, raw, ids, relevance in discovery_cases(
        rows, matrix, model, seed
    ):
        near = excess[given].mean(axis=0)[ids]
        affinity = share[ids] + near
        only_popular = high[given].all()
        preference = 0 if guard and only_popular else z[given].mean() / 2
        concentrated.append(only_popular)
        hidden_shares.append(high[hidden].mean())
        if guard:
            popular = ids[np.argsort(-share[ids], kind="stable")[:20]]
            metrics["approval"].append(retrieval_metrics(ids[:20], hidden, truth, raw))
            metrics["popularity"].append(retrieval_metrics(popular, hidden, truth, raw))
        for w in weights:
            context = (
                rankdata(affinity * np.exp(w * preference * z[ids]))
                if near.any()
                else relevance
            )
            mix = (1 - MIX) * relevance + MIX * context
            top = ids[np.argsort(-mix, kind="stable")[:20]]
            metrics[w].append(retrieval_metrics(top, hidden, truth, raw))
    return (
        {w: np.array(values) for w, values in metrics.items()},
        np.array(concentrated),
        np.array(hidden_shares),
    )


def report(results, mask, hidden_shares, finalist):
    metrics = {w: rows[mask] for w, rows in results.items()}
    delta = metrics[finalist] - metrics[0.0]
    return dict(
        players=int(mask.sum()),
        playersWithPositiveTargets=int(np.isfinite(delta[:, 1]).sum()),
        fractionHiddenInPopularDecile=float(hidden_shares[mask].mean()),
        scores=summarize(metrics),
        finalistMinusReleased=dict(
            recallAt20=interval(delta[:, 0]), positiveRecallAt20=interval(delta[:, 1])
        ),
    )


def meets_threshold(results, selected):
    delta = interval(results[selected][:, 1] - results[0.0][:, 1])
    return bool(selected > 0 and delta["difference"] >= 0.005 and delta["ci95"][0] > 0)


def benchmark(raw, report_path, fit_path):
    matrix, items = load(raw)
    order = np.random.default_rng(42).permutation(matrix.shape[0])
    held, dev = np.split(order, [len(order) // 5])
    eligible = held[np.diff(matrix.indptr)[held] >= 5]
    validation, test, confirmation = (
        eligible[:4000],
        eligible[20000:28000],
        eligible[28000:36000],
    )
    if len(confirmation) != 8000:
        raise ValueError(
            "Expected the full Steam inventory and separate validation/test players"
        )
    train_mask = np.zeros(len(order), dtype=bool)
    train_mask[dev] = True
    co_review = co_reviews(matrix, items, train_mask)
    counts = np.array(co_review["counts"])
    share = counts / counts.sum()
    z = np.log(counts) - np.average(np.log(counts), weights=counts)
    z /= np.sqrt(np.average(z * z, weights=counts))
    decile_size = int(np.ceil(len(items) / 10))
    high = np.zeros(len(items), dtype=bool)
    high[np.argsort(-counts, kind="stable")[:decile_size]] = True
    excess = np.zeros((len(items), len(items)))
    for i, row in enumerate(co_review["excess"]):
        excess[i, row[::2]] = np.array(row[1::2]) / co_review["units"]
    if fit_path:
        with np.load(fit_path) as cache:
            weights, emissions, features = (
                cache["weights"],
                cache["emissions"],
                cache["features"],
            )
    else:
        train = matrix[dev]
        ratings = votes(train)
        prior = class_prior(ratings, approval_prior(ratings), 0.25)
        weights, emissions, _ = fit_classes(train, 16, 42, item_prior=prior)
        features = similarity_features(train, content_vectors(items))[
            "reviewsAndMetadata"
        ]
    model = weights, emissions, features @ features.T
    valid, high_val, hidden_val = measure(
        validation, matrix, model, share, excess, z, high, WEIGHTS, 2601
    )
    baseline = json.loads(report_path.read_text())["hierarchicalApproval"][
        "validation"
    ]["all 0.75"]
    replicated = summarize({0: valid[0.0]})[0]
    if any(
        abs(replicated[m] - baseline[m]) > 1.0e-10
        for m in ("positiveRecallAt20", "recallAt20", "modelApprovalAt20")
    ):
        raise ValueError("Baseline does not reproduce the published validation metrics")
    qualified = [w for w in WEIGHTS if w and valid[w][:, 2].mean() >= 0.95]
    finalist = (
        max(qualified, key=lambda w: np.nanmean(valid[w][:, 1])) if qualified else 0.0
    )
    selected = max((0.0, finalist), key=lambda w: np.nanmean(valid[w][:, 1]))
    tested, high_test, hidden_test = measure(
        test,
        matrix,
        model,
        share,
        excess,
        z,
        high,
        tuple(dict.fromkeys((0.0, finalist))),
        2604,
    )
    overall = report(tested, np.ones(len(test), dtype=bool), hidden_test, finalist)
    # This protection was set after inspecting the first test cohort.
    # Only the following fresh players evaluate the resulting rule.
    guarded, high_confirm, hidden_confirm = measure(
        confirmation,
        matrix,
        model,
        share,
        excess,
        z,
        high,
        (0.0, 1.0),
        2605,
        guard=True,
    )
    if not np.array_equal(
        guarded[0.0][high_confirm], guarded[1.0][high_confirm], equal_nan=True
    ):
        raise ValueError(
            "Guard changed a ranking among players with four popular choices"
        )
    return dict(
        trainingPlayers=len(dev),
        given=4,
        cutoff=20,
        contextWeight=MIX,
        popularityDefinition=dict(
            topGames=decile_size, lowestTrainingCount=int(counts[high].min())
        ),
        eligibleNonzeroStrengths=qualified,
        finalist=finalist,
        validationWinner=selected,
        metOverallThreshold=meets_threshold(tested, selected),
        scoresHigherIsBetter=True,
        validation=report(
            valid, np.ones(len(validation), dtype=bool), hidden_val, finalist
        ),
        validationFourPopular=report(valid, high_val, hidden_val, finalist),
        test=overall,
        testFourPopular=report(tested, high_test, hidden_test, finalist),
        guardedConfirmation=report(
            guarded, np.ones(len(confirmation), dtype=bool), hidden_confirm, 1.0
        ),
        guardedConfirmationFourPopular=report(
            guarded, high_confirm, hidden_confirm, 1.0
        ),
        guardedMinusControlsPositiveRecall={
            name: interval(guarded[1.0][:, 1] - guarded[name][:, 1])
            for name in ("approval", "popularity")
        },
        guardedConfirmationMetOverallThreshold=meets_threshold(guarded, 1.0),
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("raw", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument(
        "--fit",
        type=Path,
        help="Optional cached weights, emissions and features from the train-only hierarchical approval fit",
    )
    args = p.parse_args()
    old = Path(__file__).with_name("validation") / "steam-discovery.json"
    args.output.write_text(
        json.dumps(benchmark(args.raw, old, args.fit), indent=2, allow_nan=False) + "\n"
    )
