"""Select and fit product-categorical mixtures on sparse respondent-by-item ratings.

Input data are CSR profiles. Missing entries are absent; stored category indices
are one-based. EM follows latent_class.R, including item-level shrinkage.
"""
import gzip
import json

import numpy as np
from scipy import sparse
from scipy.special import logsumexp


def category_design(profiles, levels):
    return sparse.csr_matrix((np.ones(profiles.nnz), profiles.indices * levels + profiles.data - 1,
                              profiles.indptr), shape=(profiles.shape[0], profiles.shape[1] * levels))


def fit_mixture(profiles, levels, k, seed):
    x = category_design(profiles, levels)
    counts = np.asarray(x.sum(axis=0)).reshape(-1, levels)
    global_counts = counts.sum(axis=0) + 0.5
    pooled = counts + 5 * global_counts / global_counts.sum()
    pooled /= pooled.sum(axis=1, keepdims=True)
    prior = 16 * pooled
    rng = np.random.default_rng(seed)
    resp = rng.exponential(size=(profiles.shape[0], k))
    resp /= resp.sum(axis=1, keepdims=True)
    previous = -np.inf
    for iteration in range(1, 501):
        weights = (resp.sum(axis=0) + 1) / (len(resp) + k)
        emissions = (x.T @ resp).T.reshape(k, -1, levels) + prior
        emissions /= emissions.sum(axis=2, keepdims=True)
        if k == 1:
            break
        logs = np.log(emissions)
        joint = x @ logs.reshape(k, -1).T + np.log(weights)
        margin = np.asarray(logsumexp(joint, axis=1, return_sign=False))
        objective = margin.sum() + (logs * prior).sum() + np.log(weights).sum()
        if objective < previous - 1.e-7 * x.nnz:
            raise ArithmeticError('Penalized EM likelihood decreased')
        if objective - previous <= 2.e-5 * x.nnz:
            break
        resp = np.exp(joint - margin[:, None])
        previous = objective
    else:
        raise ArithmeticError(f'EM convergence failed for K={k}')
    return weights, emissions, iteration


def scoring_cases(profiles, rows, rng):
    """Use four ratings to predict up to 12 uniformly chosen other ratings."""
    cases = []
    for row in rows:
        start, end = profiles.indptr[row:row + 2]
        if end - start < 5:
            continue
        pos = start + rng.choice(end - start, min(16, end - start), replace=False)
        i, y = profiles.indices[pos], profiles.data[pos] - 1
        cases.append((i[:4], y[:4], i[4:], y[4:]))
    if not cases:
        raise ValueError('Held-out split contains no respondents with five ratings')
    return cases


def score_model(model, cases, scale, threshold):
    weights, emissions, _ = model
    metrics = np.empty((len(cases), 3))
    for j, (given, values, targets, truths) in enumerate(cases):
        logp = np.log(weights) + np.log(emissions[:, given, values]).sum(axis=1)
        posterior = np.exp(logp - logsumexp(logp))
        probs = np.einsum('k,ktc->tc', posterior, emissions[:, targets, :])
        loss = -np.log(probs[np.arange(len(truths)), truths]).mean()
        mse = ((probs @ scale - scale[truths]) ** 2).mean()
        brier = ((probs[:, scale >= threshold].sum(axis=1) - (scale[truths] >= threshold)) ** 2).mean()
        metrics[j] = loss, mse, brier
    return metrics


def summary(k, metrics):
    loss, mse, brier = metrics.mean(axis=0)
    return dict(label=f'Latent class, K={k}', logLoss=float(loss), rmse=float(np.sqrt(mse)), brier=float(brier))


def fit_catalog(name, items, scale, profiles, seed=42):
    """Return the browser catalog and its reproducible respondent-disjoint evaluation."""
    scale = np.asarray(scale)
    levels = len(scale)
    if (levels < 2 or not np.all(np.isfinite(scale)) or np.any(np.diff(scale) <= 0)
            or not sparse.issparse(profiles) or profiles.format != 'csr'
            or not profiles.has_canonical_format or profiles.shape[1] != len(items)
            or not np.issubdtype(profiles.data.dtype, np.integer)
            or not profiles.nnz or profiles.data.min() < 1 or profiles.data.max() > levels):
        raise ValueError('Expected ordered scale and canonical sparse one-based category indices')
    profiles = profiles[np.diff(profiles.indptr) > 0]
    if len({it['itemId'] for it in items}) != len(items) or np.unique(profiles.indices).size != len(items):
        raise ValueError('Each unique catalog item needs observed ratings')
    n = profiles.shape[0]
    rng = np.random.default_rng(seed)
    order = rng.permutation(n)
    test_size = max(1, n // 5)
    test, development = order[:test_size], order[test_size:]
    threshold = scale[int(np.ceil(0.8 * levels)) - 1]
    k_grid = [1, 2, 4, 8, 16] if len(development) >= 10000 else [1, 2, 4, 8]
    scores = {k: [] for k in k_grid}
    for fold, valid in enumerate(np.array_split(development, 3)):
        train = profiles[np.setdiff1d(development, valid)]
        cases = scoring_cases(profiles, valid[:2000], rng)
        for k in k_grid:
            model = fit_mixture(train, levels, k, seed + fold)
            scores[k].append(score_model(model, cases, scale, threshold))
    cv = {k: summary(k, np.concatenate(parts)) for k, parts in scores.items()}
    best = min(k_grid, key=lambda k: cv[k]['logLoss'])
    test_cases = scoring_cases(profiles, test, rng)
    holdout = []
    for k in sorted({1, best}):
        model = fit_mixture(profiles[development], levels, k, seed)
        holdout.append(summary(k, score_model(model, test_cases, scale, threshold)))
    weights, probs, iterations = fit_mixture(profiles, levels, best, seed)
    components = [dict(weight=float(weights[c]), probabilities=probs[c].round(11).tolist())
                  for c in np.argsort(-weights)]
    selection = dict(model='latentClass', metric='user-mean category log loss', folds=3,
                     validationUsers=sum(len(v) for v in scores[best]), testUsers=len(test_cases),
                     testRatings=sum(len(v[3]) for v in test_cases),
                     cv=sorted(cv.values(), key=lambda s: s['logLoss']), holdout=holdout)
    catalog = dict(name=name, items=items, scale=scale.tolist(), defaultModel='latentClass',
                   models=dict(latentClass=dict(kind='latent-class', strength=16, components=components)),
                   selection=selection, fit=dict(users=n, ratings=profiles.nnz, iterations=iterations, seed=seed))
    report = dict(**selection, selectedK=best, cvPoolUsers=len(development), developmentUsers=len(development),
                  suppliedRatings=4, maxTargetRatings=12, brierThreshold=float(threshold),
                  finalFit=catalog['fit'])
    return catalog, report


def write_evidence(path, profiles, items, scale):
    """Compute every observed pair grid in bounded blocks; ship only aggregate counts."""
    levels, size = len(scale), len(items)
    x = category_design(profiles, levels).astype(np.int32).tocsc()
    counts = np.asarray(x.sum(axis=0)).reshape(size, levels).tolist()
    packed = path.with_suffix('.bin.gz')
    with packed.open('wb') as out, gzip.GzipFile(fileobj=out, mode='wb', mtime=0) as gz:
        for first in range(0, size, 8):
            stop = min(size, first + 8)
            block = (x[:, first*levels:stop*levels].T @ x[:, :stop*levels]).toarray()
            for j in range(first, stop):
                left = (j - first)*levels
                cells = block[left:left+levels, :j*levels].reshape(levels, j, levels).transpose(1, 2, 0)
                if cells.size and cells.max() > 65535:
                    raise ValueError('Co-rating cell exceeds the packed uint16 format')
                gz.write(cells.astype('<u2').tobytes())
    with path.open('w') as out:
        json.dump(dict(ids=[i['itemId'] for i in items], scale=list(scale), counts=counts,
                       packedFile=packed.name), out, separators=(',', ':'))
        out.write('\n')
