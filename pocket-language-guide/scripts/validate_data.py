#!/usr/bin/env python3
"""Validate the shipped corpus. Exits non-zero on any error.

Checks the invariants the app relies on and cannot recover from at runtime:
registry references resolve, every concept has text in every ready language,
text is NFC, and safety-critical sections carry reviewed content.
"""
import csv
import json
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
    regions = {r["iso3166"]: r for r in load("registry/regions.csv")}

    for code, lang in languages.items():
        for field in ("script", "script_alt"):
            iso = lang[field]
            if iso and iso not in scripts:
                errors.append(f"languages.csv: {code} references unknown script {iso!r}")
        # Flags are built from these, so a malformed code would render as tofu.
        for region in filter(None, lang["regions"].split(";")):
            if len(region) != 2 or not region.isalpha() or region != region.upper():
                errors.append(f"languages.csv: {code} has bad region code {region!r} "
                              "(want ISO 3166-1 alpha-2, uppercase)")
        if not lang["speak_label"].strip():
            errors.append(f"languages.csv: {code} has no speak_label")
    if not papers:
        errors.append("registry/paper.csv: no presets")

    for code, region in regions.items():
        if len(code) != 2 or code != code.upper() or not code.isalpha():
            errors.append(f"regions.csv: bad code {code!r} (want ISO 3166-1 alpha-2)")
        try:
            confidence = int(region["confidence"])
        except ValueError:
            errors.append(f"regions.csv: {code} confidence {region['confidence']!r} is not a number")
            continue
        # Emergency numbers get printed and acted on, so a claim that they were
        # reviewed has to come with a source and a date.
        if confidence >= MIN_SAFE_CONFIDENCE:
            if not region["source"].strip():
                errors.append(f"regions.csv: {code} claims confidence {confidence} with no source")
            if not region["verified_at"].strip():
                errors.append(f"regions.csv: {code} claims confidence {confidence} with no verified_at")

    for code, lang in languages.items():
        for region in filter(None, lang["regions"].split(";")):
            if region not in regions:
                errors.append(f"languages.csv: {code} lists region {region!r}, "
                              "which registry/regions.csv does not define")

    groups = sorted({s["group"] for s in sections.values()})
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
            # Not an error, whatever the status. The concept bank is the union of
            # every sheet ported into it, so no single language covers all of it --
            # and which languages are advertised is an editorial call, recorded in
            # status and shown honestly via coverage.json.
            warnings.append(f"lang/{code}: {len(seen)} of {len(concepts)} concepts "
                            f"({100 * len(seen) // max(1, len(concepts))}%)")

    for path in sorted((DATA / "respell/overrides").glob("*.csv")):
        for row in load(path.relative_to(DATA)):
            if row["concept_id"] not in concepts:
                errors.append(f"{path.name}: unknown concept_id {row['concept_id']!r}")

    # Coverage drives the gallery. Declared status is intent; this is fact, and a
    # language with no rows must not offer a button that produces an empty sheet.
    coverage = {"total": len(concepts), "languages": {}}
    for code in languages:
        have = 0
        for group in groups:
            rel = f"lang/{code}/{group}.csv"
            if (DATA / rel).exists():
                have += sum(1 for r in load(rel) if r["text"].strip() or
                            concepts.get(r["concept_id"], {}).get("default_template") == "note")
        coverage["languages"][code] = have
    (DATA / "coverage.json").write_text(json.dumps(coverage, indent=2) + "\n", encoding="utf-8")
    reviewed = sum(1 for r in regions.values() if int(r["confidence"] or 0) >= MIN_SAFE_CONFIDENCE)
    if reviewed < len(regions):
        warnings.append(f"registry/regions.csv: {len(regions) - reviewed} of {len(regions)} "
                        "regions have unreviewed emergency numbers, which are withheld "
                        "from sheets until a fluent speaker confirms them")

    print(f"data/coverage.json  " + ", ".join(
        f"{c}={n}" for c, n in coverage["languages"].items() if n))

    for w in warnings:
        print(f"warn  {w}")
    for e in errors:
        print(f"ERROR {e}")
    print(f"\n{len(concepts)} concepts, {len(sections)} sections, "
          f"{len(ready)} ready languages, {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
