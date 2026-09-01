#!/usr/bin/env python3
"""Fold agent-produced translation output into the corpus.

    python3 scripts/merge_translations.py ja zh-Hans          # additions
    python3 scripts/merge_translations.py --respell es fr de  # respellings only

Two kinds of output need folding in, and neither is written straight into the
corpus by the agent that produced it.

**Additions** (`tmp/expansion/add-<code>/<group>.csv`) extend a pack that already
exists and was reviewed by a fluent speaker. Those files are the most valuable
data here, so an agent writes its new rows somewhere else and this merges them,
appending only concepts the pack does not already have. An existing row is never
overwritten: the reviewed original wins.

**Respellings** (`tmp/expansion/respell-<code>.csv`) become
`data/respell/overrides/<code>__en__en-US.csv`, merged the same way -- curated
rows already on file are left alone.
"""
import argparse
import csv
import glob
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SRC = ROOT / "tmp/expansion"


def rows_of(path):
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def write(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=header, lineterminator="\r\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def known_concepts():
    ids = {}
    for f in glob.glob(str(DATA / "concepts/*.csv")):
        for r in rows_of(Path(f)):
            ids[r["concept_id"]] = r
    return ids


def merge_additions(code, concepts):
    """Append new rows to an existing pack, in concept order, never overwriting."""
    src_dir = SRC / f"add-{code}"
    if not src_dir.exists():
        print(f"  {code}: no tmp/expansion/add-{code}/ -- nothing to merge")
        return 0
    added = skipped = unknown = 0
    for src in sorted(src_dir.glob("*.csv")):
        dest = DATA / f"lang/{code}/{src.stem}.csv"
        have = rows_of(dest)
        if not have:
            print(f"  {code}/{src.stem}: no existing pack file, skipping", file=sys.stderr)
            continue
        header = list(have[0].keys())
        seen = {r["concept_id"] for r in have}
        for r in rows_of(src):
            cid = r["concept_id"]
            if cid not in concepts:
                unknown += 1
                continue
            if cid in seen:
                skipped += 1
                continue
            row = {k: unicodedata.normalize("NFC", r.get(k, "") or "") for k in header}
            row["concept_id"] = cid
            have.append(row)
            seen.add(cid)
            added += 1
        # Authored order is reading order, so re-file by the concept's own rank.
        order = {c: (int(concepts[c]["rank"]) if c in concepts else 9999) for c in seen}
        have.sort(key=lambda r: order.get(r["concept_id"], 9999))
        write(dest, header, have)
    print(f"  {code}: {added} rows added, {skipped} already present, {unknown} unknown ids")
    return added


def merge_respell(code, concepts):
    src = SRC / f"respell-{code}.csv"
    if not src.exists():
        print(f"  {code}: no tmp/expansion/respell-{code}.csv")
        return 0
    dest = DATA / f"respell/overrides/{code}__en__en-US.csv"
    have = rows_of(dest)
    seen = {r["concept_id"] for r in have}
    added = skipped = unknown = 0
    for r in rows_of(src):
        cid = r["concept_id"]
        if cid not in concepts:
            unknown += 1
            continue
        if cid in seen:
            skipped += 1
            continue
        text = unicodedata.normalize("NFC", (r.get("respell") or "").strip())
        if not text:
            continue
        have.append({"concept_id": cid, "respell": text})
        seen.add(cid)
        added += 1
    order = {c: (int(concepts[c]["rank"]) if c in concepts else 9999) for c in seen}
    have.sort(key=lambda r: order.get(r["concept_id"], 9999))
    write(dest, ["concept_id", "respell"], have)
    print(f"  {code}: {added} respellings added, {skipped} already curated, {unknown} unknown ids")
    return added


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("codes", nargs="+")
    ap.add_argument("--respell", action="store_true",
                    help="only merge respellings, not pack additions")
    args = ap.parse_args(argv[1:])

    concepts = known_concepts()
    print(f"{len(concepts)} concepts on file")
    for code in args.codes:
        if not args.respell:
            merge_additions(code, concepts)
        merge_respell(code, concepts)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
