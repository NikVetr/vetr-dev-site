"""Test release-year similarity and dated film ratings on respondent-disjoint profiles."""

import argparse
import csv
import json
from itertools import islice, product
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from evaluate_full import SCALE, film_vectors, paired, profiles, read, summary

YEARS = np.arange(1995, 2020)
EPOCHS = (
    np.arange(np.datetime64("1995"), np.datetime64("2021"))
    .astype("datetime64[s]")
    .astype(np.int64)
)
# Release similarity weight, calendar-distribution weight, session decay in days.
GRID = list(product((0.0, 0.10, 0.25), (0.0, 0.5, 1.0), (0, 1, 30)))
BASELINE = (0.0, 0.0, 0)


def archived_ratings(archive, items):
    movie_ids = np.array([int(it["itemId"]) for it in items])
    item_index = np.full(movie_ids.max() + 1, -1)
    item_index[movie_ids] = np.arange(len(items))
    with ZipFile(archive) as z, z.open("ml-25m/ratings.csv") as records:
        if next(records).strip() != b"userId,movieId,rating,timestamp":
            raise ValueError("Expected MovieLens 25M rating and timestamp columns")
        while lines := list(islice(records, 100_000)):
            data = np.loadtxt(lines, delimiter=",", ndmin=2)
            movie = data[:, 1].astype(int)
            short = movie < len(item_index)
            data, indices = data[short], item_index[movie[short]]
            data, indices = data[indices >= 0], indices[indices >= 0]
            user, raw_score, when = (
                data[:, 0].astype(int),
                data[:, 2],
                data[:, 3].astype(int),
            )
            score = (raw_score * 2).astype(int) - 1
            era = np.searchsorted(EPOCHS, when, side="right") - 1
            if (
                (era < 0).any()
                or (era >= len(YEARS)).any()
                or not np.array_equal(SCALE[score], raw_score)
            ):
                raise ValueError(
                    "Unexpected timestamp or rating in MovieLens 25M archive"
                )
            yield user, indices, score, when, era


def calendar_records(archive, items, users, rows, ratings):
    """Aggregate training film/year counts and retain timestamps only for reserved users."""
    # Dense IDs in this archive allow a compact lookup; users without a catalog
    # rating do not enter any of the arrays below.
    reserved = np.full(users.max() + 1, -1)
    reserved[users[rows]] = np.arange(len(rows))
    stamps = np.zeros((len(rows), len(items)), dtype=np.int64)
    counts = np.zeros((len(YEARS), len(items), len(SCALE)), dtype=np.int64)
    for user, indices, score, when, era in archived_ratings(archive, items):
        slot = reserved[user]
        test = slot >= 0
        if not np.array_equal(
            ratings[rows[slot[test]], indices[test]], score[test] + 1
        ):
            raise ValueError("Archived stars disagree with reserved respondent matrix")
        stamps[slot[test], indices[test]] = when[test]
        np.add.at(counts, (era[~test], indices[~test], score[~test]), 1)
    if not np.array_equal(stamps > 0, ratings[rows] > 0):
        raise ValueError("Missing timestamps for reserved respondents")
    return counts, stamps


def dated_profiles(matrix, stamps, slots, seed, forward, release_years):
    if not forward:
        for slot, sample in zip(slots, profiles(matrix, slots, seed), strict=True):
            given, values, targets, truth = sample
            yield given, values, targets, truth, stamps[slot, given]
        return
    rng = np.random.default_rng(seed)
    for slot in slots:
        row = matrix[slot]
        seen = np.flatnonzero(row)
        # Break timestamp ties independently of film popularity and the stars.
        rng.shuffle(seen)
        order = seen[np.argsort(stamps[slot, seen], kind="stable")]
        given = order[:4]
        as_of = stamps[slot, given[-1]]
        as_of_year = YEARS[np.searchsorted(EPOCHS, as_of, side="right") - 1]
        targets = order[
            (stamps[slot, order] > as_of) & (release_years[order] <= as_of_year)
        ]
        if len(targets):
            yield (
                given,
                row[given].astype(int) - 1,
                targets,
                row[targets].astype(int) - 1,
                stamps[slot, given],
            )


def calendar_emissions(fit, counts):
    components = fit["model"]["components"]
    base = np.array([c["probabilities"] for c in components])
    log_prior = np.log([c["weight"] for c in components])
    # Shrink yearly per-film counts toward their all-training-year distribution.
    # One uniform pseudo-count keeps unseen categories well-defined.
    pooled = counts.sum(axis=0) + 1 / len(SCALE)
    pooled = pooled / pooled.sum(axis=-1, keepdims=True)
    by_year = counts + 100 * pooled
    by_year = by_year / by_year.sum(axis=-1, keepdims=True)
    models = {}
    for weight in sorted({c[1] for c in GRID}):
        adjusted = base[None] * (by_year[:, None] / pooled) ** weight
        models[weight] = adjusted / adjusted.sum(axis=-1, keepdims=True)
    return log_prior, models


def kernels(root, years):
    if not np.isfinite(years).all():
        raise ValueError("Release-year comparison needs years for every title")
    era = np.exp(-0.5 * ((years[:, None] - years) / 10) ** 2)
    covariance = read(root / "large-reference.json")["components"][0]["covariance"]
    ratings, tags = film_vectors(covariance, np.load(root / "genome.npy"))
    baseline = (ratings @ ratings.T + tags @ tags.T) / 2
    return {w: (1 - w) * baseline + w * era for w in {c[0] for c in GRID}}


def score(samples, emissions, log_prior, similarities, options):
    scores = {key: [] for key in options}
    for given, values, targets, truth, times in samples:
        input_years = np.searchsorted(EPOCHS, times, side="right") - 1
        input_years = np.minimum(input_years, len(emissions[0.0]) - 1)
        day = times / 86400
        # Use the latest supplied time for every forecast; target times are unavailable.
        periods = {}
        for calendar in {c[1] for c in options}:
            model = emissions[calendar]
            observed = model[input_years, :, given]  # supplied film, class, stars
            evidence = np.log(observed[np.arange(len(given)), :, values]).T
            logw = log_prior + evidence.sum(axis=1)
            w = np.exp(logw - logw.max())
            base = np.einsum(
                "k,kjl->jl", w / w.sum(), model[input_years.max()][:, targets]
            )
            loo = logw[:, None] - evidence
            weights = np.exp(loo - loo.max(axis=0))
            residual = SCALE[values] - ((observed @ SCALE).T * weights).sum(
                axis=0
            ) / weights.sum(axis=0)
            periods[calendar] = base, residual
        for release, calendar, decay in options:
            kernel = similarities[release]
            obs = kernel[np.ix_(given, given)] + 0.5 * np.eye(len(given))
            target = kernel[np.ix_(targets, given)]
            if decay:
                # One temporary respondent offset shared by titles, covariance 0.25
                # at the same moment. Correlation decays with elapsed time.
                obs += 0.25 * np.exp(-np.abs(day[:, None] - day) / decay)
                target = target + 0.25 * np.exp(-(day.max() - day) / decay)
            base, residual = periods[calendar]
            signal = target @ np.linalg.solve(obs, residual)
            probs = base * np.exp(
                np.clip(0.5 * signal[:, None] * (SCALE - 2.75), -50, 50)
            )
            probs /= probs.sum(axis=1, keepdims=True)
            scores[(release, calendar, decay)].append(
                [
                    -np.log(probs[np.arange(len(truth)), truth]).mean(),
                    np.mean((probs @ SCALE - SCALE[truth]) ** 2),
                    np.mean((probs[:, 7:].sum(axis=1) - (SCALE[truth] >= 4)) ** 2),
                ]
            )
    return {key: np.array(values) for key, values in scores.items()}


def result(config, scores):
    w, a, d = config
    return dict(
        releaseWeight=w,
        calendarWeight=a,
        sessionDecayDays=d,
        **summary(f"{w:g}/{a:g}/{d}", scores),
    )


def benchmark(root, archive, catalog, output):
    items = read(catalog)["items"]
    if list(read(root / "film-annotations.json")) != [it["itemId"] for it in items]:
        raise ValueError("Catalog and rating matrix have different column order")
    matrix = np.memmap(root / "ratings.u8", mode="r", dtype="uint8").reshape(
        -1, len(items)
    )
    users = np.loadtxt(
        root / "users.csv", delimiter=",", skiprows=1, usecols=0, dtype=int
    )
    with (root / "split.csv").open() as src:
        split = list(csv.DictReader(src))
    rows = np.array([int(r["row"]) for r in split])
    if len(users) != len(matrix) or len(np.unique(rows)) != len(rows):
        raise ValueError("Invalid respondent split")
    fit = read(root / "large.json")
    counts, stamps = calendar_records(archive, items, users, rows, matrix)
    if counts.sum() != fit["ratings"] or len(users) - len(rows) != fit["users"]:
        raise ValueError("Training ratings or users disagree with the train-only fit")
    priors, models = calendar_emissions(fit, counts)
    release_years = np.array([it["annotations"]["year"] for it in items], dtype=float)
    similarities = kernels(root, release_years)
    matrix = matrix[rows]
    annual = counts.sum(axis=1)
    report = {
        "trainingUsers": fit["users"],
        "trainingRatings": fit["ratings"],
        "given": 4,
        "sourceYears": [int(YEARS.min()), int(YEARS.max())],
        "releaseBandwidthYears": 10,
        "sessionVariance": 0.25,
        "calendarPriorCount": 100,
        "trainingHistory": [
            {
                "year": int(year),
                "ratings": int(totals.sum()),
                "fractionHalfStar": float(totals[::2].sum() / totals.sum()),
            }
            for year, totals in zip(YEARS, annual, strict=True)
            if totals.sum()
        ],
    }
    for forward in (False, True):
        val, test = [
            list(
                dated_profiles(
                    matrix,
                    stamps,
                    np.array(
                        [i for i, r in enumerate(split) if r["partition"] == name]
                    ),
                    seed,
                    forward,
                    release_years,
                )
            )
            for name, seed in [("validation", 307), ("test", 308)]
        ]
        validation = score(val, models, priors, similarities, GRID)

        losses = {key: values[:, 0].mean() for key, values in validation.items()}
        choices = {
            "baseline": BASELINE,
            "publishedRatingYear": (0.0, 0.5, 0),
            "releaseOnly": min(
                (c for c in GRID if c[0] > 0 and c[1] == c[2] == 0),
                key=losses.__getitem__,
            ),
            "calendarOnly": min(
                (c for c in GRID if c[1] > 0 and c[0] == c[2] == 0),
                key=losses.__getitem__,
            ),
            "sessionOnly": min(
                (c for c in GRID if c[2] > 0 and c[0] == c[1] == 0),
                key=losses.__getitem__,
            ),
            "selected": min(GRID, key=losses.__getitem__),
        }
        tests = score(
            test, models, priors, similarities, list(dict.fromkeys(choices.values()))
        )

        report["chronological" if forward else "random"] = {
            "validationUsers": len(val),
            "testUsers": len(test),
            "testRatings": sum(len(s[2]) for s in test),
            "validation": [result(c, validation[c]) for c in GRID],
            "holdout": {
                name: {
                    **result(c, tests[c]),
                    "pairedLogLossVersusBaseline": paired(tests[c], tests[BASELINE]),
                }
                for name, c in choices.items()
            },
        }
    output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ("root", "archive", "catalog", "output"):
        p.add_argument(arg, type=Path)
    args = p.parse_args()
    benchmark(args.root, args.archive, args.catalog, args.output)
