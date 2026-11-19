"""Select an ordinal rating/metadata similarity adjustment for a fitted latent-class catalog."""
from collections import Counter

import numpy as np
from scipy import sparse

from evaluate_full import evaluate, paired, summary
from fit_catalog import fit_mixture, scoring_cases
from fit_games import RIDGE, embedding, similarity_features


NAMES = {'reviews': 'Rating similarity', 'reviewsAndMetadata': 'Rating + metadata similarity'}
# Express the tilt on the 1–5 scale and convert to the actual scale before fitting.
# Both the observed residual and tilt outcome change units with the score scale.
STRENGTHS = (0.125, 0.25, 0.5, 1., 2., 4.)


def metadata_features(items):
    rows = []
    for item in items:
        attrs = item['annotations']
        labels = {f'{field}:{value}' for field in ('genres', 'authors') for value in attrs.get(field, [])}
        labels.update(f'{field}:{attrs[field]}' for field in ('collection', 'format') if attrs.get(field))
        if 'year' in attrs:
            labels.add(f"decade:{attrs['year'] // 10}")
        if attrs.get('episodes', 0) > 0:
            labels.add(f"episodes-log2:{int(np.log2(attrs['episodes']))}")
        rows.append(labels)
    return label_features(rows)


def shared_label_vectors(rows):
    counts = Counter(tag for row in rows for tag in row)
    columns = {tag: index for index, tag in enumerate(sorted(tag for tag, n in counts.items() if n >= 2))}
    coords = [(i, columns[tag], np.log1p(len(rows) / counts[tag]))
              for i, row in enumerate(rows) for tag in sorted(row) if tag in columns]
    if not coords:
        raise ValueError('Metadata similarity requires shared annotations')
    r, c, v = zip(*coords)
    design = sparse.csr_matrix((v, (r, c)), shape=(len(rows), len(columns)))
    norm = np.sqrt(np.asarray(design.multiply(design).sum(axis=1)).ravel())
    return design.multiply((1 / np.maximum(norm, 1.e-12))[:, None]).tocsr()


def label_features(rows):
    unit = shared_label_vectors(rows)
    return embedding((unit @ unit.T).toarray())


def fitted_classes(train, levels, k, seed):
    weights, emissions, _ = fit_mixture(train, levels, k, seed)
    return {'components': [{'weight': w, 'probabilities': row} for w, row in zip(weights, emissions)]}


def add_similarity(catalog, report, profiles):
    """Extend the original development CV and locked holdout, preserving their exact baseline cases."""
    scale = np.array(catalog['scale'])
    k, seed, threshold = report['selectedK'], catalog['fit']['seed'], report['brierThreshold']
    n = len(profiles.indptr) - 1
    if n != catalog['fit']['users'] or profiles.nnz != catalog['fit']['ratings']:
        raise ValueError('Profile cohort differs from the fitted catalog')
    rng = np.random.default_rng(seed)
    test, development = np.split(rng.permutation(n), [max(1, n // 5)])
    baseline = f'Latent class, K={k}'
    content = metadata_features(catalog['items'])
    strengths = [s * (4. / (scale[-1] - scale[0])) ** 2 for s in STRENGTHS]
    candidates = {(family, strength): f'{name}, tilt {strength:.6g}'
                  for family, name in NAMES.items() for strength in strengths}
    cv = {}
    for fold, valid in enumerate(np.array_split(development, 3)):
        train = profiles[np.setdiff1d(development, valid)]
        cases = scoring_cases(profiles, valid[:2000], rng)
        model = fitted_classes(train, len(scale), k, seed + fold)
        vectors = similarity_features(train, content)
        kernels = {key: matrix @ matrix.T for key, matrix in vectors.items()}
        params = {label: (family, kernels[family], strength) for (family, strength), label in candidates.items()}
        scores = evaluate(model, cases, params, scale=scale, threshold=threshold, baseline=baseline)
        for key, values in scores.items():
            cv.setdefault(key, []).append(values)
        print(f'Completed similarity fold {fold+1} on {len(cases)} validation respondents', flush=True)
    cv_scores = {label: summary(label, np.concatenate(parts)) for label, parts in cv.items()}
    prior_cv = next(row for row in report['cv'] if row['label'] == baseline)
    if not np.isclose(cv_scores[baseline]['logLoss'], prior_cv['logLoss'], rtol=1.e-8):
        raise ValueError('Similarity comparison did not reproduce baseline cross-validation cases')
    winner = min(candidates, key=lambda key: cv_scores[candidates[key]]['logLoss'])
    family, beta = winner
    label = candidates[winner]
    cases = scoring_cases(profiles, test, rng)
    model = fitted_classes(profiles[development], len(scale), k, seed)
    vectors = similarity_features(profiles[development], content)[family]
    held = evaluate(model, cases, {label: (family, vectors @ vectors.T, beta)},
                    scale=scale, threshold=threshold, baseline=baseline)
    base = next(row for row in report['holdout'] if row['label'] == baseline)
    if not np.isclose(held[baseline][:, 0].mean(), base['logLoss'], rtol=1.e-8):
        raise ValueError('Similarity comparison did not reproduce baseline holdout cases')
    diff = paired(held[label], held[baseline])
    accepted = cv_scores[label]['logLoss'] < prior_cv['logLoss'] and held[label][:, 0].mean() < base['logLoss']
    if accepted:
        final = similarity_features(profiles, content)[family]
        key = 'ratingsMetadata' if family == 'reviewsAndMetadata' else 'ratingsSimilarity'
        catalog['models'][key] = dict(kind='class-similarity', label=NAMES[family], base='latentClass',
                                      features=final.round(9).tolist(), strength=beta, ridge=RIDGE)
        catalog['defaultModel'] = key
    for selection in (catalog['selection'], report):
        selection['model'] = catalog['defaultModel']
        selection['cv'] = sorted([*selection['cv'], *(cv_scores[t] for t in candidates.values())],
                                 key=lambda row: row['logLoss'])
        selection['holdout'] = [*selection['holdout'], summary(label, held[label])]
    report['similarity'] = dict(selectedFamily=family, strength=float(beta), ridge=RIDGE,
                                betterOnValidationAndTest=bool(accepted), pairedRespondentLogLoss=diff)
    print(catalog['name'], label, report['similarity'], flush=True)
