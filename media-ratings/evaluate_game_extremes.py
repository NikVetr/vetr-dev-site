"""Test partial pooling of taste-class effects for games with few observed down- or upvotes."""
import argparse
from pathlib import Path
from typing import Any

import numpy as np
from scipy.special import expit, logit

from fit_catalog import scoring_cases
from fit_games import content_vectors, similarity_features, fit_classes
from game_pooling import approval_prior, class_prior, load_inputs, votes, write_json
from game_scores import recorded_scores, grouped, paired_difference, sparse_contexts, sparse_context_summary


def pool_class_odds(model, counts, shapes, precision):
    """Shrink class differences in log odds when either review outcome has little support."""
    if precision == 0:
        return model
    weights, emissions, iterations = model
    a, b = shapes
    total = counts.sum(axis=1)
    center = logit((counts[:, 1]+a)/(total+a+b))
    # Observed Fisher information in the log odds of a Bernoulli rate.
    information = counts[:, 0]*counts[:, 1] / np.maximum(total, 1)
    reliability = information/(information + precision)
    positive = expit(center + reliability * (logit(emissions[:, :, 1]) - center))
    return weights, np.stack([1-positive, positive], axis=2), iterations

def compare(profiles, items, train_ids, eval_ids, class_strength, precisions, seed) -> dict[str, Any]:
    train = profiles[train_ids]
    heldout = profiles[eval_ids]
    counts = votes(train)
    shapes = approval_prior(counts)
    rare = counts.min(axis=1) <= 10
    targeted = sparse_contexts(heldout, rare, seed+2)
    eligible = np.flatnonzero(np.diff(heldout.indptr) >= 5)
    cases = scoring_cases(heldout, eligible, np.random.default_rng(seed+1))
    prior = None if class_strength == 'original' else class_prior(counts, shapes, class_strength)
    base = fit_classes(train, 16, seed, prior)
    features = similarity_features(train, content_vectors(items))['reviewsAndMetadata']
    kernel = features @ features.T
    results, by_player, by_game = {}, {}, {}
    for precision in precisions:
        model = pool_class_odds(base, counts, shapes, precision)
        loss, brier, users, _ = recorded_scores(cases, kernel, model)
        by_player[precision] = grouped(loss, users, len(cases))
        tail, by_game[precision] = sparse_context_summary(targeted, kernel, model)
        results[precision] = dict(playerLogLoss=float(by_player[precision].mean()),
                                  playerBrier=float(grouped(brier, users, len(cases)).mean()),
                                  lowMinorityVotes=tail, playerDifference=paired_difference(by_player[precision], by_player[0]),
                                  lowMinorityDifference=paired_difference(by_game[precision], by_game[0]))
        print(f'Precision {precision}: {results[precision]}', flush=True)
    data = dict(trainingPlayers=len(train_ids), evaluationPool=len(eval_ids), fourInputPlayers=len(cases),
                fourInputReviews=sum(len(c[3]) for c in cases), candidates=results)
    return data


def select_odds_pooling(catalog, profiles, class_strength, seed=42):
    order = np.random.default_rng(seed).permutation(profiles.shape[0])
    n = len(order)//5
    # Separate reviewers for this question: these two groups previously contributed training votes.
    validation, test = order[2*n:3*n], order[3*n:4*n]
    train = np.r_[order[:2*n], order[4*n:]]
    precisions = [0, .25, 1, 4, 16, 64]
    valid = compare(profiles, catalog['items'], train, validation, class_strength, precisions, seed)
    eligible = [k for k in precisions if valid['candidates'][k]['playerDifference']['mean']
                <= valid['candidates'][k]['playerDifference']['se']]
    selected = min(eligible, key=lambda k: valid['candidates'][k]['lowMinorityVotes']['gameLogLoss'])
    print('Frozen class-contrast precision', selected, flush=True)
    test_metrics = compare(profiles, catalog['items'], np.r_[train, validation], test, class_strength,
                           list(dict.fromkeys([0, selected])), seed)
    return dict(seed=seed, minorityTrainingVotesAtMost=10, baseClassStrength=class_strength,
                selection='Lowest minority-title balanced validation log loss within one paired player SE of the unadjusted model',
                selected=selected, validation=valid, test=test_metrics)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('raw', type=Path)
    parser.add_argument('catalog', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    fitted, profiles = load_inputs(args.raw, args.catalog)
    report = select_odds_pooling(fitted, profiles, fitted['selection']['pooling']['strength'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_json(args.output, report)
