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
    row["sourceLocationDescription"] = row.get("sourceLocationDescription", row.get("location", ""))
    row["location"] = row["ceoHiringMarket"]
