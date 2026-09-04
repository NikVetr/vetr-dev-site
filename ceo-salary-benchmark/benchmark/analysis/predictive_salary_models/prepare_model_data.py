#!/usr/bin/env python3
"""Prepare the versioned CEO predictive-model cohort from generated app data.

This script is deliberately salary-blind when it creates feature categories. It
keeps filing observations exact, keeps recruitment observations as intervals,
and assigns every record from the same organization to the same outer-CV fold.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

from predictive_model_contract import predictive_model_input_sha256  # noqa: E402

DEFAULT_INPUT = ROOT / "app-data.js"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "training_data.csv"
DEFAULT_METADATA = Path(__file__).resolve().parent / "training_metadata.json"
SEED = 20260903


def load_app_data(path: Path) -> dict:
    raw = path.read_text(encoding="utf-8")
    prefix = "window.CEO_BENCHMARK_DATA = "
    if not raw.startswith(prefix) or not raw.rstrip().endswith(";"):
        raise ValueError(f"Unexpected app-data wrapper: {path}")
    return json.loads(raw[len(prefix) :].strip().removesuffix(";"))


def positive(value: object) -> float | None:
    if not isinstance(value, (int, float)):
        return None
    value = float(value)
    return value if math.isfinite(value) and value > 0 else None


def broad_focus(value: str) -> str:
    value = value.casefold()
    rules = (
        ("Animal welfare / food", ("animal", "food system")),
        ("Climate / environment", ("climate", "environment", "energy", "conservation")),
        ("Global health / development", ("global health", "global development", "poverty", "biomedical", "health policy", "health, workforce")),
        ("AI / technology", ("ai,", "artificial intelligence", "technology", "digital", "internet", "software", "data science", "open technology")),
        ("Security / governance", ("security", "nuclear", "foreign policy", "election", "justice", "law", "democracy")),
        ("Philanthropy / nonprofit support", ("philanthropy", "nonprofit infrastructure", "effective giving", "charity research")),
        ("Research / evidence", ("research", "evaluation", "evidence", "open science", "open knowledge", "policy")),
        ("Education / public engagement", ("education", "culture", "public engagement")),
    )
    for label, needles in rules:
        if any(needle in value for needle in needles):
            return label
    return "Other focus"


def broad_structure(value: str) -> str:
    value = value.casefold()
    if "fiscal" in value or "umbrella" in value:
        return "Fiscally sponsored / umbrella"
    if "membership" in value or "network" in value:
        return "Membership / network"
    if "affiliat" in value or "group" in value:
        return "Affiliated group"
    if "independent" in value or "501(c)(3)" in value or "charity" in value:
        return "Independent nonprofit"
    return "Other organization type"


def broad_location(value: str) -> str:
    value = value.casefold()
    if "international" in value or "/" in value and "united states" in value:
        return "International / multi-country"
    if value in {"germany", "united kingdom"}:
        return "Outside United States"
    if value:
        return "United States"
    return "Location not reported"


def normalize_ea(value: str) -> str:
    return {
        "functional-only": "Functional overlap",
        "ea-adjacent": "EA-adjacent",
        "ea-core": "EA-core",
    }.get(value.casefold(), "EA relationship not coded")


def normalize_title(value: str) -> str:
    return value if value in {"CEO", "Executive Director", "President"} else "Other executive title"


def canonical_group(row: dict) -> str:
    organization = str(row.get("organization") or "").strip()
    if not organization:
        raise ValueError(f"Training row lacks organization: {row.get('id')}")
    return " ".join(organization.casefold().split())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--metadata", type=Path, default=DEFAULT_METADATA)
    args = parser.parse_args()

    data = load_app_data(args.input)
    prepared: list[dict[str, object]] = []
    source_rows = [
        *(('filing', row) for row in data["incumbents"]),
        *(('job_ad', row) for row in data["jobAds"]),
    ]
    for source, row in source_rows:
        if not row.get("defaultIncluded"):
            continue
        if row.get("analysisStatus") == "reference_not_analyzed" or row.get("id") == data.get("rpReference", {}).get("id"):
            raise ValueError("RP reference must never enter the predictive-model cohort")
        midpoint = positive((row.get("salary") or {}).get("base"))
        if source == "filing":
            if midpoint is None:
                continue
            lower = upper = midpoint
            observation = "exact"
        else:
            salary_range = row.get("range") or {}
            lower, upper = positive(salary_range.get("low")), positive(salary_range.get("high"))
            if midpoint is None or lower is None or upper is None or lower > midpoint or midpoint > upper:
                raise ValueError(f"Invalid advertised range for {row.get('id')}")
            observation = "advertised_point" if lower == upper else "interval"

        prepared.append({
            "id": row["id"],
            "organization": row["organization"],
            "organization_group": canonical_group(row),
            "source": source,
            "observation": observation,
            "salary_midpoint": midpoint,
            "salary_lower": lower,
            "salary_upper": upper,
            "expenses": positive(row.get("expenses")),
            "revenue": positive(row.get("revenue")),
            "staff": positive(row.get("staff")),
            "compensation_year": int(row["compensationYear"]),
            "focus_area": broad_focus(str(row.get("topic") or "")),
            "ea_relationship": normalize_ea(str(row.get("eaAffinity") or "")),
            "organization_type": broad_structure(str(row.get("structure") or "")),
            "title_group": normalize_title(str(row.get("titleGroup") or "")),
            "location_scope": broad_location(str(row.get("location") or "")),
        })

    organizations = sorted({str(row["organization_group"]) for row in prepared})
    shuffled = organizations[:]
    random.Random(SEED).shuffle(shuffled)
    folds = {organization: index % 10 + 1 for index, organization in enumerate(shuffled)}
    for row in prepared:
        row["outer_fold"] = folds[str(row["organization_group"])]

    fieldnames = list(prepared[0])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(prepared)

    exact = [row for row in prepared if row["observation"] == "exact"]
    advertised = [row for row in prepared if row["source"] == "job_ad"]
    intervals = [row for row in advertised if row["observation"] == "interval"]
    categorical_keys = ["focus_area", "ea_relationship", "organization_type", "title_group", "location_scope"]
    metadata = {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "trainingInputSha256": predictive_model_input_sha256(data),
        "target": "log July 2026-adjusted annual base salary",
        "foldRule": "Ten deterministic organization-grouped folds; filing and posting records with the same normalized organization name share a fold.",
        "counts": {
            "records": len(prepared),
            "organizations": len(organizations),
            "exactFilings": len(exact),
            "advertisedRecords": len(advertised),
            "advertisedRanges": len(intervals),
            "advertisedPointAmounts": len(advertised) - len(intervals),
        },
        "categoryCounts": {
            key: {level: sum(row[key] == level for row in prepared) for level in sorted({str(row[key]) for row in prepared})}
            for key in categorical_keys
        },
        "missingContinuous": {
            key: sum(row[key] is None for row in prepared)
            for key in ("expenses", "revenue", "staff")
        },
        "rpProfile": {
            "expenses": positive(data["rpReference"].get("expenses")),
            "revenue": positive(data["rpReference"].get("revenue")),
            "staff": positive(data["rpReference"].get("staff")),
            "compensation_year": int(data["rpReference"]["compensationYear"]),
            "focus_area": "Research / evidence",
            "ea_relationship": "EA-core",
            "organization_type": "Independent nonprofit",
            "title_group": "CEO",
            "location_scope": "International / multi-country",
            "reference_salary": positive((data["rpReference"].get("salary") or {}).get("base")),
        },
        "provenance": {
            "trainingCsvSha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
            "prepareScriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "fitScriptSha256": hashlib.sha256((Path(__file__).parent / "fit_salary_models.R").read_bytes()).hexdigest(),
            "stanModelSha256": hashlib.sha256((Path(__file__).parent / "ceo_salary_model.stan").read_bytes()).hexdigest(),
        },
    }
    args.metadata.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {args.output} with {len(exact)} exact filings and "
        f"{len(advertised)} advertised records across {len(organizations)} organizations"
    )


if __name__ == "__main__":
    main()
