#!/usr/bin/env python3
"""Build and check `data/registry/redundancy.csv`, the sparse concept-redundancy table.

    python3 scripts/build_redundancy.py --stats       # the measurement, no files touched
    python3 scripts/build_redundancy.py               # aggregate the passes, write the table
    python3 scripts/build_redundancy.py --check       # verify the committed table is current
    python3 scripts/build_redundancy.py --worksheet toilets,emergency-medical
    python3 scripts/build_redundancy.py --spot-check  # a sheet that tests the rules
    python3 scripts/build_redundancy.py --strata      # what that sheet is drawn from

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

**Two provenances, and never one dressed as the other.** Most of the table is
rated. `numbers-money` is *asserted*, by the named rules in `RULES` below, because
it is 36% of the candidate pairs and its content is a set of tokens for writing a
price rather than prose -- a rule about it is more defensible than 12,000
judgements, and it is checkable, which a judgement is not. So every row carries
`provenance`: `rated`, with the pass counts it was aggregated from, or
`rule:<name>`, with **no pass counts at all**, because none were made.
`scripts/validate_data.py` rejects a `rule:` row that claims any. Where a pair is
both, the rating wins -- the rule is the cheap estimate and the judgement is the
measurement.

`--spot-check` is how the rules are tested rather than trusted: a sheet stratified
by (rule, cluster), rated by the same independent passes and the same rubric. The
first round of it rated 49 asserted pairs and **overturned two rules, 15 pairs, all
unanimous** -- see `word-and-its-symbol` and `generic-and-named-currency`, which
carry what the passes said and why the rule had been wrong. A rule the spot-check
contradicts is corrected here; it is not averaged with the judgement.

## What the committed table contains

Every pair whose relation **differs from what `cluster_id` alone would say**. That
is: every non-`none` pair, plus the same-cluster pairs called `none` -- those need a
row precisely because the scorer's fallback for an unrated same-cluster pair is the
old flat cluster decay, and without the row it would keep discounting a pair three
judges, or a rule, said was not redundant. Everything else is recoverable from
`cluster_id`, so storing it would be storing a copy.

That filter is what keeps the asserted half small. The rules decide 1,304 pairs and
only 194 of them need a row; and `can_co_occur` never let them near the 1,994
same-cluster pairs whose `applies_to` scopes are disjoint, which would otherwise
have been 1,994 rows restating `applies_to`. A sample of 21 of those was rated as a
control and came back `none` 21 times, so they are independent on the merits as
well as unreachable -- and those 21 do carry rows, because a judgement is recorded
wherever one was made. Only the *rule* stops at what a card can hold.

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
    """concept_id -> {section_id, cluster_id, kind, scope, gloss, tokens}, in corpus order.

    `scope` is `applies_to` parsed: the set of targets the row can print on, or
    `None` for every target. The rules below need it, because two rows with
    disjoint scopes never reach one card.
    """
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
            only = (row.get("applies_to") or "").strip()
            out[cid] = {
                "section_id": row["section_id"],
                "cluster_id": row["cluster_id"],
                "kind": row["kind"],
                "scope": frozenset(only.split(";")) if only else None,
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


# ---------------------------------------------------------------------------
# Asserted relations: `numbers-money`, derived rather than rated
# ---------------------------------------------------------------------------
#
# `numbers-money` is 4,012 of the 11,224 candidate pairs -- 36% -- and it is also
# 2,236 of the corpus's 2,357 same-`cluster_id` pairs, which is to say: it is where
# the cluster prior does nearly all of its work, and where the pilot found that
# prior to be wrong. `numbers-money.currency` (65 members) and `.misc` (18) hold
# the number line and the currency word/symbol pairs, and both are **complements**.
#
# Rating 4,012 pairs pairwise, three times, would be 12,000 judgements to rediscover
# a structure that is mechanical: this section is not prose, it is a set of tokens
# for writing and reading a price, and a rule can say which of them stand in for
# each other. So these relations are *asserted* by the rules below rather than
# rated, `provenance` on every row says which rule put it there, and a sample is
# rated pairwise anyway (`--spot-check`) to test the rules. A rated verdict always
# wins over an asserted one: the rule is the cheap estimate and the judgement is
# the measurement.
SECTION = "numbers-money"


def can_co_occur(a, b):
    """Whether one card could carry both rows.

    `applies_to` scopes a row to named targets and `core/pack.js`'s `appliesTo`
    drops the rest before `buildBlocks` ever sees them -- `solve/weights.js` applies
    the same filter to its candidates, and had to be fixed once for not doing so
    ("the Japanese yen on a Spanish sheet"). So two rows with disjoint scopes are
    never on one sheet together, no scorer can ever read a row about the pair, and
    asserting a relation for it would be storing a restatement of `applies_to`.
    That is 1,994 of the 2,236 same-cluster pairs here: every won-against-euro,
    every taka-against-krona. They get no row, and the rules below never see them.
    """
    return a["scope"] is None or b["scope"] is None or bool(a["scope"] & b["scope"])


def denotes(concept):
    """What the row is a name *for*: an amount, or a unit of money.

    Two rows with the same key are two ways of writing one thing. Two rows with
    different keys are two different things, and on a price tag two different things
    are complements -- you need the number and the unit, and you need 3 as well as 7.

    Read off the English gloss because that is where the corpus says it: the number
    rows are glossed `0`, `10`, `1,000`, `1/2`, `100,000`; the counted forms add a
    suffix (`2 + classifier`, `2 items`) and denote the same amount. A trailing
    parenthetical says which *form* a money row is, not which money -- `yuan` and
    `yuan (spoken)` are one currency -- so it is not part of the key.
    """
    amount = re.fullmatch(r"([\d,]+|1/2)(?: items?| \+ classifier)?", concept["gloss"])
    if amount:
        return ("amount", amount.group(1).replace(",", ""))
    return ("money", re.sub(r"\s*\([^)]*\)$", "", concept["gloss"]).casefold())


# Each rule takes the two (id, concept) sides and returns a relation or `None`.
# Ordered: the first that answers wins, so the narrow rules come before the broad
# ones. The name is what lands in `provenance`, which is how a row in the committed
# table names the argument that put it there.
RULES = (
    # **A currency word and its own symbol are a partial substitute -- and that is
    # the one place a rule here was overruled.** This rule asserted `none`, citing
    # `scripts/validate_data.py`, which makes it an *error* for `X` and `X-symbol`
    # to have different `applies_to`: "the name of the money and the sign beside a
    # price ... a card carrying one without the other is not a shorter card, it is a
    # sign nobody can read or a word nobody can point at". The spot-check rated 11
    # of these pairs and all three passes called every one of them `partial`, 11 for
    # 11, with no dissent.
    #
    # The judges were right and the citation was the wrong kind of evidence. The
    # validator's rule is a **co-print constraint** -- both rows or neither -- and
    # this table holds **marginal value**, which is a different quantity: once the
    # card says `euro`, the sign `EUR` is genuinely worth less than a row nothing
    # else covers, and "same referent, different register" is rubric level 1 in so
    # many words. A constraint cannot be smuggled in as a keep-factor of 1, and the
    # attempt hid the real finding, which is that **nothing in a keep-factor can
    # enforce the constraint at all.** `validate_data.py` has to keep enforcing it
    # on `applies_to`, and a redundancy-aware `priority` budget would need its own
    # enforcement -- measured, it orphans currency words without one.
    # 31 pairs: 30 in `.currency`, plus `yen`/`yen-symbol` in `.yen`.
    ("word-and-its-symbol",
     lambda a, ca, b, cb: "partial" if b == f"{a}-symbol" or a == f"{b}-symbol"
     else None),

    # **`local-currency` against a named currency that shares its scope is not a
    # substitute either -- the second rule the spot-check corrected.**
    # `numbers-money.local-currency` ("local currency") is the hedge for a language
    # spoken across several currency zones; scoped `ar;ru;ta`, the only 4 pairs it
    # can reach are `ruble` and `rupee` and their symbols. This rule guessed
    # `partial`, reading the generic row as answering much of what the named one
    # does. All three passes rated all 4 pairs `none`, and the rubric says why in its
    # own words: level 0 "INCLUDES ... a general word and a different specific one".
    # The generic row is what a traveller points at across the border where the
    # named one is no use, so having the ruble does not make it worth less.
    #
    # Kept as a named rule rather than folded into `distinct-currency`, which would
    # now reach the same verdict, because the two arguments are different and this
    # one has three passes behind it.
    ("generic-and-named-currency",
     lambda a, ca, b, cb: "none" if f"{SECTION}.local-currency" in (a, b)
     and denotes(ca)[0] == denotes(cb)[0] == "money" else None),

    # **Two rows for the same amount in different form are partial substitutes.**
    # Three pairs, all of them a language's own grammar showing through: `2` against
    # `2 + classifier` (Chinese er / liang) and against `2 items` (Japanese futatsu),
    # and `yuan` against `yuan (spoken)` (yuan / kuai). Level 1 rather than 2 because
    # each is the rubric's "narrower case" or "different register" -- the counted form
    # is what you must say before a measure word, and the corpus explains it in
    # `number-and-classifier-notes` -- and level 1 rather than 0 because a card that
    # already prints one has said the number.
    ("same-value-restated",
     lambda a, ca, b, cb: "partial" if denotes(ca) == denotes(cb) else None),

    # **The number line is a complement, not a set of substitutes.** 119 pairs of
    # `.misc`: the digits 0-9, then 10, 100, 1,000, 10,000, 1/2, and `lakh`/`crore`
    # in their own cluster. A card that can count needs all of them -- dropping 3
    # from 0-10 is a defect and not a saving -- which is why `core/pack.js` refuses
    # to run any decay in the priority ladder ("a decay would delete counting from
    # the card") and why `ui/chips.js` charges the cluster prior once per cluster
    # instead of once per mate, having measured a card that counted "0 1 2 4 6 7 8 9".
    # Both of those are workarounds for this table not saying it; this is the table
    # saying it.
    ("number-line",
     lambda a, ca, b, cb: "none" if denotes(ca)[0] == denotes(cb)[0] == "amount"
     else None),

    # **Two different currencies are not substitutes for each other.** Where two
    # named currencies share a target they are the money of two different countries
    # that speak the language -- euro and franc on a German card (Germany, then
    # Switzerland), dollar and riel on a Khmer one (both circulate in Cambodia),
    # rupee and pound and dollar on an English one -- so a traveller who has one
    # still fully needs the other. `rial`/`toman` is the sharpest case: two units of
    # one Iranian currency, a factor of ten apart, and knowing only one of them is
    # the standard way to be overcharged. 53 pairs, all of them inside `.currency`,
    # where the prior was discounting them 45%.
    ("distinct-currency",
     lambda a, ca, b, cb: "none" if denotes(ca)[0] == denotes(cb)[0] == "money"
     else None),

    # **A number and a unit of money are the two halves of a price.** 32 pairs, all
    # of them `.misc`, where the number line sits in one cluster with `yuan` and
    # `yuan (spoken)`. Nothing about "5" answers the need "yuan" answers.
    ("amount-and-currency", lambda a, ca, b, cb: "none"),
)


def derive_asserted(concepts):
    """(a, b) -> (relation, rule) for every `numbers-money` pair a rule decides.

    Notes are excluded: the rules read a gloss as a number or a unit of money, and
    `number-and-classifier-notes` is a paragraph of prose. Its one same-cluster pair
    is the Chinese note against the Japanese one, which `can_co_occur` would drop
    anyway.
    """
    ids = sorted(cid for cid, c in concepts.items()
                 if c["section_id"] == SECTION and c["kind"] != "note")
    out = {}
    for a, b in itertools.combinations(ids, 2):
        if not can_co_occur(concepts[a], concepts[b]):
            continue
        for name, rule in RULES:
            relation = rule(a, concepts[a], b, concepts[b])
            if relation:
                out[(a, b)] = (relation, name)
                break
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


def build_table(concepts, verdicts, asserted):
    """The rows to commit: every pair `cluster_id` alone would get wrong.

    `provenance` is `rated` or `rule:<name>`, and it is the whole of the
    distinction: a rated row carries the pass counts it was aggregated from, and an
    asserted row carries none, because there were none. A rule is not a judgement
    and must not be able to look like two of them. Where both exist the rating wins.
    """
    merged = {pair: (relation, f"rule:{rule}", "", "")
              for pair, (relation, rule) in asserted.items()}
    merged.update({pair: (relation, "rated", str(passes), str(agree))
                   for pair, (relation, passes, agree) in verdicts.items()})
    rows = []
    for (a, b), (relation, provenance, passes, agree) in sorted(merged.items()):
        same_cluster = concepts[a]["cluster_id"] == concepts[b]["cluster_id"]
        if relation == "none" and not same_cluster:
            continue
        rows.append({"concept_a": a, "concept_b": b, "relation": relation,
                     "provenance": provenance, "passes": passes, "agree": agree})
    return rows


def write_table(rows):
    header = ["concept_a", "concept_b", "relation", "provenance", "passes", "agree"]
    with TABLE.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, header, lineterminator=NEWLINE)
        writer.writeheader()
        writer.writerows(rows)


def render_sheet(concepts, wanted, pairs, controls, seed):
    """`wanted` plus `controls` negative controls drawn from the pairs the filter
    threw away, shuffled together so a judge cannot tell one from the other."""
    rng = random.Random(seed)
    excluded = set()
    ids = sorted(concepts)
    candidate_set = set(pairs)
    while len(excluded) < controls:
        a, b = sorted(rng.sample(ids, 2))
        if (a, b) not in candidate_set:
            excluded.add((a, b))
    sheet = list(wanted) + sorted(excluded)
    rng.shuffle(sheet)
    lines = []
    for n, (a, b) in enumerate(sheet, start=1):
        lines.append(f"{n}\tA: {concepts[a]['gloss']}  [{concepts[a]['section_id']}]"
                     f"\tB: {concepts[b]['gloss']}  [{concepts[b]['section_id']}]")
    return sheet, lines


def worksheet(concepts, pairs, section_ids, controls, seed):
    """The rating sheet for one pilot: every candidate touching `section_ids`."""
    wanted = [p for p in pairs
              if concepts[p[0]]["section_id"] in section_ids
              or concepts[p[1]]["section_id"] in section_ids]
    return render_sheet(concepts, wanted, pairs, controls, seed)


def spot_check(concepts, pairs, asserted, per_stratum, controls, seed):
    """A rating sheet that tests the rules rather than replacing them.

    Stratified by (what decided the pair, the structure it sits in) and sampled
    `per_stratum` deep, so every rule is probed inside every cluster it reaches and
    no stratum can be swamped by a bigger one -- a uniform sample of the 4,012 pairs
    would be 95% currency rows two languages apart and would test nothing. The two
    strata no rule owns are the ones that most need probing:

      * `out-of-scope` -- pairs `can_co_occur` dropped. If a judge calls won against
        euro a duplicate, then `applies_to` is the only thing keeping them apart and
        the decision not to store the pair rests entirely on it.
      * `unruled` -- candidates the rules never reached: the cross-section pairs, and
        the `number-and-classifier-notes` prose that `denotes` cannot read.

    Stratifying by the thing under test is the point here and not a bias: the
    question is whether each rule holds, which needs power in each rule's own class.
    """
    by_stratum = collections.defaultdict(list)
    keep = {(r["concept_a"], r["concept_b"]) for r in build_table(concepts, {}, asserted)}
    for pair in pairs:
        a, b = pair
        if concepts[a]["section_id"] != SECTION and concepts[b]["section_id"] != SECTION:
            continue
        if pair in asserted:
            # A rule that decides a cross-cluster `none` puts no row in the table,
            # so there is nothing there for a judge to overturn.
            if pair not in keep:
                continue
            label = asserted[pair][1]
        elif not can_co_occur(concepts[a], concepts[b]):
            label = "out-of-scope"
        else:
            label = "unruled"
        shared = concepts[a]["cluster_id"] == concepts[b]["cluster_id"]
        structure = (concepts[a]["cluster_id"] if shared
                     else f"{concepts[a]['section_id']} x {concepts[b]['section_id']}")
        by_stratum[(label, structure)].append(pair)

    rng = random.Random(seed)
    wanted = []
    for key in sorted(by_stratum):
        group = by_stratum[key]
        wanted += sorted(rng.sample(group, min(per_stratum, len(group))))
    return render_sheet(concepts, wanted, pairs, controls, seed), by_stratum


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


def stats(concepts, pairs, rows, verdicts, asserted, table):
    total = len(concepts) * (len(concepts) - 1) // 2
    cross = [p for p in pairs
             if concepts[p[0]]["section_id"] != concepts[p[1]]["section_id"]]
    print(f"{len(concepts)} concepts, {total} unordered pairs")
    print(f"candidate set {len(pairs)} ({100 * len(pairs) / total:.2f}%): "
          f"{len(pairs) - len(cross)} within-section, {len(cross)} cross-section")

    # The two provenances, counted separately, because they are not the same kind of
    # claim and averaging them would hide which is which.
    by_rule = collections.Counter(r["provenance"] for r in table)
    print(f"table {len(table)} rows: {by_rule['rated']} rated, "
          f"{len(table) - by_rule['rated']} asserted by rule")
    for name, _ in RULES:
        if by_rule[f"rule:{name}"]:
            reached = sum(1 for r, n in asserted.values() if n == name)
            print(f"  rule:{name:26s} {by_rule[f'rule:{name}']:5d} rows "
                  f"({reached} pairs decided, the rest recoverable from cluster_id)")
    # Where a rated pair and a rule cover the same pair, the rating is what the table
    # carries. That overlap is the spot-check, and its size is how much of the rule
    # set has been tested pairwise.
    tested = set(verdicts) & set(asserted)
    if tested:
        agreed = sum(1 for p in tested if verdicts[p][0] == asserted[p][0])
        print(f"  spot-check  {len(tested)} asserted pairs also rated, "
              f"{agreed} ({100 * agreed / len(tested):.0f}%) agree with their rule")
        for pair in sorted(tested):
            if verdicts[pair][0] != asserted[pair][0]:
                print(f"    overturned  {pair[0]} x {pair[1]}: "
                      f"rule:{asserted[pair][1]} said {asserted[pair][0]}, "
                      f"{verdicts[pair][1]} passes said {verdicts[pair][0]}")
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
    ap.add_argument("--spot-check", type=int, nargs="?", const=10, metavar="N",
                    help="emit a rating sheet that tests the numbers-money rules: N "
                         "pairs per (rule, cluster) stratum, default 10")
    ap.add_argument("--strata", action="store_true",
                    help="print the spot-check strata and their sizes")
    ap.add_argument("--ingest", nargs="+", metavar="ANSWERS",
                    help="one answer file per independent pass, for the --worksheet "
                         "or --spot-check given (same arguments, controls and seed)")
    ap.add_argument("--controls", type=int, default=100,
                    help="negative controls to mix into the worksheet")
    ap.add_argument("--seed", type=int, default=20260915)
    args = ap.parse_args()

    concepts = load_concepts()
    pairs = candidates(concepts)
    asserted = derive_asserted(concepts)

    sheet = lines = None
    if args.worksheet:
        sections = set(args.worksheet.split(","))
        unknown = sections - {c["section_id"] for c in concepts.values()}
        if unknown:
            sys.exit(f"unknown section(s): {', '.join(sorted(unknown))}")
        sheet, lines = worksheet(concepts, pairs, sections, args.controls, args.seed)
    elif args.spot_check or args.strata:
        (sheet, lines), strata = spot_check(concepts, pairs, asserted,
                                            args.spot_check or 10, args.controls,
                                            args.seed)
        if args.strata:
            for key in sorted(strata):
                print(f"{key[0]:28s} {key[1]:44s} {len(strata[key]):5d}")
            print(f"{len(sheet) - args.controls} sampled + {args.controls} controls")
            return 0

    if sheet is not None:
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
        sys.exit("--ingest needs the --worksheet or --spot-check it was rated against")

    rows = read_csv(PASSES) if PASSES.exists() else []
    for n, row in enumerate(rows, start=2):
        if row["relation"] not in RELATIONS:
            sys.exit(f"{PASSES.name}:{n}: {row['relation']!r} is not a relation")
        if row["concept_a"] not in concepts or row["concept_b"] not in concepts:
            sys.exit(f"{PASSES.name}:{n}: {row['concept_a']} x {row['concept_b']} "
                     "names a concept the corpus does not have")
    verdicts = aggregate(rows)
    table = build_table(concepts, verdicts, asserted)

    if args.stats:
        stats(concepts, pairs, rows, verdicts, asserted, table)
        return 0

    if args.check:
        committed = read_csv(TABLE) if TABLE.exists() else []
        if [dict(r) for r in committed] != table:
            sys.exit(f"{TABLE.relative_to(ROOT)} is stale -- run "
                     "`python3 scripts/build_redundancy.py`")
        print(f"{TABLE.relative_to(ROOT)} is current ({len(table)} rows)")
        return 0

    write_table(table)
    stats(concepts, pairs, rows, verdicts, asserted, table)
    print(f"wrote {TABLE.relative_to(ROOT)}: {len(table)} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
