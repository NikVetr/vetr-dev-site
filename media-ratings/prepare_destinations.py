"""Fit the expanded Stravl catalog on explicit swipes and export observed co-ratings."""

import argparse
import json
from pathlib import Path

import numpy as np
from scipy.sparse import load_npz

from fit_catalog import (
    fit_catalog,
    fit_mixture,
    score_model,
    scoring_cases,
    write_evidence,
)

ROOT = Path(__file__).resolve().parent
SCALE = [0, 1, 2]
MIN_RESPONDENTS = 100


def evaluate_support(profiles, selected_k, seed):
    """Score matched holdout profiles separately for lower- and higher-support destinations."""
    levels = np.asarray(SCALE)
    rng = np.random.default_rng(seed)
    users = rng.permutation(profiles.shape[0])
    test, development = np.split(users, [max(1, len(users) // 5)])
    training = profiles[development]
    counts = np.bincount(training.indices, minlength=profiles.shape[1])
    # Same held-out travelers as the main comparison, with a new, fixed set of four reveals.
    cases = scoring_cases(profiles, test, np.random.default_rng(seed + 100))
    models = {k: fit_mixture(training, len(levels), k, seed) for k in {1, selected_k}}
    rows = []
    for lo, hi in [(0, 400), (400, 800), (800, int(counts.max()) + 1)]:
        group = []
        for given, observed, targets, truth in cases:
            keep = (counts[targets] >= lo) & (counts[targets] < hi)
            if keep.any():
                group.append((given, observed, targets[keep], truth[keep]))
        scores = {}
        for k, fit in sorted(models.items()):
            loss, mse, brier = score_model(fit, group, levels, 2).mean(axis=0)
            scores[f"K{k}"] = dict(
                logLoss=float(loss), rmse=float(np.sqrt(mse)), brier=float(brier)
            )
        rows.append(
            dict(
                minTrainingResponses=lo,
                maxTrainingResponses=hi - 1,
                items=int(np.sum((counts >= lo) & (counts < hi))),
                testUsers=len(group),
                testRatings=sum(len(v[3]) for v in group),
                scores=scores,
            )
        )
    return rows


def build(matrix, labels, output):
    raw = load_npz(matrix).tocsr()
    names = labels.read_text(encoding="utf-8").splitlines()
    if raw.shape[1] != len(names) or not raw.has_canonical_format:
        raise ValueError(
            "Expected one sparse swipe column per destination in source order"
        )
    counts = np.bincount(raw.indices, minlength=raw.shape[1])
    selected = np.flatnonzero(counts >= MIN_RESPONDENTS)
    profiles = raw[:, selected]
    profiles = profiles[np.diff(profiles.indptr) > 0]
    legacy = json.loads((ROOT / "stravl.json").read_text())
    overrides = {v["itemId"]: v for v in legacy["items"]}
    items = []
    for col in selected:
        key = str(col)
        country = names[col].split(",")[-1].strip()
        annotation = dict(country=country, ratingCount=int(counts[col]))
        if key in overrides:
            if names[col] != overrides[key]["title"]:
                raise ValueError(f"Destination label differs for historical ID {key}")
            annotation.update(overrides[key]["annotations"])
        items.append(dict(itemId=key, title=names[col], annotations=annotation))
    if not overrides.keys() <= {v["itemId"] for v in items}:
        raise ValueError("Expanded catalog must retain the historical destination IDs")
    catalog, selection_report = fit_catalog(
        f"Stravl · {len(items):,} destinations", items, SCALE, profiles
    )
    catalog.update(
        domain="cities",
        legacyRatingCatalogs=[legacy["name"]],
        scaleLabels=["No", "Maybe", "Yes"],
        sourceLabel="Stravl",
        source=dict(
            title="Stravl travel preference data",
            url="https://github.com/Stravl/Stravl-Data",
            author="Stravl",
        ),
    )
    validation = dict[str, object](selection_report)
    validation["supportHoldout"] = evaluate_support(
        profiles, selection_report["selectedK"], catalog["fit"]["seed"]
    )
    binary = profiles.astype(np.int32)
    binary.data.fill(1)
    pair_counts = np.asarray((binary.T @ binary).toarray())[
        np.tril_indices(len(items), -1)
    ]
    validation["coverage"] = dict(
        sourceLabels=len(names),
        sourceRatings=int(raw.nnz),
        sourceRespondents=int((np.diff(raw.indptr) > 0).sum()),
        catalogSize=len(items),
        countryLabels=len({i["annotations"]["country"] for i in items}),
        minItemResponses=int(counts[selected].min()),
        maxItemResponses=int(counts[selected].max()),
        pairCount=len(pair_counts),
        observedPairs=int((pair_counts > 0).sum()),
        pairsWithAtLeast10=int((pair_counts >= 10).sum()),
        medianPairResponses=float(np.median(pair_counts)),
    )
    (output / "validation").mkdir(parents=True, exist_ok=True)
    for path, value in [
        (output / "destinations.json", catalog),
        (output / "validation/destinations.json", validation),
    ]:
        path.write_text(
            json.dumps(
                value, separators=(",", ":"), ensure_ascii=False, allow_nan=False
            )
            + "\n"
        )
    write_evidence(output / "destinations-evidence.json", profiles, items, SCALE)
    print(
        json.dumps(
            dict(
                fit=catalog["fit"],
                selectedK=validation["selectedK"],
                holdout=validation["holdout"],
                coverage=validation["coverage"],
                supportHoldout=validation["supportHoldout"],
            ),
            indent=2,
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "matrix", type=Path, help="swipes.npz from prepare_city_transfer.py"
    )
    parser.add_argument("labels", type=Path, help="Original destination_ids.txt")
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.matrix, args.labels, args.output)
