"""Fit the UCI top-100 recipe catalog from individual star ratings on posted reviews."""
import argparse
import csv
import io
import json
import re
import zipfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import fit_catalog, write_evidence


SCALE = [1, 2, 3, 4, 5]
SITE = 'https://www.tasteofhome.com/recipes/'
DATASET = 'https://doi.org/10.24432/C5FG95'
# The publisher's recipe titles and URL slugs can change independently.
PUBLISHER_SLUGS = {
    '7178': 'zucchini-cupcakes',
    '32264': 'simple-chicken-enchiladas',
    '4444': 'strawberry-pretzel-dessert',
    '141947': 'caramelized-ham-swiss-buns',
}


def load_reviews(archive):
    """Collapse repeated rated reviews to the latest explicit score per person and recipe."""
    names, latest = {}, {}
    with zipfile.ZipFile(archive) as z, z.open('Recipe Reviews and User Feedback Dataset.csv') as raw:
        for r in csv.DictReader(io.TextIOWrapper(raw, encoding='utf-8-sig')):
            key = r['recipe_code']
            identity = (int(r['recipe_number']), r['recipe_name'])
            if names.setdefault(key, identity) != identity:
                raise ValueError(f'Conflicting recipe name or rank for {key}')
            stars = int(r['stars'])
            if stars == 0:
                continue
            if stars not in SCALE or not r['user_id']:
                raise ValueError(f'Invalid user or rating for recipe {key}')
            pair = (r['user_id'], key)
            time = int(r['created_at'])
            previous = latest.get(pair)
            if previous and previous[0] == time and previous[1] != stars:
                raise ValueError(f'Conflicting simultaneous ratings for recipe {key}')
            if not previous or time > previous[0]:
                latest[pair] = (time, stars)
    keys = sorted(names, key=lambda key: names[key][0])
    users = {user: i for i, user in enumerate(sorted({user for user, _ in latest}))}
    index = {key: j for j, key in enumerate(keys)}
    counts = Counter(key for _, key in latest)
    rows, cols, values = [], [], []
    for (user, key), (_, stars) in latest.items():
        rows.append(users[user])
        cols.append(index[key])
        values.append(stars)
    profiles = csr_matrix((np.asarray(values, dtype=np.int32), (rows, cols)), shape=(len(users), len(keys)))
    items = [dict(itemId=k, title=names[k][1], annotations=dict(sourceRank=names[k][0], ratingCount=counts[k]))
             for k in keys]
    return items, profiles


def publisher_metadata(item, slug):
    url = SITE + slug + '/'
    try:
        with urlopen(Request(url, headers={'User-Agent': 'vetr.dev recipe catalog (source links)'}), timeout=20) as response:
            final_url = response.geturl()
            html = response.read().decode('utf-8')
    except HTTPError as err:
        if err.code in (404, 410):
            return None
        raise
    # Different recipes can have very similar names. The publisher's original ID survives page renames.
    if not re.search(r'"(?:contentId|rmsID)"\s*:\s*"' + re.escape(item['itemId']) + r'"', html):
        return None
    match = re.search(r'<link rel="canonical" href="(https://www\.tasteofhome\.com/recipes/[\w-]+/)"', html)
    verified_url = match[1] if match else final_url
    if not re.fullmatch(r'https://www\.tasteofhome\.com/recipes/[\w-]+/', verified_url):
        return None
    annotation = {'sourceUrl': verified_url}
    for data in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.DOTALL):
        graph = json.loads(data)
        nodes = graph.get('@graph', [graph]) if isinstance(graph, dict) else graph
        for node in nodes:
            if isinstance(node, dict) and node.get('@type') == 'Recipe':
                categories = node.get('recipeCategory')
                if isinstance(categories, list) and all(isinstance(v, str) for v in categories):
                    annotation['genres'] = categories
    return annotation


def annotate(items, cache_dir):
    cache_dir.mkdir(parents=True, exist_ok=True)

    def resolve(item):
        cache = cache_dir / (item['itemId'] + '.json')
        if cache.exists():
            return json.loads(cache.read_text())
        slug = re.sub(r'[^a-z0-9]+', '-', item['title'].lower()).strip('-')
        result = publisher_metadata(item, PUBLISHER_SLUGS.get(item['itemId'], slug))
        cache.write_text(json.dumps(result))
        return result

    with ThreadPoolExecutor(max_workers=4) as pool:
        for item, meta in zip(items, pool.map(resolve, items)):
            if meta:
                item['annotations'].update(meta)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--page-cache', type=Path, help='Verify direct publisher links and retrieve course metadata')
    args = parser.parse_args()
    items, profiles = load_reviews(args.archive)
    if args.page_cache:
        annotate(items, args.page_cache)
    catalog, report = fit_catalog('Taste of Home · 100 popular recipes', items, SCALE, profiles)
    catalog.update(domain='recipes', sourceLabel='Taste of Home', source=dict(
        title='Recipe Reviews and User Feedback', url=DATASET,
        author='Amir Ali, Stanislaw Matuszewski & Jacek Czupyt (2023), UCI Machine Learning Repository',
        license='CC BY 4.0', licenseUrl='https://creativecommons.org/licenses/by/4.0/',
        notes='Aggregate fit from individual ratings of the original 100 Taste of Home recipes.'))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'validation').mkdir(exist_ok=True)
    (args.output / 'recipes.json').write_text(json.dumps(catalog, separators=(',', ':'), ensure_ascii=False) + '\n')
    (args.output / 'validation/recipes.json').write_text(json.dumps(report, indent=2) + '\n')
    write_evidence(args.output / 'recipes-evidence.json', profiles, items, SCALE)


if __name__ == '__main__':
    main()
