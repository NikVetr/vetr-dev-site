"""Compare volunteered-title evidence, calendar calibration and whole/half-star response styles."""

import argparse
import csv
import json
from pathlib import Path
from typing import Any

import numpy as np
from evaluate_date_cutoff import cutoff_data
from evaluate_dates import EPOCHS, calendar_emissions, calendar_records, dated_profiles
from evaluate_full import SCALE, film_vectors, paired, read, summary
from evaluate_selection import reveal_models, softmax

# Each ablation uses the strengths already chosen for that signal.
BASE = (False, False, 0, 0)
CHOICE = (True, False, 0, 0)
DATED = (False, True, 0, 0)
JOINT = (True, True, 0, 0)
CANDIDATES = [
    BASE,
    CHOICE,
    DATED,
    JOINT,
    *((True, True, v, 0) for v in (0.25, 1, 4)),
    *((True, True, 0, t) for t in (0.25, 0.5, 1.0)),
]


def response_offset(half_mass, half_count, variance):
    """Penalized logistic intercept relative to each held-out input's half-star odds."""
    if not variance:
        return 0.0
    offset = 0.0
    for _ in range(12):
        odds = np.exp(offset)
        p = odds * half_mass / (1 - half_mass + odds * half_mass)
        step = (half_count - p.sum() - offset / variance) / (
            1 / variance + (p * (1 - p)).sum()
        )
        offset += np.clip(step, -2, 2)
        if abs(step) < 1e-9:
            break
    return offset


def evaluate(samples, annual, prior, title, kernel, candidates):
    scores = {c: [] for c in candidates}
    for given, values, targets, truth, times, volunteered in samples:
        periods = np.minimum(
            np.searchsorted(EPOCHS, times, side="right") - 1, len(annual[0.0]) - 1
        )
        cross = kernel[np.ix_(targets, given)]
        transfer = np.linalg.solve(
            kernel[np.ix_(given, given)] + 0.5 * np.eye(len(given)), cross.T
        ).T
        for use_title, use_year in dict.fromkeys(c[:2] for c in candidates):
            fit = annual[0.5 if use_year else 0.0]
            observed = fit[periods, :, given]
            evidence = np.log(observed[np.arange(len(given)), :, values]).T
            if use_title:
                evidence += 0.5 * title[:, given] * volunteered
            logw = prior + evidence.sum(axis=1)
            emissions = fit[periods.max()][:, targets]
            loo = softmax(logw[:, None] - evidence, 0)
            res = SCALE[values] - ((observed @ SCALE).T * loo).sum(axis=0)
            tilt = 0.5 * (transfer @ res)[:, None] * (SCALE - 2.75)
            scale_tilt = np.exp(np.clip(tilt, -50, 50))
            half_mass = (observed[:, :, ::2].sum(axis=2).T * loo).sum(axis=0)
            for key in candidates:
                if key[:2] != (use_title, use_year):
                    continue
                if key[3]:
                    weights = softmax(logw[:, None] + key[3] * title[:, targets], 0)
                    out = np.einsum("kj,kjl->jl", weights, emissions)
                else:
                    out = np.einsum("k,kjl->jl", softmax(logw, 0), emissions)
                out *= scale_tilt
                effect = response_offset(
                    half_mass, np.count_nonzero(values % 2 == 0), key[2]
                )
                out[:, ::2] *= np.exp(effect)
                out /= out.sum(axis=1, keepdims=True)
                scores[key].append(
                    (
                        -np.log(out[np.arange(len(truth)), truth]).mean(),
                        np.mean((out @ SCALE - SCALE[truth]) ** 2),
                        np.mean((out[:, 7:].sum(axis=1) - (SCALE[truth] >= 4)) ** 2),
                    )
                )
    return {key: np.array(rows) for key, rows in scores.items()}


def samples_for(mode, matrix, stamps, slots, seed, years, popularity):
    if mode in ("volunteered", "chronological"):
        for example in dated_profiles(
            matrix, stamps, slots, seed, mode == "chronological", years
        ):
            yield (*example, np.ones(4, dtype=bool))
        return
    rng = np.random.default_rng(seed)
    # Fixed title order learned from training only. A recorded rating proxies an
    # answer; an unanswered title contributes no evidence to the model.
    for slot in slots:
        row = matrix[slot]
        prompted = popularity[row[popularity] > 0]
        if mode == "mixed":
            voluntary = rng.choice(np.flatnonzero(row), 2, replace=False)
            given = np.r_[voluntary, prompted[~np.isin(prompted, voluntary)][:2]]
            sources = np.array([True, True, False, False])
        else:
            given = prompted[:4]
            sources = np.zeros(4, dtype=bool)
        targets = np.setdiff1d(prompted, given)
        yield (
            given,
            row[given].astype(int) - 1,
            targets,
            row[targets].astype(int) - 1,
            stamps[slot, given],
            sources,
        )


def informative_prompts(matrix, stamps, slots, annual, prior, counts, number):
    # Respondents "answer" an offer if a rating exists. An unrecorded offer is
    # skipped and contributes no class evidence. Skips persist within a session.
    pooled = annual[0.0][0]
    fits = np.concatenate((annual[0.5], pooled[None]))
    entropy = -(fits * np.log(fits)).sum(axis=-1)
    for idx in slots:
        row = matrix[idx]
        if np.count_nonzero(row) <= number:
            continue
        available = np.ones(len(row), dtype=bool)
        given = []
        logw = prior.copy()
        last = -1
        while len(given) < number:
            w = softmax(logw, 0)
            distribution = np.einsum("k,kjl->jl", w, fits[last])
            bits = (
                -(distribution * np.log(distribution)).sum(axis=1) - w @ entropy[last]
            )
            scores = np.where(available, np.maximum(bits, 0) * counts, -np.inf)
            accepted = available & (row > 0)
            j = np.where(accepted, scores, -np.inf).argmax()
            # Stable catalog order breaks ties. Higher ranked unknowns are already skipped.
            available[
                (scores > scores[j])
                | ((scores == scores[j]) & (np.arange(len(row)) <= j))
            ] = False
            given.append(j)
            period = np.searchsorted(EPOCHS, stamps[idx, j], side="right") - 1
            logw += np.log(fits[period, :, j, row[j] - 1])
            last = max(last, period)
        given = np.array(given)
        targets = np.setdiff1d(np.flatnonzero(row), given)
        yield (
            given,
            row[given].astype(int) - 1,
            targets,
            row[targets].astype(int) - 1,
            stamps[idx, given],
            np.zeros(number, dtype=bool),
        )


def compare(val, test, model, prior, title, kernel, selected=None):
    valid = evaluate(val, model, prior, title, kernel, CANDIDATES)
    if selected is None:
        # A recommendation is a specified target. The comparison that assumes a
        # volunteered target addresses a separate forecasting question.
        eligible = [key for key in CANDIDATES if key[3] == 0]
        selected = min(eligible, key=lambda key: valid[key][:, 0].mean())
    target_fit = min(
        (key for key in CANDIDATES if key[3] > 0),
        key=lambda key: valid[key][:, 0].mean(),
    )
    tested = evaluate(
        test,
        model,
        prior,
        title,
        kernel,
        list(dict.fromkeys([BASE, CHOICE, DATED, JOINT, selected, target_fit])),
    )

    def entry(key, scores):
        return dict(
            title=key[0],
            calendar=key[1],
            halfStarVariance=key[2],
            targetChoiceStrength=key[3],
            **summary(
                f"title={key[0]}, year={key[1]}, variance={key[2]:g}, target={key[3]:g}",
                scores,
            ),
        )

    return selected, dict(
        validationRespondents=len(val),
        testRespondents=len(test),
        targetRatings=sum(len(s[2]) for s in test),
        validation=[entry(c, values) for c, values in valid.items()],
        test={
            name: {
                **entry(c, tested[c]),
                "pairedLogLossVersusBaseline": paired(tested[c], tested[BASE]),
                "pairedLogLossVersusBothSignals": paired(tested[c], tested[JOINT]),
            }
            for name, c in [
                ("ratingsTags", BASE),
                ("titleChoice", CHOICE),
                ("ratingYear", DATED),
                ("bothSignals", JOINT),
                ("selected", selected),
                ("volunteeredTarget", target_fit),
            ]
        },
    )


def benchmark(root, archive, catalog, output, cutoff_work=None):
    items = read(catalog)["items"]
    if list(read(root / "film-annotations.json")) != [it["itemId"] for it in items]:
        raise ValueError("Catalog does not match the training matrix.")
    matrix = np.memmap(root / "ratings.u8", dtype="uint8", mode="r").reshape(
        -1, len(items)
    )
    users = np.loadtxt(
        root / "users.csv", delimiter=",", skiprows=1, usecols=0, dtype=int
    )
    with (root / "split.csv").open() as src:
        split = list(csv.DictReader(src))
    rows = np.array([int(r["row"]) for r in split])
    train = np.setdiff1d(np.arange(len(matrix)), rows)
    fit = read(root / "large.json")
    counts, stamps = calendar_records(archive, items, users, rows, matrix)
    if fit["users"] != len(train) or counts.sum() != fit["ratings"]:
        raise ValueError("Training split disagrees with fit")
    prior, annual = calendar_emissions(fit, counts)
    title, eligible = reveal_models(matrix, train, annual[0.0][0], np.exp(prior), items)
    A, B = film_vectors(
        read(root / "large-reference.json")["components"][0]["covariance"],
        np.load(root / "genome.npy"),
    )
    K = (A @ A.T + B @ B.T) / 2
    matrix = matrix[rows]
    years = np.array([it["annotations"]["year"] for it in items])
    popularity = np.argsort(-counts.sum(axis=(0, 2)), kind="stable")
    selected = None
    report: dict[str, Any] = dict(
        trainingUsers=len(train),
        eligibleTrainingUsers=eligible,
        given=4,
        selection="lowest respondent-average validation category log loss on four volunteered ratings",
    )
    for mode in ("volunteered", "chronological", "mixed", "prompted"):
        val, test = [
            list(
                samples_for(
                    mode,
                    matrix,
                    stamps,
                    np.array(
                        [i for i, r in enumerate(split) if r["partition"] == part]
                    ),
                    seed,
                    years,
                    popularity,
                )
            )
            for part, seed in (("validation", 307), ("test", 308))
        ]
        selected, report[mode] = compare(
            val, test, annual, prior, title["title"], K, selected
        )
        print(mode, selected, report[mode]["test"]["selected"]["logLoss"], flush=True)
    for length in (4, 20):
        test_slots = np.array(
            [i for i, r in enumerate(split) if r["partition"] == "test"]
        )
        prompts = list(
            informative_prompts(
                matrix,
                stamps,
                test_slots,
                annual,
                prior,
                counts.sum(axis=(0, 2)),
                length,
            )
        )
        if selected is None:
            raise RuntimeError("A validation-selected model is required")
        result = evaluate(prompts, annual, prior, title["title"], K, [BASE, selected])
        report[f"informative{length}"] = {
            "given": length,
            "testRespondents": len(prompts),
            "targetRatings": sum(len(s[2]) for s in prompts),
            "ratingsTags": summary("Ratings and tags", result[BASE]),
            "selected": summary("Selected model", result[selected]),
            "pairedLogLossVersusBaseline": paired(result[selected], result[BASE]),
        }
    if cutoff_work:
        fit, prior, annual, similarity, cohorts, latest = cutoff_data(
            root, archive, catalog, cutoff_work, reuse_fit=True
        )
        early = np.memmap(cutoff_work / "ratings.u8", mode="r", dtype="uint8").reshape(
            -1, len(items)
        )
        title, eligible = reveal_models(
            early, np.arange(len(early)), annual[0.0][0], np.exp(prior), items
        )
        val, test = [
            [(*profile, np.ones(4, dtype=bool)) for profile in cohort]
            for cohort in cohorts
        ]
        _, report["future2019"] = compare(
            val, test, annual, prior, title["title"], similarity[0.0], selected
        )
        report["future2019"].update(
            trainingUsers=fit["users"],
            trainingRatings=fit["ratings"],
            eligibleTrainingUsers=eligible,
            lastFitYear=2017,
            validationYear=2018,
        )
        stars, times, slots, release_years = latest
        for name, source in (("volunteered", True), ("starsOnly", False)):
            long_history = [
                (*p, np.full(20, source))
                for p in dated_profiles(
                    stars, times, slots, 2019, True, release_years, given_count=20
                )
            ]
            values = evaluate(
                long_history,
                annual,
                prior,
                title["title"],
                similarity[0.0],
                [BASE, selected],
            )
            report[f"future2019Twenty_{name}"] = {
                "given": 20,
                "testRespondents": len(long_history),
                "targetRatings": sum(len(s[2]) for s in long_history),
                "ratingsTags": summary("Through-2017 baseline", values[BASE]),
                "selected": summary("Selected model", values[selected]),
                "pairedLogLossVersusBaseline": paired(values[selected], values[BASE]),
            }
    output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("root", "archive", "catalog", "output"):
        parser.add_argument(arg, type=Path)
    parser.add_argument(
        "--cutoff-work",
        type=Path,
        help="Existing through-2017 fit from evaluate_date_cutoff.py",
    )
    args = parser.parse_args()
    benchmark(args.root, args.archive, args.catalog, args.output, args.cutoff_work)
