import unittest

import numpy as np
from scipy import sparse

from prepare_steam_discovery import co_reviews


class ReviewChoiceTest(unittest.TestCase):
    def test_profile_breadth_training_split_and_vote_direction(self):
        # A is reviewed alongside B,C once and alongside B once. Singletons
        # affect catalog popularity; the held-out fifth person contributes no edges.
        ratings = sparse.csr_matrix(
            [[1, 2, 1, 0], [2, 1, 0, 0], [0, 0, 0, 2], [2, 0, 0, 0], [0, 1, 2, 2]]
        )
        items = [{"itemId": str(i)} for i in range(4)]
        train = np.array([True, True, True, True, False])
        d = co_reviews(ratings, items, train)
        self.assertEqual(d["counts"], [3, 2, 1, 1])
        row = d["excess"][0]
        excess = dict(zip(row[::2], row[1::2]))
        self.assertEqual(set(excess), {1, 2})
        self.assertAlmostEqual(excess[1] / d["units"], (1.5 - 2 * 2 / 7) / 52, places=7)
        self.assertAlmostEqual(excess[2] / d["units"], (0.5 - 2 * 1 / 7) / 52, places=7)
        ratings.data = 3 - ratings.data
        self.assertEqual(co_reviews(ratings, items, train), d)


if __name__ == "__main__":
    unittest.main()
