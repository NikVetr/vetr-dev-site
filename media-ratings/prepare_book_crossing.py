"""Fit explicit Book-Crossing 1–10 scores, retaining one reviewed ISBN per distinct title and author."""
import argparse
from collections import Counter, defaultdict
import csv
from html import unescape
from io import TextIOWrapper
import json
from pathlib import Path
import re
import unicodedata
from typing import Any
from zipfile import ZipFile

import numpy as np
from scipy.sparse import csr_matrix
from scipy.special import softmax

from fit_catalog import fit_catalog, fit_mixture, scoring_cases, write_evidence

SCALE = list(range(1, 11))
MIN_RATINGS = 30
MAX_EDITIONS = 1000


def isbn13(value):
    """Canonicalize a checksum-valid ISBN-10 or ISBN-13; invalid codes cannot identify editions."""
    value = value.replace('-', '').strip().upper()
    if re.fullmatch(r'[0-9]{9}[0-9X]', value):
        digits = [10 if x == 'X' else int(x) for x in value]
        if sum(d*(10-i) for i, d in enumerate(digits)) % 11:
            return None
        value = '978' + value[:9]
        end = -sum(int(x)*(1 if i%2 == 0 else 3) for i, x in enumerate(value)) % 10
        return value + str(end)
    if re.fullmatch(r'97[89][0-9]{10}', value):
        if sum(int(x)*(1 if i%2 == 0 else 3) for i, x in enumerate(value)) % 10 == 0:
            return value
    return None


def csv_rows(archive, name):
    # The original export backslash-escapes double quotes inside quoted fields.
    with TextIOWrapper(archive.open(name), encoding='latin-1', newline='') as stream:
        yield from csv.DictReader(stream, delimiter=';', escapechar='\\')


def read_scores(archive):
    counts = Counter()
    by_book = defaultdict(dict)
    for row in csv_rows(archive, 'BX-Book-Ratings.csv'):
        counts['sourceRows'] += 1
        score = int(row['Book-Rating'])
        if not score:
            counts['implicitZeros'] += 1
            continue
        if score not in SCALE:
            raise ValueError(f'Unknown Book-Crossing score {score}')
        code = isbn13(row['ISBN'])
        if code is None:
            counts['explicitInvalidISBN'] += 1
            continue
        person = row['User-ID']
        previous = by_book[code].get(person)
        if previous is not None:
            if previous != score:
                if previous:
                    counts['conflictingReaderISBNs'] += 1
                by_book[code][person] = 0
            else:
                counts['duplicateScores'] += 1
        else:
            by_book[code][person] = score
    return {code: {p: s for p, s in rows.items() if s} for code, rows in by_book.items()}, counts


def clean(value):
    return ' '.join(unescape(value).split())


def title_key(title, author):
    # Preserve words, accents, subtitles, translated titles and edition qualifiers.
    return tuple(' '.join(re.findall(r'\w+', unicodedata.normalize('NFKC', v).casefold())) for v in (title, author))


def read_books(archive, candidates):
    books, conflicts = {}, set()
    fallback_covers = set(Path(__file__).with_name('book-crossing-cover-fallbacks.txt').read_text().splitlines())
    for r in csv_rows(archive, 'BX-Books.csv'):
        code = isbn13(r['ISBN'])
        if code is None or code not in candidates:
            continue
        title, author = clean(r['Book-Title']), clean(r['Book-Author'])
        if code == '9783423202329':
            title = title.replace('MÃ?Â¶rder', 'Mörder')
        if code == '9780156528207':
            author = author.replace('ExupÃ©ry', 'Exupéry')
        if not title or not author:
            continue
        year = r['Year-Of-Publication']
        year = int(year) if year.isdigit() and 1450 <= int(year) <= 2004 else None
        original = r['ISBN'].strip().upper().replace('-', '')
        link = 'https://openlibrary.org/isbn/'+code
        info: dict[str, Any] = dict(authors=[author], isbn=original, isbn13=code, sourceUrl=link)
        if year:
            info['year'] = year
        image = r['Image-URL-L'].strip()
        match = re.fullmatch(r'https?://images\.amazon\.com/images/P/([0-9Xx]+)\.[A-Za-z0-9.]+\.jpg', image)
        if code not in fallback_covers and match and isbn13(match[1]) == code:
            info['imageUrl'] = 'https://m.media-amazon.com/images/P/' + image.rsplit('/', 1)[1]
            info['imageSourceUrl'] = 'https://www.amazon.com/dp/'+match[1]
            info['imageCredit'] = 'Edition cover'
        else:
            info['imageUrl'] = 'https://covers.openlibrary.org/b/isbn/'+code+'-M.jpg?default=false'
        if code in books and title_key(books[code]['title'], books[code]['annotations']['authors'][0]) != title_key(title, author):
            conflicts.add(code)
        else:
            books[code] = dict(itemId='bx-'+code, title=title, annotations=info)
    return {code: b for code, b in books.items() if code not in conflicts}


def select_editions(books, observed, limit):
    seen, chosen = set(), []
    for code in sorted(books, key=lambda c: (-len(observed[c]), c)):
        b = books[code]
        key = title_key(b['title'], b['annotations']['authors'][0])
        if key not in seen:
            seen.add(key)
            chosen.append(code)
        if len(chosen) == limit:
            break
    return chosen


def input_resolution(profiles, report):
    """Predict the same exact scores when each given answer identifies one or two categories."""
    seed = report['finalFit']['seed']
    rng = np.random.default_rng(seed)
    order = rng.permutation(profiles.shape[0])
    n_test = max(1, len(order)//5)
    test, development = order[:n_test], order[n_test:]
    # Replay fit_catalog's three validation reveals before generating its test cases.
    for fold in np.array_split(development, 3):
        scoring_cases(profiles, fold, rng)
    cases = scoring_cases(profiles, test, rng)
    if len(cases) != report['testUsers'] or sum(len(c[3]) for c in cases) != report['testRatings']:
        raise ValueError('Input resolution must be tested on the class-selection holdout')
    weights, emissions, _ = fit_mixture(profiles[development], len(SCALE), report['selectedK'], seed)
    losses = []
    for given, scores, targets, truth in cases:
        exact = emissions[:, given, scores]
        lower = 2 * (scores//2)
        merged = emissions[:, given, lower] + emissions[:, given, lower+1]
        target_likelihood = emissions[:, targets, truth]
        losses.append([-np.mean(np.log(softmax(np.log(weights)+np.log(lk).sum(axis=1)) @ target_likelihood))
                       for lk in (exact, merged)])
    loss_array = np.asarray(losses)
    exact_loss, paired_loss = loss_array[:, 0], loss_array[:, 1]
    reference = report['holdout'][-1]['logLoss']
    if not np.isclose(exact_loss.mean(), reference, atol=1e-10, rtol=0):
        raise ValueError('Exact-input score does not match the original test result')
    delta = exact_loss-paired_loss
    return dict(exactInputLogLoss=float(exact_loss.mean()), pairedInputLogLoss=float(paired_loss.mean()),
                exactMinusPaired=float(delta.mean()), pairedReaderSE=float(delta.std(ddof=1)/np.sqrt(len(delta))),
                testReaders=len(cases), testScores=report['testRatings'])


def build_catalog(archive_path, output):
    with ZipFile(archive_path) as z:
        observed, audit = read_scores(z)
        candidates = {code for code, scores in observed.items() if len(scores) >= MIN_RATINGS}
        books = read_books(z, candidates)
    codes = select_editions(books, observed, MAX_EDITIONS)
    items, rows, cols, data, readers = [], [], [], [], {}
    for i, code in enumerate(codes):
        b = books[code]
        b['annotations']['ratingCount'] = len(observed[code])
        items.append(b)
        for person, score in sorted(observed[code].items()):
            rows.append(readers.setdefault(person, len(readers)))
            cols.append(i)
            data.append(score)
    profiles = csr_matrix((np.array(data, dtype=np.uint8), (rows, cols)), shape=(len(readers),len(codes)))
    catalog, report = fit_catalog('Book-Crossing · 1–10 reader ratings', items, SCALE, profiles, validation_limit=None)
    catalog.update(domain='books', sourceLabel='Book-Crossing', linkLabel='Open Library',
                   source=dict(title='Book-Crossing dataset', url='https://grouplens.org/datasets/book-crossing/',
                               author='Cai-Nicolas Ziegler et al.',
                               notes='Explicit reader scores collected in 2004. A score applies to the ISBN edition reviewed. Edition year, author and cover links come from the Book-Crossing snapshot.'))
    source_counts: dict[str, Any] = dict(audit)
    source_counts.update(explicitRows=audit['sourceRows']-audit['implicitZeros'], eligibleISBNs=len(candidates),
                         eligibleWithMetadata=len(books), selectedEditions=len(codes),
                         ratingHistogram=np.bincount(np.asarray(profiles.data, dtype=int), minlength=11)[1:].tolist(),
                         eligibleFourInputReaders=int(np.sum(np.diff(profiles.indptr) >= 5)))
    years = [it['annotations']['year'] for it in items if 'year' in it['annotations']]
    report = {**report, 'sourceCounts': source_counts, 'minimumRatings': MIN_RATINGS, 'maximumEditions': MAX_EDITIONS,
              'editionYears': dict(known=len(years), minimum=min(years), median=float(np.median(years)), maximum=max(years)),
              'inputResolution': input_resolution(profiles, report)}
    (output/'validation').mkdir(parents=True, exist_ok=True)
    for name, obj in [('book-crossing.json', catalog), ('validation/book-crossing.json', report)]:
        (output/name).write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False)+'\n')
    write_evidence(output/'book-crossing-evidence.json', profiles, items, SCALE)
    print(json.dumps(dict(fit=catalog['fit'], audit=source_counts, holdout=report['holdout'])), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    build_catalog(args.archive, args.output)
