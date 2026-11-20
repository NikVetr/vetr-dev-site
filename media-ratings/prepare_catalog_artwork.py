"""Build the catalog artwork supplement from exact external item identifiers."""

import argparse
import csv
import hashlib
import html
import json
import re
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.error import HTTPError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from zipfile import ZipFile

from PIL import ImageFile


HERE = Path(__file__).resolve().parent
COMMUNITY_FIELDS = (
    'display_name', 'subreddit_type', 'quarantine', 'over18', 'advertiser_category',
    'community_icon', 'icon_img', 'header_img',
)
REDDIT_CDN = {'styles.redditmedia.com', 'a.thumbs.redditmedia.com', 'b.thumbs.redditmedia.com', 'i.redd.it'}


def request(url, headers=None):
    agent = {'User-Agent': 'vetr.dev catalog artwork (+https://vetr.dev/)'}
    req = Request(url, headers={**agent, **(headers or {})})
    for attempt in range(3):
        try:
            return urlopen(req, timeout=20)
        except HTTPError as exc:
            arctic_timeout = ('arctic-shift.photon-reddit.com/' in url and exc.code == 422 and
                             b'Timeout' in exc.read(512))
            if (not arctic_timeout and exc.code not in (429, 500, 502, 503, 504)) or attempt == 2:
                raise
            retry = exc.headers.get('Retry-After', '')
            time.sleep(max(10 if arctic_timeout else 2 ** attempt, int(retry) if retry.isdecimal() else 0))
        except OSError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError(f'Request exhausted for {url}')


def read_url(url):
    try:
        with request(url) as response:
            return response.read()
    except HTTPError as exc:
        if exc.code in (404, 410):
            return b''
        raise


def community(name):
    params = urlencode({'subreddit': name, 'limit': 1})
    data = json.loads(read_url('https://arctic-shift.photon-reddit.com/api/subreddits/search?' + params))
    rows = data['data']
    if not isinstance(rows, list):
        raise ValueError(f'Invalid archive response for {name}')
    for row in rows:
        if row.get('display_name', '').casefold() == name.casefold():
            return {field: row.get(field) for field in COMMUNITY_FIELDS}
    return {}


def recipe_metadata(content, item_id, source):
    if not re.search(r'"(?:contentId|rmsID)"\s*:\s*"' + re.escape(item_id) + '"', content):
        return {}
    for raw in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', content, re.S):
        obj = json.loads(raw)
        for node in obj.get('@graph', [obj]) if isinstance(obj, dict) else obj:
            if not isinstance(node, dict) or node.get('@type') != 'Recipe':
                continue
            pic = node.get('image')
            if isinstance(pic, list):
                pic = next(iter(pic), None)
            url = pic.get('url') if isinstance(pic, dict) else pic
            if not url or urlsplit(url).hostname != 'www.tasteofhome.com':
                continue
            # Publisher lists the lead image credit in its lead image metadata.
            credit = re.search(r'"image"\s*:\s*\{[^{}]*?"credits"\s*:\s*("(?:\\.|[^"\\])*")', content)
            row = {'itemId': item_id, 'sourceUrl': source, 'imageUrl': url}
            if credit:
                caption = html.unescape(json.loads(credit[1])).strip()
                if caption and caption.lower() != 'not available':
                    row['imageCredit'] = re.sub(r'^.*?\bphoto by\s+', '', caption, flags=re.I)
            return row
    return {}


def book_isbns(path, ids):
    """Goodbooks dropped leading zeroes from ISBN-10. Its rounded ISBN-13 field loses digits."""
    rows = {}
    with path.open(encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            item_id = row['goodreads_book_id']
            isbn = row['isbn'].upper().zfill(10)
            if (item_id in ids and row['isbn'] and re.fullmatch(r'\d{9}[\dX]', isbn)
                and sum((10 - n) * (10 if c == 'X' else int(c)) for n, c in enumerate(isbn)) % 11 == 0):
                rows[item_id] = isbn
    return rows


def lookup_books(isbns):
    keys = {i: 'ISBN:' + v for i, v in isbns.items()}
    query = urlencode({'bibkeys': ','.join(keys.values()), 'format': 'json', 'jscmd': 'data'})
    records = json.loads(read_url('https://openlibrary.org/api/books?' + query))
    rows = {}
    for i, key in keys.items():
        record = records.get(key, {})
        cover = record.get('cover', {})
        rows[i] = {'imageUrl': cover.get('medium') or cover.get('large'),
                   'imageSourceUrl': record.get('url'), 'key': record.get('key'), 'isbn': isbns[i]}
    return rows


def album_art(item_id):
    body = read_url('https://coverartarchive.org/release-group/' + item_id)
    if body:
        record = json.loads(body)
        for pic in record['images']:
            if pic.get('approved') and pic.get('front'):
                thumbs = pic.get('thumbnails', {})
                url = thumbs.get('500') or thumbs.get('250')
                if url:
                    return {'imageUrl': url, 'imageSourceUrl': record['release'].replace('http:', 'https:') + '/cover-art'}
    return {}


def put(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile('w', dir=path.parent, encoding='utf-8', delete=False) as buf:
        json.dump(obj, buf, ensure_ascii=False, separators=(',', ':'))
        buf.write('\n')
    Path(buf.name).replace(path)


def catalog(key):
    return {row['itemId']: row for row in json.loads((HERE / (key + '.json')).read_text())['items']}


def collect_communities(cache):
    # IDs are source hints. A returned record must still match both the ID and catalog name.
    wanted = {name.casefold(): name for name in catalog('subreddits')
              if not (cache / 'reddit' / (name + '.json')).exists()}
    with (HERE / 'subreddit-artwork-ids.csv').open(newline='') as f:
        matched = {r['redditId']: r['community'] for r in csv.DictReader(f) if r['community'] in wanted}
    ids = sorted(matched)
    for offset in range(0, len(ids), 25):
        batch = ids[offset:offset + 25]
        params = urlencode({'ids': ','.join(batch)})
        url = 'https://arctic-shift.photon-reddit.com/api/subreddits/ids?' + params
        for record in json.loads(read_url(url))['data']:
            name = record.get('display_name', '').casefold()
            if name in wanted and record['id'] in batch and matched[record['id']] == name:
                row = {field: record.get(field) for field in COMMUNITY_FIELDS}
                put(cache / 'reddit' / (wanted.pop(name) + '.json'), row)
        time.sleep(1)
    for name in wanted.values():
        put(cache / 'reddit' / (name + '.json'), community(name))
        time.sleep(1)


def collect_album_editions(cache, mard):
    # Only the MARD rows carrying their own fully confident MBID may supply a fallback edition.
    missing = {i for i, item in catalog('albums').items() if not item['annotations'].get('imageUrl')}
    groups = {}
    with ZipFile(mard) as archive, archive.open('mard/mard_metadata.json') as records:
        for line in records:
            row = json.loads(line)
            group, asin = row.get('release-group-mbid'), row.get('amazon-id', '')
            if group in missing and row.get('confidence') == 1 and re.fullmatch(r'[A-Z0-9]{10}', asin):
                groups.setdefault(group, set()).add(asin)
    for item_id, asins in groups.items():
        put(cache / 'mard' / (item_id + '.json'), sorted(asins))


def collect(cache, goodbooks, mard):
    collect_album_editions(cache, mard)
    collect_communities(cache)
    jobs = []
    for name, key in [('taste', 'recipes'), ('albums', 'albums')]:
        for i, item in catalog(key).items():
            a = item['annotations']
            if a.get('imageUrl') or (name == 'albums' and a.get('sourceUrl') != 'https://musicbrainz.org/release-group/' + i):
                continue
            jobs.append((name, i, a.get('sourceUrl')))

    def fetch(job):
        name, i, url = job
        path = cache / name / (i + '.json')
        if path.is_file():
            return
        if name == 'taste':
            row = recipe_metadata(read_url(url).decode(), i, url) if url else {}
        else:
            editions = cache / 'mard' / (i + '.json')
            if editions.is_file() and any(
                has_art(cache, f'https://m.media-amazon.com/images/P/{asin}.01.LZZZZZZZ.jpg', False)
                for asin in json.loads(editions.read_text())
            ):
                return
            row = album_art(i)
        put(path, row)
    with ThreadPoolExecutor(3) as workers:
        list(workers.map(fetch, jobs))

    books = book_isbns(goodbooks, {i for i, item in catalog('books').items() if not item['annotations'].get('imageUrl')})
    pending = [i for i in books if not (cache / 'books' / (i + '.json')).exists()]
    for offset in range(0, len(pending), 12):
        batch = {i: books[i] for i in pending[offset:offset + 12]}
        for i, row in lookup_books(batch).items():
            put(cache / 'books' / (i + '.json'), row)
        time.sleep(1)


def secure(url):
    return url.replace('http://', 'https://', 1) if url and url.startswith(('https://', 'http://')) else ''


def reddit_details(row):
    if row.get('subreddit_type') not in ('public', 'restricted') or row.get('quarantine') is not False:
        return {}, []
    category = (row.get('advertiser_category') or '').strip()
    meta = {'genres': [category]} if category and category.lower() != 'other' else {}
    urls = []
    if row.get('over18') is False:
        for field in ('community_icon', 'icon_img', 'header_img'):
            url = html.unescape(row.get(field) or '')
            if url.startswith('https://') and urlsplit(url).hostname in REDDIT_CDN and 'default' not in url.lower():
                urls.append(url)
    return meta, list(dict.fromkeys(urls))


def candidates(cache, key, item):
    i, a = item['itemId'], item['annotations']
    if a.get('imageUrl'):
        return {}, [], ''
    group = {'subreddits': 'reddit', 'recipes': 'taste'}.get(key, key)
    path = cache / group / (i + '.json')
    row = json.loads(path.read_text()) if path.exists() else {}
    if key == 'subreddits':
        if (row.get('display_name') or '').casefold() != i.casefold():
            return {}, [], ''
        details, urls = reddit_details(row)
        return details, urls, a['sourceUrl']
    if key == 'recipes' and row.get('itemId') == i and row.get('sourceUrl') == a.get('sourceUrl'):
        meta = {'imageCredit': row['imageCredit']} if row.get('imageCredit') else {}
        return meta, [row['imageUrl']], a['sourceUrl']
    if key == 'books' and i == '114954' and a.get('sourceUrl') == 'https://www.goodreads.com/book/show/114954':
        # The snapshot dropped the ISBN but this exact Goodreads edition now has its own cover.
        image = 'https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1266475201i/114954.jpg'
        return {}, [image], a['sourceUrl']
    if key == 'tv' and i == '124667' and a.get('sourceUrl') == 'https://www.tvmaze.com/shows/58579':
        # Same 2000 Charles Haid miniseries on Apple TV. TVmaze's image gallery is empty.
        source = 'https://tv.apple.com/us/show/sally-hemings-an-american-scandal/umc.cmc.4s70bc7s73sumu194sugttpm5'
        return {}, ['https://is1-ssl.mzstatic.com/image/thumb/IEJt7pUT-0NX6ffzFqQj3A/1200x675.jpg'], source
    if key == 'games':
        url = 'https://cdn.akamai.steamstatic.com/steam/apps/' + i + '/header.jpg'
        return {}, [url], a['sourceUrl']
    if key in ('royalroad-kindle', 'albums'):
        match = re.fullmatch(r'https://www.amazon.com/dp/([A-Z0-9]{10})', a.get('sourceUrl', ''))
        if match and i in (match[1], 'amazon-' + match[1]):
            return {}, ['https://m.media-amazon.com/images/P/' + match[1] + '.01.LZZZZZZZ.jpg'], a['sourceUrl']
    pic = secure(row.get('imageUrl'))
    source = secure(row.get('imageSourceUrl'))
    if key == 'books' and re.fullmatch(r'/books/OL\d+M', row.get('key') or ''):
        if urlsplit(source).hostname == 'openlibrary.org' and source.split('?')[0].split('/')[3:5] == row['key'].split('/')[1:] and urlsplit(pic).hostname == 'covers.openlibrary.org':
            return {}, [pic], source
    if key == 'albums' and urlsplit(pic).hostname == 'coverartarchive.org' and re.fullmatch(r'https://musicbrainz.org/release/[0-9a-f-]{36}/cover-art', source):
        return {}, [pic], source
    return {}, [], ''


def has_art(cache, url, offline):
    key = hashlib.sha256(url.encode()).hexdigest()
    path = cache / 'checks' / (key + '.json')
    if path.is_file():
        size = json.loads(path.read_text())
    elif offline:
        return False
    else:
        try:
            with request(url, {'Range': 'bytes=0-131071'}) as response:
                parser = ImageFile.Parser()
                if response.headers.get_content_maintype() == 'image':
                    parser.feed(response.read(131072))
                size = list(parser.image.size) if parser.image else []
        except HTTPError as exc:
            if exc.code not in (400, 401, 403, 404, 410, 451):
                raise
            size = []
        put(path, size)
    # Amazon returns a real JPEG, one pixel wide, for an unknown or unavailable product cover.
    return len(size) == 2 and min(size) >= 32


def build(cache, offline):
    result = {}
    for key in ('subreddits', 'recipes', 'books', 'royalroad-kindle', 'albums', 'games', 'tv'):
        rows = {i: candidates(cache, key, item) for i, item in catalog(key).items()
                if not item['annotations'].get('imageUrl')}
        # Reject shared generic community graphics, even when each community supplies the URL.
        repeats = Counter(url for _, urls, _ in rows.values() for url in set(urls)) if key == 'subreddits' else Counter()
        def validated(candidate):
            i, (details, urls, source) = candidate
            meta = dict(details)
            options = [(url, source) for url in urls]
            if key == 'books' and not urls:
                edition = cache / 'books' / (i + '.json')
                if edition.is_file():
                    isbn = json.loads(edition.read_text())['isbn']
                    options.append((f'https://m.media-amazon.com/images/P/{isbn}.01.LZZZZZZZ.jpg',
                                    f'https://www.amazon.com/dp/{isbn}'))
            if key == 'albums':
                matches = cache / 'mard' / (i + '.json')
                if matches.is_file():
                    edition_art = [(f'https://m.media-amazon.com/images/P/{asin}.01.LZZZZZZZ.jpg',
                                    f'https://www.amazon.com/dp/{asin}') for asin in json.loads(matches.read_text())]
                    options = edition_art + options
            for url, credit_page in options:
                if url and repeats[url] <= 1 and has_art(cache, url, offline):
                    return i, {**meta, 'imageUrl': url, 'imageSourceUrl': credit_page}
            meta.pop('imageCredit', None)
            return i, meta
        with ThreadPoolExecutor(4) as workers:
            out = {i: row for i, row in workers.map(validated, rows.items()) if row}
        if out:
            result[key] = out
        print(f'{key}: {sum("imageUrl" in r for r in out.values())} images, {sum("genres" in r for r in out.values())} topics')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--goodbooks', type=Path, help='goodbooks-10k books.csv, required for online collection')
    parser.add_argument('--mard', type=Path, help='MARD album metadata archive, required for online collection')
    parser.add_argument('--offline', action='store_true', help='Export only verified assets already in the cache')
    parser.add_argument('--output', type=Path, default=HERE / 'catalog-artwork.json')
    args = parser.parse_args()
    if not args.offline:
        if not args.goodbooks or not args.goodbooks.is_file() or not args.mard or not args.mard.is_file():
            parser.error('Online collection requires --goodbooks books.csv and --mard mard.zip')
        collect(args.cache, args.goodbooks, args.mard)
    result = build(args.cache, args.offline)
    if not result:
        raise ValueError('No verified catalog metadata found')
    put(args.output, result)
    args.output.chmod(0o644)


if __name__ == '__main__':
    main()
