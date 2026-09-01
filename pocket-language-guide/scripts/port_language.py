#!/usr/bin/env python3
"""Merge another language's cheat sheet into the existing corpus.

The concept bank is language-independent, so a second sheet is not a second
corpus: where it covers ground the first one already covers, it contributes rows
to `data/lang/<code>/` against the concept ids that exist. Only genuinely new
material becomes new concepts.

Matching is on a normalised English gloss, against the exact section first and then
against its group -- two sheets can file the same phrase under different panels.
That is what makes `zh-Hans -> en` and `ja -> en` share concept ids, and therefore
what makes `zh-Hans -> ja` work without anyone writing it.

  python3 scripts/port_language.py --tex sheet.tex --target ja \\
      --romanization hepburn --provenance japanese-reviewed-v6

Existing rows are never rewritten: an unmatched gloss creates a concept, a matched
one only adds the target-language row.
"""
import argparse
import csv
import re
import sys
from pathlib import Path

from latex_corpus import BLANK, cluster_key, kind_of, parse, register_of, resolve_title, slugify

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


class AliasedTitles(dict):
    """Title lookup that folds a sheet's renamed panels onto existing sections."""

    def __missing__(self, key):
        alias = resolve_title(key)
        if alias in self:
            return self[alias]
        raise SystemExit(
            f"heading {key!r} matches no section. Add it to data/registry/sections.csv, "
            "or add an alias in scripts/latex_corpus.py if it renames an existing panel."
        )


def read(rel):
    path = DATA / rel
    if not path.exists():
        return []
    with path.open(encoding="utf-8-sig") as fh:
        return list(csv.DictReader(fh))


def write(rel, header, rows):
    path = DATA / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=header, lineterminator="\r\n")
        w.writeheader()
        w.writerows(rows)
    return len(rows)


def match_key(gloss):
    """Normalise an English gloss enough that the same idea matches across sheets.

    Deliberately not aggressive: "I am sick" and "I feel unwell" are different
    entries and should stay different concepts.
    """
    s = gloss.lower().replace(BLANK, " ")
    s = re.sub(r"[^a-z0-9/ ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tex", required=True)
    ap.add_argument("--target", required=True, help="BCP-47 code, e.g. ja")
    ap.add_argument("--source", default="en")
    ap.add_argument("--romanization", default="", help="system name, e.g. hepburn")
    ap.add_argument("--accent", default="en-US")
    ap.add_argument("--provenance", required=True)
    ap.add_argument("--confidence", default="2")
    args = ap.parse_args(argv[1:])

    sections = read("registry/sections.csv")
    titles = AliasedTitles({s["title_en"]: s["section_id"] for s in sections})
    meta = {s["section_id"]: s for s in sections}
    groups = sorted({s["group"] for s in sections})

    # Existing concepts, indexed by the key a new sheet will match against.
    concepts_by_group = {g: read(f"concepts/{g}.csv") for g in groups}
    source_rows = {}
    for g in groups:
        for row in read(f"lang/{args.source}/{g}.csv"):
            source_rows[row["concept_id"]] = row
    # Two sheets can file the same phrase under different panels -- one puts "Can I
    # charge my phone?" under hotel basics, the other under hotel requests -- so a
    # match is tried against the exact section first and then against the whole
    # group, which is where those panels live together. A group-level match is only
    # accepted when it is unambiguous.
    by_section = {}
    by_group = {}
    for g, rows in concepts_by_group.items():
        for row in rows:
            gloss = source_rows.get(row["concept_id"], {}).get("text", "")
            key = match_key(gloss)
            by_section.setdefault((row["section_id"], key), row["concept_id"])
            by_group.setdefault((g, key), []).append(row["concept_id"])

    def find(section, group, key):
        hit = by_section.get((section, key))
        if hit:
            return hit
        candidates = by_group.get((group, key), [])
        return candidates[0] if len(candidates) == 1 else None

    def remember(section, group, key, concept_id):
        by_section.setdefault((section, key), concept_id)
        by_group.setdefault((group, key), []).append(concept_id)

    items = parse(Path(args.tex).read_text(encoding="utf-8"), titles)
    if not items:
        raise SystemExit("parsed no items -- the macro walk is broken")

    target_header = ["concept_id", "text", "text_alt"]
    if args.romanization:
        target_header.append(f"romanization_{args.romanization}")
    target_header += ["ipa", "literal", "confidence", "provenance"]
    source_header = ["concept_id", "text", "text_alt", "ipa", "literal", "confidence", "provenance"]
    concept_header = list(concepts_by_group[groups[0]][0]) if concepts_by_group[groups[0]] else [
        "concept_id", "section_id", "default_template", "kind", "slug_en", "rank",
        "importance", "cluster_id", "cluster_rank", "slots", "register", "notes",
    ]

    target_by_group = {g: [] for g in groups}
    new_source_by_group = {g: [] for g in groups}
    respell = []
    matched = 0
    created = 0
    taken = {row["concept_id"] for rows in concepts_by_group.values() for row in rows}

    for it in items:
        section = it["section"]
        group = meta[section]["group"]
        gloss = it["gloss"] or it["numeral"]
        key = match_key(gloss)
        concept_id = find(section, group, key)

        if concept_id is None:
            base = f"{section}.{slugify(gloss or it['roman'] or it['script'])}"
            concept_id = base
            n = 2
            while concept_id in taken:
                concept_id = f"{base}-{n}"
                n += 1
            taken.add(concept_id)
            remember(section, group, key, concept_id)
            created += 1
            is_note = it["template"] == "note"
            concepts_by_group[group].append({
                "concept_id": concept_id,
                "section_id": section,
                "default_template": it["template"],
                "kind": kind_of(it["template"], gloss),
                "slug_en": slugify(gloss or it["script"]),
                # New material goes after what is already there; the column breaker
                # reorders nothing, so authored order is the reading order.
                "rank": str(1000 + it["rank"]),
                "importance": f"{float(meta[section]['importance']) * 0.85:.3f}",
                "cluster_id": f"{section}.{slugify(cluster_key(gloss or it['script']))}",
                "cluster_rank": "0",
                "slots": str(it["script"].count(BLANK) or gloss.count(BLANK)),
                "register": register_of(gloss),
                "notes": "",
            })
            new_source_by_group[group].append({
                "concept_id": concept_id,
                "text": it["script"] if is_note else gloss,
                "text_alt": "", "ipa": "", "literal": "",
                "confidence": args.confidence, "provenance": args.provenance,
            })
        else:
            matched += 1

        row = {
            "concept_id": concept_id,
            "text": "" if it["template"] == "note" else it["script"],
            "text_alt": "", "ipa": "", "literal": "",
            "confidence": args.confidence, "provenance": args.provenance,
        }
        if args.romanization:
            row[f"romanization_{args.romanization}"] = it["roman"]
        target_by_group[group].append(row)
        if it["say"]:
            respell.append({"concept_id": concept_id, "respell": it["say"]})

    print(f"{len(items)} rows: {matched} matched existing concepts, {created} new")
    for group in groups:
        if target_by_group[group]:
            n = write(f"lang/{args.target}/{group}.csv", target_header, target_by_group[group])
            print(f"  lang/{args.target}/{group}.csv  {n} rows")
        if new_source_by_group[group]:
            merged = read(f"lang/{args.source}/{group}.csv") + new_source_by_group[group]
            write(f"lang/{args.source}/{group}.csv", source_header, merged)
            write(f"concepts/{group}.csv", concept_header, concepts_by_group[group])
            print(f"  concepts/{group}.csv  +{len(new_source_by_group[group])} new")

    if respell:
        rel = f"respell/overrides/{args.target}__{args.source}__{args.accent}.csv"
        print(f"  {rel}  {write(rel, ['concept_id', 'respell'], respell)} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
