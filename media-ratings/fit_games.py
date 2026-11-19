"""Select the Steam predictor on respondent-disjoint folds, then fit the catalog."""
from collections import Counter
from typing import Any

import numpy as np
from scipy.linalg import eigh
from scipy.special import expit, logit, softmax

from fit_catalog import fit_mixture, scoring_cases, score_model, summary

SCALE = np.array([0, 1])
STRENGTHS = (1, 2, 4)
RIDGE = .5


def embedding(gram):
    """Use the first 32 eigenvectors of the similarity matrix as item features."""
    n = len(gram)
    values, vecs = eigh(gram, subset_by_index=[max(0, n-32), n-1], check_finite=False)
    features = vecs * np.sqrt(values.clip(min=0))
    return features / np.maximum(np.linalg.norm(features, axis=1, keepdims=True), 1.e-12)


def content_vectors(items):
    labels = [set(f'{field}:{label}' for field in ('genres', 'modes', 'developers', 'tags')
                  for label in item['annotations'].get(field, [])) for item in items]
    counts = Counter(label for row in labels for label in row)
    columns = {label: i for i, label in enumerate(sorted(key for key, count in counts.items() if count >= 3))}
    values = np.zeros((len(labels), len(columns)))
    for i, row in enumerate(labels):
        for label in row:
            if label in columns:
                values[i, columns[label]] = np.log1p(len(labels) / counts[label])
    values /= np.maximum(np.linalg.norm(values, axis=1, keepdims=True), 1.e-12)
    return embedding(values @ values.T)


def similarity_features(train, content):
    residual = train.astype(float)
    counts = np.bincount(train.indices, minlength=train.shape[1])
    means = np.bincount(train.indices, weights=train.data, minlength=train.shape[1]) / np.maximum(counts, 1)
    residual.data -= means[residual.indices]
    gram = (residual.T @ residual).toarray()
    # Shrink correlations for sparse titles; use positive eigen-directions of off-diagonal agreement.
    norms = np.sqrt(16 + gram.diagonal())
    gram /= norms[:, None] * norms[None, :]
    np.fill_diagonal(gram, 0)
    reviews = embedding(gram)
    return {'reviews': reviews, 'reviewsAndMetadata': np.column_stack([np.sqrt(.7)*reviews, np.sqrt(.3)*content])}


def similarity_scores(model, cases, kernels, strengths):
    """Match core.mjs: leave-one-input-out residuals, ridge on supplied titles, binary exponential tilt."""
    weights, emissions, _ = model
    metrics = {(name, b): np.empty((len(cases), 3)) for name in kernels for b in strengths}
    for row, (given, values, targets, truth) in enumerate(cases):
        terms = np.log(emissions[:, given, values])
        joint = np.log(weights) + terms.sum(axis=1)
        prior = softmax(joint) @ emissions[:, targets, 1]
        residual = values - (softmax(joint[:, None] - terms, axis=0) * emissions[:, given, 1]).sum(axis=0)
        for name, kernel in kernels.items():
            coef = np.linalg.solve(kernel[np.ix_(given, given)] + RIDGE*np.eye(len(given)), residual)
            adjustment = kernel[np.ix_(targets, given)] @ coef
            for b in strengths:
                logits = logit(prior) + b*adjustment
                mse = np.mean((expit(logits)-truth)**2)
                metrics[name, b][row] = np.mean(np.logaddexp(0, logits)-truth*logits), mse, mse
    return metrics


def human_label(name, b):
    family = 'Review similarity' if name == 'reviews' else 'Review + metadata similarity'
    return f'{family}, tilt {b}'


def describe(label, metrics):
    result = summary(0, metrics)
    result['label'] = label
    return result


def fit_classes(train, k, seed):
    if k == 1:
        return fit_mixture(train, 2, 1, seed)
    # Random near-identical classes can satisfy the EM convergence criterion before
    # separating on sparse binary data. Seed soft groups by noisy approval tendency.
    count = np.diff(train.indptr)
    positive = np.asarray(train.sum(axis=1)).ravel() - count
    tendency = (positive + 1)/(count + 2) + np.random.default_rng(seed).normal(0, .15, len(count))
    initial = np.empty(len(count), dtype=np.int32)
    initial[np.argsort(tendency)] = np.arange(len(count))*k//len(count)
    return fit_mixture(train, 2, k, seed, initial_classes=initial)


def fit_games(items, profiles, seed=42):
    if not profiles.has_canonical_format or set(np.unique(profiles.data)) != {1, 2}:
        raise ValueError('Expected sparse profiles containing explicit positive and negative reviews')
    n = profiles.shape[0]
    rng = np.random.default_rng(seed)
    order = rng.permutation(n)
    test, development = order[:n//5], order[n//5:]
    eligible = np.diff(profiles.indptr) >= 5
    k_grid = (1, 2, 4, 8, 16)
    class_scores = {k: [] for k in k_grid}
    content = content_vectors(items)
    folds = []
    for fold, valid in enumerate(np.array_split(development, 3)):
        train = profiles[np.setdiff1d(development, valid)]
        cases = scoring_cases(profiles, valid[eligible[valid]][:2000], rng)
        fold_models = {}
        for k in k_grid:
            model = fit_classes(train, k, seed+fold)
            scores = score_model(model, cases, SCALE, 1)
            class_scores[k].append(scores)
            fold_models[k] = model
            print(f'fold {fold+1}, K={k}, iterations={model[2]}, loss={scores[:, 0].mean():.6f}', flush=True)
        features = similarity_features(train, content)
        folds.append((fold_models, cases, {key: v @ v.T for key, v in features.items()}))
    cv = {k: summary(k, np.concatenate(v)) for k, v in class_scores.items()}
    best = min(k_grid, key=lambda k: cv[k]['logLoss'])
    candidates = {}
    for fold_models, cases, kernels in folds:
        for key, scores in similarity_scores(fold_models[best], cases, kernels, STRENGTHS).items():
            candidates.setdefault(key, []).append(scores)
    trials = {key: describe(human_label(*key), np.concatenate(rows)) for key, rows in candidates.items()}
    selected = min(trials, key=lambda key: trials[key]['logLoss'])
    use_similarity = float(trials[selected]['logLoss']) < float(cv[best]['logLoss'])
    test_cases = scoring_cases(profiles, test[eligible[test]], rng)
    train = profiles[development]
    test_metrics = {}
    model = fit_classes(train, best, seed)
    pooled = fit_mixture(train, 2, 1, seed) if best != 1 else model
    test_metrics['Latent class, K=1'] = score_model(pooled, test_cases, SCALE, 1)
    test_metrics[f'Latent class, K={best}'] = score_model(model, test_cases, SCALE, 1)
    name, strength = selected
    vectors = similarity_features(train, content)[name]
    test_metrics[human_label(*selected)] = similarity_scores(model, test_cases, {name: vectors @ vectors.T}, [strength])[selected]
    ref = test_metrics[f'Latent class, K={best}'][:, 0]
    delta = test_metrics[human_label(*selected)][:, 0] - ref
    holdout = [describe(key, val) for key, val in test_metrics.items()]
    weights, probs, iterations = fit_classes(profiles, best, seed)
    components = [dict(weight=float(weights[c]), probabilities=probs[c].round(11).tolist())
                  for c in np.argsort(-weights)]
    models: dict[str, dict[str, Any]] = dict(latentClass=dict(kind='latent-class', strength=16, components=components))
    default = 'latentClass'
    if use_similarity:
        vectors = similarity_features(profiles, content)[name]
        default = 'ratingsTags' if name == 'reviewsAndMetadata' else 'ratingsSimilarity'
        models[default] = dict(kind='class-similarity', base='latentClass',
                               label='Reviews + game tags' if name == 'reviewsAndMetadata' else 'Reviews + game similarity',
                               features=vectors.round(9).tolist(),
                               strength=strength, ridge=RIDGE)
    selection = dict(model=default, metric='player-mean binary log loss', folds=3,
                     validationUsers=sum(len(v) for v in class_scores[best]), testUsers=len(test_cases),
                     testRatings=sum(len(case[3]) for case in test_cases),
                     cv=sorted([*cv.values(), *trials.values()], key=lambda v: v['logLoss']), holdout=holdout)
    catalog: dict[str, Any] = dict(items=items, scale=[0, 1], defaultModel=default, models=models, selection=selection,
                   fit=dict(users=n, ratings=profiles.nnz, iterations=iterations, seed=seed))
    report = dict(**selection, selectedK=best, selectedSimilarity=(name if use_similarity else None),
                  selectedStrength=(strength if use_similarity else 0), developmentUsers=len(development),
                  testPoolUsers=len(test), suppliedRatings=4, maxTargetRatings=12, brierThreshold=1,
                  similarityMinusClassLoss=float(delta.mean()), pairedPlayerSE=float(delta.std(ddof=1)/np.sqrt(len(delta))),
                  finalFit=catalog['fit'])
    return catalog, report
