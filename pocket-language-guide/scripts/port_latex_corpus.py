#!/usr/bin/env python3
"""Port the hand-verified Mandarin corpus out of the reference XeLaTeX source.

Reads the `.tex` body and writes the normalised corpus:

  data/concepts/<group>.csv                     language-independent concepts
  data/lang/zh-Hans/<group>.csv                 Hanzi + Pinyin
  data/lang/en/<group>.csv                      English renderings
  data/respell/overrides/zh-Hans__en__en-US.csv curated "nee how" respellings

Run once to seed; kept in the tree because it documents provenance of every row.

  python3 scripts/port_latex_corpus.py path/to/reference.tex
"""
import csv
import sys
from pathlib import Path

from latex_corpus import (
    BLANK, cluster_key, kind_of, parse, register_of, resolve_title, slugify,
)

ROOT = Path(__file__).resolve().parent.parent


class _AliasedTitles(dict):
    """Title lookup that folds a sheet's renamed panels onto existing sections."""

    def __missing__(self, key):
        alias = resolve_title(key)
        if alias in self:
            return self[alias]
        raise KeyError(key)
def write_csv(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=header, lineterminator="\r\n")
        w.writeheader()
        w.writerows(rows)
    print(f"  {path.relative_to(ROOT)}  {len(rows)} rows")


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    tex = Path(argv[1]).read_text(encoding="utf-8")

    sections = list(csv.DictReader((ROOT / "data/registry/sections.csv").open(encoding="utf-8")))
    titles = {}
    for s in sections:
        if s["title_en"] in titles:
            raise SystemExit(f"duplicate section title: {s['title_en']}")
        titles[s["title_en"]] = s["section_id"]
    titles = _AliasedTitles(titles)
    meta = {s["section_id"]: s for s in sections}

    items = parse(tex, titles)
    if not items:
        raise SystemExit("parsed no items -- macro walk is broken")

    # Stable, readable, collision-free ids.
    seen = {}
    for it in items:
        base = slugify(it["gloss"] or it["roman"] or it["numeral"] or it["script"])
        key = f"{it['section']}.{base}"
        seen[key] = seen.get(key, 0) + 1
        it["concept_id"] = key if seen[key] == 1 else f"{key}-{seen[key]}"

    # Coverage clusters are scoped to the section: 'Hello' in greetings and
    # 'hello' elsewhere are not competing for the same slot.
    clusters = {}
    for it in items:
        ck = (it["section"], cluster_key(it["gloss"] or it["script"]))
        clusters.setdefault(ck, []).append(it)
    for (section, key), group in clusters.items():
        for n, it in enumerate(group):
            it["cluster_id"] = f"{section}.{slugify(key)}"
            it["cluster_rank"] = n

    by_group = {}
    for it in items:
        by_group.setdefault(meta[it["section"]]["group"], []).append(it)

    print("writing concepts + language files")
    concept_header = ["concept_id", "section_id", "default_template", "kind", "slug_en", "rank",
                      "importance", "cluster_id", "cluster_rank", "slots", "register", "notes"]
    zh_header = ["concept_id", "text", "text_alt", "romanization_pinyin", "ipa", "literal",
                 "confidence", "provenance"]
    en_header = ["concept_id", "text", "text_alt", "ipa", "literal", "confidence", "provenance"]
    respell = []

    for group, rows in sorted(by_group.items()):
        n_in_section = {}
        for it in rows:
            n_in_section[it["section"]] = n_in_section.get(it["section"], 0) + 1

        concepts, zh, en = [], [], []
        for it in rows:
            sec = meta[it["section"]]
            # Earlier items in a section were authored first; taper importance
            # gently across the section so the coverage solver has a gradient.
            span = max(1, n_in_section[it["section"]] - 1)
            taper = 1 - 0.25 * ((it["rank"] - 1) / span)
            slots = it["script"].count(BLANK) or it["gloss"].count(BLANK)
            concepts.append({
                "concept_id": it["concept_id"], "section_id": it["section"],
                "default_template": it["template"], "kind": kind_of(it["template"], it["gloss"]),
                "slug_en": slugify(it["gloss"] or it["script"]), "rank": it["rank"],
                "importance": f"{float(sec['importance']) * taper:.3f}",
                "cluster_id": it["cluster_id"], "cluster_rank": it["cluster_rank"],
                "slots": slots, "register": register_of(it["gloss"]), "notes": "",
            })
            is_note = it["template"] == "note"
            zh.append({
                "concept_id": it["concept_id"],
                "text": "" if is_note else it["script"], "text_alt": "",
                "romanization_pinyin": it["roman"], "ipa": "", "literal": "",
                "confidence": "2", "provenance": "latex-reference-v2",
            })
            en.append({
                "concept_id": it["concept_id"],
                "text": it["script"] if is_note else (it["gloss"] or it["numeral"]),
                "text_alt": "", "ipa": "", "literal": "",
                "confidence": "2", "provenance": "latex-reference-v2",
            })
            if it["say"]:
                respell.append({"concept_id": it["concept_id"], "respell": it["say"]})

        write_csv(ROOT / f"data/concepts/{group}.csv", concept_header, concepts)
        write_csv(ROOT / f"data/lang/zh-Hans/{group}.csv", zh_header, zh)
        write_csv(ROOT / f"data/lang/en/{group}.csv", en_header, en)

    write_csv(ROOT / "data/respell/overrides/zh-Hans__en__en-US.csv",
              ["concept_id", "respell"], respell)
    print(f"{len(items)} concepts across {len(by_group)} groups")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
