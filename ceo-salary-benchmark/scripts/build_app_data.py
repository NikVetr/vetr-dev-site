#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
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
CATEGORY_EXPLAINERS = DELIVERABLES / "category_explainers"
EVIDENCE_DIR = ROOT / "evidence" / "original"
OUTPUT = ROOT / "app-data.js"


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def text(value: object) -> str:
    value = "" if value is None else str(value).strip()
    return "" if value.lower() in {"", "nan", "none"} else value


def literal(value: object) -> str:
    """Preserve category strings such as the meaningful structure flag `none`."""
    return "" if value is None else str(value).strip()


def verify_category_explainer_hashes() -> None:
    manifest = CATEGORY_EXPLAINERS / "CATEGORY_EXPLAINER_HASHES.sha256"
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        expected, relative_path = line.split(maxsplit=1)
        path = BENCHMARK / relative_path.strip()
        if not path.is_file():
            raise FileNotFoundError(f"Missing hashed category-explainer file: {path}")
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"Category-explainer hash mismatch: {path}")


def verify_preserved_paths(value: str, separator: str) -> None:
    for item in value.split(separator):
        path = item.split("#", 1)[0].strip()
        if path.startswith("benchmark/") and not (ROOT / path).is_file():
            raise FileNotFoundError(f"Category explainer cites a missing preserved file: {path}")


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


def title_group(value: str) -> str:
    """Group source-native executive titles without replacing their displayed wording."""
    normalized = normalize_title(value).lower()
    if normalized == "not reported":
        return "Not reported"
    if re.search(r"\bceo\b", normalized):
        return "CEO"
    if "executive director" in normalized:
        return "Executive Director"
    if "co-director" in normalized or "co director" in normalized:
        return "Co-leadership"
    if "president" in normalized:
        return "President"
    return "Other executive titles"


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


def compact_category_rationale(row: dict[str, str]) -> dict:
    return {
        "recordId": literal(row["record_id"]),
        "stableIdType": literal(row["stable_id_type"]),
        "sourceWave": literal(row["source_wave"]),
        "tier": {
            "value": literal(row["tier"]),
            "label": literal(row["tier_label"]),
            "rationale": literal(row["tier_rationale"]),
            "citation": literal(row["tier_citation"]),
        },
        "ea": {
            "value": literal(row["ea_relationship"]),
            "sourceValue": literal(row["ea_relationship_source_value"]),
            "rationale": literal(row["ea_rationale"]),
            "citation": literal(row["ea_citation"]),
        },
        "structure": {
            "expected": literal(row["expected_structure"]),
            "observationFlag": literal(row["observation_structure_flag"]),
            "rationale": literal(row["structure_rationale"]),
            "citation": literal(row["structure_citation"]),
        },
        "topic": {
            "value": literal(row["topic_model"]),
            "sourceDescription": literal(row["source_native_topic_or_model_description"]),
            "rationale": literal(row["topic_model_rationale"]),
            "citation": literal(row["topic_model_citation"]),
        },
        "title": {
            "raw": literal(row["raw_title"]),
            "analysisGroup": literal(row["title_group"]),
            "rationale": literal(row["title_group_rationale"]),
            "citation": literal(row["title_group_citation"]),
        },
        "classificationTiming": literal(row["classification_timing"]),
        "provenanceType": literal(row["provenance_type"]),
        "confidence": literal(row["overall_confidence"]),
        "caveats": literal(row["caveats"]),
    }


def load_category_explainers() -> tuple[dict, dict, dict, dict[str, int]]:
    verify_category_explainer_hashes()
    dictionary_rows = rows(CATEGORY_EXPLAINERS / "category_dictionary.csv")
    rationale_rows = rows(CATEGORY_EXPLAINERS / "organization_category_rationale.csv")
    definitions: dict[str, dict[str, dict[str, str]]] = {}
    for row in dictionary_rows:
        field = literal(row["field"])
        value = literal(row["exact_category_value"])
        if not field or not value:
            raise ValueError("Category dictionary contains a blank field or exact category value")
        if value in definitions.setdefault(field, {}):
            raise ValueError(f"Duplicate category definition: {field}={value}")
        verify_preserved_paths(literal(row["source_path"]), ";")
        definitions[field][value] = {
            "shortDefinition": literal(row["short_display_definition"]),
            "operationalRule": literal(row["detailed_operational_rule"]),
            "weightRationale": literal(row["default_weight_rationale"]),
            "provenanceType": literal(row["provenance_type"]),
            "sourcePath": literal(row["source_path"]),
            "sourceLocator": literal(row["source_locator"]),
            "confidence": literal(row["confidence"]),
            "caveats": literal(row["caveats"]),
        }

    by_source: dict[tuple[str, str], dict] = {}
    references_by_organization: dict[str, dict] = {}
    rationale_counts: dict[str, int] = {}
    for row in rationale_rows:
        stream = literal(row["evidence_stream"])
        rationale_counts[stream] = rationale_counts.get(stream, 0) + 1
        source_id = literal(row["source_id"])
        organization = literal(row["organization"])
        compact = compact_category_rationale(row)
        for citation_field in ("tier_citation", "ea_citation", "structure_citation", "topic_model_citation", "title_group_citation"):
            verify_preserved_paths(literal(row[citation_field]), " | ")
        if source_id:
            key = (stream, source_id)
            if key in by_source:
                raise ValueError(f"Duplicate category rationale: {stream}/{source_id}")
            by_source[key] = compact
        if stream == "reference_selection":
            if organization in references_by_organization:
                raise ValueError(f"Duplicate reference-selection rationale: {organization}")
            references_by_organization[organization] = compact
    return definitions, by_source, references_by_organization, rationale_counts


def category_rationale(
    by_source: dict[tuple[str, str], dict],
    references_by_organization: dict[str, dict],
    stream: str,
    source_id: str,
    organization: str,
) -> dict:
    rationale = by_source.get((stream, source_id)) if source_id else None
    if rationale is None and stream == "form990":
        rationale = references_by_organization.get(organization)
    if rationale is None:
        raise ValueError(f"No category rationale for {stream}/{source_id or organization}")
    return rationale


def build_incumbents(
    by_source: dict[tuple[str, str], dict],
    references_by_organization: dict[str, dict],
) -> list[dict]:
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
        organization = text(peer["organization"])
        selection_rationale = references_by_organization.get(organization)
        if selection_rationale is None:
            raise ValueError(f"No reference-selection category rationale for {organization}")
        app_row = {
            "id": source_id or f"REF-{slug(text(peer['organization']))}",
            "organization": organization,
            "executive": observed_name or (text(filing.get("ceo_name")) if filing else ""),
            "title": raw_title or "Not reported",
            "titleGroup": title_group(raw_title),
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
            "cpiFactor": factor,
            "cpiPeriod": f"{int(number(filing.get('compensation_calendar_year')))} annual average" if filing and number(filing.get("compensation_calendar_year")) else "",
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
            "evidenceStream": "incumbents",
            "homepageUrl": filing_homepage(local_path) if local_path else "",
            "categoryProvenance": selection_rationale,
        }
        if source_id:
            app_row["observationCategoryProvenance"] = category_rationale(
                by_source, {}, "form990", source_id, organization
            )
        output.append(app_row)
    return output


def build_job_ads(by_source: dict[tuple[str, str], dict]) -> list[dict]:
    jobs = rows(DELIVERABLES / "validated_job_ad_compensation.csv")
    output: list[dict] = []
    for job in jobs:
        source_id = text(job["source_id"])
        local_path = text(job["local_path"])
        cached = cache_source(source_id, local_path) if local_path else ""
        low = number(job["adjusted_min_jul2026"])
        high = number(job["adjusted_max_jul2026"])
        midpoint = number(job["adjusted_midpoint_jul2026"])
        nominal_low = number(job["salary_min"])
        nominal_high = number(job["salary_max"])
        nominal_midpoint = (nominal_low + nominal_high) / 2 if nominal_low is not None and nominal_high is not None else None
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
            "title": raw_title or "Not reported",
            "titleGroup": title_group(raw_title),
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
            "nominalSalary": {"base": nominal_midpoint, "cash": nominal_midpoint, "total": nominal_midpoint},
            "nominalRange": {"low": nominal_low, "high": nominal_high},
            "cpiFactor": number(job["cpi_factor"]) or 1.0,
            "cpiPeriod": text(job["cpi_period"]),
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
            "evidenceStream": "jobAds",
            "homepageUrl": "",
            "categoryProvenance": category_rationale(by_source, {}, "job_ad", source_id, text(job["organization"])),
        })
    return output


def main() -> None:
    if EVIDENCE_DIR.exists():
        shutil.rmtree(EVIDENCE_DIR)
    definitions, rationales_by_source, reference_rationales, rationale_counts = load_category_explainers()
    incumbents = build_incumbents(rationales_by_source, reference_rationales)
    jobs = build_job_ads(rationales_by_source)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "priceBasis": "July 2026 USD",
        "cpi": {
            "seriesId": "CUUR0000SA0",
            "seriesTitle": "CPI-U, U.S. city average, all items, not seasonally adjusted",
            "targetPeriod": "July 2026",
            "targetIndex": 333.918,
            "sourceUrl": "https://www.bls.gov/cpi/data.htm",
            "localDataPath": "benchmark/data/cpi_u.csv",
        },
        "incumbents": incumbents,
        "jobAds": jobs,
        "categoryExplainers": {
            "definitions": definitions,
            "definitionCount": sum(len(field) for field in definitions.values()),
            "rationaleCounts": rationale_counts,
            "dictionaryPath": "benchmark/deliverables/category_explainers/category_dictionary.csv",
            "rationalesPath": "benchmark/deliverables/category_explainers/organization_category_rationale.csv",
            "methodologyPath": "benchmark/deliverables/category_explainers/methodology_notes.md",
            "validationPath": "benchmark/deliverables/category_explainers/validation_report.txt",
        },
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
