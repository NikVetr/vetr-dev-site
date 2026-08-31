#!/usr/bin/env python3
"""Validate the shipped corpus. Exits non-zero on any error.

Checks the invariants the app relies on and cannot recover from at runtime:
registry references resolve, every concept has text in every ready language,
text is NFC, and safety-critical sections carry reviewed content.
"""
import csv
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# Wrong content here can cause harm, so machine-unreviewed rows (confidence < 2)
# are refused outright rather than shown with a caveat.
SAFETY_CRITICAL = {"emergency-medical", "lost-rescue", "dietary-needs"}
MIN_SAFE_CONFIDENCE = 2

errors = []
warnings = []


def load(rel):
    path = DATA / rel
    with path.open(encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    for n, row in enumerate(rows, start=2):
        if any(k is None or v is None for k, v in row.items()):
            errors.append(f"{rel}:{n}: wrong number of cells")
    return rows


def main():
    scripts = {r["iso15924"]: r for r in load("registry/scripts.csv")}
    languages = {r["bcp47"]: r for r in load("registry/languages.csv")}
    sections = {r["section_id"]: r for r in load("registry/sections.csv")}
    papers = load("registry/paper.csv")

    for code, lang in languages.items():
        for field in ("script", "script_alt"):
            iso = lang[field]
            if iso and iso not in scripts:
                errors.append(f"languages.csv: {code} references unknown script {iso!r}")
    if not papers:
        errors.append("registry/paper.csv: no presets")

    groups = sorted({s["group"] for s in sections.values()})
    # "ready" must be complete; "draft" may be partial while the content track fills it in.
    ready = [c for c, l in languages.items() if l["status"] == "ready"]
    partial = [c for c, l in languages.items() if l["status"] == "draft"]

    concepts = {}
    for group in groups:
        rel = f"concepts/{group}.csv"
        if not (DATA / rel).exists():
            warnings.append(f"{rel}: missing (no concepts for group {group!r} yet)")
            continue
        for row in load(rel):
            cid = row["concept_id"]
            if cid in concepts:
                errors.append(f"{rel}: duplicate concept_id {cid!r}")
            if row["section_id"] not in sections:
                errors.append(f"{rel}: {cid} references unknown section {row['section_id']!r}")
            elif sections[row["section_id"]]["group"] != group:
                errors.append(f"{rel}: {cid} belongs to group "
                              f"{sections[row['section_id']]['group']!r}, not {group!r}")
            try:
                imp = float(row["importance"])
                if not 0 <= imp <= 1:
                    errors.append(f"{rel}: {cid} importance {imp} outside 0..1")
            except ValueError:
                errors.append(f"{rel}: {cid} importance {row['importance']!r} is not a number")
            concepts[cid] = row

    if not concepts:
        errors.append("no concepts found at all")

    for code in ready + partial:
        seen = set()
        for group in groups:
            rel = f"lang/{code}/{group}.csv"
            if not (DATA / rel).exists():
                continue
            for row in load(rel):
                cid = row["concept_id"]
                seen.add(cid)
                if cid not in concepts:
                    errors.append(f"{rel}: unknown concept_id {cid!r}")
                    continue
                text = row["text"]
                is_note = concepts[cid]["default_template"] == "note"
                if not text.strip() and not is_note:
                    errors.append(f"{rel}: {cid} has empty text")
                if text != unicodedata.normalize("NFC", text):
                    errors.append(f"{rel}: {cid} text is not NFC-normalised")
                slots = int(concepts[cid]["slots"] or 0)
                if text.strip() and text.count("{}") != slots:
                    errors.append(f"{rel}: {cid} has {text.count('{}')} slots, "
                                  f"concept declares {slots}")
                section = concepts[cid]["section_id"]
                if section in SAFETY_CRITICAL:
                    try:
                        conf = int(row["confidence"])
                    except ValueError:
                        conf = -1
                    if conf < MIN_SAFE_CONFIDENCE:
                        errors.append(f"{rel}: {cid} is in safety-critical section "
                                      f"{section!r} with confidence {row['confidence']!r} "
                                      f"(need >= {MIN_SAFE_CONFIDENCE})")
        missing = set(concepts) - seen
        if missing:
            note = (f"lang/{code}: missing {len(missing)} of {len(concepts)} concepts, "
                    f"e.g. {sorted(missing)[:3]}")
            (errors if code in ready else warnings).append(note)

    for path in sorted((DATA / "respell/overrides").glob("*.csv")):
        for row in load(path.relative_to(DATA)):
            if row["concept_id"] not in concepts:
                errors.append(f"{path.name}: unknown concept_id {row['concept_id']!r}")

    for w in warnings:
        print(f"warn  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(f"\n{len(concepts)} concepts, {len(sections)} sections, "
          f"{len(ready)} ready languages, {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
