"""A confidence score for every phrase row, and the rows most worth a reader's audit.

  python3 scripts/confidence_report.py           writes tmp/out/confidence/
  python3 scripts/confidence_report.py --only ja

Nothing here ships: the app carries a row's `confidence` and `provenance`, and this
reads them back, with a few patterns the correction passes kept finding errors behind,
into a score from 0 to 100 per row. It is a triage list for a fluent reader, not a
verdict -- a high score means the row's record is strong, not that the row is right.

The score starts from the row's own `confidence` (what its research agent claimed) and
gains for a cited source and for a correction pass that checked it. It loses for:

- **a shared text**: the same text as another concept of the pack whose English differs
  ("a receipt, please" written as "the bill, please"), the commonest real error found;
- **an English text** in a pack that is not English, of more than one word (one word
  the same as English is usually a loan: *Taxi*, *Hotel*);
- **no IPA** on a row that should have one.

Where `tmp/out/crosscheck/<code>.csv` holds a cross-check against an open phrasebook
(`concept_id,app_text,reference_text,verdict,reason`, written by a research pass), a row
the reference agrees with gains and one it disagrees with loses, with the reference's
wording as the reason.

Writes `summary.md` (per language: rows, mean score, how many fall below 50, flag
counts) and `<code>.csv` (that pack's rows below 60, lowest first, with the reasons).
"""
import csv
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "tmp/out/confidence"
BASE = {"0": 20, "1": 40, "2": 60, "3": 80}
# Morse rows are signals, not sentences; templates and prose notes are not said.
UNSAID = ("morse-code.",)


def rows(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def pack(code):
    """concept_id -> row, the base rows of one language."""
    out = {}
    for path in sorted((DATA / f"lang/{code}").glob("*.csv")):
        if path.name != "variants.csv":
            out.update({r["concept_id"]: r for r in rows(path) if r.get("text")})
    return out


def bare(text):
    # Letters, marks and digits, private-use ones too (pIqaD and Tengwar), as words.
    kept = "".join(ch if unicodedata.category(ch)[0] in "LMN" or unicodedata.category(ch) == "Co" else " "
                   for ch in text.casefold())
    return " ".join(kept.split())


def cited(provenance):
    # A named source: a citation in parentheses, or a tag that names one.
    return bool(re.search(r"\(|\b(fix|src|lex|grammar|cldr|dict|source)=", provenance))


def checked(code):
    """concept_id -> (verdict, reference text), from a cross-check where there is one."""
    path = ROOT / f"tmp/out/crosscheck/{code}.csv"
    return {r["concept_id"]: (r["verdict"], r["reference_text"]) for r in rows(path)} if path.exists() else {}


def score(code, english):
    found = pack(code)
    reference = checked(code)
    by_text = defaultdict(set)
    for cid, r in found.items():
        by_text[bare(r["text"])].add(cid)
    scored = []
    for cid, r in found.items():
        if cid.startswith(UNSAID):
            continue
        prov = r.get("provenance") or ""
        value = BASE.get(r.get("confidence", "2"), 60)
        reasons = []
        if cited(prov):
            value += 10
        if "row-corrections" in prov or "reviewed" in prov:
            value += 10
        twins = [t for t in by_text[bare(r["text"])] - {cid}
                 if bare(english.get(t, "")) != bare(english.get(cid, ""))]
        if twins:
            value -= 15
            reasons.append(f"shares its text with {', '.join(sorted(twins)[:3])}")
        if code != "en" and bare(r["text"]) == bare(english.get(cid, "")) and " " in bare(r["text"]):
            value -= 10
            reasons.append("same text as English")
        if not r.get("ipa"):
            value -= 5
            reasons.append("no IPA")
        verdict, said = reference.get(cid, ("", ""))
        if verdict == "agree":
            value += 10
        elif verdict == "disagree":
            value -= 15
            reasons.append(f"the phrasebook says {said!r}")
        roman = next((v for k, v in r.items() if k.startswith("romanization") and v), "")
        scored.append((max(0, min(100, value)), cid, r["text"], roman, english.get(cid, ""), r.get("confidence", ""), reasons))
    return sorted(scored)


def main():
    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
    english = {cid: r["text"] for cid, r in pack("en").items()}
    codes = sorted(p.name for p in (DATA / "lang").iterdir() if p.is_dir() and p.name != "morse")
    OUT.mkdir(parents=True, exist_ok=True)
    lines = ["| language | rows | mean | below 50 | shared text | English text | no IPA |", "|---|---|---|---|---|---|---|"]
    for code in only or codes:
        scored = score(code, english)
        flags = Counter(reason.split(" with ")[0] for *_, reasons in scored for reason in reasons)
        mean = sum(s for s, *_ in scored) / len(scored)
        lines.append(f"| {code} | {len(scored)} | {mean:.0f} | {sum(s < 50 for s, *_ in scored)} | "
                     f"{flags['shares its text']} | {flags['same text as English']} | {flags['no IPA']} |")
        with open(OUT / f"{code}.csv", "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["score", "concept_id", "text", "romanization", "english", "confidence", "reasons"])
            for s, cid, text, roman, en, conf, reasons in scored:
                if s < 60:
                    w.writerow([s, cid, text, roman, en, conf, "; ".join(reasons)])
    (OUT / "summary.md").write_text("# Row confidence\n\n" + "\n".join(lines) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(only or codes)} languages")


if __name__ == "__main__":
    main()
