#!/usr/bin/env python3
"""Reading the reference XeLaTeX cheat sheets.

Both the initial seed (port_latex_corpus.py) and each additional language
(port_language.py) read the same document shape, so the parser lives here rather
than in either of them.
"""
import re
import unicodedata

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




# A sheet's heading text is not a stable key: the Japanese edition renamed two
# panels while covering the same ground, so those titles are mapped onto the
# sections that already exist rather than creating near-duplicates.
TITLE_ALIASES = {
    "Phone + power": "Phone, text + power",
    "Core travel patterns": "Core words + patterns",
    "Pronouns + core verbs": "Core words + patterns",
}


def resolve_title(title):
    return TITLE_ALIASES.get(title, title)
