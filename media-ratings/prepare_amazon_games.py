"""Select game product editions and fit their individual Amazon 1–5 star reviews."""
import argparse
from collections import Counter
import csv
import gzip
import json
from pathlib import Path
import re
from typing import Any

import duckdb
import numpy as np
from scipy import sparse

from fit_catalog import fit_catalog, write_evidence

SOURCE = dict(title='Amazon Reviews 2023 · Video Games', author='Hou et al., McAuley Lab',
              url='https://amazon-reviews-2023.github.io/', notes='Whole-star customer reviews of '
              'specific retail game editions, through September 2023. Ports can have different scores.')
SCALE = [1, 2, 3, 4, 5]
FORMATS = {'Video Game', 'Software Download', 'Game Cartridge', 'Computer Game', 'Game', 'CD-ROM', 'DVD-ROM'}
EXTRAS = re.compile(r"\b(?:dlc|add[ -]?on|expansion pack|season pass|gift card|subscription|screen protector|"
                    r"thumb grips?|replacement case|amiibo|gameplay guide|strategy guide|action figure|"
                    r"collector.s box only|game not included|no game included|in.game currency|simpoints|"
                    r"points card|map pack|texture pack|game time card|starter deck|booster pack)\b", re.I)
PLATFORMS = {
    'PlayStation 3': r'\b(?:PS\s*3|PlayStation\s*3)\b',
    'PlayStation 4': r'\b(?:PS\s*4|PlayStation\s*4)\b',
    'PlayStation 5': r'\b(?:PS\s*5|PlayStation\s*5)\b',
    'PlayStation Vita': r'\b(?:PS Vita|PlayStation Vita)\b',
    'Xbox 360': r'\b(?:Xbox\s*360|X360)\b', 'Xbox One': r'\bXbox\s*One\b',
    'Xbox Series X & S': r'\bXbox Series [XS]', 'GameCube': r'\bGameCube\b',
    'Nintendo 3DS & 2DS': r'\b[32]DS\b', 'Game Boy Advance': r'\bGame Boy Advance\b',
    'Nintendo Switch': r'\bSwitch\b', 'Wii U': r'\bWii U\b',
}


def game_edition(record) -> dict[str, Any] | None:
    categories = record['categories']
    details = record['details']
    title = ' '.join(record['title'].split())
    if (record['main_category'] != 'Video Games' or len(categories) < 3
            or categories[0] != 'Video Games' or categories[-1] != 'Games'
            or details.get('Type of item') not in FORMATS or not title or EXTRAS.search(title)):
        return None
    asin = record['parent_asin']
    if not re.fullmatch(r'[A-Z0-9]{10}', asin):
        raise ValueError(f'Invalid game parent ASIN {asin}')
    platform: str = categories[-2]
    named = [p for p, pattern in PLATFORMS.items() if re.search(pattern, title, re.I)]
    if platform.endswith('Digital Content'):
        if len(named) != 1:
            return None
        platform = named[0]
    elif named and platform not in named:
        return None
    short = {'Nintendo 3DS & 2DS': '3DS', 'Nintendo NES': 'NES', 'Sony PSP': 'PSP',
             'PlayStation Vita': 'Vita', 'Nintendo Switch': 'Switch'}.get(platform, platform)
    in_title = platform in named or re.search(rf'\b{re.escape(short)}\b', title, re.I)
    display = title if in_title else f'{title} · {platform}'
    annotation: dict[str, Any] = dict(platforms=[platform], sourceUrl='https://www.amazon.com/dp/' + asin)
    date = re.search(r'\b(19\d\d|20\d\d)$', details.get('Release date', ''))
    if date and 1970 <= int(date[1]) <= 2023:
        annotation['year'] = int(date[1])
    for pic in record.get('images', []):
        url = pic.get('large')
        if pic.get('variant') == 'MAIN' and url and url.startswith('https://m.media-amazon.com/'):
            annotation['imageUrl'] = url
            break
    return dict(itemId=asin, title=display, annotations=annotation)


def choose(items, counts):
    ranked = sorted((i for i in items if counts.get(i, 0) >= 25), key=lambda i: (-counts[i], i))
    selected, names = [], set()
    totals = Counter()
    for i in ranked:
        record = items[i]
        name = record['title'].casefold()
        platform = record['annotations']['platforms'][0]
        if name in names:
            continue
        if len(selected) < 500 or totals[platform] < 45:
            selected.append(record)
            totals[platform] += 1
            names.add(name)
    return selected


def prepare(meta, reviews, work):
    items = {}
    with Path(__file__).with_name('amazon-games-excluded.csv').open(newline='') as f:
        exclusions = {row['parent_asin'] for row in csv.DictReader(f)}
    found = set()
    with gzip.open(meta, 'rt') as stream:
        for line in stream:
            row = json.loads(line)
            if row['parent_asin'] in exclusions:
                found.add(row['parent_asin'])
                continue
            entry = game_edition(row)
            if entry:
                item_id = entry['itemId']
                if item_id in items:
                    raise ValueError(f'Duplicate game metadata for {item_id}')
                items[item_id] = entry
    if found != exclusions:
        raise ValueError(f'Excluded product missing from source: {sorted(exclusions - found)}')
    with duckdb.connect(config={'threads': 1, 'memory_limit': '1600MB'}) as db:
        db.execute('CREATE TABLE eligible(asin VARCHAR PRIMARY KEY)')
        db.executemany('INSERT INTO eligible VALUES (?)', [(i,) for i in items])
        db.execute("""
            CREATE TEMP TABLE scored AS SELECT user_id, parent_asin AS asin, rating, timestamp
            FROM read_csv(?, header=true, columns={'user_id':'VARCHAR','parent_asin':'VARCHAR',
                'rating':'DOUBLE','timestamp':'BIGINT'}) JOIN eligible ON parent_asin=asin
        """, [str(reviews)])
        if db.sql("""SELECT count(*) FROM scored WHERE user_id IS NULL OR trim(user_id)=''
                OR timestamp IS NULL OR rating IS NULL OR rating NOT IN (1,2,3,4,5)""").fetchall()[0][0]:
            raise ValueError('Invalid reviewer, timestamp or rating for a game')
        db.execute("""
            CREATE TEMP TABLE latest AS SELECT user_id, asin, min(rating)::TINYINT AS stars,
            min(rating) != max(rating) AS conflict FROM
                (SELECT *, max(timestamp) OVER (PARTITION BY user_id,asin) AS recent FROM scored)
            WHERE timestamp=recent GROUP BY user_id, asin
        """)
        if db.sql('SELECT count(*) FROM latest WHERE conflict').fetchall()[0][0]:
            raise ValueError('Conflicting ratings on the latest date for an edition and reviewer')
        counts = dict(db.sql('SELECT asin, count(*) FROM latest GROUP BY asin').fetchall())
        chosen = choose(items, counts)
        if not chosen:
            raise ValueError('No editions with enough reviews')
        ids = [it['itemId'] for it in chosen]
        db.execute('CREATE TABLE selected(asin VARCHAR PRIMARY KEY, col INTEGER)')
        db.executemany('INSERT INTO selected VALUES (?,?)', [(i,j) for j,i in enumerate(ids)])
        votes = db.sql("""SELECT dense_rank() OVER (ORDER BY user_id)-1 AS person, col, stars
                         FROM latest JOIN selected USING(asin) ORDER BY person,col""").fetchnumpy()
    matrix = sparse.csr_matrix((votes['stars'].astype(np.int32), (votes['person'], votes['col'])))
    for record in chosen:
        record['annotations']['ratingCount'] = counts[record['itemId']]
    work.mkdir(parents=True, exist_ok=True)
    (work / 'items.json').write_text(json.dumps(chosen))
    sparse.save_npz(work / 'profiles.npz', matrix)
    audit = dict(eligibleProducts=len(items), productsWithAtLeast25=sum(int(v >= 25) for v in counts.values()),
                 platformCoverage=dict(Counter(it['annotations']['platforms'][0] for it in chosen)),
                 coveredEditions=len(chosen), ratings=matrix.nnz, reviewers=len(matrix.indptr) - 1,
                 eligibleReviewers=int((np.diff(matrix.indptr) >= 5).sum()))
    (work / 'coverage.json').write_text(json.dumps(audit, indent=2) + '\n')
    print(json.dumps(audit), flush=True)


def fit(work, out):
    items = json.loads((work / 'items.json').read_text())
    matrix = sparse.load_npz(work / 'profiles.npz')
    catalog, evaluation = fit_catalog('Amazon · video game edition reviews', items, SCALE, matrix,
                                      validation_limit=None)
    catalog.update(domain='games', sourceLabel='Amazon Reviews 2023', linkLabel='Amazon edition',
                   source=SOURCE, sourceUrl=SOURCE['url'])
    report = dict(**evaluation, sourceCounts=json.loads((work / 'coverage.json').read_text()))
    out.mkdir(exist_ok=True, parents=True)
    (out / 'validation').mkdir(exist_ok=True)
    for name, data in [('amazon-games.json', catalog), ('validation/amazon-games.json', report)]:
        (out / name).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    write_evidence(out / 'amazon-games-evidence.json', matrix, items, SCALE)
    print(json.dumps(report['holdout']), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('prepare')
    p.add_argument('metadata', type=Path)
    p.add_argument('reviews', type=Path)
    p.add_argument('work', type=Path)
    f = sub.add_parser('fit')
    f.add_argument('work', type=Path)
    f.add_argument('out', type=Path)
    args = parser.parse_args()
    if args.command == 'prepare':
        prepare(args.metadata, args.reviews, args.work)
    else:
        fit(args.work, args.out)
