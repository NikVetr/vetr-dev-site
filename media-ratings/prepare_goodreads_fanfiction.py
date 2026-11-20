"""Fit Goodreads stars for independently identified fan works. See granular-source-audit.md.

The work files used here are metadata-only snapshots. Goodreads review text and
individual responses are never exported. Supply an output directory explicitly.
"""
import argparse
import collections
import gzip
import html
import itertools
import json
from pathlib import Path
import re
import unicodedata

import duckdb
import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import fit_catalog, fit_mixture, scoring_cases, score_model, summary
from prepare_ao3 import named_authors, work_fandoms


SOURCE = 'https://cseweb.ucsd.edu/~jmcauley/datasets/goodreads.html'
CATALOG_METADATA = dict(
    domain='fanfiction', sourceLabel='Goodreads', linkLabel='Goodreads', sourceUrl=SOURCE,
    source=dict(
        title='UCSD Goodreads Book Graph', url=SOURCE, author='Mengting Wan and Julian McAuley',
        notes='This noncommercial academic demo uses ratings from public Goodreads shelves collected in 2017. '
              'Story identities and metadata come from yrtsk’s AO3 archive and mrzjy’s FanFiction.net archive.',
    ),
    observationsNote='The research demo publishes fitted rating probabilities. Individual co-rating tables are omitted.',
)
SHELVES = {'ao3', 'archiveofourown', 'fanfiction', 'fanfic', 'fanfictionnet', 'ffnet', 'ffn'}
PUBLISHERS = SHELVES | {'archiveofourownorg', 'selfpublishedonao3', 'wwwfanfictionnet',
                        'hpmorcomfanfictionnet', 'selfpublished', 'livejournal', 'lj', ''}
STORY_URL = {
    'ao3': re.compile(r'\b(?:archiveofourown\.org|ao3\.org)/works/(\d+)', re.I),
    'ffn': re.compile(r'\bfanfiction\.net/s/(\d+)', re.I),
}
SERIES = re.compile(r'\s+\([^()]+,\s*#\d+(?:\.\d+)?\)\s*$')
ACCOUNT = re.compile(r'\s*\((?:AO3|FFN|FanFiction\.net)\)$', re.I)
SCOPE = {'ao3': {'General Audiences', 'Teen And Up Audiences', 'Mature'},
         'ffn': {'K', 'K+', 'T', 'M'}}


def key(value):
    folded = unicodedata.normalize('NFKD', html.unescape(value).casefold())
    return ''.join(ch for ch in folded if ch.isalnum())


def candidate_editions(raw):
    """Shelf and publisher strings nominate candidates; a separate source verifies identity."""
    editions = {}
    markers = (b'fanfic', b'fan fic', b'fan-fic', b'archiveofourown', b'archive of our own',
               b'ao3', b'ffnet', b'"ffn"')
    with gzip.open(raw / 'goodreads_books.json.gz', 'rb') as stream:
        for line in stream:
            assert isinstance(line, bytes)
            low = line.lower()
            if not any(marker in low for marker in markers):
                continue
            book = json.loads(line)
            if (not book['work_id'].isdigit() or book['isbn'] or book['isbn13']
                    or key(book['publisher']) not in PUBLISHERS):
                continue
            source_fields = ' '.join(book.get(k, '') for k in ('description', 'edition_information', 'publisher'))
            urls = {(host, id_) for host, pattern in STORY_URL.items() for id_ in pattern.findall(source_fields)}
            shelf = any(key(s['name']) in SHELVES and int(s['count']) > 0 for s in book['popular_shelves'])
            if not (shelf or urls or key(book['publisher']) in SHELVES | {'selfpublishedonao3'}):
                continue
            titles = {book['title'], book['title_without_series']}
            titles.update(SERIES.sub('', t) for t in tuple(titles))
            editions[book['book_id']] = dict(work=book['work_id'], title=SERIES.sub('', book['title']),
                titles={key(t) for t in titles if t}, author_ids=[a['author_id'] for a in book['authors'] if not a['role']],
                urls=urls, popularity=int(book['ratings_count'] or 0))
    needed = {a for b in editions.values() for a in b['author_ids']}
    names = {}
    with gzip.open(raw / 'goodreads_book_authors.json.gz', 'rb') as stream:
        for line in stream:
            author = json.loads(line)
            if author['author_id'] in needed:
                names[author['author_id']] = key(ACCOUNT.sub('', author['name']))
    index = collections.defaultdict(set)
    for edition, book in editions.items():
        for a in book.pop('author_ids'):
            if names.get(a):
                for t in book['titles']:
                    index[t, names[a]].add(edition)
    return editions, index


def ao3_works(path, index):
    titles = {t for t, _ in index}
    with path.open('rb') as stream:
        for line in stream:
            row = json.loads(line)
            title = row.get('title', '')
            if key(title) not in titles:
                continue
            meta = row['metadata']
            authors = named_authors((meta.get('author') or '').removeprefix('by '))
            aliases = set(authors)
            for a in authors:
                match = re.fullmatch(r'(.*?)\s*\(([^()]+)\)', a)
                if match:
                    aliases.update(match.groups())
            books = set().union(*(index.get((key(title), key(a)), set()) for a in aliases))
            if not books:
                continue
            fandoms = work_fandoms(meta)
            date = meta.get('published') or ''
            words = str(meta.get('words', '')).replace(',', '')
            permitted = (meta.get('Language') == 'English' and meta.get('Rating') in SCOPE['ao3']
                         and bool(set(fandoms) - {'Original Work', 'No Fandom'})
                         and words.isdigit() and int(words) >= 100
                         and re.fullmatch(r'\d{4}-\d{2}-\d{2}', date) and date <= '2017-12-31')
            yield books, ('ao3', row['id']), dict(title=title, authors=authors, certificate=meta.get('Rating'),
                genres=fandoms, wordCount=int(words) if words.isdigit() else 0,
                permitted=bool(permitted), year=int(date[:4]) if permitted else None)


def ffn_works(files, index, db):
    valid_names = {a for _, a in index}
    query = """SELECT source_file,story_url,category,language,rating,words FROM read_parquet(?)"""
    result = db.execute(query, [files])
    while rows := result.fetchmany(16384):
        for filename, url, category, language, rating, raw_words in rows:
            parts = (filename or '').removesuffix('.txt').split(' - ', 2)
            if len(parts) != 3 or key(parts[1]) not in valid_names:
                continue
            _, author, title = parts
            books = index.get((key(title), key(author)))
            match = re.fullmatch(r'https?://(?:www\.)?fanfiction\.net/s/(\d+)(?:/\d+)?/?', url or '')
            if not books or not match:
                continue
            words = str(raw_words).replace(',', '')
            yield books, ('ffn', match[1]), dict(title=title, authors=[author], certificate=rating,
                genres=[category] if category else [], wordCount=int(words) if words.isdigit() else 0,
                permitted=language == 'English' and rating in SCOPE['ffn'] and bool(category)
                          and words.isdigit() and int(words) >= 100, year=None)


def crosswalk(editions, candidates):
    """Coalesce corroborated editions and cross-posts, reject ambiguous source IDs."""
    matches = collections.defaultdict(set)
    details = {}
    ambiguous = set()
    for books, story, properties in candidates:
        if story in details and details[story] != properties:
            ambiguous.add(story)
        details[story] = properties
        for b in books:
            matches[b].add(story)

    # A book or a Goodreads work ID creates edges between records in the two archives.
    # A strongly linked record on either platform can only have one original ID per host.
    by_node = collections.defaultdict(set)
    for b, stories in matches.items():
        if editions[b]['urls'] and not editions[b]['urls'].issubset(stories):
            continue
        for node in stories | {('gr', editions[b]['work'])}:
            by_node[node].add(b)
    groups = []
    remaining = {b for members in by_node.values() for b in members}
    while remaining:
        seed = min(remaining, key=int)
        stack = [seed]
        members = set()
        while stack:
            b = stack.pop()
            if b in members:
                continue
            members.add(b)
            for node in matches[b] | {('gr', editions[b]['work'])}:
                stack.extend(by_node[node] - members)
        remaining -= members
        sources = set().union(*(matches[b] for b in members))
        if (sources & ambiguous or len(sources) != len({s[0] for s in sources})
                or any(not details[s]['permitted'] for s in sources)):
            continue
        # Prefer a direct edition-to-story link, then a widely catalogued edition.
        book = max(members, key=lambda b: (bool(editions[b]['urls']), editions[b]['popularity'], -int(b)))
        direct = editions[book]['urls']
        story = min(direct or matches[book])
        info = details[story]
        host, id_ = story
        base = 'https://archiveofourown.org/works/' if host == 'ao3' else 'https://www.fanfiction.net/s/'
        annotations = dict(authors=info['authors'], genres=info['genres'], certificate=info['certificate'],
                           format='Fanfiction', sourceUrl='https://www.goodreads.com/book/show/' + book,
                           storyUrl=base + id_, wordCount=info['wordCount'])
        if info['year']:
            annotations['year'] = info['year']
        # FFN's legacy filenames replace punctuation with "_"; retain the verified spelling on the edition.
        title = editions[book]['title'] if host == 'ffn' else info['title']
        groups.append((sorted(members, key=int), dict(itemId=book, title=title, annotations=annotations),
                       any(editions[b]['urls'] for b in members)))
    return sorted(groups, key=lambda g: int(g[1]['itemId']))


def rating_profiles(raw, groups, db):
    db.execute('CREATE TEMP TABLE selected(book_id BIGINT, col INTEGER)')
    db.executemany('INSERT INTO selected VALUES (?,?)',
                   [(int(b), i) for i, (books, _, _) in enumerate(groups) for b in books])
    db.execute("""CREATE TEMP TABLE compact AS SELECT m.book_id_csv, s.col FROM read_csv(?, header=true,
               columns={'book_id_csv':'INTEGER','book_id':'BIGINT'}) m JOIN selected s USING (book_id)""",
               [str(raw / 'book_id_map.csv')])
    db.execute("""CREATE TEMP TABLE matched AS SELECT r.user_id,s.col,r.rating FROM read_csv(?,header=true,
               columns={'user_id':'INTEGER','book_id':'INTEGER','is_read':'UTINYINT','rating':'UTINYINT',
               'is_reviewed':'UTINYINT'}) r JOIN compact s ON r.book_id=s.book_id_csv
               WHERE r.rating BETWEEN 1 AND 5""", [str(raw / 'goodreads_interactions.csv')])
    obs = db.execute("""SELECT user_id,col,min(rating) stars FROM matched GROUP BY user_id,col
                      HAVING min(rating)=max(rating) ORDER BY user_id,col""").fetchnumpy()
    keys, people = np.unique(obs['user_id'], return_inverse=True)
    matrix = csr_matrix((obs['stars'].astype(np.int16), (people, obs['col'])), shape=(len(keys), len(groups)))
    counts = np.bincount(matrix.indices, minlength=len(groups))
    support = np.flatnonzero(counts >= 3)
    strict = np.array([direct for _, _, direct in groups])
    strict_sizes = matrix[:, strict].getnnz(axis=1)
    matrix = matrix[:, support].tocsr()
    matrix = matrix[matrix.getnnz(axis=1) > 0]
    matrix.sort_indices()
    sizes = matrix.getnnz(axis=1)
    items = [groups[i][1] for i in support]
    for item, i in zip(items, support):
        item['annotations']['ratingCount'] = int(counts[i])
    audit = dict(matchedWorks=len(groups), matchedEditions=sum(len(g[0]) for g in groups),
                 worksWithRatings=int(sum(counts > 0)), minimumRatings=3, retainedWorks=len(items),
                 matchedRatingRows=db.execute('SELECT count(*) FROM matched').fetchone()[0],
                 conflictPairs=db.execute("""SELECT count(*) FROM (SELECT user_id,col FROM matched GROUP BY 1,2
                                        HAVING min(rating)<>max(rating))""").fetchone()[0],
                 directLinkWorks=int(strict.sum()), directLinkRatings=int(strict_sizes.sum()),
                 directLinkReaders=int(sum(strict_sizes > 0)), directLinkReadersWithFive=int(sum(strict_sizes >= 5)),
                 retainedDirectLinkWorks=int(strict[support].sum()), readersWithTwoWorks=int(sum(sizes >= 2)),
                 readersWithFiveWorks=int(sum(sizes >= 5)), ratings=matrix.nnz, readers=len(sizes),
                 ratingHistogram=np.bincount(matrix.data, minlength=6)[1:].tolist())
    return matrix, items, audit


def nested_validation(profiles, seed=65329):
    """Each eligible reader is held out once. Pick K anew inside each training partition."""
    n = profiles.shape[0]
    outer_rng = np.random.default_rng(seed)
    grid = (1, 2, 4, 8)
    scale = np.arange(1, 6)
    folds = np.array_split(outer_rng.permutation(n), 5)
    references, forecasts, selected = [], [], []
    targets = 0
    for i, test in enumerate(folds):
        development = np.concatenate([part for j, part in enumerate(folds) if j != i])
        parts = np.array_split(development, 3)
        loss = collections.defaultdict(list)
        for j, validation in enumerate(parts):
            train = profiles[np.concatenate([part for k, part in enumerate(parts) if k != j])]
            cases = scoring_cases(profiles, validation, np.random.default_rng(seed + 10 * i + j))
            for k in grid:
                model = fit_mixture(train, len(scale), k, seed + j)
                loss[k].extend(score_model(model, cases, scale, 4)[:, 0])
        best = min(grid, key=lambda k: np.mean(loss[k]))
        selected.append(best)
        test_cases = scoring_cases(profiles, test, np.random.default_rng(seed + 100 + i))
        targets += sum(len(c[3]) for c in test_cases)
        train = profiles[development]
        baseline = fit_mixture(train, len(scale), 1, seed)
        model = fit_mixture(train, len(scale), best, seed)
        references.extend(score_model(baseline, test_cases, scale, 4))
        forecasts.extend(score_model(model, test_cases, scale, 4))
    reference, forecast = np.asarray(references), np.asarray(forecasts)
    differences = forecast[:, 0] - reference[:, 0]
    bootstrap = np.random.default_rng(seed).choice(differences, size=(4000, len(differences)), replace=True)
    stats = summary(1, reference)
    stats['label'] = 'Per-work baseline'
    cv = summary(0, forecast)
    cv['label'] = 'Nested-CV mixture'
    return dict(seed=seed, folds=5, innerFolds=3, selectedClasses=selected, testUsers=len(differences),
                testRatings=targets, models=[stats, cv], pairedMeanLogLossChange=float(differences.mean()),
                bootstrap95=np.quantile(bootstrap.mean(axis=1), [.025, .975]).tolist())


def build(raw, ao3, ffn, out):
    db = duckdb.connect(config={'threads': 1, 'memory_limit': '750MB'})
    editions, index = candidate_editions(raw)
    print(f'Verifying {len(editions)} candidate editions', flush=True)
    groups = crosswalk(editions, itertools.chain(ao3_works(ao3, index), ffn_works(ffn, index, db)))
    print(f'Matching scores on {len(groups)} corroborated works', flush=True)
    profile, items, audit = rating_profiles(raw, groups, db)
    print(json.dumps(audit), flush=True)
    catalog, report = fit_catalog('Fanfiction · Goodreads stars', items, [1, 2, 3, 4, 5], profile, validation_limit=None)
    report = dict(**report, sourceCounts=audit, nestedValidation=nested_validation(profile))
    catalog.update(CATALOG_METADATA)
    (out / 'validation').mkdir(parents=True, exist_ok=True)
    for file, obj in [('goodreads-fanfiction.json', catalog), ('validation/goodreads-fanfiction.json', report)]:
        (out / file).write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--goodreads', type=Path, required=True)
    parser.add_argument('--ao3', type=Path, required=True)
    parser.add_argument('--ffn', nargs='+', required=True, help='All five FanFiction.net metadata Parquet files')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    build(args.goodreads, args.ao3, args.ffn, args.out)
