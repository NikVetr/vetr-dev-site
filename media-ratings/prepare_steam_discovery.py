"""Prepare sparse review-choice associations from the cleaned Steam graph.

Use prepare_games.py's full inventory.json and profiles.npz. Rows of the input
are players, nonzeros are explicit up/down reviews. No vote value enters the
association model. See discovery-study.md for assumptions and reproduction.
"""

import argparse
import json
from pathlib import Path
from typing import TypedDict

import numpy as np
from scipy import sparse

NEIGHBORS = 64
PRIOR_REVIEWS = 50
UNITS = 10_000_000


class ReviewChoiceData(TypedDict):
    kind: str
    units: int
    ids: list[str]
    counts: list[int]
    excess: list[list[int]]


def co_reviews(profiles, items, included=None) -> ReviewChoiceData:
    n, d = profiles.shape
    if d != len(items) or included is not None and included.shape != (n,):
        raise ValueError("Game or respondent dimensions differ from fitted inventory")
    counts = np.zeros(d, dtype=np.int64)
    together = np.zeros((d, d))
    for start in range(0, n, 100_000):
        block = profiles[start : start + 100_000]
        if included is not None:
            block = block[included[start : start + len(block.indptr) - 1]]
        counts += np.bincount(block.indices, minlength=d)
        if len(block.data) and (block.data.min() < 1 or block.data.max() > 2):
            raise ValueError(
                "Steam profiles should encode explicit binary votes as 1 or 2"
            )
        sizes = np.diff(block.indptr)
        multi = block[sizes >= 2].astype(float)
        multi.data.fill(1)
        # Each reviewer of an anchor contributes one unit divided among their
        # other games, so prolific reviewers do not dominate the co-review counts.
        weight = 1 / np.maximum(1, sizes[sizes >= 2] - 1)
        together += (multi.T @ multi.multiply(weight[:, None])).toarray()
    np.fill_diagonal(together, 0.0)
    if np.any(counts == 0):
        raise ValueError("Every catalog title requires positive training support")
    prior = counts / counts.sum()
    conditional = (together + PRIOR_REVIEWS * prior) / (
        together.sum(axis=1, keepdims=True) + PRIOR_REVIEWS
    )
    excess = np.maximum(0, conditional - prior)
    rows = []
    for row in excess:
        neighbors = np.argsort(-row, kind="stable")[:NEIGHBORS]
        values = []
        for j in neighbors:
            value = round(float(row[j]) * UNITS)
            if value > 0:
                values.extend([int(j), value])
        rows.append(values)
    return ReviewChoiceData(
        kind="steam-co-review",
        units=UNITS,
        ids=[it["itemId"] for it in items],
        counts=counts.tolist(),
        excess=rows,
    )


def load(raw):
    items = json.loads((raw / "inventory.json").read_text())["items"]
    profiles = sparse.load_npz(raw / "profiles.npz").tocsr()
    if not profiles.has_canonical_format or len(items) != profiles.shape[1]:
        raise ValueError("Expected canonical player profiles in inventory order")
    if not np.array_equal(
        np.bincount(profiles.indices, minlength=len(items)),
        [it["annotations"]["ratingCount"] for it in items],
    ):
        raise ValueError("Review counts do not reproduce the catalog")
    return profiles, items


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    matrix, shelf = load(args.raw)
    result = co_reviews(matrix, shelf)
    args.output.write_text(json.dumps(result, separators=(",", ":")) + "\n")
