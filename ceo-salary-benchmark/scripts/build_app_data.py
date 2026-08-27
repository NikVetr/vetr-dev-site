#!/usr/bin/env python3
from __future__ import annotations

import csv
import json
import math
import shutil
import re
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[1]
BENCHMARK = ROOT / "benchmark"
DELIVERABLES = BENCHMARK / "deliverables"
EVIDENCE_DIR = ROOT / "evidence" / "original"
OUTPUT = ROOT / "app-data.js"


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def text(value: object) -> str:
    value = "" if value is None else str(value).strip()
    return "" if value.lower() in {"", "nan", "none"} else value


def number(value: object) -> float | None:
    value = text(value)
    if not value:
        return None
    parsed = float(value)
    return parsed if math.isfinite(parsed) else None


def boolean(value: object) -> bool:
    return text(value).lower() in {"true", "yes", "1"}


def money(value: float | None) -> str:
    return "not reported" if value is None else f"${value:,.0f}"


def slug(source_id: str) -> str:
    return "".join(c.lower() if c.isalnum() else "-" for c in source_id).strip("-")


def normalize_title(value: str) -> str:
    """Consolidate equivalent executive-title spellings without erasing role distinctions."""
    original = text(value)
    if not original:
        return "Not reported"
    normalized = re.sub(r"\s+", " ", original.replace("/", " & ")).strip()
    normalized = re.sub(r"\bChief Executive Officer\b", "CEO", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bChief Exec(?:utive)? Officer\b", "CEO", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bExecutive Director\b", "Executive Director", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\bPresident\b", "President", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+(?:and|&)\s+", " & ", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s*&\s*CEO\b", " & CEO", normalized, flags=re.IGNORECASE)
    return normalized


def cache_source(source_id: str, local_path: str) -> str:
    source = BENCHMARK / local_path
    if not source.is_file():
        return ""
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    suffix = source.suffix.lower() or ".txt"
    destination = EVIDENCE_DIR / f"{slug(source_id)}{suffix}"
    shutil.copy2(source, destination)
    return str(destination.relative_to(ROOT))


def filing_homepage(local_path: str) -> str:
    source = BENCHMARK / local_path
    if not source.is_file() or source.suffix.lower() != ".xml":
        return ""
    try:
        root = ElementTree.parse(source).getroot()
    except ElementTree.ParseError:
        return ""
    for element in root.iter():
        if element.tag.rsplit("}", 1)[-1] == "WebsiteAddressTxt" and text(element.text):
            value = text(element.text)
            if value.lower() in {"n/a", "none", "not applicable"}:
                return ""
            return value if value.lower().startswith(("http://", "https://")) else f"https://{value}"
    return ""


def build_incumbents() -> list[dict]:
    validated = rows(DELIVERABLES / "validated_form990_compensation.csv")
    by_ein = {text(row["ein"]).replace("-", ""): row for row in validated if text(row["ein"])}
    by_org = {text(row["organization"]): row for row in validated}
    reference = rows(DELIVERABLES / "expanded_reference_set.csv")
    output: list[dict] = []
    for peer in reference:
        filing = by_ein.get(text(peer["ein"]).replace("-", "")) or by_org.get(text(peer["organization"]))
        factor = number(filing.get("cpi_factor")) if filing else None
        factor = factor or 1.0
        base = number(filing.get("validated_schedule_j_base_total")) if filing else None
        cash = number(filing.get("validated_cash_proxy")) if filing else None
        total = number(filing.get("validated_total_proxy")) if filing else None
        source_id = text(filing.get("source_id")) if filing else ""
        local_path = text(filing.get("local_path")) if filing else ""
        cached = cache_source(source_id, local_path) if source_id and local_path else ""
        observed_name = text(filing.get("observed_ceo_name")) if filing else ""
        observed_title = text(filing.get("observed_ceo_title")) if filing else ""
        raw_title = observed_title or (text(filing.get("ceo_title")) if filing else "")
        period_end = text(filing.get("tax_period_end")) if filing else ""
        evidence = "No clean compensation observation was retained for this selected reference organization."
        if filing:
            evidence = (
                f"IRS Form 990 for the period ending {period_end}. "
                f"{observed_name or text(filing.get('ceo_name'))}, "
                f"{observed_title or text(filing.get('ceo_title'))}. "
                f"Schedule J base: {money(base)}; Part VII cash/W-2 proxy: {money(cash)}; "
                f"Part VII other compensation: {money(number(filing.get('observed_part_vii_other')))}; "
                f"validated filing total: {money(total)}."
            )
        output.append({
            "id": source_id or f"REF-{slug(text(peer['organization']))}",
            "organization": text(peer["organization"]),
            "executive": observed_name or (text(filing.get("ceo_name")) if filing else ""),
            "title": normalize_title(raw_title),
            "rawTitle": raw_title,
            "tier": text(peer["reference_tier"]),
            "topic": text(peer["topic_cluster"]),
            "eaAffinity": text(peer["ea_affinity"]),
            "location": text(peer["country_or_region"]),
            "remoteStatus": "Not reported in Form 990",
            "structure": text(peer["expected_structure"]),
            "revenue": number(filing.get("observed_revenue")) if filing else number(peer["revenue"]),
            "expenses": number(filing.get("observed_expenses")) if filing else number(peer["expenses"]),
            "staff": number(filing.get("observed_employee_count")) if filing else number(peer["employee_count"]),
            "comparabilityScore": number(peer["comparability_score"]) or 0,
            "compensationYear": number(filing.get("compensation_calendar_year")) if filing else None,
            "salary": {
                "base": round(base * factor, 2) if base is not None else None,
                "cash": round(cash * factor, 2) if cash is not None else None,
                "total": round(total * factor, 2) if total is not None else None,
            },
            "nominalSalary": {"base": base, "cash": cash, "total": total},
            "defaultIncluded": boolean(filing.get("primary_eligible")) if filing else False,
            "structurallyClean": boolean(filing.get("structurally_clean")) if filing else False,
            "founder": text(filing.get("founder_flag")).lower() == "yes" if filing else False,
            "analysisStatus": text(filing.get("analysis_status")) if filing else "selected; no clean observation",
            "auditStatus": text(filing.get("audit_status")) if filing else "no compensation observation",
            "selectionNote": text(peer["selection_note"]),
            "evidenceText": evidence,
            "sourceUrl": text(filing.get("propublica_url")) if filing else text(peer["propublica_url"]),
            "canonicalUrl": text(filing.get("official_irs_url")) if filing else text(peer["official_irs_url"]),
            "cachedSource": cached,
            "localPath": local_path,
            "sourceType": "Form 990",
            "homepageUrl": filing_homepage(local_path) if local_path else "",
        })
    return output


def build_job_ads() -> list[dict]:
    jobs = rows(DELIVERABLES / "validated_job_ad_compensation.csv")
    output: list[dict] = []
    for job in jobs:
        source_id = text(job["source_id"])
        local_path = text(job["local_path"])
        cached = cache_source(source_id, local_path) if local_path else ""
        low = number(job["adjusted_min_jul2026"])
        high = number(job["adjusted_max_jul2026"])
        midpoint = number(job["adjusted_midpoint_jul2026"])
        included = text(job["included_in_quantitative_analysis"])
        evidence = (
            f"Recruitment posting for {text(job['role_title'])}. "
            f"Stated annual salary range: {money(number(job['salary_min']))}–{money(number(job['salary_max']))}; "
            f"July 2026-adjusted midpoint: {money(midpoint)}. "
            f"Location: {text(job['location'])}; work arrangement: {text(job['remote_status']) or 'not reported'}."
        )
        source_url = text(job["resolved_url"]) or text(job["fallback_url_1"]) or text(job["canonical_url"])
        raw_title = text(job["role_title"])
        output.append({
            "id": source_id,
            "organization": text(job["organization"]),
            "executive": "",
            "title": normalize_title(raw_title),
            "rawTitle": raw_title,
            "tier": text(job["tier"]),
            "topic": text(job["mission_operating_model"]),
            "eaAffinity": "Not coded",
            "location": text(job["location"]),
            "remoteStatus": text(job["remote_status"]),
            "structure": text(job["reporting_relationship"]),
            "revenue": number(job["annual_budget_or_expense"]),
            "expenses": number(job["annual_budget_or_expense"]),
            "staff": number(job["staff_count"]),
            "comparabilityScore": 100 if text(job["tier"]) == "strict_primary" else 70,
            "compensationYear": number(text(job["posting_date"])[:4]),
            "salary": {"base": midpoint, "cash": midpoint, "total": midpoint},
            "range": {"low": low, "high": high},
            "nominalSalary": {
                "base": number(job["salary_min"]),
                "cash": number(job["salary_max"]),
                "total": number(job["salary_max"]),
            },
            "defaultIncluded": included == "yes",
            "structurallyClean": text(job["tier"]) == "strict_primary",
            "founder": False,
            "analysisStatus": "included" if included == "yes" else included or "excluded",
            "auditStatus": text(job["audit_status"]),
            "selectionNote": text(job["inclusion_reason"]) or text(job["exclusion_reason"]),
            "evidenceText": evidence,
            "sourceUrl": source_url,
            "canonicalUrl": text(job["original_url"]) or text(job["canonical_url"]),
            "cachedSource": cached,
            "localPath": local_path,
            "sourceType": "Job posting",
            "homepageUrl": "",
        })
    return output


def main() -> None:
    if EVIDENCE_DIR.exists():
        shutil.rmtree(EVIDENCE_DIR)
    incumbents = build_incumbents()
    jobs = build_job_ads()
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "priceBasis": "July 2026 USD",
        "incumbents": incumbents,
        "jobAds": jobs,
        "summary": {
            "selectedReferenceOrganizations": len(incumbents),
            "primaryIncumbentObservations": sum(row["defaultIncluded"] for row in incumbents),
            "validatedBaseObservations": sum(
                row["defaultIncluded"] and row["salary"]["base"] is not None for row in incumbents
            ),
            "quantitativeJobAds": sum(row["defaultIncluded"] for row in jobs),
            "retrievedManifestRecords": 349,
        },
    }
    OUTPUT.write_text(
        "window.CEO_BENCHMARK_DATA = " + json.dumps(payload, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")
    print(f"cached original sources: {len(list(EVIDENCE_DIR.iterdir()))}")


if __name__ == "__main__":
    main()
