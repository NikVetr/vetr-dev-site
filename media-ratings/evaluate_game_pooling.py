"""Select Steam's class shrinkage on development reviewers and evaluate the frozen choice."""
import argparse
from pathlib import Path
from typing import Any

import numpy as np

from fit_catalog import scoring_cases
from fit_games import content_vectors, fit_classes, similarity_features
from game_pooling import approval_prior, attach_approval, class_prior, load_inputs, votes, write_json
from game_scores import grouped, paired_difference, recorded_scores, sparse_contexts, sparse_context_summary

STRENGTHS = ('original', .0625, .25, 1, 4, 16, 64, 256, 'adaptive')
SPARSE_LIMIT = 250


def personalized_summary(scored, totals):
    loss, brier, users, titles = scored
    by_player = grouped(loss, users, users[-1]+1)
    sparse_titles = totals[titles] <= SPARSE_LIMIT
    if not np.any(sparse_titles):
        raise ValueError('No held-out scores for sparse games')
    game = titles[sparse_titles]
    by_sparse_game = grouped(loss[sparse_titles], game, len(totals))
    summary: dict[str, Any] = dict(players=len(by_player), reviews=len(loss), playerLogLoss=float(by_player.mean()),
                   playerBrier=float(grouped(brier, users, len(by_player)).mean()),
                   sparseGames=len(by_sparse_game), sparseReviews=len(game),
                   sparseGameLogLoss=float(by_sparse_game.mean()),
                   sparseGameBrier=float(grouped(brier[sparse_titles], game, len(totals)).mean()))
    return summary, by_player, by_sparse_game


def marginal_summary(train, observed, shapes):
    global_shape = 5*(train.sum(axis=0) + .5)/(train.sum() + 1)
    totals = train.sum(axis=1)
    result = {}
    for label, prior in [('fivePseudoVotes', global_shape), ('empiricalBayes', shapes[::-1])]:
        probs = train + prior
        probs /= probs.sum(axis=1, keepdims=True)
        loss = -(observed*np.log(probs)).sum(axis=1)
        for name, subset in [('allGames', totals >= 0), ('sparseGames', totals <= SPARSE_LIMIT)]:
            keep = subset & (observed.sum(axis=1) > 0)
            n = observed[keep].sum(axis=1)
            ll = loss[keep]
            result.setdefault(name, dict(games=int(keep.sum()), reviews=int(n.sum())))[label] = dict(
                gameLogLoss=float((ll/n).mean()), reviewLogLoss=float(ll.sum()/n.sum()))
    return result


def evaluate_split(profiles, items, train_ids, eval_ids, settings, seed) -> tuple[dict[str, Any], dict]:
    train = profiles[train_ids]
    counts = votes(train)
    shapes = approval_prior(counts)
    eligible = np.diff(profiles.indptr)[eval_ids] >= 5
    cases = scoring_cases(profiles, eval_ids[eligible], np.random.default_rng(seed+1))
    heldout = profiles[eval_ids]
    targeted = sparse_contexts(heldout, counts.sum(axis=1) <= SPARSE_LIMIT, seed+2)
    features = similarity_features(train, content_vectors(items))['reviewsAndMetadata']
    kernel = features @ features.T
    rows, player_loss, sparse_loss = {}, {}, {}
    for strength in settings:
        prior = None if strength == 'original' else class_prior(counts, shapes, strength)
        model = fit_classes(train, 16, seed, prior)
        scored = recorded_scores(cases, kernel, model)
        summary, player_loss[strength], sparse_loss[strength] = personalized_summary(scored, counts.sum(axis=1))
        summary['allSparseTargets'], _ = sparse_context_summary(targeted, kernel, model)
        rows[strength] = summary
        print(f'{strength}: {summary}', flush=True)
    for key in rows:
        rows[key]['playerDifference'] = paired_difference(player_loss[key], player_loss['original'])
        rows[key]['sparseGameDifference'] = paired_difference(sparse_loss[key], sparse_loss['original'])
    data = dict(trainingPlayers=len(train_ids), evaluationPool=len(eval_ids), alpha=float(shapes[0]),
                beta=float(shapes[1]), marginal=marginal_summary(counts, votes(heldout), shapes),
                personalized=rows)
    return data, player_loss


def select_and_fit(catalog, profiles, seed=42):
    if catalog['defaultModel'] != 'ratingsTags' or len(catalog['models']['latentClass']['components']) != 16:
        raise ValueError('The Steam pooling study expects the validated 16-class review/metadata model')
    order = np.random.default_rng(seed).permutation(profiles.shape[0])
    n = len(order)//5
    # Entire reviewers are disjoint. Validation and test each use 20% of all reviewers.
    val, player_loss = evaluate_split(profiles, catalog['items'], order[2*n:], order[n:2*n], STRENGTHS, seed)
    best_all = min(STRENGTHS, key=lambda k: val['personalized'][k]['playerLogLoss'])
    competitive = []
    for k in STRENGTHS:
        diff = paired_difference(player_loss[k], player_loss[best_all])
        if diff['mean'] <= diff['se']:
            competitive.append(k)
    # Among models within one paired SE of the best general score, minimize equal-game
    # validation loss for games with at most 250 training votes.
    selected = min(competitive, key=lambda k: val['personalized'][k]['sparseGameLogLoss'])
    print('Frozen choice', selected, flush=True)
    test, _ = evaluate_split(profiles, catalog['items'], order[n:], order[:n], list(dict.fromkeys(['original', selected])), seed)
    counts = votes(profiles)
    shapes = approval_prior(counts)
    population_prior = attach_approval(catalog, counts, shapes)
    if selected != 'original':
        prior = class_prior(counts, shapes, selected)
        weights, probs, iterations = fit_classes(profiles, 16, seed, prior)
        model = catalog['models']['latentClass']
        model['components'] = [dict(weight=float(weights[c]), probabilities=probs[c].round(11).tolist())
                               for c in np.argsort(-weights)]
        if selected == 'adaptive':
            model.pop('strength', None)
        else:
            model['strength'] = selected
        model['prior'] = dict(center='empirical-beta-binomial', strength=selected)
        catalog['fit']['iterations'] = iterations
    catalog['selection']['pooling'] = dict(strength=selected, report='validation/games-pooling.json',
                                           holdout=test['personalized'][selected],
                                           baseline=test['personalized']['original'])
    return dict(selectedClassStrength=selected, selection='Lowest sparse-game validation loss within one paired player SE of the best overall validation loss',
                seed=seed, supplied=4, maxTargets=12, sparseTrainingReviewLimit=SPARSE_LIMIT,
                validation=val, test=test, finalPrior=population_prior)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('raw', type=Path)
    parser.add_argument('catalog', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    fitted, profiles = load_inputs(args.raw, args.catalog)
    result = select_and_fit(fitted, profiles)
    (args.output/'validation').mkdir(parents=True, exist_ok=True)
    write_json(args.output/'validation/games-pooling.json', result)
    write_json(args.output/'games.json', fitted)
