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
WIKIPEDIA_PROFILES = ROOT / "data" / "organization_wikipedia_profiles.csv"
RP_REFERENCE_SOURCE_ID = "SRC-990-RP-REFERENCE"
RP_REFERENCE_LOCAL_PATH = "sources/native/form990/202502879349301540_public.xml"
RP_STAFF_SOURCE_ID = "SRC-990-RP-STAFF-2023"
RP_STAFF_LOCAL_PATH = "sources/native/form990/202433179349301723_public.pdf"
RP_STAFF_SHA256 = "0a8031d7840e38ee76f6802e2e65206771744d4d50722ab32a9d74c0ba0edabf"
RP_STAFF_COUNT = 43
RP_STAFF_YEAR = 2023
RP_STAFF_SOURCE_URL = "https://rethinkpriorities.org/wp-content/uploads/2024/11/RP-2023-990-No-Schedule-B.pdf"
RP_FUNDING_SOURCE_ID = "SRC-RP-FUNDING-NEEDS"
RP_FUNDING_LOCAL_PATH = "sources/native/supporting/src-rp-funding-needs.html"


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def text(value: object) -> str:
    value = "" if value is None else str(value).strip()
    return "" if value.lower() in {"", "nan", "none"} else value


def literal(value: object) -> str:
    """Preserve category strings such as the meaningful structure flag `none`."""
    return "" if value is None else str(value).strip()


def load_wikipedia_profiles(organizations: set[str]) -> dict[str, dict[str, str]]:
    profiles = rows(WIKIPEDIA_PROFILES)
    by_organization: dict[str, dict[str, str]] = {}
    for profile in profiles:
        organization = text(profile["organization"])
        if not organization or organization in by_organization:
            raise ValueError(f"Invalid or duplicate Wikipedia profile row: {organization!r}")
        method = text(profile["validation_method"])
        title = text(profile["wikipedia_title"])
        url = text(profile["wikipedia_url"])
        if bool(title) != bool(url):
            raise ValueError(f"Incomplete Wikipedia mapping for {organization}")
        if title and method not in {"exact_title_or_redirect", "reviewed_override"}:
            raise ValueError(f"Unverified Wikipedia mapping for {organization}: {method}")
        by_organization[organization] = profile
    missing = organizations - by_organization.keys()
    extra = by_organization.keys() - organizations
    if missing or extra:
        raise ValueError(
            f"Wikipedia profile coverage mismatch; missing={sorted(missing)}, extra={sorted(extra)}"
        )
    return by_organization


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


def local_name(element: ElementTree.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]


def first_descendant(element: ElementTree.Element, name: str) -> str:
    for candidate in element.iter():
        if local_name(candidate) == name and text(candidate.text):
            return text(candidate.text)
    raise ValueError(f"Missing required Form 990 field: {name}")


def person_record(root: ElementTree.Element, group_name: str, person: str) -> ElementTree.Element:
    for group in root.iter():
        if local_name(group) != group_name:
            continue
        name = next(
            (text(element.text) for element in group.iter() if local_name(element) == "PersonNm" and text(element.text)),
            "",
        )
        if name.casefold() == person.casefold():
            return group
    raise ValueError(f"Missing {group_name} record for {person}")


def cpi_factor(year: int) -> float:
    cpi_rows = rows(BENCHMARK / "data" / "cpi_u.csv")
    target = [number(row["index_value"]) for row in cpi_rows if text(row["period"]) == "2026-07"]
    annual = [
        number(row["index_value"])
        for row in cpi_rows
        if re.fullmatch(fr"{year}-\d{{2}}", text(row["period"]))
    ]
    if len(target) != 1 or len(annual) != 12 or any(value is None for value in annual):
        raise ValueError(f"Incomplete CPI series for {year} annual-average adjustment")
    return float(target[0]) / (sum(float(value) for value in annual) / 12)


def build_rp_reference() -> dict:
    path = BENCHMARK / RP_REFERENCE_LOCAL_PATH
    root = ElementTree.parse(path).getroot()
    if first_descendant(root, "EIN") != "843896318":
        raise ValueError("RP reference filing EIN does not match 84-3896318")
    if first_descendant(root, "TaxPeriodBeginDt") != "2024-01-01" or first_descendant(root, "TaxPeriodEndDt") != "2024-12-31":
        raise ValueError("RP reference filing is not the expected calendar-year 2024 return")

    form990 = next((element for element in root.iter() if local_name(element) == "IRS990"), None)
    if form990 is None:
        raise ValueError("RP reference source does not contain Form 990")
    part_vii = person_record(form990, "Form990PartVIISectionAGrp", "Marcus Davis")
    schedule_j = person_record(root, "RltdOrgOfficerTrstKeyEmplGrp", "Marcus Davis")
    title = first_descendant(part_vii, "TitleTxt")
    if title.casefold() != "ceo":
        raise ValueError(f"Unexpected RP top-executive title: {title}")

    base = number(first_descendant(schedule_j, "BaseCompensationFilingOrgAmt"))
    cash = number(first_descendant(part_vii, "ReportableCompFromOrgAmt"))
    related = next((number(element.text) for element in part_vii.iter() if local_name(element) == "ReportableCompFromRltdOrgAmt"), 0) or 0
    other = number(first_descendant(part_vii, "OtherCompensationAmt"))
    schedule_total = number(first_descendant(schedule_j, "TotalCompensationFilingOrgAmt"))
    if any(value is None for value in (base, cash, other, schedule_total)):
        raise ValueError("RP reference filing lacks a required compensation field")
    total = float(cash) + float(related) + float(other)
    if schedule_total != total:
        raise ValueError(f"RP Schedule J total {schedule_total} does not match Part VII total {total}")

    expenses_group = next((element for element in form990.iter() if local_name(element) == "TotalFunctionalExpensesGrp"), None)
    if expenses_group is None:
        raise ValueError("RP reference filing lacks total functional expenses")
    expenses = number(first_descendant(expenses_group, "TotalAmt"))
    revenue = number(first_descendant(form990, "CYTotalRevenueAmt"))
    employees = number(first_descendant(form990, "TotalEmployeeCnt"))
    if (expenses, revenue, employees) != (20_378_936, 20_599_841, 0):
        raise ValueError(f"Unexpected RP filing scale fields: expenses={expenses}, revenue={revenue}, employees={employees}")

    staff_path = BENCHMARK / RP_STAFF_LOCAL_PATH
    if hashlib.sha256(staff_path.read_bytes()).hexdigest() != RP_STAFF_SHA256:
        raise ValueError("RP 2023 Form 990 PDF is missing or does not match the validated filing")

    factor = cpi_factor(2024)
    cached = cache_source(RP_REFERENCE_SOURCE_ID, RP_REFERENCE_LOCAL_PATH)
    cached_staff = cache_source(RP_STAFF_SOURCE_ID, RP_STAFF_LOCAL_PATH)
    return {
        "id": RP_REFERENCE_SOURCE_ID,
        "organization": "Rethink Priorities",
        "executive": "Marcus Davis",
        "title": title,
        "titleGroup": title_group(title),
        "rawTitle": title,
        "tier": "Reference",
        "topic": "RP reference organization",
        "eaAffinity": "EA-core",
        "location": "US",
        "remoteStatus": "Not reported in Form 990",
        "structure": "independent nonprofit",
        "revenue": revenue,
        "expenses": expenses,
        "staff": RP_STAFF_COUNT,
        "staffFte": None,
        "staffYear": RP_STAFF_YEAR,
        "filingStaff": RP_STAFF_COUNT,
        "currentFilingStaff": employees,
        "comparabilityScore": None,
        "compensationYear": 2024,
        "salary": {
            "base": round(float(base) * factor, 2),
            "cash": round(float(cash + related) * factor, 2),
            "total": round(total * factor, 2),
        },
        "nominalSalary": {"base": base, "cash": cash + related, "total": total},
        "cpiFactor": factor,
        "cpiPeriod": "2024 annual average",
        "defaultIncluded": False,
        "structurallyClean": False,
        "founder": False,
        "analysisStatus": "reference only; excluded from peer distribution",
        "auditStatus": "validated RP 2024 and 2023 Forms 990",
        "selectionNote": "",
        "evidenceText": (
            "IRS Form 990 for the period ending 2024-12-31. Marcus Davis, CEO. "
            f"Schedule J base: {money(base)}; Part VII cash/W-2 proxy: {money(cash + related)}; "
            f"Part VII other compensation: {money(other)}; filing total: {money(total)}. "
            f"The 2024 filing reports {money(expenses)} total functional expenses, {money(revenue)} total revenue, "
            "and zero employees on Form 990 Part I, line 5. Because that zero is not a usable scale measure, "
            f"the staff comparison uses the most recent nonzero value from the same filing field: {RP_STAFF_COUNT} "
            f"individuals employed on RP's {RP_STAFF_YEAR} Form 990, Part I, line 5."
        ),
        "sourceUrl": "https://projects.propublica.org/nonprofits/organizations/843896318",
        "canonicalUrl": "https://apps.irs.gov/pub/epostcard/990/xml/2025/2025_TEOS_XML_11A.zip",
        "cachedSource": cached,
        "localPath": RP_REFERENCE_LOCAL_PATH,
        "secondarySourceLabel": "RP 2023 Form 990 staff filing",
        "secondarySourceUrl": RP_STAFF_SOURCE_URL,
        "secondaryCachedSource": cached_staff,
        "secondaryLocalPath": RP_STAFF_LOCAL_PATH,
        "sourceType": "Form 990",
        "evidenceStream": "incumbents",
        "homepageUrl": filing_homepage(RP_REFERENCE_LOCAL_PATH),
    }


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
    rp_reference = build_rp_reference()
    # Preserve the previously acquired operating-headcount page in the local archive,
    # but do not use its non-comparable FTE/permanent-staff figures analytically.
    cache_source(RP_FUNDING_SOURCE_ID, RP_FUNDING_LOCAL_PATH)
    app_rows = incumbents + jobs
    wikipedia_profiles = load_wikipedia_profiles({row["organization"] for row in app_rows})
    for row in app_rows:
        profile = wikipedia_profiles[row["organization"]]
        row["wikipediaTitle"] = text(profile["wikipedia_title"])
        row["wikipediaUrl"] = text(profile["wikipedia_url"])
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
        "rpReference": rp_reference,
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
            "retrievedManifestRecords": len(rows(DELIVERABLES / "source_acquisition_manifest.csv")),
            "verifiedWikipediaProfiles": sum(
                bool(profile["wikipedia_title"]) for profile in wikipedia_profiles.values()
            ),
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
