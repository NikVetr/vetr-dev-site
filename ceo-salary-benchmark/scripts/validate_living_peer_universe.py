#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "benchmark" / "enrichment" / "living_peer_universe_review.csv"
APP_DATA = ROOT / "app-data.js"
EXPECTED_IDS = {
    "SRC-990-EXT-CENTER-FOR-AI-SAFETY",
    "SRC-990-EXT-INSTITUTE-FOR-WOMEN-S-POLICY-RESEARCH",
    "SRC-990-EXT-CENTER-FOR-LAW-AND-SOCIAL-POLICY",
    "SRC-990-EXT-ANIMAL-EQUALITY",
    "SRC-990-EXT-COMPASSION-IN-WORLD-FARMING-USA",
    "SRC-990-EXT-PROJECT-HEALTHY-CHILDREN",
    "SRC-990-EA-CENTER-FOR-ELECTION-SCIENCE",
    "SRC-990-EA-FORESIGHT-INSTITUTE",
    "SRC-990-EA-LEVERAGE-RESEARCH",
    "SRC-990-EA-QUALIA-RESEARCH-INSTITUTE",
    "SRC-990-EA-MAGNIFY-MENTORING",
    "SRC-990-EA-GIVEWELL",
    "SRC-990-EA-COPENHAGEN-CONSENSUS-CENTER",
    "SRC-990-RECOVERY-LEEP::clare-donaldson",
    "SRC-990-RECOVERY-LEEP::lucia-coulter",
    "SRC-AD-SEATTLEBG",
}
EXPECTED_PROMOTIONS = {
    "SRC-990-EA-CENTER-FOR-ELECTION-SCIENCE",
    "SRC-990-EA-FORESIGHT-INSTITUTE",
    "SRC-990-EA-LEVERAGE-RESEARCH",
    "SRC-990-EA-MAGNIFY-MENTORING",
    "SRC-990-EA-GIVEWELL",
    "SRC-990-EA-COPENHAGEN-CONSENSUS-CENTER",
}
EXPECTED_PROMOTED_BASE = {
    "SRC-990-EA-CENTER-FOR-ELECTION-SCIENCE",
    "SRC-990-EA-FORESIGHT-INSTITUTE",
    "SRC-990-EA-GIVEWELL",
    "SRC-990-EA-COPENHAGEN-CONSENSUS-CENTER",
}


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def reviewed_boolean(value: str) -> bool:
    normalized = value.strip().casefold()
    if normalized in {"true", "yes", "1"}:
        return True
    if normalized in {"false", "no", "0"}:
        return False
    raise ValueError(f"Unexpected reviewed boolean: {value!r}")


def app_payload() -> dict:
    prefix = "window.CEO_BENCHMARK_DATA = "
    contents = APP_DATA.read_text(encoding="utf-8").strip()
    if not contents.startswith(prefix) or not contents.endswith(";"):
        raise ValueError("app-data.js does not contain the expected generated payload")
    return json.loads(contents[len(prefix):-1])


def main() -> None:
    review_rows = rows(REVIEW)
    review_ids = {row["observation_id"] for row in review_rows}
    if review_ids != EXPECTED_IDS or len(review_rows) != len(review_ids):
        raise ValueError("Living peer-universe review does not contain the audited 16-row boundary")

    payload = app_payload()
    observations = payload["incumbents"] + payload["jobAds"]
    by_id = {row["id"]: row for row in observations}
    promoted: set[str] = set()
    promoted_base: set[str] = set()
    for reviewed in review_rows:
        observation_id = reviewed["observation_id"]
        generated = by_id.get(observation_id)
        if generated is None:
            raise ValueError(f"Reviewed observation is absent from the app: {observation_id}")
        if generated["organization"] != reviewed["organization"]:
            raise ValueError(f"Reviewed organization changed: {observation_id}")
        if generated["evidenceStream"] != reviewed["evidence_stream"]:
            raise ValueError(f"Reviewed evidence stream changed: {observation_id}")

        legacy = reviewed_boolean(reviewed["legacy_default_included"])
        living = reviewed_boolean(reviewed["living_default_included"])
        if generated.get("legacyDefaultIncluded") is not legacy:
            raise ValueError(f"Generated historical disposition changed: {observation_id}")
        if generated.get("defaultIncluded") is not living:
            raise ValueError(f"Generated living disposition changed: {observation_id}")
        if generated.get("analysisStatus") != reviewed["living_analysis_status"]:
            raise ValueError(f"Generated analysis status changed: {observation_id}")
        if generated.get("tier") != reviewed["living_tier"]:
            raise ValueError(f"Generated tier changed: {observation_id}")
        living_metadata = generated.get("livingPeerReview", {})
        if living_metadata.get("disposition") != reviewed["observation_disposition"]:
            raise ValueError(f"Generated observation disposition changed: {observation_id}")
        if living_metadata.get("scoreStatus") != reviewed["score_status"]:
            raise ValueError(f"Generated score status changed: {observation_id}")
        if living_metadata.get("reason") != reviewed["nonpay_reason"]:
            raise ValueError(f"Generated pay-blind rationale changed: {observation_id}")
        if living_metadata.get("weightTreatment") != reviewed["weight_treatment"]:
            raise ValueError(f"Generated weighting treatment changed: {observation_id}")
        if reviewed["review_date"] != "2026-08-30":
            raise ValueError(f"Unexpected living-review date: {observation_id}")

        reason = reviewed["nonpay_reason"].casefold()
        if "$" in reason or re.search(r"unusually\s+(?:low|high)|another officer was paid more", reason):
            raise ValueError(f"Compensation magnitude leaked into peer disposition: {observation_id}")
        if living != (reviewed["observation_disposition"] == "default"):
            raise ValueError(f"Default/disposition conflict: {observation_id}")
        if living and (generated["salary"].get("cash") or 0) <= 0:
            raise ValueError(f"Living default lacks a positive named pay point: {observation_id}")

        if living and not legacy:
            promoted.add(observation_id)
            if generated["salary"].get("base") is not None:
                promoted_base.add(observation_id)
            if generated.get("averageHoursPerWeek") != 40:
                raise ValueError(f"Promoted observation is not a reviewed 40-hour role: {observation_id}")

    if promoted != EXPECTED_PROMOTIONS:
        raise ValueError(f"Unexpected living-default promotions: {sorted(promoted)}")
    if promoted_base != EXPECTED_PROMOTED_BASE:
        raise ValueError(f"Unexpected Schedule J base promotions: {sorted(promoted_base)}")

    incumbents = payload["incumbents"]
    jobs = payload["jobAds"]
    default_base = [
        row for row in observations
        if row["defaultIncluded"] and row["salary"].get("base") is not None
    ]
    checks = {
        "default incumbent cash rows": sum(
            row["defaultIncluded"] and row["salary"].get("cash") is not None
            for row in incumbents
        ),
        "default incumbent base rows": sum(
            row["defaultIncluded"] and row["salary"].get("base") is not None
            for row in incumbents
        ),
        "default job-ad rows": sum(row["defaultIncluded"] for row in jobs),
        "default combined base rows": len(default_base),
        "default combined base organizations": len({row["organization"] for row in default_base}),
    }
    expected_checks = {
        "default incumbent cash rows": 122,
        "default incumbent base rows": 114,
        "default job-ad rows": 17,
        "default combined base rows": 131,
        "default combined base organizations": 128,
    }
    if checks != expected_checks:
        raise ValueError(f"Living peer-universe count reconciliation changed: {checks}")

    summary = payload["summary"]
    if summary.get("livingPeerReviewedObservations") != 16:
        raise ValueError("Generated summary has the wrong living-review row count")
    if summary.get("livingPeerPromotedObservations") != 6:
        raise ValueError("Generated summary has the wrong promotion count")
    print(
        "Validated the 16-row living peer-universe amendment: six pay-blind promotions, "
        "122 default incumbent cash rows, 114 default incumbent base rows, and "
        "131 default all-evidence base observations across 128 organizations."
    )


if __name__ == "__main__":
    main()
