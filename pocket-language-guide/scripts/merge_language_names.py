#!/usr/bin/env python3
"""Collapse the concepts that hardcode a target language's name.

    python3 scripts/merge_language_names.py

The bank was seeded from a Mandarin sheet and then a Japanese one, and the phrases
that name the language itself came in twice -- once per sheet:

    communication.i-do-not-speak-chinese     "I do not speak Chinese"
    communication.i-do-not-speak-japanese    "I do not speak Japanese"

That is invisible while only those two languages exist, because each sheet carries
only its own. It stops being invisible the moment a third language arrives: the
Spanish sheet printed both, so it read "No hablo español -- I do not speak
Chinese" directly above "No hablo español -- I do not speak Japanese".

The gloss is what the *reader* sees, and the reader is the one holding the card, so
it does not need naming the language at all -- "I do not speak this language" is
both correct and universal. Each pair therefore becomes one concept.

The surviving concept takes each language's text from whichever member of the pair
that language actually authored: zh-Hans from the Chinese variant, ja from the
Japanese one, and for a language that translated both (they are identical in every
language that is neither) whichever is present.
"""
import csv
import glob
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# (new_id, new_section, new_slug, English gloss, {language: preferred old id}, [old ids])
MERGES = [
    ("communication.i-do-not-speak-this-language", "communication",
     "i-do-not-speak-this-language", "I do not speak this language",
     {"zh-Hans": "communication.i-do-not-speak-chinese",
      "ja": "communication.i-do-not-speak-japanese"},
     ["communication.i-do-not-speak-chinese", "communication.i-do-not-speak-japanese"]),

    ("communication.i-speak-only-a-little-of-this", "communication",
     "i-speak-only-a-little-of-this", "I speak only a little of this language",
     {"zh-Hans": "communication.i-speak-only-a-little-chinese",
      "ja": "communication.i-speak-only-a-little-japanese"},
     ["communication.i-speak-only-a-little-chinese",
      "communication.i-speak-only-a-little-japanese"]),

    ("communication.please-show-me-the-text", "communication",
     "please-show-me-the-text", "Please show me the text",
     {"zh-Hans": "communication.please-show-me-the-chinese-text",
      "ja": "communication.please-show-me-the-japanese-text"},
     ["communication.please-show-me-the-chinese-text",
      "communication.please-show-me-the-japanese-text"]),

    # These two arrived in different sections. `phone-translation` is the better
    # home: writing a place name down is what you do to show a driver.
    ("phone-translation.please-write-the-place-name", "phone-translation",
     "please-write-the-place-name", "Please write the place name here",
     {"zh-Hans": "phone-text-power.please-write-the-place-name-in-chinese",
      "ja": "phone-translation.please-write-the-place-name-in-japanese"},
     ["phone-text-power.please-write-the-place-name-in-chinese",
      "phone-translation.please-write-the-place-name-in-japanese"]),
]


def rows_of(path):
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def write(path, header, rows):
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=header, lineterminator="\r\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def main():
    sections = {r["section_id"]: r for r in rows_of(DATA / "registry/sections.csv")}
    groups = {s["section_id"]: s["group"] for s in sections.values()}

    # --- concepts -----------------------------------------------------------
    concept_files = {p: rows_of(p) for p in sorted((DATA / "concepts").glob("*.csv"))}
    by_id = {r["concept_id"]: r for rows in concept_files.values() for r in rows}
    missing = [old for *_, olds in MERGES for old in olds if old not in by_id]
    if missing:
        print(f"nothing to do: {len(missing)} of the ids are already gone", file=sys.stderr)
        return 0

    drop = set()
    for new_id, section, slug, _gloss, _prefer, olds in MERGES:
        survivor = by_id[olds[0]]
        survivor["concept_id"] = new_id
        survivor["section_id"] = section
        survivor["slug_en"] = slug
        survivor["cluster_id"] = f"{section}.{slug}"
        drop.update(olds[1:])
        # The survivor may be moving group, so re-file it.
        for path, rows in concept_files.items():
            if survivor in rows and path.stem != groups[section]:
                rows.remove(survivor)
                concept_files[DATA / f"concepts/{groups[section]}.csv"].append(survivor)
                break

    for path, rows in concept_files.items():
        kept = [r for r in rows if r["concept_id"] not in drop]
        kept.sort(key=lambda r: (int(sections[r["section_id"]]["rank"]), int(r["rank"])))
        write(path, list(rows[0].keys()), kept)

    # --- every language's rows ---------------------------------------------
    renames = {}
    for new_id, _s, _g, _gloss, prefer, olds in MERGES:
        renames[new_id] = (prefer, olds)

    for lang_dir in sorted(p for p in (DATA / "lang").iterdir() if p.is_dir()):
        code = lang_dir.name
        pool = {}
        header_of = {}
        files = {p: rows_of(p) for p in sorted(lang_dir.glob("*.csv"))}
        for path, rows in files.items():
            header_of[path] = list(rows[0].keys()) if rows else []
            for r in rows:
                pool[r["concept_id"]] = r
        moved = 0
        for new_id, (prefer, olds) in renames.items():
            want = prefer.get(code)
            source = pool.get(want) if want in pool else None
            if source is None:
                source = next((pool[o] for o in olds if o in pool), None)
            if source is None:
                continue
            source["concept_id"] = new_id
            if code == "en":
                gloss = next(g for n, _s, _g, g, _p, _o in MERGES if n == new_id)
                source["text"] = unicodedata.normalize("NFC", gloss)
            moved += 1
        # Re-file into the group the survivor now belongs to, and drop the losers.
        target_group = {n: groups[s] for n, s, *_ in MERGES}
        # Every old id, not just the ones the concept bank dropped: whichever member
        # of the pair this language kept has already been renamed, so any row still
        # carrying an old id is the other member and has to go. Dropping only the
        # bank's losers left the Chinese variant behind in the Japanese pack, which
        # the validator caught as an orphan.
        stale = {old for _p, olds in renames.values() for old in olds}
        for path, rows in files.items():
            kept = []
            for r in rows:
                if r["concept_id"] in stale:
                    continue
                if r["concept_id"] in target_group and path.stem != target_group[r["concept_id"]]:
                    continue
                kept.append(r)
            write(path, header_of[path], kept)
        # Anything that needs to move into a different file.
        for new_id, group in target_group.items():
            row = pool.get(new_id)
            if row is None:
                continue
            dest = lang_dir / f"{group}.csv"
            rows = rows_of(dest)
            if any(r["concept_id"] == new_id for r in rows):
                continue
            rows.append(row)
            write(dest, list(rows[0].keys()), rows)
        print(f"  lang/{code}: {moved} merged")

    # --- respell overrides --------------------------------------------------
    for path in sorted((DATA / "respell/overrides").glob("*.csv")):
        rows = rows_of(path)
        if not rows:
            continue
        code = path.name.split("__")[0]
        for new_id, (prefer, olds) in renames.items():
            want = prefer.get(code)
            hit = next((r for r in rows if r["concept_id"] == want), None) \
                or next((r for r in rows if r["concept_id"] in olds), None)
            if hit:
                hit["concept_id"] = new_id
        stale = {old for _p, olds in renames.values() for old in olds}
        write(path, list(rows[0].keys()), [r for r in rows if r["concept_id"] not in stale])

    print(f"{len(MERGES)} pairs collapsed, {len(drop)} concepts retired")
    return 0


if __name__ == "__main__":
    sys.exit(main())
