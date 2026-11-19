"""Binary snapshot directions, conditioning, and packed evidence differ from explicit star ratings."""
import gzip
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import shard_evidence
from prepare_ao3 import calibrate_activity, evaluate, filtered_recall, fit_kudos, named_authors, test_cases as make_cases, work_fandoms, write_grids


class KudosTests(unittest.TestCase):
    def test_named_author_bylines(self):
        self.assertEqual(named_authors('Lee (handle), Anonymous, orphan_account, Other'), ['Lee (handle)', 'Other'])
        self.assertEqual(named_authors('old pseud (orphan_account)'), [])
        self.assertEqual(named_authors('Lee (name, other), Lee (name, other)'), ['Lee (name, other)'])

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
        self.assertEqual(data['packedLayout'], 'binary-overlap')
        self.assertEqual(data['cohortSize'], len(dense))
        for j in range(3):
            np.testing.assert_array_equal(data['counts'][j], np.bincount(dense[:, j], minlength=2))
            for i in range(j):
                joint = int(pairs[j*(j-1)//2 + i])
                a, b = data['counts'][i][1], data['counts'][j][1]
                observed = np.zeros((2, 2), dtype=int)
                np.add.at(observed, (dense[:, i], dense[:, j]), 1)
                np.testing.assert_array_equal(observed, [[len(dense)-a-b+joint,b-joint],[a-joint,joint]])

    def test_sharded_overlaps_preserve_pair_order(self):
        rng = np.random.default_rng(62)
        x = csr_matrix(rng.integers(0, 2, size=(50, 17)), dtype=np.int32)
        with TemporaryDirectory() as temp:
            path = Path(temp) / 'kudos.json'
            write_grids(path, x, [dict(itemId=str(i)) for i in range(17)])
            shard_evidence(path, chunk_bytes=16)
            manifest = json.loads(path.read_text())
            self.assertEqual(manifest['pairsPerFile'], 8)
            encoded = [np.frombuffer(gzip.decompress((path.parent / part).read_bytes()), '<u2')
                       for part in manifest['packedFiles']]
        both = (x.T @ x).toarray()
        np.testing.assert_array_equal(np.concatenate(encoded), both[np.tril_indices(17, -1)])

    def test_crossovers_and_filtered_recommendations(self):
        self.assertEqual(work_fandoms({'Fandoms': 'Naruto, Worm - Wildbow, Worm (Parahumans)'}), ['Naruto', 'Worm'])
        self.assertEqual(work_fandoms({'Fandoms': 'Not Naruto, Unknown'}), [])
        self.assertEqual(work_fandoms({'Fandoms': 'Merlin (TV), Merlin (BBC), Star Trek (2009)'}),
                         ['Merlin (BBC)', 'Star Trek'])
        self.assertEqual(work_fandoms({'Fandoms': 'Merlin (TV) RPF, Star Trek RPF'}), [])
        # Twelve candidates in the fandom; a thirteenth supplied work outside it
        # favors the class that gives the hidden title a high probability.
        p = np.full((2, 13), 0.2)
        p[:, 0], p[:, 12] = [0.001, 1 - 0.001], [0.001, 1 - 0.001]
        model = (np.asarray([0.90, 0.10]), p, 1)
        group = np.arange(12)
        positive = [(np.array([12]), np.array([0]))]
        result = filtered_recall(model, positive, group)
        self.assertEqual((result['crossFandomReaders'], result['crossFandomRecallAt10']), (1, 1.))
        pooled = (np.ones(1), (model[0] @ p)[None,:], 1)
        self.assertEqual(filtered_recall(pooled, positive, group)['recallAt10'], 0.)


if __name__ == '__main__':
    unittest.main()
