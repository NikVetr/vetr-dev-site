#!/usr/bin/env python3
from __future__ import annotations

import math
import re
from pathlib import Path
from xml.etree import ElementTree as ET

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DELIVERABLES = ROOT / "deliverables"
OUT_DIR = ROOT / "analysis" / "source_validation"
DETAIL_PATH = OUT_DIR / "compensation_extraction_audit.csv"
REPORT_PATH = OUT_DIR / "compensation_extraction_audit.md"
VALIDATED_PATH = DELIVERABLES / "validated_form990_compensation.csv"

PART_VII_TAGS = {
    "Form990PartVIISectionAGrp",
    "Form990PartVIISectionA",
    "OfficerDirectorTrusteeKeyEmplGrp",
    "CompensationInformationGrp",
}
SCHEDULE_J_TAGS = {
    "RltdOrgOfficerTrstKeyEmplGrp",
    "Form990ScheduleJPartIIGrp",
    "ScheduleJPartIIGrp",
}


def lname(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def descendants(element: ET.Element) -> dict[str, list[str]]:
    values: dict[str, list[str]] = {}
    for child in element.iter():
        text = (child.text or "").strip()
        if text:
            values.setdefault(lname(child.tag), []).append(text)
    return values


def value(record: dict[str, list[str]] | None, *names: str) -> str:
    if record is None:
        return ""
    for name in names:
        if record.get(name):
            return record[name][0]
    return ""


def integer(record: dict[str, list[str]] | None, *names: str) -> int | None:
    raw = value(record, *names)
    if not raw:
        return None
    return int(round(float(raw.replace(",", ""))))


def expected_integer(raw: object) -> int | None:
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return None
    text = str(raw).strip()
    return None if not text or text.lower() == "nan" else int(round(float(text)))


def normalized_name(raw: object) -> str:
    tokens = re.findall(r"[a-z0-9]+", str(raw or "").lower())
    while tokens and tokens[0] in {"dr", "mr", "mrs", "ms", "prof"}:
        tokens.pop(0)
    return "".join(tokens)


def name_parts(raw: object) -> list[str]:
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return []
    text = str(raw or "").strip()
    if not text:
        return []
    return [part.strip() for part in re.split(r"\s*/\s*|\s+and\s+", text) if part.strip()]


def records(root: ET.Element, tags: set[str]) -> list[dict[str, list[str]]]:
    result = []
    for element in root.iter():
        if lname(element.tag) not in tags:
            continue
        record = descendants(element)
        if value(record, "PersonNm", "PersonName", "NamePerson"):
            result.append(record)
    return result


def match_record(
    candidates: list[dict[str, list[str]]], target: str
) -> tuple[dict[str, list[str]] | None, str, int]:
    target_normalized = normalized_name(target)
    exact = [
        record
        for record in candidates
        if normalized_name(value(record, "PersonNm", "PersonName", "NamePerson"))
        == target_normalized
    ]
    if len(exact) == 1:
        return exact[0], "exact_name", 1
    tokens = re.findall(r"[a-z0-9]+", target.lower())
    first = tokens[0] if tokens else ""
    last = tokens[-1] if tokens else ""
    fuzzy = []
    for record in candidates:
        candidate = normalized_name(
            value(record, "PersonNm", "PersonName", "NamePerson")
        )
        if last and last in candidate and (not first or candidate.startswith(first[:1])):
            fuzzy.append(record)
    if len(fuzzy) == 1:
        return fuzzy[0], "surname_first_initial", 1
    return None, "ambiguous" if exact or fuzzy else "not_found", len(exact or fuzzy)


def first_numeric(root: ET.Element, *names: str) -> int | None:
    wanted = set(names)
    for element in root.iter():
        if lname(element.tag) not in wanted:
            continue
        text = (element.text or "").strip()
        if text:
            try:
                return int(round(float(text.replace(",", ""))))
            except ValueError:
                continue
    return None


def main() -> None:
    evidence = pd.read_csv(DELIVERABLES / "form990_evidence.csv")
    manifest = pd.read_csv(
        DELIVERABLES / "source_acquisition_manifest.csv", dtype=str
    ).fillna("")
    paths = manifest.set_index("source_id")["current_local_path"].to_dict()
    audited: list[dict] = []

    for _, expected in evidence.iterrows():
        source_id = expected.source_id
        local_path = paths.get(source_id, "")
        target_parts = name_parts(expected.ceo_name)
        base = {
            "source_id": source_id,
            "organization": expected.organization,
            "analysis_status": expected.analysis_status,
            "local_path": local_path,
            "expected_ceo_name": "" if pd.isna(expected.ceo_name) else expected.ceo_name,
            "expected_ceo_title": "" if pd.isna(expected.ceo_title) else expected.ceo_title,
            "expected_part_vii_org": expected_integer(expected.part_vii_org),
            "expected_part_vii_related": expected_integer(expected.part_vii_related),
            "expected_part_vii_other": expected_integer(expected.part_vii_other),
            "expected_schedule_j_base": expected_integer(expected.schedule_j_base),
            "target_name_count": len(target_parts),
        }
        path = ROOT / local_path if local_path else None
        if path is None or not path.is_file():
            audited.append({**base, "audit_status": "source_missing"})
            continue

        root = ET.parse(path).getroot()
        part_records = records(root, PART_VII_TAGS)
        part_record = None
        part_method = "not_applicable"
        part_matches = 0
        matched_target = ""
        for target in target_parts:
            candidate, method, count = match_record(part_records, target)
            if candidate is not None:
                part_record = candidate
                part_method = method
                part_matches = count
                matched_target = target
                break
            if part_method == "not_applicable" or method == "ambiguous":
                part_method = method
                part_matches = count

        observed_name = value(part_record, "PersonNm", "PersonName", "NamePerson")
        observed_title = value(part_record, "TitleTxt", "Title")
        part_org = integer(
            part_record,
            "ReportableCompFromOrgAmt",
            "ReportableCompFromOrganizationAmt",
        )
        part_related = integer(
            part_record,
            "ReportableCompFromRltdOrgAmt",
            "ReportableCompFromRelatedOrgAmt",
        )
        part_other = integer(part_record, "OtherCompensationAmt", "OtherCompensation")

        schedule_records = records(root, SCHEDULE_J_TAGS)
        schedule_record = None
        schedule_method = "not_applicable"
        schedule_matches = 0
        if observed_name:
            schedule_record, schedule_method, schedule_matches = match_record(
                schedule_records, observed_name
            )

        schedule_base_org = integer(
            schedule_record,
            "BaseCompensationFilingOrgAmt",
            "BaseCompensationFilingOrganizationAmt",
        )
        schedule_base_related = integer(
            schedule_record,
            "CompensationBasedOnRltdOrgsAmt",
            "BaseCompensationRltdOrgsAmt",
            "BaseCompensationRelatedOrganizationsAmt",
        )
        expected_org = expected_integer(expected.part_vii_org)
        expected_related = expected_integer(expected.part_vii_related) or 0
        expected_other = expected_integer(expected.part_vii_other) or 0
        part_values_match = (
            expected_org is not None
            and part_org == expected_org
            and (part_related or 0) == expected_related
            and (part_other or 0) == expected_other
        )
        schedule_expected = expected_integer(expected.schedule_j_base)
        schedule_match = (
            schedule_base_org == schedule_expected
            if schedule_expected is not None
            else schedule_base_org is None
        )
        if expected_org is None or (not target_parts and expected_org == 0):
            audit_status = "no_expected_compensation_record"
        elif part_record is None:
            audit_status = "executive_match_unresolved"
        elif not part_values_match:
            audit_status = "part_vii_discrepancy"
        elif not schedule_match:
            audit_status = "schedule_j_base_omitted_or_mismatched"
        else:
            audit_status = "verified"

        audited.append({
            **base,
            "matched_target_name": matched_target,
            "part_vii_match_method": part_method,
            "part_vii_match_count": part_matches,
            "observed_ceo_name": observed_name,
            "observed_ceo_title": observed_title,
            "observed_average_hours": value(
                part_record, "AverageHoursPerWeekRt", "AverageHoursPerWeek"
            ),
            "observed_part_vii_org": part_org,
            "observed_part_vii_related": part_related,
            "observed_part_vii_other": part_other,
            "part_vii_values_match": part_values_match,
            "schedule_j_match_method": schedule_method,
            "schedule_j_match_count": schedule_matches,
            "observed_schedule_j_base_org": schedule_base_org,
            "observed_schedule_j_base_related": schedule_base_related,
            "observed_schedule_j_bonus_org": integer(
                schedule_record,
                "BonusFilingOrganizationAmount",
                "BonusFilingOrgAmt",
            ),
            "observed_schedule_j_bonus_related": integer(
                schedule_record,
                "BonusRelatedOrganizationsAmount",
                "BonusRltdOrgsAmt",
            ),
            "observed_schedule_j_other_org": integer(
                schedule_record,
                "OtherCompensationFilingOrgAmt",
                "OtherCompensationFilingOrganizationAmt",
            ),
            "observed_schedule_j_deferred_org": integer(
                schedule_record,
                "DeferredCompensationFlngOrgAmt",
                "DeferredCompensationFilingOrgAmt",
            ),
            "observed_schedule_j_nontaxable_org": integer(
                schedule_record,
                "NontaxableBenefitsFilingOrgAmt",
                "NontaxableBenefitsFilingOrganizationAmt",
            ),
            "observed_schedule_j_total_org": integer(
                schedule_record,
                "TotalCompensationFilingOrgAmt",
                "TotalCompensationFilingOrganizationAmt",
            ),
            "observed_schedule_j_total_related": integer(
                schedule_record,
                "TotalCompensationRltdOrgsAmt",
                "TotalCompensationRelatedOrganizationsAmt",
            ),
            "schedule_j_base_match": schedule_match,
            "observed_revenue": first_numeric(
                root,
                "CYTotalRevenueAmt",
                "TotalRevenueCurrentYear",
                "TotalRevenueAmt",
            ),
            "observed_expenses": first_numeric(
                root,
                "CYTotalExpensesAmt",
                "TotalExpensesCurrentYear",
                "TotalExpensesAmt",
            ),
            "observed_employee_count": first_numeric(
                root, "TotalEmployeeCnt", "TotalEmployeesCnt", "EmployeeCnt"
            ),
            "audit_status": audit_status,
        })

    result = pd.DataFrame(audited)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    result.to_csv(DETAIL_PATH, index=False)

    observed_columns = [
        column
        for column in result.columns
        if column.startswith("observed_")
        or column
        in {
            "source_id",
            "local_path",
            "matched_target_name",
            "part_vii_match_method",
            "part_vii_values_match",
            "schedule_j_match_method",
            "schedule_j_base_match",
            "audit_status",
        }
    ]
    validated = evidence.merge(
        result[observed_columns], on="source_id", how="left", validate="one_to_one"
    )
    validated["validated_cash_proxy"] = (
        validated["observed_part_vii_org"].fillna(0)
        + validated["observed_part_vii_related"].fillna(0)
    ).where(validated["observed_part_vii_org"].notna())
    validated["validated_total_proxy"] = (
        validated["validated_cash_proxy"]
        + validated["observed_part_vii_other"].fillna(0)
    ).where(validated["validated_cash_proxy"].notna())
    schedule_base_org = pd.to_numeric(
        validated["observed_schedule_j_base_org"], errors="coerce"
    )
    schedule_base_related = pd.to_numeric(
        validated["observed_schedule_j_base_related"], errors="coerce"
    )
    validated["validated_schedule_j_base_total"] = (
        schedule_base_org.fillna(0) + schedule_base_related.fillna(0)
    ).where(schedule_base_org.notna() | schedule_base_related.notna())
    validated.to_csv(VALIDATED_PATH, index=False)

    status = result.audit_status.value_counts()
    schedule_count = int(result.observed_schedule_j_base_org.notna().sum())
    part_matches = int(result.part_vii_values_match.fillna(False).sum())
    primary = result[result.analysis_status.str.startswith("primary")]
    primary_schedule = int(primary.observed_schedule_j_base_org.notna().sum())
    lines = [
        "# Compensation extraction audit",
        "",
        "This audit reparses the locally preserved IRS XML independently of the analytical normalization pipeline.",
        "",
        "## Results",
        "",
        f"- Filing rows audited: **{len(result)}**.",
        f"- Part VII D/E/F values matching the package extraction: **{part_matches}**.",
        f"- Returns with a matched Schedule J base-compensation field: **{schedule_count}**.",
        f"- Primary or primary-with-flag rows with matched Schedule J base: **{primary_schedule}**.",
        "- The package's `schedule_j_base` field is blank for every row, so every observed Schedule J base is an omission.",
        "",
        "## Audit status counts",
        "",
        "| Status | Rows |",
        "|---|---:|",
    ]
    lines.extend(f"| {label} | {count} |" for label, count in status.items())
    lines.extend([
        "",
        "See `compensation_extraction_audit.csv` for the check-level evidence and `../../deliverables/validated_form990_compensation.csv` for an app-ready merge of the original analytical fields with independently observed XML values.",
        "",
    ])
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(REPORT_PATH.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
