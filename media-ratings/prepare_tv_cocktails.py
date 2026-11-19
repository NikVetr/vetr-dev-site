"""Fit TV-show and cocktail recipe catalogs from individual explicit star ratings."""
import argparse
import gzip
import html
import json
from pathlib import Path
import re
import unicodedata

import duckdb
import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import fit_catalog, write_evidence


TV_SOURCE = dict(
    title='MovieLens 32M', url='https://grouplens.org/datasets/movielens/32m/',
    author='GroupLens, University of Minnesota. F. Maxwell Harper & Joseph A. Konstan (2015).',
    license='MovieLens research use', licenseUrl='https://files.grouplens.org/datasets/movielens/ml-32m-README.html',
    notes='Series-level MovieLens ratings. Show metadata adapted from TVmaze under CC BY-SA 4.0.')
DRINK_SOURCE = dict(
    title='Food.com Recipes and Reviews', url='https://huggingface.co/datasets/jiava/foodrs-data',
    author='Food.com reviewers; archive by irkaal, packaged by FoodRS.',
    license='CC0 1.0', licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/',
    notes='Individual reviews of the linked drink recipes. Personalization gains were small and varied across held-out reviewer splits.')

# Match individual ingredient names. "Ginger", "rum extract" and "wine vinegar" are not spirits.
SPIRITS = {
    'Vodka': r'vodka|absolut',
    'Rum': r'rum|bacardi|malibu|cachaça|cachaca',
    'Gin': r'gin',
    'Tequila / mezcal': r'tequila|mezcal',
    'Whisky / bourbon': r'whiske?y|bourbon|scotch|jack daniel.s',
    'Brandy / cognac': r'brandy|cognac|calvados|pisco',
    'Wine / fortified wine': r'wine|champagne|prosecco|cava|riesling|chardonnay|merlot|cabernet|zinfandel|pinot|sherry|madeira|vermouth|sauvignon|sake',
    'Liqueur / aperitif': r'liqueur|schnapps|schnaps|amaretto|kahl[uú]a|baileys?|bailey.s|triple sec|cointreau|cura[cç]ao|southern comfort|campari|aperol|midori|chambord|grand marnier|frangelico|limoncello|cr[eè]me de \w+',
    'Beer / cider': r'beer|lager|stout|hard cider',
}
SPIRIT_PATTERNS = {kind: re.compile(r'\b(?:' + words + r')\b', re.I) for kind, words in SPIRITS.items()}
NON_ALCOHOL = re.compile(r'extract|flavou?ring|syrup|vinegar|glass|non.?alcohol|alcohol.free|root beer|ginger beer|ginger ale|cooking wine|cream of tartar', re.I)
PREPARATIONS = re.compile(r'\b(?:mocktails?|virgin|non.?alcoholic|alcohol.free|mix only|dry mix|batter|infused|infusion|homemade liqueur)\b', re.I)
LIQUEUR_PREP = re.compile(r"\b(?:liqueur|liqueurs|kahlua|irish cream|limoncello|amaretto)\s*(?:recipe|ii|#\d|\([^)]*\))?$", re.I)


# Inspected source recipes: home-steeped spirits, soaked fruit, chocolate-coated
# strawberries, dyed beer, syrup-based/cocoa drinks, and a submitter-marked duplicate.
NON_COCKTAIL_RECIPES = {13264, 13315, 29781, 30317, 50395, 54085, 115415, 140344, 163827, 191999, 202183, 397671}


def clean_name(value):
    return ' '.join(html.unescape(value).split())


def cocktail_candidates(connection):
    rows = connection.execute("""
        SELECT RecipeId::INTEGER, Name, RecipeIngredientParts, RecipeCategory, Images[1], year(DatePublished)
        FROM recipes_raw WHERE RecipeCategory IN ('Beverages', 'Punch Beverage')
    """).fetchall()
    candidates = {}
    for recipe_id, name, ingredients, category, image, year in rows:
        title = clean_name(name)
        if recipe_id in NON_COCKTAIL_RECIPES or PREPARATIONS.search(title) or LIQUEUR_PREP.search(title):
            continue
        ingredients = [i for i in (ingredients or []) if not NON_ALCOHOL.search(i)]
        bases = [key for key, pattern in SPIRIT_PATTERNS.items() if any(pattern.search(i) for i in ingredients)]
        if not bases:
            continue
        slug = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode().lower()
        slug = re.sub(r'[^a-z0-9]+', '-', slug).strip('-')
        annotation = dict(genres=bases, sourceUrl=f'https://www.food.com/recipe/{slug}-{recipe_id}',
                          format='Punch' if category == 'Punch Beverage' else 'Mixed drink')
        if year:
            annotation['year'] = year
        if image and image.startswith('https://img.sndimg.com/'):
            annotation['imageUrl'] = image
        candidates[recipe_id] = dict(itemId=str(recipe_id), title=title, annotations=annotation)
    return candidates


def tv_candidates(connection, movielens, metadata, imdb: Path):
    rows = connection.execute("""
        SELECT m.movieId, ml.title, t.imdb_id, t.tvmaze_id, t.name, t.type, t.genres, t.premiered,
               t.network_country, t.image_medium
        FROM read_parquet(?) t JOIN read_csv(?, all_varchar=true) m
          ON try_cast(substr(t.imdb_id, 3) AS BIGINT) = try_cast(m.imdbId AS BIGINT)
        JOIN read_csv(?, all_varchar=true) ml ON ml.movieId = m.movieId
    """, [str(metadata), str(movielens / 'links.csv'), str(movielens / 'movies.csv')]).fetchall()
    # TVmaze can also list streaming films. Check title type independently using
    # the exact IMDb ID and require both sources to describe a series.
    wanted = {row[2].encode() for row in rows}
    series = {}
    with gzip.open(imdb, 'rb') as source:
        header = source.readline().split(b'\t')
        if header[:2] != [b'tconst', b'titleType']:
            raise ValueError('Expected IMDb title.basics TSV')
        for line in source:
            key, kind, rest = line.split(b'\t', 2)
            if key in wanted and kind in (b'tvSeries', b'tvMiniSeries'):
                year = rest.split(b'\t', 4)[3]
                series[key.decode()] = int(year) if year.isdigit() else None
    candidates = {}
    for movie_id, ml_title, imdb_id, tv_id, name, kind, genres, premiered, country, image in rows:
        if imdb_id not in series or not premiered or not series[imdb_id]:
            continue
        # Reused movie names and remakes can have a misassigned upstream ID.
        ml_year = re.search(r'\(((?:19|20)\d{2})(?:[–-]\d{0,4})?\)\s*$', ml_title)
        years = [int(premiered[:4]), series[imdb_id]]
        if ml_year:
            years.append(int(ml_year[1]))
        if max(years) - min(years) > 1:
            continue
        annotation = dict(sourceUrl=f'https://www.tvmaze.com/shows/{int(tv_id)}', genres=genres or [])
        if kind:
            annotation['format'] = kind
        if country:
            annotation['country'] = country
        annotation['year'] = int(premiered[:4])
        title = f"{name} ({annotation['year']})"
        if image and image.startswith('https://static.tvmaze.com/'):
            annotation['imageUrl'] = image
        if int(movie_id) in candidates:
            raise ValueError(f'Multiple show records match MovieLens {movie_id}')
        candidates[int(movie_id)] = dict(itemId=str(movie_id), title=title, annotations=annotation)
    return candidates


def make_profiles(candidates, observations, min_reviews, limit=None):
    users, item_ids, codes = observations.T
    ids, counts = np.unique(item_ids, return_counts=True)
    ranked = sorted(zip(ids, counts), key=lambda pair: (-pair[1], pair[0]))
    items, index, titles = [], {}, set()
    for key, count in ranked:
        if count < min_reviews or (limit and len(items) >= limit):
            break
        item = candidates[key]
        label = item['title'].casefold()
        if label in titles:
            continue
        titles.add(label)
        index[key] = len(items)
        item['annotations']['ratingCount'] = int(count)
        items.append(item)
    mask = np.isin(item_ids, list(index))
    _, rows = np.unique(users[mask], return_inverse=True)
    cols = [index[key] for key in item_ids[mask]]
    profiles = csr_matrix((codes[mask], (rows, cols)), shape=(int(rows.max()) + 1, len(items)))
    if profiles.nnz != len(rows):
        raise ValueError('Input contains repeated respondent/item pairs')
    return items, profiles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='domain', required=True)
    shows = subs.add_parser('tv')
    shows.add_argument('movielens', type=Path, help='Extracted ml-32m directory')
    shows.add_argument('tvmaze', type=Path, help='TVmaze catalog parquet')
    shows.add_argument('imdb', type=Path, help='IMDb title.basics.tsv.gz')
    drinks = subs.add_parser('cocktails')
    drinks.add_argument('foodrs', type=Path, help='FoodRS DuckDB file with raw review and recipe tables')
    for sub in (shows, drinks):
        sub.add_argument('output', type=Path)
    args = parser.parse_args()
    options = {'threads': 2, 'memory_limit': '1GB'}
    if args.domain == 'tv':
        db = duckdb.connect(config=options)
        candidates = tv_candidates(db, args.movielens, args.tvmaze, args.imdb)
        rows = db.execute("""
            SELECT userId, movieId, CAST(rating * 2 AS INTEGER)
            FROM read_csv(?) WHERE movieId IN (SELECT unnest(?))
        """, [str(args.movielens / 'ratings.csv'), list(candidates)]).fetchall()
        items, profiles = make_profiles(candidates, np.array(rows, dtype=np.int32), min_reviews=10)
        name, source, scale = 'MovieLens · television series & miniseries', TV_SOURCE, [i / 2 for i in range(1, 11)]
        label, link = 'MovieLens 32M', 'TVmaze'
    else:
        db = duckdb.connect(str(args.foodrs), read_only=True, config=options)
        candidates = cocktail_candidates(db)
        rows = db.execute("""
            SELECT AuthorId, RecipeId, Rating FROM reviews_raw
            WHERE Rating BETWEEN 1 AND 5 AND AuthorId IS NOT NULL AND RecipeId IN (SELECT unnest(?))
            QUALIFY row_number() OVER (PARTITION BY AuthorId, RecipeId
                ORDER BY coalesce(DateModified, DateSubmitted) DESC, ReviewId DESC) = 1
        """, [list(candidates)]).fetchall()
        items, profiles = make_profiles(candidates, np.array(rows, dtype=np.int32), min_reviews=5, limit=500)
        name, source, scale = 'Food.com · popular cocktail recipes', DRINK_SOURCE, list(range(1, 6))
        label = link = 'Food.com'
    db.close()
    catalog, selection = fit_catalog(name, items, scale, profiles)
    report: dict[str, object] = dict(selection)
    if args.domain == 'cocktails':
        # Few reviewers supply five scores. Quantify sensitivity to the person
        # split without using these extra fits to select the published model.
        sensitivity = []
        for seed in (41, 43):
            _, replicate = fit_catalog(name, items, scale, profiles, seed=seed)
            result = {key: replicate[key] for key in ('selectedK', 'testUsers', 'testRatings', 'holdout')}
            sensitivity.append({**result, 'seed': seed})
        report['splitSensitivity'] = sensitivity
    catalog.update(domain=args.domain, sourceLabel=label, linkLabel=link, source=source)
    report['respondentsWithFiveRatings'] = int(np.sum(np.diff(profiles.indptr) >= 5))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'validation').mkdir(exist_ok=True)
    (args.output / f'{args.domain}.json').write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
    (args.output / 'validation' / f'{args.domain}.json').write_text(json.dumps(report, indent=2) + '\n')
    write_evidence(args.output / f'{args.domain}-evidence.json', profiles, items, scale)


if __name__ == '__main__':
    main()
