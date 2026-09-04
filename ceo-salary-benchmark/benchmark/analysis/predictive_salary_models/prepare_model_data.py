#!/usr/bin/env python3
"""Prepare the versioned CEO predictive-model cohort from generated app data.

This script is deliberately salary-blind when it creates feature categories. It
keeps Schedule J base pay distinct from Part VII cash proxies, keeps recruitment
observations as intervals, and assigns every record from the same organization
to the same outer-CV fold.
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

from predictive_model_contract import (  # noqa: E402
    predictive_model_input_sha256,
    predictive_training_eligible,
)

DEFAULT_INPUT = ROOT / "app-data.js"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "training_data.csv"
DEFAULT_METADATA = Path(__file__).resolve().parent / "training_metadata.json"
OPERATING_METADATA = ROOT / "benchmark" / "enrichment" / "organization_operating_metadata.csv"
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


def tristate(value: object) -> bool | None:
    normalized = str(value or "").strip().casefold()
    if normalized in {"true", "yes", "1"}:
        return True
    if normalized in {"false", "no", "0"}:
        return False
    if normalized in {"", "unknown", "not reported", "unclear"}:
        return None
    raise ValueError(f"Invalid three-state value: {value!r}")


def attach_operating_metadata(data: dict, path: Path) -> None:
    """Apply the same organization-level metadata used by the generated app.

    Reading the reviewed CSV directly breaks the otherwise circular dependency
    between rebuilding app-data.js and regenerating its model artifact.
    """
    with path.open(encoding="utf-8", newline="") as handle:
        metadata_rows = list(csv.DictReader(handle))
    by_organization: dict[str, dict[str, str]] = {}
    for metadata in metadata_rows:
        organization = str(metadata.get("organization") or "").strip()
        if not organization or organization in by_organization:
            raise ValueError(f"Blank or duplicate operating-metadata organization: {organization!r}")
        by_organization[organization] = metadata

    app_rows = [*data["incumbents"], *data["jobAds"], data["rpReference"]]
    missing = sorted({row["organization"] for row in app_rows} - by_organization.keys())
    if missing:
        raise ValueError(f"Operating metadata is missing model organizations: {missing}")
    for row in app_rows:
        metadata = by_organization[row["organization"]]
        remote = tristate(metadata.get("is_remote"))
        remote_category = str(metadata.get("remote_category") or "").strip().casefold()
        expected = "remote" if remote is True else "in-person / hybrid" if remote is False else "unknown"
        if remote_category != expected:
            raise ValueError(
                f"Remote flag/category mismatch for {row['organization']}: "
                f"{metadata.get('is_remote')!r}/{metadata.get('remote_category')!r}"
            )
        row["remoteCategory"] = "Remote" if remote is True else "In-person / hybrid" if remote is False else "Unknown"
        row["servesAsFiscalSponsor"] = tristate(metadata.get("serves_as_fiscal_sponsor"))


FOCUS_BY_TOPIC = {
    "ai, catastrophic risk, biosecurity, and technology policy": "AI / technology",
    "animal welfare and food systems": "Animal welfare / food",
    "climate, environment, and conservation": "Climate / environment",
    "climate, environment, and evidence": "Climate / environment",
    "conflict prevention and security": "Security / governance",
    "ea community and career field building": "Philanthropy / nonprofit support",
    "ea infrastructure and effective giving": "Philanthropy / nonprofit support",
    "education, culture, and public engagement": "Education / public engagement",
    "global health, development, and evidence": "Global health / development",
    "health, workforce, and biomedical research": "Global health / development",
    "justice, housing, and social policy": "Security / governance",
    "open science, research infrastructure, and knowledge dissemination": "Research / evidence",
    "philanthropy and nonprofit infrastructure": "Philanthropy / nonprofit support",
    "research, evaluation, and policy": "Research / evidence",
    "research, evaluation, policy, or ea-adjacent evidence organization": "Research / evidence",
    "charity research, cost-effectiveness evaluation, grant recommendation and donor services": "Philanthropy / nonprofit support",
    "climate and evidence": "Climate / environment",
    "data science and social impact": "AI / technology",
    "election science and policy": "Security / governance",
    "global development and climate": "Global health / development",
    "global health and development": "Global health / development",
    "global health policy and implementation": "Global health / development",
    "health policy and evidence": "Global health / development",
    "nuclear risk and climate": "Security / governance",
    "nuclear risk and security": "Security / governance",
    "open knowledge and journalism": "Research / evidence",
    "open knowledge and policy data": "Research / evidence",
    "open science infrastructure": "Research / evidence",
    "open technology infrastructure": "AI / technology",
    "philanthropy infrastructure": "Philanthropy / nonprofit support",
    "policy and evidence": "Research / evidence",
    "policy prioritization and economic research": "Research / evidence",
    "research and evaluation": "Research / evidence",
    "security and foreign policy": "Security / governance",
    "social-science research": "Research / evidence",
    "technology policy and talent": "AI / technology",
    "technology research and field building": "AI / technology",
}


# Two inherited source labels combine several substantively different fields.
# These pay-blind, organization-level overrides keep those labels from turning
# into one arbitrary model category because of substring order.
FOCUS_BY_ORGANIZATION = {
    "American Immigration Council": "Security / governance",
    "Arms Control Association": "Security / governance",
    "Bipartisan Policy Center": "Research / evidence",
    "Bulletin of the Atomic Scientists": "Security / governance",
    "Center for a New American Security": "Security / governance",
    "Center for Effective Philanthropy": "Philanthropy / nonprofit support",
    "Center for Open Science": "Research / evidence",
    "Center for Public Integrity": "Research / evidence",
    "Charity Navigator": "Philanthropy / nonprofit support",
    "Chicago Council on Global Affairs": "Security / governance",
    "Code for Science & Society": "Research / evidence",
    "Committee for a Responsible Federal Budget": "Research / evidence",
    "Council on Strategic Risks": "Security / governance",
    "Data Quality Campaign": "Education / public engagement",
    "Demos": "Research / evidence",
    "Economic Policy Institute": "Research / evidence",
    "Exponent Philanthropy": "Philanthropy / nonprofit support",
    "Federation of American Scientists": "Security / governance",
    "FrameWorks Institute": "Research / evidence",
    "Grantmakers for Effective Organizations": "Philanthropy / nonprofit support",
    "Guttmacher Institute": "Global health / development",
    "Independent Sector": "Philanthropy / nonprofit support",
    "Institute for Policy Studies": "Research / evidence",
    "Institute for Security and Technology": "Security / governance",
    "Institute for the Study of War": "Security / governance",
    "Institute on Taxation and Economic Policy": "Research / evidence",
    "Migration Policy Institute": "Research / evidence",
    "National Committee for Responsive Philanthropy": "Philanthropy / nonprofit support",
    "National Employment Law Project": "Research / evidence",
    "New America": "Research / evidence",
    "Nuclear Threat Initiative": "Security / governance",
    "Open Markets Institute": "Research / evidence",
    "PEAK Grantmaking": "Philanthropy / nonprofit support",
    "Peterson Institute for International Economics": "Research / evidence",
    "Physicians for Social Responsibility": "Security / governance",
    "Public Agenda": "Research / evidence",
    "Quincy Institute for Responsible Statecraft": "Security / governance",
    "Research!America": "Global health / development",
    "Roosevelt Institute": "Research / evidence",
    "San Francisco Estuary Institute": "Climate / environment",
    "Social Science Research Council": "Research / evidence",
    "Stimson Center": "Security / governance",
    "Tax Foundation": "Research / evidence",
    "Technical Assistance Collaborative": "Research / evidence",
    "The Sentencing Project": "Security / governance",
    "Third Way Institute": "Research / evidence",
    "Vera Institute of Justice": "Security / governance",
    "World Justice Project": "Security / governance",
}


def broad_focus(value: str, organization: str) -> str:
    if organization in FOCUS_BY_ORGANIZATION:
        return FOCUS_BY_ORGANIZATION[organization]
    normalized = " ".join(value.casefold().split())
    if normalized == "research, evaluation, philanthropy infrastructure, and policy":
        raise ValueError(f"Missing reviewed focus override for {organization!r}")
    try:
        return FOCUS_BY_TOPIC[normalized]
    except KeyError as error:
        raise ValueError(f"Unreviewed model focus: {value!r} for {organization!r}") from error


def broad_structure(value: str) -> str:
    value = value.casefold()
    if "fiscally sponsored" in value or "sponsored project" in value:
        return "Fiscally sponsored project"
    if "fiscal sponsor" in value or "umbrella" in value:
        return "Fiscal sponsor / umbrella"
    if "membership" in value or "network" in value:
        return "Membership / network"
    if "affiliat" in value or "group" in value:
        return "Affiliated group"
    if "independent" in value or "501(c)(3)" in value or "charity" in value:
        return "Independent nonprofit"
    return "Other organization type"


def broad_location(value: str) -> str:
    """Map reviewed source locations without treating unknown text as U.S.-based."""
    normalized = " ".join(value.casefold().split())
    location_groups = {
        "International / multi-country": {
            "international / united kingdom",
            "us/international",
            "united states / international",
        },
        "Outside United States": {
            "germany",
            "remote / gombe, nigeria",
            "united kingdom",
        },
        "United States": {
            "boston, massachusetts",
            "bothell, washington / statewide washington",
            "chicago, illinois",
            "denver, colorado",
            "jefferson city, missouri",
            "los angeles, california",
            "louisville, kentucky",
            "oakland, ca or washington, dc",
            "redwood city, california",
            "remote us",
            "remote with midwest travel",
            "remote/hybrid; west coast preferred",
            "reno or las vegas, nevada",
            "richmond, california",
            "seattle, wa",
            "seattle/remote",
            "trenton, new jersey",
            "us",
            "united states",
            "washington state",
            "washington, dc",
            "wilmington, delaware",
        },
        "Location not reported": {"", "remote"},
    }
    matches = [label for label, values in location_groups.items() if normalized in values]
    if len(matches) != 1:
        raise ValueError(f"Unreviewed model location: {value!r}")
    return matches[0]


def normalize_ea(value: str) -> str:
    return {
        "functional-only": "Functional overlap",
        "ea-adjacent": "EA-adjacent",
        "ea-core": "EA-adjacent",
    }.get(value.casefold(), "EA relationship not coded")


def normalize_title(value: str) -> str:
    return value if value in {"CEO", "Executive Director", "President", "Co-leadership"} else "Other executive title"


def normalize_remote(value: object) -> str:
    return {
        "remote": "Remote",
        "in-person / hybrid": "In-person / hybrid",
        "unknown": "Unknown",
    }.get(str(value or "").strip().casefold(), "Unknown")


def normalize_fiscal_sponsor(value: object) -> str:
    if value is True:
        return "Serves as fiscal sponsor"
    if value is False:
        return "Does not serve as fiscal sponsor"
    return "Unknown"


def canonical_group(row: dict) -> str:
    organization = str(row.get("organization") or "").strip()
    if not organization:
        raise ValueError(f"Training row lacks organization: {row.get('id')}")
    return " ".join(organization.casefold().split())


def is_rp_reference(row: dict, rp_reference: dict) -> bool:
    return (
        row.get("analysisStatus") == "reference_not_analyzed"
        or row.get("id") == rp_reference.get("id")
        or canonical_group(row) == canonical_group(rp_reference)
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--metadata", type=Path, default=DEFAULT_METADATA)
    parser.add_argument("--operating-metadata", type=Path, default=OPERATING_METADATA)
    args = parser.parse_args()

    data = load_app_data(args.input)
    attach_operating_metadata(data, args.operating_metadata)
    prepared: list[dict[str, object]] = []
    source_rows = [
        *(('filing', row) for row in data["incumbents"]),
        *(('job_ad', row) for row in data["jobAds"]),
    ]
    for source, row in source_rows:
        if not predictive_training_eligible(source, row):
            continue
        if is_rp_reference(row, data["rpReference"]):
            raise ValueError("RP reference must never enter the predictive-model cohort")
        salary = row.get("salary") or {}
        base = positive(salary.get("base"))
        cash = positive(salary.get("cash"))
        if source == "filing":
            if base is not None:
                midpoint = lower = upper = base
                observation = "exact_base"
            elif cash is not None:
                midpoint = lower = upper = cash
                observation = "cash_proxy"
            else:
                continue
        else:
            midpoint = base
            salary_range = row.get("range") or {}
            lower, upper = positive(salary_range.get("low")), positive(salary_range.get("high"))
            if midpoint is None and lower is None and upper is None:
                continue
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
            "cash_proxy": cash,
            "expenses": positive(row.get("expenses")),
            # Recruitment records expose one budget-or-expense scale field.
            # Keep it as the expense proxy and leave revenue latent instead of
            # entering the same source number twice under different labels.
            "revenue": None if source == "job_ad" else positive(row.get("revenue")),
            "staff": positive(row.get("staff")),
            "highest_other_base": positive(
                (((row.get("highestPaidOtherEmployee") or {}).get("base") or {}).get("adjusted"))
            ),
            "compensation_year": int(row["compensationYear"]),
            "focus_area": broad_focus(str(row.get("topic") or ""), str(row.get("organization") or "")),
            "ea_relationship": normalize_ea(str(row.get("eaAffinity") or "")),
            "organization_type": broad_structure(str(row.get("structure") or "")),
            "title_group": normalize_title(str(row.get("titleGroup") or "")),
            "location_scope": broad_location(str(row.get("location") or "")),
            "remote_category": normalize_remote(row.get("remoteCategory")),
            "fiscal_sponsor_category": normalize_fiscal_sponsor(row.get("servesAsFiscalSponsor")),
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
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(prepared)

    exact = [row for row in prepared if row["observation"] == "exact_base"]
    cash_proxy = [row for row in prepared if row["observation"] == "cash_proxy"]
    advertised = [row for row in prepared if row["source"] == "job_ad"]
    intervals = [row for row in advertised if row["observation"] == "interval"]
    categorical_keys = [
        "focus_area", "ea_relationship", "organization_type", "title_group",
        "location_scope", "remote_category", "fiscal_sponsor_category",
    ]
    metadata = {
        "schemaVersion": 2,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seed": SEED,
        "trainingInputSha256": predictive_model_input_sha256(data),
        "target": "log July 2026-adjusted annual base salary",
        "foldRule": "Ten deterministic organization-grouped folds; filing and posting records with the same normalized organization name share a fold.",
        "counts": {
            "records": len(prepared),
            "organizations": len(organizations),
            "exactFilings": len(exact),
            "cashProxyFilings": len(cash_proxy),
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
            for key in ("expenses", "revenue", "staff", "highest_other_base")
        },
        "rpProfile": {
            "expenses": positive(data["rpReference"].get("expenses")),
            "revenue": positive(data["rpReference"].get("revenue")),
            "staff": positive(data["rpReference"].get("staff")),
            "highest_other_base": positive(
                ((data["rpReference"].get("highestPaidOtherEmployee") or {}).get("base") or {}).get("adjusted")
            ),
            "focus_area": "Research / evidence",
            "ea_relationship": "EA-adjacent",
            "organization_type": "Independent nonprofit",
            "title_group": "CEO",
            "location_scope": "International / multi-country",
            "remote_category": normalize_remote(data["rpReference"].get("remoteCategory")),
            "fiscal_sponsor_category": normalize_fiscal_sponsor(data["rpReference"].get("servesAsFiscalSponsor")),
            "reference_salary": positive((data["rpReference"].get("salary") or {}).get("base")),
        },
        "provenance": {
            "trainingCsvSha256": hashlib.sha256(args.output.read_bytes()).hexdigest(),
            "prepareScriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "fitScriptSha256": hashlib.sha256((Path(__file__).parent / "fit_salary_models.R").read_bytes()).hexdigest(),
            "stanModelSha256": hashlib.sha256((Path(__file__).parent / "ceo_salary_model.stan").read_bytes()).hexdigest(),
            "utilsScriptSha256": hashlib.sha256((Path(__file__).parent / "model_utils.R").read_bytes()).hexdigest(),
            "contractScriptSha256": hashlib.sha256((ROOT / "scripts" / "predictive_model_contract.py").read_bytes()).hexdigest(),
        },
    }
    args.metadata.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(
        f"wrote {args.output} with {len(exact)} exact-base filings, "
        f"{len(cash_proxy)} cash-proxy filings, and "
        f"{len(advertised)} advertised records across {len(organizations)} organizations"
    )


if __name__ == "__main__":
    main()
