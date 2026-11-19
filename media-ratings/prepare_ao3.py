"""Build two public-kudos prediction catalogs from locally downloaded, pinned AO3 archives."""
import argparse
import gzip
import json
from pathlib import Path
import re

import numpy as np
import pandas as pd
from scipy import sparse
from scipy.special import expit, logit, logsumexp

ARCHIVE = 'https://huggingface.co/datasets/sdeangroup/NavigatingSensitivity'
METADATA = 'https://huggingface.co/datasets/yrtsk/archiveofourown-meta'
LICENSE = 'https://creativecommons.org/licenses/by-nc/4.0/'
FANDOMS = {'Harry Potter - J. K. Rowling': 'Harry Potter', 'Harry Potter - Rowling': 'Harry Potter',
           'Harry Potter - Fandom': 'Harry Potter', 'Harry Potter (books)': 'Harry Potter', 'Naruto': 'Naruto',
           'Worm - Wildbow': 'Worm', 'Worm (Parahumans)': 'Worm',
           'Worm (Web Serial Novel)': 'Worm', 'Parahumans Series - Wildbow': 'Worm'}
SIZES = {'fanfiction': 300, 'webfiction': 150}
SEED = 8824


def read_actions(raw):
    # Pack once, sort in place, and collapse duplicate (work, reader) records.
    # Keeping reader membership here also avoids a second pass through the CSV.
    raw_n = 45_936_871
    pairs = np.empty(raw_n, dtype=np.int64)
    offset = 0
    for chunk in pd.read_csv(raw / 'ao3_interaction_table.csv', usecols=['user_id', 'work_id'],
                             dtype=np.int32, chunksize=800_000):
        next_offset = offset + len(chunk)
        work = chunk['work_id'].to_numpy(dtype=np.int64)
        reader = chunk['user_id'].to_numpy()
        if (work < 0).any() or (reader < 0).any():
            raise ValueError('Invalid AO3 work or reader ID')
        pairs[offset:next_offset] = (work << 32) + reader
        offset = next_offset
    if offset != raw_n:
        raise ValueError('Expected all interactions from the pinned 2024 research snapshot')
    pairs.sort()
    pairs = pairs[np.r_[True, pairs[1:] != pairs[:-1]]]
    ids, counts = np.unique(pairs >> 32, return_counts=True)
    return pairs, dict(zip(ids.tolist(), counts.tolist()))


def select_works(raw, counts):
    candidates = {domain: {} for domain in SIZES}
    with (raw / 'ao3_metadata.jsonl').open('rb') as archive:
        for line in archive:
            # IDs are the first field in the pinned JSONL. Skip parsing unrelated records.
            first_field = line.partition(b',')[0]
            match = re.fullmatch(rb'\s*\{"id":\s*"(\d+)"', first_field)
            if match is None:
                raise ValueError('Unexpected metadata schema')
            work = int(match[1])
            if counts.get(work, 0) < 10:
                continue
            row = json.loads(line)
            m = row['metadata']
            try:
                words = int(str(m.get('words', '')).replace(',', ''))
            except ValueError:
                continue
            fandom = m.get('Fandom', '')
            if not isinstance(fandom, str) or not fandom or fandom == 'No Fandom' or m.get('Fandoms'):
                continue
            if m.get('Language') != 'English' or words < 1000 or not row.get('title'):
                continue
            # This public catalog covers prose marked for General, Teen or Mature audiences.
            rating = m.get('Rating')
            if rating not in ('General Audiences', 'Teen And Up Audiences', 'Mature'):
                continue
            genre = FANDOMS.get(fandom, fandom)
            domain = 'webfiction' if fandom == 'Original Work' else 'fanfiction'
            date = m.get('published', '')
            annotations: dict = dict(sourceUrl=f'https://archiveofourown.org/works/{work}', certificate=rating,
                               ratingCount=int(counts[work]), format='Original work' if domain == 'webfiction' else 'Fanfiction')
            if domain == 'fanfiction':
                annotations['genres'] = [genre]
            if date and re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
                annotations['year'] = int(date[:4])
            if m.get('author'):
                annotations['author'] = m['author'].removeprefix('by ')
            candidates[domain][work] = dict(itemId=str(work), title=row['title'].strip(), annotations=annotations)
    selected = {}
    for domain, works in candidates.items():
        order = sorted(works, key=lambda work: (-counts[work], work))
        picked = set()
        if domain == 'fanfiction':
            for fandom in ('Harry Potter', 'Naruto', 'Worm'):
                picked.update([w for w in order if works[w]['annotations']['genres'] == [fandom]][:35])
        remaining = [w for w in order if w not in picked]
        picked.update(remaining[:SIZES[domain] - len(picked)])
        selected[domain] = [works[w] for w in order if w in picked]
        if len(picked) < 10:
            raise ValueError(f'Insufficient eligible works for {domain}')
    return selected


def profiles_for(pairs, selected):
    output = {}
    for domain, works in selected.items():
        rows, cols = [], []
        for j, work in enumerate(works):
            key = int(work['itemId'])
            low, high = np.searchsorted(pairs, [key << 32, (key + 1) << 32])
            readers = pairs[low:high].astype(np.int32)
            rows.append(readers)
            cols.append(np.full(len(readers), j, dtype=np.int32))
        all_rows, all_cols = np.concatenate(rows), np.concatenate(cols)
        ids = np.unique(all_rows)
        sampled = np.sort(np.random.default_rng(SEED).choice(ids, min(50_000, len(ids)), replace=False))
        mask = np.isin(all_rows, sampled)
        matrix = sparse.csr_matrix((np.ones(mask.sum(), dtype=np.int32),
                                    (np.searchsorted(sampled, all_rows[mask]), all_cols[mask])),
                                   shape=(len(sampled), len(works)))
        output[domain] = (matrix, {'eligibleReaders': len(ids), 'selectedWorksKudos': int(len(all_rows)),
                                   'sampledReaders': len(sampled), 'sampledKudos': int(matrix.nnz),
                                   'releaseKudosAfterDeduplication': len(pairs)})
    return output


def fit_kudos(x, k, seed):
    """MAP Bernoulli mixture. Sparse ones encode kudos; every cohort member has a 0/1 for every work."""
    n, d = x.shape
    pooled = (np.asarray(x.sum(axis=0)).ravel() + 0.5) / (n + 1)
    rng = np.random.default_rng(seed)
    resp = rng.dirichlet(np.ones(k), n)
    prev = None
    for step in range(1, 501):
        members = resp.sum(axis=0)
        weights = (members + 1) / (n + k)
        p = ((x.T @ resp).T + 16 * pooled) / (members[:, None] + 16)
        if k == 1:
            break
        log_yes, log_no = np.log(p), np.log1p(-p)
        joint = x @ (log_yes - log_no).T + log_no.sum(axis=1) + np.log(weights)
        margin = np.asarray(logsumexp(joint, axis=1, return_sign=False))
        objective = margin.sum() + np.log(weights).sum() + 16 * (log_yes * pooled + log_no * (1 - pooled)).sum()
        if prev is not None:
            if objective < prev - 1.e-7 * n:
                raise ArithmeticError('Penalized likelihood decreased')
            if objective - prev < 2.e-5 * abs(prev):
                break
        resp = np.exp(joint - margin[:, None])
        prev = objective
    else:
        raise ArithmeticError('EM failed to converge')
    return weights, p, step


def shifted_probabilities(logits, weights, target):
    """Find one intercept per row with the requested weighted Bernoulli probability sum."""
    lo, hi = np.full(len(target), -40.), np.full(len(target), 40.)
    for _ in range(45):
        mid = (lo + hi) / 2
        below = expit(logits + mid[:, None]) @ weights < target
        lo = np.where(below, mid, lo)
        hi = np.where(below, hi, mid)
    return expit(logits + ((lo + hi) / 2)[:, None])


def calibrate_activity(model, strength):
    if not strength:
        return model
    weights, probs, steps = model
    sizes = probs.sum(axis=1)
    desired = sizes ** (1 - strength) * (weights @ sizes) ** strength
    normalized = shifted_probabilities(logit(probs), np.ones(probs.shape[1]), desired)
    # Restore the pooled event frequency of each work after shrinking class activity.
    balanced = shifted_probabilities(logit(normalized.T), weights, weights @ probs).T
    return weights, balanced, steps


def test_cases(x, rows, seed):
    rng = np.random.default_rng(seed)
    cases = []
    for row in rows:
        positives = x.indices[x.indptr[row]:x.indptr[row + 1]]
        if len(positives) < 2:
            continue
        mixed = rng.permutation(positives)
        cut = min(4, len(mixed) - 1)
        cases.append((mixed[:cut], mixed[cut:]))
    if not cases:
        raise ValueError('No test reader has two kudos')
    return cases


def evaluate(model, cases):
    """Condition on supplied kudos; predict every remaining binary action and rank hidden kudos."""
    weights, p, _ = model
    d = p.shape[1]
    scores = {'logLoss': 0., 'brier': 0., 'recallAt10': 0.}
    for start in range(0, len(cases), 256):
        batch = cases[start:start + 256]
        post = np.array([np.log(weights) + np.log(p[:, given]).sum(axis=1) for given, _ in batch])
        probs = np.exp(post - logsumexp(post, axis=1, keepdims=True)) @ p
        for (given, truth), pred in zip(batch, probs):
            # All targets have known snapshot status, except the supplied positives we remove.
            neglog = -np.log1p(-pred)
            neglog[given] = 0
            neglog[truth] = -np.log(pred[truth])
            scores['logLoss'] += neglog.sum() / (d - len(given))
            sq = np.square(pred)
            sq[given] = 0
            sq[truth] = (1 - pred[truth])**2
            scores['brier'] += sq.sum() / (d - len(given))
            pred[given] = -1
            first = np.argsort(-pred, kind='stable')[:10]
            scores['recallAt10'] += np.isin(first, truth).sum() / len(truth)
    return {metric: float(value / len(cases)) for metric, value in scores.items()}


def train(x):
    rng = np.random.default_rng(SEED)
    shuffled = rng.permutation(x.shape[0])
    holdout, dev = np.split(shuffled, [len(shuffled) // 5])
    grid = [1, 2, 4, 8, 16, 32]
    folds = np.array_split(dev, 3)
    validation = [(np.setdiff1d(dev, valid), test_cases(x, valid[:2500], SEED + f))
                  for f, valid in enumerate(folds)]
    cv = []
    for k in grid:
        strengths = [0.] if k == 1 else [0., 0.5, 1.]
        results = {strength: [] for strength in strengths}
        for f, (train_rows, cases) in enumerate(validation):
            fitted = fit_kudos(x[train_rows], k, SEED + f)
            for strength in strengths:
                scores = evaluate(calibrate_activity(fitted, strength), cases)
                results[strength].append((scores, len(cases)))
        for strength, scores in results.items():
            cv.append(dict(k=k, activityShrinkage=strength,
                           **{metric: sum(score[metric] * n for score, n in scores) / sum(n for _, n in scores)
                              for metric in scores[0][0]}))
    best = min(cv, key=lambda s: s['logLoss'])
    selected = (best['k'], best['activityShrinkage'])
    cases = test_cases(x, holdout, SEED)
    test = []
    for k, strength in sorted({(1, 0.), selected}):
        fitted = calibrate_activity(fit_kudos(x[dev], k, SEED), strength)
        test.append(dict(k=k, activityShrinkage=strength, **evaluate(fitted, cases)))
    weights, p, iterations = calibrate_activity(fit_kudos(x, selected[0], SEED), selected[1])
    components = [dict(weight=float(weights[c]), probabilities=np.column_stack([1-p[c], p[c]]).round(11).tolist())
                  for c in np.argsort(-weights)]
    report = dict(model='latentClass', folds=3, cv=cv, selectedK=selected[0], activityShrinkage=selected[1], holdout=test, metric='reader-mean binary log loss',
                  developmentReaders=len(dev), holdoutReaders=len(holdout), validationUsers=sum(len(v) for _, v in validation), testUsers=len(cases),
                  testRatings=sum(x.shape[1] - len(given) for given, _ in cases),
                  hiddenKudos=sum(len(truth) for _, truth in cases), seed=SEED)
    for row in cv + test:
        row['label'] = f'Kudos classes, K={row["k"]}, activity shrinkage {row["activityShrinkage"]:g}'
        row['rmse'] = float(np.sqrt(row['brier']))
    return components, report, iterations


def write_grids(path, x, items):
    """Derive each binary contingency table from co-kudos and marginal counts, in app order (i,j)."""
    n, d = x.shape
    if n > 65535:
        raise ValueError('Cohort exceeds uint16 evidence format')
    counts = np.asarray(x.sum(axis=0)).ravel()
    pairs = (x.T @ x).toarray()
    packed = path.with_suffix('.bin.gz')
    with packed.open('wb') as out, gzip.GzipFile(fileobj=out, mode='wb', mtime=0) as gz:
        for j in range(1, d):
            both = pairs[j, :j]
            grids = np.column_stack([n - counts[:j] - counts[j] + both, counts[j] - both, counts[:j] - both, both])
            gz.write(grids.astype('<u2').tobytes())
    path.write_text(json.dumps(dict(ids=[it['itemId'] for it in items], scale=[0, 1],
                                    counts=np.column_stack([n - counts, counts]).tolist(),
                                    packedFile=packed.name), separators=(',', ':')) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('raw', type=Path)
    parser.add_argument('--out', type=Path, default=Path(__file__).parent)
    args = parser.parse_args()
    if (args.raw / 'ao3_metadata.jsonl').stat().st_size != 7_361_797_072:
        raise ValueError('Incomplete or different AO3 work metadata archive')
    pairs, counts = read_actions(args.raw)
    selected = select_works(args.raw, counts)
    profiles = profiles_for(pairs, selected)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'validation').mkdir(exist_ok=True)
    for domain, items in selected.items():
        x, audit = profiles[domain]
        print(domain, len(items), audit, flush=True)
        components, report, step = train(x)
        name = 'Fanfiction' if domain == 'fanfiction' else 'Original web fiction'
        catalog = dict(name=f'{name} · AO3 public kudos', domain=domain, sourceLabel='AO3 public kudos', linkLabel='AO3',
                       responsePrompt='Did you give this work kudos?', activityCountLabel='Readers who gave kudos',
                       activityNote='Among readers with public kudos on at least one title here in the 2024 snapshot, an absent kudos can also mean an unread work.', scale=[0, 1], scaleLabels=['No kudos', 'Gave kudos'],
                       sourceUrl=ARCHIVE, items=items, defaultModel='latentClass',
                       models=dict(latentClass=dict(kind='latent-class', strength=16, components=components)),
                       selection=report, fit=dict(users=x.shape[0], ratings=x.shape[0]*x.shape[1], iterations=step, seed=SEED),
                       source=dict(title='Navigating Sensitivity · AO3', url=ARCHIVE, author='Amelia Kovacs, Jerry Chee and Sarah Dean',
                                   license='CC BY-NC 4.0', licenseUrl=LICENSE, metadataUrl=METADATA,
                                   notes='Aggregated public kudos (March–May 2024) and work metadata from yrtsk, CC BY-NC 4.0.'))
        for path, data in [(args.out / f'{domain}.json', catalog),
                           (args.out / 'validation' / f'{domain}.json', {**report, 'sourceCounts': audit})]:
            path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
        write_grids(args.out / f'{domain}-evidence.json', x, items)
        print(domain, report, flush=True)


if __name__ == '__main__':
    main()
