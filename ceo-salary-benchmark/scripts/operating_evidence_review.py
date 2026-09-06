"""Read the organization-by-organization job evidence review without inventing geography."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW_DIR = ROOT / "benchmark/enrichment/operating_evidence_review"
SCOPE_LABELS = {
    "us_only": "United States", "international": "International / multi-country",
    "outside_us": "Outside United States", "unknown": "Location not reported",
}


def load_reviews() -> dict[str, dict]:
    reviews = {}
    for path in (REVIEW_DIR / "shard_1.jsonl", REVIEW_DIR / "shard_2.jsonl"):
        for line in path.read_text(encoding="utf-8").splitlines():
            record = json.loads(line)
            organization = record["organization"]
            if organization in reviews:
                raise ValueError(f"Duplicate operating evidence review: {organization}")
            if not record.get("search_log"):
                raise ValueError(f"Operating evidence review has no individual search log: {organization}")
            if record["work_model"] not in {"remote", "hybrid", "in_person", "unknown"}:
                raise ValueError(f"Invalid work model: {organization}")
            if record["ceo_scope_basis"] not in {"direct_role", "organization_policy", "inferred_staff_market", "unknown"}:
                raise ValueError(f"Invalid CEO geography evidence basis: {organization}")
            if record["ceo_hiring_scope"] not in SCOPE_LABELS:
                raise ValueError(f"Invalid CEO hiring geography: {organization}")
            for evidence in record["evidence"]:
                if not evidence.get("url", "").startswith(("http://", "https://")):
                    raise ValueError(f"Evidence lacks a source URL: {organization}")
                local = evidence.get("local_path")
                if local and not (ROOT / local).is_file():
                    raise ValueError(f"Missing saved operating source: {organization}: {local}")
            reviews[organization] = record
    unknown = {name for name, record in reviews.items() if record["work_model"] == "unknown"}
    followups = {}
    for path in (REVIEW_DIR / "unknown_followup_1.jsonl", REVIEW_DIR / "unknown_followup_2.jsonl"):
        for line in path.read_text(encoding="utf-8").splitlines():
            followup = json.loads(line)
            name = followup["organization"]
            if name in followups or name not in unknown:
                raise ValueError(f"Unexpected or duplicate unknown-work follow-up: {name}")
            if followup["best_guess"] not in {"remote", "hybrid", "in_person", "unknown"}:
                raise ValueError(f"Invalid work-model guess: {name}")
            if not followup["search_log"] or (followup["best_guess"] != "unknown" and not followup["evidence"]):
                raise ValueError(f"Missing follow-up evidence or search log: {name}")
            if any(not item.get("url", "").startswith(("https://", "http://")) for item in followup["evidence"]):
                raise ValueError(f"Invalid follow-up evidence URL: {name}")
            followups[name] = followup
            review = reviews[name]
            review["unknown_followup"] = followup
            promoted = followup["supports_promotion_to_main_classification"]
            if promoted:
                if followup["confidence"] not in {"high", "medium"} or followup["best_guess"] == "unknown":
                    raise ValueError(f"Unsupported work-model promotion: {name}")
                review["work_model"] = followup["best_guess"]
                review["work_model_basis"] = "inferred_from_reviewed_job_evidence"
            office_supported = followup.get("supports_office_present_predictor") is True and followup.get("combined_remote_vs_office_classification") == "office_present"
            if office_supported:
                review["office_present_inferred"] = True
                review["work_model_basis"] = "inferred_office_presence"
            if promoted or office_supported:
                review["rationale"] = followup["reasoning"]
                # Work evidence confidence must not silently increase the
                # confidence assigned to a separate geography inference.
                review["work_model_confidence"] = followup["confidence"]
                review["recommendation"] = (
                    f"Use the inferred {followup['best_guess']} designation ({followup['confidence']} confidence); role evidence may not cover every employee."
                    if promoted else "Use In-person / hybrid for the combined predictor; the office arrangement subtype remains unresolved.")
            review["evidence"] = followup["evidence"] + review["evidence"]
            review["search_log"] += followup["search_log"]
    if set(followups) != unknown:
        raise ValueError("Unknown-work follow-up does not cover the original unresolved organizations")
    return reviews


def reviewed_hiring_market(review: dict) -> tuple[str, str]:
    scope = review["ceo_hiring_scope"]
    basis = review["ceo_scope_basis"]
    if scope != "unknown" and basis != "unknown":
        return SCOPE_LABELS[scope], basis
    # Multiple staff roles can identify a plausible labor market, but the app
    # must distinguish that inference from direct CEO eligibility evidence.
    staff_scope = review.get("hiring_scope", "unknown")
    if staff_scope in SCOPE_LABELS and staff_scope != "unknown" and review.get("confidence") in {"high", "medium"}:
        return SCOPE_LABELS[staff_scope], "inferred_staff_market"
    return SCOPE_LABELS["unknown"], "unknown"


def attach_review_fields(row: dict, review: dict) -> None:
    row["ceoHiringMarket"], row["ceoHiringMarketBasis"] = reviewed_hiring_market(review)
    row["operatingFootprint"] = review.get("operating_scope", "unknown")
    row["workModelDetail"] = review["work_model"]
    row["workModelBasis"] = review.get("work_model_basis", "unknown")
    followup = review.get("unknown_followup", {})
    row["workModelGuess"] = followup.get("best_guess", "unknown")
    row["workModelGuessConfidence"] = followup.get("confidence", "unknown")
    row["workModelPlausible"] = followup.get("plausible_models", [])
    row["sourceLocationDescription"] = row.get("sourceLocationDescription", row.get("location", ""))
    row["location"] = row["ceoHiringMarket"]
