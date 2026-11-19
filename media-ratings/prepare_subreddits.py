"""Fit a binary model of recorded Reddit replies from the 2014 SNAP networks."""
import argparse
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import re
import tarfile

import ijson
import numpy as np
from scipy import sparse

from fit_catalog import fit_catalog, fit_mixture, write_evidence

SOURCE = 'https://snap.stanford.edu/data/web-RedditNetworks.html'


@lru_cache(maxsize=250000)
def account_key(name):
    """Uniform sampling independent of which communities the account appears in."""
    return int.from_bytes(hashlib.blake2b(name.encode(), digest_size=8).digest(), 'big')


def repliers(network):
    return (name.lower() for name, recipients in network.items()
            if recipients and name.lower() not in {'[deleted]', 'automoderator'})


def read_panel(archive):
    counts, final = {}, {}
    cohort = set()
    with tarfile.open(archive, 'r|gz') as tar:
        for member in tar:
            if not member.isfile() or not member.name.endswith('.json'):
                continue
            name = Path(member.name).stem
            if not re.fullmatch(r'[A-Za-z0-9_]+', name) or name in counts:
                raise ValueError(f'Unexpected community name: {name}')
            stream = tar.extractfile(member)
            if stream is None:
                raise ValueError(f'Unreadable member: {member.name}')
            # Decode one four-week interval at a time for the largest networks.
            windows = ijson.items(stream, 'item') if member.size > 16000000 else json.load(stream)
            n_windows = 0
            for i, network in enumerate(windows):
                n_windows += 1
                if i == 9:
                    counts[name] = sum(1 for _ in repliers(network))
                if i == 10:
                    keys = {key for user in repliers(network) if (key := account_key(user)) % 8 == 0}
                    final[name] = keys
                    cohort.update(keys)
            if n_windows != 11:
                raise ValueError(f'Expected eleven four-week periods for {name}')
    if len(counts) != 2046 or len(cohort) < 12000:
        raise ValueError(f'Unexpected source coverage: {len(counts)} communities, {len(cohort)} sampled accounts')
    names = sorted(counts, key=lambda name: (-counts[name], name))[:120]
    accounts = sorted(cohort)[:12000]
    index = {key: i for i, key in enumerate(accounts)}
    panel = np.ones((len(index), len(names)), dtype=np.uint8)
    for j, name in enumerate(names):
        for key in final[name]:
            if key in index:
                panel[index[key], j] = 2
    return names, panel



def rank_known_activity(panel, profiles, selected_k):
    """Hold out a positive community after one other volunteered positive and three negatives."""
    order = np.random.default_rng(42).permutation(len(panel))
    test, development = np.split(order, [len(panel) // 5])
    rng = np.random.default_rng(120)
    cases = []
    for i in test:
        positive, negative = np.flatnonzero(panel[i] == 2), np.flatnonzero(panel[i] == 1)
        if len(positive) < 2 or len(negative) < 3:
            continue
        given, target = rng.choice(positive, 2, replace=False)
        controls = rng.choice(negative, 3, replace=False)
        # The comparison is against communities without a recorded reply in that period.
        candidates = np.r_[target, np.setdiff1d(negative, controls)]
        cases.append((np.r_[given, controls], candidates))
    results = []
    for k in sorted({1, selected_k}):
        weights, emission, _ = fit_mixture(profiles[development], 2, k, 42)
        ranks = []
        for supplied, candidates in cases:
            post = weights * emission[:, supplied, [1, 0, 0, 0]].prod(axis=1)
            chances = post @ emission[:, candidates, 1] / post.sum()
            ranks.append(1 + (chances[1:] > chances[0]).sum() + 0.5 * (chances[1:] == chances[0]).sum())
        ranks = np.asarray(ranks)
        results.append(dict(k=k, users=len(cases), top10=float((ranks <= 10).mean()),
                            meanReciprocalRank=float((1 / ranks).mean())))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    names, panel = read_panel(args.archive)
    items = [dict(itemId=name.lower(), title='r/' + name, annotations=dict(
        ratingCount=int(np.sum(panel[:, j] == 2)), sourceUrl='https://www.reddit.com/r/' + name + '/'))
        for j, name in enumerate(names)]
    profiles = sparse.csr_matrix(panel)
    print(f'Fitting {len(names)} communities, {len(panel)} active accounts, {np.sum(panel == 2)} positive observations', flush=True)
    catalog, report = fit_catalog('Reddit · 120 communities', items, [0, 1], profiles)
    catalog.update(domain='subreddits', sourceLabel='SNAP · November 2014', linkLabel='Reddit',
                   scaleLabels=['No reply', 'Replied'], responsePrompt='Did you reply in this community in a four-week period?',
                   activityNote='Estimates a recorded reply during four weeks among active 2014 Reddit commenters. Reading and voting are unobserved.',
                   activityCountLabel='Accounts that replied',
                   source=dict(title='Reddit interaction networks', author='Hamilton, Zhang et al.', url=SOURCE))
    report.update(communitySelection='120 largest communities by distinct repliers in the preceding four weeks',
                  observation='At least one outgoing reply to another included account, Nov 3–30, 2014',
                  positiveObservations=int(np.sum(panel == 2)), source=SOURCE,
                  heldOutPositiveRanks=rank_known_activity(panel, profiles, report['selectedK']))
    (args.output / 'validation').mkdir(parents=True, exist_ok=True)
    for path, obj in [('subreddits.json', catalog), ('validation/subreddits.json', report)]:
        (args.output / path).write_text(json.dumps(obj, separators=(',', ':'), allow_nan=False) + '\n')
    write_evidence(args.output / 'subreddits-evidence.json', profiles, items, [0, 1])
    print(json.dumps(report['holdout']), flush=True)


if __name__ == '__main__':
    main()
