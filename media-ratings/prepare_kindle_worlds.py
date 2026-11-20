"""Fit licensed fanfiction editions from the Amazon Reviews 2023 Kindle Store."""
import argparse
from collections import Counter
from datetime import datetime
import gzip
import json
from pathlib import Path
import re
from typing import Any

import numpy as np

from fit_catalog import fit_catalog, fit_mixture, scoring_cases, score_model, summary, write_evidence
from prepare_royalroad_kindle import SCALE, review_profiles


DATASET = 'https://amazon-reviews-2023.github.io/'
KINDLE = 'https://press.aboutamazon.com/2013/6/now-open-kindle-worlds-store-and-self-service-submission-platform'
STOKER = 'https://www.ingramspark.com/blog/tips-for-authors-writing-fanfiction'
DELEON = 'https://janadeleon.com/jr-fan-fiction/'
LEVEQUE = 'https://wolfebanepublishing.com/guidelines/'
MONTANA = 'https://debraholland.com/kindle-worlds.html'
PROGRAMS = {'Operation Alpha': STOKER, 'World of de Wolfe Pack': LEVEQUE, 'Montana Sky': MONTANA}
# Exact franchise branding in the title immediately before the Kindle Worlds work name.
PREFIXES = {s.casefold(): s for s in [
    'Montana Sky', 'Extinction Cycle', 'Legacy Fleet', 'World of de Wolfe Pack', 'Dare To Love Series',
    'The Foreworld Saga', 'Hot SEALs', 'Jack Daniels and Associates', 'The Royals of Monterra', 'Silo Saga',
    'Lone Star Burn', 'The Omega Team', "Melody Anne's Billionaire Universe", 'Sassy Ever After', 'Hope Falls',
    'Wayward Pines', 'JET', 'John Rain', 'Game for Love', 'The Vampire Diaries', 'Sapphire Falls',
    'Four Weddings and a Fiasco', 'Grayslake: More than Mated',
]}
PREFIXES.update({'veronica mars - the tv series': 'Veronica Mars', 'special forces: operation alpha': 'Operation Alpha'})
# These editions' publication notes name the original program and preserve the same story/world.
REISSUES = {
    'B07FMPJJ6X': 'Fallen Empire', 'B07FMC2WF1': 'Fallen Empire',
    'B07KGK8T1L': 'Hell Yeah', 'B07KGKC6J9': 'Hell Yeah',
    'B07N7LSR3H': 'Extinction Cycle', 'B07NZVWH62': 'Extinction Cycle',
    'B07FMWYNLC': 'Magic, New Mexico',
}
KW = re.compile(r'\bkindle\s+worlds\b', re.I)
BRANCH = re.compile(r'\b(special forces?|police and fire)\s*:?\s*operation alpha\b', re.I)
BOX = re.compile(r'\bbox(?:ed)? set\b|\bomnibus\b|\b(?:collection|anthology|bundle)\b|\bbooks\s+\d+\s*[-–&]\s*\d+|\b(?:complete )?trilogy\b(?! book)', re.I)
GROUP = re.compile(r'operat(?:i)?on alph(?:a)?', re.I)


def clean(value):
    return ' '.join(value.split())


def contributors(row):
    """The singular author field can name the franchisor, a foreword writer, or the imprint."""
    credits = row.get('store') or ''
    names = []
    for credit in credits.split('Format:')[0].split('),'):
        match = re.fullmatch(r'\s*(.*?)\s*\(([^()]*)\)?\s*', credit)
        if match and 'author' in match[2].lower().split(', ') and match[1].strip():
            names.append(clean(match[1]))
    return names


def identify(row):
    title = clean(row['title'])
    authors = contributors(row)
    publisher = re.split(r';|\s*\(', row['details'].get('Publisher', ''))[0].strip()
    asin = row['parent_asin']
    if BOX.search(title):
        return
    if KW.search(title):
        if asin == 'B07MTMJ13Y':
            return 'St. Helena Vineyard', 'Kindle Worlds reissue', 'Love Thy Neighbor', KINDLE
        for prefix, fandom in sorted(PREFIXES.items(), key=lambda item: -len(item[0])):
            if title.casefold().startswith(prefix + ':'):
                name = KW.split(title[len(prefix) + 1:], maxsplit=1)[0].strip(' (')
                if name:
                    return fandom, 'Kindle Worlds', name, PROGRAMS.get(fandom, KINDLE)
    if asin in REISSUES:
        description = ' '.join(row.get('description', []) + row.get('features', []))
        if not KW.search(description):
            raise ValueError(f'Missing Kindle Worlds publication evidence for {asin}')
        return REISSUES[asin], 'Kindle Worlds reissue', title, KINDLE
    if BRANCH.search(title) and any(GROUP.fullmatch(name) for name in authors):
        return 'Operation Alpha', 'Aces Press', title, STOKER
    if publisher.casefold() == 'j&r fan fiction' and 'miss fortune world' in title.casefold():
        return 'Miss Fortune', 'J&R Fan Fiction', title, DELEON
    if ('de wolfe pack' in title.casefold() and any(s in title.casefold() for s in ('connected', 'world of de'))
            and publisher.casefold().startswith(('wolfebane publishing', 'dragonblade publishing'))
            and authors and not any(name.casefold() == 'kathryn le veque' for name in authors)):
        return 'World of de Wolfe Pack', 'de Wolfe Pack Connected World', title, LEVEQUE


def works(metadata):
    verified_covers = set(Path(__file__).with_name('kindle-worlds-cover-asins.txt').read_text().splitlines())
    selected = {}
    filtered = 0
    with gzip.GzipFile(filename=metadata, mode='rb') as stream:
        for line in stream:
            # Skip JSON parsing for records that cannot qualify under any of the publication rules.
            low = line.lower()
            if not any(marker in low for marker in
                       (b'kindle worlds', b'operation alpha', b'de wolfe pack', b'miss fortune world')):
                continue
            row = json.loads(line)
            match = identify(row)
            if not match:
                continue
            world, imprint, title, reference = match
            names = [n for n in contributors(row) if not GROUP.fullmatch(n)
                     and not re.fullmatch(r'wolfebane publishing(?:[,. ]+inc\.?)?|de wolfe pack connected world|montana sky publishing', n, re.I)]
            if not names:
                raise ValueError(f"No credited writer for {row['parent_asin']}")
            asin = row['parent_asin']
            if asin in selected:
                raise ValueError(f'Duplicate edition metadata for {asin}')
            # Match an old imprint listing to the same author's newly issued story across ASINs.
            short = re.split(r'\s*\(|:\s*de wolfe pack connected world\b', title, flags=re.I)[0].strip()
            key = re.sub(r'[\W_]', '', short.casefold()), re.sub(r'[\W_]', '', names[0].casefold())
            pub = row['details'].get('Publication date')
            url = 'https://www.amazon.com/dp/' + asin
            ann: dict[str, Any] = dict(authors=names, genres=[world], publishers=[imprint], sourceUrl=url, worldUrl=reference)
            if pub:
                ann['year'] = datetime.strptime(pub, '%B %d, %Y').year
            for image in row.get('images', []):
                link = image.get('large', '')
                if image.get('variant') == 'MAIN' and link.startswith('https://m.media-amazon.com/'):
                    ann.update(imageUrl=link, imageSourceUrl=url)
                    break
            if 'imageUrl' not in ann and asin in verified_covers:
                ann.update(imageUrl=f'https://images-na.ssl-images-amazon.com/images/P/{asin}.01.L.jpg', imageSourceUrl=url)
            selected[asin] = key, dict(itemId=asin, title=short, annotations=ann)
    # Retain a single individually rated edition per verified work. Prefer the successor's live listing.
    unique = {}
    for _, (key, entry) in sorted(selected.items()):
        prev = unique.get(key)
        if prev:
            if prev['annotations']['genres'] != entry['annotations']['genres']:
                raise ValueError(f'Ambiguous same-title work across worlds: {key}')
            filtered += 1
            if prev['annotations']['publishers'] != ['Kindle Worlds']:
                continue
        unique[key] = entry
    return sorted(unique.values(), key=lambda entry: entry['itemId']), filtered


def intervals(losses):
    delta = losses[0] - losses[1]
    rng = np.random.default_rng(44)
    means = [rng.choice(delta, size=len(delta)).mean() for _ in range(2000)]
    return np.quantile(means, [.025, .975]).tolist()


def evaluate_holdouts(profile, worlds, evaluation):
    """Predict one franchise from four ratings outside it, once per eligible held-out reader."""
    seed = evaluation['finalFit']['seed']
    rng = np.random.default_rng(seed + 1)
    order = np.random.default_rng(seed).permutation(profile.shape[0])
    split = len(order) - evaluation['developmentUsers']
    cases = []
    world_counts = Counter()
    for i in order[:split]:
        start, stop = profile.indptr[i:i+2]
        index, value = profile.indices[start:stop], profile.data[start:stop] - 1
        if len(index) < 5:
            continue
        labels = worlds[index]
        names, counts = np.unique(labels, return_counts=True)
        candidates = names[len(index) - counts >= 4]
        if not len(candidates):
            continue
        target = rng.choice(candidates)
        observed = rng.choice(np.flatnonzero(labels != target), 4, replace=False)
        chosen = np.flatnonzero(labels == target)
        withheld = rng.choice(chosen, min(len(chosen), 12), replace=False)
        cases.append((index[observed], value[observed], index[withheld], value[withheld]))
        world_counts[str(target)] += 1
    # Replay the common fitter's scoring-case draws to measure paired uncertainty on the very same primary holdout.
    selection_rng = np.random.default_rng(seed)
    selection_rng.permutation(profile.shape[0])
    for fold in np.array_split(order[split:], 3):
        scoring_cases(profile, fold, selection_rng)
    primary = scoring_cases(profile, order[:split], selection_rng)
    losses, primary_losses, scores = [], [], []
    for k in sorted({1, evaluation['selectedK']}):
        model = fit_mixture(profile[order[split:]], len(SCALE), k, seed)
        primary_metrics = score_model(model, primary, np.asarray(SCALE), evaluation['brierThreshold'])
        if not np.isclose(primary_metrics[:, 0].mean(), evaluation['holdout'][len(primary_losses)]['logLoss']):
            raise ValueError('Primary holdout cases disagree with the shared evaluator')
        primary_losses.append(primary_metrics[:, 0])
        if cases:
            metrics = score_model(model, cases, np.asarray(SCALE), evaluation['brierThreshold'])
            losses.append(metrics[:, 0])
            scores.append(summary(k, metrics))
    result = dict(testUsers=len(cases), testRatings=sum(len(c[3]) for c in cases), holdout=scores,
                  targetReadersByWorld=dict(world_counts))
    if len(losses) == 2:
        result['pairedGain95'] = intervals(losses)
    return result, intervals(primary_losses) if len(primary_losses) == 2 else None


def build(meta, ratings, out):
    items, duplicates = works(meta)
    matrix, repeated = review_profiles(ratings, [it['itemId'] for it in items])
    counts = np.bincount(matrix.indices, minlength=len(items))
    support = np.flatnonzero(counts)
    for i in support:
        items[i]['annotations']['ratingCount'] = int(counts[i])
    items = [items[i] for i in support]
    matrix = matrix[:, support].tocsr()
    matrix.sort_indices()
    worlds = np.array([x['annotations']['genres'][0] for x in items])
    sizes = np.diff(matrix.indptr)
    n_worlds = np.array([len(set(worlds[matrix.indices[a:b]])) for a,b in zip(matrix.indptr[:-1], matrix.indptr[1:])])
    audit = dict(worlds=dict(Counter(worlds.tolist())), imprints=dict(Counter(it['annotations']['publishers'][0] for it in items)),
                 worldsByRatings={w: int(counts[support][worlds == w].sum()) for w in np.unique(worlds)},
                 stars=np.bincount(matrix.data, minlength=6)[1:].tolist(), readersWithFive=int((sizes>=5).sum()),
                 readersWithTwoWorlds=int((n_worlds>=2).sum()), readersWithFiveAndTwoWorlds=int(((sizes>=5)&(n_worlds>=2)).sum()),
                 duplicateEditions=duplicates, repeatedRatingRows=repeated, covers=sum('imageUrl' in x['annotations'] for x in items))
    print(json.dumps(audit), flush=True)
    catalog, selection = fit_catalog('Licensed fanfiction · Kindle stars', items, SCALE, matrix, validation_limit=None)
    cross, paired = evaluate_holdouts(matrix, worlds, selection)
    report = dict(**selection, sourceCounts=audit, crossWorld=cross, pairedGain95=paired)
    catalog.update(domain='fanfiction', sourceLabel='Amazon Reviews 2023 · Kindle Store', linkLabel='Kindle edition',
                   sourceUrl=DATASET, source=dict(title='Amazon Reviews 2023 · Kindle Store', url=DATASET,
                   author='Hou et al., McAuley Lab', notes='Whole-star reviews of licensed Kindle Worlds and author-run fanfiction editions.'))
    out.mkdir(parents=True, exist_ok=True)
    (out/'validation').mkdir(exist_ok=True)
    for path, data in [(out/'kindle-worlds.json', catalog), (out/'validation/kindle-worlds.json', report)]:
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'))+'\n')
    write_evidence(out/'kindle-worlds-evidence.json', matrix, items, SCALE)
    print(json.dumps(report['holdout']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('metadata', type=Path, help='meta_Kindle_Store.jsonl.gz')
    parser.add_argument('ratings', type=Path, help='Kindle_Store.csv.gz, 0-core release')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    build(args.metadata, args.ratings, args.output)
