"""Binary snapshot directions, conditioning, and packed evidence differ from explicit star ratings."""
import gzip
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import numpy as np
from scipy.sparse import csr_matrix

from prepare_ao3 import calibrate_activity, evaluate, fit_kudos, test_cases as make_cases, write_grids


class KudosTests(unittest.TestCase):
    def test_masked_positives_and_all_other_opportunities(self):
        x = csr_matrix([[1, 0, 1, 0], [0, 1, 0, 0], [1, 1, 1, 1]], dtype=np.int32)
        cases = make_cases(x, [0, 1, 2], 33)
        self.assertEqual(len(cases), 2)
        for (given, truth), row in zip(cases, [0, 2]):
            self.assertFalse(set(given) & set(truth))
            np.testing.assert_array_equal(np.sort(np.r_[given, truth]), x[row].indices)
        p = np.array([[0.11, 0.04, 0.8, 0.3], [0.6, 0.32, 0.2, 0.29]])
        weights = np.array([0.3, 0.7])
        scores = evaluate((weights, p, 1), [(np.array([0]), np.array([1]))])
        post = weights * p[:, 0]
        pred = (post / post.sum()) @ p
        self.assertAlmostEqual(scores['logLoss'], -np.log([pred[1], 1 - pred[2], 1 - pred[3]]).mean())
        self.assertAlmostEqual(scores['brier'], np.mean([(1 - pred[1])**2, pred[2]**2, pred[3]**2]))
        self.assertEqual(scores['recallAt10'], 1.)

    def test_activity_calibration_preserves_title_marginals(self):
        weights = np.array([0.4, 0.6])
        p = np.array([[0.72, 0.5, 0.09], [0.02, 0.04, 0.2]])
        for strength in [0., 0.5, 1.]:
            _, adjusted, _ = calibrate_activity((weights, p, 1), strength)
            np.testing.assert_allclose(weights @ adjusted, weights @ p, atol=1.e-11)
            if strength:
                self.assertLess(np.ptp(adjusted.sum(1)), np.ptp(p.sum(1)))

    def test_fit_and_pair_grids(self):
        matrix = np.array([[1, 0, 1], [1, 0, 1], [0, 1, 0], [1, 0, 0]], dtype=np.int32)
        x = csr_matrix(np.tile(matrix, (40, 1)))
        w, p, _ = fit_kudos(x, 2, 11)
        post = w * p[:, 2]
        self.assertGreater(post @ p[:, 0] / post.sum(), post @ p[:, 1] / post.sum())
        with TemporaryDirectory() as temp:
            path = Path(temp) / 'kudos.json'
            write_grids(path, x, [dict(itemId=str(i)) for i in range(3)])
            data = json.loads(path.read_text())
            pairs = np.frombuffer(gzip.decompress((path.parent / data['packedFile']).read_bytes()), '<u2')
        dense = x.toarray()
        pairs = pairs.reshape(-1, 2, 2)
        for j in range(3):
            np.testing.assert_array_equal(data['counts'][j], np.bincount(dense[:, j], minlength=2))
            for i in range(j):
                observed = np.zeros((2, 2), dtype=int)
                np.add.at(observed, (dense[:, i], dense[:, j]), 1)
                np.testing.assert_array_equal(observed, pairs[j*(j-1)//2 + i])


if __name__ == '__main__':
    unittest.main()
