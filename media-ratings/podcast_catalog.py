"""Build the Apple Podcasts catalog from the BIRD music_platform_2 review archive."""
import argparse
from collections import Counter
import json
from pathlib import Path

import duckdb
import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import fit_catalog, write_evidence


SNAPSHOT = 'https://huggingface.co/datasets/stanford-star/the-join/tree/03bb55dd34a96f227586bc3c3b02fab962843719/join-bird-music-platform-2'
TOPICS = {'arts': 'Arts', 'business': 'Business', 'comedy': 'Comedy', 'education': 'Education', 'fiction': 'Fiction',
          'government': 'Government', 'health-fitness': 'Health & Fitness', 'history': 'History',
          'kids-family': 'Kids & Family', 'leisure': 'Leisure', 'music': 'Music', 'news': 'News',
          'religion-spirituality': 'Religion & Spirituality', 'science': 'Science', 'society-culture': 'Society & Culture',
          'sports': 'Sports', 'technology': 'Technology', 'true-crime': 'True Crime', 'tv-film': 'TV & Film'}


def build_profiles(podcasts, categories, reviews):
    db = duckdb.connect(config={'threads': 1, 'memory_limit': '1800MB'})
    # DuckDB reads only identifiers, category labels, timestamps and scores.
    # Publish the latest observed rating from each person for each Apple ID.
    db.execute("""
        CREATE TEMP TABLE shows AS
        SELECT podcast_id, itunes_id, title FROM read_parquet(?)
        WHERE itunes_id > 0 AND length(trim(title)) > 0
    """, [str(podcasts)])
    db.execute("""
        CREATE TEMP TABLE recorded AS
        SELECT r.author_id, s.itunes_id, first(r.rating ORDER BY r.created_at DESC, r.rating DESC)::TINYINT AS score
        FROM read_parquet(?) r JOIN shows s USING (podcast_id)
        WHERE r.rating BETWEEN 1 AND 5 AND r.author_id IS NOT NULL AND length(trim(r.author_id)) > 0
        GROUP BY r.author_id, s.itunes_id
    """, [str(reviews)])
    db.execute("""
        CREATE TEMP TABLE topics AS
        SELECT DISTINCT s.itunes_id, c.category
        FROM read_parquet(?) c JOIN shows s USING (podcast_id)
    """, [str(categories)])
    db.execute("""
        CREATE TEMP TABLE selected AS
        WITH review_counts AS (
            SELECT itunes_id, count(*) AS n FROM recorded GROUP BY 1 HAVING count(*) >= 20
        ), names AS (
            SELECT itunes_id, min(title) AS title FROM shows GROUP BY 1
        ), distinct_titles AS (
            SELECT itunes_id, title, n FROM names JOIN review_counts USING (itunes_id)
            QUALIFY row_number() OVER (PARTITION BY lower(trim(title)) ORDER BY n DESC, itunes_id) = 1
        ), ranks AS (
            SELECT itunes_id, category,
                   row_number() OVER (PARTITION BY category ORDER BY n DESC, itunes_id) AS category_rank
            FROM distinct_titles JOIN topics USING (itunes_id) WHERE category IN (SELECT unnest(?))
        ), eligible AS (
            SELECT DISTINCT itunes_id FROM ranks WHERE category_rank <= 250
        )
        SELECT itunes_id, title, n, (row_number() OVER (ORDER BY n DESC, itunes_id) - 1)::INTEGER AS col
        FROM eligible JOIN distinct_titles USING (itunes_id)
    """, [list(TOPICS)])
    rows = db.execute("""
        SELECT itunes_id, title, list(category ORDER BY category) AS labels
        FROM selected JOIN topics USING (itunes_id) GROUP BY col, itunes_id, title ORDER BY col
    """).fetchall()
    if not rows:
        raise ValueError('No shows meet the requirements for topic and reviewer count')
    items = []
    for itunes_id, title, labels in rows:
        topics = [TOPICS[x] for x in labels if x in TOPICS]
        tags = set()
        for label in labels:
            if label not in TOPICS:
                sub = next((label[len(t) + 1:] for t in TOPICS if label.startswith(t + '-')), label)
                tags.add(sub.replace('-', ' ').title())
        a = dict(genres=topics, tags=sorted(tags), sourceUrl=f'https://podcasts.apple.com/us/podcast/id{itunes_id}')
        items.append(dict(itemId=str(itunes_id), title=' '.join(title.split()), annotations=a))
    columns = db.execute("""
        SELECT (dense_rank() OVER (ORDER BY author_id) - 1)::INTEGER AS respondent, col, score
        FROM recorded JOIN selected USING (itunes_id)
    """).fetchnumpy()
    db.close()
    profiles = csr_matrix((columns['score'], (columns['respondent'], columns['col'])),
                          shape=(int(columns['respondent'].max()) + 1, len(items)))
    counts = np.bincount(profiles.indices, minlength=len(items))
    if profiles.nnz != len(columns['score']) or min(counts) == 0:
        raise ValueError('Invalid or empty podcast profiles')
    for item, count in zip(items, counts):
        item['annotations']['ratingCount'] = int(count)
    return items, profiles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ['podcasts', 'categories', 'reviews', 'output']:
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    items, profiles = build_profiles(args.podcasts, args.categories, args.reviews)
    print(f'{len(items)} shows, {len(profiles.indptr)-1} reviewers, {profiles.nnz} ratings', flush=True)
    scale = [1, 2, 3, 4, 5]
    catalog, selection = fit_catalog('Apple Podcasts · listener reviews', items, scale, profiles, validation_limit=None)
    catalog.update(domain='podcasts', sourceLabel='Apple Podcasts', linkLabel='Apple Podcasts',
                   source=dict(title='Apple Podcasts reviews · BIRD music_platform_2', url=SNAPSHOT,
                               author='Apple Podcasts listeners, Stuart Axelbrooke, BIRD and Stanford STAR.',
                               license='BIRD archive · CC BY-SA 4.0', licenseUrl='https://creativecommons.org/licenses/by-sa/4.0/',
                               notes='Written-review star scores from 2005–2022. All reviewers with a score for a selected show contribute to the fit.'))
    report: dict[str, object] = dict(selection)
    report.update(respondentsWithFiveRatings=int(np.sum(np.diff(profiles.indptr) >= 5)),
                  topicCoverage=dict(Counter(g for it in items for g in it['annotations']['genres']).most_common()))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'validation').mkdir(exist_ok=True)
    (args.output / 'podcasts.json').write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
    (args.output / 'validation' / 'podcasts.json').write_text(json.dumps(report, indent=2) + '\n')
    write_evidence(args.output / 'podcasts-evidence.json', profiles, items, scale)


if __name__ == '__main__':
    main()
