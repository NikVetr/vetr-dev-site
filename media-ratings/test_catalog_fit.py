"""Regression checks for the sparse design and co-rating export used by new domains."""
import gzip
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import fit_mixture, scoring_cases, write_evidence


class CatalogFitTests(unittest.TestCase):
    def test_pair_grids_match_direct_tabulation_in_both_axes(self):
        # Asymmetric ratings expose category and item transpositions; >8 items
        # exercises the boundary between output blocks.
        rng = np.random.default_rng(341)
        data = rng.integers(0, 4, size=(73, 11))
        items = [dict(itemId=str(i)) for i in range(data.shape[1])]
        with TemporaryDirectory() as folder:
            path = Path(folder) / 'sample.json'
            write_evidence(path, csr_matrix(data), items, [1, 2, 3])
            evidence = json.loads(path.read_text())
            packed = np.frombuffer(gzip.decompress((path.parent / evidence['packedFile']).read_bytes()),
                                   dtype='<u2').reshape(-1, 3, 3)
        self.assertEqual(len(packed), 55)
        for j in range(11):
            np.testing.assert_array_equal(evidence['counts'][j], np.bincount(data[:, j], minlength=4)[1:])
            for i in range(j):
                paired = (data[:, i] > 0) & (data[:, j] > 0)
                expected = np.zeros((3, 3), dtype=int)
                np.add.at(expected, (data[paired, i]-1, data[paired, j]-1), 1)
                np.testing.assert_array_equal(expected, packed[j*(j-1)//2 + i])

    def test_sparse_fit_resolves_opposed_tastes_and_masks_targets(self):
        high = np.tile([3, 1], 4)
        low = np.tile([1, 3], 4)
        data = csr_matrix(np.repeat([high, low], 60, axis=0))
        weights, probabilities, _ = fit_mixture(data, 3, 2, 25)
        posterior = weights * probabilities[:, 0, 2]
        self.assertGreater((posterior @ probabilities[:, 1, 0]) / posterior.sum(), 0.75)
        cases = scoring_cases(data, [0, 60], np.random.default_rng(2))
        for given, _, targets, _ in cases:
            self.assertFalse(set(given) & set(targets))
            self.assertEqual(len(given), 4)
            self.assertEqual(len(targets), 4)


if __name__ == '__main__':
    unittest.main()
