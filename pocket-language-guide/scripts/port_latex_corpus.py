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
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BLANK = "{}"

# Table macro -> item template. The reference has eight `\reftable*` variants
# that differ only in hand-tuned column widths, which the engine now solves, so
# they all collapse to one template; the phrase-sized ones keep their larger scale.
TABLE_TEMPLATES = {
    "reftable": "ref", "reftablenohead": "ref", "reftabledense": "ref",
    "reftabletime": "ref", "reftablerail": "ref", "reftableloose": "ref",
    "reftablerailloose": "ref", "reftablephrase": "refphrase", "phrasegrid": "refphrase",
    "numbertable": "num",
}


def read_args(text, pos, count):
    """Read `count` brace-delimited macro arguments starting at `pos`."""
    args = []
    for _ in range(count):
        while pos < len(text) and text[pos] in " \t\n%":
            pos += 1
        if pos >= len(text) or text[pos] != "{":
            raise ValueError(f"expected '{{' at offset {pos}: {text[pos:pos+40]!r}")
        depth, start = 0, pos
        while pos < len(text):
            if text[pos] == "{":
                depth += 1
            elif text[pos] == "}":
                depth -= 1
                if depth == 0:
                    break
            pos += 1
        args.append(text[start + 1:pos])
        pos += 1
    return args, pos


def clean(s):
    """Strip the reference's TeX-isms down to plain text plus a `{}` slot token."""
    s = s.replace("\\Blank{}", BLANK).replace("\\Blank", BLANK)
    s = re.sub(r"\\thinspacebullet", " \u2022 ", s)
    s = re.sub(r"\\(?:textbf|textit|emph)\{([^}]*)\}", r"\1", s)
    s = re.sub(r"\\color\{[^}]*\}", "", s)
    s = re.sub(r"\\[a-zA-Z]+\s*", "", s)
    s = s.replace("~", " ").replace("\\%", "%").replace("\\&", "&")
    s = re.sub(r"\s*\.\.\.\s*", f" {BLANK} ", s)
    s = re.sub(r"[ \t\n]+", " ", s).strip()
    return unicodedata.normalize("NFC", s)


def slugify(text):
    s = text.replace(BLANK, "").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "item"


def cluster_key(gloss):
    """Collapse near-duplicate glosses so the coverage model can discount them.

    'Hello' and 'Hello (polite)' land in one cluster: including both adds little
    coverage even though each is individually important.
    """
    s = gloss.lower()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = s.replace(BLANK, " ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s or "misc"


def register_of(gloss):
    g = gloss.lower()
    if "polite" in g or "formal" in g:
        return "polite"
    if "spoken" in g or "casual" in g:
        return "casual"
    return "neutral"


def parse(tex, titles):
    """Walk the body in document order, emitting one record per item."""
    body = tex[tex.index("\\begin{document}"):]
    items = []           # flat, ordered
    section = None
    rank_by_section = {}

    macro = re.compile(r"\\([a-zA-Z]+)")
    pos = 0
    while True:
        m = macro.search(body, pos)
        if not m:
            break
        name, pos = m.group(1), m.end()

        if name in ("sectionhead", "minihead"):
            args, pos = read_args(body, pos, 3)
            section = titles[clean(args[2])]
        elif name == "subhead":
            args, pos = read_args(body, pos, 2)
            section = titles[clean(args[1])]
        elif name in ("entry", "compactentry", "vocabentry"):
            args, pos = read_args(body, pos, 5)
            _, script, roman, gloss, say = (clean(a) for a in args)
            rank_by_section[section] = rank_by_section.get(section, 0) + 1
            items.append(dict(section=section, template="entry", rank=rank_by_section[section],
                              numeral="", script=script, roman=roman, gloss=gloss, say=say))
        elif name == "routeitem":
            args, pos = read_args(body, pos, 4)
            script, roman, gloss, say = (clean(a) for a in args)
            rank_by_section[section] = rank_by_section.get(section, 0) + 1
            items.append(dict(section=section, template="entry", rank=rank_by_section[section],
                              numeral="", script=script, roman=roman, gloss=gloss, say=say))
        elif name in TABLE_TEMPLATES:
            template = TABLE_TEMPLATES[name]
            nargs = 1 if name == "numbertable" else 2
            args, pos = read_args(body, pos, nargs)
            inner = args[-1]
            for row in re.finditer(r"\\(refrowdense|refrow|numrow)", inner):
                cells, _ = read_args(inner, row.end(), 4)
                a, b, c, d = (clean(x) for x in cells)
                rank_by_section[section] = rank_by_section.get(section, 0) + 1
                if row.group(1) == "numrow":
                    rec = dict(numeral=a, script=b, roman=c, gloss="", say=d)
                else:
                    rec = dict(numeral="", script=a, roman=b, gloss=c, say=d)
                items.append(dict(section=section, template=template,
                                  rank=rank_by_section[section], **rec))
        elif name == "numbernote":
            rank_by_section[section] = rank_by_section.get(section, 0) + 1
            items.append(dict(section=section, template="note", rank=rank_by_section[section],
                              numeral="", roman="", say="", gloss="Number and classifier notes",
                              script=NUMBER_NOTE))
        # Everything else (\colbox, \begin, \sectionsep, \columnbreak, ...) is
        # layout, and its arguments hold items we still want to walk into, so we
        # deliberately consume nothing and keep scanning.
    return items


# The reference renders this as a shaded prose block. Kept as plain text: the
# inline bold/italic of the original is presentation, not content.
NUMBER_NOTE = (
    "Build numbers: 11 十一 shíyī; 20 二十 èrshí; 21 二十一 èrshíyī. "
    "Phone numbers: 1 is often 幺 yāo. "
    "Common classifiers: 个 ge general; 位 wèi people; 张 zhāng tickets / flat objects; "
    "杯 bēi cups; 瓶 píng bottles. 角 / 毛 jiǎo / máo = 0.1 yuan; 分 fēn = 0.01 yuan."
)


def kind_of(template, gloss):
    if template == "note":
        return "note"
    if template == "num":
        return "number"
    if BLANK in gloss:
        return "template"
    if template == "entry" or gloss.endswith("?") or len(gloss.split()) > 3:
        return "phrase"
    return "word"


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
