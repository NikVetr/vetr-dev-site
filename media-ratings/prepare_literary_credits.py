"""Match book and anime credits to the released catalogs by edition ID, ISBN and MyAnimeList ID."""
import argparse
from collections import Counter, defaultdict
import csv
import hashlib
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from zipfile import ZipFile

ROOT = Path(__file__).parent
STAFF = {'P57': 'directors', 'P725': 'cast', 'P170': 'creators', 'P50': 'authors'}
SOURCE_FILES = {'books': ('goodbooks.zip', 'f9724dddfbd4d744e97977c4d631684b2aa238739893749ffc66b7cb8f5f3a66'),
                'anime': ('mal-top.csv', '6432fbbc109ad808eb5c05fc883a0e3fd6e71e5ab7988d6098e8db7ff462888b')}
BYLINE = {'', 'author', 'co-author', 'writer', 'co-writer', 'story', 'original story', 'author/illustrator'}
UNKNOWN = {'', 'unknown', 'none', 'n/a', 'not available', 'add some', 'none found', 'none found, add some'}


def cached_request(cache, prefix, endpoint, params):
    url = endpoint + '?' + urlencode(params)
    path = cache / (prefix + '-' + hashlib.sha256(url.encode()).hexdigest()[:16] + '.json')
    if path.exists():
        return json.loads(path.read_text())
    for attempt in range(4):
        try:
            request = Request(url, headers={'User-Agent': 'vetr.dev rating metadata/1.0 (https://vetr.dev)',
                                            'Accept': 'application/json'})
            with urlopen(request, timeout=90) as response:
                result = json.load(response)
            path.write_text(json.dumps(result, separators=(',', ':')))
            time.sleep(1)
            return result
        except HTTPError as exc:
            if exc.code not in {429, 500, 502, 503, 504} or attempt == 3:
                raise
            time.sleep(int(exc.headers.get('Retry-After', str(3 * 2**attempt))))
        except (URLError, TimeoutError):
            if attempt == 3:
                raise
            time.sleep(3 * 2**attempt)
    raise RuntimeError('Request did not complete')


def clean(value):
    return ' '.join(value.split()).strip()


def edition_isbn(book):
    # The source XML preserves leading zeros and the ISBN-13 check digit,
    # unlike its convenience CSV, which writes ISBN-13 in scientific notation.
    isbn = (book.findtext('isbn13') or '').strip()
    if re.fullmatch(r'\d{13}', isbn) and sum(int(c)*(3 if j % 2 else 1) for j, c in enumerate(isbn)) % 10 == 0:
        return isbn
    return isbn13_from_ten(book.findtext('isbn') or '')


def isbn13_from_ten(short):
    short = short.strip().upper()
    if re.fullmatch(r'\d{9}[\dX]', short):
        n = [10 if c == 'X' else int(c) for c in short]
        if sum((10-j)*v for j, v in enumerate(n)) % 11 == 0:
            digits = '978' + short[:9]
            check = -sum(int(c)*(3 if j % 2 else 1) for j, c in enumerate(digits)) % 10
            return digits + str(check)
    return None


def book_credits(ids, raw):
    result = {}
    missing = defaultdict(list)
    with ZipFile(raw / 'goodbooks.zip') as archive:
        for key in ids:
            book = ET.fromstring(archive.read(f'books_xml/{key}.xml')).find('book')
            if book is None or book.findtext('id') != key:
                raise ValueError(f'Goodbooks edition mismatch for {key}')
            names = defaultdict(list)
            for author in book.findall('authors/author'):
                name = clean(author.findtext('name') or '')
                role = clean(author.findtext('role') or '').lower()
                if not name or name.casefold() in {'anonymous', 'unknown'}:
                    continue
                if role in BYLINE:
                    names['authors'].append(name)
                if 'illustrat' in role:
                    names['illustrators'].append(name)
                if 'translat' in role:
                    names['translators'].append(name)
                if 'contributor' in role:
                    names['contributors'].append(name)
                if 'editor' in role:
                    names['editors'].append(name)
            # An explicitly empty list supersedes an untyped contributor byline.
            entry = {field: list(dict.fromkeys(values)) for field, values in names.items()}
            entry.setdefault('authors', [])
            publisher = clean(book.findtext('publisher') or '')
            if publisher.lower() not in UNKNOWN:
                entry['publishers'] = [publisher]
            else:
                isbn = edition_isbn(book)
                if isbn:
                    missing[isbn].append(key)
            result[key] = entry
    keys = sorted(missing)
    supplemented = 0
    for start in range(0, len(keys), 24):
        subset = keys[start:start+24]
        data = cached_request(raw, 'openlibrary', 'https://openlibrary.org/api/books', {
            'jscmd': 'details', 'format': 'json', 'bibkeys': ','.join('ISBN:' + key for key in subset)})
        for isbn in subset:
            edition = data.get('ISBN:'+isbn, {}).get('details', {})
            publishers = [clean(p) for p in edition.get('publishers', []) if isinstance(p, str)
                          and clean(p).lower() not in UNKNOWN]
            identifiers = set(edition.get('isbn_13', []))
            identifiers.update(isbn13_from_ten(short) for short in edition.get('isbn_10', []))
            if not publishers or isbn not in identifiers:
                continue
            for key in missing[isbn]:
                result[key]['publishers'] = list(dict.fromkeys(publishers))
                result[key]['publisherSourceUrl'] = 'https://openlibrary.org' + edition['key']
                supplemented += 1
    print('Book publishers added from matching Open Library ISBN-13s:', supplemented, flush=True)
    return result


def anime_credits(ids, raw):
    result = {}
    with (raw / 'mal-top.csv').open(encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            match = re.match(r'https://myanimelist\.net/anime/(\d+)(?:/|$)', row['URL'])
            if not match or match[1] not in ids:
                continue
            key = match[1]
            if key in result:
                raise ValueError(f'Duplicate MAL studio row for {key}')
            # MAL uses comma-separated credits in this file; Inc. and Co., Ltd. are company suffixes.
            studios = re.split(r',\s+(?!(?:Inc\.|Ltd\.?)(?:,|$))', row['Studios'])
            studios = [clean(s) for s in studios if clean(s).lower() not in UNKNOWN]
            result[key] = {'studios': list(dict.fromkeys(studios))} if studios else {}
    if set(result) != set(ids):
        raise ValueError('Pinned MAL source missed catalog IDs')
    fields = ' '.join(f'(wdt:{prop} "{field}")' for prop, field in STAFF.items())
    keys = sorted(ids, key=int)
    skipped = 0
    for start in range(0, len(keys), 120):
        subset = keys[start:start+120]
        values = ' '.join(f'"{i}"' for i in subset)
        query = f'''SELECT DISTINCT ?id ?item ?field ?person ?personLabel WHERE {{
          VALUES ?id {{ {values} }} ?item wdt:P4086 ?id .
          OPTIONAL {{ VALUES (?role ?field) {{ {fields} }} ?item ?role ?person . }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }} }}'''
        data = cached_request(raw, 'wikidata', 'https://query.wikidata.org/sparql', {'format':'json','query':query})
        grouped = defaultdict(dict)
        for row in data['results']['bindings']:
            key = row['id']['value']
            qid = row['item']['value'].rsplit('/', 1)[-1]
            grouping = grouped[key].setdefault(qid, defaultdict(set))
            if 'personLabel' not in row:
                continue
            label = row['personLabel']['value']
            if label and not re.fullmatch(r'Q\d+', label):
                grouping[row['field']['value']].add(label)
        for key, records in grouped.items():
            if len(records) > 1:
                skipped += 1
                continue
            qid, who = next(iter(records.items()))
            if who:
                result[key].update({field: sorted(values, key=lambda v: (v.casefold(), v)) for field, values in who.items()})
                result[key]['creditsSourceUrl'] = 'https://www.wikidata.org/wiki/' + qid
    print('Ambiguous Wikidata mappings skipped:', skipped, flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('domain', choices=['books', 'anime'])
    parser.add_argument('raw', type=Path, help='Pinned source files and request cache')
    parser.add_argument('--out', type=Path, default=ROOT)
    args = parser.parse_args()
    ids = {it['itemId'] for it in json.loads((ROOT / (args.domain + '.json')).read_text())['items']}
    args.raw.mkdir(parents=True, exist_ok=True)
    filename, checksum = SOURCE_FILES[args.domain]
    with (args.raw / filename).open('rb') as source:
        if hashlib.file_digest(source, 'sha256').hexdigest() != checksum:
            raise ValueError(f'Expected the pinned release of {filename}')
    result = book_credits(ids, args.raw) if args.domain == 'books' else anime_credits(ids, args.raw)
    counts = Counter(k for row in result.values() for k, values in row.items() if isinstance(values, list) and values)
    print(args.domain, len(result), counts, flush=True)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / (args.domain+'-credits.json')).write_text(json.dumps(result, ensure_ascii=False, sort_keys=True,
                                                                     separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
