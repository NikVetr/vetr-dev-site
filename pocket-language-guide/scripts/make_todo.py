#!/usr/bin/env python3
"""Write the work package a translation agent starts from.

    python3 scripts/make_todo.py hi id sw

One TSV per language at `tmp/expansion/todo-<code>.tsv`: every concept that belongs
on that language's sheet, with the English rendering and the translator's note
beside it. TSV rather than CSV because several English glosses contain commas and
none contains a tab, so the file survives being pasted around.

Scoped, not the whole bank: `applies_to` limits a few concepts to particular
targets -- the Korean won, Chinese measure words -- and asking a Swahili translator
for them wastes their time and produces rows the sheet will filter back out. A
language already partway through gets only what it is missing, so this doubles as
the "what is left" query.
"""
import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "tmp/expansion"

HEADER = ["group", "concept_id", "section", "template", "kind", "slots",
          "register", "applies_to", "english", "notes"]


def rows_of(path):
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def applies_to(concept, code):
    only = (concept.get("applies_to") or "").strip()
    return not only or code in only.split(";")


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("codes", nargs="+")
    args = ap.parse_args(argv[1:])

    sections = {r["section_id"]: r for r in rows_of(DATA / "registry/sections.csv")}
    concepts = []
    for path in sorted((DATA / "concepts").glob("*.csv")):
        concepts.extend(rows_of(path))
    english = {}
    for path in sorted((DATA / "lang/en").glob("*.csv")):
        for row in rows_of(path):
            english[row["concept_id"]] = row

    OUT.mkdir(parents=True, exist_ok=True)
    for code in args.codes:
        have = set()
        for path in sorted((DATA / f"lang/{code}").glob("*.csv")):
            have |= {r["concept_id"] for r in rows_of(path)}

        wanted = [c for c in concepts if applies_to(c, code) and c["concept_id"] not in have]
        path = OUT / f"todo-{code}.tsv"
        with path.open("w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=HEADER, delimiter="\t", lineterminator="\n")
            w.writeheader()
            for c in wanted:
                section = sections[c["section_id"]]
                w.writerow({
                    "group": section["group"],
                    "concept_id": c["concept_id"],
                    "section": section["title_en"],
                    "template": c["default_template"],
                    "kind": c["kind"],
                    "slots": c["slots"],
                    "register": c["register"],
                    "applies_to": c["applies_to"],
                    "english": english.get(c["concept_id"], {}).get("text", ""),
                    "notes": c["notes"],
                })
        done = len([c for c in concepts if applies_to(c, code)]) - len(wanted)
        print(f"{path.relative_to(ROOT)}  {len(wanted)} concepts to translate"
              + (f", {done} already on file" if done else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
