"""Fit on 2020–21 respondents and confirm on 2022–23, using the frozen web predictor."""

import argparse
import csv
import hashlib
import heapq
import io
import json
import subprocess
from datetime import date, datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

import numpy as np
from scipy.optimize import minimize
from scipy.special import logsumexp

HERE = Path(__file__).resolve().parent
START, SPLIT = 1577836800, 1640995200
SCALE = np.arange(1, 11) / 2
MAX_USERS = 3000
PENALTY = 0.0005
MODELS = ["personalized", "reference", "latentClass", "ratingsTags"]


def sample_key(text):
    return hashlib.sha256(("film-calibration-v1/" + text).encode()).digest()


def prepare_cohorts(archive, catalog, folder):
    ids = {item["itemId"] for item in catalog["items"]}
    links = json.loads((HERE / "film-links.json").read_text())
    heaps: list[list] = [[], []]
    eligible = [0, 0]

    def finish(user, first, records):
        if first < START or len(records) < 5:
            return
        cohort = int(first >= SPLIT)
        if cohort == 0:
            records = [r for r in records if r[0] < SPLIT]
        if len(records) < 5:
            return
        records.sort(key=lambda r: (r[0], sample_key(f"{user}/{r[1]}")))
        given = records[:4]
        targets = {j: v for t, j, v in records[4:] if t > given[-1][0]}
        if not targets:
            return
        if len({j for _, j, _ in records}) != len(records):
            raise ValueError("Repeated respondent/film in source")
        profile = dict(
            ratings={j: v for _, j, v in given},
            targets=targets,
            ratedOn={
                j: datetime.fromtimestamp(t, timezone.utc).date().isoformat()
                for t, j, _ in given
            },
        )
        eligible[cohort] += 1
        ticket = (-int.from_bytes(sample_key(str(user)), "big"), user, profile)
        if len(heaps[cohort]) < MAX_USERS:
            heapq.heappush(heaps[cohort], ticket)
        else:
            heapq.heappushpop(heaps[cohort], ticket)

    with ZipFile(archive) as z:
        with z.open("ml-32m/links.csv") as f:
            matched = {
                r["movieId"]
                for r in csv.DictReader(io.TextIOWrapper(f))
                if r["movieId"] in ids
                and links[r["movieId"]]["imdb"].endswith("/tt" + r["imdbId"] + "/")
            }
        if matched != ids or len(ids) != 500:
            raise ValueError("Film IDs differ across MovieLens releases")
        with z.open("ml-32m/ratings.csv") as ratings:
            digest = hashlib.md5()
            header = next(ratings)
            if header.strip() != b"userId,movieId,rating,timestamp":
                raise ValueError("Unexpected 32M columns")
            digest.update(header)
            user, first, records = 0, 2**63, []
            movie_ids = {j.encode(): j for j in ids}
            for line in ratings:
                digest.update(line)
                raw_user, movie, stars, timestamp = line.split(b",")
                who = int(raw_user)
                if who != user:
                    if who <= user:
                        raise ValueError("Expected ascending user IDs")
                    finish(user, first, records)
                    user, first, records = who, 2**63, []
                if first < START:
                    continue
                stamp = int(timestamp)
                first = min(first, stamp)
                if first >= START and movie in movie_ids:
                    records.append((stamp, movie_ids[movie], float(stars)))
            finish(user, first, records)
        if digest.hexdigest() != "cf12b74f9ad4b94a011f079e26d4270a":
            raise ValueError("Expected the published MovieLens 32M ratings file")
    for name, cohort in zip(("development", "confirmation"), heaps, strict=True):
        if not cohort:
            raise ValueError("Empty " + name + " cohort")
        with (folder / (name + ".jsonl")).open("w") as out:
            for _, _, profile in sorted(cohort, reverse=True):
                out.write(json.dumps(profile, separators=(",", ":")) + "\n")
    return eligible


def forecast(folder, cohort, models, catalog_path):
    outcomes = []
    blocks = {model: [] for model in models}
    with (
        (folder / (cohort + ".jsonl")).open() as inp,
        (folder / "forecasts.jsonl").open("w+") as out,
    ):
        subprocess.run(
            ["node", HERE / "forecast_film_holdout.mjs", catalog_path, *models],
            stdin=inp,
            stdout=out,
            check=True,
        )
        out.seek(0)
        for line in out:
            record = json.loads(line)
            outcomes.append(np.asarray(record["truth"], dtype=int))
            for model in models:
                probs = np.asarray(record["forecasts"][model])
                if (
                    probs.shape != (len(outcomes[-1]), len(SCALE))
                    or not np.all(probs > 0)
                    or not np.allclose(probs.sum(axis=1), 1, atol=1e-8, rtol=0)
                ):
                    raise ValueError("Invalid category distribution for " + model)
                blocks[model].append(probs)
    return (
        np.concatenate(outcomes),
        np.array([len(r) for r in outcomes]),
        {k: np.vstack(v) for k, v in blocks.items()},
    )


def correct(logp, coef):
    logits = coef[0] * logp + coef[1:]
    return np.exp(logits - logsumexp(logits, axis=1, keepdims=True))


def fit_mapping(probs, truth, counts):
    logp = np.log(probs)
    weights = np.repeat(1 / counts, counts) / len(counts)
    initial = np.r_[1.0, np.zeros(len(SCALE))]
    observed = np.eye(len(SCALE))[truth]

    def objective(coef):
        fitted = correct(logp, coef)
        delta = (fitted - observed) * weights[:, None]
        distance = coef - initial
        loss = -weights @ np.log(fitted[np.arange(len(truth)), truth]) + PENALTY * (
            distance @ distance
        )
        gradient = (
            np.r_[(delta * logp).sum(), delta.sum(axis=0)] + 2 * PENALTY * distance
        )
        return loss, gradient

    fit = minimize(
        objective,
        initial,
        jac=True,
        method="L-BFGS-B",
        bounds=[(0.25, 3.0)] + [(None, None)] * len(SCALE),
        options={"ftol": 1e-12, "gtol": 1e-8, "maxiter": 250},
    )
    if not fit.success:
        raise RuntimeError(fit.message)
    return fit.x


def estimate(values):
    mean = float(values.mean())
    margin = 1.96 * values.std(ddof=1) / np.sqrt(len(values))
    return dict(mean=mean, ci95=[mean - margin, mean + margin])


def diagnostics(p, truth, counts):
    starts = np.r_[0, np.cumsum(counts)[:-1]]
    weights = np.repeat(1 / counts, counts) / len(counts)

    def by_user(values):
        return np.add.reduceat(values, starts) / counts

    cdf = p.cumsum(axis=1)
    tails = 1 - cdf[:, :-1]
    events = truth[:, None] > np.arange(len(SCALE) - 1)
    squared = (tails - events) ** 2
    observed = p[np.arange(len(truth)), truth]
    scores = dict(
        logLoss=by_user(-np.log(observed)),
        mse=by_user((p @ SCALE - SCALE[truth]) ** 2),
        brier=by_user(squared[:, 6]),
        rps=by_user(squared.mean(axis=1)),
    )
    reliability = []
    for j, cutoff in enumerate(SCALE[1:]):
        chance = tails[:, j].clip(0, 1)
        bins = np.minimum((chance * 10).astype(int), 9)
        mass = np.bincount(bins, weights, minlength=10)
        predicted = np.bincount(bins, weights * chance, minlength=10)
        observed_events = np.bincount(bins, weights * events[:, j], minlength=10)
        entries = [
            dict(
                bin=int(b),
                weight=mass[b],
                predicted=predicted[b] / mass[b],
                observed=observed_events[b] / mass[b],
            )
            for b in np.flatnonzero(mass)
        ]
        reliability.append(
            dict(
                cutoff=cutoff,
                brier=float(weights @ squared[:, j]),
                meanAbsoluteGap=float(np.abs(observed_events - predicted).sum()),
                bins=entries,
            )
        )
    intervals = []
    for level in (0.5, 0.8, 0.9, 0.95):
        tail = (1 - level) / 2
        lo, hi = (cdf < tail).sum(axis=1), (cdf < 1 - tail).sum(axis=1)
        ii = np.arange(len(truth))
        left = np.where(truth > 0, cdf[ii, truth - 1], 0.0)
        frac = (
            np.maximum(0, np.minimum(cdf[ii, truth], 1 - tail) - np.maximum(left, tail))
            / observed
        )
        intervals.append(
            dict(
                level=level,
                tieAdjusted=estimate(by_user(frac)),
                mass=float(
                    weights @ (cdf[ii, hi] - np.where(lo > 0, cdf[ii, lo - 1], 0.0))
                ),
                coverage=float(weights @ ((truth >= lo) & (truth <= hi))),
                width=float(weights @ (SCALE[hi] - SCALE[lo])),
            )
        )
    return dict(
        logLoss=float(scores["logLoss"].mean()),
        rmse=float(np.sqrt(scores["mse"].mean())),
        brier=float(scores["brier"].mean()),
        rps=float(scores["rps"].mean()),
        reliability=reliability,
        intervals=intervals,
    ), scores


def run(archive, output):
    catalog_path = HERE / "expanded.json"
    catalog = json.loads(catalog_path.read_bytes())
    if (
        catalog["defaultModel"] != "personalized"
        or catalog["models"]["ratingYear"]["ratingYear"]["lastYear"] != 2019
    ):
        raise ValueError("Expected the frozen MovieLens 25M film default")
    with TemporaryDirectory() as tmp:
        work = Path(tmp)
        eligible = prepare_cohorts(archive, catalog, work)
        outcomes, counts, probs = forecast(
            work, "development", ["personalized"], catalog_path
        )
        coef = fit_mapping(probs["personalized"], outcomes, counts)
        dev = dict(
            people=len(counts), ratings=len(outcomes), eligiblePeople=eligible[0]
        )
        print("Locked development coefficients", coef.tolist(), flush=True)
        del probs
        truth, counts, forecasts = forecast(work, "confirmation", MODELS, catalog_path)
    forecasts["recalibrated"] = correct(np.log(forecasts["personalized"]), coef)
    rows, scores = {}, {}
    for model, p in forecasts.items():
        rows[model], scores[model] = diagnostics(p, truth, counts)
    differences = {
        model: {
            k: estimate(scores[model][k] - v) for k, v in scores["personalized"].items()
        }
        for model in scores if model != "personalized"
    }
    report = dict(
        catalogSha256=hashlib.sha256(catalog_path.read_bytes()).hexdigest(),
        ratingsMd5="cf12b74f9ad4b94a011f079e26d4270a",
        development=dev,
        given=4,
        confirmation=dict(
            people=len(counts),
            ratings=len(truth),
            eligiblePeople=eligible[1],
            firstYear=2022,
            lastDate=date(2023, 10, 12).isoformat(),
        ),
        mapping=dict(slope=coef[0], intercepts=coef[1:].tolist(), penalty=PENALTY),
        models=rows,
        pairedVersusDefault=differences,
    )
    output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    run(args.archive, args.output)
