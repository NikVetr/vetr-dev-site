"""Build a game recommendation catalog from individual Steam thumbs-up/down reviews."""
import argparse
from array import array
from collections import Counter
import re
import json
from pathlib import Path
from typing import Any

import duckdb
import ijson
import numpy as np
from scipy import sparse

from fit_catalog import write_evidence

# Preserve the most-reviewed games, then deepen each source genre in popularity order.
GENRES = ('Action', 'Adventure', 'Casual', 'Indie', 'RPG', 'Simulation', 'Strategy',
          'Racing', 'Sports', 'Massively Multiplayer')
GRAPH = 'https://huggingface.co/datasets/diegodvv/steam-games-reviews-and-users-graph'


def collect(raw):
    """Read both source JSON dictionaries incrementally. Persist no player IDs."""
    votes = bytearray()
    num_reviews = 0
    with (raw / 'votes').open('rb') as file:
        for review, detail in ijson.kvitems(file, ''):
            i = int(review)
            vote = detail['voted_up']
            if i <= 0 or type(vote) is not bool:
                raise ValueError('Invalid Steam review')
            if i >= len(votes):
                votes.extend(bytes(i + 1 - len(votes)))
            if votes[i]:
                raise ValueError('Duplicate review ID in sentiment table')
            votes[i] = 1 + int(vote)
            num_reviews += 1
    # Some review IDs occur on multiple graph edges. Discard *every* such occurrence
    # so the same labeled review cannot be assigned to different players or games.
    edges = unique_reviews = repeated_ids = 0
    with (raw / 'edges').open('rb') as file:
        for _, records in ijson.kvitems(file, ''):
            edges += len(records)
            for review, _ in records:
                record = votes[review]
                if not record:
                    raise ValueError('Review graph edge has no linked vote')
                if record < 4:
                    unique_reviews += 1
                    votes[review] |= 4
                elif record < 8:
                    repeated_ids += 1
                    votes[review] |= 8
    if unique_reviews != num_reviews:
        raise ValueError('Graph and vote table cover different review IDs')
    counts = Counter()
    game_ids, values, indptr = array('I'), array('B'), array('I', [0])
    conflicts = duplicate_rows = users = 0
    with (raw / 'edges').open('rb') as file:
        for _, records in ijson.kvitems(file, ''):
            users += 1
            by_game = {}
            for review, game in records:
                record = votes[review]
                if record >= 8:
                    continue
                value = record & 3
                old = by_game.get(game)
                if old is None:
                    by_game[game] = value
                elif old == value:
                    duplicate_rows += 1
                elif old != 0:
                    conflicts += 1
                    by_game[game] = 0
            for game, vote in by_game.items():
                if vote:
                    counts[game] += 1
                    game_ids.append(game)
                    values.append(vote)
            if len(values) > indptr[-1]:
                indptr.append(len(values))
    unique, columns = np.unique(np.asarray(game_ids), return_inverse=True)
    profiles = sparse.csr_matrix((np.asarray(values), columns, np.asarray(indptr)),
                                 shape=(len(indptr)-1, len(unique)))
    profiles.sort_indices()
    audit: dict[str, Any] = dict(
        graphVotes=num_reviews, graphPlayers=users, graphGames=len(counts), graphEdges=edges,
        excludedRepeatedReviewIds=repeated_ids, repeatedReviewEdges=edges-unique_reviews,
        conflictingPlayerGames=conflicts, duplicateVotes=duplicate_rows, cleanPlayers=len(indptr)-1,
        cleanVotes=profiles.nnz,
    )
    return counts, unique, profiles, audit


def game_details(raw):
    with duckdb.connect(config={'threads': 1, 'memory_limit': '600MB'}) as conn:
        cursor = conn.execute('''SELECT appID,name,release_date,header_image,windows,mac,linux,
                           developers,publishers,genres,categories,tags
                           FROM read_parquet(?) WHERE name IS NOT NULL''', [str(raw / 'games.parquet')])
        if cursor is None:
            raise RuntimeError('Failed to read Steam metadata')
        rows = cursor.fetchall()
        tag_cursor = conn.execute('SELECT appID,tags FROM read_parquet(?) WHERE length(tags)>0',
                                  [str(raw / 'metadata-old.parquet')])
        if tag_cursor is None:
            raise RuntimeError('Failed to read Steam community tags')
        archived_tags = {int(app): tags.split(',') for app, tags in tag_cursor.fetchall()}
    result = {}
    for app, name, date, art, win, mac, linux, dev, pub, genres, categories, tags in rows:
        genres = genres or []
        if not name.strip() or not set(genres).intersection(GENRES):
            continue
        info = dict(genres=genres, platforms=[p for p, yes in [('Windows', win), ('macOS', mac), ('Linux', linux)] if yes],
                    developers=dev or [], publishers=pub or [], sourceUrl=f'https://store.steampowered.com/app/{app}/')
        if art and art.startswith('https://'):
            info['imageUrl'] = art
        year = re.search(r'\b(?:19|20)\d{2}\b', date or '')
        if year:
            info['year'] = int(year.group())
        modes = {'Single-player', 'Multi-player', 'Co-op', 'Online Co-op', 'Shared/Split Screen Co-op',
                 'PvP', 'Online PvP', 'Cross-Platform Multiplayer', 'VR Supported', 'VR Only'}
        info['modes'] = [c for c in (categories or []) if c in modes]
        info['tags'] = [t for t in (tags or archived_tags.get(int(app), [])) if isinstance(t, str) and t not in genres][:8]
        result[int(app)] = dict(itemId=str(app), title=name, annotations=info)
    return result


def prepare(raw):
    counts, columns, profiles, audit = collect(raw)
    details = game_details(raw)
    positions = {int(app): i for i, app in enumerate(columns)}
    eligible = [app for app in details if app in positions and counts[app] >= 20]
    eligible.sort(key=lambda app: (-counts[app], app))
    totals = {g: sum(g in details[app]['annotations']['genres'] for app in eligible) for g in GENRES}
    print('Eligible by genre before selection', totals, flush=True)
    audit['eligibleGamesByGenre'] = totals
    coverage = Counter({g: 0 for g in GENRES})
    selected, items = [], []
    for rank, app in enumerate(eligible):
        item = details[app]
        genres = [g for g in item['annotations']['genres'] if g in GENRES]
        if rank < 500 or any(coverage[g] < 200 for g in genres):
            item['annotations']['ratingCount'] = counts[app]
            selected.append(positions[app])
            items.append(item)
            coverage.update(genres)
    if len(items) < 500:
        raise ValueError('Too few supported games')
    x = profiles[:, selected].tocsr()
    x = x[np.diff(x.indptr) > 0]
    x.sort_indices()
    audit.update(eligibleGames=len(eligible), catalogGames=len(items), genreCoverage=dict(coverage),
                 allCatalogVotes=sum(counts[int(it['itemId'])] for it in items),
                 finalPlayers=x.shape[0], finalVotes=x.nnz,
                 eligibleForEvaluation=int(np.sum(np.diff(x.indptr) >= 5)))
    sparse.save_npz(raw / 'profiles.npz', x)
    (raw / 'inventory.json').write_text(json.dumps(dict(items=items, audit=audit)))
    print(json.dumps(audit), flush=True)


def fit(raw, output):
    from fit_games import fit_games
    data = json.loads((raw / 'inventory.json').read_text())
    profiles = sparse.load_npz(raw / 'profiles.npz').tocsr()
    catalog, report = fit_games(data['items'], profiles)
    catalog.update(name='Steam · player recommendations', domain='games', scaleLabels=['Thumbs down', 'Thumbs up'],
                   sourceLabel='Steam reviews', linkLabel='Steam',
                   responsePrompt='Would you recommend this game?',
                   source=dict(title='Steam review graph', url=GRAPH, author='diegodvv and FronkonGames',
                               license='Review graph · MIT', licenseUrl='https://opensource.org/license/mit',
                               notes='The score predicts a thumbs up among submitted reviews. Games without a response supply no evidence. The graph sampled released, paid Steam games. FronkonGames supplied the store metadata (MIT) and archived community tags (CC BY 4.0).'))
    report['sourceCounts'] = data['audit']
    output.mkdir(parents=True, exist_ok=True)
    (output / 'validation').mkdir(exist_ok=True)
    for path, obj in [(output / 'games.json', catalog), (output / 'validation' / 'games.json', report)]:
        path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n')
    write_evidence(output / 'games-evidence.json', profiles, data['items'], [0, 1])
    print(report['holdout'], flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=['prepare', 'fit'])
    parser.add_argument('raw', type=Path)
    parser.add_argument('--out', type=Path, default=Path(__file__).parent)
    args = parser.parse_args()
    if args.stage == 'prepare':
        prepare(args.raw)
    else:
        fit(args.raw, args.out)
