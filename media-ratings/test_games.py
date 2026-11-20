"""Check Steam vote cleaning and agreement between model selection and browser prediction."""
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from typing import Any
import unittest

import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import fit_mixture

from fit_games import RIDGE, similarity_scores
from game_scores import recorded_scores, sparse_contexts
from game_pooling import approval_prior, attach_approval, class_prior
from evaluate_game_extremes import pool_class_odds
from prepare_games import collect


class GamesTests(unittest.TestCase):
    def test_unanimous_sparse_votes_shrink_more_and_have_wider_intervals(self):
        counts = np.array([[4, 15], [8, 11], [19, 9], [12, 39], [0, 25], [0, 250]])
        items: list[dict[str, Any]] = [dict(annotations=dict(ratingCount=int(n))) for n in counts.sum(axis=1)]
        fit = {}
        shapes = approval_prior(counts)
        attach_approval(dict(items=items, fit=fit), counts, shapes)
        small, large = [it['annotations']['approval'] for it in items[-2:]]
        self.assertLess(small['mean'], large['mean'])
        self.assertGreater(small['upper']-small['lower'], large['upper']-large['lower'])
        self.assertLess(large['upper'], 1.)
        prior_counts = class_prior(counts, shapes, 16)
        np.testing.assert_allclose(prior_counts.sum(axis=1), 16)
        np.testing.assert_allclose(prior_counts[-1, 1]/16, large['mean'], atol=1e-9)
        self.assertEqual(small['negative'], 0)

    def test_targeted_evaluation_keeps_each_sparse_vote_out_of_its_own_context(self):
        profiles = csr_matrix([[2, 1, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0], [2, 2, 2, 1, 2, 1]])
        cases = sparse_contexts(profiles, np.array([True, True, False, False, False, False]), 42)
        self.assertEqual([len(group) for group in cases], [1, 2, 0, 0, 2])
        for group in cases:
            for given, _, target, _ in group:
                self.assertNotIn(target[0], given)

    def test_unanimity_cannot_identify_a_within_game_class_contrast(self):
        counts = np.array([[0, 40], [10000, 40000]])
        positive = np.array([[.8, .7], [.99, .9]])
        model = (np.array([.4, .6]), np.stack([1-positive, positive], axis=2), 3)
        self.assertIs(pool_class_odds(model, counts, (6, 2), 0), model)
        _, emissions, _ = pool_class_odds(model, counts, (6, 2), 4)
        np.testing.assert_allclose(emissions[:, 0, 1], 46/48)
        np.testing.assert_allclose(emissions[:, 1, 1], positive[:, 1], atol=.0002)

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
        batch = recorded_scores(cases*2, features @ features.T, (weights, emissions, 1))
        original = similarity_scores((weights, emissions, 1), cases, {'reviews': features @ features.T}, [1])
        np.testing.assert_allclose([batch[0].mean(), batch[1].mean()], original['reviews', 1][0, :2])
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
