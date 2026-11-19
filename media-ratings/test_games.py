"""Check Steam vote cleaning and agreement between model selection and browser prediction."""
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest

import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import fit_mixture

from fit_games import RIDGE, similarity_scores
from prepare_games import collect


class GamesTests(unittest.TestCase):
    def test_duplicate_review_ids_and_conflicting_pairs_never_contribute_a_vote(self):
        players = ['100', '101']
        edges = {players[0]: [[11, 20], [12, 21], [13, 22], [14, 22]],
                 players[1]: [[11, 23], [15, 24], [16, 24]]}
        votes = {i: {'voted_up': i != 13} for i in (11, 12, 13, 14, 15, 16)}
        with TemporaryDirectory() as folder:
            raw = Path(folder)
            (raw / 'votes').write_text(json.dumps(votes))
            (raw / 'edges').write_text(json.dumps(edges))
            counts, ids, profiles, audit = collect(raw)
        self.assertEqual(counts, {21: 1, 24: 1})
        np.testing.assert_array_equal(ids, [21, 24])
        np.testing.assert_array_equal(profiles.toarray(), [[2, 0], [0, 2]])
        self.assertEqual(audit['excludedRepeatedReviewIds'], 1)
        self.assertEqual(audit['conflictingPlayerGames'], 1)
        self.assertEqual(audit['duplicateVotes'], 1)

    def test_frequency_weighted_mixture_matches_the_repeated_player_fit(self):
        rng = np.random.default_rng(2871)
        rows = rng.integers(0, 3, size=(37, 5))
        counts = rng.integers(1, 91, size=len(rows))
        initial = rng.integers(0, 6, size=len(rows))
        explicit = fit_mixture(csr_matrix(np.repeat(rows, counts, axis=0)), 2, 6, 81, np.repeat(initial, counts))
        weighted = fit_mixture(csr_matrix(rows), 2, 6, 81, initial, frequencies=counts)
        np.testing.assert_allclose(weighted[0], explicit[0], rtol=1.e-10)
        np.testing.assert_allclose(weighted[1], explicit[1], rtol=1.e-10)
        self.assertEqual(weighted[2], explicit[2])

    def test_binary_tilt_scoring_matches_served_implementation(self):
        weights = np.array([.25, .75])
        positive = np.array([[.4, .6, .25, .35, .55, .75], [.7, .2, .6, .75, .5, .3]])
        emissions = np.stack([1-positive, positive], axis=-1)
        features = np.array([[1, 0], [.8, .6], [0, 1], [-.8, .6], [-1, 0], [-.6, -.8]])
        cases = [(np.arange(4), np.array([0, 1, 1, 0]), np.array([4, 5]), np.array([1, 0]))]
        offline = similarity_scores((weights, emissions, 1), cases, {'reviews': features @ features.T}, [2])
        catalog = dict(name='Fixture', defaultModel='adjusted', scale=[0, 1],
                       items=[dict(itemId=str(i), title=str(i)) for i in range(6)],
                       models=dict(base=dict(kind='latent-class', components=[
                           dict(weight=float(w), probabilities=e.tolist()) for w, e in zip(weights, emissions)]),
                           adjusted=dict(kind='class-similarity', base='base', features=features.tolist(),
                                         ridge=RIDGE, strength=2)))
        request = dict(catalog=catalog, ratings=dict(zip(['0', '1', '2', '3'], [0, 1, 1, 0])))
        run = subprocess.run(['node', str(Path(__file__).with_name('cli.mjs'))], input=json.dumps(request),
                             text=True, capture_output=True, check=True)
        output = json.loads(run.stdout)
        actual = {row['itemId']: row['expected'] for row in output['predictions']}
        loss = -(np.log(actual['4']) + np.log1p(-actual['5']))/2
        mse = ((actual['4']-1)**2 + actual['5']**2)/2
        np.testing.assert_allclose(offline['reviews', 2][0], [loss, mse, mse], rtol=1.e-10)


if __name__ == '__main__':
    unittest.main()
