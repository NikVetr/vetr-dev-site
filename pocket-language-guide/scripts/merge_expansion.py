#!/usr/bin/env python3
"""Merge agent-designed concept proposals into the corpus.

    python3 scripts/merge_expansion.py tmp/expansion/*.json

The proposals name sections and items but deliberately do not assign `concept_id`
or `rank`: identity and ordering are global properties, and letting three
independent authors pick them is how you get collisions and interleaved panels.
This assigns both, applies the small number of coordinator corrections, and writes
the registry, concept and English rows.

Idempotent in the sense that matters: it refuses to run if any concept it would
create already exists, so a second run after a successful one is a no-op error
rather than a duplicate.
"""
import argparse
import csv
import glob
import json
import os
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

SECTION_HEADER = ["section_id", "group", "color_role", "default_level", "icon",
                  "title_en", "rank", "scope", "audience_tags", "importance", "default_on"]
CONCEPT_HEADER = ["concept_id", "section_id", "default_template", "kind", "slug_en", "rank",
                  "importance", "cluster_id", "cluster_rank", "slots", "register", "notes"]
EN_HEADER = ["concept_id", "text", "text_alt", "ipa", "literal", "confidence", "provenance"]

# Colour encodes the block a panel belongs to, the way the reference sheet used it,
# so a section's role follows its group. Two agents picked `stay` for a `building`
# section and one picked `stay` for a `social` one; both flagged it themselves.
GROUP_ROLE = {"social": "comm", "building": "move", "hotel": "stay", "travel": "move",
              "numbers": "money", "emergency": "alert", "hike": "move"}

# Sections that are NOT on the default sheet. Everything already in the corpus is,
# and stays that way, so the default card keeps reproducing the hand-built
# originals. These are the additions a traveler either needs once (border, SIM),
# or only if it applies to them (children, accessibility, chronic medication), or
# only for a specific trip (weather, laundry). All remain one click away, and the
# onboarding quiz turns them on from `audience_tags`.
DEFAULT_OFF = {"medical-conditions", "border-customs", "sim-data", "accessibility",
               "children", "weather", "laundry"}

# Concepts the expansion supersedes. Keeping both would print the same phrase twice
# on any sheet carrying both sections, and clusters are section-scoped so the
# balancer cannot catch it. Both were flagged by the agents that created the
# overlap.
RETIRE = {
    "in-a-building.where-is-the-restroom": "toilets.where-toilet",
    "trail-landmarks.restroom": "toilets.toilet-wc",
}
# Proposed items dropped for duplicating something that already exists.
DROP = {"weather.sunset"}


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
        w = csv.DictWriter(fh, fieldnames=header, lineterminator="\r\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def nfc(s):
    return unicodedata.normalize("NFC", s or "")


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("proposals", nargs="+")
    args = ap.parse_args(argv[1:])

    sections = read("registry/sections.csv")
    by_id = {s["section_id"]: s for s in sections}
    groups = sorted({s["group"] for s in sections})
    concepts = {g: read(f"concepts/{g}.csv") for g in groups}
    existing_ids = {c["concept_id"] for rows in concepts.values() for c in rows}

    new_sections, new_items = [], []
    for path in args.proposals:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
        new_sections += doc.get("sections", [])
        new_items += doc.get("items", [])
    new_items = [it for it in new_items
                 if f"{it['section_id']}.{it['slug_en']}" not in DROP]

    errors = []
    for s in new_sections:
        if s["section_id"] in by_id:
            errors.append(f"section {s['section_id']} already exists")
        if s["group"] not in groups:
            errors.append(f"section {s['section_id']} names unknown group {s['group']}")
        if not (ROOT / "node_modules/lucide-static/icons" / f"{s['icon']}.svg").exists():
            errors.append(f"section {s['section_id']} names missing icon {s['icon']}")
    seen = set()
    for it in new_items:
        cid = f"{it['section_id']}.{it['slug_en']}"
        if cid in existing_ids:
            errors.append(f"concept {cid} already exists")
        if cid in seen:
            errors.append(f"concept {cid} proposed twice")
        seen.add(cid)
        if nfc(it["en"]) != it["en"]:
            errors.append(f"concept {cid} English text is not NFC")
        if it["en"].count("{}") != int(it["slots"]):
            errors.append(f"concept {cid} has {it['en'].count('{}')} slots but declares {it['slots']}")
    known = set(by_id) | {s["section_id"] for s in new_sections}
    for it in new_items:
        if it["section_id"] not in known:
            errors.append(f"concept {it['section_id']}.{it['slug_en']} names unknown section")
    if errors:
        for e in errors:
            print(f"error  {e}", file=sys.stderr)
        return 1

    # --- sections: place each new one directly after the section it names -----
    for s in sections:
        s.setdefault("default_on", "1")
        s["default_on"] = "1"
    ordered = sorted(sections, key=lambda z: int(z["rank"]))
    for s in new_sections:
        role = GROUP_ROLE.get(s["group"], s["color_role"])
        row = {
            "section_id": s["section_id"], "group": s["group"], "color_role": role,
            "default_level": str(s["default_level"]), "icon": s["icon"],
            "title_en": s["title_en"], "rank": "0", "scope": s.get("scope", "universal"),
            "audience_tags": s["audience_tags"],
            "importance": f"{float(s['importance']):.2f}",
            "default_on": "0" if s["section_id"] in DEFAULT_OFF else "1",
        }
        at = next((i for i, x in enumerate(ordered) if x["section_id"] == s["after"]), None)
        if at is None:
            print(f"error  section {s['section_id']} says after={s['after']}, which does not exist",
                  file=sys.stderr)
            return 1
        # After the named section and any new siblings already inserted behind it.
        while at + 1 < len(ordered) and ordered[at + 1].get("_new_after") == s["after"]:
            at += 1
        row["_new_after"] = s["after"]
        ordered.insert(at + 1, row)
    for i, s in enumerate(ordered, start=1):
        s["rank"] = str(i)
        s.pop("_new_after", None)
    write("registry/sections.csv", SECTION_HEADER, ordered)

    # --- concepts and English rows -------------------------------------------
    section_group = {s["section_id"]: s["group"] for s in ordered}
    en_rows = {g: read(f"lang/en/{g}.csv") for g in groups}
    next_rank = {}
    for g, rows in concepts.items():
        for c in rows:
            sid = c["section_id"]
            next_rank[sid] = max(next_rank.get(sid, 0), int(c["rank"]))

    added = 0
    for it in new_items:
        sid = it["section_id"]
        group = section_group[sid]
        cid = f"{sid}.{it['slug_en']}"
        next_rank[sid] = next_rank.get(sid, 0) + 1
        concepts[group].append({
            "concept_id": cid, "section_id": sid,
            "default_template": it["default_template"], "kind": it["kind"],
            "slug_en": it["slug_en"], "rank": str(next_rank[sid]),
            "importance": f"{float(it['importance']):.3f}",
            "cluster_id": f"{sid}.{it['cluster']}", "cluster_rank": str(it.get("cluster_rank", 0)),
            "slots": str(it["slots"]), "register": it.get("register", "neutral"),
            "notes": it.get("notes", ""),
        })
        en_rows[group].append({
            "concept_id": cid, "text": it["en"], "text_alt": "", "ipa": "",
            "literal": it.get("literal", ""), "confidence": str(it.get("confidence", 2)),
            "provenance": it.get("provenance", "expansion-v1"),
        })
        added += 1

    # --- retire superseded concepts everywhere they appear -------------------
    retired = 0
    for group in groups:
        before = len(concepts[group])
        concepts[group] = [c for c in concepts[group] if c["concept_id"] not in RETIRE]
        retired += before - len(concepts[group])
    for lang_dir in sorted(p.name for p in (DATA / "lang").iterdir() if p.is_dir()):
        for group in groups:
            rel = f"lang/{lang_dir}/{group}.csv"
            rows = read(rel)
            if not rows:
                continue
            kept = [r for r in rows if r["concept_id"] not in RETIRE]
            if len(kept) != len(rows):
                write(rel, list(rows[0].keys()), kept)
    for rel in glob.glob(str(DATA / "respell/overrides/*.csv")):
        rows = read(f"respell/overrides/{os.path.basename(rel)}")
        kept = [r for r in rows if r["concept_id"] not in RETIRE]
        if rows and len(kept) != len(rows):
            write(f"respell/overrides/{os.path.basename(rel)}", list(rows[0].keys()), kept)

    # The English rows were read before the retirement above, so drop the retired
    # ids here too or the final write puts them back and the validator reports an
    # orphan.
    for group in groups:
        en_rows[group] = [r for r in en_rows[group] if r["concept_id"] not in RETIRE]

    for group in groups:
        concepts[group].sort(key=lambda c: (int(by_id.get(c["section_id"], {}).get("rank", 0)
                                                if c["section_id"] in by_id else 0),
                                            int(c["rank"])))
        write(f"concepts/{group}.csv", CONCEPT_HEADER, concepts[group])
        write(f"lang/en/{group}.csv", EN_HEADER, en_rows[group])

    total = sum(len(rows) for rows in concepts.values())
    print(f"{len(new_sections)} new sections, {added} new concepts, {retired} retired")
    print(f"{len(ordered)} sections, {total} concepts")
    print(f"default-off sections: {', '.join(sorted(DEFAULT_OFF))}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
