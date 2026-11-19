"""Refit through 2017, validate on new 2018 respondents and test on new 2019 respondents.

Run from the repository root after prepare_full.py, using a separate scratch directory.
The 500 known titles were selected retrospectively. Every feature learned from stars
uses events available by the end of 2017. The 2019 Tag Genome is excluded.
"""

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from evaluate_dates import (
    BASELINE,
    EPOCHS,
    YEARS,
    archived_ratings,
    calendar_emissions,
    dated_profiles,
    result,
    score,
)
from evaluate_full import SCALE, factor_vectors, paired, read

CUTOFF = 2017
CANDIDATES = [(0.0, a, 0) for a in (0.0, 0.5, 1.0)]


def benchmark(root, archive, catalog, work, output):
    work.mkdir(parents=True, exist_ok=True)
    if work.resolve() == root.resolve():
        raise ValueError("Use a separate scratch directory for the calendar cutoff")
    items = read(catalog)["items"]
    if list(read(root / "film-annotations.json")) != [it["itemId"] for it in items]:
        raise ValueError("Training matrix and catalog must have identical film order")
    years = np.array([it["annotations"]["year"] for it in items])
    if years.max() > CUTOFF:
        raise ValueError("A catalog film is newer than the fit cutoff")
    users = np.loadtxt(root / "users.csv", delimiter=",", skiprows=1, dtype=int)
    lookup = np.full(users[:, 0].max() + 1, -1)
    lookup[users[:, 0]] = np.arange(len(users))
    matrix = np.memmap(root / "ratings.u8", mode="r", dtype="uint8").reshape(
        len(users), len(items)
    )
    train = np.zeros(matrix.shape, dtype="uint8")
    later = np.zeros(matrix.shape, dtype="uint32")
    counts = np.zeros((CUTOFF - YEARS[0] + 1, len(items), len(SCALE)), dtype=np.int64)
    for user, film, value, stamp, era in archived_ratings(archive, items):
        row = lookup[user]
        if (row < 0).any() or not np.array_equal(matrix[row, film], value + 1):
            raise ValueError("Archive differs from baseline rating matrix")
        old = era < len(counts)
        train[row[old], film[old]] = value[old] + 1
        np.add.at(counts, (era[old], film[old], value[old]), 1)
        later[row[~old], film[~old]] = stamp[~old]

    early = train.any(axis=1)
    train[early].tofile(work / "ratings.u8")
    np.savetxt(
        work / "users.csv",
        users[early],
        delimiter=",",
        fmt="%d",
        header="user,bucket",
        comments="",
    )
    if counts.sum() != np.count_nonzero(train):
        raise ValueError("Training counts differ from training observations")
    del train
    # Each fitter's release output uses every respondent in the censored matrix.
    for script in ("fit_full.R", "full_reference.R"):
        subprocess.run(
            ["Rscript", "media-ratings/" + script, str(work), str(catalog)], check=True
        )
    fit = read(work / "release.json")
    if fit["users"] != early.sum() or fit["ratings"] != counts.sum():
        raise ValueError("Cutoff fit includes unexpected users or ratings")
    prior, models = calendar_emissions(fit, counts)
    cov = np.array(read(work / "release-reference.json")["components"][0]["covariance"])
    sd = np.sqrt(cov.diagonal())
    vectors = factor_vectors(cov / np.outer(sd, sd))
    similarity = {0.0: vectors @ vectors.T}

    stamps = later[~early]
    unseen = matrix[~early]
    if not np.array_equal(stamps > 0, unseen > 0):
        raise ValueError("Expected timestamps for every new respondent rating")
    first = np.where(stamps > 0, stamps, np.iinfo(np.uint32).max).min(axis=1)
    cohorts = []
    for year in (2018, 2019):
        start, stop = EPOCHS[year - YEARS[0] : year - YEARS[0] + 2]
        members = (first >= start) & (first < stop)
        times = stamps[members]
        stars = np.where(times < stop, unseen[members], 0)
        slots = np.flatnonzero(np.count_nonzero(stars, axis=1) >= 5)
        cohorts.append(list(dated_profiles(stars, times, slots, year, True, years)))
    val, test = cohorts
    valid = score(val, models, prior, similarity, CANDIDATES)
    selected = min(CANDIDATES, key=lambda key: valid[key][:, 0].mean())
    challenger = min(CANDIDATES[1:], key=lambda key: valid[key][:, 0].mean())
    tested = score(
        test, models, prior, similarity, list(dict.fromkeys([BASELINE, challenger]))
    )
    report = {
        "lastTrainingYear": CUTOFF,
        "validationYear": 2018,
        "testYear": 2019,
        "given": 4,
        "trainingUsers": fit["users"],
        "trainingRatings": fit["ratings"],
        "validationUsers": len(val),
        "validationRatings": sum(len(r[2]) for r in val),
        "testUsers": len(test),
        "testRatings": sum(len(r[2]) for r in test),
        "kernel": "32 training-only collaborative factors",
        "outOfRangeCalendar": "use final training year",
        "validation": [result(c, valid[c]) for c in CANDIDATES],
        "holdout": {
            name: {
                **result(c, tested[c]),
                "pairedLogLossVersusBaseline": paired(tested[c], tested[BASELINE]),
            }
            for name, c in [
                ("baseline", BASELINE),
                ("bestPositive", challenger),
                ("selected", selected),
            ]
        },
    }
    output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for arg in ("root", "archive", "catalog", "work", "output"):
        p.add_argument(arg, type=Path)
    args = p.parse_args()
    benchmark(args.root, args.archive, args.catalog, args.work, args.output)
