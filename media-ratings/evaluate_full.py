"""Evaluate the K=8 learning curve and conditional item-similarity models on matched profiles."""

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path
from zipfile import ZipFile

import numpy as np

SCALE = np.arange(1, 11) / 2
STRENGTHS = (0.25, 0.5, 1.0, 1.5)


def read(path):
    return json.loads(path.read_text())


def cosine(embedding):
    norms = np.linalg.norm(embedding, axis=1, keepdims=True)
    x = embedding / np.maximum(norms, 1e-12)
    return x @ x.T


def factors(gram):
    eigen, vectors = np.linalg.eigh(gram)
    embedding = vectors[:, -32:] * np.sqrt(np.maximum(eigen[-32:], 0))
    embedding[np.diag(gram) == 0] = 0
    return cosine(embedding)


def dialogue_documents(archive, items):
    def normalized(title):
        title = re.sub(r"^(.*), (the|an|a)$", r"\2 \1", title.lower().strip())
        return re.sub(r"[^a-z0-9]", "", title)

    keys = {}
    for j, it in enumerate(items):
        title, year = it["title"][:-7], it["title"][-5:-1]
        keys[normalized(title.split(" (")[0]), year] = j
    documents = [[] for _ in items]
    with ZipFile(archive) as z:

        def records(name):
            with z.open("cornell movie-dialogs corpus/" + name + ".txt") as src:
                for line in src:
                    yield line.decode("latin-1").rstrip("\r\n").split(" +++$+++ ")

        matched = {}
        for mid, title, year, *_ in records("movie_titles_metadata"):
            key = normalized(title), year
            if key in keys:
                matched[mid] = keys[key]
        for lid, _, mid, _, line in records("movie_lines"):
            if mid in matched:
                documents[matched[mid]].append((int(lid[1:]), line))
    return [" ".join(line for _, line in sorted(lines)) for lines in documents]


def dialogue_kernel(archive, items):
    documents = dialogue_documents(archive, items)
    matched = sum(bool(d) for d in documents)
    counts = [Counter(re.findall(r"[a-z]{3,}", d.lower())) for d in documents]
    df = Counter()
    for c in counts:
        df.update(c.keys())
    tokens = [w for w, n in df.items() if 3 <= n < matched * 0.8]
    x = np.array(
        [[np.log1p(c[w]) * np.log(matched / df[w]) for w in tokens] for c in counts]
    )
    return factors(cosine(x)), matched


def kernels(root, items):
    cov = np.array(read(root / "large-reference.json")["components"][0]["covariance"])
    sd = np.sqrt(np.diag(cov))
    collaborative = factors(cov / np.outer(sd, sd))
    x = np.load(root / "genome.npy")
    observed = x.any(axis=1)
    x[observed] -= x[observed].mean(axis=0)
    content = factors(x @ x.T)
    hybrid = (collaborative + content) / 2
    dialogue, matched = dialogue_kernel(root / "dialogues.zip", items)
    return {
        "tags": content,
        "ratings": collaborative,
        "ratings+tags": hybrid,
        "ratings+tags+dialogue": (2 * hybrid + dialogue) / 3,
    }, matched


def profiles(matrix, indices, seed):
    rng = np.random.default_rng(seed)
    for i in indices:
        row = matrix[i]
        known = np.flatnonzero(row)
        given = rng.choice(known, 4, replace=False)
        targets = np.setdiff1d(known, given)
        yield given, row[given].astype(int) - 1, targets, row[targets].astype(int) - 1


def evaluate(model, samples, candidates):
    components = model["components"]
    e = np.array([c["probabilities"] for c in components])
    logprior = np.log([c["weight"] for c in components])
    means = e @ SCALE
    scores = {name: [] for name in ["K8", *candidates]}
    for given, values, targets, truth in samples:
        evidence = np.log(e[:, given, values])
        logw = logprior + evidence.sum(axis=1)
        post = np.exp(logw - logw.max())
        post /= post.sum()
        base = np.einsum("k,kjl->jl", post, e[:, targets])
        # Center each observed rating on its predictive mean from the other three.
        leave_one_out = logw[:, None] - evidence
        weights = np.exp(leave_one_out - leave_one_out.max(axis=0))
        residual = SCALE[values] - (weights * means[:, given]).sum(
            axis=0
        ) / weights.sum(axis=0)
        signals = {}
        for name in scores:
            probs = base
            if name != "K8":
                family, kernel, beta = candidates[name]
                if family not in signals:
                    signals[family] = kernel[np.ix_(targets, given)] @ np.linalg.solve(
                        kernel[np.ix_(given, given)] + 0.5 * np.eye(len(given)),
                        residual,
                    )
                tilted = np.clip(
                    beta * signals[family][:, None] * (SCALE - 2.75), -50, 50
                )
                probs = base * np.exp(tilted)
                probs = probs / probs.sum(axis=1, keepdims=True)
            scores[name].append(
                [
                    -np.log(probs[np.arange(len(truth)), truth]).mean(),
                    np.mean((probs @ SCALE - SCALE[truth]) ** 2),
                    np.mean((probs[:, 7:].sum(axis=1) - (SCALE[truth] >= 4)) ** 2),
                ]
            )
    return {name: np.array(rows) for name, rows in scores.items()}


def summary(label, scores):
    loss, mse, brier = scores.mean(axis=0)
    return dict(label=label, logLoss=loss, rmse=np.sqrt(mse), brier=brier)


def paired(a, b):
    diff = a[:, 0] - b[:, 0]
    margin = 1.96 * diff.std(ddof=1) / np.sqrt(len(diff))
    return dict(
        difference=diff.mean(), ci95=[diff.mean() - margin, diff.mean() + margin]
    )


def main(root, catalog, output):
    items = read(catalog)["items"]
    y = np.memmap(root / "ratings.u8", dtype="uint8", mode="r").reshape(-1, len(items))
    with (root / "split.csv").open() as src:
        split = list(csv.DictReader(src))
    val, test = [
        list(profiles(y, [int(r["row"]) for r in split if r["partition"] == p], seed))
        for p, seed in [("validation", 307), ("test", 308)]
    ]
    kernels_by_name, matched = kernels(root, items)
    candidates = {
        f"{name} × {beta:g}": (name, kernel, beta)
        for name, kernel in kernels_by_name.items()
        for beta in STRENGTHS
    }
    full = read(root / "large.json")
    validation = evaluate(full["model"], val, candidates)
    winners = {
        min(
            [k for k in candidates if candidates[k][0] == family],
            key=lambda k: validation[k][:, 0].mean(),
        )
        for family in kernels_by_name
    }
    winner = min(["K8", *sorted(winners)], key=lambda k: validation[k][:, 0].mean())
    tests = evaluate(full["model"], test, {k: candidates[k] for k in sorted(winners)})
    curve = []
    small = None
    for size in ["small", "quarter", "large"]:
        fit = read(root / (size + ".json"))
        scores = (
            tests["K8"] if size == "large" else evaluate(fit["model"], test, {})["K8"]
        )
        if small is None:
            small = scores
        curve.append(
            dict(
                **summary(f"K8 · {fit['users']:,} users", scores),
                users=fit["users"],
                ratings=fit["ratings"],
                versusSmall=paired(scores, small),
            )
        )
    release = read(root / "release.json")
    report = dict(
        given=4,
        validationUsers=len(val),
        testUsers=len(test),
        testRatings=sum(len(t[2]) for t in test),
        releaseUsers=release["users"],
        releaseRatings=release["ratings"],
        matchedDialogue=matched,
        selected=winner,
        learningCurve=curve,
        versusK8=paired(tests[winner], tests["K8"]),
        holdout=[summary(k, v) for k, v in tests.items()],
        validation=[summary(k, v) for k, v in validation.items()],
    )
    output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("root", "catalog", "output"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    main(args.root, args.catalog, args.output)
