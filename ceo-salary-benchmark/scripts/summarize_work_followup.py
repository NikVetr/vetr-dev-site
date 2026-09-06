#!/usr/bin/env python3
"""Publish the evidence-supported and weaker work-arrangement inferences."""
from pathlib import Path
from operating_evidence_review import load_reviews

ROOT = Path(__file__).resolve().parents[1]
reviews = load_reviews()
followups = [(name, row, row["unknown_followup"]) for name, row in reviews.items() if "unknown_followup" in row]
promoted = [(name, row, followup) for name, row, followup in followups
            if row["work_model"] != "unknown" or row.get("office_present_inferred")]
guesses = [(name, row, followup) for name, row, followup in followups
           if row["work_model"] == "unknown" and not row.get("office_present_inferred") and followup["best_guess"] != "unknown"]
unresolved = len(followups) - len(promoted)
lines = ["# Work-arrangement follow-up", "",
         f"The follow-up revisited all **{len(followups)}** originally unknown organizations. **{len(promoted)}** now support an explicitly inferred classification in the combined Remote / In-person-or-hybrid predictor. Of the **{unresolved}** still unresolved, **{len(guesses)}** have a directional sensitivity guess; the remainder have no preferred arrangement.", "",
         "Hybrid includes mixed organizations with some office-based and some remote roles. Historical policies, single narrow roles, and third-party statements can support a guess without establishing a current organization-wide policy. Office addresses alone do not establish attendance requirements. These judgments are made from work evidence, without looking at salary residuals.", "",
         "The app shows weaker guesses alongside Unknown and exposes their sources and confidence in the work-model dialog. They are not silently substituted into model training. Current or recent evidence does not establish policy in an earlier compensation year.", ""]
for title, records in (("Classifications supported for modeling", promoted), ("Directional guesses retained as sensitivities", guesses)):
    lines += [f"## {title}", "", "| Organization | Assessment | Confidence | Evidence and limits |", "| --- | --- | --- | --- |"]
    for name, row, followup in sorted(records):
        assessment = followup["best_guess"].replace("_", " ")
        if row.get("office_present_inferred") and row["work_model"] == "unknown":
            assessment = "office present; hybrid/in-person subtype unresolved"
        urls = dict.fromkeys(item["url"] for item in followup["evidence"])
        sources = " ".join(f"[source {i}]({url})" for i, url in enumerate(urls, 1))
        reason = followup["reasoning"].replace("|", "/").replace("\n", " ")
        lines.append(f"| {name} | {assessment} | {followup['confidence']} | {reason} {sources} |")
    lines.append("")
lines += ["## No preferred arrangement", ""]
for name, row, followup in sorted(followups):
    if row["work_model"] == "unknown" and not row.get("office_present_inferred") and followup["best_guess"] == "unknown":
        lines.append(f"- **{name}:** {followup['reasoning']}")
lines += ["", "## Reproduction", "",
          "`python3 scripts/summarize_work_followup.py` reads the two original reviews and the two `unknown_followup_*.jsonl` files in `benchmark/enrichment/operating_evidence_review/`. Those files retain individual search logs, exact role excerpts, dates, confidence and alternatives. Employer identity is checked against job bodies; unrelated sidebar job cards and the similarly named behavioral-design Appleseed organization are excluded.", ""]
(ROOT / "unknown_work_arrangements.md").write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote work follow-up: {len(promoted)} supported, {len(guesses)} weaker guesses, {unresolved - len(guesses)} without a preferred arrangement")
