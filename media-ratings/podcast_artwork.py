"""Refresh externally hosted podcast thumbnails and credited creators by exact Apple ID."""
import argparse
import json
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


def lookup(ids):
    params = urlencode({'id': ','.join(ids), 'entity': 'podcast', 'country': 'us', 'limit': 200})
    request = Request('https://itunes.apple.com/lookup?' + params, headers={'Accept': 'application/json'})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)['results']
        except (HTTPError, URLError) as error:
            transient = not isinstance(error, HTTPError) or error.code in (429, 500, 502, 503, 504)
            if attempt == 2 or not transient:
                raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('Apple lookup did not complete')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('catalog', type=Path)
    args = parser.parse_args()
    catalog = json.loads(args.catalog.read_text())
    if catalog.get('domain') != 'podcasts':
        raise ValueError('Expected the Apple Podcasts catalog')
    items = {it['itemId']: it['annotations'] for it in catalog['items']}
    # These two fields come exclusively from current Apple lookup results.
    # Discard prior values in memory so delisted shows lose stale metadata.
    for annotation in items.values():
        annotation.pop('imageUrl', None)
        annotation.pop('authors', None)
    ids = list(items)
    found = 0
    for start in range(0, len(ids), 200):
        if start:
            time.sleep(3.2)
        batch = ids[start:start + 200]
        for row in lookup(batch):
            key = str(row.get('collectionId'))
            if row.get('kind') != 'podcast' or key not in batch:
                continue
            found += 1
            image = row.get('artworkUrl600') or row.get('artworkUrl100')
            if image:
                parts = urlsplit(image)
                if parts.scheme == 'https' and (parts.hostname or '').endswith('.mzstatic.com'):
                    items[key]['imageUrl'] = image
            if row.get('artistName'):
                items[key]['authors'] = [row['artistName']]
        print(f'Checked {min(start + 200, len(ids))}/{len(ids)} shows; {found} matches', flush=True)
    # A complete lookup is written atomically so an interrupted refresh is safe.
    replacement = args.catalog.with_suffix('.json.tmp')
    replacement.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n')
    replacement.replace(args.catalog)


if __name__ == '__main__':
    main()
