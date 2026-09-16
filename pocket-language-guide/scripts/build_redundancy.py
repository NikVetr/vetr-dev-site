#!/usr/bin/env python3
"""Build and check `data/registry/redundancy.csv`, the sparse concept-redundancy table.

    python3 scripts/build_redundancy.py --stats       # the measurement, no files touched
    python3 scripts/build_redundancy.py               # aggregate the passes, write the table
    python3 scripts/build_redundancy.py --check       # verify the committed table is current
    python3 scripts/build_redundancy.py --worksheet toilets,emergency-medical

**What this is for.** When a card is small the app has to choose which of 861
concepts to print, and two of them can answer the same need. `cluster_id` says so
today, but only one way: a flat, disjoint group per concept, so it cannot say that
`toilets.the-toilet-will-not-flush` and `room-problems.the-toilet-will-not-flush`
are the *same sentence in two sections*, and it cannot say that two members of one
cluster are opposites rather than substitutes. This table is the relation
`cluster_id` cannot express: a sparse, symmetric, ternary edge list over pairs.

**Sparse, because the relation is.** 861 concepts make 370,230 unordered pairs and
almost every one of them is two unrelated facts -- "Where is the toilet?" and "I am
allergic to penicillin" share nothing, and no scorer needs to be told so. Storing
the zeros would be 370,230 rows to say nothing 369,000 times.

**Ternary, because that is all a judge can produce and all the scorer can use.**
`none` / `partial` / `duplicate` become keep-factors 1 / 0.7 / 0.35 in
`core/solve/weights.js`. Run `--stats`: the unreliable judgement is whether a
relation exists at all, not how strong it is, so subdividing the strength further
would be measuring under a gate that is itself only moderately reliable. The scorer
could not use it either -- it compares value-per-point ratios between candidates
whose `importance` steps by about 0.02, so a factor of two moves a decision and a
fifth of a level does not.

**Independent passes, aggregated.** One judge is one judge.
`data/registry/redundancy-ratings/passes.csv` holds every raw judgement, one row per
(pass, pair). This script takes the per-pair median and records how many passes
agreed with it. Nothing here invents a rating: a pair absent from the passes file
is unrated, and stays absent.

## What the committed table contains

Every rated pair whose relation **differs from what `cluster_id` alone would say**.
That is: every non-`none` pair, plus the same-cluster pairs the raters called
`none` -- those need a row precisely because the scorer's fallback for an unrated
same-cluster pair is the old flat cluster decay, and without the row it would keep
discounting a pair three judges said was not redundant. Everything else is
recoverable from `cluster_id`, so storing it would be storing a copy.

## The candidate set

Rating 370,230 pairs is not on. The filter below cuts it to about 3% without
throwing away anything the relation plausibly lives in:

  * **Every within-section pair, unfiltered.** Sections are the corpus's own
    topical partition and redundancy is overwhelmingly topical. No similarity gate
    here, because lexical similarity has poor recall on pairs we already know are
    redundant -- only 24% of same-`cluster_id` pairs reach Jaccard 0.3 ("It is out
    of order" / "out of order" scores well; "Is it free?" / "Do I need a coin or
    token?" scores zero).
  * **Cross-section pairs that share wording.** Either token Jaccard >= 0.30 over
    the English gloss and slug, or one shared content token rare enough in the
    corpus (document frequency <= 4) to be a topic rather than grammar.

The second gate is the one that could be wrong, so the worksheet mixes in a random
sample of *excluded* pairs as a negative control and the raters are not told which
is which. If the controls come back unrelated, the filter is sound; `--stats`
prints the rate.
"""
import argparse
import collections
import csv
import itertools
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
TABLE = DATA / "registry/redundancy.csv"
# Deliberately in a subdirectory `scripts/build_shell.mjs` does not scan: these are
# the raw judgements, an input to the table and not to the app. At full coverage
# they would be about 34,000 rows, which is no use to a browser and half a megabyte
# of an offline shell.
PASSES = DATA / "registry/redundancy-ratings/passes.csv"

# CRLF, like data/registry/sections.csv and roles.csv and what core/csv.js writes.
# Set on the writer, not on `open`, or the translation layer doubles every CR.
NEWLINE = "\r\n"

RELATIONS = ("none", "partial", "duplicate")

# Grammar, not topic. Two phrases sharing only these share nothing.
STOPWORDS = set("a an the is are it i you my me of to for in on at do does can may "
                "there this that be will not no with have has".split())

# A token this common is a section of the corpus, not a subject: `toilet` is in 25
# rows and joining on it inside `toilets` is free, but joining two sections on
# `please` is noise.
MAX_DF = 60
MIN_JACCARD = 0.30
RARE_DF = 4

# The instruction every rating pass is given, verbatim, so that a later pass is
# comparable with the ones already in `redundancy-ratings/passes.csv`. Printed above the
# worksheet rather than kept in a prompt file for the same reason the thresholds
# above are constants here: the rubric is an input to the data, and data that came
# from a rubric nobody kept is not reproducible.
RUBRIC = """\
Rate pairs of phrases from a printed pocket phrasebook card for REDUNDANCY. Rate
independently: do not consult another rater's answers.

The card is small and cannot hold everything. For each pair ask: **if the card
already prints A, how much does also printing B add?**

  0  independent. Different need. A traveller who has A still fully needs B. This
     INCLUDES pairs that share a topic but are complementary: opposites ("drinking
     water" / "not for drinking"), a question and a different question about the
     same thing, a general word and a different specific one. Topic overlap alone
     is not redundancy.
  1  partial substitute. Overlapping need. Having A makes B noticeably less useful
     and a traveller in a hurry could get by with one -- but B still buys something
     real: a different situation, a narrower case, a different register, or a bare
     word versus a whole sentence.
  2  near-duplicate. Substitutes. If the card has A, B adds almost nothing: same
     need, same situation. Restatements, two wordings of one request, the same
     sentence filed under two different sections, a polite/casual variant of the
     same thing.

Guidance:
  - Judge the traveller's NEED, not string similarity. Two sentences sharing five
    words can be 0; two sharing none can be 2.
  - 2 is meant to be rare. Most pairs are 0.
  - A bare word and a full phrase built on it ("toilet paper" / "There is no toilet
    paper") are usually 1, not 2: one is for pointing at a shelf, the other for
    reporting a problem.
  - Safety items each do a different job even inside one emergency: "Help!",
    "Please call an ambulance", "I am allergic to penicillin" are not duplicates of
    each other merely because they are all emergencies. Be conservative about
    marking safety phrases redundant.
  - The relation is symmetric; ignore which side is A and which is B.
  - Some pairs will look obviously unrelated. Rate them 0 and move on; they are
    there on purpose.

Answer with one line per pair, `<index><TAB><0|1|2>`, for every index in order.\
"""


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def load_concepts():
    """concept_id -> {section_id, cluster_id, gloss, tokens}, in corpus order."""
    english = {}
    for path in sorted((DATA / "lang/en").glob("*.csv")):
        for row in read_csv(path):
            english[row["concept_id"]] = row["text"]
    out = {}
    for path in sorted((DATA / "concepts").glob("*.csv")):
        for row in read_csv(path):
            cid = row["concept_id"]
            text = f"{english.get(cid, '')} {row['slug_en'].replace('-', ' ')}".lower()
            words = re.sub(r"[^a-z0-9' ]", " ", text).split()
            out[cid] = {
                "section_id": row["section_id"],
                "cluster_id": row["cluster_id"],
                "gloss": english.get(cid, ""),
                "tokens": {w for w in words if len(w) > 1 and w not in STOPWORDS},
            }
    return out


def candidates(concepts):
    """The pairs worth rating, as a sorted list of canonical (a, b) tuples."""
    frequency = collections.Counter(
        w for c in concepts.values() for w in c["tokens"])
    postings = collections.defaultdict(list)
    for cid, c in concepts.items():
        for w in c["tokens"]:
            if frequency[w] <= MAX_DF:
                postings[w].append(cid)

    pairs = set()
    for members in group_by(concepts, "section_id").values():
        pairs.update(itertools.combinations(sorted(members), 2))
    for word, ids in postings.items():
        for a, b in itertools.combinations(sorted(ids), 2):
            if concepts[a]["section_id"] == concepts[b]["section_id"]:
                continue
            shared = concepts[a]["tokens"] & concepts[b]["tokens"]
            union = concepts[a]["tokens"] | concepts[b]["tokens"]
            if len(shared) / len(union) >= MIN_JACCARD or frequency[word] <= RARE_DF:
                pairs.add((a, b))
    return sorted(pairs)


def group_by(concepts, field):
    out = collections.defaultdict(list)
    for cid, c in concepts.items():
        out[c[field]].append(cid)
    return out


def aggregate(rows):
    """(a, b) -> (relation, passes, agree). Median of the passes; ties round down.

    Median rather than mean or majority: on a three-value ordinal scale it is the
    majority whenever two of three judges agree, and when all three disagree
    (none / partial / duplicate) it returns the middle rather than the first-listed,
    which is the answer a fourth judge is likeliest to give.
    """
    by_pair = collections.defaultdict(list)
    for row in rows:
        by_pair[(row["concept_a"], row["concept_b"])].append(
            RELATIONS.index(row["relation"]))
    out = {}
    for pair, scores in by_pair.items():
        scores.sort()
        level = scores[(len(scores) - 1) // 2]
        out[pair] = (RELATIONS[level], len(scores), scores.count(level))
    return out


def build_table(concepts, verdicts):
    """The rows to commit: every rated pair `cluster_id` alone would get wrong."""
    rows = []
    for (a, b), (relation, passes, agree) in sorted(verdicts.items()):
        same_cluster = concepts[a]["cluster_id"] == concepts[b]["cluster_id"]
        if relation == "none" and not same_cluster:
            continue
        rows.append({"concept_a": a, "concept_b": b, "relation": relation,
                     "passes": str(passes), "agree": str(agree)})
    return rows


def write_table(rows):
    header = ["concept_a", "concept_b", "relation", "passes", "agree"]
    with TABLE.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, header, lineterminator=NEWLINE)
        writer.writeheader()
        writer.writerows(rows)


def worksheet(concepts, pairs, section_ids, controls, seed):
    """The rating sheet for one pilot: candidates touching `section_ids`, plus
    controls drawn from the pairs the filter threw away, shuffled together so a
    judge cannot tell one from the other."""
    wanted = [p for p in pairs
              if concepts[p[0]]["section_id"] in section_ids
              or concepts[p[1]]["section_id"] in section_ids]
    rng = random.Random(seed)
    excluded = set()
    ids = sorted(concepts)
    candidate_set = set(pairs)
    while len(excluded) < controls:
        a, b = sorted(rng.sample(ids, 2))
        if (a, b) not in candidate_set:
            excluded.add((a, b))
    sheet = wanted + sorted(excluded)
    rng.shuffle(sheet)
    lines = []
    for n, (a, b) in enumerate(sheet, start=1):
        lines.append(f"{n}\tA: {concepts[a]['gloss']}  [{concepts[a]['section_id']}]"
                     f"\tB: {concepts[b]['gloss']}  [{concepts[b]['section_id']}]")
    return sheet, lines


def ingest(sheet, answer_files):
    """Turn `<index>\\t<0|1|2>` answer files into rows of the passes table.

    The index is the worksheet's, so the same `--worksheet` arguments that produced
    the sheet have to be given again here: that is what ties an answer back to a
    pair, and it is why the shuffle is seeded.
    """
    rows = []
    for number, path in enumerate(answer_files, start=1):
        answers = {}
        for line in Path(path).read_text(encoding="utf-8").splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            index, _, rating = line.partition("\t")
            index, rating = int(index.strip()), rating.strip()
            if rating not in "012" or not rating:
                sys.exit(f"{path}:{index}: {rating!r} is not 0, 1 or 2")
            if index in answers:
                sys.exit(f"{path}: index {index} answered twice")
            answers[index] = int(rating)
        missing = set(range(1, len(sheet) + 1)) - set(answers)
        if missing:
            sys.exit(f"{path}: {len(missing)} of {len(sheet)} indices unanswered, "
                     f"first {min(missing)} -- an unrated pair may not be guessed")
        for index, (a, b) in enumerate(sheet, start=1):
            rows.append({"pass": str(number), "concept_a": a, "concept_b": b,
                         "relation": RELATIONS[answers[index]]})
    return rows


def merge_passes(fresh, sheet):
    """`fresh` replaces every judgement on a pair this worksheet covered; anything
    rated by an earlier pilot on other pairs is kept."""
    covered = set(sheet)
    kept = [r for r in (read_csv(PASSES) if PASSES.exists() else [])
            if (r["concept_a"], r["concept_b"]) not in covered]
    rows = kept + fresh
    rows.sort(key=lambda r: (r["concept_a"], r["concept_b"], int(r["pass"])))
    header = ["pass", "concept_a", "concept_b", "relation"]
    with PASSES.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, header, lineterminator=NEWLINE)
        writer.writeheader()
        writer.writerows(rows)
    return rows


def stats(concepts, pairs, rows, verdicts):
    total = len(concepts) * (len(concepts) - 1) // 2
    cross = [p for p in pairs
             if concepts[p[0]]["section_id"] != concepts[p[1]]["section_id"]]
    print(f"{len(concepts)} concepts, {total} unordered pairs")
    print(f"candidate set {len(pairs)} ({100 * len(pairs) / total:.2f}%): "
          f"{len(pairs) - len(cross)} within-section, {len(cross)} cross-section")
    if not verdicts:
        return
    rated = len(verdicts)
    real = {p: v for p, v in verdicts.items() if v[0] != "none"}
    cross_cluster = [p for p in real
                     if concepts[p[0]]["cluster_id"] != concepts[p[1]]["cluster_id"]]
    cross_section = [p for p in real
                     if concepts[p[0]]["section_id"] != concepts[p[1]]["section_id"]]
    unanimous = sum(1 for v in verdicts.values() if v[2] == v[1])
    passes = max(v[1] for v in verdicts.values())
    # The negative controls: pairs the candidate filter threw away, rated anyway and
    # shuffled in so the judges could not tell. Every one that comes back related is
    # a relation the filter would have missed, so this is the filter's own error rate.
    controls = [p for p in verdicts if p not in set(pairs)]
    missed = [p for p in controls if verdicts[p][0] != "none"]
    print(f"rated {rated} pairs over {passes} independent passes")
    if controls:
        print(f"  filter controls {len(missed)} of {len(controls)} pairs from outside "
              "the candidate set came back related")
    print(f"  real relations  {len(real)} ({100 * len(real) / rated:.1f}% of rated): "
          + ", ".join(f"{r} {sum(1 for v in real.values() if v[0] == r)}"
                      for r in RELATIONS[1:]))
    print(f"  cross-cluster   {len(cross_cluster)} of {len(real)} "
          f"({100 * len(cross_cluster) / max(1, len(real)):.1f}%) -- what cluster_id "
          "cannot express")
    print(f"  cross-section   {len(cross_section)} of {len(real)} "
          f"({100 * len(cross_section) / max(1, len(real)):.1f}%)")
    print(f"  disagreement    {rated - unanimous} of {rated} pairs "
          f"({100 * (rated - unanimous) / rated:.1f}%) were not unanimous")
    split = sum(1 for v in verdicts.values() if v[2] * 2 <= v[1])
    print(f"  no majority     {split} of {rated} ({100 * split / rated:.1f}%)")
    # Whether the relation survives the binary question, which is the one the
    # scorer's shape depends on. Disagreement about `partial` vs `duplicate` costs
    # a factor of two; disagreement about whether there is a relation at all costs
    # the whole model.
    binary = 0
    by_pair = collections.defaultdict(list)
    for row in rows:
        by_pair[(row["concept_a"], row["concept_b"])].append(row["relation"])
    for scores in by_pair.values():
        if len({s == "none" for s in scores}) > 1:
            binary += 1
    print(f"  related-or-not  {binary} of {rated} ({100 * binary / rated:.1f}%) "
          "split on whether any relation exists at all")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true",
                    help="verify the committed table matches the passes file")
    ap.add_argument("--stats", action="store_true", help="print the measurement only")
    ap.add_argument("--worksheet", metavar="SECTIONS",
                    help="emit a rating sheet for these comma-separated sections")
    ap.add_argument("--ingest", nargs="+", metavar="ANSWERS",
                    help="one answer file per independent pass, for the --worksheet "
                         "given (same sections, controls and seed)")
    ap.add_argument("--controls", type=int, default=100,
                    help="negative controls to mix into the worksheet")
    ap.add_argument("--seed", type=int, default=20260915)
    args = ap.parse_args()

    concepts = load_concepts()
    pairs = candidates(concepts)

    if args.worksheet:
        sections = set(args.worksheet.split(","))
        unknown = sections - {c["section_id"] for c in concepts.values()}
        if unknown:
            sys.exit(f"unknown section(s): {', '.join(sorted(unknown))}")
        sheet, lines = worksheet(concepts, pairs, sections, args.controls, args.seed)
        if not args.ingest:
            print("\n".join(f"# {line}".rstrip() for line in RUBRIC.splitlines()))
            print("#")
            print("\n".join(lines))
            print(f"\n# {len(sheet)} pairs", file=sys.stderr)
            return 0
        if len(args.ingest) < 2:
            sys.exit("one judge is one judge: give at least two answer files")
        merge_passes(ingest(sheet, args.ingest), sheet)
        print(f"{PASSES.relative_to(ROOT)}: {len(sheet)} pairs "
              f"x {len(args.ingest)} passes")
    elif args.ingest:
        sys.exit("--ingest needs the --worksheet it was rated against")

    rows = read_csv(PASSES) if PASSES.exists() else []
    for n, row in enumerate(rows, start=2):
        if row["relation"] not in RELATIONS:
            sys.exit(f"{PASSES.name}:{n}: {row['relation']!r} is not a relation")
        if row["concept_a"] not in concepts or row["concept_b"] not in concepts:
            sys.exit(f"{PASSES.name}:{n}: {row['concept_a']} x {row['concept_b']} "
                     "names a concept the corpus does not have")
    verdicts = aggregate(rows)
    table = build_table(concepts, verdicts)

    if args.stats:
        stats(concepts, pairs, rows, verdicts)
        return 0

    if args.check:
        committed = read_csv(TABLE) if TABLE.exists() else []
        if [dict(r) for r in committed] != table:
            sys.exit(f"{TABLE.relative_to(ROOT)} is stale -- run "
                     "`python3 scripts/build_redundancy.py`")
        print(f"{TABLE.relative_to(ROOT)} is current ({len(table)} rows)")
        return 0

    write_table(table)
    stats(concepts, pairs, rows, verdicts)
    print(f"wrote {TABLE.relative_to(ROOT)}: {len(table)} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
