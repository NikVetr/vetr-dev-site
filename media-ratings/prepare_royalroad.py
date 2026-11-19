"""Fit a browser-importable catalog from an authorized export of Royal Road overall review scores."""
import argparse
import csv
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path
from urllib.parse import urlsplit

import numpy as np
from scipy.sparse import csr_matrix

from fit_catalog import fit_catalog


SCALE = [n / 2 for n in range(1, 11)]
FIELDS = {'reviewer_id', 'fiction_id', 'title', 'overall_score'}


def read_reviews(path):
    titles = {}
    reviews = {}
    rows = 0
    with path.open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream, strict=True)
        header = reader.fieldnames or []
        if len(set(header)) != len(header) or not FIELDS.issubset(header):
            raise ValueError(f'Expected unique CSV headers including {", ".join(sorted(FIELDS))}')
        for row in reader:
            rows += 1
            if None in row or any(not (row[field] or '').strip() for field in FIELDS):
                raise ValueError(f'Missing or malformed field at CSV line {reader.line_num}')
            rid, fid = row['reviewer_id'].strip(), row['fiction_id'].strip()
            if not fid.isascii() or not fid.isdecimal() or int(fid) <= 0:
                raise ValueError(f'Expected a positive integer fiction_id at CSV line {reader.line_num}')
            work = int(fid)
            title = row['title'].strip()
            if titles.setdefault(work, title) != title:
                raise ValueError(f'Inconsistent titles for fiction ID {work} at CSV line {reader.line_num}')
            try:
                score = Decimal(row['overall_score'].strip())
            except InvalidOperation:
                raise ValueError(f'Invalid overall_score at CSV line {reader.line_num}') from None
            if not score.is_finite() or score not in SCALE:
                raise ValueError(f'Expected an overall score of 0.5 through 5 in half stars at CSV line {reader.line_num}')
            code = int(score * 2)
            key = (rid, work)
            if reviews.setdefault(key, code) != code:
                raise ValueError(f'Conflicting scores for the same reviewer and fiction at CSV line {reader.line_num}')
    if not reviews:
        raise ValueError('The export contains no reviews')
    people = {rid: i for i, rid in enumerate(sorted({rid for rid, _ in reviews}))}
    work_ids = sorted(titles)
    columns = {work: i for i, work in enumerate(work_ids)}
    profile = csr_matrix((np.fromiter(reviews.values(), dtype=np.int8),
                          ([people[u] for u, _ in reviews], [columns[w] for _, w in reviews])),
                         shape=(len(people), len(titles)))
    counts = np.bincount(profile.indices, minlength=len(titles))
    sizes = np.diff(profile.indptr).astype(np.int64)
    items = [dict(itemId=str(w), title=titles[w], annotations=dict(ratingCount=int(counts[i]),
                    sourceUrl=f'https://www.royalroad.com/fiction/{w}')) for i, w in enumerate(work_ids)]
    audit = dict(sourceRows=rows, distinctReviews=int(profile.nnz), duplicateRows=rows - profile.nnz,
                 works=len(titles), readers=len(people), readersWithTwoWorks=int((sizes >= 2).sum()),
                 readersWithFiveWorks=int((sizes >= 5).sum()), medianWorksPerReader=float(np.median(sizes)),
                 withinReaderWorkPairs=int((sizes * (sizes - 1) // 2).sum()))
    return items, profile, audit


def provenance(path):
    source = json.loads(path.read_text())
    fields = ['title', 'author', 'url', 'license', 'notes']
    if not isinstance(source, dict) or not all(isinstance(source.get(k), str) and source[k].strip() for k in fields):
        raise ValueError('Source JSON needs title, author, url, license and notes')
    if 'licenseUrl' in source:
        fields.append('licenseUrl')
    for key in ('url', 'licenseUrl'):
        if key in source and (not isinstance(source[key], str) or
                urlsplit(source[key]).scheme != 'https' or not urlsplit(source[key]).hostname):
            raise ValueError(f'Expected an HTTPS {key} in source JSON')
    return {key: source[key] for key in fields}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reviews', type=Path, help='UTF-8 CSV of individual overall review scores')
    parser.add_argument('--source', type=Path, help='Provenance JSON for the supplied export')
    parser.add_argument('--out', type=Path, help='Directory for the fitted catalog and validation report')
    parser.add_argument('--audit-only', action='store_true', help='Print overlap and duplicate counts without fitting')
    args = parser.parse_args()
    if not args.audit_only and (not args.source or not args.out):
        parser.error('Fitting requires --source and --out')
    items, profile, audit = read_reviews(args.reviews)
    print(json.dumps(audit), flush=True)
    if args.audit_only:
        return
    source = provenance(args.source)
    if audit['readersWithFiveWorks'] < 4:
        raise ValueError('Three validation folds and a separate test split each need a reader with at least five reviewed works')
    catalog, report = fit_catalog('Royal Road · overall review stars', items, SCALE, profile)
    catalog.update(domain='royalroad', linkLabel='Royal Road', sourceLabel=source['title'], sourceUrl=source['url'], source=source)
    args.out.mkdir(parents=True, exist_ok=True)
    for name, body in [('royalroad.json', catalog), ('royalroad-validation.json', dict(**report, sourceCounts=audit))]:
        (args.out / name).write_text(json.dumps(body, ensure_ascii=False, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
