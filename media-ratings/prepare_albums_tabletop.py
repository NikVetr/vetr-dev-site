"""Build album and tabletop catalogs from historical, individual Amazon product ratings."""
import argparse
import ast
from collections import Counter
import gzip
import html
import json
from pathlib import Path
import re
from zipfile import ZipFile

import duckdb
import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import fit_catalog, write_evidence


AMAZON_URL = 'https://cseweb.ucsd.edu/~jmcauley/datasets/amazon_v2/'
MARD_URL = 'https://www.upf.edu/web/mtg/mard'


def clean(value):
    return ' '.join(html.unescape(value or '').split())


def cover_url(url):
    match = re.fullmatch(r'https?://(?:ecx\.images-amazon\.com|images\.amazon\.com)/images/I/([A-Za-z0-9%+_.-]+)', url or '')
    return 'https://m.media-amazon.com/images/I/' + match[1] if match else None


def albums(path):
    items, editions = {}, {}
    with ZipFile(path) as archive, archive.open('mard/mard_metadata.json') as stream:
        # A release can be reviewed under several ASINs. An exact MusicBrainz
        # match is strongest. Unmapped editions can inherit an unambiguous
        # mapped group only when the credited artist and album title both match.
        rows = []
        known = {}
        for line in stream:
            row = json.loads(line)
            artist, title = clean(row.get('artist')), clean(row.get('title'))
            if not artist or not title:
                continue
            key = (artist.casefold(), title.casefold())
            gid = row.get('release-group-mbid') if row.get('confidence') == 1 else None
            if gid:
                known.setdefault(key, set()).add(gid)
            rows.append((row['amazon-id'], artist, title, key, gid, row.get('categories') or [],
                         row.get('root-genre'), row.get('first-release-year'), row.get('imUrl')))
    fallback = {}
    for asin, artist, title, key, gid, categories, genre, year, artwork in sorted(rows, key=lambda r: r[0]):
        if not gid:
            matches = known.get(key, set())
            if len(matches) == 1:
                gid = next(iter(matches))
            elif matches:
                continue
            else:
                gid = fallback.setdefault(key, 'amazon-' + asin)
        editions[asin] = gid
        if gid not in items:
            if gid.startswith('amazon-'):
                link, url = 'Amazon', f'https://www.amazon.com/dp/{asin}'
            else:
                link, url = 'MusicBrainz', f'https://musicbrainz.org/release-group/{gid}'
            annotation = dict(authors=[artist], sourceUrl=url, linkLabel=link, genres=[], tags=[])
            items[gid] = dict(itemId=gid, title=f'{artist} — {title}', annotations=annotation)
        a = items[gid]['annotations']
        for category in categories:
            if len(category) > 1 and category[0] == 'CDs & Vinyl':
                a['genres'].append(clean(category[1]))
                a['tags'].extend(clean(s) for s in category[2:] if s)
        if genre:
            a['genres'].append(clean(genre))
        if str(year).isdigit() and 1900 <= int(year) <= 2014:
            a['year'] = min(a.get('year', int(year)), int(year))
        image = cover_url(artwork)
        if image:
            a.setdefault('imageUrl', image)
    for item in items.values():
        a = item['annotations']
        a['genres'] = sorted(set(a['genres']))
        a['tags'] = sorted(set(a['tags']) - set(a['genres']))
    return items, editions


GAME_ACCESSORIES = re.compile(
    r'\b(?:sleeves|score ?(?:cards?|pads?|sheets?)|table covers?|card holders?|playmats?|deck dividers?|'
    r'card shufflers?|kinetic sand|replacement pieces?|scrabble tiles|card barrier|centerpiece kit|booster (?:packs?|box))\b'
    r'|\b(?:dominoe?s?|mah ?jongg?(?: game)?|mah-jongg?) (?:racks?|trays?|pushers?|table|tile holders?)\b'
    r'|\b(?:random .* tokens|train markers|(?:wooden |dominoe? )?tile racks|protective silk sleeve|racks / trays)\b', re.I)
GAME_FAMILIES = ('Cards Against Humanity', 'Catan', 'Ticket to Ride', 'Pandemic', 'Carcassonne', 'Dominion',
                 'Apples to Apples', 'Monopoly', 'Scrabble', 'Clue', 'Jenga', 'Munchkin', 'Fluxx', 'Rummikub',
                 'Bananagrams', 'Blokus', 'Qwirkle', 'Cranium', 'Agricola', 'Small World', '7 Wonders',
                 'Game of Thrones', 'Star Wars', 'Magic the Gathering', 'Pokemon', 'Risk')
FAMILY_PATTERNS = [(family, re.compile(r'\b' + re.escape(family) + r'\b', re.I)) for family in GAME_FAMILIES]


def tabletop(path):
    # These nodes identify game products. Separate product editions get their own
    # scores because Amazon reviews can describe the particular physical edition.
    nodes = {'Board Games', 'Card Games', 'Stacking Games', 'Tile Games'}
    items = {}
    with gzip.open(path, 'rt') as stream:
        for line in stream:
            row = ast.literal_eval(line)
            game_paths = [p[p.index('Games') + 1:] for p in row.get('categories', [])
                          if 'Games' in p and len(p) > p.index('Games') + 1 and p[p.index('Games') + 1] in nodes]
            title = clean(row.get('title'))
            if not game_paths or not title or GAME_ACCESSORIES.search(title):
                continue
            if 'chess pieces' in title.lower() and 'board' not in title.lower():
                continue
            asin = row['asin']
            a = dict(sourceUrl=f'https://www.amazon.com/dp/{asin}', genres=sorted({p[0] for p in game_paths}),
                     tags=sorted({clean(s) for p in game_paths for s in p[1:]}))
            image = cover_url(row.get('imUrl'))
            if image:
                a['imageUrl'] = image
            if re.search(r'\bexpansion\b', title, re.I):
                a['format'] = 'Expansion'
            for family, expression in FAMILY_PATTERNS:
                if expression.search(title):
                    a['collection'] = family
                    break
            brand = clean(row.get('brand'))
            if brand:
                a['authors'] = [brand]
            items[asin] = dict(itemId=asin, title=title, annotations=a)
    return items, {asin: asin for asin in items}


def select_items(candidates, counts, per_group, popular, minimum):
    ranked = sorted((key for key, count in counts.items() if count >= minimum), key=lambda k: (-counts[k], k))
    selected = set(ranked[:popular])
    seen = Counter()
    for key in ranked:
        groups = candidates[key]['annotations']['genres']
        if any(seen[g] < per_group for g in groups):
            selected.add(key)
        seen.update(groups)
    # Identically marketed products without a distinct visible title would
    # otherwise make keyboard entry and search ambiguous. Keep the most rated.
    titles, result = set(), []
    for key in ranked:
        item = candidates[key]
        title = item['title'].casefold()
        if key in selected and title not in titles:
            result.append(item)
            titles.add(title)
    return result


def make_profiles(older, newer, editions, candidates, per_group, popular, minimum):
    db = duckdb.connect(config={'threads': 1, 'memory_limit': '1600MB'})
    db.execute('CREATE TABLE editions(asin VARCHAR, item VARCHAR)')
    db.executemany('INSERT INTO editions VALUES (?, ?)', list(editions.items()))
    db.execute("""
        CREATE TEMP TABLE reviews AS
        SELECT user_id, item, first(score ORDER BY stamp DESC, asin, score DESC)::TINYINT AS score
        FROM (SELECT * FROM read_csv(?, header=false, columns={'user_id':'VARCHAR','asin':'VARCHAR',
                       'score':'DOUBLE','stamp':'BIGINT'})
              UNION ALL BY NAME
              SELECT * FROM read_csv(?, header=false, columns={'asin':'VARCHAR','user_id':'VARCHAR',
                       'score':'DOUBLE','stamp':'BIGINT'})) r
        INNER JOIN editions USING (asin)
        WHERE user_id IS NOT NULL AND score BETWEEN 1 AND 5 AND score = trunc(score)
        GROUP BY user_id, item
    """, [str(older), str(newer)])
    counts = dict(db.execute('SELECT item, count(*) FROM reviews GROUP BY item').fetchall())
    items = select_items(candidates, counts, per_group, popular, minimum)
    if not items:
        raise ValueError('No matching products with enough explicit ratings')
    db.execute('CREATE TABLE selected(item VARCHAR, col INTEGER)')
    db.executemany('INSERT INTO selected VALUES (?, ?)', [(it['itemId'], j) for j, it in enumerate(items)])
    vectors = db.execute("""
        SELECT (dense_rank() OVER (ORDER BY user_id) - 1)::INTEGER AS respondent, col, score
        FROM reviews INNER JOIN selected USING (item)
    """).fetchnumpy()
    db.close()
    profiles = csr_matrix((vectors['score'], (vectors['respondent'], vectors['col'])), shape=(int(vectors['respondent'].max()) + 1, len(items)))
    if profiles.nnz != len(vectors['score']):
        raise ValueError('Input contains repeated respondent/item pairs')
    for item in items:
        item['annotations']['ratingCount'] = counts[item['itemId']]
    return items, profiles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('domain', choices=['albums', 'boardgames'])
    parser.add_argument('metadata', type=Path, help='MARD ZIP for albums or Amazon Toys & Games metadata gzip for tabletop')
    parser.add_argument('older_ratings', type=Path, help='2014 Amazon per-category four-column ratings CSV (user, item, stars, timestamp)')
    parser.add_argument('newer_ratings', type=Path, help='2018 Amazon per-category four-column ratings CSV (item, user, stars, timestamp)')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    if args.domain == 'albums':
        candidates, editions = albums(args.metadata)
        per_group, popular, minimum = 250, 500, 12
        name, link = 'Amazon · albums across 16 genres', 'MusicBrainz'
        source = dict(title='Amazon product reviews & Multimodal Album Reviews Dataset', url=MARD_URL,
                      author='Jianmo Ni, Jiacheng Li and Julian McAuley (Amazon reviews), Sergio Oramas et al. (MARD).',
                      license='MARD metadata · MIT', licenseUrl=MARD_URL,
                      notes='Individual 1996–2018 CD and vinyl product reviews. Editions are linked by exact-confidence MusicBrainz release group or matching artist and title. The most recent rating per reviewer and release is used.')
    else:
        candidates, editions = tabletop(args.metadata)
        per_group, popular, minimum = 400, 650, 12
        name, link = 'Amazon · board, card, stacking & tile games', 'Amazon'
        source = dict(title='Amazon product reviews · Toys & Games', url=AMAZON_URL,
                      author='Jianmo Ni, Jiacheng Li and Julian McAuley (Amazon reviews), Julian McAuley et al. (product metadata).',
                      notes='Individual 1996–2018 Amazon product reviews. Ratings concern particular game products and can reflect edition quality, components and packaging.')
    items, profiles = make_profiles(args.older_ratings, args.newer_ratings, editions, candidates, per_group, popular, minimum)
    print(f'{args.domain}: {len(items)} items, {len(profiles.indptr) - 1} users, {profiles.nnz} ratings', flush=True)
    scale = [1, 2, 3, 4, 5]
    catalog, selection = fit_catalog(name, items, scale, profiles, validation_limit=None)
    catalog.update(domain=args.domain, sourceLabel='Amazon reviews', linkLabel=link, source=source)
    report: dict[str, object] = dict(selection)
    report['respondentsWithFiveRatings'] = int(np.sum(np.diff(profiles.indptr) >= 5))
    report['groupCoverage'] = dict(Counter(g for it in items for g in it['annotations']['genres']).most_common())
    report['validationSampling'] = 'All development respondents with five or more catalog ratings'
    report['eligibleItems'] = len(candidates)
    args.output.mkdir(parents=True, exist_ok=True)
    validation = args.output / 'validation'
    validation.mkdir(exist_ok=True)
    (args.output / f'{args.domain}.json').write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
    (validation / f'{args.domain}.json').write_text(json.dumps(report, indent=2) + '\n')
    write_evidence(args.output / f'{args.domain}-evidence.json', profiles, items, scale)


if __name__ == '__main__':
    main()
