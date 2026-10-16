#!/usr/bin/env python3
"""Fetch the pinned flag-icons subset, or verify it locally with --check."""
import argparse
import csv
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = json.loads((ROOT / 'scripts/flag-sources.sha256.json').read_text())
OUT = ROOT / 'data/flags'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    with (ROOT / 'data/registry/regions.csv').open() as registry:
        expected = {f"{row['iso3166']}.svg" for row in csv.DictReader(registry)} | {'LICENSE.txt'}
    if set(MANIFEST['files']) != expected:
        raise ValueError('Flag manifest must match the countries in regions.csv')
    OUT.mkdir(exist_ok=True)
    for name, entry in MANIFEST['files'].items():
        path = OUT / name
        if args.check:
            data = path.read_bytes()
        else:
            url = f"https://raw.githubusercontent.com/lipis/flag-icons/{MANIFEST['commit']}/{entry['source']}"
            with urlopen(url, timeout=30) as response:
                data = response.read()
        if hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise ValueError(f'Flag source checksum mismatch: {name}')
        if not args.check:
            path.write_bytes(data)
    print(f"Verified {len(expected) - 1} flags and their license")


if __name__ == '__main__':
    main()
