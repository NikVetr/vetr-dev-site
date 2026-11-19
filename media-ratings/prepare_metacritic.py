"""Build the Metacritic 0–10 video game catalog from Wada1's Parquet release."""
import argparse
import hashlib
import json
from pathlib import Path

import duckdb
import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import fit_catalog, write_evidence

SOURCE = 'https://huggingface.co/datasets/Wada1/Metacritic_Games_Reviews_Dataset'
SCALE = list(range(11))


def game_profiles(path):
    with duckdb.connect(config={'threads': 2}) as db:
        db.read_parquet(str(path)).create_view('reviews')
        invalid = db.sql("""
            SELECT count(*) FROM reviews WHERE score IS NULL OR score NOT BETWEEN 0 AND 10
            OR game IS NULL OR trim(game) = '' OR author IS NULL OR trim(author) = ''
        """).fetchall()[0][0]
        if invalid:
            raise ValueError('Missing reviewer, game or valid 0–10 score')
        db.execute("""
            CREATE TEMP TABLE votes AS SELECT trim(author) AS reviewer, trim(game) AS title,
                min(score) AS score FROM reviews GROUP BY 1, 2 HAVING min(score) = max(score)
        """)
        games = db.sql("""
            SELECT title, count(*) AS n FROM votes GROUP BY title HAVING n >= 20
            ORDER BY n DESC, title
        """).fetchall()
        platforms = dict(db.sql("""
            SELECT trim(game), list(DISTINCT platform ORDER BY platform) FROM reviews
            WHERE platform IS NOT NULL GROUP BY 1
        """).fetchall())
        db.execute('CREATE TEMP TABLE included(title VARCHAR, col INTEGER)')
        db.executemany('INSERT INTO included VALUES (?, ?)', [(g[0], i) for i, g in enumerate(games)])
        entries = db.sql("""
            SELECT dense_rank() OVER (ORDER BY reviewer) - 1 AS respondent, col, score + 1 AS category
            FROM votes JOIN included USING (title) ORDER BY respondent, col
        """).fetchnumpy()
    profiles = csr_matrix((entries['category'].astype(np.int32), (entries['respondent'], entries['col'])))
    items = [dict(itemId='mc-' + hashlib.sha256(title.encode()).hexdigest()[:16], title=title,
                  annotations=dict(platforms=platforms.get(title, []), ratingCount=n)) for title, n in games]
    return items, profiles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('parquet', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    items, profiles = game_profiles(args.parquet)
    catalog, report = fit_catalog('Metacritic · player scores', items, SCALE, profiles, validation_limit=None)
    catalog.update(domain='games', sourceLabel='Metacritic', source=dict(
        title='Metacritic Games Reviews Dataset', url=SOURCE, author='Wada1',
        license='CC BY 4.0', licenseUrl='https://creativecommons.org/licenses/by/4.0/',
        notes='Player scores from 0 to 10, combined across platforms by source title.'))
    args.output.mkdir(exist_ok=True, parents=True)
    (args.output / 'validation').mkdir(exist_ok=True)
    (args.output / 'metacritic.json').write_text(json.dumps(catalog, separators=(',', ':'), ensure_ascii=False) + '\n')
    (args.output / 'validation/metacritic.json').write_text(json.dumps(report, indent=2) + '\n')
    write_evidence(args.output / 'metacritic-evidence.json', profiles, items, SCALE)


if __name__ == '__main__':
    main()
