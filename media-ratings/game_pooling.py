"""Hierarchical smoothing of Steam review probabilities across games and taste classes."""
import json

import numpy as np
from scipy import sparse
from scipy.optimize import minimize
from scipy.special import betaln, digamma
from scipy.stats import beta


def load_inputs(raw, catalog_path):
    catalog = json.loads(catalog_path.read_text())
    items = json.loads((raw/'inventory.json').read_text())['items']
    if [i['itemId'] for i in catalog['items']] != [i['itemId'] for i in items]:
        raise ValueError('Sparse matrix columns and game catalog IDs must match in order')
    profiles = sparse.load_npz(raw/'profiles.npz').tocsr()
    if profiles.shape[1] != len(items) or not profiles.has_canonical_format or set(np.unique(profiles.data)) != {1, 2}:
        raise ValueError('Expected one column per game and explicit positive or negative reviews')
    return catalog, profiles


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n')


def votes(profiles):
    """Return the raw down/up review counts for each game in this respondent split."""
    index = 2 * profiles.indices + profiles.data - 1
    return np.bincount(index, minlength=2*profiles.shape[1]).reshape(-1, 2)


def approval_prior(counts):
    """Fit the common Beta distribution by beta-binomial marginal likelihood."""
    negative, positive = counts.T
    if len(counts) < 2 or np.any(counts < 0) or np.any(counts.sum(axis=0) == 0):
        raise ValueError('Fitting the approval prior requires multiple games and both review outcomes')

    def objective(log_shapes):
        a, b = np.exp(log_shapes)
        value = np.mean(betaln(a, b) - betaln(positive+a, negative+b))
        total_term = digamma(positive + negative + a + b) - digamma(a+b)
        grad = [a*np.mean(digamma(a)-digamma(positive+a)+total_term),
                b*np.mean(digamma(b)-digamma(negative+b)+total_term)]
        return value, grad

    # The combinatorial term for each game is constant in a and b.
    fit = minimize(objective, np.log([5., 1.]), jac=True, method='L-BFGS-B',
                   bounds=[(-12, 15)]*2, options={'ftol': 1e-15, 'gtol': 1e-7})
    if not fit.success or np.any(np.abs(fit.jac) > 1e-3):
        raise ArithmeticError(f'Beta-binomial prior fit failed: {fit.message}, gradient {fit.jac}')
    return np.exp(fit.x)


def class_prior(counts, shapes, strength):
    """Prior category counts for each class, centered on a game's posterior recommendation rate."""
    a, b = shapes
    posterior = counts + np.array([b, a])
    totals = counts.sum(axis=1, keepdims=True)
    if strength == 'adaptive':
        strength = 16 + 240 * 250 / (250 + totals)
    return strength * posterior / posterior.sum(axis=1, keepdims=True)


def attach_approval(catalog, counts, shapes):
    a, b = shapes
    negative, positive = counts.T
    lower, upper = beta.interval(.95, positive+a, negative+b)
    mean = (positive+a) / (negative+positive+a+b)
    prior = dict(family='beta-binomial', alpha=float(a), beta=float(b), games=len(counts), level=.95)
    catalog['fit']['approvalPrior'] = prior
    for item, up, down, avg, lo, hi in zip(catalog['items'], positive, negative, mean, lower, upper, strict=True):
        if up + down != item['annotations']['ratingCount']:
            raise ValueError(f"Game review total mismatch for {item['itemId']}")
        item['annotations']['approval'] = dict(positive=int(up), negative=int(down), mean=round(float(avg), 9),
                                                lower=round(float(lo), 9), upper=round(float(hi), 9))
    return prior
