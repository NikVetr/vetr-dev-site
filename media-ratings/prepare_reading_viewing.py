"""Build the Books and Anime catalogs from their original individual rating releases."""
import argparse
import ast
import csv
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse

from fit_catalog import fit_catalog, write_evidence


BOOK_SOURCE = 'https://github.com/zygmuntz/goodbooks-10k'
ANIME_SOURCE = 'https://huggingface.co/datasets/mramazan/User-Animelist-Dataset'
# A conservative vocabulary selects genre-like Goodreads shelves, excluding
# reading-status shelves, awards, and personal tags.
SHELVES = set('fiction nonfiction fantasy romance mystery historical-fiction young-adult classics '
              'science-fiction thriller horror adventure contemporary biography autobiography memoir '
              'history poetry humor crime dystopian paranormal fantasy-romance childrens manga '
              'graphic-novels middle-grade philosophy religion science psychology self-help'.split())


def read_rows(path):
    with path.open(encoding='utf-8-sig', newline='') as source:
        return list(csv.DictReader(source))


def book_items(raw, selected):
    tags = {int(r['tag_id']): r['tag_name'] for r in read_rows(raw / 'tags.csv') if r['tag_name'] in SHELVES}
    metadata = {int(r['book_id']): r for r in read_rows(raw / 'books.csv')}
    if len({r['work_id'] for r in metadata.values()}) != len(metadata):
        raise ValueError('Source must have one row per Goodreads work')
    tagged = {metadata[i]['goodreads_book_id']: [] for i in selected}
    with (raw / 'book_tags.csv').open(newline='') as source:
        for r in csv.DictReader(source):
            tag = tags.get(int(r['tag_id']))
            if r['goodreads_book_id'] in tagged and tag:
                tagged[r['goodreads_book_id']].append((int(r['count']), tag))
    items = []
    for i in selected:
        r = metadata[i]
        key = r['goodreads_book_id']
        a: dict = dict(sourceUrl=f'https://www.goodreads.com/book/show/{key}',
                 authors=[s.strip() for s in r['authors'].split(',')],
                 genres=[tag.replace('-', ' ').title() for _, tag in sorted(tagged[key], reverse=True)[:4]])
        if r['original_publication_year']:
            a['year'] = int(float(r['original_publication_year']))
        if r['image_url'].startswith('https://images.gr-assets.com/books/'):
            a['imageUrl'] = r['image_url']
        series = re.search(r'\(([^()]+), #([\d.]+)\)$', r['title'])
        if series:
            a['collection'] = series[1]
        items.append(dict(itemId=key, title=r['title'], annotations=a))
    return items


def anime_items(raw, selected):
    metadata = {int(r['animeID']): r for r in read_rows(raw / 'animes.csv')}
    items = []
    for i in selected:
        r = metadata[i]
        match = re.fullmatch(r'https://myanimelist.net/anime/(\d+)/?', r['mal_url'])
        if not match:
            raise ValueError(f'Invalid MAL link for {i}')
        a: dict = dict(sourceUrl=r['mal_url'], genres=ast.literal_eval(r['genres']), format=r['type'])
        if r['year'].isdigit():
            a['year'] = int(r['year'])
        if r['episodes'].isdigit():
            a['episodes'] = int(r['episodes'])
        if r['image_url'].startswith('https://cdn.myanimelist.net/'):
            a['imageUrl'] = r['image_url']
        items.append(dict(itemId=match[1], title=r['title'], annotations=a))
    return items


def load_profiles(raw, domain):
    is_book = domain == 'books'
    filename = 'book-ratings.csv' if is_book else 'animelist-ratings.csv'
    max_score = 5 if is_book else 10
    samples, counts = [], np.zeros(1, dtype=np.int64)
    read_count = zero_count = fractional_count = 0
    for frame in pd.read_csv(raw / filename, chunksize=800_000, dtype={
        ('user_id' if is_book else 'userID'): np.int32, ('book_id' if is_book else 'animeID'): np.int32,
        'rating': np.float64
    }):
        user, item, score = (frame[c].to_numpy() for c in frame.columns)
        read_count += len(score)
        if not np.all(np.isfinite(score)) or score.min() < 0 or score.max() > max_score:
            raise ValueError('Rating outside the source scale')
        valid = score > 0
        zero_count += int((~valid).sum())
        fractional_count += int(((score != np.floor(score)) & valid).sum())
        chunk_counts = np.bincount(item[valid], minlength=len(counts))
        if len(counts) < len(chunk_counts):
            counts = np.pad(counts, (0, len(chunk_counts) - len(counts)))
        counts += chunk_counts
        # Sample whole respondent profiles independently of their scores and activity.
        keep = valid if is_book else valid & (((user.astype(np.uint64) * 2654435761) & 0xffffffff) < 2**27)
        if fractional_count:
            raise ValueError('Pinned release must use integer ratings; check the source revision')
        encoded = score[keep].astype(np.int16)
        samples.append(pd.DataFrame(dict(user=user[keep], item=item[keep], score=encoded)))
    if is_book and zero_count:
        raise ValueError('Goodbooks entries should be integer star ratings')
    selected = np.lexsort((np.arange(len(counts)), -counts))[:500]
    sample = pd.concat(samples, ignore_index=True)
    sample = pd.DataFrame(sample.loc[sample['item'].isin(selected.tolist())]).drop_duplicates()
    conflicting = sample.duplicated(['user', 'item'], keep=False)
    dropped = int(conflicting.sum())
    sample = pd.DataFrame(sample.loc[~conflicting])
    users = np.unique(sample['user'].to_numpy())
    features = np.zeros(len(counts), dtype=np.int32)
    features[selected] = np.arange(len(selected))
    profiles = sparse.csr_matrix((sample['score'].to_numpy(), (np.searchsorted(users, sample['user'].to_numpy()),
                                 features[sample['item'].to_numpy()])), shape=(len(users), len(selected)))
    items = book_items(raw, selected) if is_book else anime_items(raw, selected)
    fit_counts = np.bincount(profiles.indices, minlength=len(items))
    for i, it in enumerate(items):
        it['annotations']['ratingCount'] = int(fit_counts[i])
    audit = dict(sourceRows=read_count, missingOrUnrated=zero_count, fractionalRatings=fractional_count,
                 top500RatingEntries=int(counts[selected].sum()), respondentFraction=1 if is_book else 1/32,
                 conflictingRowsExcluded=dropped)
    return profiles, items, list(range(1, max_score + 1)), audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('domain', choices=('books', 'anime'))
    parser.add_argument('raw', type=Path)
    parser.add_argument('--out', type=Path, default=Path(__file__).parent)
    args = parser.parse_args()
    profiles, items, scale, audit = load_profiles(args.raw, args.domain)
    print(args.domain, profiles.shape, profiles.nnz, audit, flush=True)
    book = args.domain == 'books'
    label = 'Goodbooks-10k' if book else 'User Animelist'
    catalog, report = fit_catalog(label + (' · 500 most-rated books' if book else ' · 500 most-rated anime'),
                                  items, scale, profiles)
    catalog['domain'] = args.domain
    catalog['linkLabel'] = 'Goodreads' if book else 'MyAnimeList'
    catalog['sourceLabel'] = label
    catalog['sourceUrl'] = BOOK_SOURCE if book else ANIME_SOURCE
    catalog['attribution'] = ('Zygmunt Zając, Goodbooks-10k. CC BY-SA 4.0.' if book else
                              'Ramazan Turan, User Animelist Dataset. CC BY 4.0.')
    catalog['source'] = dict(title=label, url=BOOK_SOURCE if book else ANIME_SOURCE,
                             author='Zygmunt Zając' if book else 'Ramazan Turan',
                             license='CC BY-SA 4.0' if book else 'CC BY 4.0',
                             licenseUrl='https://creativecommons.org/licenses/' + ('by-sa' if book else 'by') + '/4.0/',
                             notes='Subset, metadata and fitted aggregates adapted for Media Ratings.')
    for path, data in [(args.out / f'{args.domain}.json', catalog),
                       (args.out / 'validation' / f'{args.domain}.json', dict(**report, sourceCounts=audit))]:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    write_evidence(args.out / f'{args.domain}-evidence.json', profiles, items, scale)
    print(args.domain, report, flush=True)


if __name__ == '__main__':
    main()
