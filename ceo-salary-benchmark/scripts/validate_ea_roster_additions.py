#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import html
import json
import math
import re
import subprocess
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "benchmark" / "enrichment" / "ea_roster_validated_compensation.csv"
CANDIDATE_REVIEW = ROOT / "benchmark" / "enrichment" / "ea_roster_candidate_review.csv"
LINGERING_APP_ADDITIONS = ROOT / "benchmark" / "enrichment" / "lingering_org_app_position_additions.csv"
LIVING_PEER_REVIEW = ROOT / "benchmark" / "enrichment" / "living_peer_universe_review.csv"
APP_DATA = ROOT / "app-data.js"
SOURCE_MANIFEST = ROOT / "benchmark" / "enrichment" / "ea_roster_source_manifest.csv"
INCUMBENT_UPDATES = ROOT / "benchmark" / "enrichment" / "incumbent_compensation_updates.csv"
CPI_DATA = ROOT / "benchmark" / "data" / "cpi_u.csv"
EXPECTED_REVIEWED_IDS = {
    "SRC-990-EA-CENTER-FOR-ELECTION-SCIENCE",
    "SRC-990-EA-FORESIGHT-INSTITUTE",
    "SRC-990-EA-LEVERAGE-RESEARCH",
    "SRC-990-EA-QUALIA-RESEARCH-INSTITUTE",
    "SRC-990-EA-MAGNIFY-MENTORING",
    "SRC-990-EA-GIVEWELL",
    "SRC-990-EA-COPENHAGEN-CONSENSUS-CENTER",
}
PDF_EXPECTATIONS = {
    "SRC-990-EA-GIVEWELL": {
        "organization": "GiveWell",
        "person": "Elie Hassenfeld",
        "title": "Chief Executive Officer",
        "hours": 40,
        "revenue": 269_542_773,
        "expenses": 183_707_000,
        "staff": 96,
        "part_vii_org": 424_805,
        "part_vii_related": 0,
        "part_vii_other": 38_590,
        "cash": 424_805,
        "total": 463_395,
        "base": 423_600,
        "text_tokens": ("ELIE HASSENFELD", "424,805", "423,600", "463,395"),
    },
    "SRC-990-EA-COPENHAGEN-CONSENSUS-CENTER": {
        "organization": "Copenhagen Consensus Center",
        "person": "Dr Bjorn Lomborg",
        "title": "President & Founder",
        "hours": 40,
        "revenue": 920_765,
        "expenses": 1_187_335,
        "staff": 1,
        "part_vii_org": 497_770,
        "part_vii_related": 0,
        "part_vii_other": 0,
        "cash": 497_770,
        "total": 497_770,
        "base": 435_166,
        "text_tokens": (),
    },
}


class IdTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stack: list[str | None] = []
        self.values: dict[str, list[str]] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        element_id = dict(attrs).get("id")
        self.stack.append(element_id)
        if element_id:
            self.values.setdefault(element_id, [])

    def handle_endtag(self, tag: str) -> None:
        if self.stack:
            self.stack.pop()

    def handle_data(self, data: str) -> None:
        cleaned = " ".join(html.unescape(data).split())
        if not cleaned:
            return
        for element_id in reversed(self.stack):
            if element_id:
                self.values[element_id].append(cleaned)
                break


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def parsed_values(path: Path) -> dict[str, str]:
    if not path.is_file():
        raise FileNotFoundError(f"Missing preserved filing: {path}")
    parser = IdTextParser()
    parser.feed(path.read_text(encoding="utf-8"))
    return {key: " ".join(value) for key, value in parser.values.items()}


def amount(value: str | None) -> float:
    cleaned = re.sub(r"[^0-9.-]", "", value or "")
    return float(cleaned) if cleaned else 0.0


def required_amount(row: dict[str, str], field: str) -> float:
    if not row[field]:
        raise ValueError(f"{row['organization']} is missing required {field}")
    return float(row[field])


def first_suffix(values: dict[str, str], suffix: str) -> float:
    matches = [value for key, value in values.items() if key.endswith(suffix)]
    if not matches:
        raise ValueError(f"Filing lacks {suffix}")
    return amount(matches[0])


def group_for_person(values: dict[str, str], group: str, person: str) -> str:
    matches = [
        key.removesuffix("/PersonNm[1]")
        for key, value in values.items()
        if group in key and key.endswith("/PersonNm[1]") and value.casefold() == person.casefold()
    ]
    if len(matches) != 1:
        raise ValueError(f"Expected one {group} row for {person}; found {len(matches)}")
    return matches[0]


def group_value(values: dict[str, str], prefix: str, field: str) -> str:
    return values.get(f"{prefix}/{field}[1]", "")


def close(actual: float, expected: float, label: str) -> None:
    if not math.isclose(actual, expected, abs_tol=0.01):
        raise ValueError(f"{label}: source={actual}, reviewed={expected}")


def cpi_factor(year: int) -> float:
    cpi_rows = rows(CPI_DATA)
    target = [float(row["index_value"]) for row in cpi_rows if row["period"] == "2026-07"]
    annual_average = [
        float(row["index_value"])
        for row in cpi_rows
        if row["period"] == f"{year}-AVG"
    ]
    monthly = [
        float(row["index_value"])
        for row in cpi_rows
        if re.fullmatch(fr"{year}-\d{{2}}", row["period"])
    ]
    if len(target) != 1 or len(annual_average) > 1:
        raise ValueError(f"Incomplete CPI data for {year}")
    denominator = annual_average[0] if annual_average else sum(monthly) / 12 if len(monthly) == 12 else None
    if denominator is None:
        raise ValueError(f"Incomplete CPI data for {year}")
    return target[0] / denominator


def app_payload() -> dict:
    prefix = "window.CEO_BENCHMARK_DATA = "
    contents = APP_DATA.read_text(encoding="utf-8").strip()
    if not contents.startswith(prefix) or not contents.endswith(";"):
        raise ValueError("app-data.js does not contain the expected generated payload")
    return json.loads(contents[len(prefix):-1])


def reviewed_boolean(value: str) -> bool:
    normalized = value.strip().casefold()
    if normalized in {"true", "yes", "1"}:
        return True
    if normalized in {"false", "no", "0"}:
        return False
    raise ValueError(f"Unexpected reviewed boolean: {value!r}")


def validate_generated_app(reviewed: list[dict[str, str]]) -> None:
    payload = app_payload()
    incumbents = payload.get("incumbents", [])
    expected_ids = {row["source_id"] for row in reviewed}
    roster_rows = [row for row in incumbents if str(row.get("id", "")).startswith("SRC-990-EA-")]
    if {row.get("id") for row in roster_rows} != expected_ids or len(roster_rows) != len(expected_ids):
        raise ValueError("Generated app does not contain exactly the reviewed EA-roster observations")
    by_id = {row["id"]: row for row in roster_rows}
    living_by_id = {
        row["observation_id"]: row for row in rows(LIVING_PEER_REVIEW)
    }

    for reviewed_row in reviewed:
        organization = reviewed_row["organization"]
        generated = by_id[reviewed_row["source_id"]]
        if generated.get("organization") != organization:
            raise ValueError(f"{organization}: generated organization name changed")
        living = living_by_id.get(reviewed_row["source_id"])
        if living is None:
            raise ValueError(f"{organization}: living peer review row is missing")
        expected_default = reviewed_boolean(living["living_default_included"])
        if generated.get("defaultIncluded") is not expected_default:
            raise ValueError(f"{organization}: generated living default disposition changed")
        if generated.get("legacyDefaultIncluded") is not False:
            raise ValueError(f"{organization}: historical roster default must remain recorded as false")
        expected_status = living["living_analysis_status"]
        if generated.get("analysisStatus") != expected_status:
            raise ValueError(f"{organization}: generated analysis status changed")
        if generated.get("tier") != living["living_tier"]:
            raise ValueError(f"{organization}: generated living tier changed")
        generated_living = generated.get("livingPeerReview", {})
        if generated_living.get("reason") != living["nonpay_reason"]:
            raise ValueError(f"{organization}: generated living-review rationale changed")
        if generated.get("structurallyClean") is not reviewed_boolean(reviewed_row["structurally_clean"]):
            raise ValueError(f"{organization}: generated structural flag changed")
        if generated.get("founder") is not (reviewed_row["founder_flag"].casefold() == "yes"):
            raise ValueError(f"{organization}: generated founder flag changed")

        for source_field, app_field in (("revenue", "revenue"), ("expenses", "expenses"), ("employee_count", "staff")):
            if reviewed_row[source_field]:
                close(float(generated[app_field]), required_amount(reviewed_row, source_field), f"{organization} generated {app_field}")
            elif generated[app_field] is not None:
                raise ValueError(f"{organization}: generated unsupported {app_field}")

        close(
            float(generated["averageHoursPerWeek"]),
            required_amount(reviewed_row, "average_hours_per_week"),
            f"{organization} generated average weekly hours",
        )
        if generated.get("sourceType") != reviewed_row["return_type"]:
            raise ValueError(f"{organization}: generated return type changed")

        factor = required_amount(reviewed_row, "cpi_factor")
        for measure, source_field in (
            ("base", "validated_schedule_j_base_total"),
            ("cash", "validated_cash_proxy"),
            ("total", "validated_total_proxy"),
        ):
            nominal = float(reviewed_row[source_field]) if reviewed_row[source_field] else None
            if generated["nominalSalary"][measure] != nominal:
                raise ValueError(f"{organization}: generated nominal {measure} changed")
            adjusted = round(nominal * factor, 2) if nominal is not None else None
            if generated["salary"][measure] != adjusted:
                raise ValueError(f"{organization}: generated adjusted {measure} changed")

        if generated.get("sourceUrl") != reviewed_row["canonical_url"]:
            raise ValueError(f"{organization}: generated source link changed")
        if generated.get("canonicalUrl") != reviewed_row["source_url"]:
            raise ValueError(f"{organization}: generated organization filing link changed")

        cached = ROOT / generated.get("cachedSource", "")
        native = ROOT / "benchmark" / reviewed_row["local_path"]
        if not cached.is_file() or cached.read_bytes() != native.read_bytes():
            raise ValueError(f"{organization}: cached source preview is missing or differs from the reviewed filing")
        schedule_path = reviewed_row["schedule_j_local_path"]
        if schedule_path:
            cached_schedule = ROOT / generated.get("secondaryCachedSource", "")
            native_schedule = ROOT / "benchmark" / schedule_path
            if not cached_schedule.is_file() or cached_schedule.read_bytes() != native_schedule.read_bytes():
                raise ValueError(f"{organization}: cached Schedule J preview is missing or differs from the reviewed filing")
        elif generated.get("secondaryCachedSource"):
            raise ValueError(f"{organization}: generated an unsupported secondary source preview")

    candidate_rows = rows(CANDIDATE_REVIEW)
    lingering_rows = rows(LINGERING_APP_ADDITIONS)
    if {
        (row["candidate_organization"], row["person_name"], row["standardized_position"])
        for row in lingering_rows
    } != {
        ("Lead Exposure Elimination Project", "TOMOS DAVIES", "coo"),
        ("Lead Exposure Elimination Project", "CLARE DONALDSON", "ceo"),
        ("Lead Exposure Elimination Project", "LUCIA COULTER", "ceo"),
    }:
        raise ValueError("Reviewed lingering-organization app boundary changed")
    if any(row["analysis_status"] != "sensitivity_only" for row in lingering_rows):
        raise ValueError("Lingering-organization additions must remain sensitivity-only")
    approved_lingering_organizations = {
        row["candidate_organization"] for row in lingering_rows
    }
    unsupported = {
        row["organization"]
        for row in candidate_rows
        if row["app_integration_status"] == "not_integrated_no_validated_compensation"
    }
    pooled_unsupported = sorted(
        (unsupported - approved_lingering_organizations)
        & {row.get("organization", "") for row in incumbents}
    )
    if pooled_unsupported:
        raise ValueError(f"Unsupported roster candidates entered the incumbent pool: {pooled_unsupported}")
    if len(candidate_rows) != 34 or len(unsupported) != 29:
        raise ValueError("Candidate-review integration boundary changed from 5 reviewed / 29 screening-only")
    if payload.get("summary", {}).get("eaRosterValidatedObservations") != len(reviewed):
        raise ValueError("Generated app summary has the wrong reviewed-roster observation count")
    if payload.get("summary", {}).get("lingeringOrgSensitivityObservations") != len(lingering_rows):
        raise ValueError("Generated app summary has the wrong lingering-organization count")
    summary = payload.get("summary", {})
    expected_summary = {
        "primaryIncumbentObservations": 122,
        "validatedBaseObservations": 114,
        "quantitativeJobAds": 15,
        "livingPeerReviewedObservations": 16,
        "livingPeerPromotedObservations": 6,
    }
    for field, expected in expected_summary.items():
        if summary.get(field) != expected:
            raise ValueError(f"Generated app summary {field} changed: {summary.get(field)}")


def validate_pdf_row(row: dict[str, str], path: Path) -> None:
    expected = PDF_EXPECTATIONS.get(row["source_id"])
    if expected is None:
        raise ValueError(f"No audited PDF extraction contract for {row['source_id']}")
    if row["organization"] != expected["organization"]:
        raise ValueError(f"{row['source_id']}: organization changed")
    if row["ceo_name"] != expected["person"] or row["ceo_title"] != expected["title"]:
        raise ValueError(f"{row['organization']}: audited PDF person/title changed")
    for field, expected_value in (
        ("average_hours_per_week", expected["hours"]),
        ("revenue", expected["revenue"]),
        ("expenses", expected["expenses"]),
        ("employee_count", expected["staff"]),
        ("part_vii_org", expected["part_vii_org"]),
        ("part_vii_related", expected["part_vii_related"]),
        ("part_vii_other", expected["part_vii_other"]),
        ("validated_cash_proxy", expected["cash"]),
        ("validated_total_proxy", expected["total"]),
        ("validated_schedule_j_base_total", expected["base"]),
    ):
        close(required_amount(row, field), expected_value, f"{row['organization']} reviewed {field}")
    tokens = expected["text_tokens"]
    if tokens:
        extracted = subprocess.run(
            ["pdftotext", "-layout", str(path), "-"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        missing = [token for token in tokens if token not in extracted]
        if missing:
            raise ValueError(f"{row['organization']}: audited PDF tokens are missing: {missing}")


def validate_row(row: dict[str, str]) -> None:
    source_path = ROOT / "benchmark" / row["local_path"]
    if source_path.suffix.lower() == ".pdf":
        validate_pdf_row(row, source_path)
        year = int(float(row["compensation_calendar_year"]))
        factor = required_amount(row, "cpi_factor")
        if not math.isclose(factor, cpi_factor(year), abs_tol=1e-12):
            raise ValueError(f"{row['organization']}: unexpected CPI period or factor")
        return
    main = parsed_values(source_path)
    return_type = row["return_type"]
    group = "OfficerDirectorTrusteeEmplGrp" if return_type == "Form 990-EZ" else "Form990PartVIISectionAGrp"
    person_prefix = group_for_person(main, group, row["ceo_name"])
    if group_value(main, person_prefix, "TitleTxt").casefold() != row["ceo_title"].casefold():
        raise ValueError(f"{row['organization']}: title does not match preserved filing")

    close(
        amount(group_value(main, person_prefix, "AverageHrsPerWkDevotedToPosRt" if return_type == "Form 990-EZ" else "AverageHoursPerWeekRt")),
        required_amount(row, "average_hours_per_week"),
        f"{row['organization']} average weekly hours",
    )

    revenue_suffix = "/TotalRevenueAmt[1]" if return_type == "Form 990-EZ" else "/CYTotalRevenueAmt[1]"
    expenses_suffix = "/TotalExpensesAmt[1]" if return_type == "Form 990-EZ" else "/CYTotalExpensesAmt[1]"
    close(first_suffix(main, revenue_suffix), required_amount(row, "revenue"), f"{row['organization']} revenue")
    close(first_suffix(main, expenses_suffix), required_amount(row, "expenses"), f"{row['organization']} expenses")
    if row["employee_count"]:
        close(first_suffix(main, "/TotalEmployeeCnt[1]"), required_amount(row, "employee_count"), f"{row['organization']} staff")

    filing = amount(group_value(main, person_prefix, "CompensationAmt" if return_type == "Form 990-EZ" else "ReportableCompFromOrgAmt"))
    related = 0.0 if return_type == "Form 990-EZ" else amount(group_value(main, person_prefix, "ReportableCompFromRltdOrgAmt"))
    other = 0.0 if return_type == "Form 990-EZ" else amount(group_value(main, person_prefix, "OtherCompensationAmt"))
    close(filing, required_amount(row, "part_vii_org"), f"{row['organization']} Part VII organization compensation")
    close(related, required_amount(row, "part_vii_related"), f"{row['organization']} Part VII related compensation")
    close(other, required_amount(row, "part_vii_other"), f"{row['organization']} Part VII other compensation")
    close(filing + related, required_amount(row, "validated_cash_proxy"), f"{row['organization']} cash proxy")
    close(filing + related + other, required_amount(row, "validated_total_proxy"), f"{row['organization']} total proxy")

    schedule_path = row["schedule_j_local_path"]
    if schedule_path:
        schedule = parsed_values(ROOT / "benchmark" / schedule_path)
        schedule_prefix = group_for_person(schedule, "RltdOrgOfficerTrstKeyEmplGrp", row["ceo_name"])
        base = amount(group_value(schedule, schedule_prefix, "BaseCompensationFilingOrgAmt"))
        base += amount(group_value(schedule, schedule_prefix, "BaseCompensationRltdOrgAmt"))
        close(base, required_amount(row, "validated_schedule_j_base_total"), f"{row['organization']} Schedule J base")
    elif row["validated_schedule_j_base_total"]:
        raise ValueError(f"{row['organization']}: reviewed base exists without preserved Schedule J")

    year = int(float(row["compensation_calendar_year"]))
    factor = required_amount(row, "cpi_factor")
    if not math.isclose(factor, cpi_factor(year), abs_tol=1e-12):
        raise ValueError(f"{row['organization']}: unexpected CPI period or factor")


def validate_manifest(reviewed: list[dict[str, str]]) -> None:
    manifest = {row["source_id"]: row for row in rows(SOURCE_MANIFEST)}
    for row in reviewed:
        source = manifest.get(row["source_id"])
        if source is None:
            raise ValueError(f"{row['organization']}: source is absent from the roster manifest")
        path = ROOT / "benchmark" / source["local_path"]
        if int(source["byte_length"]) != path.stat().st_size:
            raise ValueError(f"{row['organization']}: manifested byte length changed")
        if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
            raise ValueError(f"{row['organization']}: manifested source hash changed")


def validate_screened_roster_entity_update() -> None:
    update_rows = rows(INCUMBENT_UPDATES)
    if len(update_rows) != 1:
        raise ValueError("Expected exactly one entity-deduplicated incumbent filing update")
    row = update_rows[0]
    if row["source_id"] != "SRC-990-EXT-PROJECT-HEALTHY-CHILDREN":
        raise ValueError("Unexpected source ID in the incumbent filing update")
    source_path = ROOT / "benchmark" / row["local_path"]
    if not source_path.is_file():
        raise FileNotFoundError(f"Missing current Project Healthy Children filing: {source_path}")
    if source_path.stat().st_size != int(row["source_byte_length"]):
        raise ValueError("Project Healthy Children filing byte length changed")
    if hashlib.sha256(source_path.read_bytes()).hexdigest() != row["source_sha256"]:
        raise ValueError("Project Healthy Children filing hash changed")

    expected = {
        "observed_average_hours": 40,
        "observed_part_vii_org": 97_072,
        "observed_part_vii_related": 0,
        "observed_part_vii_other": 116_768,
        "validated_cash_proxy": 97_072,
        "validated_total_proxy": 213_840,
        "validated_schedule_j_base_total": 97_072,
        "observed_schedule_j_deferred_org": 3_168,
        "observed_schedule_j_nontaxable_org": 113_600,
        "observed_schedule_j_total_org": 213_840,
        "observed_revenue": 6_702_737,
        "observed_expenses": 5_867_621,
        "observed_employee_count": 3,
    }
    for field, expected_value in expected.items():
        close(required_amount(row, field), expected_value, f"Project Healthy Children reviewed {field}")
    if row["observed_ceo_name"] != "FELIX BROOKS-CHURCH" or row["observed_ceo_title"] != "CEO":
        raise ValueError("Project Healthy Children current CEO identity/title changed")
    if not math.isclose(required_amount(row, "cpi_factor"), cpi_factor(2023), abs_tol=1e-12):
        raise ValueError("Project Healthy Children CPI factor changed")

    extracted = subprocess.run(
        ["pdftotext", "-layout", str(source_path), "-"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    required_tokens = (
        "FELIX BROOKS-CHURCH", "97,072", "116,768", "113,600", "213,840",
        "6,702,737", "5,867,621",
    )
    missing_tokens = [token for token in required_tokens if token not in extracted]
    if missing_tokens:
        raise ValueError(f"Project Healthy Children filing tokens are missing: {missing_tokens}")

    payload = app_payload()
    entity_rows = [
        item for item in payload.get("incumbents", [])
        if item.get("organization") == "Project Healthy Children"
    ]
    if len(entity_rows) != 1:
        raise ValueError("Sanku / Project Healthy Children was not entity-deduplicated in the app")
    generated = entity_rows[0]
    if generated.get("executive") != "FELIX BROOKS-CHURCH" or generated.get("title") != "CEO":
        raise ValueError("Generated Project Healthy Children identity/title changed")
    for measure, expected_value in (("base", 97_072), ("cash", 97_072), ("total", 213_840)):
        close(float(generated["nominalSalary"][measure]), expected_value, f"Project Healthy Children generated nominal {measure}")
    for field, expected_value in (("revenue", 6_702_737), ("expenses", 5_867_621), ("staff", 3)):
        close(float(generated[field]), expected_value, f"Project Healthy Children generated {field}")
    cached = ROOT / generated.get("cachedSource", "")
    if not cached.is_file() or cached.read_bytes() != source_path.read_bytes():
        raise ValueError("Project Healthy Children current filing preview is missing or changed")
    if generated.get("defaultIncluded") is not True:
        raise ValueError("Project Healthy Children current filing unexpectedly left the default sample")


def main() -> None:
    reviewed = rows(DATA)
    if {row["source_id"] for row in reviewed} != EXPECTED_REVIEWED_IDS or len(reviewed) != len(EXPECTED_REVIEWED_IDS):
        raise ValueError("Reviewed roster compensation IDs differ from the audited release set")
    validate_manifest(reviewed)
    for row in reviewed:
        validate_row(row)
    validate_generated_app(reviewed)
    validate_screened_roster_entity_update()
    print(
        f"Validated {len(reviewed)} EA-roster compensation observations against preserved source-native filings; "
        "the three LEEP sensitivity observations, entity-deduplicated current Project Healthy Children filing, "
        "generated values, previews, source links, living-review dispositions, and the 29-row screening boundary also pass."
    )


if __name__ == "__main__":
    main()
