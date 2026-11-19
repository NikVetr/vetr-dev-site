"""Prepare sparse explicit swipe categories for training on the wider Stravl release."""

import argparse
from array import array
from pathlib import Path

import numpy as np
from scipy.sparse import csr_matrix, save_npz

from prepare_stravl import swipe_profiles


def prepare(responses, destinations, output):
    titles = destinations.read_text(encoding="utf-8").splitlines()
    rows = [0]
    columns = array("i")
    values = array("b")
    for ratings in swipe_profiles(responses, len(titles)):
        for item in sorted(ratings):
            columns.append(item)
            values.append(ratings[item] + 1)  # 0 in sparse/dense storage means absent.
        rows.append(len(values))
    matrix = csr_matrix(
        (np.asarray(values), np.asarray(columns), rows),
        shape=(len(rows) - 1, len(titles)),
    )
    output.mkdir(parents=True, exist_ok=True)
    save_npz(output / "swipes.npz", matrix)
    # Column-major binary arrays let Matrix build the EM design without a dense
    # user x destination intermediate. The original city IDs are zero-based.
    design = csr_matrix(
        (
            np.ones(matrix.nnz, dtype=np.int8),
            matrix.indices * 3 + matrix.data - 1,
            matrix.indptr,
        ),
        shape=(len(rows) - 1, 3 * len(titles)),
    ).tocsc()
    for key, data in [
        ("dims", design.shape),
        ("i", design.indices),
        ("p", design.indptr),
    ]:
        np.asarray(data, dtype="<i4").tofile(output / f"swipes-{key}.bin")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("responses", "destinations", "output"):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    prepare(args.responses, args.destinations, args.output)
