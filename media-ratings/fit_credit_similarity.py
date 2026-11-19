"""Compare the existing ordinal predictor to variants using shared creator or publisher credits."""
import numpy as np

from evaluate_full import evaluate, paired, summary
from fit_catalog import scoring_cases
from fit_games import similarity_features
from fit_ordinal_similarity import fitted_classes, label_features, metadata_features

FIELDS = ('authors', 'publishers', 'studios', 'directors', 'creators', 'cast', 'illustrators', 'translators', 'editors', 'contributors')
SHARES = (0., 0.25, 0.5, 1.)


def add_credit_similarity(catalog, report, profiles, credits):
    """Keep the existing collaborative model, CV splits, tilt, and total metadata weight fixed."""
    items = catalog['items']
    if set(credits) != {it['itemId'] for it in items}:
        raise ValueError('Credits and fitted inventory must use the same work IDs')
    if catalog['defaultModel'] != 'ratingsMetadata':
        raise ValueError('Expected the selected ratings + metadata model')
    incumbent = catalog['models']['ratingsMetadata']
    scale = np.asarray(catalog['scale'])
    k, seed = report['selectedK'], catalog['fit']['seed']
    threshold, beta = report['brierThreshold'], incumbent['strength']
    if profiles.shape != (catalog['fit']['users'], len(items)) or profiles.nnz != catalog['fit']['ratings']:
        raise ValueError('Rating cohort disagrees with stored fit')
    base_content = metadata_features(items)
    who = label_features([{field + ':' + name for field in FIELDS for name in credits[it['itemId']].get(field, [])}
                          for it in items])
    rng = np.random.default_rng(seed)
    test, dev = np.split(rng.permutation(profiles.shape[0]), [max(1, profiles.shape[0] // 5)])
    old = 'Rating + metadata similarity, tilt ' + f'{beta:.6g}'

    def candidate(share):
        return f'Rating + metadata similarity, credits {share:g} of metadata'

    def score(train, rows, fold_seed, shares):
        cases = scoring_cases(profiles, rows, rng)
        fitted = fitted_classes(train, len(scale), k, fold_seed)
        collab = similarity_features(train, base_content)['reviews']
        collab_gram = .7 * (collab @ collab.T)
        original_gram, credit_gram = base_content @ base_content.T, who @ who.T
        kernels = {candidate(w): (candidate(w), collab_gram + .3 * ((1-w)*original_gram + w*credit_gram), beta)
                   for w in shares}
        metrics = evaluate(fitted, cases, kernels, scale=scale, threshold=threshold, baseline='latent class')
        return {w: metrics[candidate(w)] for w in shares}

    cv = {w: [] for w in SHARES}
    for f, valid in enumerate(np.array_split(dev, 3)):
        scores = score(profiles[np.setdiff1d(dev, valid)], valid[:2000], seed+f, SHARES)
        for w in SHARES:
            cv[w].append(scores[w])
    scored = {w: np.concatenate(scores) for w, scores in cv.items()}
    winner = min(SHARES[1:], key=lambda w: scored[w][:, 0].mean())
    held = score(profiles[dev], test, seed, sorted({0., winner}))
    for group, observed in [('cv', scored[0.]), ('holdout', held[0.])]:
        old_loss = next(r['logLoss'] for r in report[group] if r['label'] == old)
        if not np.isclose(old_loss, observed[:, 0].mean(), rtol=1.e-8):
            raise ValueError(f'Could not reproduce incumbent {group} score on the same users')
    accepted = scored[winner][:, 0].mean() < scored[0.][:, 0].mean() and held[winner][:, 0].mean() < held[0.][:, 0].mean()
    if accepted:
        collab = similarity_features(profiles, base_content)['reviews']
        parts = [np.sqrt(.7)*collab, np.sqrt(.3*winner)*who]
        if winner < 1:
            parts.append(np.sqrt(.3*(1-winner))*base_content)
        incumbent['features'] = np.column_stack(parts).round(9).tolist()
    cv_rows = [summary(candidate(w), scored[w]) for w in SHARES[1:]]
    for selection in [catalog['selection'], report]:
        selection['cv'] = sorted([*selection['cv'], *cv_rows], key=lambda r: r['logLoss'])
        selection['holdout'] = [*selection['holdout'], summary(candidate(winner), held[winner])]
    report['credits'] = dict(metadataShare=float(winner), adopted=bool(accepted),
                              fixedTilt=float(beta), comparison=paired(held[winner], held[0.]))
    return report['credits']
