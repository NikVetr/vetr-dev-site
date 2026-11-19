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

from fit_catalog import shard_evidence

ARCHIVE = 'https://huggingface.co/datasets/sdeangroup/NavigatingSensitivity'
METADATA = 'https://huggingface.co/datasets/yrtsk/archiveofourown-meta'
LICENSE = 'https://creativecommons.org/licenses/by-nc/4.0/'
# Fandom names are author-entered. Merge only named aliases of the same franchise.
FANDOMS = {
    'Harry Potter - J. K. Rowling': 'Harry Potter', 'Harry Potter - Rowling': 'Harry Potter',
    'Harry Potter - Fandom': 'Harry Potter', 'Harry Potter (books)': 'Harry Potter', 'Harry Potter': 'Harry Potter',
    'Naruto': 'Naruto', 'Naruto Shippuden': 'Naruto', 'Naruto (Anime & Manga)': 'Naruto',
    'Worm - Wildbow': 'Worm', 'Worm (Parahumans)': 'Worm', 'Worm (web serial)': 'Worm',
    'Worm (Web Serial Novel)': 'Worm', 'Parahumans Series - Wildbow': 'Worm',
    'Supernatural': 'Supernatural', 'Teen Wolf (TV)': 'Teen Wolf',
    'Sherlock (TV)': 'Sherlock', 'Marvel Cinematic Universe': 'Marvel Cinematic Universe',
    'The Avengers (Marvel Movies)': 'Marvel Cinematic Universe', 'The Avengers (2012)': 'Marvel Cinematic Universe',
    'Captain America (Movies)': 'Marvel Cinematic Universe', 'Thor (Movies)': 'Marvel Cinematic Universe',
    'Iron Man (Movies)': 'Marvel Cinematic Universe',
    'Star Wars - All Media Types': 'Star Wars', 'Star Wars Sequel Trilogy': 'Star Wars',
    'Star Wars Prequel Trilogy': 'Star Wars', 'Star Wars Original Trilogy': 'Star Wars',
    'Star Wars: The Clone Wars (2008) - All Media Types': 'Star Wars',
    'Star Wars Episode VII: The Force Awakens (2015)': 'Star Wars',
    '僕のヒーローアカデミア | Boku no Hero Academia | My Hero Academia': 'My Hero Academia',
    'Game of Thrones (TV)': 'Game of Thrones / A Song of Ice and Fire',
    'A Song of Ice and Fire - George R. R. Martin': 'Game of Thrones / A Song of Ice and Fire',
}
QUOTAS = {'Harry Potter': 500, 'Naruto': 500, 'Worm': 500, 'Supernatural': 250,
          'Teen Wolf': 250, 'Sherlock': 250, 'Marvel Cinematic Universe': 250,
          'Star Wars': 250, 'My Hero Academia': 250, 'Game of Thrones / A Song of Ice and Fire': 250}
# Add shelves for the other source fandoms represented in the launch catalog.
# Exact aliases join adaptations under the named IP. Real-person-fiction tags
# for actors in fictional franchises are separate fandoms.
EXTENDED_FANDOMS = {
    'Merlin (BBC)': ('Merlin (TV)', 'Merlin (BBC)'),
    'BTS': ('방탄소년단 | Bangtan Boys | BTS',),
    'Hannibal (TV)': ('Hannibal (TV)',),
    'Star Trek': ('Star Trek', 'Star Trek: Alternate Original Series (Movies)', 'Star Trek (2009)', 'Star Trek: 2009',
                  'Star Trek XI', 'Star Trek: The Original Series', 'Star Trek: The Original Series (Movies)',
                  'Star Trek: Deep Space Nine', 'Star Trek: Voyager', 'Star Trek: The Next Generation',
                  'Star Trek: Enterprise', 'Star Trek: Discovery'),
    'Voltron: Legendary Defender': ('Voltron: Legendary Defender',),
    'Batman': ('Batman - All Media Types', 'Batman (Comics)', 'Batman (Movies - Nolan)',
               'Batman: The Animated Series', 'Batman and Robin (Comics)', 'Batman: Arkham (Video Games)'),
    'Haikyuu!!': ('Haikyuu!!',),
    'One Direction': ('One Direction (Band)', 'One Direction'),
    'Rise of the Guardians': ('Rise of the Guardians (2012)', 'rise of the guardians'),
    'Avatar: The Last Airbender': ('Avatar: The Last Airbender',),
    'One Piece': ('One Piece',),
    'Stranger Things': ('Stranger Things (TV 2016)',),
    'The Hobbit': ('The Hobbit - All Media Types', 'The Hobbit (Jackson Movies)', 'The Hobbit (2012)',
                   'The Hobbit - J. R. R. Tolkien'),
    'X-Men': ('X-Men: First Class (2011) - Fandom', 'X-Men - All Media Types', 'X-Men (Movieverse)',
              'X-Men (Alternate Timeline Movies)', 'X-Men (Movies)', 'X-Men (Comicverse)',
              'X-Men: Days of Future Past (2014) - Fandom', 'X-Men (Original Timeline Movies)'),
    'Check Please!': ('Check Please! (Webcomic)',),
    'The Chronicles of Narnia': ('Chronicles of Narnia (Movies)', 'Chronicles of Narnia - C. S. Lewis',
                                 'Chronicles of Narnia - All Media Types', 'Chronicles of Narnia'),
    'DC Universe': ('DCU', 'DCU (Animated)', 'DCU Animated', 'DCU (Comics)', 'DCU - Comicverse', 'DCU (Movies)'),
    'Fantastic Beasts': ('Fantastic Beasts and Where to Find Them (Movies)',),
    'Final Fantasy XV': ('Final Fantasy XV',),
    'Free!': ('Free!',),
    'Fullmetal Alchemist': ('Fullmetal Alchemist', 'Fullmetal Alchemist: Brotherhood & Manga',
                            'Fullmetal Alchemist - All Media Types', 'Fullmetal Alchemist (Anime 2003)'),
    'Good Omens': ('Good Omens - Neil Gaiman & Terry Pratchett', 'Good Omens (TV)'),
    'Hawaii Five-0': ('Hawaii Five-0 (2010)',),
    'House M.D.': ('House M.D.',),
    'Mass Effect': ('Mass Effect', 'Mass Effect Trilogy', 'Mass Effect - All Media Types', 'Mass Effect: Andromeda',
                    'Mass Effect 2 - Fandom', 'Mass Effect (Comics)'),
    'Miraculous Ladybug': ('Miraculous Ladybug',),
    'Mulan': ('Mulan (1998)',),
    'Once Upon a Time': ('Once Upon a Time (TV)',),
    'Overwatch': ('Overwatch (Video Game)',),
    'Spirited Away': ('Sen to Chihiro no Kamikakushi | Spirited Away',),
    'Shadowhunters': ('Shadowhunters (TV)', 'Shadowhunters'),
    'She-Ra and the Princesses of Power': ('She-Ra and the Princesses of Power', 'She-Ra and the Princesses of Power (2018)'),
    'Attack on Titan': ('Shingeki no Kyojin | Attack on Titan',),
    'Supergirl': ('Supergirl (TV 2015)',),
    'The Man from U.N.C.L.E.': ('The Man From U.N.C.L.E. (2015)', 'The Man From U.N.C.L.E. (TV)',
                                'The Man From U.N.C.L.E.', 'Man From U.N.C.L.E.'),
    'Welcome to Night Vale': ('Welcome to Night Vale',),
    "JoJo's Bizarre Adventure": ("ジョジョの奇妙な冒険 | JoJo no Kimyou na Bouken | JoJo's Bizarre Adventure",),
    "Heaven Official's Blessing": ('天官赐福 - 墨香铜臭 | Tiān Guān Cì Fú - Mòxiāng Tóngxiù',),
    'Bungou Stray Dogs': ('文豪ストレイドッグス | Bungou Stray Dogs',),
    'Grandmaster of Demonic Cultivation': ('魔道祖师 - 墨香铜臭 | Módào Zǔshī - Mòxiāng Tóngxiù',
                                           '魔道祖师 | Módào Zǔshī (Cartoon)', '魔道祖师 | Módào Zǔshī - All Media Types'),
    'Criminal Minds': ('Criminal Minds',), 'Inception': ('Inception (2010)',), 'Leverage': ('Leverage',),
    'NCIS': ('NCIS',), 'Young Justice': ('Young Justice (Cartoon)',),
    'The Avengers': ('The Avengers (Marvel) - All Media Types',),
}
ORIGINAL_ALIASES = dict(FANDOMS)
FANDOMS.update({alias: fandom for fandom, aliases in EXTENDED_FANDOMS.items() for alias in aliases})
FANDOMS.update({'Captain America (2011)': 'Marvel Cinematic Universe', 'Rogue One: A Star Wars Story (2016)': 'Star Wars'})
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


def work_fandoms(metadata, aliases=FANDOMS):
    single = metadata.get('Fandom')
    if single and isinstance(single, str) and not metadata.get('Fandoms'):
        return [aliases.get(single, single)] if single != 'No Fandom' else []
    # A comma can be part of a fandom's name. Match complete curated aliases only
    # on the flattened multi-tag field; never infer an IP from a character or title.
    multi = metadata.get('Fandoms', '')
    if isinstance(multi, list):
        return sorted({aliases[tag] for tag in multi if isinstance(tag, str) and tag in aliases})
    if not isinstance(multi, str) or not multi:
        return []
    record = ', ' + multi + ', '
    return sorted({family for tag, family in aliases.items() if ', ' + tag + ', ' in record})


def select_works(raw, counts, inventory=None):
    by_domain = {'fanfiction': {}, 'webfiction': {}}
    former_eligible = []
    original_pools = {fandom: set() for fandom in QUOTAS}
    with (raw / 'ao3_metadata.jsonl').open('rb') as archive:
        for line in archive:
            first_field = line.partition(b',')[0]
            match = re.fullmatch(rb'\s*\{"id":\s*"(\d+)"', first_field)
            if match is None:
                raise ValueError('Unexpected metadata schema')
            work = int(match[1])
            if counts.get(work, 0) < 3:
                continue
            row = json.loads(line)
            m = row['metadata']
            try:
                words = int(str(m.get('words', '')).replace(',', ''))
            except ValueError:
                continue
            if m.get('Language') != 'English' or words < 100 or not row.get('title', '').strip():
                continue
            if m.get('Rating') not in ('General Audiences', 'Teen And Up Audiences', 'Mature'):
                continue
            fandoms = work_fandoms(m)
            if not fandoms:
                continue
            original = m.get('Fandom') == 'Original Work' and not m.get('Fandoms')
            domain = 'webfiction' if original else 'fanfiction'
            if not original and not m.get('Fandoms') and words >= 1000 and counts[work] >= 10:
                former_eligible.append(work)
            annotations: dict = dict(sourceUrl=f'https://archiveofourown.org/works/{work}', certificate=m['Rating'],
                               wordCount=words, format='Original work' if original else
                               'Crossover' if m.get('Fandoms') else 'Fanfiction')
            if not original:
                annotations['genres'] = fandoms
                for fandom in work_fandoms(m, ORIGINAL_ALIASES):
                    if fandom in original_pools:
                        original_pools[fandom].add(work)
            chapters = re.fullmatch(r'(\d+)/(\d+|\?)', str(m.get('chapters', '')))
            if chapters:
                annotations['chapterCount'] = int(chapters[1])
                annotations['completion'] = ('Complete' if chapters[1] == chapters[2]
                                             else 'In progress at snapshot')
            date = m.get('published', '')
            if date and re.fullmatch(r'\d{4}-\d{2}-\d{2}', date):
                annotations['year'] = int(date[:4])
            if m.get('author'):
                annotations['author'] = m['author'].removeprefix('by ')
            by_domain[domain][work] = dict(itemId=str(work), title=row['title'].strip(), annotations=annotations)
    selected = {}
    for domain, works in by_domain.items():
        order = sorted(works, key=lambda work: (-counts[work], work))
        if domain == 'webfiction':
            selected[domain] = [works[w] for w in order]
            continue
        # Keep a cross-fandom popularity shelf under the original long-prose criterion
        # alongside each dedicated franchise shelf. This preserves the launch inventory.
        picked = set(sorted(set(former_eligible), key=lambda w: (-counts[w], w))[:300])
        for fandom, limit in QUOTAS.items():
            picked.update([w for w in order if w in original_pools[fandom]][:limit])
        additional = {fandom: [] for fandom in EXTENDED_FANDOMS}
        eligible = dict.fromkeys([*QUOTAS, *EXTENDED_FANDOMS], 0)
        for w in order:
            for fandom in works[w]['annotations']['genres']:
                if fandom in eligible:
                    eligible[fandom] += 1
                if w not in picked and fandom in additional and len(additional[fandom]) < 200:
                    additional[fandom].append(w)
        picked.update(w for shelf in additional.values() for w in shelf)
        selected[domain] = [works[w] for w in order if w in picked]
        if inventory is not None:
            inventory.update({name: {'eligible': count, 'selected': sum(
                name in item['annotations']['genres'] for item in selected[domain])}
                for name, count in eligible.items()})
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
        matrix = sparse.csr_matrix((np.ones(len(all_rows), dtype=np.int32),
                                    (np.searchsorted(ids, all_rows), all_cols)), shape=(len(ids), len(works)))
        for item, total in zip(works, np.asarray(matrix.sum(axis=0)).ravel()):
            item['annotations']['ratingCount'] = int(total)
        output[domain] = (matrix, {'eligibleReaders': len(ids), 'selectedWorksKudos': int(matrix.nnz),
                                   'releaseKudosAfterDeduplication': len(pairs)})
    return output


def fit_kudos(x, k, seed, initial=None):
    """MAP Bernoulli mixture, accumulating exact sparse EM counts in bounded batches."""
    n, d = x.shape
    pooled = (np.asarray(x.sum(axis=0)).ravel() + 0.5) / (n + 1)
    blocks = [x[i:i + 8192] for i in range(0, n, 8192)]
    members, events = np.zeros(k), np.zeros((k, d))
    if k == 1:
        return np.ones(1), ((np.asarray(x.sum(axis=0)) + 16 * pooled) / (n + 16)), 1
    if initial is None:
        rng = np.random.default_rng(seed)
        for block in blocks:
            resp = rng.dirichlet(np.ones(k), block.shape[0])
            members += resp.sum(axis=0)
            events += (block.T @ resp).T
    prev = None
    for step in range(1, 501):
        if step == 1 and initial is not None:
            weights, p, _ = initial
        else:
            weights = (members + 1) / (n + k)
            p = (events + 16 * pooled) / (members[:, None] + 16)
        log_yes, log_no = np.log(p), np.log1p(-p)
        odds, intercept = (log_yes - log_no).T.copy(), log_no.sum(axis=1) + np.log(weights)
        objective = np.log(weights).sum() + 16 * (log_yes * pooled + log_no * (1 - pooled)).sum()
        members.fill(0)
        events.fill(0)
        for block in blocks:
            joint = block @ odds + intercept
            margin = np.asarray(logsumexp(joint, axis=1))
            objective += margin.sum()
            resp = np.exp(joint - margin[:, None])
            members += resp.sum(axis=0)
            events += (block.T @ resp).T
        if prev is not None:
            if objective < prev - 1.e-7 * n:
                raise ArithmeticError('Penalized likelihood decreased')
            if objective - prev < 2.e-5 * abs(prev):
                return weights, p, step
        prev = objective
    raise ArithmeticError('EM failed to converge')


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
            cutoff = np.partition(pred, -10)[-10] if d >= 10 else -np.inf
            above = np.flatnonzero(pred > cutoff)
            first = np.r_[above, np.flatnonzero(pred == cutoff)[:10-len(above)]]
            scores['recallAt10'] += np.isin(first, truth).sum() / len(truth)
    return {metric: float(value / len(cases)) for metric, value in scores.items()}


def filtered_recall(model, cases, indices):
    """Score within the fandom using all supplied kudos, including other fandoms."""
    weights, p, _ = model
    group = set(indices.tolist())
    users, recalls, cross, cross_recalls = 0, 0., 0, 0.
    for given, truth in cases:
        positives = group.intersection(truth)
        if not positives:
            continue
        logp = np.log(weights) + np.log(p[:, given]).sum(axis=1)
        chances = np.exp(logp - logsumexp(logp)) @ p[:, indices]
        chances[np.isin(indices, given)] = -1
        top = indices[np.argsort(-chances, kind='stable')[:10]]
        score = len(positives.intersection(top)) / len(positives)
        users += 1
        recalls += score
        if any(i not in group for i in given):
            cross += 1
            cross_recalls += score
    return dict(readers=users, recallAt10=recalls / users if users else None, crossFandomReaders=cross,
                crossFandomRecallAt10=cross_recalls / cross if cross else None)


def train(x, items):
    rng = np.random.default_rng(SEED)
    shuffled = rng.permutation(x.shape[0])
    holdout, dev = np.split(shuffled, [min(10_000, len(shuffled) // 5)])
    cv_rows = dev[:40_000]
    grid = [1, 2, 4, 8, 16, 32, 64]
    folds = np.array_split(cv_rows, 3)
    validation = [(np.setdiff1d(cv_rows, valid), test_cases(x, valid[:2500], SEED + f))
                  for f, valid in enumerate(folds)]
    cv = []
    for k in grid:
        print('CV K=', k, flush=True)
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
    finalist = None
    groups = {name: np.asarray([i for i, item in enumerate(items) if name in item['annotations'].get('genres', [])],
                               dtype=int) for name in [*QUOTAS, *EXTENDED_FANDOMS]}
    fandom_scores = {}
    for k, strength in sorted({(1, 0.), selected}):
        warm = fit_kudos(x[cv_rows], k, SEED) if k > 1 and len(dev) > len(cv_rows) else None
        print('Holdout fit', len(dev), 'readers, K=', k, flush=True)
        trained = fit_kudos(x[dev], k, SEED, warm)
        fitted = calibrate_activity(trained, strength)
        test.append(dict(k=k, activityShrinkage=strength, **evaluate(fitted, cases)))
        for name, indices in groups.items():
            if len(indices):
                result = filtered_recall(fitted, cases, indices)
                fandom_scores.setdefault(name, []).append(dict(k=k, titles=len(indices), **result))
        if (k, strength) == selected:
            finalist = trained
    print('Final fit', x.shape[0], 'readers, K=', selected[0], flush=True)
    weights, p, iterations = calibrate_activity(fit_kudos(x, selected[0], SEED, finalist), selected[1])
    components = [dict(weight=float(weights[c]), probabilities=np.column_stack([1-p[c], p[c]]).round(11).tolist())
                  for c in np.argsort(-weights)]
    report = dict(model='latentClass', folds=3, cv=cv, selectedK=selected[0], activityShrinkage=selected[1], holdout=test, metric='reader-mean binary log loss',
                  developmentReaders=len(dev), cvDevelopmentReaders=len(cv_rows), fandomHoldout=fandom_scores, holdoutReaders=len(holdout), validationUsers=sum(len(v) for _, v in validation), testUsers=len(cases),
                  testRatings=sum(x.shape[1] - len(given) for given, _ in cases),
                  hiddenKudos=sum(len(truth) for _, truth in cases), seed=SEED)
    for row in cv + test:
        row['label'] = f'Kudos classes, K={row["k"]}, activity shrinkage {row["activityShrinkage"]:g}'
        row['rmse'] = float(np.sqrt(row['brier']))
    return components, report, iterations


def write_grids(path, x, items):
    """Derive each binary contingency table from co-kudos and marginal counts, in app order (i,j)."""
    n, d = x.shape
    counts = np.asarray(x.sum(axis=0)).ravel()
    by_title = x.tocsc()
    packed = path.with_suffix('.bin.gz')
    with packed.open('wb') as out, gzip.GzipFile(fileobj=out, mode='wb', mtime=0) as gz:
        for first in range(0, d, 128):
            stop = min(first+128, d)
            intersections = (by_title[:, first:stop].T @ by_title[:, :stop]).toarray()
            for j in range(first, stop):
                both = intersections[j-first, :j]
                if both.max(initial=0) > 65535:
                    raise ValueError('Positive overlap exceeds uint16')
                gz.write(both.astype('<u2').tobytes())
    path.write_text(json.dumps(dict(ids=[it['itemId'] for it in items], scale=[0, 1],
                                    counts=np.column_stack([n - counts, counts]).tolist(),
                                    packedFile=packed.name, packedLayout='binary-overlap', cohortSize=n), separators=(',', ':')) + '\n')
    shard_evidence(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('raw', type=Path)
    parser.add_argument('--out', type=Path, default=Path(__file__).parent)
    parser.add_argument('--domain', choices=('fanfiction', 'webfiction'), help='Rebuild just one domain')
    args = parser.parse_args()
    if (args.raw / 'ao3_metadata.jsonl').stat().st_size != 7_361_797_072:
        raise ValueError('Incomplete or different AO3 work metadata archive')
    pairs, counts = read_actions(args.raw)
    inventory = {}
    selected = select_works(args.raw, counts, inventory)
    if args.domain:
        selected = {args.domain: selected[args.domain]}
    profiles = profiles_for(pairs, selected)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'validation').mkdir(exist_ok=True)
    for domain, items in selected.items():
        x, audit = profiles[domain]
        if domain == 'fanfiction':
            audit['fandomInventory'] = inventory
        print(domain, len(items), audit, flush=True)
        components, report, step = train(x, items)
        name = 'Fanfiction' if domain == 'fanfiction' else 'Original web fiction'
        catalog = dict(name=f'{name} · {len(items):,} AO3 works', legacyRatingCatalogs=([f'{name} · AO3 public kudos', 'Fanfiction · 2,873 AO3 works'] if domain == 'fanfiction' else [f'{name} · AO3 public kudos']), domain=domain, sourceLabel='AO3 public kudos', linkLabel='AO3',
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
