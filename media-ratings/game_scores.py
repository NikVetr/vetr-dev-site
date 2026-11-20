"""Held-out conditional predictions and game- and player-balanced Steam scoring."""
import numpy as np
from scipy.special import expit, logit, softmax

from fit_games import RIDGE


def recorded_scores(cases, kernel, model):
    """Score equal-length contexts as the browser does, preserving individual target scores."""
    weights, emissions, _ = model
    # numpy.linalg.solve can process the four-by-four ridge systems in batches.
    losses, briers, users, titles = [], [], [], []
    for start in range(0, len(cases), 1024):
        batch = cases[start:start+1024]
        given = np.stack([c[0] for c in batch])
        values = np.stack([c[1] for c in batch])
        widths = np.array([len(c[3]) for c in batch])
        valid = np.arange(widths.max())[None, :] < widths[:, None]
        targets = np.zeros(valid.shape, dtype=int)
        truth = np.zeros(valid.shape)
        targets[valid] = np.concatenate([c[2] for c in batch])
        truth[valid] = np.concatenate([c[3] for c in batch])
        terms = np.log(emissions[:, given, values])
        joint = np.log(weights)[:, None] + terms.sum(axis=2)
        p = (softmax(joint, axis=0)[:, :, None] * emissions[:, targets, 1]).sum(axis=0)
        residuals = values - (softmax(joint[:, :, None]-terms, axis=0)*emissions[:, given, 1]).sum(axis=0)
        systems = kernel[given[:, :, None], given[:, None, :]] + RIDGE*np.eye(given.shape[1])
        coef = np.linalg.solve(systems, residuals[:, :, None])
        adjustment = (kernel[targets[:, :, None], given[:, None, :]] @ coef)[:, :, 0]
        logits = (logit(p) + adjustment)[valid]
        actual = truth[valid]
        losses.append(np.logaddexp(0, logits) - actual*logits)
        briers.append((expit(logits) - actual)**2)
        titles.append(targets[valid])
        users.append(np.repeat(start+np.arange(len(batch)), widths))
    return tuple(np.concatenate(v) for v in (losses, briers, users, titles))


def grouped(values, group, size):
    counts = np.bincount(group, minlength=size)
    return np.bincount(group, weights=values, minlength=size)[counts > 0] / counts[counts > 0]


def sparse_contexts(heldout, target_mask, seed):
    """Score every held-out review of a sparse title with up to four other votes by the same person."""
    rare = np.flatnonzero(target_mask[heldout.indices])
    reviewers = np.searchsorted(heldout.indptr, rare, side='right') - 1
    rng = np.random.default_rng(seed)
    contexts = [[] for _ in range(5)]
    for position, reviewer in zip(rare, reviewers):
        start, end = heldout.indptr[reviewer:reviewer+2]
        others = np.r_[start:position, position+1:end]
        if len(others) > 4:
            others = rng.choice(others, 4, replace=False)
        case = (heldout.indices[others], heldout.data[others]-1,
                heldout.indices[position:position+1], heldout.data[position:position+1]-1)
        contexts[len(others)].append(case)
    return contexts


def sparse_context_summary(contexts, kernel, model):
    weights, emissions, _ = model
    size = emissions.shape[1]
    all_titles, all_loss, all_brier = [], [], []
    for n, cases in enumerate(contexts):
        if not cases:
            continue
        if n:
            loss, brier, _, titles = recorded_scores(cases, kernel, model)
        else:
            titles = np.concatenate([c[2] for c in cases])
            truth = np.concatenate([c[3] for c in cases])
            probabilities = weights @ emissions[:, :, 1]
            p = probabilities[titles]
            loss = np.where(truth, -np.log(p), -np.log1p(-p))
            brier = (truth-p)**2
        all_titles.extend(titles)
        all_loss.extend(loss)
        all_brier.extend(brier)
    title_loss = grouped(all_loss, all_titles, size)
    summary = dict(reviews=len(all_titles), reviewsByContextSize=[len(c) for c in contexts], games=len(title_loss),
                gameLogLoss=float(title_loss.mean()), gameBrier=float(grouped(all_brier, all_titles, size).mean()))
    return summary, title_loss


def paired_difference(x, baseline):
    difference = x-baseline
    return dict(mean=float(difference.mean()), se=float(difference.std(ddof=1)/np.sqrt(len(difference))))
