"""Audit first-question information and matched predictive comparisons for public catalogs."""

import argparse
import csv
import json
import re
import subprocess
from pathlib import Path

import numpy as np

from evaluate_full import profiles as film_profiles
from fit_catalog import scoring_cases
from game_pooling import load_inputs, votes

ROOT = Path(__file__).resolve().parent


def read(path):
    return json.loads(path.read_text())


def public_keys():
    html = (ROOT.parent / "rating-prediction/index.html").read_text()
    domains = re.findall(r'<button\b[^>]*\bdata-key="([^"]+)"', html)
    module = (ROOT / "catalog-choices.mjs").as_uri()
    source_keys = subprocess.check_output(
        [
            "node",
            "--input-type=module",
            "-e",
            f"import {{sourceDomains}} from {json.dumps(module)};"
            "console.log(JSON.stringify([...sourceDomains.keys()]));",
        ],
        text=True,
    )
    return sorted((set(domains) | set(json.loads(source_keys))) - {"custom"})


def first_question(catalog):
    selected = catalog["models"][catalog["defaultModel"]]
    base = catalog["models"][selected["base"]] if selected.get("base") else selected
    if base["kind"] != "latent-class":
        raise ValueError(
            "The built-in question panel expects a fitted categorical class model"
        )
    w = np.array([c["weight"] for c in base["components"]])
    emissions = np.array([c["probabilities"] for c in base["components"]])
    marginal = np.einsum("k,kia->ia", w, emissions)

    # I(class; answer), the same expected bits displayed by tasteProfile().
    def log2(p):
        return np.log2(np.maximum(p, np.finfo(float).tiny))

    info = np.einsum(
        "k,ki->i", w, (emissions * (log2(emissions) - log2(marginal))).sum(axis=-1)
    )
    i = int(np.argmax(info))
    # Conditional independence of different items within each fitted class
    # gives their complete joint answer distribution without simulating people.
    joint = np.einsum("ka,k,kjb->jab", emissions[:, i, :], w, emissions)
    independent = marginal[i, :, None] * marginal[:, None, :]
    pair_info = np.delete(
        (joint * (log2(joint) - log2(independent))).sum(axis=(1, 2)), i
    )
    if pair_info.min() < -1e-8 or pair_info.max() > info[i] + 1e-8:
        raise ArithmeticError(
            "Class and cross-item information violate the data processing inequality"
        )
    return dict(
        items=len(info),
        classes=len(w),
        medianBits=float(np.median(info)),
        maxBits=float(info[i]),
        topItem=catalog["items"][i]["title"],
        topItemId=catalog["items"][i]["itemId"],
        topQuestionMeanOtherItemBits=float(pair_info.mean()),
    )


def film_losses(catalog, work):
    # Match the registered four-volunteered protocol from evaluate_personalized.py.
    section = read(ROOT / "validation/personalized.json")["volunteered"]
    n = len(catalog["items"])
    y = np.memmap(work / "ratings.u8", mode="r", dtype=np.uint8).reshape(-1, n)
    with (work / "split.csv").open() as src:
        split = list(csv.DictReader(src))
    train = np.ones(len(y), dtype=bool)
    train[[int(r["row"]) for r in split]] = False
    test = [int(r["row"]) for r in split if r["partition"] == "test"]
    counts = np.zeros((n, 10))
    for start in range(0, len(y), 4096):
        block = y[start : start + 4096][train[start : start + 4096]]
        for category in range(10):
            counts[:, category] += np.count_nonzero(block == category + 1, axis=0)
    # Fixed K=1 emissions with exactly the pooled regularization in latent_class.R.
    global_counts = counts.sum(axis=0) + 0.5
    pooled = counts + 5 * global_counts / global_counts.sum()
    pooled /= pooled.sum(axis=1, keepdims=True)
    prior = counts + 8 * pooled
    prior /= prior.sum(axis=1, keepdims=True)
    masks = list(film_profiles(y, test, 308))

    def without_answers(p):
        return float(np.mean([-np.log(p[t, y]).mean() for _, _, t, y in masks]))

    fitted = read(work / "large.json")
    if fitted["users"] != train.sum() or fitted["ratings"] != counts.sum():
        raise ValueError("Film training fit and respondent split disagree")
    marginal = sum(
        c["weight"] * np.array(c["probabilities"])
        for c in fitted["model"]["components"]
    )
    assert (
        len(masks) == section["testRespondents"]
        and sum(len(c[2]) for c in masks) == section["targetRatings"]
    )
    return dict(
        testPeople=len(masks),
        testTargets=section["targetRatings"],
        baselineLoss=without_answers(prior),
        sameModelNoHintsLoss=without_answers(marginal),
        personalizedLoss=section["test"]["selected"]["logLoss"],
        baseline="Pooled film stars",
        predictor="Title choice + rating year",
        source="validation/personalized.json",
    )


def steam_losses(work):
    # The later pooling comparison uses a different reveal mask than games.json.
    report = read(ROOT / "validation/games-pooling.json")
    seed = report["seed"]
    tested = report["test"]
    _, matrix = load_inputs(work, ROOT / "games.json")
    order = np.random.default_rng(seed).permutation(matrix.shape[0])
    n = len(order) // 5
    test, train = order[:n], order[n:]
    if len(train) != tested["trainingPlayers"]:
        raise ValueError("Steam matrix differs from the saved test partition")
    counts = votes(matrix[train])
    pooled = counts + [tested["beta"], tested["alpha"]]
    pooled /= pooled.sum(axis=1, keepdims=True)
    people = test[np.diff(matrix.indptr)[test] >= 5]
    masks = scoring_cases(matrix, people, np.random.default_rng(seed + 1))
    baseline = np.mean(
        [-np.log(pooled[targets, truth]).mean() for _, _, targets, truth in masks]
    )
    selected = tested["personalized"][str(report["selectedClassStrength"])]
    assert (
        len(masks) == selected["players"]
        and sum(len(c[2]) for c in masks) == selected["reviews"]
    )
    return dict(
        testPeople=len(masks),
        testTargets=selected["reviews"],
        baselineLoss=float(baseline),
        personalizedLoss=selected["playerLogLoss"],
        baseline="Pooled beta-binomial approval",
        predictor="Classes + review/metadata similarity",
        source="validation/games-pooling.json",
    )


def saved_comparison(key, catalog, transfers):
    report = read(ROOT / f"validation/{key}.json")
    holdout = report["holdout"]
    baseline = next(row for row in holdout if re.search(r"\bK=1\b", row["label"]))
    selected = catalog["models"][catalog["defaultModel"]]
    source = f"validation/{key}.json"
    no_hints = {}
    if key in transfers:
        study = transfers[key]
        scores = {r["label"]: r["logLoss"] for r in study["holdout"]}
        same_people = (
            study["testUsers"] == report["testUsers"]
            and study["testTargets"] == report["testRatings"]
        )
        if not same_people or not np.isclose(
            scores["Pooled item ratings"], baseline["logLoss"]
        ):
            raise ValueError(
                f"{key} transfer study does not match the pooled comparison"
            )
        adopted = catalog["defaultModel"] == "preferenceTransfer"
        if study["defaultAdopted"] != adopted:
            raise ValueError(f"{key} release differs from the transfer study")
        label = study["selected"] if adopted else f"Latent class, K={study['k']}"
        conditional = {"label": label, "logLoss": scores[label]}
        source = "validation/metadata-transfer.json"
        no_hints = {"sameModelNoHintsLoss": scores["No supplied ratings"]}
    elif selected["kind"] == "class-similarity":
        # The end-of-report holdout row for the similarity fit includes the
        # subsequently validated creator features on the anime and books shelves.
        conditional = holdout[-1]
        if "similarity" not in conditional["label"].lower():
            raise ValueError(
                f"{key} lacks its default similarity predictor in the held-out report"
            )
    else:
        k = len(selected["components"])
        conditional = next(
            row for row in holdout if re.search(rf"\bK={k}\b", row["label"])
        )
    return dict(
        testPeople=report["testUsers"],
        testTargets=report["testRatings"],
        baselineLoss=baseline["logLoss"],
        personalizedLoss=conditional["logLoss"],
        baseline=baseline["label"],
        predictor=conditional["label"],
        source=source,
        **no_hints,
    )


def main(film_work, steam_work, output):
    rows = {}
    transfers = read(ROOT / "validation/metadata-transfer.json")
    for key in public_keys():
        catalog = read(ROOT / f"{key}.json")
        if key == "expanded":
            heldout = film_losses(catalog, film_work)
        elif key == "games":
            heldout = steam_losses(steam_work)
        else:
            heldout = saved_comparison(key, catalog, transfers)
        rows[key] = dict(
            name=catalog["name"],
            **first_question(catalog),
            **heldout,
            savedBitsPerTarget=(
                float(heldout["baselineLoss"]) - float(heldout["personalizedLoss"])
            )
            / np.log(2),
        )
    output.write_text(
        json.dumps(rows, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("film_work", "steam_work", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    main(args.film_work, args.steam_work, args.output)
