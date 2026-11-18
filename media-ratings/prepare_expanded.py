"""Take a reproducible respondent sample from MovieLens 25M for the 500-film catalog."""
import argparse
import csv
import hashlib
import io
import json
from collections import Counter
from pathlib import Path
from zipfile import ZipFile


def prepare(archive, out):
    out.mkdir(exist_ok=True, parents=True)
    with ZipFile(archive) as z:
        for name in ('movies.csv', 'links.csv'):
            (out / name).write_bytes(z.read('ml-25m/' + name))
        movies = {r['movieId']: r['title'] for r in csv.DictReader((out/'movies.csv').open())}
        counts = Counter()
        with z.open('ml-25m/ratings.csv') as source, (out/'sample.csv').open('w') as target:
            target.write(source.readline().decode())
            previous = None
            keep = False
            for line in source:
                user, movie, _ = line.split(b',', 2)
                counts[movie] += 1
                if user != previous:
                    keep = hashlib.sha256(b'media-ratings-25m:' + user).digest()[0] < 8
                    previous = user
                if keep:
                    target.write(line.decode())
        ids = [k.decode() for k, _ in counts.most_common(500)]
        potter = [k for k, title in movies.items() if title.startswith('Harry Potter and the ')]
        if len(potter) != 8 or not set(potter).issubset(ids):
            raise ValueError('Expected the eight Harry Potter films in the top 500.')
        template = dict(name='MovieLens 25M · 500 most-rated films', scale=[i/2 for i in range(1,11)],
                        items=[dict(itemId=k,title=movies[k]) for k in ids], fit=dict(seed=417,iterations=180))
        (out/'template.json').write_text(json.dumps(template))
        print('500 films, including', len(potter), 'Harry Potter titles',flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    prepare(args.archive, args.output)
