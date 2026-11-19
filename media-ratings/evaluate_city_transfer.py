"""Evaluate film-model ingredients on held-out Stravl respondents and explicit city swipes."""

import argparse
import csv
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from scipy.sparse import load_npz

from evaluate_all_titles import item_factors
from evaluate_full import factor_vectors, paired, read, summary
from evaluate_personalized import response_offset
from evaluate_selection import softmax

LEVELS = np.arange(3)
BASES = ("K8", "K16", "wideK8")
KERNELS = (
    "ratings",
    "geography",
    "ratings+geography",
    "all-factors",
    "all-factors+geography",
    "generosity",
)
PROTOCOLS = ("random", "popular", "informative", "exactly-four")


@dataclass(frozen=True)
class Candidate:
    base: str
    kernel: str = ""
    strength: float = 0
    maybe: float = 0

    @property
    def name(self):
        suffix = f" / {self.kernel} x {self.strength:g}" if self.kernel else ""
        return (
            self.base
            + suffix
            + (f" / Maybe variance {self.maybe:g}" if self.maybe else "")
        )


def geography(items):
    attributes = [item["annotations"] for item in items]
    distance = np.zeros((len(items), len(items)))
    for key in ("coast", "region", "country"):
        values = np.array([a[key] for a in attributes])
        distance += values[:, None] != values
    for key in ("temperature", "precipitation", "gdp"):
        values = np.array([a[key] for a in attributes])
        if key != "temperature":
            values = np.log(values)
        distance += ((values[:, None] - values) / values.std(ddof=1)) ** 2
    return np.exp(-distance / np.median(distance[np.triu_indices(len(items), 1)]))


def city_kernels(swipes, train, displayed, geo):
    x = swipes[train].astype(np.float32)
    panel = x[:, displayed].toarray()
    # No/Maybe/Yes are equally spaced. Only jointly observed swipes enter
    # each correlation. Project negative eigenvalues to zero before cosine scaling.
    corr = np.eye(len(displayed))
    for i, j in zip(*np.triu_indices(len(displayed), 1)):
        both = (panel[:, i] > 0) & (panel[:, j] > 0)
        corr[i, j] = corr[j, i] = np.corrcoef(panel[both, i], panel[both, j])[0, 1]
    factors = factor_vectors(corr)
    corr = factors @ factors.T
    wide = item_factors(x, displayed)
    return dict(
        zip(
            KERNELS,
            (corr, geo, (geo + corr) / 2, wide, (geo + wide) / 2, np.ones_like(corr)),
        )
    )


def class_arrays(model):
    probabilities = np.array([c["probabilities"] for c in model["components"]])
    prior = np.log([c["weight"] for c in model["components"]])
    return probabilities, prior


def profiles(panel, people, counts, baseline, protocol, seed):
    rng = np.random.default_rng(seed)
    emissions, prior = class_arrays(baseline)
    entropy = -(emissions * np.log(emissions)).sum(axis=2)
    for person in people:
        row = panel[person]
        answered = np.flatnonzero(row)
        n = min(4, len(answered) - 1)
        if n < 1 or (protocol == "exactly-four" and n < 4):
            continue
        if protocol in ("random", "exactly-four"):
            given = rng.choice(answered, n, replace=False)
        elif protocol == "popular":
            given = answered[np.argsort(-counts[answered], kind="stable")[:n]]
        else:
            # Proxy app sessions using the same K8 question policy for all
            # candidates. Unrecorded prompts are skipped without evidence.
            w = prior.copy()
            selected = []
            for _ in range(n):
                mass = softmax(w, 0)
                forecast = np.einsum("k,kil->il", mass, emissions)
                info = -(forecast * np.log(forecast)).sum(axis=1) - mass @ entropy
                remaining = np.setdiff1d(answered, selected)
                pick = remaining[np.argmax((counts * info)[remaining])]
                selected.append(pick)
                w += np.log(emissions[:, pick, row[pick] - 1])
            given = np.array(selected)
        targets = np.setdiff1d(answered, given)
        yield given, row[given] - 1, targets, row[targets] - 1


def evaluate(samples, candidates, models, kernels):
    arrays = {
        base: class_arrays(models[base]) for base in {key.base for key in candidates}
    }
    scores = {key: [] for key in candidates}
    for given, values, targets, truth in samples:
        transfer = {}
        for kernel in {key.kernel for key in candidates if key.kernel}:
            k = kernels[kernel]
            transfer[kernel] = np.linalg.solve(
                k[np.ix_(given, given)] + 0.5 * np.eye(len(given)),
                k[np.ix_(given, targets)],
            ).T
        for base, (emission, prior) in arrays.items():
            evidence = np.log(emission[:, given, values])
            joint = prior + evidence.sum(axis=1)
            loo = softmax(joint[:, None] - evidence, 0)
            residual = values - (loo * (emission[:, given] @ LEVELS)).sum(axis=0)
            forecast = np.einsum("k,kjl->jl", softmax(joint, 0), emission[:, targets])
            middle = (loo * emission[:, given, 1]).sum(axis=0)
            offsets = {
                v: np.exp(response_offset(middle, np.count_nonzero(values == 1), v))
                for v in {
                    key.maybe for key in candidates if key.base == base and key.maybe
                }
            }
            for key in candidates:
                if key.base != base:
                    continue
                out = forecast.copy()
                if key.kernel:
                    delta = transfer[key.kernel] @ residual
                    out *= np.exp(key.strength * np.outer(delta, LEVELS - 1))
                if key.maybe:
                    # The analogue of the film half-star offset is repeated use
                    # of the middle category, conditional on offered destinations.
                    out[:, 1] *= offsets[key.maybe]
                out /= out.sum(axis=1, keepdims=True)
                scores[key].append(
                    (
                        -np.log(out[np.arange(len(truth)), truth]).mean(),
                        np.mean((out @ LEVELS - truth) ** 2),
                        np.mean((out[:, 2] - (truth == 2)) ** 2),
                    )
                )
    return {key: np.array(rows) for key, rows in scores.items()}


def check_shared_scorer(catalog, models, winner, kernels, samples, numerical):
    # Compare the unmodified production forecast and its supported similarity
    # extension against the shared JS code. The Maybe offset is an offline arm.
    keys = [Candidate("K8"), Candidate(winner.base)]
    entries = {"baseline": models["K8"], "classes": models[winner.base]}
    if winner.kernel:
        eigen, vectors = np.linalg.eigh(kernels[winner.kernel])
        features = vectors * np.sqrt(np.maximum(eigen, 0))
        entries["similarity"] = dict(
            kind="class-similarity",
            base="classes",
            features=features.tolist(),
            ridge=0.5,
            strength=winner.strength,
        )
        keys.append(Candidate(winner.base, winner.kernel, winner.strength))

    def keyed(ids, values):
        return {
            catalog["items"][i]["itemId"]: int(value) for i, value in zip(ids, values)
        }

    test_catalog = {k: catalog[k] for k in ("name", "scale", "items")}
    test_catalog["models"] = entries
    request = dict(
        catalog=test_catalog,
        threshold=2,
        profiles=[
            dict(ratings=keyed(g, v), targets=keyed(t, y)) for g, v, t, y in samples
        ],
    )
    with TemporaryDirectory() as tmp:
        infile, outfile = Path(tmp) / "request.json", Path(tmp) / "scores.json"
        infile.write_text(json.dumps(request))
        subprocess.run(
            ["node", "media-ratings/score.mjs", str(infile), str(outfile)], check=True
        )
        js = read(outfile)
    for key, result in zip(keys, js, strict=True):
        np.testing.assert_allclose(
            numerical[key].mean(axis=0),
            [result["logLoss"], result["mse"], result["brier"]],
            rtol=1e-10,
            atol=1e-10,
        )


def main(work, catalog_path, output):
    catalog = read(catalog_path)
    swipes = load_npz(work / "swipes.npz").tocsr()
    ids = [int(item["itemId"]) for item in catalog["items"]]
    panel = swipes[:, ids].toarray()
    # Outside-panel respondents can train the wider models. No validation or
    # test respondent contributes any swipes, even on the other 1,400+ cities.
    fold = np.full(swipes.shape[0], -2)
    with (work / "folds.csv").open() as src:
        for row in csv.DictReader(src):
            fold[int(row["user"])] = int(row["fold"])
    if not np.array_equal(fold >= 0, np.any(panel, axis=1)):
        raise ValueError("Prepared catalog users disagree with the raw swipe release")
    geo = geography(catalog["items"])
    candidates = []
    for base in BASES:
        for maybe in (0, 0.25, 1, 4):
            candidates.append(Candidate(base, maybe=maybe))
            for kernel in KERNELS:
                candidates.extend(
                    Candidate(base, kernel, s, maybe) for s in (0.25, 0.5, 1)
                )
    cv = {key: [] for key in candidates}
    cv_people, cv_targets = 0, 0
    tests = {}
    validation = {}
    winner = None
    for f in [1, 2, 3, 4, 0]:
        train = (fold != f) & (fold != 0)
        kernels = city_kernels(swipes, train & (swipes.getnnz(axis=1) > 0), ids, geo)
        models = read(work / f"classes-{f}.json")
        wide_fit = read(work / f"wide-{f}.json")
        models["wideK8"] = wide_fit["model"]
        people = np.flatnonzero(fold == f)
        counts = np.count_nonzero(panel[train], axis=0)
        if f:
            samples = list(
                profiles(panel, people, counts, models["K8"], "random", 5700 + f)
            )
            scores = evaluate(samples, candidates, models, kernels)
            for key, a in scores.items():
                cv[key].append(a)
            cv_people += len(samples)
            cv_targets += sum(len(p[2]) for p in samples)
            print(f"Completed development fold {f}", flush=True)
        else:
            validation = {key: np.concatenate(rows) for key, rows in cv.items()}
            winner = min(candidates, key=lambda key: validation[key][:, 0].mean())
            finalists = list(
                dict.fromkeys(
                    [Candidate(base) for base in BASES]
                    + [
                        Candidate(winner.base, maybe=winner.maybe),
                        Candidate(winner.base, winner.kernel, winner.strength),
                        winner,
                    ]
                )
            )
            print(f"Development selection: {winner.name}", flush=True)
            for protocol in PROTOCOLS:
                samples = list(
                    profiles(panel, people, counts, models["K8"], protocol, 5720)
                )
                scores = evaluate(samples, finalists, models, kernels)
                check_shared_scorer(catalog, models, winner, kernels, samples, scores)
                tests[protocol] = dict(
                    users=len(samples),
                    targets=sum(len(p[2]) for p in samples),
                    inputs={
                        str(n): sum(len(p[0]) == n for p in samples)
                        for n in range(1, 5)
                    },
                    scores=[
                        dict(
                            **summary(key.name, scores[key]),
                            versusK8=paired(scores[key], scores[Candidate("K8")]),
                        )
                        for key in finalists
                    ],
                )
            print(f"Selected {winner.name} on development data", flush=True)
    if winner is None:
        raise RuntimeError("Model selection incomplete")
    report = dict(
        selected=winner.name,
        holdoutTrainingUsers=wide_fit["trainingUsers"],
        holdoutTrainingSwipes=wide_fit["trainingSwipes"],
        sourceUsersWithSwipes=int(np.sum(swipes.getnnz(axis=1) > 0)),
        sourceSwipes=swipes.nnz,
        sourceDestinations=int(np.unique(swipes.indices).size),
        catalogUsers=int(np.sum(fold >= 0)),
        catalogSwipes=int(np.count_nonzero(panel)),
        developmentUsers=cv_people,
        developmentTargets=cv_targets,
        validation=[
            summary(key.name, rows)
            for key, rows in sorted(
                validation.items(), key=lambda pair: pair[1][:, 0].mean()
            )
        ],
        holdout=tests,
    )
    output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for path in ("work", "catalog", "output"):
        parser.add_argument(path, type=Path)
    args = parser.parse_args()
    main(args.work, args.catalog, args.output)
