"""Verify both packaged film predictors using rating year against the NumPy calibration used for evaluation."""

import argparse
import json
import subprocess
from datetime import date
from pathlib import Path

import numpy as np
from evaluate_dates import calendar_emissions
from evaluate_full import read


def run_cli(catalog, request):
    proc = subprocess.run(
        ["node", str(Path(__file__).with_name("cli.mjs"))],
        input=json.dumps({"catalog": catalog, **request}),
        check=False,
        capture_output=True,
        text=True,
    )
    if proc.returncode:
        raise RuntimeError(proc.stderr.strip())
    return json.loads(proc.stdout)


def check(catalog, key):
    items = catalog["items"]
    scale = np.array(catalog["scale"])
    model = catalog["models"]["ratingYear"]
    choice = (
        catalog["models"]["titleChoice"]["titleChoice"]
        if key == "personalized"
        else None
    )
    year = model["ratingYear"]
    counts = np.array(year["counts"]).reshape(-1, len(items), len(scale))
    if counts.sum() != catalog["fit"]["ratings"]:
        raise ValueError("Year table does not cover every training rating")
    fit = catalog["models"][model["base"]]
    log_prior, tables = calendar_emissions({"model": fit}, counts)
    dated = tables[year["strength"]]
    base = np.array([c["probabilities"] for c in fit["components"]])
    prior = np.array([c["weight"] for c in fit["components"]])
    similarity = catalog["models"][model["similarityFrom"]]
    features = np.array(similarity["features"])
    kernel = features @ features.T
    first, last = year["firstYear"], year["lastYear"]
    years = np.arange(first, last + 1)
    releases = np.array([it["annotations"]["year"] for it in items])
    blank, blank_film = np.argwhere(
        (counts.sum(axis=2) == 0) & (years[:, None] >= releases)
    )[0]
    rng = np.random.default_rng(613)
    cases = [
        ("empty", []),
        ("undated", [None] * 4),
        ("lower boundary", [first - 8]),
        ("upper boundary", [last + 7]),
        ("empty film-year", [int(years[blank])]),
        ("mixed dates", [2014, None, 2003, None]),
        ("dense mixed dates", ([1999, 2015, None, last + 7] * 20)),
    ]
    total_categories = 0
    for label, dates in cases:
        obs = rng.choice(len(items), len(dates), replace=False)
        if label == "empty film-year":
            obs[0] = blank_film
        vals = rng.integers(0, len(scale), size=len(obs))
        remaining = np.setdiff1d(np.arange(len(items)), obs)
        ratings = {
            items[i]["itemId"]: float(scale[v]) for i, v in zip(obs, vals, strict=True)
        }
        rated_on = {
            items[i]["itemId"]: date(y, 6, 1).isoformat()
            for i, y in zip(obs, dates, strict=True)
            if y is not None
        }
        picked = np.arange(len(obs)) % 2 == 0
        if label == "upper boundary":
            picked[:] = False
        volunteered = [items[i]["itemId"] for i in obs[picked]]
        request = {
            "ratings": ratings,
            "ratedOn": rated_on,
            "threshold": 4,
            "volunteered": volunteered,
        }
        actual = run_cli(catalog, {"model": key, **request})
        if not rated_on:
            original = run_cli(
                catalog,
                {
                    **request,
                    "model": "titleChoice" if choice else model["similarityFrom"],
                },
            )
            assert actual["weights"] == original["weights"]
            for a, b in zip(
                actual["predictions"], original["predictions"], strict=True
            ):
                fields = (
                    "itemId",
                    "prior",
                    "expected",
                    "shift",
                    "sd",
                    "chance",
                    "probabilities",
                )
                assert all(a[key] == b[key] for key in fields), label
        known = [min(last, max(first, y)) - first for y in dates if y is not None]
        target_emissions = (dated[max(known)] if known else base)[:, remaining]
        weights = prior
        signal = np.zeros(len(remaining))
        if len(obs):
            observations = np.stack(
                [
                    base[:, i]
                    if y is None
                    else dated[min(last, max(first, y)) - first, :, i]
                    for i, y in zip(obs, dates, strict=True)
                ],
                axis=1,
            )
            logs = np.log(observations[:, np.arange(len(obs)), vals])
            if choice:
                logs += (
                    choice["strength"] * np.array(choice["logRatios"])[:, obs] * picked
                )
            logw = log_prior + logs.sum(axis=1)
            weights = np.exp(logw - logw.max())
            weights /= weights.sum()
            leave = logw[:, None] - logs
            loo = np.exp(leave - leave.max(axis=0))
            residuals = scale[vals] - ((observations @ scale) * loo).sum(
                axis=0
            ) / loo.sum(axis=0)
            k = kernel[np.ix_(obs, obs)] + similarity["ridge"] * np.eye(len(obs))
            signal = kernel[np.ix_(remaining, obs)] @ np.linalg.solve(k, residuals)
        base_target = np.einsum("k,kjl->jl", prior, target_emissions)
        forecast = np.einsum("k,kjl->jl", weights, target_emissions)
        tilt = (
            similarity["strength"]
            * signal[:, None]
            * (scale - (scale[0] + scale[-1]) / 2)
        )
        forecast *= np.exp(np.clip(tilt, -50, 50))
        forecast /= forecast.sum(axis=1, keepdims=True)
        rows = {row["itemId"]: row for row in actual["predictions"]}
        assert set(rows) == {items[i]["itemId"] for i in remaining}
        ordered = [rows[items[i]["itemId"]] for i in remaining]
        for got, expected in (
            ([w["prior"] for w in actual["weights"]], prior),
            ([w["posterior"] for w in actual["weights"]], weights),
            ([p["probabilities"] for p in ordered], forecast),
            ([p["prior"] for p in ordered], base_target @ scale),
            ([p["expected"] for p in ordered], forecast @ scale),
            ([p["shift"] for p in ordered], (forecast - base_target) @ scale),
            ([p["chance"] for p in ordered], forecast[:, scale >= 4].sum(axis=1)),
        ):
            np.testing.assert_allclose(got, expected, atol=1e-11, rtol=0, err_msg=label)
        total_categories += forecast.size
    print(
        f"Verified {key} across {len(cases)} profiles and {total_categories:,} forecast category probabilities."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog", type=Path)
    catalog = read(parser.parse_args().catalog)
    check(catalog, "ratingYear")
    if "personalized" in catalog["models"]:
        check(catalog, "personalized")
