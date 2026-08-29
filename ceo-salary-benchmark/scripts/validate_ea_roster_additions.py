#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import html
import json
import math
import re
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "benchmark" / "enrichment" / "ea_roster_validated_compensation.csv"
CANDIDATE_REVIEW = ROOT / "benchmark" / "enrichment" / "ea_roster_candidate_review.csv"
APP_DATA = ROOT / "app-data.js"
SOURCE_MANIFEST = ROOT / "benchmark" / "enrichment" / "ea_roster_source_manifest.csv"
CPI_DATA = ROOT / "benchmark" / "data" / "cpi_u.csv"


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
        raise ValueError("Generated app does not contain exactly the four reviewed EA-roster observations")
    by_id = {row["id"]: row for row in roster_rows}

    for reviewed_row in reviewed:
        organization = reviewed_row["organization"]
        generated = by_id[reviewed_row["source_id"]]
        if generated.get("organization") != organization:
            raise ValueError(f"{organization}: generated organization name changed")
        if generated.get("defaultIncluded") is not False:
            raise ValueError(f"{organization}: reviewed roster observations must remain default-excluded")
        expected_status = (
            "sensitivity_only"
            if reviewed_row["default_inclusion_status"] == "sensitivity"
            else "excluded"
        )
        if generated.get("analysisStatus") != expected_status:
            raise ValueError(f"{organization}: generated analysis status changed")
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
    unsupported = {
        row["organization"]
        for row in candidate_rows
        if row["app_integration_status"] == "not_integrated_no_validated_compensation"
    }
    pooled_unsupported = sorted(unsupported & {row.get("organization", "") for row in incumbents})
    if pooled_unsupported:
        raise ValueError(f"Unsupported roster candidates entered the incumbent pool: {pooled_unsupported}")
    if len(candidate_rows) != 34 or len(unsupported) != 29:
        raise ValueError("Candidate-review integration boundary changed from 5 reviewed / 29 screening-only")
    if payload.get("summary", {}).get("eaRosterValidatedObservations") != 5:
        raise ValueError("Generated app summary does not report five reviewed roster observations")


def validate_row(row: dict[str, str]) -> None:
    main = parsed_values(ROOT / "benchmark" / row["local_path"])
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


def main() -> None:
    reviewed = rows(DATA)
    if len(reviewed) != 5 or len({row["source_id"] for row in reviewed}) != 5:
        raise ValueError("Reviewed roster compensation must contain five unique observations")
    validate_manifest(reviewed)
    for row in reviewed:
        validate_row(row)
    validate_generated_app(reviewed)
    print(
        f"Validated {len(reviewed)} EA-roster compensation observations against preserved rendered filings; "
        "generated values, previews, source links, default exclusions, and the 29-row screening boundary also pass."
    )


if __name__ == "__main__":
    main()
