import json
import subprocess
import unittest
from pathlib import Path

import numpy as np

from evaluate_full import evaluate
from evaluate_metadata_transfer import FAMILIES, encode_features, family_vectors, metadata_vectors


class MetadataTransferTests(unittest.TestCase):
    def test_sparse_roles_and_blank_rows(self):
        items = [
            {'annotations': {'authors': ['Jane'], 'genres': ['Mystery']}},
            {'annotations': {'authors': ['Jane'], 'genres': ['Fantasy']}},
            {'annotations': {'authors': ['Mary'], 'genres': ['Mystery']}},
            {'annotations': {'authors': ['Unique'], 'genres': []}},
        ]
        x = metadata_vectors(items, None)
        self.assertGreater(x[0] @ x[1], 0)
        self.assertEqual(x[1] @ x[2], 0)
        self.assertEqual(np.linalg.norm(x[3]), 0)
        joined = family_vectors('both', x)
        np.testing.assert_allclose(joined @ joined.T, (1 + x @ x.T)/2)

    def test_offline_scoring_and_exported_model_match_cli(self):
        items = [dict(itemId=str(i), title=f'Item {i}', annotations={'genres': ['A' if i%2 else 'B']})
                 for i in range(5)]
        scale = np.array([1, 2, 3])
        probs = np.random.default_rng(31).dirichlet([1, 2, 2], size=(2, 5))
        base = dict(kind='latent-class', components=[
            dict(weight=w, probabilities=p.tolist()) for w, p in zip([.3, .7], probs)])
        given, values = np.arange(4), np.array([0, 1, 2, 1])
        case = (given, values, np.array([4]), np.array([0]))
        for family in FAMILIES:
            with self.subTest(family=family):
                x = family_vectors(family, metadata_vectors(items, None))
                model = dict(kind='class-similarity', base='base', features=encode_features(x), ridge=.5, strength=.5)
                catalog = dict(name='Test', items=items, scale=scale.tolist(), defaultModel='adjusted',
                               models=dict(base=base, adjusted=model))
                request = dict(catalog=catalog, ratings={str(i): int(v+1) for i, v in zip(given, values)}, threshold=3)
                response = subprocess.run(['node', str(Path(__file__).with_name('cli.mjs'))],
                                          input=json.dumps(request), text=True, capture_output=True, check=True)
                (forecast,) = json.loads(response.stdout)['predictions']
                wanted = [-np.log(forecast['probabilities'][0]), (forecast['expected']-1)**2, forecast['chance']**2]
                scores = evaluate(base, [case], {family: (family, x @ x.T, .5)}, scale, 3)
                np.testing.assert_allclose(scores[family][0], wanted, atol=1.e-9)


if __name__ == '__main__':
    unittest.main()
