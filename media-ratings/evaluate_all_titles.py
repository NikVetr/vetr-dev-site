"""Test whether ratings outside the displayed catalog improve film-similarity features."""

import argparse
from array import array
import csv
import io
import json
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from scipy.sparse import csr_matrix

from evaluate_full import cosine, evaluate, factors, paired, profiles, read, summary


def read_matrix(archive, excluded, displayed):
    # MovieLens streams in user order. Keep the reserved respondents out of every feature.
    ptr = [0]
    columns = array("i")
    values = array("f")
    last = None
    total = 0
    with ZipFile(archive) as z:
        with z.open("ml-25m/movies.csv") as f:
            ids = {
                int(r["movieId"]): i
                for i, r in enumerate(
                    csv.DictReader(io.TextIOWrapper(f, encoding="utf8"))
                )
            }
        with z.open("ml-25m/ratings.csv") as f:
            next(f)
            for line in f:
                user, film, value, _ = line.split(b",")
                total += 1
                if user in excluded:
                    continue
                if user != last:
                    if last is not None:
                        ptr.append(len(values))
                    last = user
                columns.append(ids[int(film)])
                values.append(float(value))
    ptr.append(len(values))
    return (
        csr_matrix(
            (np.frombuffer(values, np.float32), np.frombuffer(columns, np.int32), ptr),
            shape=(len(ptr) - 1, len(ids)),
        ),
        [ids[int(it["itemId"])] for it in displayed],
        total,
    )


def item_factors(x, catalog_indices):
    """Center observed stars on regularized user and item biases, then randomized rank-32 SVD."""
    x = x.copy().tocsr()
    row = np.repeat(np.arange(x.shape[0], dtype=np.int32), np.diff(x.indptr))
    col = x.indices
    ratings = x.data - x.data.mean()
    count_user = np.bincount(row, minlength=x.shape[0]) + 10
    count_item = np.bincount(col, minlength=x.shape[1]) + 10
    user = np.zeros(x.shape[0])
    item = np.zeros(x.shape[1])
    for _ in range(4):
        user = (
            np.bincount(row, weights=ratings - item[col], minlength=x.shape[0])
            / count_user
        )
        item = (
            np.bincount(col, weights=ratings - user[row], minlength=x.shape[1])
            / count_item
        )
    x.data[:] = ratings - user[row] - item[col]
    rng = np.random.default_rng(741)
    omega = rng.standard_normal((x.shape[1], 40), dtype=np.float32)
    q = np.linalg.qr(x @ omega, mode="reduced")[0]
    for _ in range(2):
        q = np.linalg.qr(x @ (x.T @ q), mode="reduced")[0]
    v, sing, _ = np.linalg.svd(x.T @ q, full_matrices=False)
    return cosine(v[catalog_indices, :32] * sing[:32])


def main(root, archive, catalog, output):
    items = read(catalog)["items"]
    with (root / "split.csv").open() as src:
        split = list(csv.DictReader(src))
    users = (root / "users.csv").read_text().splitlines()[1:]
    excluded = {users[int(r["row"])].split(",")[0].encode() for r in split}
    x, ids, total = read_matrix(archive, excluded, items)
    restricted = x[:, ids]
    genome = np.load(root / "genome.npy")
    seen = genome.any(axis=1)
    genome[seen] -= genome[seen].mean(axis=0)
    tags = factors(genome @ genome.T)
    candidates = {}
    for label, mat, select in [
        ("500 films", restricted, list(range(len(ids)))),
        ("all films", x, ids),
    ]:
        kernel = (item_factors(mat, select) + tags) / 2
        candidates[label] = (label, kernel, 0.5)
    y = np.memmap(root / "ratings.u8", dtype="uint8", mode="r").reshape(-1, len(items))
    val = [int(r["row"]) for r in split if r["partition"] == "validation"]
    scores = evaluate(
        read(root / "large.json")["model"], profiles(y, val, 307), candidates
    )
    output.write_text(
        json.dumps(
            dict(
                sourceRatings=total,
                trainingRatings=x.nnz,
                catalogTrainingRatings=restricted.nnz,
                trainingTitles=int(np.unique(x.indices).size),
                validationUsers=len(val),
                scores=[summary(k, v) for k, v in scores.items()],
                allVersusCatalog=paired(scores["all films"], scores["500 films"]),
            ),
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ("root", "archive", "catalog", "output"):
        parser.add_argument(key, type=Path)
    args = parser.parse_args()
    main(args.root, args.archive, args.catalog, args.output)
