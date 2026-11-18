"""Export full MovieLens rating counts and 2017 TMDB film finances by MovieLens ID.

From the repository root, after prepare_full.py:
    python3 media-ratings/prepare_film_context.py tmp/agent/media-full \
        media-ratings/expanded.json media-ratings/expanded-evidence.json media-ratings/film-context.json

Place the original movies_metadata.csv in the scratch directory. The source is
Rounak Banik's July 2017 TMDB metadata snapshot (not its separate ratings file):
https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset
https://huggingface.co/datasets/gaygaaa/TheMoviesDataset/blob/287abcb9999f332e13d93b17c9b0352b96875941/movies_metadata.csv
SHA-256 37ec322786b136a24604564e55160be75f8937546f11cb1a990076971fa895fd.
Rating counts come from https://grouplens.org/datasets/movielens/25m/ .

TMDB records production budget and reported box-office revenue in nominal USD.
It allows domestic gross when worldwide is unavailable. The snapshot does not
identify a revenue's geography, subsequent rereleases or currency conversion date.
https://www.themoviedb.org/bible/movie#59f73b759251416e71000007
"""

import argparse
import csv
import json
from decimal import Decimal
from pathlib import Path

import numpy as np


# The snapshot's Seven Samurai gross equals the domestic 2002 rerelease alone.
# Its budget also conflicts with BFI's contemporary-yen equivalent of ~$350k.
# These exclusions only apply to the specific, reviewed snapshot values.
# https://www.boxofficemojo.com/title/tt0047478/
# https://www.bfi.org.uk/features/seven-samurai-akira-kurosawa-classic-status
EXCLUSIONS = {("tt0047478", "budget", 2_000_000), ("tt0047478", "revenue", 271_841)}


def dollars(value: str) -> int | None:
    if value.strip().lower() in {"", "na", "n/a", "nan", "null", "none", "unknown"}:
        return None
    amount = Decimal(value)
    if amount <= 0:
        return None
    if not amount.is_finite() or amount != amount.to_integral_value() or amount < 1000:
        raise ValueError(f"Review unexpected dollar amount {value!r} before exporting")
    return int(amount)


def prepare(root: Path, catalog: Path, evidence: Path, output: Path) -> None:
    shelf = json.loads(catalog.read_text())
    ids = [item["itemId"] for item in shelf["items"]]
    links = json.loads(evidence.read_text())
    if ids != links["ids"] or len(set(ids)) != len(ids):
        raise ValueError("Catalog and evidence item orders must match and be unique")
    imdb = {"tt" + links["imdb"][item]: item for item in ids}
    if len(imdb) != len(ids):
        raise ValueError("Expected a distinct IMDb ID for each catalog film")

    fit = shelf["fit"]
    ratings = np.memmap(root / "ratings.u8", mode="r", dtype=np.uint8)
    ratings = ratings.reshape(fit["users"], len(ids))
    counts = np.zeros(len(ids), dtype=np.int64)
    for offset in range(0, len(ratings), 4096):
        block = ratings[offset : offset + 4096]
        if block.max() > len(shelf["scale"]):
            raise ValueError("Unexpected rating code in full respondent matrix")
        counts += np.count_nonzero(block, axis=0)
    if int(counts.sum()) != fit["ratings"]:
        raise ValueError("Full per-title counts disagree with catalog fit total")

    records = {item: {"ratingCount": int(n)} for item, n in zip(ids, counts)}
    matched = set()
    with (root / "movies_metadata.csv").open(newline="", encoding="utf-8") as src:
        for row in csv.DictReader(src):
            title = row["imdb_id"]
            if title not in imdb:
                continue
            if title in matched:
                raise ValueError(f"Ambiguous TMDB records for IMDb ID {title}")
            matched.add(title)
            for field in ("budget", "revenue"):
                amount = dollars(row[field])
                if amount is not None and (title, field, amount) not in EXCLUSIONS:
                    records[imdb[title]][field] = amount
    if matched != set(imdb):
        raise ValueError(
            f"Missing IMDb IDs in TMDB snapshot: {sorted(set(imdb) - matched)}"
        )
    output.write_text(json.dumps(records, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ("root", "catalog", "evidence", "output"):
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    prepare(args.root, args.catalog, args.evidence, args.output)
