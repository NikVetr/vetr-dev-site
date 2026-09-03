#!/usr/bin/env python3
"""Validate the shipped corpus. Exits non-zero on any error.

Checks the invariants the app relies on and cannot recover from at runtime:
registry references resolve, every concept has text in every ready language,
text is NFC, every printed string is drawable by the faces that will draw it, and
safety-critical sections carry reviewed content.
"""
import csv
import json
import re
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# Wrong content here can cause harm, so machine-unreviewed rows (confidence < 2)
# are refused outright rather than shown with a caveat.
SAFETY_CRITICAL = {"emergency-medical", "lost-rescue", "dietary-needs",
                   # Added with the expansion. Every translator was told these
                   # require a verified row, so the gate has to hold them to it.
                   "pharmacy-symptoms", "medical-conditions", "police-consulate"}
MIN_SAFE_CONFIDENCE = 2

# What the shipped faces can actually draw, read from their cmaps rather than from
# a table of Unicode ranges.
#
# The tables this replaced were far more permissive than the fonts. They admitted
# the whole of U+4E00-9FFF for Japanese, while `cjk-jp` is built from JIS X 0208
# level 1 and the corpus -- so a level-2 kanji validated and printed as an empty
# box. They admitted all of Latin Extended-B for every script, while the Thai faces
# carry 446 glyphs and none of the tone-marked pinyin vowels. They admitted the Han
# block for Korean, where the faces carry nine ideographs that spilled in from
# language endonyms. The browser hides that behind a system font; the PDF embeds
# only these faces and has nothing to fall back to, which is what the shipped
# Mandarin card's row of boxes was.
def load_faces():
    """The cmap of every shipped face, and which faces each base font stack draws in.

    A base stack's faces are every variant a sheet can pick from it: `latin` also
    draws in `latin-cond` when a dense reference table asks for the narrow face, and
    in `-serif` when the reader asks for a serif sheet -- see `stackFor` in
    core/fonts.js. Text is checked against the *intersection* of all of them,
    because a glyph only one face carries is unusable in a column set in another.
    """
    faces = json.loads((DATA / "fonts/manifest.json").read_text(encoding="utf-8"))["faces"]
    cmaps = {}
    for face in faces:
        font = TTFont(DATA / "fonts" / f"{face['file']}.ttf", lazy=True)
        cmaps[face["file"]] = set(font.getBestCmap())
        font.close()
    stacks = {base: [f["file"] for f in faces
                     if f["stack"] == base or f["stack"].startswith(base + "-")]
              for base in {f["stack"] for f in faces}}
    return cmaps, stacks


CMAPS, STACK_FACES = load_faces()

# Substituted before anything is drawn -- an open slot becomes a rule or an
# ellipsis, `{region}` becomes a country name -- so these braces never reach a face.
PLACEHOLDERS = ("{}", "{region}", "{numbers}")


errors = []
warnings = []


# `{target}` and `{source}` are filled from the pair by `core/pack.js`; see
# `content/LANGUAGE-SLOTS.md`. Distinct from the `{}` blank slot, which is a rule
# drawn on the card rather than a substitution.
LANGUAGE_SLOT = re.compile(r"\{(?:target|source)\}")

# Languages whose CLDR names are lowercase, so a placeholder must not open a
# sentence in them. Italian joined this set with the seventeenth pack.
LOWERCASE_LANGUAGE_NAMES = {"fr", "es", "pt", "ru", "it"}


def check_drawable(text, stack, where, fatal=False):
    """Complain about anything in `text` the stack that renders it cannot draw."""
    for token in PLACEHOLDERS:
        text = text.replace(token, "")
    # Grouped by the faces that lack them, so one bad cell is one message.
    lacking = defaultdict(list)
    for ch in dict.fromkeys(text):
        if ch.isspace():
            continue
        without = tuple(f for f in STACK_FACES.get(stack, ()) if ord(ch) not in CMAPS[f])
        if without:
            lacking[without].append(ch)
    for faces, chars in lacking.items():
        found = ", ".join(f"U+{ord(c):04X} {c!r}" for c in chars)
        (errors if fatal else warnings).append(
            f"{where} prints in the {stack} stack, and {', '.join(faces)} "
            f"cannot draw {found}. It prints as an empty box in the PDF, where "
            "there is no system font to fall back to. Romanise it or drop it.")


def load(rel):
    path = DATA / rel
    with path.open(encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))
    for n, row in enumerate(rows, start=2):
        if any(k is None or v is None for k, v in row.items()):
            errors.append(f"{rel}:{n}: wrong number of cells")
    return rows


def applies_to(concept, code):
    """Whether a concept belongs on `code`'s sheet. Mirrors `appliesTo` in core/pack.js."""
    only = (concept.get("applies_to") or "").strip()
    return not only or code in only.split(";")


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
    for iso, script in scripts.items():
        if script["font_stack"] not in STACK_FACES:
            errors.append(f"scripts.csv: {iso} names font stack "
                          f"{script['font_stack']!r}, which data/fonts/manifest.json "
                          "does not ship, so nothing in that script can be drawn")
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
        # Whether this language reads right to left, which decides whether a digit
        # in its text is a bidi hazard.
        lang = languages.get(code, {})
        rtl = scripts.get(lang.get("script", ""), {}).get("direction") == "rtl"
        stack = scripts.get(lang.get("script", ""), {}).get("font_stack", "")
        seen = set()
        unread = defaultdict(int)
        for group in groups:
            rel = f"lang/{code}/{group}.csv"
            if not (DATA / rel).exists():
                continue
            for line, row in enumerate(load(rel), start=2):
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
                # Seven concepts name a language, and `{target}` / `{source}` fill
                # from the pair. Two rules the mechanism cannot enforce itself, both
                # from `content/LANGUAGE-SLOTS.md`.
                if is_note and LANGUAGE_SLOT.search(text):
                    # A note prints source-side only, so both placeholders would
                    # resolve to constants inside one -- and hardcoded prose is
                    # clearer than a substitution that can never vary.
                    errors.append(f"{rel}: {cid} is a note and carries a language "
                                  "placeholder, which can only ever resolve one way")
                if code in LOWERCASE_LANGUAGE_NAMES and LANGUAGE_SLOT.match(text.strip()):
                    # These languages write language names lowercase, and ICU gives
                    # them that way, so a placeholder at the start of a sentence
                    # prints a lowercase initial. Reword rather than adding a
                    # capitalising token: no frame in the corpus needs one.
                    errors.append(f"{rel}: {cid} starts with a language placeholder, "
                                  f"and {code} writes language names lowercase")
                # A row's own writing prints in its language's stack whichever side
                # of the pair it lands on: as the target's script, or as the gloss
                # when this language is the reader's. Romanisation and the respelling
                # are Latin by definition, whatever the target is.
                #
                # A note is the one row that only ever prints source-side, because it
                # is prose the reader reads rather than something they show to anyone.
                # So it may use the reader's own script freely -- a Japanese reader's
                # note is Japanese -- and may not quote any other, which is exactly
                # what the shipped Mandarin card did, with its number note full of
                # empty boxes. That stays an error: a quoted script always has a
                # romanisation to fall back on, and nothing shipped violates it.
                for col in ("text", "text_alt"):
                    check_drawable(row.get(col) or "", stack,
                                   f"{rel}:{line} {cid} {col}", fatal=is_note)
                for col, value in row.items():
                    # `col` is None for a row with extra cells, which `load` reports.
                    if col and (col.startswith("romanization_") or col == "ipa"):
                        check_drawable(value or "", "latin", f"{rel}:{line} {cid} {col}")
                # `ipa` is the one column in the corpus that no human wrote, so a
                # cell has to say which route produced it -- `provenance` carries an
                # `ipa=<method>` element, and `ipa=reviewed` is the only value that
                # means a person has read it. `scripts/build_ipa.py` has the grammar
                # and is the only thing that writes the machine values; it refuses to
                # touch a cell marked `reviewed`, so the tag is what protects a
                # reviewer's work from the next regeneration.
                #
                # `confidence` deliberately says nothing about this: it is a claim
                # about who checked the *translation*, and moving it to admit that
                # the transcription is machine output would both misreport `text` and
                # trip the safety-critical gate above on every allergy row.
                if (row.get("ipa") or "").strip():
                    method = next((p[len("ipa="):] for p in row["provenance"].split(";")
                                   if p.startswith("ipa=")), "")
                    if not method:
                        errors.append(f"{rel}: {cid} has an ipa but its provenance "
                                      f"({row['provenance']!r}) does not say where it "
                                      "came from -- want an `ipa=<method>` element")
                    elif method != "reviewed":
                        unread[method] += 1
                # A right-to-left row carrying more than one digit will print with
                # the digits reversed -- 10 as 01, 1/2 as 2/1. The renderer shapes
                # a run right-to-left as a whole and nothing here implements the
                # bidi algorithm's rule that digits stay left-to-right inside an
                # RTL run, so the data has to keep them apart. Spell the number out
                # and put the numeral in text_alt.
                if rtl and sum(c.isdigit() for c in text) > 1:
                    errors.append(f"{rel}: {cid} is right-to-left and holds more than "
                                  f"one digit ({text!r}), which will print reversed. "
                                  "Spell it out and move the numeral to text_alt.")
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
        # A concept scoped to other languages is not a gap in this one: the won is
        # only ever on a Korean card, and counting it against Spanish said 755 of
        # 757 about a pack with nothing missing at all.
        # The reviewer queue, and the only place it is visible: every one of these
        # cells is a machine transcription nobody has read, and a wrong one is a
        # wrong pronunciation said out loud. Not an error -- the alternative is the
        # empty column this replaced -- but it should not go quiet either.
        for method, n in sorted(unread.items()):
            warnings.append(f"lang/{code}: {n} ipa cells from {method!r} that no "
                            "fluent speaker has read")
        applicable = {cid for cid, c in concepts.items() if applies_to(c, code)}
        missing = applicable - seen
        if missing:
            # Not an error, whatever the status. The concept bank is the union of
            # every sheet ported into it, so no single language covers all of it --
            # and which languages are advertised is an editorial call, recorded in
            # status and shown honestly via coverage.json.
            warnings.append(f"lang/{code}: {len(seen & applicable)} of {len(applicable)} "
                            f"concepts ({100 * len(seen & applicable) // max(1, len(applicable))}%)")

    for path in sorted((DATA / "respell/overrides").glob("*.csv")):
        for row in load(path.relative_to(DATA)):
            if row["concept_id"] not in concepts:
                errors.append(f"{path.name}: unknown concept_id {row['concept_id']!r}")

    # A respelling rule table is a borrowed pronunciation key plus named
    # departures from it, and both halves are load-bearing. Every standard worth
    # borrowing has to be overruled somewhere, always for the same reason -- the
    # standard produces a permanent spelling and we produce a disposable hint -- so
    # a table with a `derives_from` and no `deviations` is either unfinished or
    # claiming a fidelity it does not have. That is also the answer to "why does
    # our Korean not match the official transcription", which is a question a
    # reader will eventually ask.
    SLOTS = {"onset", "nucleus", "coda", "any"}
    POLICY_VALUES = {"stress": {"caps", "acute", "prime", "none"},
                     "length": {"none", "double", "colon"},
                     "tone": {"keep", "drop"},
                     "fixups": {"first", "all"}}
    listed = set(json.loads((DATA / "respell/rules/index.json").read_text(encoding="utf-8")))
    for path in sorted((DATA / "respell/rules").glob("*.json")):
        if path.name == "index.json":
            continue
        table = json.loads(path.read_text(encoding="utf-8"))
        where = path.stem
        if where not in listed:
            # A table under construction is a legitimate state, which is why
            # `respell_check.mjs` reads this directory rather than the index: a
            # reader can be run before it is published. So this is a warning, and
            # the error is the other direction, below.
            warnings.append(f"respell/rules/{where}: not in index.json, so nothing "
                            f"loads it yet")
            continue
        if where != f"{table.get('source')}__{table.get('accent')}":
            errors.append(f"respell/rules/{where}: source/accent disagree with the filename")
        if not table.get("derives_from"):
            errors.append(f"respell/rules/{where}: no derives_from -- name the key it "
                          f"borrows, or say it was read off the corpus")
        elif not table.get("deviations"):
            errors.append(f"respell/rules/{where}: derives_from with no deviations")
        # `reader_onsets` is IPA clusters, so it must not contain output letters --
        # it is intersected with the table read off the target, which is IPA.
        max_onset = (table.get("policy") or {}).get("max_onset", 3)
        for cluster in (table.get("policy") or {}).get("reader_onsets", "").split():
            if len(cluster) < 2:
                errors.append(f"respell/rules/{where}: reader_onsets has {cluster!r}, "
                              f"which is one phoneme rather than a cluster")
            # Counted in characters, which over-counts a modified consonant -- so
            # this catches only the clear case, an entry no `max_onset` can consult.
            elif len(cluster) > max_onset + 2:
                errors.append(f"respell/rules/{where}: reader_onsets has {cluster!r}, "
                              f"which is longer than max_onset={max_onset} can admit")
        for field, allowed in POLICY_VALUES.items():
            value = (table.get("policy") or {}).get(field)
            if value is not None and value not in allowed:
                errors.append(f"respell/rules/{where}: policy.{field}={value!r}, "
                              f"not one of {sorted(allowed)}")
        for rule in table.get("phonemes", []):
            if rule.get("slot") not in SLOTS:
                errors.append(f"respell/rules/{where}: phoneme {rule.get('ipa')!r} has "
                              f"slot {rule.get('slot')!r}")
            if not rule.get("ipa"):
                errors.append(f"respell/rules/{where}: a phoneme rule with no ipa")
        # A fixup that does not compile is silent: `createRespeller` builds the
        # RegExp at load time and the whole pair loses its respelling column.
        for fixup in table.get("syllable_fixups", []):
            try:
                re.compile(fixup["match"])
            except re.error as exc:
                errors.append(f"respell/rules/{where}: fixup {fixup['match']!r} "
                              f"does not compile ({exc})")
        for target in table.get("targets", {}):
            if target not in languages:
                errors.append(f"respell/rules/{where}: targets block for unknown "
                              f"language {target!r}")
    for key in sorted(listed):
        if not (DATA / f"respell/rules/{key}.json").exists():
            errors.append(f"respell/rules/index.json lists {key}, which does not exist")

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
    # Two things a reader sees only if their *own* language supplies them, and that
    # nothing else checks -- because coverage is scored against a language as a
    # sheet's target, and both of these are read off it as a sheet's source.
    #
    # A `note` is prose about the target written for the reader: Chinese
    # classifiers, Japanese counters. It renders from the source row, so a language
    # missing that row loses the note entirely and a language with a blank row used
    # to draw an empty box. Spanish had one worse than either -- a note about
    # Spanish numerals sitting in a concept scoped to Chinese, so a Spanish reader
    # learning Chinese got a paragraph about Spanish.
    note_ids = [cid for cid, c in concepts.items() if c["default_template"] == "note"]
    for cid in note_ids:
        blank = []
        # A language is never its own sheet's source, so a note scoped to one needs
        # no text in it: the Thai politeness note is read by everyone learning Thai,
        # which is everyone except Thai speakers.
        scope = {c.strip() for c in (concepts[cid].get("applies_to") or "").split(";") if c.strip()}
        for code in sorted(set(ready) - scope):
            group = sections[concepts[cid]["section_id"]]["group"]
            rel = f"lang/{code}/{group}.csv"
            if not (DATA / rel).exists():
                blank.append(code)
                continue
            row = next((r for r in load(rel) if r["concept_id"] == cid), None)
            if not row or not row["text"].strip():
                blank.append(code)
        if blank:
            warnings.append(f"concepts: the note {cid!r} has no text for "
                            f"{', '.join(blank)}, so those readers do not get it")

    # The emergency note's service words and its frame come from the registry in the
    # reader's language. Absent, they fall back to English, which is what every
    # sheet not glossed into English was printing.
    wanted_labels = {"_frame"}
    for r in regions.values():
        for part in r["emergency_numbers"].split(";"):
            label = part.strip().split(" ", 1)
            if len(label) == 2 and label[1].strip():
                wanted_labels.add(label[1].strip())
    # Both of these, and the section headings beside them, print in the *source's*
    # face -- they are the reader's own furniture rather than anything shown to a
    # local -- so a Korean heading is only ever set in the Korean stack. That
    # asymmetry is why the U+30FB middle dot in thirty Korean and Chinese headings
    # went unnoticed until it drew a row of boxes: no check ever looked at a
    # language as a sheet's source.
    for code in sorted(ready):
        stack = scripts.get(languages[code]["script"], {}).get("font_stack", "")
        rel = f"registry/section-titles/{code}.csv"
        if (DATA / rel).exists():
            for line, row in enumerate(load(rel), start=2):
                check_drawable(row["title"], stack,
                               f"{rel}:{line} {row['section_id']} title")

        rel = f"registry/emergency-labels/{code}.csv"
        rows = load(rel) if (DATA / rel).exists() else []
        missing = wanted_labels - {r["label"] for r in rows}
        if missing:
            warnings.append(f"registry/emergency-labels: {code} is missing "
                            f"{len(missing)} of {len(wanted_labels)} labels, so its "
                            "emergency note prints in English")
        for line, row in enumerate(rows, start=2):
            check_drawable(row["text"], stack, f"{rel}:{line} {row['label']} text")
        # The frame is the only string here with placeholders, and dropping one is
        # silent: `{numbers}` missing prints the country and no numbers at all,
        # under the Emergency heading, which is the worst possible place for it.
        frame = next((r["text"] for r in rows if r["label"] == "_frame"), "")
        for token in ("{region}", "{numbers}"):
            if frame and token not in frame:
                errors.append(f"{rel}: the _frame has no {token}, so the "
                              "emergency note would print without it")

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
