"""Fit scores for matched Kindle editions of original Royal Road serials."""
import argparse
import csv
from datetime import datetime
import gzip
import json
from pathlib import Path
import re

import numpy as np
import pyarrow.parquet as pq
from scipy.sparse import csr_matrix

from fit_catalog import fit_catalog, write_evidence


SCALE = [1, 2, 3, 4, 5]
NAME = 'Royal Road · Kindle edition reviews'
RR_SNAPSHOT = '188fda4f440ec4a020b8ed76e21fe6e0eca51266'
SOURCE = dict(title="Amazon Reviews 2023 · Kindle Store", author="Hou et al., McAuley Lab",
              url="https://amazon-reviews-2023.github.io/",
              notes="Whole-star reviews of matched Kindle editions, through September 2023. "
                    "Each work links to its Royal Road serial. Readers and ratings come from Amazon.")


def crosswalk(path):
    pairs = {}
    used = set()
    with path.open(newline='') as f:
        for row in csv.DictReader(f):
            asin = row['parent_asin']
            fid = int(row['fiction_id'])
            if not re.fullmatch(r'[A-Z0-9]{10}', asin) or fid < 1 or asin in pairs or fid in used:
                raise ValueError(f'Invalid or repeated Kindle edition / fiction pair: {asin}, {fid}')
            pairs[asin] = fid
            used.add(fid)
    if not pairs:
        raise ValueError('The edition crosswalk is empty')
    return pairs


def selected_editions(path, keep):
    result = {}
    with gzip.open(path, 'rt') as f:
        for line in f:
            row = json.loads(line)
            asin = row['parent_asin']
            if asin in keep:
                if asin in result:
                    raise ValueError(f'Multiple metadata entries for {asin}')
                result[asin] = row
    if set(result) != set(keep):
        raise ValueError(f'Missing Kindle metadata for {sorted(set(keep) - set(result))}')
    return result


def review_profiles(path, asins):
    by_id = {asin: i for i, asin in enumerate(asins)}
    ratings = {}
    repeated = 0
    with gzip.open(path, 'rt', newline='') as f:
        reader = csv.reader(f)
        if next(reader) != ['user_id', 'parent_asin', 'rating', 'timestamp']:
            raise ValueError('Unexpected Amazon 0-core ratings header')
        for person, asin, score, stamp in reader:
            if asin not in by_id:
                continue
            stars = float(score)
            if stars not in SCALE or not person.strip():
                raise ValueError(f'Invalid reader or stars for {asin}')
            key = person, by_id[asin]
            observation = int(stamp), int(stars)
            previous = ratings.get(key)
            if previous:
                repeated += 1
                if observation[0] == previous[0] and observation[1] != previous[1]:
                    ratings[key] = (observation[0], 0)
            if previous is None or observation[0] > previous[0]:
                ratings[key] = observation
    if any(stars == 0 for _, stars in ratings.values()):
        raise ValueError('Conflicting stars at the latest time for a reader and edition')
    if not ratings:
        raise ValueError('Found no reviews of the linked editions')
    people = {person: i for i, person in enumerate(sorted({p for p, _ in ratings}))}
    rows = [people[p] for p, _ in ratings]
    cols = [c for _, c in ratings]
    stars = [y for _, y in ratings.values()]
    profile = csr_matrix((np.asarray(stars, dtype=np.int8), (rows, cols)), shape=(len(people), len(asins)))
    return profile, repeated


def item(asin, book, serial, count):
    tags = json.loads(serial['tags'] or '[]')
    if serial['is_original'] != 1 or not book['title'] or not serial['title'] or not isinstance(tags, list):
        raise ValueError(f'Invalid or non-original Royal Road match for {asin}')
    aid = serial['fiction_id']
    author = book['author']['name']
    a = dict(authors=[author], collection=serial['title'], genres=tags,
             sourceUrl='https://www.amazon.com/dp/' + asin, royalRoadUrl=f'https://www.royalroad.com/fiction/{aid}',
             ratingCount=int(count))
    if serial['author'] != author:
        a['serialAuthor'] = serial['author']
    pub = book['details'].get('Publisher')
    if pub:
        publisher = re.sub(r'\s*\([A-Za-z]+ \d{1,2}, \d{4}\)\s*$', '', pub).split(';')[0].strip()
        if publisher:
            a['publishers'] = [publisher]
    date = book['details'].get('Publication date')
    if date:
        a['year'] = datetime.strptime(date, '%B %d, %Y').year
    for pic in book.get('images', []):
        url = pic.get('large')
        if pic.get('variant') == 'MAIN' and url and url.startswith('https://m.media-amazon.com/'):
            a['imageUrl'] = url
            break
    return dict(itemId=asin, title=book['title'], annotations=a)


def build(meta_rr, meta_kindle, ratings, pairs, out):
    asins = sorted(pairs)
    cols = ['fiction_id', 'title', 'author', 'tags', 'is_original']
    rr = pq.read_table(meta_rr, columns=cols, filters=[('fiction_id', 'in', list(pairs.values()))]).to_pylist()
    serials = {x['fiction_id']: x for x in rr}
    if len(rr) != len(pairs) or set(serials) != set(pairs.values()):
        raise ValueError('Missing or ambiguous Royal Road IDs in the metadata snapshot')
    books = selected_editions(meta_kindle, asins)
    profile, repeated = review_profiles(ratings, asins)
    counts = np.bincount(profile.indices, minlength=len(asins))
    support = np.flatnonzero(counts)
    items = [item(asins[i], books[asins[i]], serials[pairs[asins[i]]], counts[i]) for i in support]
    profile = profile[:, support].tocsr()
    profile.sort_indices()
    sizes = np.diff(profile.indptr)
    audit = dict(matchedEditions=len(asins), editionsWithRatings=len(items), respondents=len(sizes),
                 ratings=profile.nnz, readersWithTwoWorks=int((sizes >= 2).sum()),
                 readersWithFiveWorks=int((sizes >= 5).sum()), repeatedReviewRows=repeated)
    print(json.dumps(audit), flush=True)
    catalog, evaluation = fit_catalog(NAME, items, SCALE, profile, validation_limit=None)
    catalog.update(domain='royalroad', linkLabel='Kindle edition', sourceLabel=SOURCE['title'],
                   sourceUrl=SOURCE['url'], source=SOURCE)
    report = dict(**evaluation, sourceCounts=audit, serialSnapshot=RR_SNAPSHOT)
    out.mkdir(exist_ok=True, parents=True)
    for name, value in [('royalroad-kindle.json', catalog), ('validation/royalroad-kindle.json', report)]:
        target = out / name
        target.parent.mkdir(exist_ok=True)
        target.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')
    write_evidence(out / 'royalroad-kindle-evidence.json', profile, items, SCALE)
    print(json.dumps(report['holdout']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('rr_meta', type=Path, help='Royal Road Breakout books_meta.parquet')
    parser.add_argument('kindle_meta', type=Path, help='meta_Kindle_Store.jsonl.gz')
    parser.add_argument('ratings', type=Path, help='Kindle_Store.csv.gz, 0-core rating-only edition')
    parser.add_argument('out', type=Path)
    parser.add_argument('--crosswalk', type=Path, default=Path(__file__).with_name('royalroad-kindle-crosswalk.csv'))
    args = parser.parse_args()
    build(args.rr_meta, args.kindle_meta, args.ratings, crosswalk(args.crosswalk), args.out)
