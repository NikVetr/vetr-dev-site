"""Test shared TV credits on the exact MovieLens 32M K16 folds and holdout.

With the TV preparation environment (NumPy, SciPy and DuckDB):
    OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 python3 media-ratings/evaluate_tv_credits.py \
        tmp/agent/tv-drinks/ml-32m.zip media-ratings/validation/tv-credits.json

The four nonzero tilt strengths were fixed before scoring. Only the validation
winner is evaluated against the baseline on the test respondents. Adoption
requires a lower cross-validated log loss and a paired 95% upper bound below
zero on the test. See creator-credits.md for coverage and interpretation.
"""

import argparse
import json
from pathlib import Path
from typing import Any
from zipfile import ZipFile

import numpy as np

from evaluate_full import evaluate, paired, summary
from fit_catalog import scoring_cases
from fit_ordinal_similarity import fitted_classes, shared_label_vectors
from prepare_tv_cocktails import make_profiles

HERE = Path(__file__).resolve().parent
STRENGTHS = (0.125, 0.25, 0.5, 1.0)


def profiles_from_archive(archive, catalog):
    items = catalog["items"]
    films = {int(it["itemId"]): it for it in items}
    ids = {str(key).encode(): key for key in films}
    original_counts = [it["annotations"]["ratingCount"] for it in items]
    rows = []
    with ZipFile(archive) as z, z.open("ml-32m/ratings.csv") as src:
        if next(src).strip() != b"userId,movieId,rating,timestamp":
            raise ValueError("Expected MovieLens 32M ratings columns")
        for line in src:
            user, title, rest = line.split(b",", 2)
            if title in ids:
                rating = float(rest.split(b",", 1)[0])
                if rating not in catalog["scale"]:
                    raise ValueError(
                        "Source rating outside the published half-star scale"
                    )
                rows.append((int(user), ids[title], int(rating * 2)))
    titles, profiles = make_profiles(
        films, np.asarray(rows, dtype=np.int32), min_reviews=3
    )
    if [it["itemId"] for it in titles] != [it["itemId"] for it in items] or (
        [it["annotations"]["ratingCount"] for it in titles] != original_counts
    ):
        raise ValueError("Source title counts or order differ from the TV catalog")
    if (
        profiles.shape != (catalog["fit"]["users"], len(items))
        or profiles.nnz != catalog["fit"]["ratings"]
    ):
        raise ValueError("Source cohort differs from the published TV fit")
    return profiles


def benchmark(archive):
    catalog = json.loads((HERE / "tv.json").read_text())
    report = json.loads((HERE / "validation/tv.json").read_text())
    credits = json.loads((HERE / "tv-creators.json").read_text())
    profiles = profiles_from_archive(archive, catalog)
    if set(credits) != {it["itemId"] for it in catalog["items"]}:
        raise ValueError("Catalog titles and credit data differ")
    labels = [
        {
            f"{role}:{name}"
            for role, names in credits[it["itemId"]].items()
            for name in names
        }
        for it in catalog["items"]
    ]
    # Only 186 labels occur on multiple series. Exact sparse cosine keeps zero
    # overlap at zero, including the 138 shows without any shared credit.
    vectors = shared_label_vectors(labels)
    kernel = (vectors @ vectors.T).toarray()
    scale = np.asarray(catalog["scale"])
    k, seed = report["selectedK"], catalog["fit"]["seed"]
    base = f"Latent class, K={k}"
    rng = np.random.default_rng(seed)
    respondents = len(profiles.indptr) - 1
    test, development = np.split(
        rng.permutation(respondents), [max(1, respondents // 5)]
    )

    def score(train, rows, fit_seed, strengths):
        cases = scoring_cases(profiles, rows, rng)
        model = fitted_classes(profiles[train], len(scale), k, fit_seed)
        candidates = {str(w): ("credits", kernel, w) for w in strengths}
        scores = evaluate(
            model,
            cases,
            candidates,
            scale=scale,
            threshold=report["brierThreshold"],
            baseline=base,
        )
        return {0.0: scores[base], **{w: scores[str(w)] for w in strengths}}, cases

    folded = {w: [] for w in (0.0, *STRENGTHS)}
    for index, fold in enumerate(np.array_split(development, 3)):
        values, _ = score(
            np.setdiff1d(development, fold), fold[:2000], seed + index, STRENGTHS
        )
        for w, result in values.items():
            folded[w].append(result)
    cv = {w: np.concatenate(parts) for w, parts in folded.items()}
    best = min(STRENGTHS, key=lambda w: cv[w][:, 0].mean())
    held, cases = score(development, test, seed, [best])
    for group, observed in (("cv", cv), ("holdout", held)):
        published = next(row for row in report[group] if row["label"] == base)
        repeated = summary(base, observed[0.0])
        if any(
            abs(repeated[m] - published[m]) > 1e-8 for m in ("logLoss", "rmse", "brier")
        ):
            raise ValueError(
                f"Baseline {group} metrics do not reproduce on identical respondents"
            )
    difference: dict[str, Any] = paired(held[best], held[0.0])
    decision = (
        cv[best][:, 0].mean() < cv[0.0][:, 0].mean() and difference["ci95"][1] < 0
    )

    def summarize(score_rows):
        return [
            dict(tilt=w, **summary(base if w == 0 else f"K={k} + shared credits", rows))
            for w, rows in score_rows.items()
        ]

    return dict(
        validationUsers=len(cv[0.0]),
        testUsers=len(held[0.0]),
        testRatings=sum(len(c[2]) for c in cases),
        sharedCredits=vectors.shape[1],
        showsWithSharedCredits=int(np.count_nonzero(vectors.getnnz(axis=1))),
        testTargetsSharingACredit=sum(
            int((kernel[np.ix_(targets, given)] > 0).any(axis=1).sum())
            for given, _, targets, _ in cases
        ),
        given=4,
        candidateTilt=best,
        adopted=bool(decision),
        comparison=difference,
        validation=summarize(cv),
        holdout=summarize(held),
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = benchmark(args.archive)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
