"""Validate metadata-based transfer from four ratings on sparse ordinal catalogs."""
import argparse
import json
from pathlib import Path
from zipfile import ZipFile

import duckdb
import numpy as np
from scipy.sparse import csr_matrix
from scipy.stats import norm

from evaluate_full import evaluate, paired, summary
from fit_catalog import fit_mixture, score_model, scoring_cases
from fit_ordinal_similarity import shared_label_vectors
from prepare_albums_tabletop import make_profiles as product_profiles, tabletop
from prepare_book_crossing import read_scores
from prepare_recipes import load_reviews
from prepare_tv_cocktails import make_profiles

DOMAINS = ('recipes', 'kindle-worlds', 'cocktails', 'food', 'boardgames', 'book-crossing')
FAMILIES = ('metadata', 'ratingStyle', 'both')
METADATA_NAMES = {
    'kindle-worlds': 'authors and worlds', 'food': 'courses and ingredients',
    'recipes': 'recipe courses', 'boardgames': 'game categories and collections',
    'cocktails': 'spirits and ingredients', 'book-crossing': 'authors',
}
STRENGTHS = (.125, .5, 1., 2.)
ROOT = Path(__file__).resolve().parent


def food_profiles(path, items):
    ids = [int(item['itemId']) for item in items]
    with duckdb.connect(str(path), read_only=True, config={'threads': 1, 'memory_limit': '1GB'}) as db:
        rows = db.execute("""
            SELECT AuthorId, RecipeId, Rating FROM reviews_raw WHERE Rating BETWEEN 1 AND 5
            AND AuthorId IS NOT NULL AND RecipeId IN (SELECT unnest(?))
            QUALIFY row_number() OVER (PARTITION BY AuthorId, RecipeId ORDER BY
            coalesce(DateModified, DateSubmitted) DESC, ReviewId DESC) = 1
        """, [ids]).fetchnumpy()
        ingredients = dict(db.execute("""
            SELECT RecipeId::INTEGER, RecipeIngredientParts FROM recipes_raw WHERE RecipeId IN (SELECT unnest(?))
        """, [ids]).fetchall())
    values = np.column_stack([rows[col] for col in ('AuthorId', 'RecipeId', 'Rating')]).astype(np.int32)
    rebuilt, profiles = make_profiles(dict(zip(ids, items)), values, 1, distinct_names=False)
    if [it['itemId'] for it in rebuilt] != [it['itemId'] for it in items]:
        raise ValueError('Food.com catalog ordering changed')
    return profiles, [ingredients[i] or [] for i in ids]


def source_profiles(key, inputs, items):
    if key in ('food', 'cocktails'):
        return food_profiles(inputs[0], items)
    if key == 'recipes':
        rebuilt, matrix = load_reviews(inputs[0])
    elif key == 'kindle-worlds':
        from prepare_royalroad_kindle import review_profiles
        matrix, _ = review_profiles(inputs[0], [it['itemId'] for it in items])
        return matrix, None
    elif key == 'book-crossing':
        with ZipFile(inputs[0]) as archive:
            observations, _ = read_scores(archive)
        readers, rows, cols, values = {}, [], [], []
        for j, it in enumerate(items):
            for reader, score in sorted(observations[it['annotations']['isbn13']].items()):
                rows.append(readers.setdefault(reader, len(readers)))
                cols.append(j)
                values.append(score)
        matrix = csr_matrix((np.asarray(values, dtype=int), (rows, cols)), shape=(len(readers), len(items)))
        return matrix, None
    else:
        candidates, editions = tabletop(inputs[0])
        rebuilt, matrix = product_profiles(inputs[1], inputs[2], editions, candidates, 400, 650, 12)
    if [it['itemId'] for it in rebuilt] != [it['itemId'] for it in items]:
        raise ValueError('Reconstructed inventory differs from original')
    return matrix, None


def metadata_vectors(items, ingredients):
    labels = []
    for j, it in enumerate(items):
        attrs = it['annotations']
        names = {f'{key}:{str(name).strip().casefold()}' for key in ('authors', 'genres', 'tags')
                 for name in attrs.get(key, []) if name}
        for key in ('format', 'collection'):
            if attrs.get(key):
                names.add(f'{key}:{attrs[key].strip().casefold()}')
        if ingredients is not None:
            names.update('ingredient:' + ' '.join(name.casefold().split()) for name in ingredients[j] if name)
        labels.append(names)
    # Unshared tags cannot transfer scores. An unannotated item keeps a zero feature vector.
    features = shared_label_vectors(labels).toarray()
    return features


def family_vectors(family, content):
    ones = np.ones((len(content), 1))
    if family == 'ratingStyle':
        return ones
    if family == 'both':
        return np.column_stack([ones, content]) / np.sqrt(2)
    return content


def class_components(model):
    weights, emissions, _ = model
    return {'components': [{'weight': w, 'probabilities': e} for w, e in zip(weights, emissions)]}


def encode_features(features):
    return [[float(v) if v else 0 for v in row] for row in np.round(features, 10)]


def model_text(family, name):
    subject = 'reader' if name in ('kindle-worlds', 'book-crossing') else 'reviewer'
    metadata = METADATA_NAMES[name]
    if family == 'ratingStyle':
        return ('Personal rating tendency',
                'Your answers update the taste classes. The forecast also adjusts for how high or low '
                'you rate items compared with their expected scores.')
    if family == 'both':
        return (f'{subject.title()} tendency + {metadata}',
                f'Your answers update the taste classes. Ratings above or below expectation shift other '
                f'scores, with greater weight for items with shared {metadata}.')
    return (f'Shared {metadata}',
            f'Your answers update the taste classes. Ratings above or below expectation also shift other '
            f'scores through shared {metadata}.')


def study(name, catalog, report, matrix, content):
    full_validation = name in ('kindle-worlds', 'boardgames', 'book-crossing')
    if matrix.shape != (catalog['fit']['users'], len(catalog['items'])) or matrix.nnz != catalog['fit']['ratings']:
        raise ValueError('Reviewer/item cohort differs from production fit')
    scale = np.asarray(catalog['scale'])
    threshold, seed, k = report['brierThreshold'], catalog['fit']['seed'], report['selectedK']
    base_label = f'Latent class, K={k}'
    rng = np.random.default_rng(seed)
    test, dev = np.split(rng.permutation(matrix.shape[0]), [max(1, matrix.shape[0]//5)])
    kernel = content @ content.T
    kernels = {'metadata': kernel, 'both': (1 + kernel)/2, 'ratingStyle': np.ones_like(kernel)}
    strengths = [v * (4/(scale[-1] - scale[0]))**2 for v in STRENGTHS]
    params = {f'{family} × {beta:g}': (family, kernels[family], beta) for family in FAMILIES for beta in strengths}
    cv = {}
    for f, valid in enumerate(np.array_split(dev, 3)):
        train = matrix[np.setdiff1d(dev, valid)]
        cases = scoring_cases(matrix, valid if full_validation else valid[:2000], rng)
        model = fit_mixture(train, len(scale), k, seed+f)
        scores = evaluate(class_components(model), cases, params, scale, threshold, base_label)
        for label, values in scores.items():
            cv.setdefault(label, []).append(values)
    cv_scores = {key: summary(key, np.concatenate(scores)) for key, scores in cv.items()}
    old_cv = next(r for r in report['cv'] if r['label'] == base_label)['logLoss']
    if not np.isclose(cv_scores[base_label]['logLoss'], old_cv, rtol=1e-8):
        raise ValueError('Could not reproduce released baseline development score')
    selected = min(params, key=lambda label: cv_scores[label]['logLoss'])
    # Freeze all choices before scoring the test respondents, including a style-only ablation.
    style = min((label for label, (family, _, _) in params.items() if family == 'ratingStyle'),
                key=lambda label: cv_scores[label]['logLoss'])
    metadata = min((label for label, (family, _, _) in params.items() if family == 'metadata'),
                   key=lambda label: cv_scores[label]['logLoss'])
    tested = {label: params[label] for label in dict.fromkeys([selected, style, metadata])}
    family, _, beta = params[selected]
    train = matrix[dev]
    model = fit_mixture(train, len(scale), k, seed)
    cases = scoring_cases(matrix, test, rng)
    held = evaluate(class_components(model), cases, tested, scale, threshold, base_label)
    held['Pooled item ratings'] = score_model(fit_mixture(train, len(scale), 1, seed), cases, scale, threshold)
    blank = [(ids[:0], values[:0], target, actual) for ids, values, target, actual in cases]
    held['No supplied ratings'] = score_model(model, blank, scale, threshold)
    old_held = next(r for r in report['holdout'] if r['label'] == base_label)['logLoss']
    if not np.isclose(held[base_label][:, 0].mean(), old_held, rtol=1e-8):
        raise ValueError('Could not reproduce released baseline holdout')
    against = {label: paired(held[selected], held[label]) for label in
               (base_label, 'Pooled item ratings', 'No supplied ratings', style)}
    # Separate six catalog decisions. Favor the incumbent when the respondent sample is too small.
    z = norm.ppf(1 - .05 / len(DOMAINS))
    upper = {}
    for label in (base_label, 'Pooled item ratings'):
        delta = held[selected][:, 0] - held[label][:, 0]
        upper[label] = float(delta.mean() + z*delta.std(ddof=1)/np.sqrt(len(delta)))
    adopt = (cv_scores[selected]['logLoss'] < old_cv and max(upper.values()) < 0 and
             held[selected][:, 1].mean() <= held[base_label][:, 1].mean())
    rows = [summary(label, values) for label, values in held.items()]
    result = dict(k=k, seed=seed, ratings=matrix.nnz, raters=matrix.shape[0], items=matrix.shape[1],
                  features=content.shape[1], supplied=4, validationUsers=report['validationUsers'],
                  testUsers=len(cases), testTargets=sum(len(y) for _, _, _, y in cases), selected=selected,
                  family=family, strength=float(beta), defaultAdopted=bool(adopt), cv=list(cv_scores.values()),
                  holdout=rows, selectedMinusReference=against, adjustedUpperLimits=upper)
    if adopt:
        label, description = model_text(family, name)
        catalog['models']['preferenceTransfer'] = dict(
            kind='class-similarity', base='latentClass', label=label, description=description,
            features=encode_features(family_vectors(family, content)), strength=float(beta), ridge=.5)
        if family in ('ratingStyle', 'both'):
            catalog['models']['preferenceTransfer']['ratingStyleIntercept'] = True
        catalog['defaultModel'] = 'preferenceTransfer'
        for selection in (catalog['selection'], report):
            selection['model'] = 'preferenceTransfer'
            selection['transferStudy'] = 'validation/metadata-transfer.json'
            for split, row in [('holdout', summary(selected, held[selected])), ('cv', cv_scores[selected])]:
                selection[split] = [r for r in selection[split] if r['label'] != selected] + [row]
            selection['cv'].sort(key=lambda metrics: metrics['logLoss'])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalog', choices=DOMAINS)
    parser.add_argument('source', nargs='+', type=Path)
    parser.add_argument('--output', type=Path, required=True, help='Directory for report and any accepted catalog')
    args = parser.parse_args()
    name = args.catalog
    if len(args.source) != (3 if name == 'boardgames' else 1):
        parser.error('Expected metadata and both review CSVs for boardgames or a single source for other catalogs')
    catalog = json.loads((ROOT/f'{name}.json').read_text())
    release = json.loads((ROOT/'validation'/f'{name}.json').read_text())
    profiles, ingredients = source_profiles(name, args.source, catalog['items'])
    content = metadata_vectors(catalog['items'], ingredients)
    report = study(name, catalog, release, profiles, content)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output/f'{name}-transfer.json').write_text(json.dumps(report, indent=2) + '\n')
    if report['defaultAdopted']:
        (args.output/'validation').mkdir(exist_ok=True)
        (args.output/'validation'/f'{name}.json').write_text(json.dumps(release, indent=2)+'\n')
        (args.output/f'{name}.json').write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':'))+'\n')
    print(name, report['selected'], report['defaultAdopted'], report['selectedMinusReference'], flush=True)


if __name__ == '__main__':
    main()
