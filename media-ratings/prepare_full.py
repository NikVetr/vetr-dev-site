"""Stream every in-catalog MovieLens 25M rating into a compact respondent matrix."""

import argparse
import csv
import hashlib
import io
import json
import re
from pathlib import Path
from zipfile import ZipFile
import numpy as np


def prepare(archive, catalog, output):
    output.mkdir(parents=True, exist_ok=True)
    items = json.loads(catalog.read_text())["items"]
    ids = {int(it["itemId"]): i for i, it in enumerate(items)}
    users = []
    with ZipFile(archive) as z:
        with (
            z.open("ml-25m/ratings.csv") as src,
            (output / "ratings.u8").open("wb") as dst,
        ):
            next(src)
            previous = None
            row = bytearray(len(items))
            for line in src:
                u, movie, value, _ = line.split(b",")
                j = ids.get(int(movie))
                if j is None:
                    continue
                if u != previous:
                    if previous is not None:
                        if int(u) <= int(previous):
                            raise ValueError("Expected the archive in ascending respondent order")
                        dst.write(row)
                    row = bytearray(len(items))
                    previous = u
                    users.append(
                        (int(u), hashlib.sha256(b"media-ratings-25m:" + u).digest()[0])
                    )
                if row[j]:
                    raise ValueError("Duplicate rating")
                level = float(value) * 2
                if not level.is_integer() or not 1 <= level <= 10:
                    raise ValueError("Expected a half-star rating from 0.5 to 5")
                row[j] = int(level)
            if not users:
                raise ValueError("No in-catalog ratings in this archive")
            dst.write(row)
        np.savetxt(
            output / "users.csv",
            users,
            fmt="%d",
            delimiter=",",
            header="user,bucket",
            comments="",
        )
        genres = {}
        with z.open("ml-25m/movies.csv") as f:
            for rec in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8")):
                if int(rec["movieId"]) in ids:
                    genres[rec["movieId"]] = rec["genres"].split("|")
        with z.open("ml-25m/genome-tags.csv") as f:
            tags = {
                int(r["tagId"]): r["tag"]
                for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8"))
            }
        scores = np.zeros((len(ids), len(tags)))
        with z.open("ml-25m/genome-scores.csv") as f:
            next(f)
            for line in f:
                movie, tag, v = line.split(b",")
                if (i := ids.get(int(movie))) is not None:
                    scores[i, int(tag) - 1] = float(v)
        # Save published Tag Genome side information for the
        # content similarity experiment. Only summary tags are shown in the UI.
        np.save(output / "genome.npy", scores)
        metadata = {}
        for i, it in enumerate(items):
            year = re.search(r"\((\d{4})\)$", it["title"])
            metadata[it["itemId"]] = {
                "genres": genres[it["itemId"]],
                "year": int(year[1]) if year else None,
                "tags": [
                    tags[j + 1] for j in np.argsort(-scores[i])[:4] if scores[i, j] > 0
                ],
            }
        (output / "film-annotations.json").write_text(
            json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))
        )
    print(len(users), "respondents", len(ids), "films", flush=True)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    for k in ("archive", "catalog", "output"):
        p.add_argument(k, type=Path)
    a = p.parse_args()
    prepare(a.archive, a.catalog, a.output)
