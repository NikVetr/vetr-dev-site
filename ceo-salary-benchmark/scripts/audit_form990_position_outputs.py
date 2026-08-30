#!/usr/bin/env python3
"""Independently audit the generated Form 990 position artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
ENRICHMENT = ROOT / "benchmark" / "enrichment"
OBSERVATIONS = ENRICHMENT / "form990_position_observations.csv"
TAXONOMY = ENRICHMENT / "form990_position_taxonomy.csv"
SUPPORTING = ENRICHMENT / "form990_position_supporting_sources.csv"
CATALOG = ENRICHMENT / "form990_benchmark_position_catalog.csv"

EXPECTED = {
    "observations": 2785,
    "taxonomy_groups": 884,
    "catalog_eligible": 989,
    "role_eligible": 772,
    "default_included": 750,
    "supporting_sources": 19,
    "source_filings": 136,
    "schedule_j": 814,
    "primary_positions": 14,
}

EXPECTED_REVIEW_STATUS = {
    "rule_assigned": 559,
    "rule_assigned_multi_role": 74,
    "reviewed_observation_override": 129,
    "manual_review_required": 122,
}

EXPECTED_EFFECTIVE_ROWS = {
    "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::elenamuehlenbeckcfo": ("ELENA MUEHLENBECK", "CFO", "cfo"),
    "SRC-990-EXT-BIPARTISAN-POLICY-CENTER::liselloyevpcoo": ("LISEL LOY", "EVP COO", "coo"),
    "SRC-990-EXT-CENTER-FOR-AI-SAFETY::oliverzhangmanagingdirector": ("Oliver Zhang", "Managing Director", "managing_director"),
    "SRC-990-EXT-NEW-ROOTS-INSTITUTE::jessetandlermanaging": ("Jesse Tandler", "Managing Director", "managing_director"),
    "SRC-990-EXT-RESEARCH-AMERICA::jenniferluraysrvp": ("JENNIFER LURAY", "SR VP", "senior_vice_president"),
    "SRC-990-EXT-CENTER-FOR-DEMOCRACY-TECHNOLOGY::georgeslovergencounsel": ("GEORGE SLOVER", "GEN COUNSEL", "general_counsel"),
    "SRC-990-EXT-PROJECT-DRAWDOWN::reshmapattni": ("RESHMA PATTNI", "FINANCE DIRECTOR", "finance_director"),
    "SRC-990-EXT-PROJECT-DRAWDOWN::toodreubold": ("TOOD REUBOLD", "MARKETING DIRECTOR", "communications_director"),
    "SRC-990-EXT-PARTNERSHIP-ON-AI::feleciawebb": ("FELECIA WEBB", "Chief Strategy Officer, Philanthropy and Partnerships", "chief_strategy_officer"),
    "SRC-990-EXT-PARTNERSHIP-ON-AI::stephaniebell": ("STEPHANIE BELL", "Chief Programs and Insights Officer", ""),
}

EXPECTED_EVP_ROWS = {
    "SRC-990-EXT-COUNCIL-ON-STRATEGIC-RISKS::mallorystewart",
    "SRC-990-EXT-EVIDENCE-ACTION::brettsedgewick",
    "SRC-990-EXT-EVIDENCE-ACTION::paulbyatta",
    "SRC-990-EXT-CENTER-FOR-RESPONSIBLE-LENDING::ellenharnick",
}


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def integer(value: str) -> int:
    return int(float(value)) if value.strip() else 0


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    observations = rows(OBSERVATIONS)
    taxonomy = rows(TAXONOMY)
    supporting = rows(SUPPORTING)
    catalog = rows(CATALOG)

    if len(observations) != EXPECTED["observations"]:
        raise ValueError("Unexpected observation count")
    if len({row["observation_id"] for row in observations}) != len(observations):
        raise ValueError("Duplicate observation ID")
    if len(taxonomy) != EXPECTED["taxonomy_groups"] or len({row["taxonomy_id"] for row in taxonomy}) != len(taxonomy):
        raise ValueError("Unexpected or duplicate taxonomy groups")

    counts = {
        "catalog_eligible": sum(row["catalog_eligible"] == "yes" for row in observations),
        "role_eligible": sum(row["role_eligible"] == "yes" for row in observations),
        "default_included": sum(row["default_included"] == "yes" for row in observations),
        "schedule_j": sum(row["schedule_j_present"] == "yes" for row in observations),
        "supporting_sources": len(supporting),
        "primary_positions": sum(row["support_level"] == "primary" for row in catalog),
    }
    for key, value in counts.items():
        if value != EXPECTED[key]:
            raise ValueError(f"Unexpected {key}: {value}")

    review_counts = Counter(row["review_status"] for row in taxonomy)
    if dict(review_counts) != EXPECTED_REVIEW_STATUS:
        raise ValueError(f"Unexpected taxonomy review counts: {dict(review_counts)}")

    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in observations:
        grouped[row["taxonomy_id"]].append(row)
        if row["default_included"] == "yes":
            if (
                row["role_eligible"] != "yes"
                or row["is_rp_reference"] == "yes"
                or float(row["total_reported_hours"] or 0) < 30
                or row["sensitivity_only_reason"]
                or integer(row["part_vii_cash_nominal"]) <= 0
            ):
                raise ValueError(f"Invalid default boundary: {row['observation_id']}")
        if row["schedule_j_present"] == "yes":
            org_total = sum(integer(row[field]) for field in (
                "schedule_j_base_org_nominal", "schedule_j_bonus_org_nominal",
                "schedule_j_other_reportable_org_nominal", "schedule_j_deferred_org_nominal",
                "schedule_j_nontaxable_org_nominal",
            ))
            related_total = sum(integer(row[field]) for field in (
                "schedule_j_base_related_nominal", "schedule_j_bonus_related_nominal",
                "schedule_j_other_reportable_related_nominal", "schedule_j_deferred_related_nominal",
                "schedule_j_nontaxable_related_nominal",
            ))
            if org_total != integer(row["schedule_j_total_org_nominal"]):
                raise ValueError(f"Schedule J organization arithmetic: {row['observation_id']}")
            if related_total != integer(row["schedule_j_total_related_nominal"]):
                raise ValueError(f"Schedule J related arithmetic: {row['observation_id']}")

    taxonomy_by_id = {row["taxonomy_id"]: row for row in taxonomy}
    if grouped.keys() != taxonomy_by_id.keys():
        raise ValueError("Observation/taxonomy ID boundary differs")
    for taxonomy_id, members in grouped.items():
        record = taxonomy_by_id[taxonomy_id]
        if integer(record["record_count"]) != len(members):
            raise ValueError(f"Taxonomy record count: {taxonomy_id}")
        if integer(record["compensated_record_count"]) != sum(integer(row["part_vii_cash_nominal"]) > 0 for row in members):
            raise ValueError(f"Taxonomy compensated count: {taxonomy_id}")
        if integer(record["organization_count"]) != len({row["organization"] for row in members}):
            raise ValueError(f"Taxonomy organization count: {taxonomy_id}")
        for field in (
            "record_type", "position_family", "secondary_role_tags", "title_group",
            "seniority_group", "role_scope", "incumbency_status", "classification_rule",
            "classification_confidence", "benchmark_position", "benchmark_position_rule",
            "benchmark_position_alias_quality", "benchmark_position_hybrid_status",
            "benchmark_position_hybrid_reason",
        ):
            if {row[field] for row in members} != {record[field]}:
                raise ValueError(f"Taxonomy field mismatch {taxonomy_id}/{field}")

    if len({row["source_id"] for row in supporting}) != len(supporting):
        raise ValueError("Duplicate supporting source ID")
    if len({row["observation_id"] for row in supporting}) != len(supporting):
        raise ValueError("Duplicate supporting observation")
    observations_by_id = {row["observation_id"]: row for row in observations}
    for source in supporting:
        path = ROOT / source["local_path"]
        if not path.is_file() or file_hash(path) != source["sha256"]:
            raise ValueError(f"Supporting source hash: {source['source_id']}")
        observation = observations_by_id[source["observation_id"]]
        if (
            observation["classification_source_id"] != source["source_id"]
            or observation["classification_source_url"] != source["canonical_url"]
            or observation["classification_source_local_path"] != source["local_path"]
            or observation["classification_source_sha256"] != source["sha256"]
        ):
            raise ValueError(f"Supporting provenance join: {source['source_id']}")

    filings: dict[str, str] = {}
    for row in observations:
        path = ROOT / row["source_local_path"]
        filings.setdefault(str(path), row["source_sha256"])
        if filings[str(path)] != row["source_sha256"]:
            raise ValueError(f"Conflicting filing hash: {path}")
    if len(filings) != EXPECTED["source_filings"]:
        raise ValueError("Unexpected source filing count")
    for filename, expected_hash in filings.items():
        path = Path(filename)
        if file_hash(path) != expected_hash:
            raise ValueError(f"Filing source hash: {path}")
        ET.fromstring(path.read_bytes())

    actual_effective = {
        observation_id: (
            observations_by_id[observation_id]["effective_person_name"],
            observations_by_id[observation_id]["effective_title"],
            observations_by_id[observation_id]["benchmark_position"],
        )
        for observation_id in EXPECTED_EFFECTIVE_ROWS
    }
    if actual_effective != EXPECTED_EFFECTIVE_ROWS:
        raise ValueError(f"Reviewed effective-title boundary changed: {actual_effective}")
    if any(observations_by_id[row_id]["benchmark_position"] != "executive_vice_president" for row_id in EXPECTED_EVP_ROWS):
        raise ValueError("Reviewed EVP alias escaped its distinct benchmark")

    print(json.dumps({**counts, "observations": len(observations), "taxonomy_groups": len(taxonomy), "source_filings": len(filings)}, sort_keys=True))


if __name__ == "__main__":
    main()
