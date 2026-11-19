"""Make a Food.com ratings catalog covering 200 widely reviewed recipes per course."""
import argparse
import json
from pathlib import Path
import re
import unicodedata

import duckdb
import numpy as np

from fit_catalog import fit_catalog, write_evidence
from prepare_tv_cocktails import clean_name, make_profiles

COURSES = {
    'Breakfast': ['Breakfast'],
    'Lunch and snacks': ['Lunch/Snacks'],
    'Main dishes': ['One Dish Meal', 'Chicken', 'Chicken Breast', 'Meat', 'Steak', 'Poultry', 'Pork', 'Roast Beef', 'Curries', 'Spaghetti'],
    'Vegetable sides': ['Vegetable', 'Potato', 'Corn', 'Carrots', 'Cauliflower', 'Spinach', 'Broccoli'],
    'Soups and stews': ['Stew', 'Chowders', 'Clear Soup', 'Vegetable Soup', 'Chicken Soup'],
    'Breads': ['Breads', 'Quick Breads', 'Yeast Breads'],
    'Desserts': ['Dessert', 'Frozen Desserts', 'Drop Cookies', 'Bar Cookie', 'Pie', 'Cheesecake', 'Candy'],
    'Sauces and dressings': ['Sauces', 'Salad Dressings', 'Spreads'],
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    db = duckdb.connect(str(args.database), read_only=True, config={'threads': 1, 'memory_limit': '1GB'})
    group = {category: course for course, categories in COURSES.items() for category in categories}
    rows = db.execute("""
        SELECT r.RecipeId::INTEGER, Name, RecipeCategory, year(DatePublished), Images[1], c.n
        FROM recipes_raw r JOIN (
            SELECT RecipeId, count(distinct AuthorId) n FROM reviews_raw
            WHERE Rating BETWEEN 1 AND 5 AND AuthorId IS NOT NULL GROUP BY RecipeId
        ) c ON r.RecipeId = c.RecipeId
        WHERE RecipeCategory IN (SELECT unnest(?)) AND c.n >= 10
        ORDER BY c.n DESC, r.RecipeId
    """, [list(group)]).fetchall()
    items = {}
    included = dict.fromkeys(COURSES, 0)
    for key, name, category, year, image, _ in rows:
        course = group[category]
        if included[course] >= 200:
            continue
        title = clean_name(name)
        slug = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode().lower()
        slug = re.sub(r'[^a-z0-9]+', '-', slug).strip('-')
        annotations = dict(genres=[course], tags=[category], year=year, sourceUrl=f'https://www.food.com/recipe/{slug}-{key}')
        if image and image.startswith('https://img.sndimg.com/'):
            annotations['imageUrl'] = image
        items[key] = dict(itemId=str(key), title=title, annotations=annotations)
        included[course] += 1
    ratings = db.execute("""
        SELECT AuthorId, RecipeId, Rating FROM reviews_raw WHERE Rating BETWEEN 1 AND 5
        AND AuthorId IS NOT NULL AND RecipeId IN (SELECT unnest(?))
        QUALIFY row_number() OVER (PARTITION BY AuthorId, RecipeId ORDER BY
            coalesce(DateModified, DateSubmitted) DESC, ReviewId DESC) = 1
    """, [list(items)]).fetchall()
    db.close()
    catalog_items, profiles = make_profiles(items, np.asarray(ratings, dtype=np.int32), 10, distinct_names=False)
    catalog, report = fit_catalog(f'Food.com · {len(catalog_items):,} recipes', catalog_items, list(range(1, 6)), profiles)
    catalog.update(domain='recipes', sourceLabel='Food.com', source=dict(
        title='FoodRS · Food.com recipes and reviews', url='https://huggingface.co/datasets/jiava/foodrs-data',
        author='Food.com reviewers, archived by irkaal and FoodRS', license='CC0 1.0',
        licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/'))
    args.output.mkdir(exist_ok=True, parents=True)
    (args.output / 'validation').mkdir(exist_ok=True)
    for path, data in [('food.json', catalog), ('validation/food.json', dict(**report, courseCounts=included))]:
        (args.output / path).write_text(json.dumps(data, separators=(',', ':')) + '\n')
    write_evidence(args.output / 'food-evidence.json', profiles, catalog_items, [1, 2, 3, 4, 5])
    print(catalog['fit'], included, report['holdout'])


if __name__ == '__main__':
    main()
